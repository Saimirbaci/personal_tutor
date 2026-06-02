use std::cmp::Ordering;

use chrono::{DateTime, Duration, FixedOffset, Local};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub item_id: String,
    pub item_type: String,
    pub pillar: Option<String>,
    pub content: String,
    pub ease_factor: f32,
    pub interval_days: f32,
    pub repetitions: i32,
    pub last_quality: Option<i32>,
    pub last_seen: String,
    pub next_due: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCounts {
    pub total: i32,
    pub due: i32,
    pub due_today: i32,
}

/// A single forgetting-curve reminder: an item whose estimated retention has
/// decayed to (or below) the nudge threshold, with prebuilt notification copy.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForgettingNudge {
    pub item_id: String,
    pub item_type: String,
    pub pillar: Option<String>,
    pub content: String,
    pub retention: f32,
    pub days_since_seen: i64,
    pub next_due: String,
    pub title: String,
    pub body: String,
}

/// Raw review row pulled for the forgetting-curve query, before retention
/// filtering/ranking. Kept separate from `ReviewItem` so the ranking logic is
/// a pure, testable function independent of `AppHandle`/SQLite.
#[derive(Debug, Clone)]
struct NudgeRow {
    item_id: String,
    item_type: String,
    pillar: Option<String>,
    content: String,
    ease_factor: f32,
    interval_days: f32,
    last_seen: String,
    next_due: String,
    last_notified_at: Option<String>,
}

/// SM-2 spaced repetition algorithm.
/// quality: 0-5 (0=blackout, 5=perfect). >=3 is a pass.
/// Returns (new_ease, new_interval_days, new_repetitions).
fn sm2(ease: f32, interval_days: f32, reps: i32, quality: i32) -> (f32, f32, i32) {
    let q = quality.clamp(0, 5) as f32;
    let mut new_ease = ease + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02));
    if new_ease < 1.3 {
        new_ease = 1.3;
    }

    if quality < 3 {
        // Failed — reset interval, keep repetitions counter informational
        return (new_ease, 1.0, 0);
    }

    let new_reps = reps + 1;
    let new_interval = match new_reps {
        1 => 1.0,
        2 => 6.0,
        _ => (interval_days * new_ease).max(1.0),
    };
    (new_ease, new_interval, new_reps)
}

// ── Forgetting-curve (Ebbinghaus) retention model ──────────────────────────────

/// Retention at which a short review still "locks in" a concept. Below this we
/// nudge. Tuned so a default-ease item sits right at this value at `next_due`.
const NOTIFY_THRESHOLD: f32 = 0.80;
/// Floor so brand-new items (interval 0) still get a finite, non-zero stability.
const MIN_STABILITY_DAYS: f32 = 0.5;
/// Maps an SM-2 interval to memory stability so retention ≈ NOTIFY_THRESHOLD at
/// `next_due`: exp(-1 / STABILITY_SCALE) ≈ 0.80 for a default-ease item.
const STABILITY_SCALE: f32 = 4.5;
/// SM-2 starting ease — used to normalise per-item ease into the decay rate.
const DEFAULT_EASE: f32 = 2.5;
/// Default number of nudges returned per poll (independent daily cap is enforced
/// on the frontend).
const DEFAULT_MAX_NUDGES: i64 = 3;
/// Keep the notification body compact across platforms.
const NUDGE_TOPIC_MAX_CHARS: usize = 80;

/// Estimated retention R = exp(-t / S) under an Ebbinghaus decay model, where
/// stability S grows with the SM-2 interval and ease already tracked per item.
/// Returns a value in (0, 1]; 1.0 immediately after a review.
fn retention(interval_days: f32, ease_factor: f32, days_since_seen: f32) -> f32 {
    let stability =
        interval_days.max(MIN_STABILITY_DAYS) * STABILITY_SCALE * (ease_factor / DEFAULT_EASE);
    let elapsed = days_since_seen.max(0.0);
    (-elapsed / stability).exp()
}

/// Builds the user-facing nudge body, e.g.
/// "You learned \"Transformer architecture\" 6 days ago — a 5-minute review now
/// will lock it in." `content` is the flashcard/quiz prompt, truncated to keep
/// the OS notification compact.
fn nudge_message(content: &str, days_since_seen: i64) -> String {
    let topic = truncate_topic(content, NUDGE_TOPIC_MAX_CHARS);
    let when = match days_since_seen {
        n if n <= 0 => "earlier today".to_string(),
        1 => "yesterday".to_string(),
        n => format!("{n} days ago"),
    };
    format!("You learned \"{topic}\" {when} — a 5-minute review now will lock it in.")
}

/// Notification title, naming the pillar when known.
fn nudge_title(pillar: Option<&str>) -> String {
    match pillar {
        Some(p) if !p.is_empty() => format!("Review {} before you forget", pillar_label(p)),
        _ => "Quick review before you forget".to_string(),
    }
}

/// Human-friendly pillar label, special-casing acronyms.
fn pillar_label(pillar: &str) -> String {
    match pillar {
        "llm" => "LLM".to_string(),
        "mlops" => "MLOps".to_string(),
        "ip" => "IP".to_string(),
        other => {
            let mut chars = other.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().to_string() + chars.as_str(),
                None => String::new(),
            }
        }
    }
}

fn truncate_topic(content: &str, max: usize) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let head: String = trimmed.chars().take(max).collect();
    format!("{}…", head.trim_end())
}

fn parse_dt(s: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(s).ok()
}

/// True when the item was already nudged within its current review interval —
/// i.e. it was notified at/after the last time it was seen. Reviewing the item
/// updates `last_seen`, which re-arms the nudge.
fn already_notified(row: &NudgeRow) -> bool {
    match (&row.last_notified_at, parse_dt(&row.last_seen)) {
        (Some(notified), Some(seen)) => parse_dt(notified).map(|n| n >= seen).unwrap_or(false),
        _ => false,
    }
}

/// Converts a candidate row into a ranked nudge, or `None` if its retention is
/// still above the threshold (or its timestamp is unparseable).
fn make_nudge(row: NudgeRow, now: DateTime<Local>) -> Option<ForgettingNudge> {
    let last_seen = parse_dt(&row.last_seen)?.with_timezone(&Local);
    let elapsed_days = now.signed_duration_since(last_seen).num_seconds() as f32 / 86_400.0;
    let days_since_seen = elapsed_days.max(0.0);
    let retention = retention(row.interval_days, row.ease_factor, days_since_seen);
    if retention > NOTIFY_THRESHOLD {
        return None;
    }

    let days_i = days_since_seen.round() as i64;
    Some(ForgettingNudge {
        title: nudge_title(row.pillar.as_deref()),
        body: nudge_message(&row.content, days_i),
        item_id: row.item_id,
        item_type: row.item_type,
        pillar: row.pillar,
        content: row.content,
        retention,
        days_since_seen: days_i,
        next_due: row.next_due,
    })
}

/// Pure ranking: drop already-notified rows, keep those at/under the retention
/// threshold, sort most-forgotten (lowest retention) first, cap to `max_items`.
fn build_nudges(rows: Vec<NudgeRow>, now: DateTime<Local>, max_items: usize) -> Vec<ForgettingNudge> {
    let mut nudges: Vec<ForgettingNudge> = rows
        .into_iter()
        .filter(|r| !already_notified(r))
        .filter_map(|r| make_nudge(r, now))
        .collect();
    nudges.sort_by(|a, b| a.retention.partial_cmp(&b.retention).unwrap_or(Ordering::Equal));
    nudges.truncate(max_items);
    nudges
}

#[tauri::command]
pub fn record_review_attempt(
    app: AppHandle,
    item_id: String,
    item_type: String,
    pillar: Option<String>,
    content: String,
    quality: i32,
) -> Result<ReviewItem, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now();
    let now_rfc = now.to_rfc3339();

    let existing: Option<(f32, f32, i32)> = conn
        .query_row(
            "SELECT ease_factor, interval_days, repetitions FROM review_items WHERE item_id = ?1",
            rusqlite::params![item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    let (ease, interval, reps) = existing.unwrap_or((2.5, 0.0, 0));
    let (new_ease, new_interval, new_reps) = sm2(ease, interval, reps, quality);

    let next_due = now + Duration::milliseconds((new_interval * 86_400_000.0) as i64);
    let next_due_rfc = next_due.to_rfc3339();

    if existing.is_some() {
        conn.execute(
            "UPDATE review_items
             SET item_type = ?2, pillar = ?3, content = ?4,
                 ease_factor = ?5, interval_days = ?6, repetitions = ?7,
                 last_quality = ?8, last_seen = ?9, next_due = ?10
             WHERE item_id = ?1",
            rusqlite::params![
                item_id, item_type, pillar, content,
                new_ease, new_interval, new_reps,
                quality, now_rfc, next_due_rfc
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO review_items
             (item_id, item_type, pillar, content, ease_factor, interval_days,
              repetitions, last_quality, last_seen, next_due, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                item_id, item_type, pillar, content,
                new_ease, new_interval, new_reps,
                quality, now_rfc, next_due_rfc, now_rfc
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(ReviewItem {
        item_id,
        item_type,
        pillar,
        content,
        ease_factor: new_ease,
        interval_days: new_interval,
        repetitions: new_reps,
        last_quality: Some(quality),
        last_seen: now_rfc.clone(),
        next_due: next_due_rfc,
        created_at: now_rfc,
    })
}

#[tauri::command]
pub fn get_due_reviews(app: AppHandle, limit: Option<i32>) -> Result<Vec<ReviewItem>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();
    let lim = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT item_id, item_type, pillar, content, ease_factor, interval_days,
                    repetitions, last_quality, last_seen, next_due, created_at
             FROM review_items
             WHERE next_due <= ?1
             ORDER BY next_due ASC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let items: Vec<ReviewItem> = stmt
        .query_map(rusqlite::params![now, lim], |row| {
            Ok(ReviewItem {
                item_id: row.get(0)?,
                item_type: row.get(1)?,
                pillar: row.get(2)?,
                content: row.get(3)?,
                ease_factor: row.get(4)?,
                interval_days: row.get(5)?,
                repetitions: row.get(6)?,
                last_quality: row.get(7)?,
                last_seen: row.get(8)?,
                next_due: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[tauri::command]
pub fn get_review_counts(app: AppHandle) -> Result<ReviewCounts, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now();
    let now_rfc = now.to_rfc3339();
    let end_of_day = now
        .date_naive()
        .and_hms_opt(23, 59, 59)
        .map(|d| d.and_local_timezone(Local).unwrap().to_rfc3339())
        .unwrap_or_else(|| now_rfc.clone());

    let total: i32 = conn
        .query_row("SELECT COUNT(*) FROM review_items", [], |row| row.get(0))
        .unwrap_or(0);
    let due: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM review_items WHERE next_due <= ?1",
            rusqlite::params![now_rfc],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let due_today: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM review_items WHERE next_due <= ?1",
            rusqlite::params![end_of_day],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(ReviewCounts { total, due, due_today })
}

/// Returns forgetting-curve nudges: items whose estimated retention has decayed
/// to/under the threshold and that have not already been nudged this interval,
/// ranked most-forgotten first. `lookahead_min` includes items coming due soon;
/// `max_items` caps the result (default `DEFAULT_MAX_NUDGES`).
#[tauri::command]
pub fn get_forgetting_curve_due(
    app: AppHandle,
    lookahead_min: Option<i64>,
    max_items: Option<i64>,
) -> Result<Vec<ForgettingNudge>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now();
    let lookahead = lookahead_min.unwrap_or(0).max(0);
    let cutoff = (now + Duration::minutes(lookahead)).to_rfc3339();
    let max = max_items.unwrap_or(DEFAULT_MAX_NUDGES).max(0) as usize;

    let mut stmt = conn
        .prepare(
            "SELECT item_id, item_type, pillar, content, ease_factor, interval_days,
                    last_seen, next_due, last_notified_at
             FROM review_items
             WHERE next_due <= ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<NudgeRow> = stmt
        .query_map(rusqlite::params![cutoff], |row| {
            Ok(NudgeRow {
                item_id: row.get(0)?,
                item_type: row.get(1)?,
                pillar: row.get(2)?,
                content: row.get(3)?,
                ease_factor: row.get(4)?,
                interval_days: row.get(5)?,
                last_seen: row.get(6)?,
                next_due: row.get(7)?,
                last_notified_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(build_nudges(rows, now, max))
}

/// Records that a forgetting-curve nudge was sent for an item, suppressing
/// repeat nudges until the item is reviewed again (which updates `last_seen`).
#[tauri::command]
pub fn mark_review_notified(app: AppHandle, item_id: String) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();
    conn.execute(
        "UPDATE review_items SET last_notified_at = ?2 WHERE item_id = ?1",
        rusqlite::params![item_id, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sm2_failure_resets_interval() {
        let (_ease, interval, reps) = sm2(2.5, 10.0, 3, 1);
        assert_eq!(interval, 1.0);
        assert_eq!(reps, 0);
    }

    #[test]
    fn sm2_first_pass_one_day() {
        let (_ease, interval, reps) = sm2(2.5, 0.0, 0, 5);
        assert_eq!(interval, 1.0);
        assert_eq!(reps, 1);
    }

    #[test]
    fn sm2_second_pass_six_days() {
        let (_ease, interval, reps) = sm2(2.5, 1.0, 1, 5);
        assert_eq!(interval, 6.0);
        assert_eq!(reps, 2);
    }

    #[test]
    fn sm2_ease_floor() {
        let (ease, _, _) = sm2(1.3, 1.0, 1, 0);
        assert!(ease >= 1.3);
    }

    // ── Forgetting-curve retention model ───────────────────────────────────────

    #[test]
    fn retention_is_full_immediately_after_review() {
        assert!(retention(6.0, 2.5, 0.0) > 0.999);
    }

    #[test]
    fn retention_decreases_monotonically_with_elapsed_time() {
        let early = retention(6.0, 2.5, 2.0);
        let late = retention(6.0, 2.5, 8.0);
        assert!(early > late);
    }

    #[test]
    fn retention_crosses_threshold_near_next_due() {
        // A default-ease item should sit ~NOTIFY_THRESHOLD when t == interval.
        let r = retention(6.0, DEFAULT_EASE, 6.0);
        assert!((r - NOTIFY_THRESHOLD).abs() < 0.02, "retention was {r}");
    }

    #[test]
    fn retention_handles_new_item_without_divide_by_zero() {
        let r = retention(0.0, 2.5, 1.0);
        assert!(r.is_finite() && (0.0..=1.0).contains(&r));
    }

    #[test]
    fn nudge_message_formats_days_ago_copy() {
        let body = nudge_message("Transformer architecture", 6);
        assert!(body.contains("Transformer architecture"));
        assert!(body.contains("6 days ago"));
        assert!(body.contains("lock it in"));
    }

    #[test]
    fn nudge_message_uses_yesterday_for_one_day() {
        assert!(nudge_message("topic", 1).contains("yesterday"));
    }

    fn row(item_id: &str, days_seen_ago: i64, last_notified: Option<String>, now: DateTime<Local>) -> NudgeRow {
        let last_seen = (now - Duration::days(days_seen_ago)).to_rfc3339();
        NudgeRow {
            item_id: item_id.to_string(),
            item_type: "flashcard".to_string(),
            pillar: Some("llm".to_string()),
            content: "Some concept".to_string(),
            ease_factor: 2.5,
            interval_days: 6.0,
            last_seen,
            next_due: now.to_rfc3339(),
            last_notified_at: last_notified,
        }
    }

    fn fixed_now() -> DateTime<Local> {
        DateTime::parse_from_rfc3339("2026-06-20T12:00:00+00:00")
            .unwrap()
            .with_timezone(&Local)
    }

    #[test]
    fn build_nudges_filters_high_retention_items() {
        let now = fixed_now();
        // 1 day since seen on a 6-day interval → retention well above threshold.
        let rows = vec![row("a", 1, None, now)];
        assert!(build_nudges(rows, now, 3).is_empty());
    }

    #[test]
    fn build_nudges_excludes_already_notified_in_interval() {
        let now = fixed_now();
        let notified = now.to_rfc3339(); // notified after last_seen (10 days ago)
        let rows = vec![row("a", 10, Some(notified), now)];
        assert!(build_nudges(rows, now, 3).is_empty());
    }

    #[test]
    fn build_nudges_rearmed_after_review_updates_last_seen() {
        let now = fixed_now();
        // Notified long ago, but item was seen more recently → nudge re-armed.
        let old_notify = (now - Duration::days(20)).to_rfc3339();
        let rows = vec![row("a", 10, Some(old_notify), now)];
        assert_eq!(build_nudges(rows, now, 3).len(), 1);
    }

    #[test]
    fn build_nudges_orders_most_forgotten_first_and_caps() {
        let now = fixed_now();
        let rows = vec![
            row("newer", 7, None, now),  // higher retention
            row("oldest", 12, None, now), // lowest retention
            row("mid", 9, None, now),
        ];
        let nudges = build_nudges(rows, now, 2);
        assert_eq!(nudges.len(), 2);
        assert_eq!(nudges[0].item_id, "oldest");
        assert!(nudges[0].retention <= nudges[1].retention);
    }
}
