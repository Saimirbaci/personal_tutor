use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

// ── Scoring weights ────────────────────────────────────────────────────────
// The blended mastery score is a weighted sum of three normalized signals.
// Tunable here in one place — kept as named constants for clarity and tests.
const QUIZ_WEIGHT: f32 = 0.45;
const SR_WEIGHT: f32 = 0.35;
const DEPTH_WEIGHT: f32 = 0.20;

/// SM-2 ease factor bounds used to normalize ease into [0, 1].
const EASE_MIN: f32 = 1.3;
const EASE_MAX: f32 = 2.7;

/// Repetitions considered "mature" — past this the maturity signal saturates.
const REPS_MATURE: f32 = 5.0;

/// On-topic conversation messages considered "deep" — depth saturates here.
const DEPTH_CAP: f32 = 8.0;

/// Minimum word length for a curriculum topic keyword to be matched against
/// review content / conversation text (skips short stop-words like "of", "the").
const MIN_KEYWORD_LEN: usize = 4;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MasteryScore {
    pub pillar_id: String,
    pub item_id: String,
    pub score: f32,
    pub quiz_accuracy: Option<f32>,
    pub ease_norm: Option<f32>,
    pub depth_norm: Option<f32>,
    pub updated_at: String,
}

/// Reference to a curriculum item, supplied by the frontend so the curriculum
/// data stays single-sourced in `src/data/plan.ts` (not duplicated in Rust).
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CurriculumItemRef {
    pub item_id: String,
    pub pillar_id: String,
    pub topic: String,
}

/// Pure mastery formula — blends quiz accuracy, spaced-repetition health, and
/// conversation depth into a 0–100 score. No DB access, so it's unit-testable.
///
/// * `quiz_accuracy` — pass rate in [0, 1]
/// * `ease_factor`   — SM-2 ease (typically 1.3–2.7)
/// * `repetitions`   — successful SM-2 repetitions
/// * `depth_signal`  — normalized conversation depth in [0, 1]
fn compute_mastery(quiz_accuracy: f32, ease_factor: f32, repetitions: i32, depth_signal: f32) -> f32 {
    let quiz = quiz_accuracy.clamp(0.0, 1.0);

    let ease_norm = ((ease_factor - EASE_MIN) / (EASE_MAX - EASE_MIN)).clamp(0.0, 1.0);
    let rep_maturity = (repetitions.max(0) as f32 / REPS_MATURE).clamp(0.0, 1.0);
    // Spaced-repetition health blends how "easy" an item has become with how
    // many times it has been successfully recalled.
    let sr = 0.5 * ease_norm + 0.5 * rep_maturity;

    let depth = depth_signal.clamp(0.0, 1.0);

    let blended = QUIZ_WEIGHT * quiz + SR_WEIGHT * sr + DEPTH_WEIGHT * depth;
    (blended * 100.0).clamp(0.0, 100.0)
}

/// Extract lowercase keywords from a curriculum topic string for heuristic
/// matching against review content and conversation text.
fn topic_keywords(topic: &str) -> Vec<String> {
    topic
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= MIN_KEYWORD_LEN)
        .map(|w| w.to_lowercase())
        .collect()
}

/// True if `content` mentions any of the topic keywords (case-insensitive).
fn content_matches(content: &str, keywords: &[String]) -> bool {
    if keywords.is_empty() {
        return false;
    }
    let lower = content.to_lowercase();
    keywords.iter().any(|kw| lower.contains(kw.as_str()))
}

/// Aggregate all signals for a single curriculum item and produce its score.
/// Takes a `&Connection` (not `AppHandle`) so it is testable with an in-memory DB.
fn aggregate_item(
    conn: &Connection,
    pillar_id: &str,
    item_id: &str,
    topic: &str,
    now: &str,
) -> Result<MasteryScore, String> {
    let keywords = topic_keywords(topic);

    // ── Spaced-repetition + quiz signals from review_items in this pillar ──
    let mut stmt = conn
        .prepare(
            "SELECT content, ease_factor, repetitions, last_quality
             FROM review_items WHERE pillar = ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![pillar_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f32>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, Option<i32>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut ease_sum = 0.0_f32;
    let mut reps_max = 0_i32;
    let mut matched = 0_i32;
    let mut graded = 0_i32;
    let mut passed = 0_i32;

    for row in rows {
        let (content, ease, reps, last_quality) = row.map_err(|e| e.to_string())?;
        if !content_matches(&content, &keywords) {
            continue;
        }
        matched += 1;
        ease_sum += ease;
        reps_max = reps_max.max(reps);
        if let Some(q) = last_quality {
            graded += 1;
            if q >= 3 {
                passed += 1;
            }
        }
    }

    let quiz_accuracy: Option<f32> = if graded > 0 {
        Some(passed as f32 / graded as f32)
    } else {
        None
    };
    let avg_ease: Option<f32> = if matched > 0 {
        Some(ease_sum / matched as f32)
    } else {
        None
    };
    let ease_norm = avg_ease
        .map(|e| ((e - EASE_MIN) / (EASE_MAX - EASE_MIN)).clamp(0.0, 1.0));

    // ── Conversation-depth signal from chat_messages in this pillar ──
    let mut depth_stmt = conn
        .prepare(
            "SELECT m.content
             FROM chat_messages m
             JOIN conversations c ON m.conversation_id = c.id
             WHERE c.pillar = ?1",
        )
        .map_err(|e| e.to_string())?;

    let depth_rows = depth_stmt
        .query_map(rusqlite::params![pillar_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut on_topic_msgs = 0_f32;
    for row in depth_rows {
        let content = row.map_err(|e| e.to_string())?;
        if content_matches(&content, &keywords) {
            on_topic_msgs += 1.0;
        }
    }
    let depth_norm = (on_topic_msgs / DEPTH_CAP).clamp(0.0, 1.0);
    let depth_norm_opt: Option<f32> = if on_topic_msgs > 0.0 {
        Some(depth_norm)
    } else {
        None
    };

    let score = compute_mastery(
        quiz_accuracy.unwrap_or(0.0),
        avg_ease.unwrap_or(EASE_MIN),
        reps_max,
        depth_norm,
    );

    upsert_score(
        conn,
        &MasteryScore {
            pillar_id: pillar_id.to_string(),
            item_id: item_id.to_string(),
            score,
            quiz_accuracy,
            ease_norm,
            depth_norm: depth_norm_opt,
            updated_at: now.to_string(),
        },
    )?;

    Ok(MasteryScore {
        pillar_id: pillar_id.to_string(),
        item_id: item_id.to_string(),
        score,
        quiz_accuracy,
        ease_norm,
        depth_norm: depth_norm_opt,
        updated_at: now.to_string(),
    })
}

/// UPSERT a single computed score into mastery_scores.
fn upsert_score(conn: &Connection, s: &MasteryScore) -> Result<(), String> {
    conn.execute(
        "INSERT INTO mastery_scores
             (pillar_id, item_id, score, quiz_accuracy, ease_norm, depth_norm, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(pillar_id, item_id) DO UPDATE SET
             score = excluded.score,
             quiz_accuracy = excluded.quiz_accuracy,
             ease_norm = excluded.ease_norm,
             depth_norm = excluded.depth_norm,
             updated_at = excluded.updated_at",
        rusqlite::params![
            s.pillar_id,
            s.item_id,
            s.score,
            s.quiz_accuracy,
            s.ease_norm,
            s.depth_norm,
            s.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Recompute mastery for the supplied curriculum items, persisting each score.
/// The frontend passes the (itemId, pillarId, topic) triples so curriculum data
/// is not duplicated in Rust. An optional `pillar` filter narrows the set.
#[tauri::command]
pub fn recompute_mastery(
    app: AppHandle,
    pillar: Option<String>,
    items: Vec<CurriculumItemRef>,
) -> Result<Vec<MasteryScore>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();

    let mut scores = Vec::with_capacity(items.len());
    for item in &items {
        if let Some(ref p) = pillar {
            if &item.pillar_id != p {
                continue;
            }
        }
        let score = aggregate_item(&conn, &item.pillar_id, &item.item_id, &item.topic, &now)?;
        scores.push(score);
    }

    Ok(scores)
}

/// Read persisted mastery scores, optionally filtered by pillar.
#[tauri::command]
pub fn get_mastery_scores(
    app: AppHandle,
    pillar: Option<String>,
) -> Result<Vec<MasteryScore>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    let (sql, has_filter) = match &pillar {
        Some(_) => (
            "SELECT pillar_id, item_id, score, quiz_accuracy, ease_norm, depth_norm, updated_at
             FROM mastery_scores WHERE pillar_id = ?1",
            true,
        ),
        None => (
            "SELECT pillar_id, item_id, score, quiz_accuracy, ease_norm, depth_norm, updated_at
             FROM mastery_scores",
            false,
        ),
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let map_row = |row: &rusqlite::Row| {
        Ok(MasteryScore {
            pillar_id: row.get(0)?,
            item_id: row.get(1)?,
            score: row.get(2)?,
            quiz_accuracy: row.get(3)?,
            ease_norm: row.get(4)?,
            depth_norm: row.get(5)?,
            updated_at: row.get(6)?,
        })
    };

    let scores: Vec<MasteryScore> = if has_filter {
        let p = pillar.unwrap();
        stmt.query_map(rusqlite::params![p], map_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], map_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    };

    Ok(scores)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE review_items (
                item_id TEXT PRIMARY KEY,
                item_type TEXT NOT NULL,
                pillar TEXT,
                content TEXT NOT NULL,
                ease_factor REAL NOT NULL DEFAULT 2.5,
                interval_days REAL NOT NULL DEFAULT 0,
                repetitions INTEGER NOT NULL DEFAULT 0,
                last_quality INTEGER,
                last_seen TEXT NOT NULL,
                next_due TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                pillar TEXT,
                title TEXT NOT NULL DEFAULT 'New conversation',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE chat_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                genui TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE mastery_scores (
                pillar_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                score REAL NOT NULL DEFAULT 0,
                quiz_accuracy REAL,
                ease_norm REAL,
                depth_norm REAL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (pillar_id, item_id)
            );",
        )
        .unwrap();
        conn
    }

    fn insert_review(
        conn: &Connection,
        item_id: &str,
        pillar: &str,
        content: &str,
        ease: f32,
        reps: i32,
        last_quality: Option<i32>,
    ) {
        conn.execute(
            "INSERT INTO review_items
                (item_id, item_type, pillar, content, ease_factor, interval_days,
                 repetitions, last_quality, last_seen, next_due, created_at)
             VALUES (?1, 'quiz', ?2, ?3, ?4, 1.0, ?5, ?6, 'now', 'now', 'now')",
            rusqlite::params![item_id, pillar, content, ease, reps, last_quality],
        )
        .unwrap();
    }

    #[test]
    fn perfect_signals_near_100() {
        let score = compute_mastery(1.0, EASE_MAX, 5, 1.0);
        assert!(score > 99.0, "expected ~100, got {score}");
    }

    #[test]
    fn zero_signals_is_zero() {
        let score = compute_mastery(0.0, EASE_MIN, 0, 0.0);
        assert_eq!(score, 0.0);
    }

    #[test]
    fn output_clamped_to_range() {
        let score = compute_mastery(5.0, 99.0, 999, 5.0);
        assert!(score <= 100.0);
        let low = compute_mastery(-1.0, 0.0, -5, -1.0);
        assert!(low >= 0.0);
    }

    #[test]
    fn quiz_accuracy_is_monotonic() {
        let low = compute_mastery(0.2, 2.0, 2, 0.5);
        let high = compute_mastery(0.9, 2.0, 2, 0.5);
        assert!(high > low, "higher quiz accuracy must not lower score");
    }

    #[test]
    fn ease_floor_yields_low_sr_contribution() {
        // At the ease floor with no reps, the SR component is 0.
        let floored = compute_mastery(0.0, EASE_MIN, 0, 0.0);
        let healthy = compute_mastery(0.0, EASE_MAX, 5, 0.0);
        assert_eq!(floored, 0.0);
        assert!(healthy > floored);
    }

    #[test]
    fn aggregate_matches_topic_keywords() {
        let conn = setup_db();
        insert_review(&conn, "r1", "llm", "What is the attention mechanism?", 2.7, 5, Some(5));
        insert_review(&conn, "r2", "llm", "Explain gradient descent", 2.5, 3, Some(4));
        // Off-pillar item must be ignored.
        insert_review(&conn, "r3", "hardware", "attention on GPUs", 2.7, 5, Some(5));

        let s = aggregate_item(&conn, "llm", "item-attn", "Attention mechanisms", "2026-01-01")
            .unwrap();
        // Only r1 matches "attention" → graded pass rate 1.0.
        assert_eq!(s.quiz_accuracy, Some(1.0));
        assert!(s.score > 0.0);
    }

    #[test]
    fn aggregate_no_signals_scores_zero() {
        let conn = setup_db();
        let s = aggregate_item(&conn, "llm", "item-x", "Quantization techniques", "2026-01-01")
            .unwrap();
        assert_eq!(s.score, 0.0);
        assert_eq!(s.quiz_accuracy, None);
        assert_eq!(s.ease_norm, None);
        assert_eq!(s.depth_norm, None);
    }

    #[test]
    fn aggregate_counts_conversation_depth() {
        let conn = setup_db();
        conn.execute(
            "INSERT INTO conversations (id, pillar, title, created_at, updated_at)
             VALUES ('c1', 'llm', 't', 'now', 'now')",
            [],
        )
        .unwrap();
        for i in 0..3 {
            conn.execute(
                "INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
                 VALUES (?1, 'c1', 'user', 'Tell me about quantization methods', 'now')",
                rusqlite::params![format!("m{i}")],
            )
            .unwrap();
        }
        let s = aggregate_item(&conn, "llm", "item-q", "Quantization", "2026-01-01").unwrap();
        assert!(s.depth_norm.is_some());
        assert!(s.score > 0.0);
    }

    #[test]
    fn upsert_is_idempotent() {
        let conn = setup_db();
        insert_review(&conn, "r1", "llm", "attention mechanism deep dive", 2.7, 5, Some(5));

        let first = aggregate_item(&conn, "llm", "item-attn", "Attention", "2026-01-01").unwrap();
        let second = aggregate_item(&conn, "llm", "item-attn", "Attention", "2026-02-02").unwrap();

        assert_eq!(first.score, second.score);

        // Exactly one row, with the latest timestamp.
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM mastery_scores", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let updated: String = conn
            .query_row(
                "SELECT updated_at FROM mastery_scores WHERE item_id = 'item-attn'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(updated, "2026-02-02");
    }
}
