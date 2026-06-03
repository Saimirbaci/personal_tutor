use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Duration, Local, NaiveDate};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::commands::mastery::week_start;
use crate::db::get_connection;

// ── Sprint window (June 1 – Aug 31, 2026) ──────────────────────────────────
const SPRINT_START: (i32, u32, u32) = (2026, 6, 1);
const SPRINT_END: (i32, u32, u32) = (2026, 8, 31);

/// Minimum elapsed sprint time before a pace projection is trusted. Below this
/// (cold start) we report `insufficientData` rather than over-confident output.
const MIN_WEEKS_FOR_PROJECTION: f32 = 0.25;

/// Projected-completion thresholds (% of target by sprint end).
const ON_TRACK_PCT: f32 = 95.0;
const AT_RISK_PCT: f32 = 70.0;

/// Fallback 2×2 split thresholds when there is too little data for a median.
const DEFAULT_EFFORT_THRESHOLD: f32 = 2.0;
const DEFAULT_MASTERY_THRESHOLD: f32 = 50.0;

/// Per-pillar sprint hour targets. Mirrors `progress.rs` for the core five and
/// gives the remaining CTO pillars a sensible default so all 12 appear.
const SPRINT_TARGETS: &[(&str, f32)] = &[
    ("llm", 36.0),
    ("hardware", 24.0),
    ("sales", 24.0),
    ("communication", 18.0),
    ("voice", 18.0),
    ("fundraising", 18.0),
    ("roadmap", 18.0),
    ("security", 18.0),
    ("hiring", 18.0),
    ("mlops", 18.0),
    ("ip", 18.0),
    ("finance", 18.0),
];

// ── Wire types (camelCase to match TS interfaces) ──────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PillarProjection {
    pub pillar_id: String,
    /// onTrack | atRisk | behind | insufficientData
    pub status: String,
    pub logged_hours: f32,
    pub target_hours: f32,
    /// Hours/week needed over the remaining sprint to hit target.
    pub required_pace: f32,
    /// Observed hours/week so far.
    pub actual_pace: f32,
    /// Projected % of target reached by sprint end at the current pace.
    pub projected_percent: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PillarVelocity {
    pub pillar_id: String,
    pub topics_this_week: i32,
    pub topics_per_week_avg: f32,
    pub mastery_delta_wow: Option<f32>,
    pub projection: PillarProjection,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LearningVelocity {
    pub pillars: Vec<PillarVelocity>,
    pub topics_this_week: i32,
    pub topics_per_week_avg: f32,
    pub mastery_delta_wow: Option<f32>,
    pub sessions_this_week: i32,
    pub weeks_elapsed: f32,
    pub weeks_remaining: f32,
    /// Pillars projected behind or at-risk — drives the "may not finish" banner.
    pub at_risk_count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EffortMasteryPoint {
    pub pillar_id: String,
    /// Total logged hours (effort axis).
    pub effort: f32,
    /// Current avg mastery minus the earliest snapshot baseline (gain axis).
    pub mastery_gain: f32,
    /// Current avg mastery (0–100), for context/tooltip.
    pub current_mastery: f32,
    /// quickWin | diminishingReturns | building | coasting
    pub quadrant: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EffortMasteryMatrix {
    pub points: Vec<EffortMasteryPoint>,
    pub effort_threshold: f32,
    pub mastery_threshold: f32,
}

// ── Pure helpers (no DB/clock → unit-testable) ─────────────────────────────

/// Elapsed and remaining sprint weeks for a given date, both floored at 0.
pub fn sprint_window(now: NaiveDate) -> (f32, f32) {
    let start = NaiveDate::from_ymd_opt(SPRINT_START.0, SPRINT_START.1, SPRINT_START.2).unwrap();
    let end = NaiveDate::from_ymd_opt(SPRINT_END.0, SPRINT_END.1, SPRINT_END.2).unwrap();
    let elapsed = (now - start).num_days().max(0) as f32 / 7.0;
    let remaining = (end - now).num_days().max(0) as f32 / 7.0;
    (elapsed, remaining)
}

/// Project a single pillar's sprint completion from logged-vs-target hours and
/// the elapsed/remaining window. Degrades to `insufficientData` on cold start.
pub fn project_pillar(
    pillar_id: &str,
    logged: f32,
    target: f32,
    weeks_elapsed: f32,
    weeks_remaining: f32,
) -> PillarProjection {
    let actual_pace = if weeks_elapsed > 0.0 { logged / weeks_elapsed } else { 0.0 };
    let remaining = (target - logged).max(0.0);
    let required_pace = if weeks_remaining > 0.0 { remaining / weeks_remaining } else { 0.0 };

    // Cold start — not enough elapsed time or no effort yet to extrapolate.
    if weeks_elapsed < MIN_WEEKS_FOR_PROJECTION || logged <= 0.0 {
        return PillarProjection {
            pillar_id: pillar_id.to_string(),
            status: "insufficientData".to_string(),
            logged_hours: logged,
            target_hours: target,
            required_pace,
            actual_pace,
            projected_percent: 0.0,
        };
    }

    let projected_total = logged + actual_pace * weeks_remaining;
    let projected_percent = if target > 0.0 {
        (projected_total / target * 100.0).clamp(0.0, 200.0)
    } else {
        100.0
    };

    let status = if projected_percent >= ON_TRACK_PCT {
        "onTrack"
    } else if projected_percent >= AT_RISK_PCT {
        "atRisk"
    } else {
        "behind"
    };

    PillarProjection {
        pillar_id: pillar_id.to_string(),
        status: status.to_string(),
        logged_hours: logged,
        target_hours: target,
        required_pace,
        actual_pace,
        projected_percent,
    }
}

/// `(topics_this_week, avg_topics_per_active_week)` from a list of per-topic
/// week buckets. Avg is over weeks that actually had activity (never /0).
pub fn weekly_counts(weeks: &[String], current_week: &str) -> (i32, f32) {
    if weeks.is_empty() {
        return (0, 0.0);
    }
    let this_week = weeks.iter().filter(|w| w.as_str() == current_week).count() as i32;
    let active_weeks: HashSet<&String> = weeks.iter().collect();
    let avg = weeks.len() as f32 / active_weeks.len() as f32;
    (this_week, avg)
}

/// Week-over-week mastery delta; `None` unless both weeks have a snapshot.
pub fn wow_delta(current: Option<f32>, previous: Option<f32>) -> Option<f32> {
    match (current, previous) {
        (Some(c), Some(p)) => Some(c - p),
        _ => None,
    }
}

/// Bucket a stored timestamp into its Monday-anchored week-start string.
/// Tolerates RFC3339 timestamps and bare `YYYY-MM-DD` prefixes.
fn parse_week(created_at: &str) -> Option<String> {
    let date = DateTime::parse_from_rfc3339(created_at)
        .map(|d| d.date_naive())
        .ok()
        .or_else(|| {
            created_at
                .get(0..10)
                .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        })?;
    Some(week_start(date).format("%Y-%m-%d").to_string())
}

// ── DB readers ─────────────────────────────────────────────────────────────

/// review_item creation weeks grouped by pillar (the "new topic" signal).
fn topic_weeks_by_pillar(conn: &Connection) -> Result<HashMap<String, Vec<String>>, String> {
    let mut stmt = conn
        .prepare("SELECT pillar, created_at FROM review_items WHERE pillar IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut out: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (pillar, created_at) = row.map_err(|e| e.to_string())?;
        if let Some(week) = parse_week(&created_at) {
            out.entry(pillar).or_default().push(week);
        }
    }
    Ok(out)
}

/// Total logged hours per pillar.
fn hours_by_pillar(conn: &Connection) -> Result<HashMap<String, f32>, String> {
    let mut stmt = conn
        .prepare("SELECT pillar, COALESCE(SUM(hours), 0) FROM sessions GROUP BY pillar")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for row in rows {
        let (pillar, hours) = row.map_err(|e| e.to_string())?;
        out.insert(pillar, hours);
    }
    Ok(out)
}

/// Per-pillar average mastery from mastery_snapshots for one week.
fn snapshot_avgs(conn: &Connection, week: &str) -> Result<HashMap<String, f32>, String> {
    let mut stmt = conn
        .prepare("SELECT pillar_id, avg_score FROM mastery_snapshots WHERE week_start = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![week], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for row in rows {
        let (pillar, avg) = row.map_err(|e| e.to_string())?;
        out.insert(pillar, avg);
    }
    Ok(out)
}

/// Sessions logged on or after `current_week` (i.e. this week).
fn sessions_this_week(conn: &Connection, current_week: &str) -> Result<i32, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE date >= ?1",
        rusqlite::params![current_week],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// ── Commands ───────────────────────────────────────────────────────────────

/// Learning velocity: weekly topic throughput, week-over-week mastery delta,
/// and per-pillar projected sprint completion with a confidence band.
#[tauri::command]
pub fn get_learning_velocity(app: AppHandle) -> Result<LearningVelocity, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let today = Local::now().date_naive();
    let current_week = week_start(today).format("%Y-%m-%d").to_string();
    let previous_week = (week_start(today) - Duration::days(7))
        .format("%Y-%m-%d")
        .to_string();
    let (weeks_elapsed, weeks_remaining) = sprint_window(today);

    let topic_weeks = topic_weeks_by_pillar(&conn)?;
    let hours = hours_by_pillar(&conn)?;
    let current_avgs = snapshot_avgs(&conn, &current_week)?;
    let previous_avgs = snapshot_avgs(&conn, &previous_week)?;
    let sessions_week = sessions_this_week(&conn, &current_week)?;

    let mut pillars = Vec::with_capacity(SPRINT_TARGETS.len());
    let mut all_weeks: Vec<String> = Vec::new();
    let mut at_risk_count = 0;

    for (pillar_id, target) in SPRINT_TARGETS {
        let weeks = topic_weeks.get(*pillar_id).cloned().unwrap_or_default();
        all_weeks.extend(weeks.iter().cloned());
        let (topics_this_week, topics_per_week_avg) = weekly_counts(&weeks, &current_week);

        let delta = wow_delta(
            current_avgs.get(*pillar_id).copied(),
            previous_avgs.get(*pillar_id).copied(),
        );

        let logged = hours.get(*pillar_id).copied().unwrap_or(0.0);
        let projection =
            project_pillar(pillar_id, logged, *target, weeks_elapsed, weeks_remaining);
        if projection.status == "atRisk" || projection.status == "behind" {
            at_risk_count += 1;
        }

        pillars.push(PillarVelocity {
            pillar_id: pillar_id.to_string(),
            topics_this_week,
            topics_per_week_avg,
            mastery_delta_wow: delta,
            projection,
        });
    }

    let (global_this_week, global_avg) = weekly_counts(&all_weeks, &current_week);

    // Global WoW delta from any pillar with both weeks present.
    let global_current = mean(&current_avgs);
    let global_previous = mean(&previous_avgs);
    let global_delta = wow_delta(global_current, global_previous);

    Ok(LearningVelocity {
        pillars,
        topics_this_week: global_this_week,
        topics_per_week_avg: global_avg,
        mastery_delta_wow: global_delta,
        sessions_this_week: sessions_week,
        weeks_elapsed,
        weeks_remaining,
        at_risk_count,
    })
}

// ── Effort vs Mastery matrix ───────────────────────────────────────────────

/// Median of a slice, or `None` when empty. Sorts a copy (non-destructive).
fn median(values: &[f32]) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    let mut v = values.to_vec();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = v.len();
    Some(if n % 2 == 1 {
        v[n / 2]
    } else {
        (v[n / 2 - 1] + v[n / 2]) / 2.0
    })
}

/// Median-split thresholds for the 2×2, falling back to fixed values when
/// there are too few populated pillars for a stable median.
pub fn matrix_thresholds(efforts: &[f32], gains: &[f32]) -> (f32, f32) {
    let effort_thr = if efforts.len() >= 2 {
        median(efforts).unwrap_or(DEFAULT_EFFORT_THRESHOLD)
    } else {
        DEFAULT_EFFORT_THRESHOLD
    };
    let mastery_thr = if gains.len() >= 2 {
        median(gains).unwrap_or(DEFAULT_MASTERY_THRESHOLD)
    } else {
        DEFAULT_MASTERY_THRESHOLD
    };
    (effort_thr, mastery_thr)
}

/// Classify a pillar into the effort×gain quadrant. `>= threshold` reads as high.
pub fn classify_quadrant(effort: f32, gain: f32, effort_thr: f32, gain_thr: f32) -> &'static str {
    let high_effort = effort >= effort_thr;
    let high_gain = gain >= gain_thr;
    match (high_effort, high_gain) {
        (false, true) => "quickWin",          // low effort, high gain
        (true, false) => "diminishingReturns", // high effort, low gain
        (true, true) => "building",            // high effort, high gain
        (false, false) => "coasting",          // low effort, low gain
    }
}

/// Current avg mastery per pillar from mastery_scores.
fn current_mastery_by_pillar(conn: &Connection) -> Result<HashMap<String, f32>, String> {
    let mut stmt = conn
        .prepare("SELECT pillar_id, AVG(score) FROM mastery_scores GROUP BY pillar_id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for row in rows {
        let (pillar, avg) = row.map_err(|e| e.to_string())?;
        out.insert(pillar, avg);
    }
    Ok(out)
}

/// Earliest-week snapshot avg per pillar (the mastery-gain baseline).
fn baseline_mastery_by_pillar(conn: &Connection) -> Result<HashMap<String, f32>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.pillar_id, s.avg_score
             FROM mastery_snapshots s
             JOIN (SELECT pillar_id, MIN(week_start) AS first_week
                   FROM mastery_snapshots GROUP BY pillar_id) f
               ON s.pillar_id = f.pillar_id AND s.week_start = f.first_week",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut out = HashMap::new();
    for row in rows {
        let (pillar, avg) = row.map_err(|e| e.to_string())?;
        out.insert(pillar, avg);
    }
    Ok(out)
}

/// 2×2 effort-vs-mastery matrix: per pillar effort (hours), mastery gain
/// (current avg minus earliest baseline), and a median-split quadrant label.
#[tauri::command]
pub fn get_effort_mastery_matrix(app: AppHandle) -> Result<EffortMasteryMatrix, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    let hours = hours_by_pillar(&conn)?;
    let current = current_mastery_by_pillar(&conn)?;
    let baseline = baseline_mastery_by_pillar(&conn)?;

    // First pass: gather raw effort/gain per pillar that has any signal.
    let mut raw: Vec<(String, f32, f32, f32)> = Vec::new(); // (pillar, effort, gain, current)
    for (pillar_id, _) in SPRINT_TARGETS {
        let effort = hours.get(*pillar_id).copied().unwrap_or(0.0);
        let current_avg = current.get(*pillar_id).copied().unwrap_or(0.0);
        // Gain vs earliest baseline; if no baseline yet, treat current as the gain.
        let gain = match baseline.get(*pillar_id).copied() {
            Some(base) => current_avg - base,
            None => current_avg,
        };
        // Skip pillars with no activity at all to avoid clustering everything at origin.
        if effort <= 0.0 && current_avg <= 0.0 {
            continue;
        }
        raw.push((pillar_id.to_string(), effort, gain, current_avg));
    }

    let efforts: Vec<f32> = raw.iter().map(|r| r.1).collect();
    let gains: Vec<f32> = raw.iter().map(|r| r.2).collect();
    let (effort_threshold, mastery_threshold) = matrix_thresholds(&efforts, &gains);

    let points = raw
        .into_iter()
        .map(|(pillar_id, effort, gain, current_avg)| EffortMasteryPoint {
            pillar_id,
            effort,
            mastery_gain: gain,
            current_mastery: current_avg,
            quadrant: classify_quadrant(effort, gain, effort_threshold, mastery_threshold)
                .to_string(),
        })
        .collect();

    Ok(EffortMasteryMatrix {
        points,
        effort_threshold,
        mastery_threshold,
    })
}

/// Mean of a pillar→value map, or `None` when empty.
fn mean(map: &HashMap<String, f32>) -> Option<f32> {
    if map.is_empty() {
        return None;
    }
    let sum: f32 = map.values().sum();
    Some(sum / map.len() as f32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sprint_window_clamps_before_and_after() {
        // Mid-sprint: both positive.
        let mid = NaiveDate::from_ymd_opt(2026, 7, 1).unwrap();
        let (e, r) = sprint_window(mid);
        assert!(e > 0.0 && r > 0.0);
        // Before start: elapsed floored at 0.
        let before = NaiveDate::from_ymd_opt(2026, 5, 1).unwrap();
        assert_eq!(sprint_window(before).0, 0.0);
        // After end: remaining floored at 0.
        let after = NaiveDate::from_ymd_opt(2026, 9, 15).unwrap();
        assert_eq!(sprint_window(after).1, 0.0);
    }

    #[test]
    fn projection_on_track_when_pace_meets_target() {
        // Half the sprint elapsed, half remaining, already at half the target.
        let p = project_pillar("llm", 18.0, 36.0, 6.0, 6.0);
        assert_eq!(p.status, "onTrack");
        assert!(p.projected_percent >= ON_TRACK_PCT);
    }

    #[test]
    fn projection_behind_when_pace_too_slow() {
        // Lots elapsed, tiny progress → behind.
        let p = project_pillar("voice", 1.0, 18.0, 8.0, 4.0);
        assert_eq!(p.status, "behind");
    }

    #[test]
    fn projection_at_risk_in_middle_band() {
        // Pace lands projection in the 70–95% band.
        let p = project_pillar("sales", 6.0, 24.0, 6.0, 6.0);
        // logged 6 over 6 weeks = 1/wk; +6 more weeks = 12 total = 50%? tune below.
        // Use a case that lands in the band:
        let p2 = project_pillar("sales", 10.0, 24.0, 5.0, 5.0);
        // 10/5 = 2/wk, +5wk = 20 total = 83% → atRisk.
        assert_eq!(p2.status, "atRisk");
        let _ = p;
    }

    #[test]
    fn projection_insufficient_on_cold_start() {
        // No elapsed time.
        let cold = project_pillar("llm", 0.0, 36.0, 0.1, 13.0);
        assert_eq!(cold.status, "insufficientData");
        // Elapsed but no hours logged.
        let no_hours = project_pillar("llm", 0.0, 36.0, 4.0, 8.0);
        assert_eq!(no_hours.status, "insufficientData");
    }

    #[test]
    fn weekly_counts_handles_empty_and_current() {
        assert_eq!(weekly_counts(&[], "2026-06-01"), (0, 0.0));
        let weeks = vec![
            "2026-06-01".to_string(),
            "2026-06-01".to_string(),
            "2026-05-25".to_string(),
        ];
        let (this_week, avg) = weekly_counts(&weeks, "2026-06-01");
        assert_eq!(this_week, 2);
        // 3 topics over 2 active weeks = 1.5/wk.
        assert_eq!(avg, 1.5);
    }

    #[test]
    fn wow_delta_requires_both_weeks() {
        assert_eq!(wow_delta(Some(60.0), Some(50.0)), Some(10.0));
        assert_eq!(wow_delta(Some(60.0), None), None);
        assert_eq!(wow_delta(None, Some(50.0)), None);
        assert_eq!(wow_delta(None, None), None);
    }

    #[test]
    fn median_odd_and_even() {
        assert_eq!(median(&[]), None);
        assert_eq!(median(&[5.0]), Some(5.0));
        assert_eq!(median(&[1.0, 3.0, 2.0]), Some(2.0));
        assert_eq!(median(&[1.0, 2.0, 3.0, 4.0]), Some(2.5));
    }

    #[test]
    fn thresholds_fall_back_with_few_points() {
        // <2 points → fixed fallbacks.
        let (e, m) = matrix_thresholds(&[10.0], &[5.0]);
        assert_eq!(e, DEFAULT_EFFORT_THRESHOLD);
        assert_eq!(m, DEFAULT_MASTERY_THRESHOLD);
        // >=2 → medians.
        let (e2, m2) = matrix_thresholds(&[2.0, 6.0], &[10.0, 30.0]);
        assert_eq!(e2, 4.0);
        assert_eq!(m2, 20.0);
    }

    #[test]
    fn classify_covers_all_quadrants() {
        // thresholds: effort=4, gain=20.
        assert_eq!(classify_quadrant(1.0, 30.0, 4.0, 20.0), "quickWin");
        assert_eq!(classify_quadrant(10.0, 5.0, 4.0, 20.0), "diminishingReturns");
        assert_eq!(classify_quadrant(10.0, 30.0, 4.0, 20.0), "building");
        assert_eq!(classify_quadrant(1.0, 5.0, 4.0, 20.0), "coasting");
    }

    #[test]
    fn classify_zero_effort_zero_gain_is_coasting() {
        assert_eq!(classify_quadrant(0.0, 0.0, 2.0, 50.0), "coasting");
    }

    #[test]
    fn parse_week_tolerates_formats() {
        // RFC3339 Wednesday → Monday bucket.
        assert_eq!(
            parse_week("2026-06-03T10:30:00+00:00").as_deref(),
            Some("2026-06-01")
        );
        // Bare date prefix.
        assert_eq!(parse_week("2026-06-07").as_deref(), Some("2026-06-01"));
        // Garbage → None.
        assert_eq!(parse_week("not-a-date"), None);
    }
}
