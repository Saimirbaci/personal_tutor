use std::collections::HashMap;
use std::path::PathBuf;

use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveDate, Weekday};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::ai::{AiMessage, ProviderConfig};
use crate::db::get_connection;

/// Core pillars that have a curriculum + hour targets (mirrors `progress.rs`).
const CORE_PILLARS: [&str; 5] = ["llm", "hardware", "sales", "communication", "voice"];

/// SM-2 starting ease factor — the baseline a mastery delta is measured against.
const EASE_BASELINE: f32 = 2.5;

// ── Serialisable types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestMetrics {
    pub total_hours: f32,
    pub hours_by_pillar: HashMap<String, f32>,
    pub sessions_count: i32,
    pub streak: i32,
    pub pillars_covered: Vec<String>,
    /// Review items reviewed this week that are still shaky (low ease / failed grade).
    pub top_gaps: Vec<String>,
    /// Rule-based pillar ids the learner should prioritise next week.
    pub recommended_focus: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyDigest {
    pub week_start: String,
    pub week_end: String,
    pub week_number: u32,
    pub content: String,
    pub metrics: DigestMetrics,
    pub created_at: String,
}

// ── Week-boundary helpers ─────────────────────────────────────────────────────

/// Returns the (Monday, Sunday) bounds of the ISO week containing `date`.
fn week_bounds(date: NaiveDate) -> (NaiveDate, NaiveDate) {
    let days_from_mon = date.weekday().num_days_from_monday() as i64;
    let monday = date - ChronoDuration::days(days_from_mon);
    let sunday = monday + ChronoDuration::days(6);
    (monday, sunday)
}

/// The most recent week whose Sunday has arrived.
///
/// On a Sunday the current Mon–Sun week is treated as complete (matching the
/// "auto-generated every Sunday" behaviour); on any other weekday the previous
/// full Mon–Sun week is returned.
fn most_recent_completed_week(today: NaiveDate) -> (NaiveDate, NaiveDate) {
    let (this_monday, this_sunday) = week_bounds(today);
    if today.weekday() == Weekday::Sun {
        (this_monday, this_sunday)
    } else {
        let last_monday = this_monday - ChronoDuration::days(7);
        (last_monday, last_monday + ChronoDuration::days(6))
    }
}

/// Sprint week number (1–12), aligned with `schedule.rs::get_week_number`.
fn get_week_number(from: NaiveDate) -> u32 {
    let sprint_start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
    if from < sprint_start {
        return 1;
    }
    let days = (from - sprint_start).num_days();
    (days / 7 + 1).min(12) as u32
}

/// Resolve the (week_start, week_end, week_number) to operate on.
/// A passed `week_start` is normalised to the Monday of its week.
fn resolve_week(
    week_start: Option<String>,
    today: NaiveDate,
) -> Result<(String, String, u32), String> {
    let (monday, sunday) = match week_start {
        Some(ws) if !ws.trim().is_empty() => {
            let d = NaiveDate::parse_from_str(ws.trim(), "%Y-%m-%d")
                .map_err(|e| format!("Invalid week_start: {e}"))?;
            week_bounds(d)
        }
        _ => most_recent_completed_week(today),
    };
    Ok((
        monday.format("%Y-%m-%d").to_string(),
        sunday.format("%Y-%m-%d").to_string(),
        get_week_number(monday),
    ))
}

// ── Stats gathering (pure over a Connection — unit-testable) ──────────────────

/// Current streak as of `anchor` (consecutive prior days with at least one session,
/// counting back from `anchor` itself). Mirrors `progress.rs::get_streak` semantics.
fn compute_streak(conn: &Connection, anchor: &str) -> Result<i32, String> {
    let anchor_date =
        NaiveDate::parse_from_str(anchor, "%Y-%m-%d").map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT DISTINCT date FROM sessions WHERE date <= ?1 ORDER BY date DESC")
        .map_err(|e| e.to_string())?;

    let dates: Vec<String> = stmt
        .query_map(params![anchor], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut streak = 0;
    let mut expected = anchor_date;
    for ds in &dates {
        if let Ok(d) = NaiveDate::parse_from_str(ds, "%Y-%m-%d") {
            if d == expected {
                streak += 1;
                expected = d.pred_opt().unwrap_or(d);
            } else if d < expected {
                break;
            }
        }
    }
    Ok(streak)
}

/// Review items reviewed within the week that are still weak (low ease or a failed
/// grade). Returns the item content strings (used as "knowledge gaps") plus the set
/// of pillars they belong to (used to bias the recommended focus).
fn gather_gaps(
    conn: &Connection,
    week_start: &str,
    week_end: &str,
) -> Result<(Vec<String>, Vec<String>), String> {
    let mut stmt = conn
        .prepare(
            "SELECT content, pillar FROM review_items
             WHERE substr(last_seen, 1, 10) >= ?1 AND substr(last_seen, 1, 10) <= ?2
               AND (ease_factor < 2.0 OR (last_quality IS NOT NULL AND last_quality < 3))
             ORDER BY ease_factor ASC
             LIMIT 8",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![week_start, week_end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut gaps = Vec::new();
    let mut gap_pillars = Vec::new();
    for r in rows {
        let (content, pillar) = r.map_err(|e| e.to_string())?;
        gaps.push(content);
        if let Some(p) = pillar {
            if !p.is_empty() && !gap_pillars.contains(&p) {
                gap_pillars.push(p);
            }
        }
    }
    Ok((gaps, gap_pillars))
}

/// Rule-based next-week focus: the lowest-coverage core pillars this week, then any
/// pillar with outstanding review gaps, capped at 3.
fn recommend_focus(hours_by_pillar: &HashMap<String, f32>, gap_pillars: &[String]) -> Vec<String> {
    let mut scored: Vec<(&str, f32)> = CORE_PILLARS
        .iter()
        .map(|p| (*p, *hours_by_pillar.get(*p).unwrap_or(&0.0)))
        .collect();
    scored.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut focus: Vec<String> = scored.iter().take(2).map(|(p, _)| p.to_string()).collect();
    for gp in gap_pillars {
        if focus.len() >= 3 {
            break;
        }
        if !focus.contains(gp) {
            focus.push(gp.clone());
        }
    }
    focus
}

/// Compute all digest metrics for the `[week_start, week_end]` window (dates inclusive).
pub fn gather_week_stats(
    conn: &Connection,
    week_start: &str,
    week_end: &str,
) -> Result<DigestMetrics, String> {
    let mut hours_by_pillar: HashMap<String, f32> = HashMap::new();
    let mut total_hours = 0.0f32;
    let mut sessions_count = 0i32;

    {
        let mut stmt = conn
            .prepare(
                "SELECT pillar, COALESCE(SUM(hours), 0), COUNT(*)
                 FROM sessions WHERE date >= ?1 AND date <= ?2 GROUP BY pillar",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![week_start, week_end], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f32>(1)?,
                    row.get::<_, i32>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for r in rows {
            let (pillar, hours, count) = r.map_err(|e| e.to_string())?;
            total_hours += hours;
            sessions_count += count;
            *hours_by_pillar.entry(pillar).or_insert(0.0) += hours;
        }
    }

    let mut pillars_covered: Vec<String> = hours_by_pillar.keys().cloned().collect();
    pillars_covered.sort();

    let streak = compute_streak(conn, week_end)?;
    let (top_gaps, gap_pillars) = gather_gaps(conn, week_start, week_end)?;
    let recommended_focus = recommend_focus(&hours_by_pillar, &gap_pillars);

    Ok(DigestMetrics {
        total_hours,
        hours_by_pillar,
        sessions_count,
        streak,
        pillars_covered,
        top_gaps,
        recommended_focus,
    })
}

/// Per-pillar mastery-delta PROXY.
///
/// No mastery-snapshot table exists yet (the Per-Topic Mastery Score feature is
/// still in progress), so this approximates "mastery gains" from the SM-2
/// `ease_factor` of items reviewed during the week, relative to the SM-2 baseline
/// of 2.5 (positive ⇒ trending easier ⇒ improving). When a real `mastery_scores`
/// table ships, swap ONLY this function — its callers and the digest prompt are
/// agnostic to the source.
pub fn pillar_mastery_deltas(
    conn: &Connection,
    week_start: &str,
    week_end: &str,
) -> Result<HashMap<String, f32>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT pillar, AVG(ease_factor) FROM review_items
             WHERE pillar IS NOT NULL AND pillar != ''
               AND substr(last_seen, 1, 10) >= ?1 AND substr(last_seen, 1, 10) <= ?2
             GROUP BY pillar",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![week_start, week_end], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut deltas = HashMap::new();
    for r in rows {
        let (pillar, avg_ease) = r.map_err(|e| e.to_string())?;
        deltas.insert(pillar, avg_ease - EASE_BASELINE);
    }
    Ok(deltas)
}

/// Raw session notes for the week, one line per session, for the AI context.
fn gather_session_notes(
    conn: &Connection,
    week_start: &str,
    week_end: &str,
) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT date, pillar, hours, note FROM sessions
             WHERE date >= ?1 AND date <= ?2 ORDER BY date ASC, pillar ASC",
        )
        .map_err(|e| e.to_string())?;

    let lines: Vec<String> = stmt
        .query_map(params![week_start, week_end], |row| {
            let date: String = row.get(0)?;
            let pillar: String = row.get(1)?;
            let hours: f32 = row.get(2)?;
            let note: String = row.get(3)?;
            let note = note.trim();
            Ok(if note.is_empty() {
                format!("- {date} · {pillar} · {hours:.1}h")
            } else {
                format!("- {date} · {pillar} · {hours:.1}h — {note}")
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(if lines.is_empty() {
        "No sessions were logged this week.".to_string()
    } else {
        lines.join("\n")
    })
}

// ── AI prompt building ────────────────────────────────────────────────────────

const DIGEST_SYSTEM_PROMPT: &str = "You are an encouraging but rigorous learning coach writing a WEEKLY DIGEST for a learner in an intensive 3-month AI + leadership sprint.

Write a concise, motivating markdown report with EXACTLY these five sections, in this order, each as a `## ` heading:

## What You Covered
## Mastery Gains
## Streak & Consistency
## Top Knowledge Gaps
## Recommended Focus for Next Week

Guidelines:
- Ground EVERY claim in the supplied metrics — never invent hours, sessions, streaks, or pillars.
- Mastery numbers are ESTIMATED from spaced-repetition ease factors; describe them as estimates, not exact scores.
- Be specific and actionable; refer to pillars by name.
- Keep the whole report under ~400 words.
- You MAY include at most ONE `<genui type=\"key-insight\">...</genui>` block with a single sharp insight. Use no other GenUI blocks.
- Do not add any headings beyond the five above, and add no preamble before the first heading.";

fn build_digest_user_message(
    metrics: &DigestMetrics,
    mastery_deltas: &HashMap<String, f32>,
    session_notes: &str,
    week_start: &str,
    week_end: &str,
    week_number: u32,
) -> String {
    let metrics_json =
        serde_json::to_string_pretty(metrics).unwrap_or_else(|_| "{}".to_string());
    let mastery_json =
        serde_json::to_string_pretty(mastery_deltas).unwrap_or_else(|_| "{}".to_string());

    format!(
        "Sprint week {week_number} ({week_start} to {week_end}).\n\n\
         Computed metrics (JSON):\n{metrics_json}\n\n\
         Estimated per-pillar mastery deltas (average SM-2 ease factor minus the 2.5 baseline; \
         positive means trending easier / improving):\n{mastery_json}\n\n\
         Raw session notes from this week:\n{session_notes}\n\n\
         Write the weekly digest now, following the required five-section structure."
    )
}

// ── Store / notification helpers ──────────────────────────────────────────────

fn load_provider_config(app: &AppHandle) -> Result<ProviderConfig, String> {
    use tauri_plugin_store::StoreExt;

    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let val = store
        .get("provider_config")
        .ok_or_else(|| "No AI provider configured. Open Settings to set one up.".to_string())?;
    serde_json::from_value::<ProviderConfig>(val).map_err(|e| e.to_string())
}

fn notifications_enabled(app: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;

    match app.store("settings.json") {
        Ok(store) => store
            .get("notify_on_digest")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        Err(_) => true,
    }
}

/// Fire a "digest ready" notification, suppressible via the `notify_on_digest` setting.
fn maybe_notify(app: &AppHandle, week_number: u32, total_hours: f32) {
    if !notifications_enabled(app) {
        return;
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Weekly Digest ready")
        .body(format!(
            "Your week {week_number} recap is ready — {total_hours:.1}h logged. Open Progress to read it."
        ))
        .show();
}

// ── DB read/write ──────────────────────────────────────────────────────────────

fn parse_metrics(raw: &str) -> DigestMetrics {
    serde_json::from_str(raw).unwrap_or(DigestMetrics {
        total_hours: 0.0,
        hours_by_pillar: HashMap::new(),
        sessions_count: 0,
        streak: 0,
        pillars_covered: Vec::new(),
        top_gaps: Vec::new(),
        recommended_focus: Vec::new(),
    })
}

fn read_digest(conn: &Connection, week_start: &str) -> Result<Option<WeeklyDigest>, String> {
    let row = conn
        .query_row(
            "SELECT week_start, week_end, week_number, content, metrics, created_at
             FROM weekly_digests WHERE week_start = ?1",
            params![week_start],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(row.map(|(ws, we, wn, content, metrics_raw, created_at)| WeeklyDigest {
        week_start: ws,
        week_end: we,
        week_number: wn as u32,
        content,
        metrics: parse_metrics(&metrics_raw),
        created_at,
    }))
}

// ── Tauri commands ──────────────────────────────────────────────────────────────

/// Generate (or regenerate) the weekly digest for a given week.
///
/// `week_start` defaults to the most recently completed week. `config` defaults to
/// the persisted provider config. The AI call runs decoupled from the chat stream
/// (no `ai-token`/`ai-done` events), and the DB lock is never held across it.
/// Upserts on `week_start`, so regenerating a week never duplicates a row.
#[tauri::command]
pub async fn generate_weekly_digest(
    app: AppHandle,
    week_start: Option<String>,
    config: Option<ProviderConfig>,
) -> Result<WeeklyDigest, String> {
    let today = Local::now().date_naive();
    let (ws, we, wn) = resolve_week(week_start, today)?;

    // 1. Gather all stats up front, then release the connection before the AI call.
    let (metrics, mastery, notes) = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        let metrics = gather_week_stats(&conn, &ws, &we)?;
        let mastery = pillar_mastery_deltas(&conn, &ws, &we)?;
        let notes = gather_session_notes(&conn, &ws, &we)?;
        (metrics, mastery, notes)
    };

    // 2. Resolve provider config and generate the markdown (no DB lock held).
    let cfg = match config {
        Some(c) => c,
        None => load_provider_config(&app)?,
    };
    let user = build_digest_user_message(&metrics, &mastery, &notes, &ws, &we, wn);
    let messages = vec![AiMessage {
        role: "user".to_string(),
        content: user,
    }];
    let content =
        crate::commands::ai::collect_completion(messages, Some(DIGEST_SYSTEM_PROMPT.to_string()), cfg, Some(90))
            .await?;

    // 3. Persist (upsert on week_start), tracking whether this is a new week.
    let created_at = Local::now().to_rfc3339();
    let metrics_str = serde_json::to_string(&metrics).map_err(|e| e.to_string())?;

    let was_new = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        let existed = conn
            .query_row(
                "SELECT 1 FROM weekly_digests WHERE week_start = ?1",
                params![ws],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some();

        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO weekly_digests
                 (id, week_start, week_end, week_number, content, metrics, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(week_start) DO UPDATE SET
                 week_end = ?3, week_number = ?4, content = ?5,
                 metrics = ?6, created_at = ?7",
            params![id, ws, we, wn as i64, content, metrics_str, created_at],
        )
        .map_err(|e| e.to_string())?;

        !existed
    };

    if was_new {
        maybe_notify(&app, wn, metrics.total_hours);
    }

    Ok(WeeklyDigest {
        week_start: ws,
        week_end: we,
        week_number: wn,
        content,
        metrics,
        created_at,
    })
}

/// List recent weekly digests, newest first.
#[tauri::command]
pub fn get_weekly_digests(
    app: AppHandle,
    limit: Option<i64>,
) -> Result<Vec<WeeklyDigest>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(12);

    let mut stmt = conn
        .prepare(
            "SELECT week_start, week_end, week_number, content, metrics, created_at
             FROM weekly_digests ORDER BY week_start DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![lim], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut digests = Vec::new();
    for r in rows {
        let (ws, we, wn, content, metrics_raw, created_at) = r.map_err(|e| e.to_string())?;
        digests.push(WeeklyDigest {
            week_start: ws,
            week_end: we,
            week_number: wn as u32,
            content,
            metrics: parse_metrics(&metrics_raw),
            created_at,
        });
    }
    Ok(digests)
}

/// On-launch catch-up: return the most-recently-completed week's digest, generating
/// it first if it is missing. Returns `None` (rather than erroring) when generation
/// can't proceed — e.g. no provider/API key configured — so startup never crashes.
#[tauri::command]
pub async fn maybe_generate_due_digest(app: AppHandle) -> Result<Option<WeeklyDigest>, String> {
    let today = Local::now().date_naive();
    let (ws, we, _wn) = resolve_week(None, today)?;

    // Already generated for this week → return it. Also skip auto-generation for a
    // week with no logged sessions (nothing to summarise — avoids a wasted AI call
    // and an empty digest; the manual "Generate" button still works regardless).
    {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        if let Some(existing) = read_digest(&conn, &ws)? {
            return Ok(Some(existing));
        }
        let metrics = gather_week_stats(&conn, &ws, &we)?;
        if metrics.sessions_count == 0 {
            return Ok(None);
        }
    }

    // Missing → try to generate. Tolerate a missing provider config gracefully.
    match generate_weekly_digest(app, Some(ws), None).await {
        Ok(d) => Ok(Some(d)),
        Err(_) => Ok(None),
    }
}

/// Export a digest's markdown to disk. When `path` is omitted the file is written to
/// the OS download directory as `weekly-digest-<week_start>.md`. Returns the path.
#[tauri::command]
pub async fn export_weekly_digest(
    app: AppHandle,
    week_start: String,
    path: Option<String>,
) -> Result<String, String> {
    let content = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        read_digest(&conn, &week_start)?
            .ok_or_else(|| "No digest found for that week.".to_string())?
            .content
    };

    let target = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let dir = app
                .path()
                .download_dir()
                .map_err(|e| e.to_string())?;
            dir.join(format!("weekly-digest-{week_start}.md"))
        }
    };

    tokio::fs::write(&target, content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(target.to_string_lossy().to_string())
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                id TEXT PRIMARY KEY, date TEXT NOT NULL, pillar TEXT NOT NULL,
                hours REAL NOT NULL, energy INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
             );
             CREATE TABLE review_items (
                item_id TEXT PRIMARY KEY, item_type TEXT NOT NULL, pillar TEXT, content TEXT NOT NULL,
                ease_factor REAL NOT NULL DEFAULT 2.5, interval_days REAL NOT NULL DEFAULT 0,
                repetitions INTEGER NOT NULL DEFAULT 0, last_quality INTEGER,
                last_seen TEXT NOT NULL, next_due TEXT NOT NULL, created_at TEXT NOT NULL
             );",
        )
        .unwrap();
        conn
    }

    fn add_session(conn: &Connection, date: &str, pillar: &str, hours: f32, note: &str) {
        conn.execute(
            "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at)
             VALUES (?1, ?2, ?3, ?4, 3, ?5, ?2)",
            params![Uuid::new_v4().to_string(), date, pillar, hours, note],
        )
        .unwrap();
    }

    fn add_review(
        conn: &Connection,
        pillar: &str,
        content: &str,
        ease: f32,
        last_quality: Option<i32>,
        last_seen: &str,
    ) {
        conn.execute(
            "INSERT INTO review_items
                (item_id, item_type, pillar, content, ease_factor, interval_days,
                 repetitions, last_quality, last_seen, next_due, created_at)
             VALUES (?1, 'flashcard', ?2, ?3, ?4, 1, 1, ?5, ?6, ?6, ?6)",
            params![
                Uuid::new_v4().to_string(),
                pillar,
                content,
                ease,
                last_quality,
                last_seen
            ],
        )
        .unwrap();
    }

    #[test]
    fn week_bounds_aligns_monday_to_sunday() {
        // 2026-06-03 is a Wednesday.
        let wed = NaiveDate::from_ymd_opt(2026, 6, 3).unwrap();
        let (mon, sun) = week_bounds(wed);
        assert_eq!(mon, NaiveDate::from_ymd_opt(2026, 6, 1).unwrap());
        assert_eq!(sun, NaiveDate::from_ymd_opt(2026, 6, 7).unwrap());
        assert_eq!(mon.weekday(), Weekday::Mon);
        assert_eq!(sun.weekday(), Weekday::Sun);
    }

    #[test]
    fn completed_week_on_sunday_is_current_week() {
        // 2026-06-07 is a Sunday → its own week is complete.
        let sun = NaiveDate::from_ymd_opt(2026, 6, 7).unwrap();
        let (mon, end) = most_recent_completed_week(sun);
        assert_eq!(mon, NaiveDate::from_ymd_opt(2026, 6, 1).unwrap());
        assert_eq!(end, sun);
    }

    #[test]
    fn completed_week_midweek_is_previous_week() {
        // 2026-06-10 is a Wednesday → completed week is the prior Mon–Sun.
        let wed = NaiveDate::from_ymd_opt(2026, 6, 10).unwrap();
        let (mon, end) = most_recent_completed_week(wed);
        assert_eq!(mon, NaiveDate::from_ymd_opt(2026, 6, 1).unwrap());
        assert_eq!(end, NaiveDate::from_ymd_opt(2026, 6, 7).unwrap());
    }

    #[test]
    fn resolve_week_normalises_to_monday() {
        let today = NaiveDate::from_ymd_opt(2026, 6, 15).unwrap();
        // Pass a Thursday — should snap back to that week's Monday.
        let (ws, we, wn) = resolve_week(Some("2026-06-04".to_string()), today).unwrap();
        assert_eq!(ws, "2026-06-01");
        assert_eq!(we, "2026-06-07");
        assert_eq!(wn, 1);
    }

    #[test]
    fn gather_week_stats_scopes_to_window() {
        let conn = setup();
        // In-week sessions (2026-06-01 .. 2026-06-07).
        add_session(&conn, "2026-06-01", "llm", 1.5, "attention");
        add_session(&conn, "2026-06-02", "llm", 1.0, "tokenization");
        add_session(&conn, "2026-06-03", "hardware", 2.0, "gpus");
        // Out-of-week session — must be excluded.
        add_session(&conn, "2026-05-30", "sales", 5.0, "prep");

        let m = gather_week_stats(&conn, "2026-06-01", "2026-06-07").unwrap();
        assert_eq!(m.sessions_count, 3);
        assert!((m.total_hours - 4.5).abs() < 1e-4);
        assert!((m.hours_by_pillar["llm"] - 2.5).abs() < 1e-4);
        assert!((m.hours_by_pillar["hardware"] - 2.0).abs() < 1e-4);
        assert!(!m.hours_by_pillar.contains_key("sales"));
        assert_eq!(m.pillars_covered, vec!["hardware", "llm"]);
    }

    #[test]
    fn gather_week_stats_flags_weak_reviews_as_gaps() {
        let conn = setup();
        add_session(&conn, "2026-06-02", "llm", 1.0, "");
        // Weak item reviewed in-week (low ease).
        add_review(&conn, "llm", "What is RLHF?", 1.6, Some(2), "2026-06-02T10:00:00+00:00");
        // Strong item reviewed in-week — not a gap.
        add_review(&conn, "llm", "What is a token?", 2.8, Some(5), "2026-06-03T10:00:00+00:00");
        // Weak item but reviewed out-of-week — excluded.
        add_review(&conn, "sales", "stale", 1.2, Some(1), "2026-05-20T10:00:00+00:00");

        let m = gather_week_stats(&conn, "2026-06-01", "2026-06-07").unwrap();
        assert_eq!(m.top_gaps, vec!["What is RLHF?"]);
    }

    #[test]
    fn streak_counts_back_from_anchor() {
        let conn = setup();
        add_session(&conn, "2026-06-05", "llm", 1.0, "");
        add_session(&conn, "2026-06-06", "llm", 1.0, "");
        add_session(&conn, "2026-06-07", "llm", 1.0, "");
        // Gap on 06-04, session on 06-03 (should not extend the streak).
        add_session(&conn, "2026-06-03", "llm", 1.0, "");

        assert_eq!(compute_streak(&conn, "2026-06-07").unwrap(), 3);
        // Anchored on a day with no session → streak is 0.
        assert_eq!(compute_streak(&conn, "2026-06-10").unwrap(), 0);
    }

    #[test]
    fn mastery_deltas_are_relative_to_baseline() {
        let conn = setup();
        add_review(&conn, "llm", "q1", 2.9, Some(5), "2026-06-02T10:00:00+00:00");
        add_review(&conn, "llm", "q2", 2.7, Some(4), "2026-06-03T10:00:00+00:00");
        add_review(&conn, "hardware", "q3", 2.0, Some(2), "2026-06-04T10:00:00+00:00");

        let deltas = pillar_mastery_deltas(&conn, "2026-06-01", "2026-06-07").unwrap();
        // llm avg ease = 2.8 → delta +0.3
        assert!((deltas["llm"] - 0.3).abs() < 1e-4);
        // hardware avg ease = 2.0 → delta -0.5
        assert!((deltas["hardware"] + 0.5).abs() < 1e-4);
    }

    #[test]
    fn recommend_focus_prefers_low_coverage_and_gaps() {
        let mut hours = HashMap::new();
        hours.insert("llm".to_string(), 5.0);
        hours.insert("hardware".to_string(), 3.0);
        // sales/communication/voice have 0 hours → lowest coverage.
        let focus = recommend_focus(&hours, &["security".to_string()]);
        assert_eq!(focus.len(), 3);
        // Two lowest-coverage core pillars come first (zero-hour ones).
        assert!(focus.iter().all(|p| p != "llm"));
        // The gap pillar is appended.
        assert!(focus.contains(&"security".to_string()));
    }

    #[test]
    fn prompt_includes_sections_and_metrics() {
        let conn = setup();
        add_session(&conn, "2026-06-02", "llm", 1.0, "studied attention");
        let m = gather_week_stats(&conn, "2026-06-01", "2026-06-07").unwrap();
        let deltas = HashMap::new();
        let notes = gather_session_notes(&conn, "2026-06-01", "2026-06-07").unwrap();
        let msg = build_digest_user_message(&m, &deltas, &notes, "2026-06-01", "2026-06-07", 1);

        assert!(msg.contains("Sprint week 1"));
        assert!(msg.contains("studied attention"));
        assert!(msg.contains("Computed metrics"));
        assert!(msg.contains("mastery deltas"));

        // The system prompt enumerates exactly the five required sections.
        for section in [
            "## What You Covered",
            "## Mastery Gains",
            "## Streak & Consistency",
            "## Top Knowledge Gaps",
            "## Recommended Focus for Next Week",
        ] {
            assert!(DIGEST_SYSTEM_PROMPT.contains(section), "missing {section}");
        }
    }

    #[test]
    fn session_notes_empty_when_no_sessions() {
        let conn = setup();
        let notes = gather_session_notes(&conn, "2026-06-01", "2026-06-07").unwrap();
        assert_eq!(notes, "No sessions were logged this week.");
    }
}
