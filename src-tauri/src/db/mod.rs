use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.join("tutor.db"))
}

fn get_db_path_internal(app: &AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&data_dir).expect("Failed to create app data dir");
    data_dir.join("tutor.db")
}

pub fn init(app: &AppHandle) -> Result<()> {
    let db_path = get_db_path_internal(app);
    let conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS sessions (
            id          TEXT PRIMARY KEY,
            date        TEXT NOT NULL,
            pillar      TEXT NOT NULL,
            hours       REAL NOT NULL,
            energy      INTEGER NOT NULL,
            note        TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS milestones (
            id          TEXT PRIMARY KEY,
            pillar      TEXT NOT NULL,
            month       INTEGER NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            updated_at  TEXT NOT NULL,
            UNIQUE(pillar, month)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            pillar      TEXT,
            title       TEXT NOT NULL DEFAULT 'New conversation',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id              TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role            TEXT NOT NULL,
            content         TEXT NOT NULL,
            genui           TEXT,
            created_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
            ON chat_messages(conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS review_items (
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

        CREATE INDEX IF NOT EXISTS idx_review_items_due
            ON review_items(next_due);

        CREATE TABLE IF NOT EXISTS conversation_summaries (
            conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
            takeaways       TEXT NOT NULL,
            reflection      TEXT NOT NULL,
            flagged_items   TEXT NOT NULL,
            model           TEXT,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conv_summary_created
            ON conversation_summaries(created_at);

        CREATE TABLE IF NOT EXISTS weekly_digests (
            id          TEXT PRIMARY KEY,
            week_start  TEXT NOT NULL UNIQUE,
            week_end    TEXT NOT NULL,
            week_number INTEGER NOT NULL,
            content     TEXT NOT NULL,
            metrics     TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_weekly_digests_week_start
            ON weekly_digests(week_start DESC);
        ",
    )?;

    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

pub fn get_connection(app: &AppHandle) -> rusqlite::Result<Connection> {
    let db_path = get_db_path_internal(app);
    Connection::open(&db_path)
}
