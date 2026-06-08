use chrono::Local;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

/// Lowest valid engagement-depth score.
const MIN_SCORE: i64 = 1;
/// Highest valid engagement-depth score.
const MAX_SCORE: i64 = 5;

/// A persisted engagement-depth assessment for a single conversation.
///
/// `score` is the 1–5 depth rating produced by the LLM classifier (1 = pure
/// surface-level Q&A, 5 = applied scenarios + Socratic back-and-forth).
/// `dimensions` lists the qualitative signals the classifier observed
/// (e.g. "applied-scenarios", "edge-cases", "socratic").
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDepthRow {
    pub conversation_id: String,
    pub score: i64,
    pub rationale: String,
    pub dimensions: Vec<String>,
    pub model: Option<String>,
    pub message_count: i64,
    pub created_at: String,
    pub updated_at: String,
    /// Joined from `conversations` for the sidebar index (None if the row is orphaned).
    pub conversation_title: Option<String>,
    pub conversation_pillar: Option<String>,
}

/// Validated, clamped output of the depth classifier.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedDepth {
    pub score: i64,
    pub rationale: String,
    pub dimensions: Vec<String>,
}

fn now_iso() -> String {
    Local::now().to_rfc3339()
}

/// Parse the classifier's `{score, rationale, dimensions[]}` JSON payload.
///
/// Defensive against malformed model output: the score is clamped to 1–5,
/// a missing/non-array `dimensions` falls back to an empty vec, and a missing
/// `rationale` falls back to an empty string. Never panics.
pub fn parse_depth_payload(depth_json: &str) -> Result<ParsedDepth, String> {
    let value: serde_json::Value =
        serde_json::from_str(depth_json).map_err(|e| format!("Invalid depth JSON: {}", e))?;

    let raw_score = value
        .get("score")
        .and_then(|v| v.as_i64())
        // Tolerate a float like 4.0 or a stringified number.
        .or_else(|| value.get("score").and_then(|v| v.as_f64()).map(|f| f.round() as i64))
        .or_else(|| {
            value
                .get("score")
                .and_then(|v| v.as_str())
                .and_then(|s| s.trim().parse::<i64>().ok())
        })
        .ok_or_else(|| "Depth payload missing numeric `score`".to_string())?;

    let score = raw_score.clamp(MIN_SCORE, MAX_SCORE);

    let rationale = value
        .get("rationale")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let dimensions = value
        .get("dimensions")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|d| d.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    Ok(ParsedDepth {
        score,
        rationale,
        dimensions,
    })
}

fn map_depth_row(row: &rusqlite::Row) -> rusqlite::Result<ConversationDepthRow> {
    let dimensions_json: String = row.get(3)?;
    let dimensions: Vec<String> = serde_json::from_str(&dimensions_json).unwrap_or_default();
    Ok(ConversationDepthRow {
        conversation_id: row.get(0)?,
        score: row.get(1)?,
        rationale: row.get(2)?,
        dimensions,
        model: row.get(4)?,
        message_count: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        conversation_title: row.get(8)?,
        conversation_pillar: row.get(9)?,
    })
}

const SELECT_COLS: &str = "d.conversation_id, d.score, d.rationale, d.dimensions, d.model, \
                           d.message_count, d.created_at, d.updated_at, c.title, c.pillar";

/// Upsert a depth row, preserving the original `created_at` on re-score.
fn upsert_depth(
    conn: &Connection,
    conversation_id: &str,
    parsed: &ParsedDepth,
    model: Option<&str>,
    message_count: i64,
    now: &str,
) -> Result<(), String> {
    let dimensions_json = serde_json::to_string(&parsed.dimensions).map_err(|e| e.to_string())?;

    // Preserve the original created_at when re-scoring an existing conversation.
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM conversation_depth WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| now.to_string());

    conn.execute(
        "INSERT OR REPLACE INTO conversation_depth
             (conversation_id, score, rationale, dimensions, model, message_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            conversation_id,
            parsed.score,
            parsed.rationale,
            dimensions_json,
            model,
            message_count,
            created_at,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Bump the conversation's updated_at so it surfaces as freshly-touched.
    conn.execute(
        "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
        params![conversation_id, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn read_depth(
    conn: &Connection,
    conversation_id: &str,
) -> Result<Option<ConversationDepthRow>, String> {
    let sql = format!(
        "SELECT {} FROM conversation_depth d
         LEFT JOIN conversations c ON c.id = d.conversation_id
         WHERE d.conversation_id = ?1",
        SELECT_COLS
    );
    let row = conn
        .query_row(&sql, params![conversation_id], map_depth_row)
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other.to_string()),
        })?;
    Ok(row)
}

fn read_depth_list(conn: &Connection, limit: Option<i64>) -> Result<Vec<ConversationDepthRow>, String> {
    let sql = format!(
        "SELECT {} FROM conversation_depth d
         LEFT JOIN conversations c ON c.id = d.conversation_id
         ORDER BY d.updated_at DESC
         LIMIT ?1",
        SELECT_COLS
    );
    // A negative LIMIT means "no limit" in SQLite.
    let effective_limit = limit.unwrap_or(-1);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![effective_limit], map_depth_row)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

// ── Tauri commands ─────────────────────────────────────────────────────────

/// Persist a depth assessment for a conversation. `depth_json` is the raw
/// classifier output `{score, rationale, dimensions[]}`; the score is clamped
/// to 1–5 and malformed dimensions degrade to an empty list. Re-scoring an
/// existing conversation preserves the original `created_at`.
#[tauri::command]
pub fn save_conversation_depth(
    app: AppHandle,
    conversation_id: String,
    depth_json: String,
    model: Option<String>,
    message_count: Option<i64>,
) -> Result<ConversationDepthRow, String> {
    let parsed = parse_depth_payload(&depth_json)?;
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = now_iso();
    upsert_depth(
        &conn,
        &conversation_id,
        &parsed,
        model.as_deref(),
        message_count.unwrap_or(0),
        &now,
    )?;

    // Best-effort: a deep session earns a weekly streak-freeze token. Never let
    // a token-award failure fail depth scoring.
    if parsed.score >= crate::commands::streak::DEEP_SESSION_THRESHOLD {
        let _ = crate::commands::streak::maybe_award_freeze_token(&conn, Local::now().date_naive());
    }

    read_depth(&conn, &conversation_id)?
        .ok_or_else(|| "Depth row not found after save".to_string())
}

/// Fetch the depth assessment for a single conversation, or `None` if unscored.
#[tauri::command]
pub fn get_conversation_depth(
    app: AppHandle,
    conversation_id: String,
) -> Result<Option<ConversationDepthRow>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    read_depth(&conn, &conversation_id)
}

/// List all depth assessments (most-recently-updated first) for the sidebar index.
#[tauri::command]
pub fn list_conversation_depths(
    app: AppHandle,
    limit: Option<i64>,
) -> Result<Vec<ConversationDepthRow>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    read_depth_list(&conn, limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE conversations (
                id          TEXT PRIMARY KEY,
                pillar      TEXT,
                title       TEXT NOT NULL DEFAULT 'New conversation',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );
            CREATE TABLE conversation_depth (
                conversation_id TEXT PRIMARY KEY,
                score           INTEGER NOT NULL,
                rationale       TEXT NOT NULL DEFAULT '',
                dimensions      TEXT NOT NULL DEFAULT '[]',
                model           TEXT,
                message_count   INTEGER NOT NULL DEFAULT 0,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    fn insert_conversation(conn: &Connection, id: &str, title: &str, pillar: &str) {
        conn.execute(
            "INSERT INTO conversations (id, pillar, title, created_at, updated_at)
             VALUES (?1, ?2, ?3, '2026-06-01T09:00:00Z', '2026-06-01T09:00:00Z')",
            params![id, pillar, title],
        )
        .unwrap();
    }

    #[test]
    fn parses_well_formed_payload() {
        let parsed = parse_depth_payload(
            r#"{"score": 4, "rationale": "Good back-and-forth", "dimensions": ["applied-scenarios", "socratic"]}"#,
        )
        .unwrap();
        assert_eq!(parsed.score, 4);
        assert_eq!(parsed.rationale, "Good back-and-forth");
        assert_eq!(parsed.dimensions, vec!["applied-scenarios", "socratic"]);
    }

    #[test]
    fn clamps_out_of_range_scores() {
        assert_eq!(parse_depth_payload(r#"{"score": 0}"#).unwrap().score, 1);
        assert_eq!(parse_depth_payload(r#"{"score": 6}"#).unwrap().score, 5);
        assert_eq!(parse_depth_payload(r#"{"score": -3}"#).unwrap().score, 1);
        assert_eq!(parse_depth_payload(r#"{"score": 99}"#).unwrap().score, 5);
    }

    #[test]
    fn tolerates_float_and_string_scores() {
        assert_eq!(parse_depth_payload(r#"{"score": 4.0}"#).unwrap().score, 4);
        assert_eq!(parse_depth_payload(r#"{"score": "3"}"#).unwrap().score, 3);
    }

    #[test]
    fn malformed_dimensions_fall_back_to_empty() {
        let parsed = parse_depth_payload(r#"{"score": 3, "dimensions": "not-an-array"}"#).unwrap();
        assert!(parsed.dimensions.is_empty());
        let parsed2 = parse_depth_payload(r#"{"score": 3}"#).unwrap();
        assert!(parsed2.dimensions.is_empty());
    }

    #[test]
    fn invalid_json_errors_without_panic() {
        assert!(parse_depth_payload("not json at all").is_err());
        assert!(parse_depth_payload(r#"{"rationale": "no score"}"#).is_err());
    }

    #[test]
    fn save_get_roundtrip_joins_title_and_pillar() {
        let conn = test_conn();
        insert_conversation(&conn, "c1", "Attention deep dive", "llm");
        let parsed = parse_depth_payload(
            r#"{"score": 5, "rationale": "Edge cases explored", "dimensions": ["edge-cases"]}"#,
        )
        .unwrap();
        upsert_depth(&conn, "c1", &parsed, Some("claude-sonnet-4-5"), 12, "2026-06-02T10:00:00Z")
            .unwrap();

        let row = read_depth(&conn, "c1").unwrap().unwrap();
        assert_eq!(row.score, 5);
        assert_eq!(row.rationale, "Edge cases explored");
        assert_eq!(row.dimensions, vec!["edge-cases"]);
        assert_eq!(row.model.as_deref(), Some("claude-sonnet-4-5"));
        assert_eq!(row.message_count, 12);
        assert_eq!(row.conversation_title.as_deref(), Some("Attention deep dive"));
        assert_eq!(row.conversation_pillar.as_deref(), Some("llm"));
    }

    #[test]
    fn get_returns_none_for_unscored() {
        let conn = test_conn();
        assert!(read_depth(&conn, "missing").unwrap().is_none());
    }

    #[test]
    fn rescore_preserves_created_at_and_updates_updated_at() {
        let conn = test_conn();
        insert_conversation(&conn, "c1", "Topic", "sales");
        let first = parse_depth_payload(r#"{"score": 2}"#).unwrap();
        upsert_depth(&conn, "c1", &first, None, 4, "2026-06-01T08:00:00Z").unwrap();

        let second = parse_depth_payload(r#"{"score": 5}"#).unwrap();
        upsert_depth(&conn, "c1", &second, None, 9, "2026-06-05T12:00:00Z").unwrap();

        let row = read_depth(&conn, "c1").unwrap().unwrap();
        assert_eq!(row.score, 5);
        assert_eq!(row.created_at, "2026-06-01T08:00:00Z");
        assert_eq!(row.updated_at, "2026-06-05T12:00:00Z");
        assert_eq!(row.message_count, 9);
    }

    #[test]
    fn list_orders_by_updated_at_desc() {
        let conn = test_conn();
        insert_conversation(&conn, "a", "A", "llm");
        insert_conversation(&conn, "b", "B", "llm");
        insert_conversation(&conn, "c", "C", "llm");
        let p = parse_depth_payload(r#"{"score": 3}"#).unwrap();
        upsert_depth(&conn, "a", &p, None, 1, "2026-06-01T00:00:00Z").unwrap();
        upsert_depth(&conn, "b", &p, None, 1, "2026-06-03T00:00:00Z").unwrap();
        upsert_depth(&conn, "c", &p, None, 1, "2026-06-02T00:00:00Z").unwrap();

        let rows = read_depth_list(&conn, None).unwrap();
        let ids: Vec<&str> = rows.iter().map(|r| r.conversation_id.as_str()).collect();
        assert_eq!(ids, vec!["b", "c", "a"]);
    }

    #[test]
    fn list_respects_limit() {
        let conn = test_conn();
        for i in 0..5 {
            let id = format!("c{i}");
            insert_conversation(&conn, &id, "T", "llm");
            let p = parse_depth_payload(r#"{"score": 3}"#).unwrap();
            upsert_depth(&conn, &id, &p, None, 1, &format!("2026-06-0{}T00:00:00Z", i + 1)).unwrap();
        }
        let rows = read_depth_list(&conn, Some(2)).unwrap();
        assert_eq!(rows.len(), 2);
    }
}
