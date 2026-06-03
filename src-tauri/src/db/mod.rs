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

        CREATE TABLE IF NOT EXISTS plan_adjustments (
            id            TEXT PRIMARY KEY,
            week_start    TEXT NOT NULL UNIQUE,
            week_number   INTEGER NOT NULL,
            generated_at  TEXT NOT NULL,
            rationale     TEXT NOT NULL,
            adjustments   TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'proposed',
            applied_at    TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_plan_adjustments_week
            ON plan_adjustments(week_start DESC);

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

        CREATE TABLE IF NOT EXISTS mastery_scores (
            pillar_id     TEXT NOT NULL,
            item_id       TEXT NOT NULL,
            score         REAL NOT NULL DEFAULT 0,
            quiz_accuracy REAL,
            ease_norm     REAL,
            depth_norm    REAL,
            updated_at    TEXT NOT NULL,
            PRIMARY KEY (pillar_id, item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_mastery_pillar
            ON mastery_scores(pillar_id);

        CREATE TABLE IF NOT EXISTS knowledge_gaps (
            gap_id            TEXT PRIMARY KEY,
            pillar            TEXT NOT NULL,
            topic_key         TEXT NOT NULL,
            label             TEXT NOT NULL,
            severity          REAL NOT NULL,
            signal_summary    TEXT NOT NULL,
            status            TEXT NOT NULL DEFAULT 'open',
            first_detected_at TEXT NOT NULL,
            last_updated_at   TEXT NOT NULL,
            dismissed_until   TEXT,
            last_drilled_at   TEXT,
            UNIQUE(pillar, topic_key)
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_pillar
            ON knowledge_gaps(pillar, status);
        ",
    )?;

    run_migrations(&conn)?;

    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

/// Idempotent schema migrations for columns that `CREATE TABLE IF NOT EXISTS`
/// cannot add to a pre-existing table. Each migration must tolerate being
/// re-run on an already-migrated database.
fn run_migrations(conn: &Connection) -> Result<()> {
    add_column_if_missing(
        conn,
        "review_items",
        "last_notified_at",
        "ALTER TABLE review_items ADD COLUMN last_notified_at TEXT",
    )?;
    Ok(())
}

/// Adds a column only when it is not already present, by inspecting
/// `PRAGMA table_info`. Avoids relying on swallowing a duplicate-column error.
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    alter_sql: &str,
) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(|r| r.ok())
        .any(|name| name == column);

    if !exists {
        conn.execute(alter_sql, [])?;
    }
    Ok(())
}

pub fn get_connection(app: &AppHandle) -> rusqlite::Result<Connection> {
    let db_path = get_db_path_internal(app);
    Connection::open(&db_path)
}
