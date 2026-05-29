use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::db::get_connection;

// ── Serialisable types returned to / received from the frontend ────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlaggedItem {
    #[serde(rename = "type")]
    pub item_type: String,
    pub pillar: Option<String>,
    pub question: String,
    #[serde(default)]
    pub review_item_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummaryRow {
    pub conversation_id: String,
    pub takeaways: Vec<String>,
    pub reflection: String,
    pub flagged_items: Vec<FlaggedItem>,
    pub model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    /// Joined from the conversations table for list rendering.
    pub conversation_title: Option<String>,
    pub conversation_pillar: Option<String>,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn now_iso() -> String {
    Local::now().to_rfc3339()
}

/// Stable djb2 hash — byte-for-byte mirror of `stableHash` in src/hooks/useReview.ts.
/// Iterates UTF-16 code units (matching JS `charCodeAt`) and wraps as i32.
fn stable_hash(input: &str) -> String {
    let mut h: i32 = 5381;
    for u in input.encode_utf16() {
        // ((h << 5) + h + code) | 0  — i32 wrapping arithmetic
        h = h.wrapping_shl(5).wrapping_add(h).wrapping_add(u as i32);
    }
    to_base36(h as u32)
}

fn to_base36(mut n: u32) -> String {
    if n == 0 {
        return "0".to_string();
    }
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.reverse();
    String::from_utf8(buf).expect("base36 digits are ASCII")
}

/// Mirror of `buildReviewItemId(itemType, pillar, question)` in src/hooks/useReview.ts.
fn build_review_item_id(item_type: &str, pillar: Option<&str>, question: &str) -> String {
    format!(
        "{}:{}:{}",
        item_type,
        pillar.unwrap_or("none"),
        stable_hash(question.trim())
    )
}

/// Parse a stored JSON array of strings; returns empty vec on any failure.
fn parse_takeaways(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn parse_flagged(raw: &str) -> Vec<FlaggedItem> {
    serde_json::from_str::<Vec<FlaggedItem>>(raw).unwrap_or_default()
}

// ── Commands ────────────────────────────────────────────────────────────────────

/// Persist (insert or replace) a conversation summary.
/// `summary_json` is a JSON object: `{ takeaways: string[], reflection: string, flaggedItems: [...] }`.
#[tauri::command]
pub fn save_conversation_summary(
    app: AppHandle,
    conversation_id: String,
    summary_json: String,
    model: Option<String>,
) -> Result<(), String> {
    let parsed: Value = serde_json::from_str(&summary_json).map_err(|e| e.to_string())?;

    let takeaways = parsed
        .get("takeaways")
        .cloned()
        .unwrap_or_else(|| Value::Array(vec![]));
    let reflection = parsed
        .get("reflection")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let flagged = parsed
        .get("flaggedItems")
        .cloned()
        .unwrap_or_else(|| Value::Array(vec![]));

    let takeaways_str = serde_json::to_string(&takeaways).map_err(|e| e.to_string())?;
    let flagged_str = serde_json::to_string(&flagged).map_err(|e| e.to_string())?;

    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = now_iso();

    // Preserve created_at on replace.
    let existing_created: Option<String> = conn
        .query_row(
            "SELECT created_at FROM conversation_summaries WHERE conversation_id = ?1",
            rusqlite::params![conversation_id],
            |row| row.get(0),
        )
        .ok();
    let created_at = existing_created.unwrap_or_else(|| now.clone());

    conn.execute(
        "INSERT OR REPLACE INTO conversation_summaries
             (conversation_id, takeaways, reflection, flagged_items, model, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            conversation_id,
            takeaways_str,
            reflection,
            flagged_str,
            model,
            created_at,
            now
        ],
    )
    .map_err(|e| e.to_string())?;

    // Bump conversation.updated_at so it surfaces near the top of the list.
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, conversation_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Fetch the summary for a single conversation, if one exists.
#[tauri::command]
pub fn get_conversation_summary(
    app: AppHandle,
    conversation_id: String,
) -> Result<Option<ConversationSummaryRow>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    let row = conn
        .query_row(
            "SELECT s.conversation_id, s.takeaways, s.reflection, s.flagged_items,
                    s.model, s.created_at, s.updated_at, c.title, c.pillar
             FROM conversation_summaries s
             LEFT JOIN conversations c ON c.id = s.conversation_id
             WHERE s.conversation_id = ?1",
            rusqlite::params![conversation_id],
            |row| {
                let takeaways_raw: String = row.get(1)?;
                let flagged_raw: String = row.get(3)?;
                Ok(ConversationSummaryRow {
                    conversation_id: row.get(0)?,
                    takeaways: parse_takeaways(&takeaways_raw),
                    reflection: row.get(2)?,
                    flagged_items: parse_flagged(&flagged_raw),
                    model: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    conversation_title: row.get(7)?,
                    conversation_pillar: row.get(8)?,
                })
            },
        );

    match row {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// List the most recent summaries, joined with conversation title + pillar.
#[tauri::command]
pub fn list_recent_summaries(
    app: AppHandle,
    limit: Option<i64>,
) -> Result<Vec<ConversationSummaryRow>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(20);

    let mut stmt = conn
        .prepare(
            "SELECT s.conversation_id, s.takeaways, s.reflection, s.flagged_items,
                    s.model, s.created_at, s.updated_at, c.title, c.pillar
             FROM conversation_summaries s
             LEFT JOIN conversations c ON c.id = s.conversation_id
             ORDER BY s.created_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![lim], |row| {
            let takeaways_raw: String = row.get(1)?;
            let flagged_raw: String = row.get(3)?;
            Ok(ConversationSummaryRow {
                conversation_id: row.get(0)?,
                takeaways: parse_takeaways(&takeaways_raw),
                reflection: row.get(2)?,
                flagged_items: parse_flagged(&flagged_raw),
                model: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                conversation_title: row.get(7)?,
                conversation_pillar: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Seed flagged flashcards/quizzes into the SM-2 review queue.
/// Uses deterministic ids + INSERT OR IGNORE so repeated calls never reset SM-2 state.
/// Returns the list of review_item ids (existing or newly inserted).
#[tauri::command]
pub fn seed_review_items_from_summary(
    app: AppHandle,
    conversation_id: String,
    items: Vec<FlaggedItem>,
) -> Result<Vec<String>, String> {
    // conversation_id is accepted for symmetry/auditing but not stored on review_items.
    let _ = conversation_id;

    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = now_iso();

    let mut ids = Vec::with_capacity(items.len());
    for item in &items {
        let pillar = item.pillar.as_deref().filter(|p| !p.is_empty());
        let id = build_review_item_id(&item.item_type, pillar, &item.question);

        conn.execute(
            "INSERT OR IGNORE INTO review_items
                 (item_id, item_type, pillar, content, ease_factor, interval_days,
                  repetitions, last_quality, last_seen, next_due, created_at)
             VALUES (?1, ?2, ?3, ?4, 2.5, 0, 0, NULL, ?5, ?5, ?5)",
            rusqlite::params![id, item.item_type, pillar, item.question, now],
        )
        .map_err(|e| e.to_string())?;

        ids.push(id);
    }

    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations (
                id TEXT PRIMARY KEY, pillar TEXT, title TEXT NOT NULL DEFAULT 'New conversation',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE conversation_summaries (
                conversation_id TEXT PRIMARY KEY, takeaways TEXT NOT NULL, reflection TEXT NOT NULL,
                flagged_items TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE review_items (
                item_id TEXT PRIMARY KEY, item_type TEXT NOT NULL, pillar TEXT, content TEXT NOT NULL,
                ease_factor REAL NOT NULL DEFAULT 2.5, interval_days REAL NOT NULL DEFAULT 0,
                repetitions INTEGER NOT NULL DEFAULT 0, last_quality INTEGER,
                last_seen TEXT NOT NULL, next_due TEXT NOT NULL, created_at TEXT NOT NULL
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO conversations (id, pillar, title, created_at, updated_at)
             VALUES ('c1', 'llm', 'Attention', '2026-05-01T00:00:00Z', '2026-05-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn
    }

    // ── Hash parity with the TypeScript implementation ─────────────────────────
    // Reference values computed from the exact JS algorithm in src/hooks/useReview.ts.
    #[test]
    fn stable_hash_matches_js_reference() {
        // Literal values produced by the JS `stableHash` in src/hooks/useReview.ts
        // (verified via `node -e`).
        assert_eq!(stable_hash("hello"), "4bj995");
        assert_eq!(stable_hash("What is attention?"), "1v64x2i");
        assert_eq!(stable_hash(""), "45h");
        // Cross-check against an independent in-test oracle as well.
        assert_eq!(stable_hash("hello"), js_stable_hash("hello"));
        assert_eq!(stable_hash("What is attention?"), js_stable_hash("What is attention?"));
        assert_eq!(stable_hash(""), js_stable_hash(""));
    }

    /// Independent re-implementation following the JS spec literally, used only as
    /// an in-test oracle to guard against regressions in `stable_hash`.
    fn js_stable_hash(input: &str) -> String {
        let mut h: i64 = 5381;
        for u in input.encode_utf16() {
            let sum = (h << 5) + h + u as i64;
            // emulate `| 0` -> wrap to int32
            h = (sum as i32) as i64;
        }
        let unsigned = (h as i32) as u32;
        // toString(36)
        if unsigned == 0 {
            return "0".to_string();
        }
        let mut n = unsigned;
        const D: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
        let mut buf = Vec::new();
        while n > 0 {
            buf.push(D[(n % 36) as usize]);
            n /= 36;
        }
        buf.reverse();
        String::from_utf8(buf).unwrap()
    }

    #[test]
    fn build_id_format() {
        let id = build_review_item_id("flashcard", Some("llm"), "  What is attention?  ");
        // pillar present, trimmed question
        assert!(id.starts_with("flashcard:llm:"));
        let id_none = build_review_item_id("quiz", None, "Q");
        assert!(id_none.starts_with("quiz:none:"));
    }

    #[test]
    fn save_and_get_roundtrip() {
        let conn = setup();
        let json = r#"{"takeaways":["a","b","c"],"reflection":"why?","flaggedItems":[{"type":"flashcard","pillar":"llm","question":"Q1"}]}"#;
        let v: Value = serde_json::from_str(json).unwrap();
        let takeaways = serde_json::to_string(&v["takeaways"]).unwrap();
        let flagged = serde_json::to_string(&v["flaggedItems"]).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO conversation_summaries
                (conversation_id, takeaways, reflection, flagged_items, model, created_at, updated_at)
             VALUES ('c1', ?1, 'why?', ?2, 'anthropic/m', '2026-05-02T00:00:00Z', '2026-05-02T00:00:00Z')",
            rusqlite::params![takeaways, flagged],
        )
        .unwrap();

        let (t_raw, r, f_raw): (String, String, String) = conn
            .query_row(
                "SELECT takeaways, reflection, flagged_items FROM conversation_summaries WHERE conversation_id='c1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(parse_takeaways(&t_raw), vec!["a", "b", "c"]);
        assert_eq!(r, "why?");
        let flagged_items = parse_flagged(&f_raw);
        assert_eq!(flagged_items.len(), 1);
        assert_eq!(flagged_items[0].item_type, "flashcard");
        assert_eq!(flagged_items[0].pillar.as_deref(), Some("llm"));
    }

    #[test]
    fn seed_is_idempotent() {
        let conn = setup();
        let now = "2026-05-02T00:00:00Z";
        let id = build_review_item_id("flashcard", Some("llm"), "Q1");

        let insert = |conn: &Connection| {
            conn.execute(
                "INSERT OR IGNORE INTO review_items
                    (item_id, item_type, pillar, content, ease_factor, interval_days,
                     repetitions, last_quality, last_seen, next_due, created_at)
                 VALUES (?1, 'flashcard', 'llm', 'Q1', 2.5, 0, 0, NULL, ?2, ?2, ?2)",
                rusqlite::params![id, now],
            )
            .unwrap();
        };

        insert(&conn);
        // Simulate the user reviewing the item — advance SM-2 state.
        conn.execute(
            "UPDATE review_items SET repetitions = 3, interval_days = 15 WHERE item_id = ?1",
            rusqlite::params![id],
        )
        .unwrap();
        // Re-seeding must NOT reset progress.
        insert(&conn);

        let (reps, interval): (i32, f64) = conn
            .query_row(
                "SELECT repetitions, interval_days FROM review_items WHERE item_id = ?1",
                rusqlite::params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(reps, 3);
        assert_eq!(interval, 15.0);

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM review_items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
