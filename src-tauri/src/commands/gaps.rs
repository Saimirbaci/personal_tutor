use chrono::{DateTime, Duration, Local};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::db::get_connection;

// ── Tunable detection thresholds ───────────────────────────────────────────
/// User chat turns shorter than this (avg chars) read as shallow engagement.
const SHALLOW_MSG_CHARS: f32 = 120.0;
/// Minimum activity count before a pillar-level signal is trusted.
const MIN_ATTEMPTS_FOR_GAP: i32 = 2;
/// Average review quality below this (0–5 scale) flags a weak topic.
const WEAK_AVG_QUALITY: f32 = 3.0;
/// SM-2 ease factor below this signals repeated struggle to retain.
const LOW_EASE: f32 = 1.8;
/// Days without activity on an in-progress pillar before it reads as stale.
const STALE_DAYS: i64 = 10;
/// Sentinel topic_key for pillar-wide (non per-item) gaps.
const PILLAR_TOPIC_KEY: &str = "_pillar";

// ── Wire types (camelCase to match TS interfaces) ──────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GapSignal {
    /// One of: weak_quiz | low_ease | shallow_chat | stale
    pub kind: String,
    pub detail: String,
    pub weight: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGap {
    pub gap_id: String,
    pub pillar: String,
    pub topic_key: String,
    pub label: String,
    pub severity: f32,
    pub signals: Vec<GapSignal>,
    pub status: String,
    pub first_detected_at: String,
    pub last_updated_at: String,
    pub dismissed_until: Option<String>,
    pub last_drilled_at: Option<String>,
}

// ── Pure-compute input rows ────────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct ReviewRow {
    pub pillar: Option<String>,
    pub content: String,
    pub ease_factor: f32,
    pub repetitions: i32,
    pub last_quality: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct ChatStat {
    pub pillar: String,
    pub user_msg_count: i32,
    pub avg_user_len: f32,
    pub review_attempts: i32,
}

#[derive(Debug, Clone)]
pub struct PillarActivity {
    pub pillar: String,
    pub in_progress_milestones: i32,
    pub last_activity: Option<DateTime<Local>>,
}

// ── Helpers ────────────────────────────────────────────────────────────────
/// djb2 hash → unsigned base-36, mirroring the frontend `buildReviewItemId`.
fn djb2(input: &str) -> String {
    let mut h: i32 = 5381;
    for c in input.chars() {
        h = h.wrapping_mul(33).wrapping_add(c as i32);
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
    String::from_utf8(buf).unwrap_or_default()
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let kept: String = s.chars().take(max_len.saturating_sub(1)).collect();
        format!("{}…", kept)
    }
}

// ── Detection engine (pure, unit-testable) ─────────────────────────────────
/// Mine live learning signals into a severity-ranked list of knowledge gaps.
/// All timestamps on the returned structs use `now`; callers persist real
/// lifecycle values (first_detected_at, dismissals) separately.
pub fn compute_gaps(
    review_rows: &[ReviewRow],
    chat_stats: &[ChatStat],
    pillar_activity: &[PillarActivity],
    now: DateTime<Local>,
) -> Vec<KnowledgeGap> {
    use std::collections::HashMap;

    // (pillar, topic_key) -> (label, signals)
    let mut acc: HashMap<(String, String), (String, Vec<GapSignal>)> = HashMap::new();

    // 1. Quiz / review signals — structured and per-item (primary signal).
    for row in review_rows {
        let pillar = match &row.pillar {
            Some(p) if !p.is_empty() => p.clone(),
            _ => continue,
        };

        let mut signals = Vec::new();

        if let Some(lq) = row.last_quality {
            if (lq as f32) < WEAK_AVG_QUALITY {
                let weight = ((WEAK_AVG_QUALITY - lq as f32) / WEAK_AVG_QUALITY).clamp(0.0, 1.0);
                signals.push(GapSignal {
                    kind: "weak_quiz".into(),
                    detail: format!("Last answered at quality {}/5", lq),
                    weight,
                });
            }
        }

        if row.ease_factor < LOW_EASE {
            let weight = ((LOW_EASE - row.ease_factor) / (LOW_EASE - 1.3)).clamp(0.0, 1.0);
            signals.push(GapSignal {
                kind: "low_ease".into(),
                detail: format!("Ease factor {:.2} — hard to retain", row.ease_factor),
                weight,
            });
        }

        if signals.is_empty() {
            continue;
        }

        let topic_key = djb2(row.content.trim());
        let label = truncate(row.content.trim(), 80);
        let entry = acc.entry((pillar, topic_key)).or_insert((label, Vec::new()));
        entry.1.extend(signals);
    }

    // 2. Shallow engagement — secondary, pillar-level heuristic.
    for stat in chat_stats {
        if stat.user_msg_count >= MIN_ATTEMPTS_FOR_GAP
            && stat.avg_user_len < SHALLOW_MSG_CHARS
            && stat.review_attempts < MIN_ATTEMPTS_FOR_GAP
        {
            let weight = ((SHALLOW_MSG_CHARS - stat.avg_user_len) / SHALLOW_MSG_CHARS).clamp(0.0, 1.0);
            let entry = acc
                .entry((stat.pillar.clone(), PILLAR_TOPIC_KEY.to_string()))
                .or_insert(("Shallow engagement".to_string(), Vec::new()));
            entry.1.push(GapSignal {
                kind: "shallow_chat".into(),
                detail: format!(
                    "{} short messages (avg {} chars) with little active recall",
                    stat.user_msg_count,
                    stat.avg_user_len.round() as i32
                ),
                weight,
            });
        }
    }

    // 3. Stale — in-progress milestones with no recent activity.
    for act in pillar_activity {
        if act.in_progress_milestones <= 0 {
            continue;
        }
        let days = act.last_activity.map(|ts| (now - ts).num_days());
        let stale = days.is_none_or(|d| d > STALE_DAYS);
        if !stale {
            continue;
        }
        let detail = match days {
            Some(d) => format!("In-progress milestone, no activity for {} days", d),
            None => "In-progress milestone with no logged activity".to_string(),
        };
        let weight = match days {
            Some(d) => ((d as f32 - STALE_DAYS as f32) / 30.0 + 0.4).clamp(0.3, 1.0),
            None => 0.6,
        };
        let entry = acc
            .entry((act.pillar.clone(), PILLAR_TOPIC_KEY.to_string()))
            .or_insert(("Stalled progress".to_string(), Vec::new()));
        entry.1.push(GapSignal {
            kind: "stale".into(),
            detail,
            weight,
        });
    }

    let now_rfc = now.to_rfc3339();
    let mut gaps: Vec<KnowledgeGap> = acc
        .into_iter()
        .map(|((pillar, topic_key), (label, signals))| {
            let severity = signals.iter().map(|s| s.weight).sum::<f32>().clamp(0.0, 1.0);
            let gap_id = djb2(&format!("{}|{}", pillar, topic_key));
            KnowledgeGap {
                gap_id,
                pillar,
                topic_key,
                label,
                severity,
                signals,
                status: "open".to_string(),
                first_detected_at: now_rfc.clone(),
                last_updated_at: now_rfc.clone(),
                dismissed_until: None,
                last_drilled_at: None,
            }
        })
        .collect();

    gaps.sort_by(|a, b| {
        b.severity
            .partial_cmp(&a.severity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    gaps
}

// ── Signal gathering (DB reads) ────────────────────────────────────────────
fn gather_review_rows(conn: &Connection) -> Result<Vec<ReviewRow>, String> {
    let mut stmt = conn
        .prepare("SELECT pillar, content, ease_factor, repetitions, last_quality FROM review_items")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReviewRow {
                pillar: row.get(0)?,
                content: row.get(1)?,
                ease_factor: row.get(2)?,
                repetitions: row.get(3)?,
                last_quality: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

fn gather_chat_stats(conn: &Connection) -> Result<Vec<ChatStat>, String> {
    use std::collections::HashMap;

    let mut by_pillar: HashMap<String, (i32, f32)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT c.pillar, COUNT(m.id), AVG(LENGTH(m.content))
                 FROM chat_messages m
                 JOIN conversations c ON m.conversation_id = c.id
                 WHERE m.role = 'user' AND c.pillar IS NOT NULL AND c.pillar <> ''
                 GROUP BY c.pillar",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let pillar: String = row.get(0)?;
                let count: i32 = row.get(1)?;
                let avg: f64 = row.get(2).unwrap_or(0.0);
                Ok((pillar, count, avg as f32))
            })
            .map_err(|e| e.to_string())?;
        for r in rows.filter_map(|r| r.ok()) {
            by_pillar.insert(r.0, (r.1, r.2));
        }
    }

    let mut review_counts: HashMap<String, i32> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT pillar, COUNT(*) FROM review_items
                 WHERE pillar IS NOT NULL AND pillar <> '' GROUP BY pillar",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let pillar: String = row.get(0)?;
                let count: i32 = row.get(1)?;
                Ok((pillar, count))
            })
            .map_err(|e| e.to_string())?;
        for r in rows.filter_map(|r| r.ok()) {
            review_counts.insert(r.0, r.1);
        }
    }

    let stats = by_pillar
        .into_iter()
        .map(|(pillar, (count, avg))| {
            let review_attempts = review_counts.get(&pillar).copied().unwrap_or(0);
            ChatStat {
                pillar,
                user_msg_count: count,
                avg_user_len: avg,
                review_attempts,
            }
        })
        .collect();
    Ok(stats)
}

fn parse_local(ts: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Local))
}

fn gather_pillar_activity(conn: &Connection) -> Result<Vec<PillarActivity>, String> {
    use std::collections::HashMap;

    let mut milestones: HashMap<String, i32> = HashMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT pillar, COUNT(*) FROM milestones
                 WHERE status IN ('in-progress', 'in_progress') GROUP BY pillar",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let pillar: String = row.get(0)?;
                let count: i32 = row.get(1)?;
                Ok((pillar, count))
            })
            .map_err(|e| e.to_string())?;
        for r in rows.filter_map(|r| r.ok()) {
            milestones.insert(r.0, r.1);
        }
    }

    let mut last_activity: HashMap<String, DateTime<Local>> = HashMap::new();
    let mut note_activity = |pillar: String, ts: Option<DateTime<Local>>| {
        if let Some(ts) = ts {
            last_activity
                .entry(pillar)
                .and_modify(|cur| {
                    if ts > *cur {
                        *cur = ts;
                    }
                })
                .or_insert(ts);
        }
    };

    {
        let mut stmt = conn
            .prepare("SELECT pillar, MAX(created_at) FROM sessions GROUP BY pillar")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let pillar: String = row.get(0)?;
                let ts: Option<String> = row.get(1)?;
                Ok((pillar, ts))
            })
            .map_err(|e| e.to_string())?;
        for (pillar, ts) in rows.filter_map(|r| r.ok()) {
            note_activity(pillar, ts.as_deref().and_then(parse_local));
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT pillar, MAX(last_seen) FROM review_items
                 WHERE pillar IS NOT NULL GROUP BY pillar",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let pillar: String = row.get(0)?;
                let ts: Option<String> = row.get(1)?;
                Ok((pillar, ts))
            })
            .map_err(|e| e.to_string())?;
        for (pillar, ts) in rows.filter_map(|r| r.ok()) {
            note_activity(pillar, ts.as_deref().and_then(parse_local));
        }
    }

    let activity = milestones
        .into_iter()
        .map(|(pillar, in_progress_milestones)| {
            let last = last_activity.get(&pillar).copied();
            PillarActivity {
                pillar,
                in_progress_milestones,
                last_activity: last,
            }
        })
        .collect();
    Ok(activity)
}

// ── Persistence (testable against a bare Connection) ───────────────────────
fn map_gap_row(row: &rusqlite::Row) -> rusqlite::Result<KnowledgeGap> {
    let signal_summary: String = row.get(5)?;
    let signals: Vec<GapSignal> = serde_json::from_str(&signal_summary).unwrap_or_default();
    Ok(KnowledgeGap {
        gap_id: row.get(0)?,
        pillar: row.get(1)?,
        topic_key: row.get(2)?,
        label: row.get(3)?,
        severity: row.get(4)?,
        signals,
        status: row.get(6)?,
        first_detected_at: row.get(7)?,
        last_updated_at: row.get(8)?,
        dismissed_until: row.get(9)?,
        last_drilled_at: row.get(10)?,
    })
}

/// Upsert computed gaps, preserving user lifecycle state. Reopens snoozed gaps
/// whose snooze expired, keeps active/permanent dismissals, and resolves any
/// previously-open gap that no longer surfaces.
fn upsert_gaps(conn: &Connection, computed: &[KnowledgeGap], now_rfc: &str) -> Result<(), String> {
    use std::collections::HashSet;
    let mut computed_ids: HashSet<String> = HashSet::new();

    for gap in computed {
        computed_ids.insert(gap.gap_id.clone());
        let signal_summary = serde_json::to_string(&gap.signals).map_err(|e| e.to_string())?;

        let existing: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT status, dismissed_until FROM knowledge_gaps WHERE gap_id = ?1",
                params![gap.gap_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some((status, dismissed_until)) = existing {
            // A permanent dismissal (NULL until) or an unexpired snooze stays hidden.
            let still_dismissed = status == "dismissed"
                && dismissed_until
                    .as_deref()
                    .is_none_or(|d| d > now_rfc);
            let new_status = if still_dismissed { "dismissed" } else { "open" };
            conn.execute(
                "UPDATE knowledge_gaps
                 SET label = ?2, severity = ?3, signal_summary = ?4, status = ?5, last_updated_at = ?6
                 WHERE gap_id = ?1",
                params![
                    gap.gap_id,
                    gap.label,
                    gap.severity,
                    signal_summary,
                    new_status,
                    now_rfc
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO knowledge_gaps
                 (gap_id, pillar, topic_key, label, severity, signal_summary, status,
                  first_detected_at, last_updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?7)",
                params![
                    gap.gap_id,
                    gap.pillar,
                    gap.topic_key,
                    gap.label,
                    gap.severity,
                    signal_summary,
                    now_rfc
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Resolve open gaps whose signals have cleared this pass.
    let open_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT gap_id FROM knowledge_gaps WHERE status = 'open'")
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        ids
    };
    for id in open_ids {
        if !computed_ids.contains(&id) {
            conn.execute(
                "UPDATE knowledge_gaps SET status = 'resolved', last_updated_at = ?2 WHERE gap_id = ?1",
                params![id, now_rfc],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// Read open gaps (dismissed/resolved excluded), severity-ranked.
fn read_active_gaps(conn: &Connection, filter_pillar: Option<&str>) -> Result<Vec<KnowledgeGap>, String> {
    const COLS: &str = "gap_id, pillar, topic_key, label, severity, signal_summary, status, \
                        first_detected_at, last_updated_at, dismissed_until, last_drilled_at";

    let gaps: Vec<KnowledgeGap> = if let Some(pillar) = filter_pillar {
        let sql = format!(
            "SELECT {} FROM knowledge_gaps WHERE status = 'open' AND pillar = ?1 ORDER BY severity DESC",
            COLS
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<KnowledgeGap> = stmt
            .query_map(params![pillar], map_gap_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    } else {
        let sql = format!(
            "SELECT {} FROM knowledge_gaps WHERE status = 'open' ORDER BY severity DESC",
            COLS
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<KnowledgeGap> = stmt
            .query_map([], map_gap_row)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };
    Ok(gaps)
}

fn detect_and_persist(conn: &Connection, filter_pillar: Option<String>) -> Result<Vec<KnowledgeGap>, String> {
    let now = Local::now();
    let review_rows = gather_review_rows(conn)?;
    let chat_stats = gather_chat_stats(conn)?;
    let pillar_activity = gather_pillar_activity(conn)?;
    let computed = compute_gaps(&review_rows, &chat_stats, &pillar_activity, now);
    upsert_gaps(conn, &computed, &now.to_rfc3339())?;
    read_active_gaps(conn, filter_pillar.as_deref())
}

// ── Tauri commands ─────────────────────────────────────────────────────────
/// Recompute gaps from live signals, persist lifecycle state, and return the
/// severity-ranked open gaps (optionally for a single pillar).
#[tauri::command]
pub fn get_knowledge_gaps(app: AppHandle, pillar: Option<String>) -> Result<Vec<KnowledgeGap>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    detect_and_persist(&conn, pillar)
}

/// Force a recompute (used after a review attempt) and return all open gaps.
#[tauri::command]
pub fn detect_knowledge_gaps(app: AppHandle) -> Result<Vec<KnowledgeGap>, String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    detect_and_persist(&conn, None)
}

/// Dismiss a gap. `snooze_days = None` dismisses permanently; a value snoozes
/// until that many days from now, after which detection reopens it if still weak.
#[tauri::command]
pub fn dismiss_gap(app: AppHandle, gap_id: String, snooze_days: Option<i32>) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now = Local::now();
    let dismissed_until = snooze_days.map(|d| (now + Duration::days(d as i64)).to_rfc3339());
    conn.execute(
        "UPDATE knowledge_gaps
         SET status = 'dismissed', dismissed_until = ?2, last_updated_at = ?3
         WHERE gap_id = ?1",
        params![gap_id, dismissed_until, now.to_rfc3339()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Mark a gap as drilled. Sets it resolved; the next detection pass reopens it
/// only if the underlying signals are still present.
#[tauri::command]
pub fn mark_gap_drilled(app: AppHandle, gap_id: String) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let now_rfc = Local::now().to_rfc3339();
    conn.execute(
        "UPDATE knowledge_gaps
         SET status = 'resolved', last_drilled_at = ?2, last_updated_at = ?2
         WHERE gap_id = ?1",
        params![gap_id, now_rfc],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> DateTime<Local> {
        Local::now()
    }

    fn review(pillar: &str, content: &str, ease: f32, last_quality: Option<i32>) -> ReviewRow {
        ReviewRow {
            pillar: Some(pillar.to_string()),
            content: content.to_string(),
            ease_factor: ease,
            repetitions: 0,
            last_quality,
        }
    }

    #[test]
    fn weak_quiz_produces_gap() {
        let rows = vec![review("llm", "What is RLHF?", 2.5, Some(1))];
        let gaps = compute_gaps(&rows, &[], &[], now());
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].pillar, "llm");
        assert!(gaps[0].signals.iter().any(|s| s.kind == "weak_quiz"));
        assert!(gaps[0].severity > 0.0);
    }

    #[test]
    fn low_ease_produces_gap() {
        let rows = vec![review("hardware", "Roofline model?", 1.4, Some(4))];
        let gaps = compute_gaps(&rows, &[], &[], now());
        assert_eq!(gaps.len(), 1);
        assert!(gaps[0].signals.iter().any(|s| s.kind == "low_ease"));
    }

    #[test]
    fn strong_item_no_false_positive() {
        let rows = vec![review("llm", "Attention?", 2.6, Some(5))];
        let gaps = compute_gaps(&rows, &[], &[], now());
        assert!(gaps.is_empty());
    }

    #[test]
    fn shallow_chat_produces_gap() {
        let stats = vec![ChatStat {
            pillar: "sales".to_string(),
            user_msg_count: 6,
            avg_user_len: 40.0,
            review_attempts: 0,
        }];
        let gaps = compute_gaps(&[], &stats, &[], now());
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].topic_key, PILLAR_TOPIC_KEY);
        assert!(gaps[0].signals.iter().any(|s| s.kind == "shallow_chat"));
    }

    #[test]
    fn engaged_chat_no_false_positive() {
        let stats = vec![ChatStat {
            pillar: "sales".to_string(),
            user_msg_count: 6,
            avg_user_len: 220.0,
            review_attempts: 5,
        }];
        let gaps = compute_gaps(&[], &stats, &[], now());
        assert!(gaps.is_empty());
    }

    #[test]
    fn stale_milestone_produces_gap() {
        let activity = vec![PillarActivity {
            pillar: "voice".to_string(),
            in_progress_milestones: 1,
            last_activity: Some(now() - Duration::days(30)),
        }];
        let gaps = compute_gaps(&[], &[], &activity, now());
        assert_eq!(gaps.len(), 1);
        assert!(gaps[0].signals.iter().any(|s| s.kind == "stale"));
    }

    #[test]
    fn recent_activity_not_stale() {
        let activity = vec![PillarActivity {
            pillar: "voice".to_string(),
            in_progress_milestones: 1,
            last_activity: Some(now() - Duration::days(2)),
        }];
        let gaps = compute_gaps(&[], &[], &activity, now());
        assert!(gaps.is_empty());
    }

    #[test]
    fn gaps_sorted_by_severity_desc() {
        let rows = vec![
            review("llm", "mild", 1.75, Some(2)),
            review("llm", "severe", 1.3, Some(0)),
        ];
        let gaps = compute_gaps(&rows, &[], &[], now());
        assert_eq!(gaps.len(), 2);
        assert!(gaps[0].severity >= gaps[1].severity);
    }

    // ── Persistence / lifecycle (in-memory DB) ─────────────────────────────
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE knowledge_gaps (
                gap_id TEXT PRIMARY KEY, pillar TEXT NOT NULL, topic_key TEXT NOT NULL,
                label TEXT NOT NULL, severity REAL NOT NULL, signal_summary TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open', first_detected_at TEXT NOT NULL,
                last_updated_at TEXT NOT NULL, dismissed_until TEXT, last_drilled_at TEXT,
                UNIQUE(pillar, topic_key)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn dismiss_until_future_suppresses_gap() {
        let conn = test_conn();
        let rows = vec![review("llm", "What is RLHF?", 1.3, Some(0))];
        let computed = compute_gaps(&rows, &[], &[], now());
        let now_rfc = now().to_rfc3339();
        upsert_gaps(&conn, &computed, &now_rfc).unwrap();
        assert_eq!(read_active_gaps(&conn, None).unwrap().len(), 1);

        let gap_id = computed[0].gap_id.clone();
        let future = (now() + Duration::days(7)).to_rfc3339();
        conn.execute(
            "UPDATE knowledge_gaps SET status='dismissed', dismissed_until=?2 WHERE gap_id=?1",
            params![gap_id, future],
        )
        .unwrap();

        // Recompute: gap still weak, but the active snooze keeps it hidden.
        upsert_gaps(&conn, &computed, &now_rfc).unwrap();
        assert!(read_active_gaps(&conn, None).unwrap().is_empty());
    }

    #[test]
    fn expired_snooze_reopens_gap() {
        let conn = test_conn();
        let rows = vec![review("llm", "What is RLHF?", 1.3, Some(0))];
        let computed = compute_gaps(&rows, &[], &[], now());
        let now_rfc = now().to_rfc3339();
        upsert_gaps(&conn, &computed, &now_rfc).unwrap();

        let gap_id = computed[0].gap_id.clone();
        let past = (now() - Duration::days(1)).to_rfc3339();
        conn.execute(
            "UPDATE knowledge_gaps SET status='dismissed', dismissed_until=?2 WHERE gap_id=?1",
            params![gap_id, past],
        )
        .unwrap();

        upsert_gaps(&conn, &computed, &now_rfc).unwrap();
        assert_eq!(read_active_gaps(&conn, None).unwrap().len(), 1);
    }

    #[test]
    fn cleared_signals_resolve_gap() {
        let conn = test_conn();
        let rows = vec![review("llm", "What is RLHF?", 1.3, Some(0))];
        let computed = compute_gaps(&rows, &[], &[], now());
        let now_rfc = now().to_rfc3339();
        upsert_gaps(&conn, &computed, &now_rfc).unwrap();
        assert_eq!(read_active_gaps(&conn, None).unwrap().len(), 1);

        // Next pass finds nothing weak → previously-open gap resolves.
        upsert_gaps(&conn, &[], &now_rfc).unwrap();
        assert!(read_active_gaps(&conn, None).unwrap().is_empty());
    }

    #[test]
    fn pillar_filter_scopes_results() {
        let conn = test_conn();
        let rows = vec![
            review("llm", "a", 1.3, Some(0)),
            review("sales", "b", 1.3, Some(0)),
        ];
        let computed = compute_gaps(&rows, &[], &[], now());
        upsert_gaps(&conn, &computed, &now().to_rfc3339()).unwrap();
        let llm_only = read_active_gaps(&conn, Some("llm")).unwrap();
        assert_eq!(llm_only.len(), 1);
        assert_eq!(llm_only[0].pillar, "llm");
    }
}
