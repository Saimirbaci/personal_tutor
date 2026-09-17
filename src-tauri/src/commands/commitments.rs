use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::db::get_connection;

/// Allowed lifecycle states. Kept as plain strings (not an enum) so the column
/// round-trips losslessly; `is_valid_status` is the single gate against drift
/// with the TypeScript `CommitmentStatus` union.
const VALID_STATUSES: [&str; 4] = ["active", "completed", "missed", "rescheduled"];

const STATUS_ACTIVE: &str = "active";
const STATUS_MISSED: &str = "missed";

/// A learning commitment ("I will complete X by Friday").
/// Mirrors the TypeScript `Commitment` interface (camelCase).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Commitment {
    pub id: String,
    pub commitment: String,
    pub pillar: String,
    /// Due date as a local calendar day, YYYY-MM-DD.
    pub due_date: String,
    pub status: String,
    pub created_at: String,
    /// Set once the evening-before reminder has fired (dedupe marker).
    pub reminder_sent_at: Option<String>,
    /// Synthetic marker when the user opted into a calendar focus block.
    pub calendar_event_id: Option<String>,
}

fn is_valid_status(status: &str) -> bool {
    VALID_STATUSES.contains(&status)
}

fn parse_due_date(raw: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(raw.trim(), "%Y-%m-%d")
        .map_err(|_| "Invalid due date — expected YYYY-MM-DD.".to_string())
}

// ── Pure date logic (unit-testable, no AppHandle/SQLite) ──────────────────────

/// Commitments that should get the evening-before nudge: active, never
/// reminded, and due on the calendar day after `today` (the reminder window is
/// exactly the day prior to the due date's local midnight).
fn needs_reminder(rows: Vec<Commitment>, today: NaiveDate) -> Vec<Commitment> {
    let tomorrow = today + Duration::days(1);
    rows.into_iter()
        .filter(|c| c.status == STATUS_ACTIVE && c.reminder_sent_at.is_none())
        .filter(|c| parse_due_date(&c.due_date).map(|d| d == tomorrow).unwrap_or(false))
        .collect()
}

/// Ids of active commitments whose due date has passed (strictly before
/// `today` — the due day itself still counts as in-progress).
fn classify_missed(rows: &[Commitment], today: NaiveDate) -> Vec<String> {
    rows.iter()
        .filter(|c| c.status == STATUS_ACTIVE)
        .filter(|c| parse_due_date(&c.due_date).map(|d| d < today).unwrap_or(false))
        .map(|c| c.id.clone())
        .collect()
}

// ── Connection-level helpers (shared by commands and tests) ───────────────────

fn row_to_commitment(row: &rusqlite::Row<'_>) -> rusqlite::Result<Commitment> {
    Ok(Commitment {
        id: row.get(0)?,
        commitment: row.get(1)?,
        pillar: row.get(2)?,
        due_date: row.get(3)?,
        status: row.get(4)?,
        created_at: row.get(5)?,
        reminder_sent_at: row.get(6)?,
        calendar_event_id: row.get(7)?,
    })
}

const SELECT_COLS: &str =
    "id, commitment, pillar, due_date, status, created_at, reminder_sent_at, calendar_event_id";

fn fetch_commitment(conn: &Connection, id: &str) -> Result<Commitment, String> {
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM commitments WHERE id = ?1"),
        params![id],
        row_to_commitment,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Commitment not found.".to_string())
}

fn fetch_commitments(
    conn: &Connection,
    status_filter: Option<&str>,
) -> Result<Vec<Commitment>, String> {
    let sql = match status_filter {
        Some(_) => format!(
            "SELECT {SELECT_COLS} FROM commitments WHERE status = ?1 ORDER BY due_date ASC, created_at ASC"
        ),
        None => format!("SELECT {SELECT_COLS} FROM commitments ORDER BY due_date ASC, created_at ASC"),
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let items = match status_filter {
        Some(status) => stmt
            .query_map(params![status], row_to_commitment)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect(),
        None => stmt
            .query_map([], row_to_commitment)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect(),
    };
    Ok(items)
}

fn insert_commitment(
    conn: &Connection,
    commitment: &str,
    pillar: &str,
    due_date: &str,
    calendar_event_id: Option<&str>,
    now_rfc: &str,
) -> Result<Commitment, String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO commitments
            (id, commitment, pillar, due_date, status, created_at, reminder_sent_at, calendar_event_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)",
        params![id, commitment, pillar, due_date, STATUS_ACTIVE, now_rfc, calendar_event_id],
    )
    .map_err(|e| e.to_string())?;
    fetch_commitment(conn, &id)
}

/// Flips past-due active commitments to `missed` and returns every missed row,
/// most recently due first.
fn sweep_missed(conn: &Connection, today: NaiveDate) -> Result<Vec<Commitment>, String> {
    let active = fetch_commitments(conn, Some(STATUS_ACTIVE))?;
    for id in classify_missed(&active, today) {
        conn.execute(
            "UPDATE commitments SET status = ?2 WHERE id = ?1",
            params![id, STATUS_MISSED],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut missed = fetch_commitments(conn, Some(STATUS_MISSED))?;
    missed.sort_by(|a, b| b.due_date.cmp(&a.due_date));
    Ok(missed)
}

/// Reactivates a commitment with a new due date, re-arming its reminder.
fn reschedule(conn: &Connection, id: &str, new_due_date: &str) -> Result<Commitment, String> {
    let changed = conn
        .execute(
            "UPDATE commitments
             SET due_date = ?2, status = ?3, reminder_sent_at = NULL
             WHERE id = ?1",
            params![id, new_due_date, STATUS_ACTIVE],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Commitment not found.".to_string());
    }
    fetch_commitment(conn, id)
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

/// Creates an active commitment. `link_calendar` records a synthetic marker in
/// `calendar_event_id`; the actual Google Calendar deep link is built and
/// opened by the frontend (no OAuth, nothing stored beyond the marker).
#[tauri::command]
pub fn create_commitment(
    app: AppHandle,
    commitment: String,
    pillar: String,
    due_date: String,
    link_calendar: Option<bool>,
) -> Result<Commitment, String> {
    let text = commitment.trim();
    if text.is_empty() {
        return Err("Commitment text cannot be empty.".to_string());
    }
    if pillar.trim().is_empty() {
        return Err("Pick a pillar for this commitment.".to_string());
    }
    let due = parse_due_date(&due_date)?;

    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let marker = link_calendar
        .unwrap_or(false)
        .then(|| format!("gcal-template:{due}"));
    insert_commitment(
        &conn,
        text,
        pillar.trim(),
        &due.format("%Y-%m-%d").to_string(),
        marker.as_deref(),
        &Local::now().to_rfc3339(),
    )
}

/// Lists commitments, optionally filtered by status, soonest due first.
#[tauri::command]
pub fn list_commitments(
    app: AppHandle,
    status_filter: Option<String>,
) -> Result<Vec<Commitment>, String> {
    if let Some(s) = status_filter.as_deref() {
        if !is_valid_status(s) {
            return Err("Unknown commitment status.".to_string());
        }
    }
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    fetch_commitments(&conn, status_filter.as_deref())
}

/// Updates a commitment's lifecycle status (e.g. marking it completed).
#[tauri::command]
pub fn update_commitment_status(
    app: AppHandle,
    id: String,
    status: String,
) -> Result<Commitment, String> {
    if !is_valid_status(&status) {
        return Err("Unknown commitment status.".to_string());
    }
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let changed = conn
        .execute(
            "UPDATE commitments SET status = ?2 WHERE id = ?1",
            params![id, status],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Commitment not found.".to_string());
    }
    fetch_commitment(&conn, &id)
}

/// Deletes a commitment outright.
#[tauri::command]
pub fn delete_commitment(app: AppHandle, id: String) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM commitments WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Active commitments due tomorrow that haven't been reminded yet — the
/// evening-before nudge candidates. The frontend poll fires the OS
/// notification and then calls `mark_commitment_reminded` to dedupe.
#[tauri::command]
pub fn get_due_reminders(app: AppHandle) -> Result<Vec<Commitment>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let rows = fetch_commitments(&conn, Some(STATUS_ACTIVE))?;
    Ok(needs_reminder(rows, Local::now().date_naive()))
}

/// Records that the evening-before reminder fired, suppressing repeats until
/// the commitment is rescheduled (which clears the marker).
#[tauri::command]
pub fn mark_commitment_reminded(app: AppHandle, id: String) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE commitments SET reminder_sent_at = ?2 WHERE id = ?1",
        params![id, Local::now().to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sweeps past-due active commitments into `missed` and returns all missed
/// ones (most recently due first) for the Weekly Digest surface.
#[tauri::command]
pub fn get_missed_commitments(app: AppHandle) -> Result<Vec<Commitment>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    sweep_missed(&conn, Local::now().date_naive())
}

/// Gives a commitment a fresh due date: status back to active and the
/// reminder re-armed. No-judgment by design — rescheduling is a first-class
/// action, not a failure path.
#[tauri::command]
pub fn reschedule_commitment(
    app: AppHandle,
    id: String,
    new_due_date: String,
) -> Result<Commitment, String> {
    let due = parse_due_date(&new_due_date)?;
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    reschedule(&conn, &id, &due.format("%Y-%m-%d").to_string())
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE commitments (
                id                TEXT PRIMARY KEY,
                commitment        TEXT NOT NULL,
                pillar            TEXT NOT NULL,
                due_date          TEXT NOT NULL,
                status            TEXT NOT NULL DEFAULT 'active',
                created_at        TEXT NOT NULL,
                reminder_sent_at  TEXT,
                calendar_event_id TEXT
            );",
        )
        .unwrap();
        conn
    }

    fn make(id: &str, due: &str, status: &str, reminded: Option<&str>) -> Commitment {
        Commitment {
            id: id.to_string(),
            commitment: format!("Commitment {id}"),
            pillar: "llm".to_string(),
            due_date: due.to_string(),
            status: status.to_string(),
            created_at: "2026-06-01T08:00:00+02:00".to_string(),
            reminder_sent_at: reminded.map(|s| s.to_string()),
            calendar_event_id: None,
        }
    }

    fn day(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    // ── needs_reminder window ────────────────────────────────────────────────

    #[test]
    fn reminder_fires_only_the_day_before_due() {
        let today = day(2026, 6, 11);
        let rows = vec![
            make("due-tomorrow", "2026-06-12", "active", None),
            make("due-today", "2026-06-11", "active", None),
            make("due-day-after", "2026-06-13", "active", None),
        ];
        let due = needs_reminder(rows, today);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].id, "due-tomorrow");
    }

    #[test]
    fn reminder_dedupes_already_reminded_and_skips_inactive() {
        let today = day(2026, 6, 11);
        let rows = vec![
            make("already", "2026-06-12", "active", Some("2026-06-11T18:00:00+02:00")),
            make("completed", "2026-06-12", "completed", None),
            make("missed", "2026-06-12", "missed", None),
        ];
        assert!(needs_reminder(rows, today).is_empty());
    }

    #[test]
    fn reminder_tolerates_malformed_due_date() {
        let today = day(2026, 6, 11);
        let rows = vec![make("bad", "not-a-date", "active", None)];
        assert!(needs_reminder(rows, today).is_empty());
    }

    // ── classify_missed ──────────────────────────────────────────────────────

    #[test]
    fn missed_is_strictly_past_due_and_active_only() {
        let today = day(2026, 6, 11);
        let rows = vec![
            make("past", "2026-06-10", "active", None),
            make("due-today", "2026-06-11", "active", None),
            make("future", "2026-06-12", "active", None),
            make("done-past", "2026-06-01", "completed", None),
        ];
        assert_eq!(classify_missed(&rows, today), vec!["past".to_string()]);
    }

    // ── DB roundtrip ─────────────────────────────────────────────────────────

    #[test]
    fn create_list_update_roundtrip() {
        let conn = setup();
        let created = insert_commitment(
            &conn,
            "Finish LLM week-3 curriculum",
            "llm",
            "2026-06-12",
            Some("gcal-template:2026-06-12"),
            "2026-06-11T08:00:00+02:00",
        )
        .unwrap();
        assert_eq!(created.status, "active");
        assert_eq!(created.calendar_event_id.as_deref(), Some("gcal-template:2026-06-12"));

        let all = fetch_commitments(&conn, None).unwrap();
        assert_eq!(all.len(), 1);

        conn.execute(
            "UPDATE commitments SET status = 'completed' WHERE id = ?1",
            params![created.id],
        )
        .unwrap();
        let active = fetch_commitments(&conn, Some("active")).unwrap();
        assert!(active.is_empty());
        let completed = fetch_commitments(&conn, Some("completed")).unwrap();
        assert_eq!(completed.len(), 1);
    }

    #[test]
    fn list_orders_by_due_date_ascending() {
        let conn = setup();
        insert_commitment(&conn, "later", "llm", "2026-06-20", None, "t").unwrap();
        insert_commitment(&conn, "sooner", "sales", "2026-06-12", None, "t").unwrap();
        let all = fetch_commitments(&conn, None).unwrap();
        assert_eq!(all[0].commitment, "sooner");
        assert_eq!(all[1].commitment, "later");
    }

    #[test]
    fn sweep_marks_past_due_active_as_missed() {
        let conn = setup();
        let past = insert_commitment(&conn, "past", "llm", "2026-06-09", None, "t").unwrap();
        insert_commitment(&conn, "future", "llm", "2026-06-20", None, "t").unwrap();

        let missed = sweep_missed(&conn, day(2026, 6, 11)).unwrap();
        assert_eq!(missed.len(), 1);
        assert_eq!(missed[0].id, past.id);
        assert_eq!(missed[0].status, "missed");

        // Idempotent: re-sweeping returns the same set, no flip-flop.
        let again = sweep_missed(&conn, day(2026, 6, 11)).unwrap();
        assert_eq!(again.len(), 1);
        assert_eq!(fetch_commitments(&conn, Some("active")).unwrap().len(), 1);
    }

    #[test]
    fn reschedule_reactivates_and_rearms_reminder() {
        let conn = setup();
        let c = insert_commitment(&conn, "drill", "voice", "2026-06-09", None, "t").unwrap();
        conn.execute(
            "UPDATE commitments SET status = 'missed', reminder_sent_at = '2026-06-08T18:00:00+02:00'
             WHERE id = ?1",
            params![c.id],
        )
        .unwrap();

        let updated = reschedule(&conn, &c.id, "2026-06-15").unwrap();
        assert_eq!(updated.status, "active");
        assert_eq!(updated.due_date, "2026-06-15");
        assert!(updated.reminder_sent_at.is_none());

        // And it is once again a reminder candidate the evening before.
        let due = needs_reminder(vec![updated], day(2026, 6, 14));
        assert_eq!(due.len(), 1);
    }

    #[test]
    fn reschedule_unknown_id_errors() {
        let conn = setup();
        assert!(reschedule(&conn, "nope", "2026-06-15").is_err());
    }

    #[test]
    fn status_validation_matches_ts_union() {
        for s in ["active", "completed", "missed", "rescheduled"] {
            assert!(is_valid_status(s));
        }
        assert!(!is_valid_status("proposed"));
        assert!(!is_valid_status(""));
    }
}
