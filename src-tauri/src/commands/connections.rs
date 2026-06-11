use chrono::{DateTime, Local};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

use crate::ai::ProviderConfig;
use crate::db::get_connection;

// ── Tunable parameters ─────────────────────────────────────────────────────
/// Days within which neighbor-pillar activity counts as "recently covered".
const RECENT_EVIDENCE_DAYS: i64 = 10;
/// Max callouts returned from a single detection pass.
const MAX_CALLOUTS: usize = 3;
/// Minimum Jaccard overlap before a dynamic cross-pillar link is surfaced.
const MIN_DYNAMIC_OVERLAP: f32 = 0.12;
/// Cap topic tags persisted per conversation (bounds prompt + overlap cost).
const MAX_TOPIC_TAGS: usize = 8;
/// Cap transcript chars sent to the tagging classifier.
const MAX_TAG_TRANSCRIPT_CHARS: usize = 6000;

/// System prompt for the topic-tagging classifier. Returns a small set of
/// normalized lowercase topic tags as a bare JSON array.
pub const CONNECTION_TAG_PROMPT: &str = "You extract topic tags from a tutoring conversation transcript.\n\nReturn ONLY a JSON array of 3–8 short, normalized topic tags (lowercase, 1–3 words each, no punctuation). Tags should capture the concrete subjects discussed — concepts, frameworks, techniques — not generic words like \"learning\" or \"question\".\n\nExample output:\n[\"attention mechanism\", \"kv cache\", \"quantization\", \"inference latency\"]\n\nReturn the JSON array and NOTHING else.";

// ── Static pillar-connection graph (mirrors src/data/pillarConnections.ts) ───
/// One pre-mapped, undirected semantic link between two pillars.
#[derive(Debug, Clone, Copy)]
pub struct StaticConnection {
    pub a: &'static str,
    pub b: &'static str,
    pub label: &'static str,
    pub rationale: &'static str,
    pub weight: f32,
}

/// The hand-curated connection graph. Kept in sync with the TS source of truth.
pub const STATIC_CONNECTIONS: &[StaticConnection] = &[
    StaticConnection { a: "llm", b: "mlops", label: "Deploying & serving models", rationale: "Understanding LLM internals directly informs how you monitor, serve, and optimize them in production.", weight: 0.9 },
    StaticConnection { a: "llm", b: "hardware", label: "Compute for training & inference", rationale: "Architecture choices (attention, parameter count, quantization) are bounded by the GPU/accelerator hardware that runs them.", weight: 0.85 },
    StaticConnection { a: "hardware", b: "mlops", label: "Inference cost & deployment targets", rationale: "Hardware selection and MLOps pipelines jointly decide latency, throughput, and the unit economics of serving.", weight: 0.75 },
    StaticConnection { a: "mlops", b: "finance", label: "FinOps & unit economics of AI", rationale: "Production ML spend (GPU hours, serving cost) is a core driver of gross margin and burn for an AI company.", weight: 0.7 },
    StaticConnection { a: "hardware", b: "finance", label: "Capex vs. cloud trade-offs", rationale: "Buy-vs-rent decisions on compute hardware are financial decisions about capex, depreciation, and runway.", weight: 0.6 },
    StaticConnection { a: "fundraising", b: "communication", label: "Pitch craft & narrative", rationale: "Raising capital is a communication problem — structured storytelling and executive presence move investors.", weight: 0.85 },
    StaticConnection { a: "fundraising", b: "finance", label: "Metrics investors underwrite", rationale: "Term sheets, cap tables, and the metrics (ARR, burn, runway) you raise on are financial literacy in action.", weight: 0.8 },
    StaticConnection { a: "fundraising", b: "roadmap", label: "Story the roadmap sells", rationale: "The technical roadmap is the growth story you pitch — milestones and prioritization underwrite the raise.", weight: 0.65 },
    StaticConnection { a: "communication", b: "voice", label: "Delivery & authority projection", rationale: "Structured messaging lands only when delivered well — vocal technique and presence are the delivery layer.", weight: 0.8 },
    StaticConnection { a: "communication", b: "roadmap", label: "Communicating strategy", rationale: "A roadmap only aligns the company if it is communicated with clarity, structure, and a compelling why.", weight: 0.7 },
    StaticConnection { a: "sales", b: "communication", label: "Persuasion & executive messaging", rationale: "Technical sales is structured persuasion — discovery, ROI framing, and executive communication win deals.", weight: 0.8 },
    StaticConnection { a: "sales", b: "finance", label: "ROI modeling & deal economics", rationale: "Closing enterprise deals means modeling buyer ROI and pricing against your own unit economics.", weight: 0.65 },
    StaticConnection { a: "security", b: "ip", label: "Protecting the technical moat", rationale: "Security posture and IP strategy both defend the company's assets — one guards data, the other guards inventions.", weight: 0.75 },
    StaticConnection { a: "security", b: "mlops", label: "Securing the ML pipeline", rationale: "Production ML systems are an attack surface — securing data, models, and deployment is part of MLOps maturity.", weight: 0.7 },
    StaticConnection { a: "security", b: "roadmap", label: "Compliance gates on the plan", rationale: "SOC 2 and safety standards are roadmap items — compliance timelines shape what ships and when.", weight: 0.55 },
    StaticConnection { a: "ip", b: "roadmap", label: "Defensibility shapes strategy", rationale: "What you patent or keep as a trade secret is a strategic roadmap choice about where to build a moat.", weight: 0.6 },
    StaticConnection { a: "ip", b: "fundraising", label: "IP as an investment thesis", rationale: "A defensible IP position is a core part of the diligence story investors underwrite a deep-tech raise on.", weight: 0.6 },
    StaticConnection { a: "hiring", b: "roadmap", label: "Staffing the plan", rationale: "The roadmap is only as real as the team that can execute it — hiring sequence follows strategic priorities.", weight: 0.7 },
    StaticConnection { a: "hiring", b: "finance", label: "Comp, equity & burn", rationale: "Engineering comp and equity grants are the largest line item — hiring decisions are financial decisions.", weight: 0.65 },
    StaticConnection { a: "hiring", b: "ip", label: "Employee IP & assignment", rationale: "Onboarding engineers means invention-assignment and confidentiality agreements that protect company IP.", weight: 0.5 },
    StaticConnection { a: "roadmap", b: "finance", label: "Budgeting the build", rationale: "Prioritization is a budgeting exercise — every roadmap bet is an allocation of finite capital and runway.", weight: 0.65 },
];

/// All static neighbors of `pillar`, de-duplicated by unordered pair. The
/// returned `other` is always the opposite end (never `pillar`).
pub fn static_neighbors(pillar: &str) -> Vec<&'static StaticConnection> {
    let mut seen: HashSet<(&str, &str)> = HashSet::new();
    let mut out = Vec::new();
    for c in STATIC_CONNECTIONS {
        let other = if c.a == pillar {
            c.b
        } else if c.b == pillar {
            c.a
        } else {
            continue;
        };
        let key = ordered_pair(pillar, other);
        if seen.insert(key) {
            out.push(c);
        }
    }
    out
}

/// Order-independent key for an undirected pillar pair.
fn ordered_pair<'a>(x: &'a str, y: &'a str) -> (&'a str, &'a str) {
    if x <= y {
        (x, y)
    } else {
        (y, x)
    }
}

// ── Wire type (camelCase to match the TS `ConnectionCallout`) ────────────────
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionCallout {
    pub from_pillar: String,
    pub to_pillar: String,
    pub label: String,
    pub rationale: String,
    /// "static" | "dynamic" | "both"
    pub source: String,
    pub recent_evidence: Option<String>,
    pub conversation_id: Option<String>,
    pub score: f32,
}

// ── Pure-compute input rows ─────────────────────────────────────────────────
/// Recent activity in a pillar, used to score "covered last week" evidence.
#[derive(Debug, Clone)]
pub struct PillarActivity {
    pub pillar: String,
    pub last_activity: Option<DateTime<Local>>,
    /// A short human label for the most recent touch (conversation title / note).
    pub recent_label: Option<String>,
    /// The conversation to deep-link into, if any.
    pub conversation_id: Option<String>,
}

/// A past conversation's extracted topic fingerprint (for dynamic discovery).
#[derive(Debug, Clone)]
pub struct ConversationTopics {
    pub conversation_id: String,
    pub pillar: String,
    pub topics: Vec<String>,
    pub title: Option<String>,
}

// ── Dynamic discovery: Jaccard topic overlap (pure) ──────────────────────────
/// Jaccard similarity between two topic-tag sets (0–1). Empty sets → 0.
pub fn jaccard(a: &[String], b: &[String]) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let sa: HashSet<&str> = a.iter().map(|s| s.as_str()).collect();
    let sb: HashSet<&str> = b.iter().map(|s| s.as_str()).collect();
    let inter = sa.intersection(&sb).count() as f32;
    let union = sa.union(&sb).count() as f32;
    if union == 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// Rank cross-pillar links discovered from conversation topic overlap.
///
/// Compares `current` (the active conversation's topics) against every other
/// conversation in a *different* pillar, keeping the strongest match per
/// neighbor pillar above `MIN_DYNAMIC_OVERLAP`. Pure and deterministic — the
/// caller supplies the rows.
pub fn compute_dynamic_connections(
    current_pillar: &str,
    current_topics: &[String],
    others: &[ConversationTopics],
) -> Vec<ConnectionCallout> {
    // best score + evidence per neighbor pillar
    let mut best: HashMap<String, (f32, Option<String>, Option<String>)> = HashMap::new();

    for other in others {
        if other.pillar == current_pillar || other.pillar.is_empty() {
            continue;
        }
        let score = jaccard(current_topics, &other.topics);
        if score < MIN_DYNAMIC_OVERLAP {
            continue;
        }
        let entry = best
            .entry(other.pillar.clone())
            .or_insert((0.0, None, None));
        if score > entry.0 {
            *entry = (score, other.title.clone(), Some(other.conversation_id.clone()));
        }
    }

    let mut out: Vec<ConnectionCallout> = best
        .into_iter()
        .map(|(pillar, (score, title, conv_id))| {
            let shared = shared_topics(current_topics, others, &pillar);
            let evidence = match title {
                Some(t) => Some(format!("Overlaps with “{}”{}", t, fmt_shared(&shared))),
                None => Some(format!("Topic overlap detected{}", fmt_shared(&shared))),
            };
            ConnectionCallout {
                from_pillar: current_pillar.to_string(),
                to_pillar: pillar,
                label: "Shared concepts in your recent sessions".to_string(),
                rationale:
                    "Your recent work in these two areas covered overlapping concepts — worth connecting them explicitly."
                        .to_string(),
                source: "dynamic".to_string(),
                recent_evidence: evidence,
                conversation_id: conv_id,
                score,
            }
        })
        .collect();

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Topic tags shared between `current_topics` and any conversation in `pillar`.
fn shared_topics(current: &[String], others: &[ConversationTopics], pillar: &str) -> Vec<String> {
    let cur: HashSet<&str> = current.iter().map(|s| s.as_str()).collect();
    let mut shared: HashSet<String> = HashSet::new();
    for o in others.iter().filter(|o| o.pillar == pillar) {
        for t in &o.topics {
            if cur.contains(t.as_str()) {
                shared.insert(t.clone());
            }
        }
    }
    let mut v: Vec<String> = shared.into_iter().collect();
    v.sort();
    v
}

fn fmt_shared(shared: &[String]) -> String {
    if shared.is_empty() {
        String::new()
    } else {
        format!(" — shared: {}", shared.join(", "))
    }
}

// ── Static scoring + merge (pure) ───────────────────────────────────────────
/// Build static-graph callouts for `pillar`, scoring each neighbor by recent
/// activity. A neighbor touched within `RECENT_EVIDENCE_DAYS` gets a recency
/// boost and a "covered last week" evidence line.
pub fn compute_static_connections(
    pillar: &str,
    activity: &[PillarActivity],
    now: DateTime<Local>,
) -> Vec<ConnectionCallout> {
    let act_by_pillar: HashMap<&str, &PillarActivity> =
        activity.iter().map(|a| (a.pillar.as_str(), a)).collect();

    let mut out: Vec<ConnectionCallout> = static_neighbors(pillar)
        .into_iter()
        .map(|c| {
            let other = if c.a == pillar { c.b } else { c.a };
            let act = act_by_pillar.get(other);

            let days = act
                .and_then(|a| a.last_activity)
                .map(|ts| (now - ts).num_days());
            let recent = days.is_some_and(|d| (0..=RECENT_EVIDENCE_DAYS).contains(&d));

            let (evidence, conv_id) = if recent {
                let label = act
                    .and_then(|a| a.recent_label.clone())
                    .filter(|s| !s.is_empty());
                let when = match days {
                    Some(0) => "today".to_string(),
                    Some(1) => "yesterday".to_string(),
                    Some(d) if d < 7 => format!("{} days ago", d),
                    Some(d) => format!("{} weeks ago", (d as f32 / 7.0).round() as i64),
                    None => "recently".to_string(),
                };
                let ev = match label {
                    Some(l) => format!("You covered {} ({}) — “{}”", other, when, l),
                    None => format!("You covered {} {}", other, when),
                };
                (Some(ev), act.and_then(|a| a.conversation_id.clone()))
            } else {
                (None, None)
            };

            // Recency boosts the static weight so freshly-touched neighbors rank up.
            let score = if recent { (c.weight + 0.2).min(1.0) } else { c.weight * 0.6 };

            ConnectionCallout {
                from_pillar: pillar.to_string(),
                to_pillar: other.to_string(),
                label: c.label.to_string(),
                rationale: c.rationale.to_string(),
                source: "static".to_string(),
                recent_evidence: evidence,
                conversation_id: conv_id,
                score,
            }
        })
        .collect();

    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Merge static + dynamic callouts. Same unordered (from,to) pair from both
/// sources collapses to one `both`-sourced callout with summed score and the
/// richer evidence/rationale. Returns the merged set sorted by score desc.
pub fn merge_connections(
    statics: Vec<ConnectionCallout>,
    dynamics: Vec<ConnectionCallout>,
) -> Vec<ConnectionCallout> {
    let mut by_pair: HashMap<(String, String), ConnectionCallout> = HashMap::new();

    for c in statics.into_iter().chain(dynamics.into_iter()) {
        let key = {
            let (x, y) = ordered_pair(&c.from_pillar, &c.to_pillar);
            (x.to_string(), y.to_string())
        };
        match by_pair.get_mut(&key) {
            None => {
                by_pair.insert(key, c);
            }
            Some(existing) => {
                existing.score += c.score;
                existing.source = "both".to_string();
                // Prefer the static label/rationale (curated), but keep dynamic
                // evidence if the static side had none.
                if existing.recent_evidence.is_none() {
                    existing.recent_evidence = c.recent_evidence;
                }
                if existing.conversation_id.is_none() {
                    existing.conversation_id = c.conversation_id;
                }
            }
        }
    }

    let mut out: Vec<ConnectionCallout> = by_pair.into_values().collect();
    out.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Parse the tagging classifier output into a normalized, bounded tag list.
/// Tolerant of a bare JSON array or one wrapped in prose; returns `[]` on
/// failure rather than erroring.
pub fn parse_topic_tags(raw: &str) -> Vec<String> {
    let json_text = extract_first_json_array(raw).unwrap_or_else(|| raw.trim().to_string());
    let value: serde_json::Value = match serde_json::from_str(&json_text) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let arr = match value.as_array() {
        Some(a) => a,
        None => return Vec::new(),
    };
    let mut seen = HashSet::new();
    arr.iter()
        .filter_map(|v| v.as_str())
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty() && s.len() <= 40)
        .filter(|s| seen.insert(s.clone()))
        .take(MAX_TOPIC_TAGS)
        .collect()
}

/// Returns the first balanced `[...]` JSON array substring, or None.
fn extract_first_json_array(text: &str) -> Option<String> {
    let start = text.find('[')?;
    let mut depth = 0;
    for (i, ch) in text[start..].char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(text[start..start + i + 1].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

// ── DB reads ─────────────────────────────────────────────────────────────────
fn parse_local(ts: &str) -> Option<DateTime<Local>> {
    DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Local))
}

/// Most-recent activity per pillar, from conversations + sessions, with a
/// human label and a conversation id to deep-link into.
fn gather_pillar_activity(conn: &Connection) -> Result<Vec<PillarActivity>, String> {
    let mut by_pillar: HashMap<String, PillarActivity> = HashMap::new();

    // Most recent conversation per pillar (title + id for evidence/deep-link).
    {
        let mut stmt = conn
            .prepare(
                "SELECT pillar, id, title, updated_at FROM conversations
                 WHERE pillar IS NOT NULL AND pillar <> ''
                 ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let pillar: String = row.get(0)?;
                let id: String = row.get(1)?;
                let title: Option<String> = row.get(2)?;
                let updated: Option<String> = row.get(3)?;
                Ok((pillar, id, title, updated))
            })
            .map_err(|e| e.to_string())?;
        for (pillar, id, title, updated) in rows.filter_map(|r| r.ok()) {
            let ts = updated.as_deref().and_then(parse_local);
            // First row per pillar wins (query is DESC by updated_at).
            by_pillar.entry(pillar.clone()).or_insert(PillarActivity {
                pillar,
                last_activity: ts,
                recent_label: title,
                conversation_id: Some(id),
            });
        }
    }

    // Session activity can be more recent than any conversation — fold it in.
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
            let ts = ts.as_deref().and_then(parse_local);
            match by_pillar.get_mut(&pillar) {
                Some(act) => {
                    if let Some(t) = ts {
                        if act.last_activity.is_none_or(|cur| t > cur) {
                            act.last_activity = Some(t);
                        }
                    }
                }
                None => {
                    by_pillar.insert(
                        pillar.clone(),
                        PillarActivity {
                            pillar,
                            last_activity: ts,
                            recent_label: None,
                            conversation_id: None,
                        },
                    );
                }
            }
        }
    }

    Ok(by_pillar.into_values().collect())
}

/// All persisted conversation topic fingerprints except `exclude_id`.
fn gather_other_topics(
    conn: &Connection,
    exclude_id: &str,
) -> Result<Vec<ConversationTopics>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.conversation_id, t.pillar, t.topics, c.title
             FROM conversation_topics t
             LEFT JOIN conversations c ON c.id = t.conversation_id
             WHERE t.conversation_id <> ?1 AND t.pillar IS NOT NULL AND t.pillar <> ''",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![exclude_id], |row| {
            let conversation_id: String = row.get(0)?;
            let pillar: String = row.get(1)?;
            let topics_json: String = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            Ok((conversation_id, pillar, topics_json, title))
        })
        .map_err(|e| e.to_string())?;

    let out = rows
        .filter_map(|r| r.ok())
        .map(|(conversation_id, pillar, topics_json, title)| {
            let topics: Vec<String> = serde_json::from_str(&topics_json).unwrap_or_default();
            ConversationTopics {
                conversation_id,
                pillar,
                topics,
                title,
            }
        })
        .collect();
    Ok(out)
}

/// Read a conversation's stored topics, if any.
fn read_conversation_topics(conn: &Connection, conversation_id: &str) -> Option<Vec<String>> {
    let topics_json: Option<String> = conn
        .query_row(
            "SELECT topics FROM conversation_topics WHERE conversation_id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )
        .ok();
    topics_json.and_then(|j| serde_json::from_str::<Vec<String>>(&j).ok())
}

/// Persist a conversation's extracted topic fingerprint (upsert).
fn save_conversation_topics(
    conn: &Connection,
    conversation_id: &str,
    pillar: &str,
    topics: &[String],
    model: Option<&str>,
    now: &str,
) -> Result<(), String> {
    let topics_json = serde_json::to_string(topics).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO conversation_topics
             (conversation_id, pillar, topics, model, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![conversation_id, pillar, topics_json, model, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Seen / dismissed callout bookkeeping ────────────────────────────────────
/// Unordered-pair key for the `pillar_connections_seen` table.
fn seen_key(from: &str, to: &str) -> (String, String) {
    let (x, y) = ordered_pair(from, to);
    (x.to_string(), y.to_string())
}

/// Pairs (for a conversation) the learner has dismissed — must stay hidden.
fn dismissed_pairs(conn: &Connection, conversation_id: &str) -> Result<HashSet<(String, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT from_pillar, to_pillar FROM pillar_connections_seen
             WHERE conversation_id = ?1 AND status = 'dismissed'",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id], |row| {
            let from: String = row.get(0)?;
            let to: String = row.get(1)?;
            Ok((from, to))
        })
        .map_err(|e| e.to_string())?;
    let set = rows
        .filter_map(|r| r.ok())
        .map(|(from, to)| {
            let (x, y) = ordered_pair(&from, &to);
            (x.to_string(), y.to_string())
        })
        .collect();
    Ok(set)
}

/// Record that a callout was surfaced (so we can dedupe future passes).
fn record_surfaced(
    conn: &Connection,
    conversation_id: &str,
    callout: &ConnectionCallout,
    now: &str,
) -> Result<(), String> {
    let (from, to) = seen_key(&callout.from_pillar, &callout.to_pillar);
    conn.execute(
        "INSERT INTO pillar_connections_seen
             (conversation_id, from_pillar, to_pillar, status, last_shown_at)
         VALUES (?1, ?2, ?3, 'surfaced', ?4)
         ON CONFLICT(conversation_id, from_pillar, to_pillar)
         DO UPDATE SET last_shown_at = ?4
             WHERE pillar_connections_seen.status <> 'dismissed'",
        params![conversation_id, from, to, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands ───────────────────────────────────────────────────────────
/// Detect cross-pillar connections for an active conversation/pillar.
///
/// Merges the static connection graph (scored by recent neighbor activity) with
/// dynamically-discovered topic overlap against the learner's other
/// conversations. Dismissed pairs are filtered out and the top results are
/// recorded as surfaced. The dynamic step is best-effort — a missing API key or
/// provider error degrades gracefully to static-only.
#[tauri::command]
pub async fn detect_connections(
    app: AppHandle,
    conversation_id: String,
    pillar: String,
    config: ProviderConfig,
) -> Result<Vec<ConnectionCallout>, String> {
    if pillar.trim().is_empty() {
        return Ok(Vec::new());
    }

    // 1. Brief synchronous read: activity, existing topics, other fingerprints,
    //    dismissals. Release the connection before any async AI work.
    let (activity, existing_topics, dismissed, others_for_existing) = {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        let activity = gather_pillar_activity(&conn)?;
        let existing_topics = read_conversation_topics(&conn, &conversation_id);
        let dismissed = dismissed_pairs(&conn, &conversation_id)?;
        let others = gather_other_topics(&conn, &conversation_id)?;
        (activity, existing_topics, dismissed, others)
    };

    let now = Local::now();
    let statics = compute_static_connections(&pillar, &activity, now);

    // 2. Dynamic discovery (best-effort). Tag the conversation if not already
    //    tagged, then rank topic overlap against other conversations.
    let dynamics = match resolve_topics(
        &app,
        &conversation_id,
        &pillar,
        existing_topics,
        config,
        &now.to_rfc3339(),
    )
    .await
    {
        Some(topics) if !topics.is_empty() => {
            compute_dynamic_connections(&pillar, &topics, &others_for_existing)
        }
        _ => Vec::new(),
    };

    // 3. Merge, filter dismissed, cap, and record surfaced rows.
    let merged = merge_connections(statics, dynamics);
    let filtered: Vec<ConnectionCallout> = merged
        .into_iter()
        .filter(|c| {
            let (x, y) = ordered_pair(&c.from_pillar, &c.to_pillar);
            !dismissed.contains(&(x.to_string(), y.to_string()))
        })
        .take(MAX_CALLOUTS)
        .collect();

    if !filtered.is_empty() {
        let conn = get_connection(&app).map_err(|e| e.to_string())?;
        let now_rfc = now.to_rfc3339();
        for c in &filtered {
            // Best-effort bookkeeping — never fail detection over a dedupe write.
            let _ = record_surfaced(&conn, &conversation_id, c, &now_rfc);
        }
    }

    Ok(filtered)
}

/// Resolve topic tags for a conversation: reuse persisted tags, else tag via the
/// classifier and persist. Returns None on any failure (graceful static-only).
async fn resolve_topics(
    app: &AppHandle,
    conversation_id: &str,
    pillar: &str,
    existing: Option<Vec<String>>,
    config: ProviderConfig,
    now: &str,
) -> Option<Vec<String>> {
    if let Some(topics) = existing {
        if !topics.is_empty() {
            return Some(topics);
        }
    }

    // Build a transcript from the conversation's messages.
    let transcript = {
        let conn = get_connection(app).ok()?;
        let mut stmt = conn
            .prepare(
                "SELECT role, content FROM chat_messages
                 WHERE conversation_id = ?1 ORDER BY created_at ASC",
            )
            .ok()?;
        let rows = stmt
            .query_map(params![conversation_id], |row| {
                let role: String = row.get(0)?;
                let content: String = row.get(1)?;
                Ok((role, content))
            })
            .ok()?;
        let mut buf = String::new();
        for (role, content) in rows.filter_map(|r| r.ok()) {
            let label = if role == "assistant" { "ASSISTANT" } else { "USER" };
            let clean = strip_genui(&content);
            if clean.is_empty() {
                continue;
            }
            buf.push_str(label);
            buf.push_str(": ");
            buf.push_str(&clean);
            buf.push_str("\n\n");
            if buf.len() >= MAX_TAG_TRANSCRIPT_CHARS {
                break;
            }
        }
        buf
    };

    if transcript.trim().is_empty() {
        return None;
    }

    let model = config.model.clone();
    let messages = vec![crate::ai::AiMessage {
        role: "user".to_string(),
        content: transcript,
    }];
    let completion = crate::commands::ai::collect_completion(
        messages,
        Some(CONNECTION_TAG_PROMPT.to_string()),
        config,
        Some(45),
    )
    .await
    .ok()?;

    let tags = parse_topic_tags(&completion);
    if tags.is_empty() {
        return None;
    }

    // Persist for reuse (best-effort).
    if let Ok(conn) = get_connection(app) {
        let _ = save_conversation_topics(&conn, conversation_id, pillar, &tags, Some(&model), now);
    }

    Some(tags)
}

/// Dismiss a surfaced connection so it stops appearing for this conversation.
/// The pair is stored order-independently.
#[tauri::command]
pub fn dismiss_connection(
    app: AppHandle,
    conversation_id: String,
    from_pillar: String,
    to_pillar: String,
) -> Result<(), String> {
    let conn = get_connection(&app).map_err(|e| e.to_string())?;
    let (from, to) = seen_key(&from_pillar, &to_pillar);
    let now = Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO pillar_connections_seen
             (conversation_id, from_pillar, to_pillar, status, last_shown_at)
         VALUES (?1, ?2, ?3, 'dismissed', ?4)
         ON CONFLICT(conversation_id, from_pillar, to_pillar)
         DO UPDATE SET status = 'dismissed', last_shown_at = ?4",
        params![conversation_id, from, to, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Strip `<genui …>…</genui>` blocks from a message, leaving prose.
fn strip_genui(content: &str) -> String {
    // Simple state machine — avoids a regex dep, mirrors stripGenUITags.
    let mut out = String::with_capacity(content.len());
    let mut rest = content;
    while let Some(open) = rest.find("<genui") {
        out.push_str(&rest[..open]);
        match rest[open..].find("</genui>") {
            Some(close_rel) => {
                let close_abs = open + close_rel + "</genui>".len();
                rest = &rest[close_abs..];
            }
            None => {
                // Unterminated block — drop the remainder.
                rest = "";
                break;
            }
        }
    }
    out.push_str(rest);
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn now() -> DateTime<Local> {
        Local::now()
    }

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    // ── Static graph integrity ─────────────────────────────────────────────
    #[test]
    fn static_graph_is_valid() {
        const VALID: &[&str] = &[
            "llm", "hardware", "sales", "communication", "voice", "fundraising", "roadmap",
            "security", "hiring", "mlops", "ip", "finance",
        ];
        let mut seen: HashSet<(&str, &str)> = HashSet::new();
        for c in STATIC_CONNECTIONS {
            assert_ne!(c.a, c.b, "no self-loops");
            assert!(VALID.contains(&c.a), "valid pillar a: {}", c.a);
            assert!(VALID.contains(&c.b), "valid pillar b: {}", c.b);
            assert!((0.0..=1.0).contains(&c.weight), "weight normalized");
            let key = ordered_pair(c.a, c.b);
            assert!(seen.insert(key), "no duplicate pair: {:?}", key);
        }
    }

    #[test]
    fn static_neighbors_are_symmetric() {
        // llm↔mlops must surface from both ends.
        assert!(static_neighbors("llm").iter().any(|c| {
            (c.a == "mlops") || (c.b == "mlops")
        }));
        assert!(static_neighbors("mlops").iter().any(|c| {
            (c.a == "llm") || (c.b == "llm")
        }));
    }

    // ── Jaccard ────────────────────────────────────────────────────────────
    #[test]
    fn jaccard_basic() {
        assert_eq!(jaccard(&s(&["a", "b"]), &s(&["a", "b"])), 1.0);
        assert_eq!(jaccard(&s(&["a"]), &s(&["b"])), 0.0);
        assert_eq!(jaccard(&[], &s(&["a"])), 0.0);
        // {a,b,c} vs {b,c,d} → inter 2 / union 4 = 0.5
        assert!((jaccard(&s(&["a", "b", "c"]), &s(&["b", "c", "d"])) - 0.5).abs() < 1e-6);
    }

    // ── Dynamic discovery ──────────────────────────────────────────────────
    #[test]
    fn dynamic_ranks_cross_pillar_overlap() {
        let others = vec![
            ConversationTopics {
                conversation_id: "c1".into(),
                pillar: "communication".into(),
                topics: s(&["okrs", "prioritization", "narrative"]),
                title: Some("Comms frameworks".into()),
            },
            ConversationTopics {
                conversation_id: "c2".into(),
                pillar: "roadmap".into(), // same pillar as current — must be skipped
                topics: s(&["okrs", "prioritization"]),
                title: None,
            },
        ];
        let current = s(&["okrs", "prioritization", "build vs buy"]);
        let out = compute_dynamic_connections("roadmap", &current, &others);
        assert_eq!(out.len(), 1, "only the cross-pillar comms match surfaces");
        assert_eq!(out[0].to_pillar, "communication");
        assert_eq!(out[0].source, "dynamic");
        assert!(out[0].recent_evidence.is_some());
    }

    #[test]
    fn dynamic_below_threshold_dropped() {
        let others = vec![ConversationTopics {
            conversation_id: "c1".into(),
            pillar: "finance".into(),
            topics: s(&["arr", "cac", "ltv", "burn", "runway", "margin", "pricing", "cohorts"]),
            title: None,
        }];
        // Single shared tag out of a large union → below MIN_DYNAMIC_OVERLAP.
        let current = s(&["arr", "attention", "kv cache", "quantization"]);
        let out = compute_dynamic_connections("llm", &current, &others);
        assert!(out.is_empty());
    }

    // ── Static scoring ─────────────────────────────────────────────────────
    #[test]
    fn static_recent_neighbor_boosted_with_evidence() {
        let activity = vec![PillarActivity {
            pillar: "mlops".into(),
            last_activity: Some(now() - Duration::days(3)),
            recent_label: Some("Serving latency".into()),
            conversation_id: Some("conv-mlops".into()),
        }];
        let out = compute_static_connections("llm", &activity, now());
        let mlops = out.iter().find(|c| c.to_pillar == "mlops").unwrap();
        assert!(mlops.recent_evidence.is_some());
        assert_eq!(mlops.conversation_id.as_deref(), Some("conv-mlops"));
        // Boosted above its base weight (0.9 → capped 1.0).
        assert!(mlops.score > 0.9);
        // A non-recent neighbor is discounted.
        let stale = out.iter().find(|c| c.recent_evidence.is_none()).unwrap();
        assert!(stale.score < 0.9);
    }

    // ── Merge ──────────────────────────────────────────────────────────────
    #[test]
    fn merge_marks_both_and_sums_score() {
        let statics = vec![ConnectionCallout {
            from_pillar: "roadmap".into(),
            to_pillar: "communication".into(),
            label: "Communicating strategy".into(),
            rationale: "static".into(),
            source: "static".into(),
            recent_evidence: None,
            conversation_id: None,
            score: 0.4,
        }];
        let dynamics = vec![ConnectionCallout {
            from_pillar: "roadmap".into(),
            to_pillar: "communication".into(),
            label: "Shared concepts".into(),
            rationale: "dynamic".into(),
            source: "dynamic".into(),
            recent_evidence: Some("Overlaps with X".into()),
            conversation_id: Some("c9".into()),
            score: 0.3,
        }];
        let merged = merge_connections(statics, dynamics);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, "both");
        assert!((merged[0].score - 0.7).abs() < 1e-6);
        // Static label kept, dynamic evidence grafted in.
        assert_eq!(merged[0].rationale, "static");
        assert_eq!(merged[0].recent_evidence.as_deref(), Some("Overlaps with X"));
        assert_eq!(merged[0].conversation_id.as_deref(), Some("c9"));
    }

    #[test]
    fn merge_pair_order_independent() {
        let statics = vec![ConnectionCallout {
            from_pillar: "llm".into(),
            to_pillar: "mlops".into(),
            label: "x".into(),
            rationale: "x".into(),
            source: "static".into(),
            recent_evidence: None,
            conversation_id: None,
            score: 0.5,
        }];
        // Reversed order from the dynamic side — must collapse to one.
        let dynamics = vec![ConnectionCallout {
            from_pillar: "mlops".into(),
            to_pillar: "llm".into(),
            label: "y".into(),
            rationale: "y".into(),
            source: "dynamic".into(),
            recent_evidence: None,
            conversation_id: None,
            score: 0.5,
        }];
        let merged = merge_connections(statics, dynamics);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].source, "both");
    }

    // ── Tag parsing ────────────────────────────────────────────────────────
    #[test]
    fn parse_tags_tolerant() {
        assert_eq!(
            parse_topic_tags(r#"["Attention", "KV Cache", "attention"]"#),
            vec!["attention", "kv cache"] // lowercased + deduped
        );
        assert_eq!(
            parse_topic_tags("Here are the tags: [\"okrs\", \"roadmap\"] done"),
            vec!["okrs", "roadmap"]
        );
        assert!(parse_topic_tags("not json").is_empty());
        assert!(parse_topic_tags(r#"{"not":"array"}"#).is_empty());
    }

    #[test]
    fn parse_tags_caps_count() {
        let many: Vec<String> = (0..20).map(|i| format!("\"tag{}\"", i)).collect();
        let raw = format!("[{}]", many.join(","));
        assert_eq!(parse_topic_tags(&raw).len(), MAX_TOPIC_TAGS);
    }

    // ── strip_genui ────────────────────────────────────────────────────────
    #[test]
    fn strip_genui_removes_blocks() {
        let input = "Before <genui type=\"quiz\">{\"a\":1}</genui> after";
        assert_eq!(strip_genui(input), "Before  after");
        let unterminated = "text <genui type=\"x\">oops";
        assert_eq!(strip_genui(unterminated), "text");
    }

    // ── DB-backed dedupe / dismiss ─────────────────────────────────────────
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE pillar_connections_seen (
                conversation_id TEXT NOT NULL,
                from_pillar     TEXT NOT NULL,
                to_pillar       TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'surfaced',
                last_shown_at   TEXT NOT NULL,
                PRIMARY KEY (conversation_id, from_pillar, to_pillar)
            );
            CREATE TABLE conversation_topics (
                conversation_id TEXT PRIMARY KEY,
                pillar          TEXT,
                topics          TEXT NOT NULL DEFAULT '[]',
                model           TEXT,
                updated_at      TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn dismiss_then_excluded() {
        let conn = test_conn();
        // Dismiss llm↔mlops (order-independent).
        let (from, to) = seen_key("mlops", "llm");
        conn.execute(
            "INSERT INTO pillar_connections_seen (conversation_id, from_pillar, to_pillar, status, last_shown_at)
             VALUES ('conv1', ?1, ?2, 'dismissed', '2026-06-01T00:00:00Z')",
            params![from, to],
        )
        .unwrap();

        let dismissed = dismissed_pairs(&conn, "conv1").unwrap();
        // Query in the opposite order — still matched.
        let (x, y) = ordered_pair("llm", "mlops");
        assert!(dismissed.contains(&(x.to_string(), y.to_string())));
    }

    #[test]
    fn record_surfaced_does_not_override_dismissed() {
        let conn = test_conn();
        let callout = ConnectionCallout {
            from_pillar: "llm".into(),
            to_pillar: "mlops".into(),
            label: "x".into(),
            rationale: "x".into(),
            source: "static".into(),
            recent_evidence: None,
            conversation_id: None,
            score: 0.5,
        };
        // Pre-dismiss, then attempt to record surfaced — status must stay dismissed.
        let (from, to) = seen_key("llm", "mlops");
        conn.execute(
            "INSERT INTO pillar_connections_seen (conversation_id, from_pillar, to_pillar, status, last_shown_at)
             VALUES ('conv1', ?1, ?2, 'dismissed', '2026-06-01T00:00:00Z')",
            params![from, to],
        )
        .unwrap();
        record_surfaced(&conn, "conv1", &callout, "2026-06-02T00:00:00Z").unwrap();

        let status: String = conn
            .query_row(
                "SELECT status FROM pillar_connections_seen WHERE conversation_id = 'conv1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "dismissed");
    }

    #[test]
    fn save_and_read_topics_roundtrip() {
        let conn = test_conn();
        save_conversation_topics(&conn, "c1", "llm", &s(&["attention", "rlhf"]), Some("m"), "2026-06-01T00:00:00Z")
            .unwrap();
        let topics = read_conversation_topics(&conn, "c1").unwrap();
        assert_eq!(topics, s(&["attention", "rlhf"]));
    }
}
