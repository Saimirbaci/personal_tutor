use chrono::{Duration, Local};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub item_id: String,
    pub item_type: String,
    pub pillar: Option<String>,
    pub content: String,
    pub ease_factor: f32,
    pub interval_days: f32,
    pub repetitions: i32,
    pub last_quality: Option<i32>,
    pub last_seen: String,
    pub next_due: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCounts {
    pub total: i32,
    pub due: i32,
    pub due_today: i32,
}

/// SM-2 spaced repetition algorithm.
/// quality: 0-5 (0=blackout, 5=perfect). >=3 is a pass.
/// Returns (new_ease, new_interval_days, new_repetitions).
fn sm2(ease: f32, interval_days: f32, reps: i32, quality: i32) -> (f32, f32, i32) {
    let q = quality.clamp(0, 5) as f32;
    let mut new_ease = ease + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02));
    if new_ease < 1.3 {
        new_ease = 1.3;
    }

    if quality < 3 {
        // Failed — reset interval, keep repetitions counter informational
        return (new_ease, 1.0, 0);
    }

    let new_reps = reps + 1;
    let new_interval = match new_reps {
        1 => 1.0,
        2 => 6.0,
        _ => (interval_days * new_ease).max(1.0),
    };
    (new_ease, new_interval, new_reps)
}

#[tauri::command]
pub fn record_review_attempt(
    app: AppHandle,
    item_id: String,
    item_type: String,
    pillar: Option<String>,
    content: String,
    quality: i32,
) -> Result<ReviewItem, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now();
    let now_rfc = now.to_rfc3339();

    let existing: Option<(f32, f32, i32)> = conn
        .query_row(
            "SELECT ease_factor, interval_days, repetitions FROM review_items WHERE item_id = ?1",
            rusqlite::params![item_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();

    let (ease, interval, reps) = existing.unwrap_or((2.5, 0.0, 0));
    let (new_ease, new_interval, new_reps) = sm2(ease, interval, reps, quality);

    let next_due = now + Duration::milliseconds((new_interval * 86_400_000.0) as i64);
    let next_due_rfc = next_due.to_rfc3339();

    if existing.is_some() {
        conn.execute(
            "UPDATE review_items
             SET item_type = ?2, pillar = ?3, content = ?4,
                 ease_factor = ?5, interval_days = ?6, repetitions = ?7,
                 last_quality = ?8, last_seen = ?9, next_due = ?10
             WHERE item_id = ?1",
            rusqlite::params![
                item_id, item_type, pillar, content,
                new_ease, new_interval, new_reps,
                quality, now_rfc, next_due_rfc
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO review_items
             (item_id, item_type, pillar, content, ease_factor, interval_days,
              repetitions, last_quality, last_seen, next_due, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                item_id, item_type, pillar, content,
                new_ease, new_interval, new_reps,
                quality, now_rfc, next_due_rfc, now_rfc
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(ReviewItem {
        item_id,
        item_type,
        pillar,
        content,
        ease_factor: new_ease,
        interval_days: new_interval,
        repetitions: new_reps,
        last_quality: Some(quality),
        last_seen: now_rfc.clone(),
        next_due: next_due_rfc,
        created_at: now_rfc,
    })
}

#[tauri::command]
pub fn get_due_reviews(app: AppHandle, limit: Option<i32>) -> Result<Vec<ReviewItem>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();
    let lim = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT item_id, item_type, pillar, content, ease_factor, interval_days,
                    repetitions, last_quality, last_seen, next_due, created_at
             FROM review_items
             WHERE next_due <= ?1
             ORDER BY next_due ASC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let items: Vec<ReviewItem> = stmt
        .query_map(rusqlite::params![now, lim], |row| {
            Ok(ReviewItem {
                item_id: row.get(0)?,
                item_type: row.get(1)?,
                pillar: row.get(2)?,
                content: row.get(3)?,
                ease_factor: row.get(4)?,
                interval_days: row.get(5)?,
                repetitions: row.get(6)?,
                last_quality: row.get(7)?,
                last_seen: row.get(8)?,
                next_due: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(items)
}

#[tauri::command]
pub fn get_review_counts(app: AppHandle) -> Result<ReviewCounts, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now();
    let now_rfc = now.to_rfc3339();
    let end_of_day = now
        .date_naive()
        .and_hms_opt(23, 59, 59)
        .map(|d| d.and_local_timezone(Local).unwrap().to_rfc3339())
        .unwrap_or_else(|| now_rfc.clone());

    let total: i32 = conn
        .query_row("SELECT COUNT(*) FROM review_items", [], |row| row.get(0))
        .unwrap_or(0);
    let due: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM review_items WHERE next_due <= ?1",
            rusqlite::params![now_rfc],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let due_today: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM review_items WHERE next_due <= ?1",
            rusqlite::params![end_of_day],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(ReviewCounts { total, due, due_today })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sm2_failure_resets_interval() {
        let (_ease, interval, reps) = sm2(2.5, 10.0, 3, 1);
        assert_eq!(interval, 1.0);
        assert_eq!(reps, 0);
    }

    #[test]
    fn sm2_first_pass_one_day() {
        let (_ease, interval, reps) = sm2(2.5, 0.0, 0, 5);
        assert_eq!(interval, 1.0);
        assert_eq!(reps, 1);
    }

    #[test]
    fn sm2_second_pass_six_days() {
        let (_ease, interval, reps) = sm2(2.5, 1.0, 1, 5);
        assert_eq!(interval, 6.0);
        assert_eq!(reps, 2);
    }

    #[test]
    fn sm2_ease_floor() {
        let (ease, _, _) = sm2(1.3, 1.0, 1, 0);
        assert!(ease >= 1.3);
    }
}
