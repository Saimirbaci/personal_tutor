use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

/// A single question shown in the pre-session activation quiz.
///
/// Questions come from one of two sources (see `source`):
/// - `"review-queue"` — derived from an existing `review_items` row. These carry an
///   `item_id`/`item_type` so the graded result flows back into SM-2, and are presented
///   as self-graded active-recall prompts (no `options`).
/// - `"session-summary"` — generated from the previous session's summary text. These may
///   be multiple-choice (carry `options` + `correct_index`) and have no pre-existing
///   `item_id` (the frontend derives one deterministically on first attempt).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivationQuestion {
    /// Stable identifier unique within a single quiz payload.
    pub id: String,
    /// Existing SM-2 `review_items.item_id`, when sourced from the queue.
    pub item_id: Option<String>,
    /// `"flashcard"` | `"quiz"` — mirrors `ReviewItemType`.
    pub item_type: String,
    pub pillar: Option<String>,
    /// The prompt the learner must recall / answer.
    pub prompt: String,
    /// Multiple-choice options, when available (`session-summary` source).
    pub options: Option<Vec<String>>,
    /// Index into `options` of the correct answer, when available.
    pub correct_index: Option<i32>,
    /// Reference answer for self-graded recall, when available.
    pub answer: Option<String>,
    /// `"review-queue"` | `"session-summary"`.
    pub source: String,
}

/// The full activation-quiz payload returned to the frontend.
///
/// An empty `questions` vec is a valid, non-error result — the frontend skips the
/// interstitial and proceeds straight to the tutor when there is nothing to recall.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivationQuiz {
    pub pillar: Option<String>,
    pub source_session_id: Option<String>,
    pub questions: Vec<ActivationQuestion>,
}

const DEFAULT_LIMIT: i32 = 5;
const MIN_LIMIT: i32 = 3;
const MAX_LIMIT: i32 = 5;

/// Build activation questions purely from the spaced-repetition queue.
///
/// Items for the given `pillar` are returned ordered by `next_due ASC`, so the most
/// overdue (and therefore most at-risk) material surfaces first. When `pillar` is `None`,
/// items across all pillars are considered. Because `review_items.content` stores only the
/// prompt text, queue questions are presented as self-graded recall prompts (no options).
fn build_questions_from_queue(
    conn: &Connection,
    pillar: Option<&str>,
    limit: i32,
) -> Result<Vec<ActivationQuestion>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT item_id, item_type, pillar, content
             FROM review_items
             WHERE (?1 IS NULL OR pillar = ?1)
             ORDER BY next_due ASC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let questions = stmt
        .query_map(rusqlite::params![pillar, limit], |row| {
            let item_id: String = row.get(0)?;
            let item_type: String = row.get(1)?;
            let pillar: Option<String> = row.get(2)?;
            let content: String = row.get(3)?;
            Ok(ActivationQuestion {
                id: item_id.clone(),
                item_id: Some(item_id),
                item_type,
                pillar,
                prompt: content,
                options: None,
                correct_index: None,
                answer: None,
                source: "review-queue".to_string(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(questions)
}

/// Resolve the "previous session" to base the activation quiz on.
///
/// Returns `(session_id, pillar, note)` for the most recent session row, optionally
/// constrained to a pillar. Returns `None` when no sessions have been logged yet.
fn resolve_previous_session(
    conn: &Connection,
    pillar: Option<&str>,
) -> Option<(String, String, String)> {
    conn.query_row(
        "SELECT id, pillar, note
         FROM sessions
         WHERE (?1 IS NULL OR pillar = ?1)
         ORDER BY created_at DESC
         LIMIT 1",
        rusqlite::params![pillar],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .ok()
}

/// Assemble a 3–5 question pre-session activation quiz on the previous session's material.
///
/// Resolves the most recent session (optionally for `pillar`), then draws active-recall
/// questions from the spaced-repetition queue for that pillar. Returns an empty
/// `questions` vec (not an error) when there is nothing to recall, so the frontend can
/// skip the interstitial gracefully. `limit` is clamped to the 3–5 range.
#[tauri::command]
pub fn get_activation_quiz(
    app: AppHandle,
    pillar: Option<String>,
    limit: Option<i32>,
) -> Result<ActivationQuiz, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(DEFAULT_LIMIT).clamp(MIN_LIMIT, MAX_LIMIT);

    // Resolve which session's material to quiz on. Fall back to the requested pillar
    // even when no session row exists yet, so freshly-seeded review items still surface.
    let previous = resolve_previous_session(&conn, pillar.as_deref());
    let resolved_pillar = previous
        .as_ref()
        .map(|(_, p, _)| p.clone())
        .or_else(|| pillar.clone());
    let source_session_id = previous.as_ref().map(|(id, _, _)| id.clone());

    let questions =
        build_questions_from_queue(&conn, resolved_pillar.as_deref(), limit)?;

    Ok(ActivationQuiz {
        pillar: resolved_pillar,
        source_session_id,
        questions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE review_items (
                item_id       TEXT PRIMARY KEY,
                item_type     TEXT NOT NULL,
                pillar        TEXT,
                content       TEXT NOT NULL,
                ease_factor   REAL NOT NULL DEFAULT 2.5,
                interval_days REAL NOT NULL DEFAULT 0,
                repetitions   INTEGER NOT NULL DEFAULT 0,
                last_quality  INTEGER,
                last_seen     TEXT NOT NULL,
                next_due      TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE TABLE sessions (
                id          TEXT PRIMARY KEY,
                date        TEXT NOT NULL,
                pillar      TEXT NOT NULL,
                hours       REAL NOT NULL,
                energy      INTEGER NOT NULL,
                note        TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn insert_item(conn: &Connection, item_id: &str, pillar: &str, content: &str, next_due: &str) {
        conn.execute(
            "INSERT INTO review_items
             (item_id, item_type, pillar, content, ease_factor, interval_days,
              repetitions, last_quality, last_seen, next_due, created_at)
             VALUES (?1, 'flashcard', ?2, ?3, 2.5, 1.0, 1, 4, '2026-05-01', ?4, '2026-05-01')",
            rusqlite::params![item_id, pillar, content, next_due],
        )
        .unwrap();
    }

    #[test]
    fn queue_questions_respect_limit() {
        let conn = setup_db();
        for i in 0..10 {
            insert_item(&conn, &format!("id{i}"), "llm", &format!("Q{i}"), "2026-05-02");
        }
        let qs = build_questions_from_queue(&conn, Some("llm"), 5).unwrap();
        assert_eq!(qs.len(), 5);
    }

    #[test]
    fn queue_questions_ordered_by_next_due() {
        let conn = setup_db();
        insert_item(&conn, "late", "llm", "Late", "2026-06-10");
        insert_item(&conn, "early", "llm", "Early", "2026-05-02");
        insert_item(&conn, "mid", "llm", "Mid", "2026-05-20");
        let qs = build_questions_from_queue(&conn, Some("llm"), 5).unwrap();
        assert_eq!(qs[0].prompt, "Early");
        assert_eq!(qs[1].prompt, "Mid");
        assert_eq!(qs[2].prompt, "Late");
    }

    #[test]
    fn queue_questions_filter_by_pillar() {
        let conn = setup_db();
        insert_item(&conn, "a", "llm", "LLM Q", "2026-05-02");
        insert_item(&conn, "b", "sales", "Sales Q", "2026-05-02");
        let qs = build_questions_from_queue(&conn, Some("llm"), 5).unwrap();
        assert_eq!(qs.len(), 1);
        assert_eq!(qs[0].prompt, "LLM Q");
        assert_eq!(qs[0].item_id.as_deref(), Some("a"));
        assert_eq!(qs[0].source, "review-queue");
    }

    #[test]
    fn queue_empty_when_no_items() {
        let conn = setup_db();
        let qs = build_questions_from_queue(&conn, Some("llm"), 5).unwrap();
        assert!(qs.is_empty());
    }

    #[test]
    fn previous_session_resolves_most_recent() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at)
             VALUES ('old', '2026-05-01', 'llm', 1.0, 4, 'first', '2026-05-01T09:00:00Z'),
                    ('new', '2026-05-02', 'sales', 1.0, 4, 'latest', '2026-05-02T09:00:00Z')",
            [],
        )
        .unwrap();
        let (id, pillar, note) = resolve_previous_session(&conn, None).unwrap();
        assert_eq!(id, "new");
        assert_eq!(pillar, "sales");
        assert_eq!(note, "latest");
    }

    #[test]
    fn previous_session_constrained_to_pillar() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at)
             VALUES ('old', '2026-05-01', 'llm', 1.0, 4, 'llm-note', '2026-05-01T09:00:00Z'),
                    ('new', '2026-05-02', 'sales', 1.0, 4, 'sales-note', '2026-05-02T09:00:00Z')",
            [],
        )
        .unwrap();
        let (id, _, _) = resolve_previous_session(&conn, Some("llm")).unwrap();
        assert_eq!(id, "old");
    }

    #[test]
    fn previous_session_none_when_empty() {
        let conn = setup_db();
        assert!(resolve_previous_session(&conn, None).is_none());
    }
}
