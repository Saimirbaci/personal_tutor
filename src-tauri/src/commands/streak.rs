//! Momentum streaks with freeze / recovery.
//!
//! Extends the simple consecutive-day streak (`progress::get_streak`) with two
//! motivation-preserving mechanics:
//!
//! 1. **Freeze tokens** — at most one earned per ISO week by completing a *deep*
//!    session (a `conversation_depth.score >= DEEP_SESSION_THRESHOLD`). A held
//!    token is consumed **automatically** to bridge a single missed day so the
//!    streak survives instead of hard-resetting.
//! 2. **Recovery** — a single missed day with no token available offers a
//!    partial-restore catch-up session (restore to `ceil(prior * fraction)`)
//!    rather than zeroing the streak. A gap larger than one day is a hard break.
//!
//! The scoring logic is split into pure, clock-injected helpers
//! (`compute_streak_state`, `compute_recovery_offer`, `iso_week_start`) that are
//! unit-tested without `AppHandle`/SQLite. The command layer stays thin: load
//! rows, call the pure engine, persist the side effects it returns.

use chrono::{Datelike, Duration, Local, NaiveDate};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::db::get_connection;

/// Minimum `conversation_depth.score` that qualifies a session as "deep" and
/// earns a freeze token for the week.
pub const DEEP_SESSION_THRESHOLD: i64 = 4;
/// Maximum freeze tokens a learner may hold at once (they do not stack).
const MAX_HELD_TOKENS: i64 = 1;
/// Fraction of the prior streak restored by completing a catch-up session.
const RECOVERY_RESTORE_FRACTION: f64 = 0.5;
/// Days a recovery offer stays open before it expires.
const RECOVERY_WINDOW_DAYS: i64 = 1;

/// Settings keys used to honor a completed recovery's partial restore.
const FLOOR_VALUE_KEY: &str = "streak_floor_value";
const FLOOR_DATE_KEY: &str = "streak_floor_date";

// ── Serde structs (mirror src/data/types.ts) ────────────────────────────────

/// A pending partial-restore offer surfaced after a single missed day.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryState {
    pub missed_date: String,
    pub prior_streak: i64,
    pub restore_to: i64,
    pub expires_at: String,
}

/// Full streak snapshot returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StreakState {
    pub current: i64,
    pub best: i64,
    pub freeze_tokens: i64,
    pub freeze_used_this_week: bool,
    pub frozen_days: Vec<String>,
    /// One of: `active` | `at_risk` | `recovery` | `broken`.
    pub status: String,
    pub recovery: Option<RecoveryState>,
}

/// Output of the pure engine: the display state plus the side effects the
/// command layer must persist (new bridges consumed, a recovery to open).
#[derive(Debug, Clone, PartialEq)]
pub struct StreakComputation {
    pub state: StreakState,
    pub new_bridges: Vec<NaiveDate>,
    pub offer_recovery: Option<RecoveryState>,
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/// The local-Monday that starts the ISO week containing `date`.
pub fn iso_week_start(date: NaiveDate) -> NaiveDate {
    let offset = date.weekday().num_days_from_monday() as i64;
    date - Duration::days(offset)
}

/// Build a partial-restore offer for a single missed day.
/// Restores to `max(1, ceil(prior_streak * fraction))`.
pub fn compute_recovery_offer(
    prior_streak: i64,
    fraction: f64,
    missed_date: NaiveDate,
    now: NaiveDate,
    window_days: i64,
) -> RecoveryState {
    let restore_to = ((prior_streak as f64) * fraction).ceil() as i64;
    RecoveryState {
        missed_date: missed_date.to_string(),
        prior_streak,
        restore_to: restore_to.max(1),
        expires_at: (now + Duration::days(window_days)).to_string(),
    }
}

/// Longest run of consecutive calendar dates present in `dates`.
fn longest_run(dates: &[NaiveDate]) -> i64 {
    if dates.is_empty() {
        return 0;
    }
    let mut sorted = dates.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let mut best = 1i64;
    let mut run = 1i64;
    for w in sorted.windows(2) {
        if w[1] == w[0] + Duration::days(1) {
            run += 1;
            best = best.max(run);
        } else {
            run = 1;
        }
    }
    best
}

struct WalkResult {
    current: i64,
    frozen: Vec<NaiveDate>,
    new_frozen: Vec<NaiveDate>,
    tokens_left: i64,
}

/// Walk backward from `anchor` counting study days. Already-bridged days
/// (`bridged`) provide continuity without spending a token; a single missing
/// day is bridged by spending an available token when the day before it is
/// covered. Stops at the first un-bridgeable gap. When `floor` matches a logged
/// day, the streak collapses to the floor value (a completed partial recovery).
fn walk(
    sessions: &std::collections::HashSet<NaiveDate>,
    bridged: &std::collections::HashSet<NaiveDate>,
    anchor: NaiveDate,
    mut tokens: i64,
    floor: Option<(NaiveDate, i64)>,
) -> WalkResult {
    let mut current = 0i64;
    let mut frozen = Vec::new();
    let mut new_frozen = Vec::new();
    let mut cursor = anchor;

    loop {
        // A completed-recovery floor date is a terminal anchor: the streak
        // collapses to the partial value as of that day. This fires whether or
        // not a formal session was logged there, so a recovery restored via
        // `complete_streak_recovery` (no fresh session) still counts.
        if let Some((fdate, fval)) = floor {
            if cursor == fdate {
                current += fval;
                break;
            }
        }
        if sessions.contains(&cursor) {
            current += 1;
            cursor -= Duration::days(1);
        } else if bridged.contains(&cursor) {
            // Already-frozen bridge: continuity only, no count, no token spend.
            frozen.push(cursor);
            cursor -= Duration::days(1);
        } else {
            let prev = cursor - Duration::days(1);
            let prev_covered = sessions.contains(&prev) || bridged.contains(&prev);
            if tokens > 0 && prev_covered {
                tokens -= 1;
                frozen.push(cursor);
                new_frozen.push(cursor);
                cursor = prev;
            } else {
                break;
            }
        }
    }

    WalkResult {
        current,
        frozen,
        new_frozen,
        tokens_left: tokens,
    }
}

fn to_iso(dates: &[NaiveDate]) -> Vec<String> {
    dates.iter().map(|d| d.to_string()).collect()
}

/// Pure streak engine. Given the learner's study dates, already-bridged days,
/// the held token balance, any pending recovery, and an honored restore floor,
/// compute the streak state and the side effects to persist.
pub fn compute_streak_state(
    session_dates: &[NaiveDate],
    bridged_dates: &[NaiveDate],
    available_tokens: i64,
    pending_recovery: Option<&RecoveryState>,
    restore_floor: Option<(NaiveDate, i64)>,
    now: NaiveDate,
) -> StreakComputation {
    let sessions: std::collections::HashSet<NaiveDate> = session_dates.iter().copied().collect();
    let bridged: std::collections::HashSet<NaiveDate> = bridged_dates.iter().copied().collect();
    let best_runs = longest_run(session_dates);

    let empty_state = |status: &str| StreakState {
        current: 0,
        best: best_runs,
        freeze_tokens: available_tokens,
        freeze_used_this_week: false,
        frozen_days: vec![],
        status: status.to_string(),
        recovery: None,
    };

    if sessions.is_empty() {
        return StreakComputation {
            state: empty_state("broken"),
            new_bridges: vec![],
            offer_recovery: None,
        };
    }

    let today = now;
    let yesterday = now - Duration::days(1);
    // A day is "covered" if it was studied, already bridged by a prior freeze,
    // or pinned by a completed-recovery floor (so a restore without a freshly
    // logged session still anchors the streak at its floor date).
    let mut covered: std::collections::HashSet<NaiveDate> =
        sessions.union(&bridged).copied().collect();
    if let Some((fdate, _)) = restore_floor {
        covered.insert(fdate);
    }
    let has_today = covered.contains(&today);
    let yesterday_covered = covered.contains(&yesterday);

    // Most recent covered day (covered is non-empty since sessions is non-empty).
    let last = *covered.iter().max().unwrap();
    let gap = (today - last).num_days();

    // Decide the walk anchor + front status. A front break (no activity today or
    // yesterday) may still be bridged when exactly yesterday was missed and a
    // token is available.
    let (anchor, pre_frozen, walk_tokens, status): (Option<NaiveDate>, Vec<NaiveDate>, i64, &str) =
        if has_today {
            (Some(today), vec![], available_tokens, "active")
        } else if yesterday_covered {
            (Some(yesterday), vec![], available_tokens, "at_risk")
        } else if gap == 2 && available_tokens > 0 {
            // Exactly yesterday missed; auto-bridge it and keep the streak alive.
            (Some(last), vec![yesterday], available_tokens - 1, "at_risk")
        } else {
            (None, vec![], available_tokens, "front_break")
        };

    if let Some(a) = anchor {
        let mut res = walk(&sessions, &bridged, a, walk_tokens, restore_floor);
        // Prepend any auto-bridge of yesterday performed before the walk.
        let mut frozen = pre_frozen.clone();
        frozen.extend(res.frozen);
        let mut new_bridges = pre_frozen.clone();
        new_bridges.append(&mut res.new_frozen);

        let current = res.current;
        let week = iso_week_start(now);
        let freeze_used_this_week = frozen.iter().any(|d| iso_week_start(*d) == week);

        return StreakComputation {
            state: StreakState {
                current,
                best: best_runs.max(current),
                freeze_tokens: res.tokens_left,
                freeze_used_this_week,
                frozen_days: to_iso(&frozen),
                status: status.to_string(),
                recovery: None,
            },
            new_bridges,
            offer_recovery: None,
        };
    }

    // Front break: no activity today or yesterday, and no bridge possible.
    // A gap of exactly one missed day (yesterday) is recovery-eligible; a larger
    // gap is a hard break.
    let prior = walk(&sessions, &bridged, last, available_tokens, restore_floor).current;
    let week = iso_week_start(now);

    if gap == 2 {
        let offer = pending_recovery
            .cloned()
            .unwrap_or_else(|| {
                compute_recovery_offer(prior, RECOVERY_RESTORE_FRACTION, yesterday, now, RECOVERY_WINDOW_DAYS)
            });
        // Surface already-bridged days from prior weeks for the heatmap.
        let frozen: Vec<NaiveDate> = bridged_dates.to_vec();
        let freeze_used_this_week = frozen.iter().any(|d| iso_week_start(*d) == week);
        StreakComputation {
            state: StreakState {
                current: 0,
                best: best_runs,
                freeze_tokens: available_tokens,
                freeze_used_this_week,
                frozen_days: to_iso(&frozen),
                status: "recovery".to_string(),
                recovery: Some(offer.clone()),
            },
            new_bridges: vec![],
            offer_recovery: if pending_recovery.is_some() { None } else { Some(offer) },
        }
    } else {
        StreakComputation {
            state: empty_state("broken"),
            new_bridges: vec![],
            offer_recovery: None,
        }
    }
}

// ── DB helpers ──────────────────────────────────────────────────────────────

fn now_iso() -> String {
    Local::now().to_rfc3339()
}

/// Held freeze balance = earned rows minus consumed rows.
fn held_token_balance(conn: &Connection) -> rusqlite::Result<i64> {
    let earned: i64 = conn.query_row(
        "SELECT COUNT(*) FROM streak_freezes WHERE kind = 'earned'",
        [],
        |r| r.get(0),
    )?;
    let consumed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM streak_freezes WHERE kind = 'consumed'",
        [],
        |r| r.get(0),
    )?;
    Ok(earned - consumed)
}

/// Award at most one freeze token per ISO week when a qualifying deep session
/// exists. Best-effort: returns whether a token was newly awarded.
pub fn maybe_award_freeze_token(conn: &Connection, now: NaiveDate) -> rusqlite::Result<bool> {
    let week_start = iso_week_start(now);
    let week_start_str = week_start.to_string();

    let earned_this_week: i64 = conn.query_row(
        "SELECT COUNT(*) FROM streak_freezes WHERE kind = 'earned' AND week_start = ?1",
        params![week_start_str],
        |r| r.get(0),
    )?;
    if earned_this_week > 0 {
        return Ok(false);
    }

    if held_token_balance(conn)? >= MAX_HELD_TOKENS {
        return Ok(false);
    }

    let week_end_str = (week_start + Duration::days(7)).to_string();
    let qualifies: i64 = conn.query_row(
        "SELECT COUNT(*) FROM conversation_depth d
         JOIN conversations c ON c.id = d.conversation_id
         WHERE d.score >= ?1
           AND date(c.updated_at) >= ?2
           AND date(c.updated_at) < ?3",
        params![DEEP_SESSION_THRESHOLD, week_start_str, week_end_str],
        |r| r.get(0),
    )?;
    if qualifies == 0 {
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO streak_freezes (id, kind, event_date, week_start, bridged_date, note, created_at)
         VALUES (?1, 'earned', ?2, ?3, NULL, 'deep session', ?4)",
        params![Uuid::new_v4().to_string(), now.to_string(), week_start_str, now_iso()],
    )?;
    Ok(true)
}

fn load_session_dates(conn: &Connection) -> Result<Vec<NaiveDate>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT date FROM sessions")
        .map_err(|e| e.to_string())?;
    let dates = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .collect();
    Ok(dates)
}

fn load_bridged_dates(conn: &Connection) -> Result<Vec<NaiveDate>, String> {
    let mut stmt = conn
        .prepare("SELECT bridged_date FROM streak_freezes WHERE kind = 'consumed' AND bridged_date IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let dates = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
        .collect();
    Ok(dates)
}

/// Consume a token by recording a `consumed` ledger row that bridges `missed`.
/// Idempotent: no-op if that day is already bridged.
fn insert_consumed(conn: &Connection, missed: NaiveDate, now: NaiveDate) -> Result<(), String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM streak_freezes WHERE kind = 'consumed' AND bridged_date = ?1",
            params![missed.to_string()],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists > 0 {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO streak_freezes (id, kind, event_date, week_start, bridged_date, note, created_at)
         VALUES (?1, 'consumed', ?2, ?3, ?4, 'auto freeze', ?5)",
        params![
            Uuid::new_v4().to_string(),
            now.to_string(),
            iso_week_start(missed).to_string(),
            missed.to_string(),
            now_iso(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Load the pending recovery row, expiring it if past its window.
fn load_pending_recovery(conn: &Connection, now: NaiveDate) -> Result<Option<RecoveryState>, String> {
    let row = conn
        .query_row(
            "SELECT missed_date, prior_streak, restore_to, expires_at
             FROM streak_recovery WHERE status = 'pending'
             ORDER BY created_at DESC LIMIT 1",
            [],
            |r| {
                Ok(RecoveryState {
                    missed_date: r.get(0)?,
                    prior_streak: r.get(1)?,
                    restore_to: r.get(2)?,
                    expires_at: r.get(3)?,
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other.to_string()),
        })?;

    let Some(rec) = row else { return Ok(None) };

    let expired = NaiveDate::parse_from_str(&rec.expires_at, "%Y-%m-%d")
        .map(|d| now > d)
        .unwrap_or(false);
    if expired {
        conn.execute(
            "UPDATE streak_recovery SET status = 'expired', resolved_at = ?1 WHERE status = 'pending'",
            params![now_iso()],
        )
        .map_err(|e| e.to_string())?;
        return Ok(None);
    }
    Ok(Some(rec))
}

fn insert_recovery(conn: &Connection, offer: &RecoveryState, _now: NaiveDate) -> Result<(), String> {
    conn.execute(
        "INSERT INTO streak_recovery
            (id, missed_date, prior_streak, restore_to, status, expires_at, created_at, resolved_at)
         VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, NULL)",
        params![
            Uuid::new_v4().to_string(),
            offer.missed_date,
            offer.prior_streak,
            offer.restore_to,
            offer.expires_at,
            now_iso(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other.to_string()),
    })
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_restore_floor(conn: &Connection) -> Result<Option<(NaiveDate, i64)>, String> {
    let date = get_setting(conn, FLOOR_DATE_KEY)?;
    let value = get_setting(conn, FLOOR_VALUE_KEY)?;
    match (date, value) {
        (Some(d), Some(v)) => {
            let parsed_date = NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok();
            let parsed_value = v.parse::<i64>().ok();
            match (parsed_date, parsed_value) {
                (Some(d), Some(v)) => Ok(Some((d, v))),
                _ => Ok(None),
            }
        }
        _ => Ok(None),
    }
}

fn set_restore_floor(conn: &Connection, date: NaiveDate, value: i64) -> Result<(), String> {
    set_setting(conn, FLOOR_DATE_KEY, &date.to_string())?;
    set_setting(conn, FLOOR_VALUE_KEY, &value.to_string())?;
    Ok(())
}

/// Compute the streak state and persist the side effects (auto-bridges, recovery
/// offer, auto-completion of a pending recovery once a catch-up day is logged).
/// Idempotent: repeated calls do not double-consume tokens or re-open offers.
fn compute_and_persist(conn: &Connection, now: NaiveDate) -> Result<StreakState, String> {
    // Wrap the read + all side-effecting writes (recovery completion, restore
    // floor, token consumption, recovery offer) in one transaction so a failure
    // mid-sequence can't leave partial state. Deref coercion lets the `&Connection`
    // helpers take `&tx`.
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let sessions = load_session_dates(&tx)?;
    let bridged = load_bridged_dates(&tx)?;
    let available = held_token_balance(&tx).map_err(|e| e.to_string())?;
    let mut pending = load_pending_recovery(&tx, now)?;
    let mut floor = load_restore_floor(&tx)?;

    // Auto-complete a pending recovery once the learner logs a catch-up session
    // today: honor the partial restore from today forward.
    if pending.is_some() && sessions.contains(&now) {
        let rec = pending.take().unwrap();
        tx.execute(
            "UPDATE streak_recovery SET status = 'completed', resolved_at = ?1 WHERE status = 'pending'",
            params![now_iso()],
        )
        .map_err(|e| e.to_string())?;
        set_restore_floor(&tx, now, rec.restore_to)?;
        floor = Some((now, rec.restore_to));
    }

    let comp = compute_streak_state(&sessions, &bridged, available, pending.as_ref(), floor, now);

    for d in &comp.new_bridges {
        insert_consumed(&tx, *d, now)?;
    }
    if let Some(offer) = &comp.offer_recovery {
        if pending.is_none() {
            insert_recovery(&tx, offer, now)?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(comp.state)
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// Full streak snapshot incl. freeze tokens, frozen (bridged) days, status, and
/// any pending recovery offer. Side-effecting but idempotent.
#[tauri::command]
pub fn get_streak_state(app: AppHandle) -> Result<StreakState, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().date_naive();
    compute_and_persist(&conn, now)
}

/// Returns a seed prompt for the catch-up session that restores a broken streak.
#[tauri::command]
pub fn start_streak_recovery(app: AppHandle) -> Result<String, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().date_naive();
    let rec = load_pending_recovery(&conn, now)?
        .ok_or_else(|| "No active recovery to start.".to_string())?;
    Ok(format!(
        "I missed a day and my {prior}-day study streak is at risk. Give me a focused \
         15-minute catch-up session to get back on track: a quick recap of what I should \
         reinforce this week, then a couple of active-recall drills. Completing this restores \
         my streak to {restore} days.",
        prior = rec.prior_streak,
        restore = rec.restore_to,
    ))
}

/// Mark the pending recovery completed and honor the partial restore from today.
/// Recompute and return the fresh streak state.
#[tauri::command]
pub fn complete_streak_recovery(app: AppHandle) -> Result<StreakState, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().date_naive();

    if let Some(rec) = load_pending_recovery(&conn, now)? {
        conn.execute(
            "UPDATE streak_recovery SET status = 'completed', resolved_at = ?1 WHERE status = 'pending'",
            params![now_iso()],
        )
        .map_err(|e| e.to_string())?;
        set_restore_floor(&conn, now, rec.restore_to)?;
    }

    compute_and_persist(&conn, now)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn no_floor() -> Option<(NaiveDate, i64)> {
        None
    }

    #[test]
    fn iso_week_start_lands_on_monday() {
        // 2026-06-07 is a Sunday; its ISO week starts Mon 2026-06-01.
        assert_eq!(iso_week_start(d("2026-06-07")), d("2026-06-01"));
        assert_eq!(iso_week_start(d("2026-06-01")), d("2026-06-01"));
        assert_eq!(iso_week_start(d("2026-06-03")), d("2026-06-01"));
        // 2026-06-08 is the next Monday.
        assert_eq!(iso_week_start(d("2026-06-08")), d("2026-06-08"));
    }

    #[test]
    fn contiguous_streak_counts_all_days() {
        let dates = vec![d("2026-06-05"), d("2026-06-06"), d("2026-06-07")];
        let c = compute_streak_state(&dates, &[], 0, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.current, 3);
        assert_eq!(c.state.best, 3);
        assert_eq!(c.state.status, "active");
        assert!(c.state.frozen_days.is_empty());
        assert!(c.new_bridges.is_empty());
    }

    #[test]
    fn streak_started_today() {
        let dates = vec![d("2026-06-07")];
        let c = compute_streak_state(&dates, &[], 1, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.current, 1);
        assert_eq!(c.state.status, "active");
    }

    #[test]
    fn missed_today_but_logged_yesterday_is_at_risk() {
        let dates = vec![d("2026-06-05"), d("2026-06-06")];
        let c = compute_streak_state(&dates, &[], 1, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.current, 2);
        assert_eq!(c.state.status, "at_risk");
        assert!(c.new_bridges.is_empty());
    }

    #[test]
    fn single_missed_day_bridged_by_token() {
        // Logged 4,5 then missed 6 (yesterday); today (7) not logged. Token bridges 6.
        let dates = vec![d("2026-06-04"), d("2026-06-05")];
        let c = compute_streak_state(&dates, &[], 1, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.status, "at_risk");
        assert_eq!(c.state.current, 2); // 4 and 5 counted; 6 bridged (continuity)
        assert_eq!(c.state.freeze_tokens, 0); // token spent
        assert_eq!(c.new_bridges, vec![d("2026-06-06")]);
        assert_eq!(c.state.frozen_days, vec!["2026-06-06".to_string()]);
        assert!(c.state.freeze_used_this_week);
    }

    #[test]
    fn interior_gap_bridged_while_active() {
        // Logged 5 and 7, today=7; day 6 missing → bridged by token.
        let dates = vec![d("2026-06-05"), d("2026-06-07")];
        let c = compute_streak_state(&dates, &[], 1, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.status, "active");
        assert_eq!(c.state.current, 2); // 7 and 5 counted, 6 bridged
        assert_eq!(c.new_bridges, vec![d("2026-06-06")]);
    }

    #[test]
    fn missed_day_with_no_token_offers_recovery() {
        let dates = vec![d("2026-06-04"), d("2026-06-05")];
        let c = compute_streak_state(&dates, &[], 0, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.status, "recovery");
        assert_eq!(c.state.current, 0);
        let rec = c.state.recovery.expect("recovery offer");
        // prior streak was 2 → ceil(2 * 0.5) = 1
        assert_eq!(rec.prior_streak, 2);
        assert_eq!(rec.restore_to, 1);
        assert_eq!(rec.missed_date, "2026-06-06");
        assert!(c.offer_recovery.is_some());
    }

    #[test]
    fn recovery_restore_uses_ceil_and_floor_of_one() {
        // prior 5 → ceil(2.5) = 3
        let r = compute_recovery_offer(5, 0.5, d("2026-06-06"), d("2026-06-07"), 1);
        assert_eq!(r.restore_to, 3);
        // prior 1 → ceil(0.5)=1, floored at 1
        let r2 = compute_recovery_offer(1, 0.5, d("2026-06-06"), d("2026-06-07"), 1);
        assert_eq!(r2.restore_to, 1);
        // prior 0 → max(1, 0) = 1
        let r3 = compute_recovery_offer(0, 0.5, d("2026-06-06"), d("2026-06-07"), 1);
        assert_eq!(r3.restore_to, 1);
        assert_eq!(r.expires_at, "2026-06-08");
    }

    #[test]
    fn multi_day_gap_breaks_hard() {
        // Last activity 2026-06-03; today 06-07 → 4-day gap, no recovery.
        let dates = vec![d("2026-06-02"), d("2026-06-03")];
        let c = compute_streak_state(&dates, &[], 1, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.status, "broken");
        assert_eq!(c.state.current, 0);
        assert!(c.state.recovery.is_none());
        assert!(c.offer_recovery.is_none());
    }

    #[test]
    fn already_bridged_day_needs_no_token() {
        // 6 was bridged previously (in `bridged`), 0 tokens now; streak survives.
        let dates = vec![d("2026-06-04"), d("2026-06-05"), d("2026-06-07")];
        let bridged = vec![d("2026-06-06")];
        let c = compute_streak_state(&dates, &bridged, 0, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.status, "active");
        assert_eq!(c.state.current, 3); // 7,5,4 counted; 6 bridged continuity
        assert!(c.new_bridges.is_empty()); // no new consumption
        assert_eq!(c.state.frozen_days, vec!["2026-06-06".to_string()]);
    }

    #[test]
    fn restore_floor_collapses_history_into_partial_value() {
        // Catch-up logged today (07); floor says streak = 3 as of 07.
        let dates = vec![d("2026-06-07")];
        let floor = Some((d("2026-06-07"), 3));
        let c = compute_streak_state(&dates, &[], 0, None, floor, d("2026-06-07"));
        assert_eq!(c.state.current, 3);
        assert_eq!(c.state.status, "active");
    }

    #[test]
    fn restore_floor_anchors_streak_without_a_session_that_day() {
        // Recovery completed today (07) WITHOUT logging a fresh session: prior
        // sessions 03,04,05, missed 06, floor pins streak to 2 as of 07.
        let dates = vec![d("2026-06-03"), d("2026-06-04"), d("2026-06-05")];
        let floor = Some((d("2026-06-07"), 2));
        let c = compute_streak_state(&dates, &[], 0, None, floor, d("2026-06-07"));
        assert_eq!(c.state.status, "active");
        assert_eq!(c.state.current, 2); // restored to the partial value, no churn
        assert!(c.state.recovery.is_none());
        assert!(c.offer_recovery.is_none()); // does NOT re-open a recovery offer
    }

    #[test]
    fn restore_floor_continues_forward_after_restore() {
        // Floored to 2 on 07 (no session), then a real session on 08 extends it.
        let dates = vec![d("2026-06-03"), d("2026-06-04"), d("2026-06-05"), d("2026-06-08")];
        let floor = Some((d("2026-06-07"), 2));
        let c = compute_streak_state(&dates, &[], 0, None, floor, d("2026-06-08"));
        assert_eq!(c.state.status, "active");
        assert_eq!(c.state.current, 3); // 08 (+1) on top of the floor of 2
    }

    #[test]
    fn empty_history_is_broken_with_zero() {
        let c = compute_streak_state(&[], &[], 1, None, no_floor(), d("2026-06-07"));
        assert_eq!(c.state.current, 0);
        assert_eq!(c.state.best, 0);
        assert_eq!(c.state.status, "broken");
    }

    // ── DB-touching helpers ─────────────────────────────────────────────────

    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (id TEXT PRIMARY KEY, date TEXT NOT NULL, pillar TEXT,
                hours REAL, energy INTEGER, note TEXT, created_at TEXT);
             CREATE TABLE conversations (id TEXT PRIMARY KEY, pillar TEXT, title TEXT,
                created_at TEXT, updated_at TEXT);
             CREATE TABLE conversation_depth (conversation_id TEXT PRIMARY KEY, score INTEGER,
                rationale TEXT, dimensions TEXT, model TEXT, message_count INTEGER,
                created_at TEXT, updated_at TEXT);
             CREATE TABLE streak_freezes (id TEXT PRIMARY KEY, kind TEXT, event_date TEXT,
                week_start TEXT, bridged_date TEXT, note TEXT, created_at TEXT);
             CREATE TABLE streak_recovery (id TEXT PRIMARY KEY, missed_date TEXT,
                prior_streak INTEGER, restore_to INTEGER, status TEXT, expires_at TEXT,
                created_at TEXT, resolved_at TEXT);
             CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);",
        )
        .unwrap();
        conn
    }

    fn add_deep_conversation(conn: &Connection, id: &str, score: i64, updated_at: &str) {
        conn.execute(
            "INSERT INTO conversations (id, pillar, title, created_at, updated_at)
             VALUES (?1, 'llm', 'T', ?2, ?2)",
            params![id, updated_at],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversation_depth
                (conversation_id, score, rationale, dimensions, model, message_count, created_at, updated_at)
             VALUES (?1, ?2, '', '[]', NULL, 5, ?3, ?3)",
            params![id, score, updated_at],
        )
        .unwrap();
    }

    #[test]
    fn awards_one_token_per_week_for_deep_session() {
        let conn = db();
        let now = d("2026-06-03"); // Wednesday, week starts 06-01
        add_deep_conversation(&conn, "c1", 4, "2026-06-02T10:00:00+00:00");

        assert!(maybe_award_freeze_token(&conn, now).unwrap());
        assert_eq!(held_token_balance(&conn).unwrap(), 1);

        // Second deep session same week → no extra token (weekly cap + max held).
        add_deep_conversation(&conn, "c2", 5, "2026-06-03T11:00:00+00:00");
        assert!(!maybe_award_freeze_token(&conn, now).unwrap());
        assert_eq!(held_token_balance(&conn).unwrap(), 1);
    }

    #[test]
    fn shallow_session_earns_no_token() {
        let conn = db();
        let now = d("2026-06-03");
        add_deep_conversation(&conn, "c1", 3, "2026-06-02T10:00:00+00:00"); // below threshold
        assert!(!maybe_award_freeze_token(&conn, now).unwrap());
        assert_eq!(held_token_balance(&conn).unwrap(), 0);
    }

    #[test]
    fn next_week_can_earn_again_after_spending() {
        let conn = db();
        // Week 1 earn.
        add_deep_conversation(&conn, "c1", 4, "2026-06-02T10:00:00+00:00");
        assert!(maybe_award_freeze_token(&conn, d("2026-06-03")).unwrap());
        // Spend it (consumed row).
        insert_consumed(&conn, d("2026-06-04"), d("2026-06-05")).unwrap();
        assert_eq!(held_token_balance(&conn).unwrap(), 0);
        // Week 2 deep session → can earn again.
        add_deep_conversation(&conn, "c2", 5, "2026-06-09T10:00:00+00:00");
        assert!(maybe_award_freeze_token(&conn, d("2026-06-10")).unwrap());
        assert_eq!(held_token_balance(&conn).unwrap(), 1);
    }

    fn log_session(conn: &Connection, date: &str) {
        conn.execute(
            "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at)
             VALUES (?1, ?2, 'llm', 1.0, 3, '', ?3)",
            params![Uuid::new_v4().to_string(), date, format!("{date}T09:00:00+00:00")],
        )
        .unwrap();
    }

    #[test]
    fn get_streak_state_is_idempotent_on_repeated_calls() {
        let conn = db();
        // Logged 04,05; missed 06; today 07; one token held.
        log_session(&conn, "2026-06-04");
        log_session(&conn, "2026-06-05");
        conn.execute(
            "INSERT INTO streak_freezes (id, kind, event_date, week_start, bridged_date, note, created_at)
             VALUES ('e1', 'earned', '2026-06-01', '2026-06-01', NULL, '', '2026-06-01T00:00:00+00:00')",
            [],
        )
        .unwrap();

        let now = d("2026-06-07");
        let s1 = compute_and_persist(&conn, now).unwrap();
        assert_eq!(s1.current, 2);
        assert_eq!(s1.freeze_tokens, 0);
        assert_eq!(s1.frozen_days, vec!["2026-06-06".to_string()]);

        // Call again — must not re-consume or change counts.
        let s2 = compute_and_persist(&conn, now).unwrap();
        assert_eq!(s2.current, 2);
        assert_eq!(s2.freeze_tokens, 0);
        assert_eq!(s2.frozen_days, vec!["2026-06-06".to_string()]);

        let consumed: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM streak_freezes WHERE kind = 'consumed'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(consumed, 1);
    }

    #[test]
    fn recovery_persists_then_completes_and_restores() {
        let conn = db();
        // Logged 03,04,05 (prior streak 3); missed 06; today 07; no token.
        log_session(&conn, "2026-06-03");
        log_session(&conn, "2026-06-04");
        log_session(&conn, "2026-06-05");
        let now = d("2026-06-07");

        let s1 = compute_and_persist(&conn, now).unwrap();
        assert_eq!(s1.status, "recovery");
        let rec = s1.recovery.unwrap();
        assert_eq!(rec.prior_streak, 3);
        assert_eq!(rec.restore_to, 2); // ceil(3*0.5)=2

        // Exactly one pending recovery row persisted.
        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM streak_recovery WHERE status = 'pending'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1);

        // Calling again does not open a second offer.
        let _ = compute_and_persist(&conn, now).unwrap();
        let pending2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM streak_recovery WHERE status = 'pending'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending2, 1);

        // Learner logs a catch-up session today → auto-complete + restore.
        log_session(&conn, "2026-06-07");
        let s2 = compute_and_persist(&conn, now).unwrap();
        assert_eq!(s2.status, "active");
        assert_eq!(s2.current, 2); // restored to partial value
        assert!(s2.recovery.is_none());
    }

    #[test]
    fn complete_recovery_restores_without_a_logged_session() {
        let conn = db();
        // Prior streak 3 (03,04,05); missed 06; today 07; no token.
        log_session(&conn, "2026-06-03");
        log_session(&conn, "2026-06-04");
        log_session(&conn, "2026-06-05");
        let now = d("2026-06-07");

        // Open the recovery offer.
        let s1 = compute_and_persist(&conn, now).unwrap();
        assert_eq!(s1.status, "recovery");
        let rec = s1.recovery.unwrap();
        assert_eq!(rec.restore_to, 2);

        // Simulate `complete_streak_recovery` WITHOUT logging a session today:
        // mark the pending recovery completed and pin the restore floor at today.
        conn.execute(
            "UPDATE streak_recovery SET status = 'completed', resolved_at = ?1 WHERE status = 'pending'",
            params![now_iso()],
        )
        .unwrap();
        set_restore_floor(&conn, now, rec.restore_to).unwrap();

        // Recompute: streak restored even though no session exists for today,
        // and no fresh recovery offer is churned out.
        let s2 = compute_and_persist(&conn, now).unwrap();
        assert_eq!(s2.status, "active");
        assert_eq!(s2.current, 2);
        assert!(s2.recovery.is_none());

        let pending: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM streak_recovery WHERE status = 'pending'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending, 0);
    }
}
