use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;

use crate::db::get_connection;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionLog {
    pub id: String,
    pub date: String,
    pub pillar: String,
    pub hours: f32,
    pub energy: i32,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayProgress {
    pub date: String,
    pub total_hours: f32,
    pub pillars: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MilestoneStatus {
    pub pillar: String,
    pub month: i32,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressData {
    pub total_hours: std::collections::HashMap<String, f32>,
    pub target_hours: std::collections::HashMap<String, f32>,
    pub today_sessions: Vec<SessionLog>,
    pub recent_days: Vec<DayProgress>,
    pub milestones: Vec<MilestoneStatus>,
}

#[tauri::command]
pub fn log_session(
    app: AppHandle,
    pillar: String,
    hours: f32,
    energy: i32,
    note: String,
) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = Local::now();
    let date = now.format("%Y-%m-%d").to_string();
    let created_at = now.to_rfc3339();

    conn.execute(
        "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, date, pillar, hours, energy, note, created_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_progress(app: AppHandle) -> Result<ProgressData, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    // Total hours per pillar
    let mut total_hours: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
    let pillars = ["llm", "hardware", "sales", "communication", "voice"];

    for p in &pillars {
        let hours: f32 = conn
            .query_row(
                "SELECT COALESCE(SUM(hours), 0) FROM sessions WHERE pillar = ?1",
                rusqlite::params![p],
                |row| row.get(0),
            )
            .unwrap_or(0.0);
        total_hours.insert(p.to_string(), hours);
    }

    // Target hours (120h total across 3 months = 40h/month; distributed per pillar)
    let mut target_hours: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
    target_hours.insert("llm".to_string(), 36.0);
    target_hours.insert("hardware".to_string(), 24.0);
    target_hours.insert("sales".to_string(), 24.0);
    target_hours.insert("communication".to_string(), 18.0);
    target_hours.insert("voice".to_string(), 18.0);

    // Today's sessions
    let today = Local::now().format("%Y-%m-%d").to_string();
    let mut stmt = conn
        .prepare(
            "SELECT id, date, pillar, hours, energy, note, created_at
             FROM sessions WHERE date = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let today_sessions: Vec<SessionLog> = stmt
        .query_map(rusqlite::params![today], |row| {
            Ok(SessionLog {
                id: row.get(0)?,
                date: row.get(1)?,
                pillar: row.get(2)?,
                hours: row.get(3)?,
                energy: row.get(4)?,
                note: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Recent 30 days
    let mut day_stmt = conn
        .prepare(
            "SELECT date, SUM(hours) as total, GROUP_CONCAT(DISTINCT pillar) as pillars
             FROM sessions
             WHERE date >= date('now', '-30 days')
             GROUP BY date
             ORDER BY date DESC",
        )
        .map_err(|e| e.to_string())?;

    let recent_days: Vec<DayProgress> = day_stmt
        .query_map([], |row| {
            let pillars_str: String = row.get(2).unwrap_or_default();
            Ok(DayProgress {
                date: row.get(0)?,
                total_hours: row.get(1)?,
                pillars: pillars_str.split(',').map(|s| s.to_string()).collect(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Milestones
    let mut ms_stmt = conn
        .prepare("SELECT pillar, month, status FROM milestones ORDER BY pillar, month")
        .map_err(|e| e.to_string())?;

    let milestones: Vec<MilestoneStatus> = ms_stmt
        .query_map([], |row| {
            Ok(MilestoneStatus {
                pillar: row.get(0)?,
                month: row.get(1)?,
                status: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(ProgressData {
        total_hours,
        target_hours,
        today_sessions,
        recent_days,
        milestones,
    })
}

#[tauri::command]
pub fn get_streak(app: AppHandle) -> Result<i32, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;

    // Get all distinct dates with sessions, sorted descending
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date FROM sessions ORDER BY date DESC",
        )
        .map_err(|e| e.to_string())?;

    let dates: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if dates.is_empty() {
        return Ok(0);
    }

    let today = Local::now().date_naive();
    let mut streak = 0;
    let mut expected = today;

    for date_str in &dates {
        if let Ok(d) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            if d == expected || (streak == 0 && d == today) {
                streak += 1;
                expected = d.pred_opt().unwrap_or(d);
            } else if d == today && streak == 0 {
                // started today
                streak = 1;
                expected = d.pred_opt().unwrap_or(d);
            } else {
                break;
            }
        }
    }

    Ok(streak)
}

#[tauri::command]
pub fn update_milestone(
    app: AppHandle,
    pillar: String,
    month: i32,
    status: String,
) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let updated_at = Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO milestones (id, pillar, month, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(pillar, month) DO UPDATE SET status = ?4, updated_at = ?5",
        rusqlite::params![id, pillar, month, status, updated_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
