//! Drift detection & adaptive plan rebalancing.
//!
//! Two linked features:
//!  1. **Drift detection** — surfaces pillars that have planned hours but
//!     haven't been touched in more than N days, so the Dashboard can prompt a
//!     catch-up. `compute_drift` is pure and unit-tested; `get_pillar_drift`
//!     is the thin Tauri wrapper that gathers activity from SQLite.
//!  2. **Weekly rebalancing** — compares planned vs. completed study hours and
//!     proposes per-pillar schedule shifts (the `plan_adjustments` table). An
//!     AI rationale is generated via `collect_completion` without touching the
//!     live chat stream. Once applied, the proposal reweights upcoming
//!     schedule blocks (see `schedule.rs`).
//!
//! Scope: rebalancing and drift operate on the five pillars with defined weekly
//! targets (matching `progress.rs` and the static schedule blocks). The seven
//! CTO pillars have no curriculum hour targets, so they are not rebalanced.

use std::collections::HashMap;

use chrono::{Datelike, Duration, Local, NaiveDate, Weekday};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::ai::{AiMessage, ProviderConfig};
use crate::db::get_connection;

// ── Constants ───────────────────────────────────────────────────────────────

/// Pillars with defined weekly hour targets — the rebalanceable set.
const CORE_PILLARS: [&str; 5] = ["llm", "hardware", "sales", "communication", "voice"];

const DEFAULT_DRIFT_THRESHOLD_DAYS: i64 = 7;
const SPRINT_WEEKS: f32 = 12.0;

/// Cumulative hour targets per pillar across the 12-week sprint (mirrors
/// `progress.rs`). Prorated by elapsed weeks to derive "planned so far".
fn target_hours() -> HashMap<String, f32> {
    let mut m = HashMap::new();
    m.insert("llm".to_string(), 36.0);
    m.insert("hardware".to_string(), 24.0);
    m.insert("sales".to_string(), 24.0);
    m.insert("communication".to_string(), 18.0);
    m.insert("voice".to_string(), 18.0);
    m
}

// ── Wire types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PillarDrift {
    pub pillar: String,
    /// Days since last activity; `None` when the pillar has never been touched.
    pub days_since_activity: Option<i64>,
    /// ISO date of last activity, or `None` if never touched.
    pub last_activity: Option<String>,
    pub planned_hours: f32,
    pub actual_hours: f32,
    /// Normalized severity (days_since / threshold); never-touched pillars rank
    /// highest. Used to sort the report.
    pub severity: f32,
    pub suggestion: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DriftReport {
    pub threshold_days: i64,
    pub generated_at: String,
    pub drifted: Vec<PillarDrift>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PillarAdjustment {
    pub pillar: String,
    pub planned_hours: f32,
    pub actual_hours: f32,
    /// `ahead` | `behind` | `on_track`
    pub status: String,
    /// Positive = behind (needs more time), negative = ahead (can trim).
    pub weight_delta: f32,
    /// Suggested change to the pillar's daily schedule block, in ±15-min steps.
    pub recommended_minutes_delta: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlanAdjustment {
    pub week_start: String,
    pub week_number: u32,
    pub generated_at: String,
    pub rationale: String,
    pub adjustments: Vec<PillarAdjustment>,
    /// `proposed` | `applied` | `dismissed`
    pub status: String,
    pub applied_at: Option<String>,
}

/// Pure input to `compute_drift`: a pillar and the date it was last touched.
#[derive(Debug, Clone)]
pub struct PillarActivity {
    pub pillar: String,
    pub last_activity: Option<NaiveDate>,
}

// ── Week / date helpers ─────────────────────────────────────────────────────

fn sprint_start() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 6, 1).expect("valid sprint start date")
}

/// 1-based sprint week for a date, clamped to [1, 12].
fn week_number_for(date: NaiveDate) -> u32 {
    let start = sprint_start();
    if date < start {
        return 1;
    }
    let days = (date - start).num_days();
    ((days / 7) + 1).clamp(1, 12) as u32
}

/// Monday-anchored start date of a given sprint week (June 1 2026 is a Monday).
fn week_start_for_week(week: u32) -> NaiveDate {
    sprint_start() + Duration::days(((week.max(1) - 1) * 7) as i64)
}

fn resolve_week_start(today: NaiveDate) -> NaiveDate {
    week_start_for_week(week_number_for(today))
}

fn parse_rfc3339_date(s: &str) -> Option<NaiveDate> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&Local).date_naive())
        // Fallback: bare YYYY-MM-DD dates (e.g. sessions.date).
        .or_else(|| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
}

// ── Pure drift computation ──────────────────────────────────────────────────

/// Determines which pillars have drifted. A pillar drifts when it has a defined
/// target AND either: its last activity is older than `threshold_days`, or it
/// has never been touched (and the sprint has started). Returned sorted by
/// severity (most-neglected first).
pub fn compute_drift(
    activity: &[PillarActivity],
    targets: &HashMap<String, f32>,
    actual: &HashMap<String, f32>,
    threshold_days: i64,
    today: NaiveDate,
) -> Vec<PillarDrift> {
    let threshold = threshold_days.max(1);
    let week = week_number_for(today);
    let prorate = (week as f32 / SPRINT_WEEKS).min(1.0);
    let sprint_started = today >= sprint_start();

    let mut drifted: Vec<PillarDrift> = Vec::new();

    for pillar in CORE_PILLARS {
        let target = targets.get(pillar).copied().unwrap_or(0.0);
        if target <= 0.0 {
            continue;
        }

        let last = activity
            .iter()
            .find(|a| a.pillar == pillar)
            .and_then(|a| a.last_activity);

        let planned_hours = (target * prorate * 10.0).round() / 10.0;
        let actual_hours = actual.get(pillar).copied().unwrap_or(0.0);

        match last {
            Some(date) => {
                let days_since = (today - date).num_days();
                if days_since > threshold {
                    drifted.push(PillarDrift {
                        pillar: pillar.to_string(),
                        days_since_activity: Some(days_since),
                        last_activity: Some(date.format("%Y-%m-%d").to_string()),
                        planned_hours,
                        actual_hours,
                        severity: days_since as f32 / threshold as f32,
                        suggestion: format!(
                            "{} untouched for {} days — log a short catch-up block to stay on plan.",
                            capitalize(pillar),
                            days_since
                        ),
                    });
                }
            }
            None => {
                if sprint_started {
                    drifted.push(PillarDrift {
                        pillar: pillar.to_string(),
                        days_since_activity: None,
                        last_activity: None,
                        planned_hours,
                        actual_hours,
                        // Never-touched ranks above any time-based drift.
                        severity: 100.0,
                        suggestion: format!(
                            "{} hasn't been started yet — kick it off with a 30-min intro session.",
                            capitalize(pillar)
                        ),
                    });
                }
            }
        }
    }

    drifted.sort_by(|a, b| {
        b.severity
            .partial_cmp(&a.severity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    drifted
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().to_string() + chars.as_str(),
    }
}

// ── Pure rebalance computation ──────────────────────────────────────────────

/// Rounds minutes to the nearest 15-minute step.
fn round_to_15(minutes: f32) -> i32 {
    ((minutes / 15.0).round() * 15.0) as i32
}

/// Classifies each core pillar as ahead / behind / on_track relative to its
/// prorated target for the elapsed weeks, and proposes a bounded schedule shift
/// (more time toward behind pillars, less toward ahead ones).
pub fn compute_rebalance(
    targets: &HashMap<String, f32>,
    actual: &HashMap<String, f32>,
    week_number: u32,
) -> Vec<PillarAdjustment> {
    let prorate = (week_number as f32 / SPRINT_WEEKS).min(1.0);
    let mut out: Vec<PillarAdjustment> = Vec::new();

    for pillar in CORE_PILLARS {
        let target = targets.get(pillar).copied().unwrap_or(0.0);
        if target <= 0.0 {
            continue;
        }

        let planned = (target * prorate * 10.0).round() / 10.0;
        let actual_h = actual.get(pillar).copied().unwrap_or(0.0);

        let ratio = if planned > 0.0 { actual_h / planned } else { 1.0 };

        let status = if ratio >= 1.15 {
            "ahead"
        } else if ratio <= 0.6 {
            "behind"
        } else {
            "on_track"
        };

        // Positive = behind (needs more time); negative = ahead (can trim).
        let weight_delta = if planned > 0.0 {
            ((planned - actual_h) / planned).clamp(-1.0, 1.0)
        } else {
            0.0
        };

        // Map the weight to a bounded daily-block adjustment: behind pillars
        // gain up to +45 min, ahead pillars lose up to -30 min.
        let recommended_minutes_delta =
            round_to_15(weight_delta * 30.0).clamp(-30, 45);

        out.push(PillarAdjustment {
            pillar: pillar.to_string(),
            planned_hours: planned,
            actual_hours: actual_h,
            status: status.to_string(),
            weight_delta: (weight_delta * 100.0).round() / 100.0,
            recommended_minutes_delta,
        });
    }

    out
}

// ── SQLite gathering helpers ────────────────────────────────────────────────

/// Merges last-activity timestamps across sessions, review attempts, and chat
/// messages into one date per pillar (the most recent of any source).
fn gather_last_activity(conn: &rusqlite::Connection) -> HashMap<String, NaiveDate> {
    let mut map: HashMap<String, NaiveDate> = HashMap::new();

    let mut absorb = |pillar: Option<String>, ts: Option<String>| {
        if let (Some(p), Some(t)) = (pillar, ts) {
            if let Some(d) = parse_rfc3339_date(&t) {
                map.entry(p)
                    .and_modify(|cur| {
                        if d > *cur {
                            *cur = d;
                        }
                    })
                    .or_insert(d);
            }
        }
    };

    if let Ok(mut stmt) =
        conn.prepare("SELECT pillar, MAX(created_at) FROM sessions GROUP BY pillar")
    {
        if let Ok(rows) =
            stmt.query_map([], |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)))
        {
            for r in rows.flatten() {
                absorb(r.0, r.1);
            }
        }
    }

    if let Ok(mut stmt) =
        conn.prepare("SELECT pillar, MAX(last_seen) FROM review_items WHERE pillar IS NOT NULL GROUP BY pillar")
    {
        if let Ok(rows) =
            stmt.query_map([], |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)))
        {
            for r in rows.flatten() {
                absorb(r.0, r.1);
            }
        }
    }

    if let Ok(mut stmt) = conn.prepare(
        "SELECT c.pillar, MAX(m.created_at)
         FROM chat_messages m JOIN conversations c ON m.conversation_id = c.id
         WHERE c.pillar IS NOT NULL GROUP BY c.pillar",
    ) {
        if let Ok(rows) =
            stmt.query_map([], |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)))
        {
            for r in rows.flatten() {
                absorb(r.0, r.1);
            }
        }
    }

    map
}

/// Cumulative logged hours per pillar from the sessions table.
fn gather_actual_hours(conn: &rusqlite::Connection) -> HashMap<String, f32> {
    let mut map: HashMap<String, f32> = HashMap::new();
    if let Ok(mut stmt) =
        conn.prepare("SELECT pillar, COALESCE(SUM(hours), 0) FROM sessions GROUP BY pillar")
    {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f32>(1)?))
        }) {
            for r in rows.flatten() {
                map.insert(r.0, r.1);
            }
        }
    }
    map
}

fn session_count(conn: &rusqlite::Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .unwrap_or(0)
}

// ── Settings helpers (tauri_plugin_store) ───────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebalanceSettings {
    pub drift_threshold_days: i64,
    pub notify_on_rebalance: bool,
    pub auto_apply_rebalance: bool,
}

fn read_setting_i64(app: &AppHandle, key: &str, default: i64) -> i64 {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_i64())
        .unwrap_or(default)
}

fn read_setting_bool(app: &AppHandle, key: &str, default: bool) -> bool {
    use tauri_plugin_store::StoreExt;
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get(key))
        .and_then(|v| v.as_bool())
        .unwrap_or(default)
}

fn load_provider_config(app: &AppHandle) -> Option<ProviderConfig> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").ok()?;
    let value = store.get("provider_config")?;
    serde_json::from_value(value).ok()
}

// ── Drift command ───────────────────────────────────────────────────────────

/// Returns a severity-ranked report of pillars that have drifted past the
/// configured (or supplied) threshold of inactivity.
#[tauri::command]
pub fn get_pillar_drift(
    app: AppHandle,
    threshold_days: Option<i64>,
) -> Result<DriftReport, String> {
    let threshold = threshold_days
        .filter(|&t| t > 0)
        .unwrap_or_else(|| read_setting_i64(&app, "drift_threshold_days", DEFAULT_DRIFT_THRESHOLD_DAYS));

    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let last_activity = gather_last_activity(&conn);
    let actual = gather_actual_hours(&conn);
    drop(conn);

    let activity: Vec<PillarActivity> = CORE_PILLARS
        .iter()
        .map(|p| PillarActivity {
            pillar: p.to_string(),
            last_activity: last_activity.get(*p).copied(),
        })
        .collect();

    let today = Local::now().date_naive();
    let drifted = compute_drift(&activity, &target_hours(), &actual, threshold, today);

    Ok(DriftReport {
        threshold_days: threshold,
        generated_at: Local::now().to_rfc3339(),
        drifted,
    })
}

// ── Rebalance generation ────────────────────────────────────────────────────

const REBALANCE_SYSTEM_PROMPT: &str = "You are a terse, no-nonsense learning coach for a 12-week intensive study sprint. \
You are given planned-vs-completed study hours per pillar. Write a SHORT markdown rationale (3-5 sentences) \
explaining how to rebalance the remaining weeks: which pillars are ahead (can give up time) and which are behind \
(need more time). Ground every statement ONLY in the supplied numbers — never invent data or topics. \
Be direct and actionable. No preamble, no headings, no sign-off.";

fn build_rebalance_user_message(adjustments: &[PillarAdjustment], week_number: u32) -> String {
    let json = serde_json::to_string_pretty(adjustments).unwrap_or_else(|_| "[]".to_string());
    format!(
        "Sprint week {} of 12. Planned vs. completed hours per pillar (positive weightDelta = behind):\n\n{}\n\nWrite the rebalancing rationale.",
        week_number, json
    )
}

/// Deterministic fallback rationale when no AI provider is configured/reachable.
fn fallback_rationale(adjustments: &[PillarAdjustment], week_number: u32) -> String {
    let behind: Vec<&str> = adjustments
        .iter()
        .filter(|a| a.status == "behind")
        .map(|a| a.pillar.as_str())
        .collect();
    let ahead: Vec<&str> = adjustments
        .iter()
        .filter(|a| a.status == "ahead")
        .map(|a| a.pillar.as_str())
        .collect();

    let mut parts = vec![format!("Week {} of 12 rebalance.", week_number)];
    if !ahead.is_empty() {
        parts.push(format!("Ahead of plan: {}.", ahead.join(", ")));
    }
    if !behind.is_empty() {
        parts.push(format!(
            "Behind and needing more time: {}.",
            behind.join(", ")
        ));
    }
    if ahead.is_empty() && behind.is_empty() {
        parts.push("All pillars are on track — keep the current cadence.".to_string());
    } else {
        parts.push("Apply this proposal to shift the remaining weeks accordingly.".to_string());
    }
    parts.join(" ")
}

/// Reads a single `plan_adjustments` row by week_start into a `PlanAdjustment`.
fn read_adjustment_row(
    conn: &rusqlite::Connection,
    week_start: &str,
) -> Result<Option<PlanAdjustment>, String> {
    let result = conn.query_row(
        "SELECT week_start, week_number, generated_at, rationale, adjustments, status, applied_at
         FROM plan_adjustments WHERE week_start = ?1",
        rusqlite::params![week_start],
        |row| {
            let adj_json: String = row.get(4)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? as u32,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                adj_json,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        },
    );

    match result {
        Ok((week_start, week_number, generated_at, rationale, adj_json, status, applied_at)) => {
            let adjustments: Vec<PillarAdjustment> =
                serde_json::from_str(&adj_json).unwrap_or_default();
            Ok(Some(PlanAdjustment {
                week_start,
                week_number,
                generated_at,
                rationale,
                adjustments,
                status,
                applied_at,
            }))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Generates (or regenerates) a rebalance proposal for the given week and
/// persists it. Preserves an existing `applied` status on conflict.
#[tauri::command]
pub async fn generate_plan_rebalance(
    app: AppHandle,
    week_start: Option<String>,
    config: Option<ProviderConfig>,
) -> Result<PlanAdjustment, String> {
    let today = Local::now().date_naive();
    let week_start_date = match week_start {
        Some(ref s) => NaiveDate::parse_from_str(s, "%Y-%m-%d")
            .map_err(|e| format!("Invalid week_start: {}", e))?,
        None => resolve_week_start(today),
    };
    let week_start_str = week_start_date.format("%Y-%m-%d").to_string();
    let week_number = week_number_for(week_start_date);

    // Gather metrics with a short-lived connection (released before any await).
    let actual = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        gather_actual_hours(&conn)
    };

    let adjustments = compute_rebalance(&target_hours(), &actual, week_number);

    // AI rationale — never block launch if no provider / it fails.
    let cfg = config.or_else(|| load_provider_config(&app));
    let rationale = match cfg {
        Some(provider_config) => {
            let user_msg = build_rebalance_user_message(&adjustments, week_number);
            let messages = vec![AiMessage {
                role: "user".to_string(),
                content: user_msg,
            }];
            match crate::commands::ai::collect_completion(
                messages,
                Some(REBALANCE_SYSTEM_PROMPT.to_string()),
                provider_config,
                Some(90),
            )
            .await
            {
                Ok(text) if !text.trim().is_empty() => text.trim().to_string(),
                _ => fallback_rationale(&adjustments, week_number),
            }
        }
        None => fallback_rationale(&adjustments, week_number),
    };

    let generated_at = Local::now().to_rfc3339();
    let adjustments_json = serde_json::to_string(&adjustments).map_err(|e| e.to_string())?;

    let saved = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO plan_adjustments
                (id, week_start, week_number, generated_at, rationale, adjustments, status, applied_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'proposed', NULL)
             ON CONFLICT(week_start) DO UPDATE SET
                week_number = excluded.week_number,
                generated_at = excluded.generated_at,
                rationale = excluded.rationale,
                adjustments = excluded.adjustments",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                week_start_str,
                week_number as i64,
                generated_at,
                rationale,
                adjustments_json,
            ],
        )
        .map_err(|e| e.to_string())?;

        read_adjustment_row(&conn, &week_start_str)?
            .ok_or_else(|| "Failed to read back saved adjustment".to_string())?
    };

    if read_setting_bool(&app, "notify_on_rebalance", true) {
        notify_rebalance_ready(&app, week_number);
    }

    Ok(saved)
}

fn notify_rebalance_ready(app: &AppHandle, week_number: u32) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Weekly plan rebalance ready")
        .body(format!(
            "Your Week {} study plan has a new rebalancing proposal. Review it in Progress.",
            week_number
        ))
        .show();
}

// ── Lifecycle commands ──────────────────────────────────────────────────────

#[tauri::command]
pub fn get_plan_adjustments(app: AppHandle, limit: Option<i64>) -> Result<Vec<PlanAdjustment>, String> {
    let limit = limit.unwrap_or(12).clamp(1, 100);
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT week_start, week_number, generated_at, rationale, adjustments, status, applied_at
             FROM plan_adjustments ORDER BY week_start DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![limit], |row| {
            let adj_json: String = row.get(4)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? as u32,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                adj_json,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in rows.flatten() {
        let adjustments: Vec<PillarAdjustment> = serde_json::from_str(&r.4).unwrap_or_default();
        out.push(PlanAdjustment {
            week_start: r.0,
            week_number: r.1,
            generated_at: r.2,
            rationale: r.3,
            adjustments,
            status: r.5,
            applied_at: r.6,
        });
    }
    Ok(out)
}

/// Marks a proposal as applied. Enforces a single active reweight: any other
/// previously-applied row is reverted to `proposed`.
#[tauri::command]
pub fn apply_plan_adjustment(app: AppHandle, week_start: String) -> Result<(), String> {
    let mut conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE plan_adjustments SET status = 'proposed', applied_at = NULL
         WHERE status = 'applied' AND week_start != ?1",
        rusqlite::params![week_start],
    )
    .map_err(|e| e.to_string())?;

    let affected = tx
        .execute(
            "UPDATE plan_adjustments SET status = 'applied', applied_at = ?2 WHERE week_start = ?1",
            rusqlite::params![week_start, now],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err("No rebalance proposal found for that week".to_string());
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn dismiss_plan_adjustment(app: AppHandle, week_start: String) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE plan_adjustments SET status = 'dismissed', applied_at = NULL WHERE week_start = ?1",
        rusqlite::params![week_start],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sunday catch-up: on Sundays, ensure a rebalance proposal exists for the
/// current week. Returns the existing or freshly-generated proposal, or `None`
/// when it's not Sunday, there's no activity yet, or no provider is configured.
#[tauri::command]
pub async fn maybe_generate_due_rebalance(app: AppHandle) -> Result<Option<PlanAdjustment>, String> {
    let today = Local::now().date_naive();
    if today.weekday() != Weekday::Sun {
        return Ok(None);
    }

    let week_start_str = resolve_week_start(today).format("%Y-%m-%d").to_string();

    // Already have one for this week? Return it as-is.
    let existing = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        let has_sessions = session_count(&conn) > 0;
        let row = read_adjustment_row(&conn, &week_start_str)?;
        (row, has_sessions)
    };

    if let Some(row) = existing.0 {
        return Ok(Some(row));
    }
    if !existing.1 {
        return Ok(None);
    }

    // Generate one (tolerates missing provider config via fallback rationale).
    let generated = generate_plan_rebalance(app, Some(week_start_str), None).await?;
    Ok(Some(generated))
}

// ── Settings commands ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_rebalance_settings(app: AppHandle) -> Result<RebalanceSettings, String> {
    Ok(RebalanceSettings {
        drift_threshold_days: read_setting_i64(&app, "drift_threshold_days", DEFAULT_DRIFT_THRESHOLD_DAYS),
        notify_on_rebalance: read_setting_bool(&app, "notify_on_rebalance", true),
        auto_apply_rebalance: read_setting_bool(&app, "auto_apply_rebalance", false),
    })
}

#[tauri::command]
pub fn set_rebalance_settings(app: AppHandle, settings: RebalanceSettings) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(
        "drift_threshold_days",
        serde_json::json!(settings.drift_threshold_days.clamp(1, 60)),
    );
    store.set("notify_on_rebalance", serde_json::json!(settings.notify_on_rebalance));
    store.set("auto_apply_rebalance", serde_json::json!(settings.auto_apply_rebalance));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ── Schedule integration helper ─────────────────────────────────────────────

/// Returns the per-pillar adjustments of the single currently-applied proposal,
/// or an empty vec if none is applied. Used by `schedule.rs` to reweight blocks.
pub fn load_applied_adjustments(app: &AppHandle) -> Vec<PillarAdjustment> {
    let conn = match get_connection(app) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let adj_json: Result<String, _> = conn.query_row(
        "SELECT adjustments FROM plan_adjustments WHERE status = 'applied'
         ORDER BY week_start DESC LIMIT 1",
        [],
        |row| row.get(0),
    );

    match adj_json {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn date(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    fn act(pillar: &str, last: Option<NaiveDate>) -> PillarActivity {
        PillarActivity {
            pillar: pillar.to_string(),
            last_activity: last,
        }
    }

    #[test]
    fn week_numbers_align_to_sprint() {
        assert_eq!(week_number_for(date(2026, 6, 1)), 1);
        assert_eq!(week_number_for(date(2026, 6, 7)), 1);
        assert_eq!(week_number_for(date(2026, 6, 8)), 2);
        assert_eq!(week_number_for(date(2026, 5, 1)), 1); // before sprint clamps to 1
        assert_eq!(week_number_for(date(2027, 1, 1)), 12); // far future clamps to 12
    }

    #[test]
    fn week_start_is_monday_anchored() {
        assert_eq!(week_start_for_week(1), date(2026, 6, 1));
        assert_eq!(week_start_for_week(2), date(2026, 6, 8));
        assert_eq!(week_start_for_week(3), date(2026, 6, 15));
    }

    #[test]
    fn drift_flags_stale_pillar() {
        let today = date(2026, 6, 20);
        let activity = vec![
            act("llm", Some(date(2026, 6, 19))),      // 1 day — fresh
            act("hardware", Some(date(2026, 6, 5))),  // 15 days — drifted
            act("sales", Some(date(2026, 6, 18))),    // 2 days — fresh
            act("communication", Some(date(2026, 6, 17))),
            act("voice", Some(date(2026, 6, 16))),
        ];
        let drifted = compute_drift(
            &activity,
            &target_hours(),
            &HashMap::new(),
            7,
            today,
        );
        assert_eq!(drifted.len(), 1);
        assert_eq!(drifted[0].pillar, "hardware");
        assert_eq!(drifted[0].days_since_activity, Some(15));
    }

    #[test]
    fn drift_flags_never_touched_pillar_highest() {
        let today = date(2026, 6, 20);
        let activity = vec![
            act("llm", Some(date(2026, 6, 19))),
            act("hardware", Some(date(2026, 6, 1))), // 19 days drifted
            act("sales", None),                       // never touched
            act("communication", Some(date(2026, 6, 18))),
            act("voice", Some(date(2026, 6, 18))),
        ];
        let drifted = compute_drift(&activity, &target_hours(), &HashMap::new(), 7, today);
        // sales (never) ranks first, then hardware (stale).
        assert_eq!(drifted[0].pillar, "sales");
        assert_eq!(drifted[0].days_since_activity, None);
        assert!(drifted.iter().any(|d| d.pillar == "hardware"));
    }

    #[test]
    fn drift_ignores_sub_threshold_activity() {
        let today = date(2026, 6, 20);
        let activity = vec![
            act("llm", Some(date(2026, 6, 19))),
            act("hardware", Some(date(2026, 6, 18))),
            act("sales", Some(date(2026, 6, 17))),
            act("communication", Some(date(2026, 6, 16))),
            act("voice", Some(date(2026, 6, 15))), // 5 days, under 7
        ];
        let drifted = compute_drift(&activity, &target_hours(), &HashMap::new(), 7, today);
        assert!(drifted.is_empty());
    }

    #[test]
    fn drift_empty_before_sprint_start() {
        let today = date(2026, 5, 20);
        let activity: Vec<PillarActivity> =
            CORE_PILLARS.iter().map(|p| act(p, None)).collect();
        let drifted = compute_drift(&activity, &target_hours(), &HashMap::new(), 7, today);
        assert!(drifted.is_empty());
    }

    #[test]
    fn rebalance_classifies_ahead_behind_on_track() {
        // Week 6 of 12 → prorate 0.5. llm target 36 → planned 18.
        let week = 6;
        let mut actual = HashMap::new();
        actual.insert("llm".to_string(), 30.0); // 30/18 = 1.67 → ahead
        actual.insert("hardware".to_string(), 6.0); // 6/12 = 0.5 → behind
        actual.insert("sales".to_string(), 11.0); // 11/12 ≈ 0.92 → on_track
        // communication & voice absent → 0 actual → behind

        let adj = compute_rebalance(&target_hours(), &actual, week);

        let by = |p: &str| adj.iter().find(|a| a.pillar == p).unwrap();
        assert_eq!(by("llm").status, "ahead");
        assert!(by("llm").recommended_minutes_delta < 0); // trim ahead pillar
        assert_eq!(by("hardware").status, "behind");
        assert!(by("hardware").recommended_minutes_delta > 0); // add time
        assert_eq!(by("sales").status, "on_track");
        assert_eq!(by("voice").status, "behind");
    }

    #[test]
    fn rebalance_canonical_reweight_scenario() {
        // "LLM ahead, another pillar skipped → reweight toward the skipped one."
        let week = 4; // prorate 1/3
        let mut actual = HashMap::new();
        actual.insert("llm".to_string(), 20.0); // far ahead
        // sales completely skipped (absent → 0)

        let adj = compute_rebalance(&target_hours(), &actual, week);
        let llm = adj.iter().find(|a| a.pillar == "llm").unwrap();
        let sales = adj.iter().find(|a| a.pillar == "sales").unwrap();

        assert_eq!(llm.status, "ahead");
        assert_eq!(sales.status, "behind");
        // Time shifts away from llm and toward sales.
        assert!(llm.recommended_minutes_delta <= 0);
        assert!(sales.recommended_minutes_delta > 0);
    }

    #[test]
    fn round_to_15_steps() {
        assert_eq!(round_to_15(7.0), 0);
        assert_eq!(round_to_15(8.0), 15);
        assert_eq!(round_to_15(22.0), 15);
        assert_eq!(round_to_15(23.0), 30);
        assert_eq!(round_to_15(-8.0), -15);
    }
}
