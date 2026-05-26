use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

// ── Serialisable types returned to the frontend ───────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub pillar: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    /// JSON-serialised GenUI blocks, or null when absent.
    pub genui: Option<String>,
    pub created_at: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_iso() -> String {
    // Use std time — no chrono dep needed for a simple ISO-8601 UTC timestamp.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format as YYYY-MM-DDTHH:MM:SSZ (no sub-seconds, UTC)
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let days = secs / 86400; // days since 1970-01-01
    // Compute calendar date (Gregorian, UTC)
    let (y, mo, d) = days_to_ymd(days);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, d, h, m, s)
}

fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    // Simple proleptic Gregorian calendar computation
    let z = days + 719468;
    let era = z / 146097;
    let doe = z % 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    (y, mo, d)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Create a new conversation and return its id.
#[tauri::command]
pub fn new_conversation(
    app: AppHandle,
    pillar: Option<String>,
    title: Option<String>,
) -> Result<String, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let id = uuid_v4();
    let now = now_iso();
    let title = title.unwrap_or_else(|| "New conversation".to_string());

    conn.execute(
        "INSERT INTO conversations (id, pillar, title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![id, pillar, title, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Persist a single chat message.  `genui` is an optional JSON string.
#[tauri::command]
pub fn save_message(
    app: AppHandle,
    conversation_id: String,
    message_id: String,
    role: String,
    content: String,
    genui: Option<String>,
) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = now_iso();

    conn.execute(
        "INSERT OR REPLACE INTO chat_messages
             (id, conversation_id, role, content, genui, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![message_id, conversation_id, role, content, genui, now],
    )
    .map_err(|e| e.to_string())?;

    // Bump conversation.updated_at
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, conversation_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// List all conversations, most-recently-updated first.
#[tauri::command]
pub fn list_conversations(app: AppHandle) -> Result<Vec<ConversationSummary>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.title, c.pillar, c.created_at, c.updated_at,
                    COUNT(m.id) AS message_count
             FROM conversations c
             LEFT JOIN chat_messages m ON m.conversation_id = c.id
             GROUP BY c.id
             ORDER BY c.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ConversationSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                pillar: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                message_count: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Load all messages for a conversation in chronological order.
#[tauri::command]
pub fn get_conversation_messages(
    app: AppHandle,
    conversation_id: String,
) -> Result<Vec<StoredMessage>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, genui, created_at
             FROM chat_messages
             WHERE conversation_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![conversation_id], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                genui: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/// Delete a conversation and all its messages (CASCADE).
#[tauri::command]
pub fn delete_conversation(app: AppHandle, conversation_id: String) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        rusqlite::params![conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Rename a conversation.
#[tauri::command]
pub fn rename_conversation(
    app: AppHandle,
    conversation_id: String,
    title: String,
) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![title, now, conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Bulk-import conversations + messages received from a desktop sync server.
/// Uses INSERT OR REPLACE for conversations and INSERT OR IGNORE for messages
/// so re-syncing is idempotent.
#[tauri::command]
pub fn bulk_import_sync(
    app: AppHandle,
    conversations: Vec<serde_json::Value>,
    messages: Vec<serde_json::Value>,
) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    for c in &conversations {
        let id = c["id"].as_str().unwrap_or_default();
        let title = c["title"].as_str().unwrap_or("Imported");
        let pillar = c["pillar"].as_str();
        let created_at = c["created_at"].as_str().unwrap_or_default();
        let updated_at = c["updated_at"].as_str().unwrap_or_default();

        conn.execute(
            "INSERT OR REPLACE INTO conversations (id, title, pillar, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, title, pillar, created_at, updated_at],
        )
        .map_err(|e| e.to_string())?;
    }

    for m in &messages {
        let id = m["id"].as_str().unwrap_or_default();
        let conv_id = m["conversation_id"].as_str().unwrap_or_default();
        let role = m["role"].as_str().unwrap_or_default();
        let content = m["content"].as_str().unwrap_or_default();
        let genui = m["genui"].as_str();
        let created_at = m["created_at"].as_str().unwrap_or_default();

        conn.execute(
            "INSERT OR IGNORE INTO chat_messages
             (id, conversation_id, role, content, genui, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, conv_id, role, content, genui, created_at],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ── UUID v4 (no external crate) ───────────────────────────────────────────────

fn uuid_v4() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};

    // Mix time + thread id for reasonable uniqueness
    let mut h = DefaultHasher::new();
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .hash(&mut h);
    std::thread::current().id().hash(&mut h);
    let a = h.finish();

    let mut h2 = DefaultHasher::new();
    a.hash(&mut h2);
    (a ^ 0xDEAD_BEEF_CAFE_1234u64).hash(&mut h2);
    let b = h2.finish();

    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        (a >> 32) & 0xFFFF_FFFF,
        (a >> 16) & 0xFFFF,
        a & 0x0FFF,
        ((b >> 48) & 0x3FFF) | 0x8000,
        b & 0x0000_FFFF_FFFF_FFFF,
    )
}
