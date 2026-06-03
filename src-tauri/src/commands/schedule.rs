use chrono::{Datelike, Local, NaiveDate, Weekday};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::commands::progress::get_streak;
use crate::commands::rebalance::{load_applied_adjustments, PillarAdjustment};
use crate::commands::review::{get_review_counts, ReviewCounts};

/// Bounds for a reweighted schedule block, in minutes.
const MIN_BLOCK_MINUTES: i64 = 15;
const MAX_BLOCK_MINUTES: i64 = 120;
/// Duration of an injected catch-up block for a behind pillar with no block today.
const CATCH_UP_BLOCK_MINUTES: u32 = 30;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScheduleBlock {
    pub pillar: String,
    pub duration_min: u32,
    pub topic: String,
    pub time_label: String,
    pub emoji: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TodaySchedule {
    pub date: String,
    pub day_name: String,
    pub week_number: u32,
    pub blocks: Vec<ScheduleBlock>,
    pub current_focus: String,
}

fn get_week_number(from: NaiveDate) -> u32 {
    let sprint_start = NaiveDate::from_ymd_opt(2026, 6, 1).unwrap();
    if from < sprint_start {
        return 1;
    }
    let days = (from - sprint_start).num_days();
    (days / 7 + 1).min(12) as u32
}

fn get_pillar_topic(pillar: &str, week: u32) -> String {
    match pillar {
        "llm" => match week {
            1 => "Transformer architecture & attention mechanisms".to_string(),
            2 => "Tokenization, embeddings & positional encoding".to_string(),
            3 => "Pre-training: objectives, data, compute".to_string(),
            4 => "Fine-tuning: SFT & instruction tuning".to_string(),
            5 => "RLHF: reward modeling & PPO".to_string(),
            6 => "DPO, RLAIF & constitutional AI".to_string(),
            7 => "Scaling laws & emergent capabilities".to_string(),
            8 => "Inference optimization: KV cache, batching".to_string(),
            9 => "Quantization & model compression".to_string(),
            10 => "Mixture of Experts & sparse models".to_string(),
            11 => "Multimodal LLMs & vision-language models".to_string(),
            12 => "LLM evaluation, benchmarks & red-teaming".to_string(),
            _ => "Advanced LLM topics".to_string(),
        },
        "hardware" => match week {
            1 => "GPU architecture: SMs, CUDA cores, memory hierarchy".to_string(),
            2 => "FLOP counting & roofline model".to_string(),
            3 => "Tensor parallelism & pipeline parallelism".to_string(),
            4 => "NVLink, InfiniBand & interconnects".to_string(),
            5 => "Custom silicon: TPU, Trainium, Gaudi".to_string(),
            6 => "Memory bandwidth optimization".to_string(),
            7 => "FlashAttention & kernel fusion".to_string(),
            8 => "Inference chips: inference vs training tradeoffs".to_string(),
            9 => "Power efficiency & thermal design".to_string(),
            10 => "Data center networking for AI clusters".to_string(),
            11 => "Edge AI hardware & deployment".to_string(),
            12 => "Hardware roadmaps: NVIDIA, AMD, Intel, startups".to_string(),
            _ => "Advanced hardware topics".to_string(),
        },
        "sales" => match week {
            1 => "Robotics industry landscape & buyers".to_string(),
            2 => "ICP definition & outbound prospecting".to_string(),
            3 => "Technical discovery: robot failure modes".to_string(),
            4 => "ROI modeling for robot downtime".to_string(),
            5 => "Demo scripting for technical audiences".to_string(),
            6 => "Handling objections from CTO buyers".to_string(),
            7 => "Competitive positioning vs alternatives".to_string(),
            8 => "Multi-threading enterprise deals".to_string(),
            9 => "Closing & negotiation techniques".to_string(),
            10 => "Customer success & expansion plays".to_string(),
            11 => "Partner & channel strategies".to_string(),
            12 => "Building sales playbook & repeatable motion".to_string(),
            _ => "Advanced sales topics".to_string(),
        },
        "communication" => match week {
            1 => "Pyramid principle & structured communication".to_string(),
            2 => "Executive presence: voice & body language".to_string(),
            3 => "Technical storytelling for non-technical audience".to_string(),
            4 => "Written communication: emails & docs".to_string(),
            5 => "Presentation design & slide craft".to_string(),
            6 => "Handling tough questions & objections".to_string(),
            7 => "Negotiation communication patterns".to_string(),
            8 => "Cross-cultural communication".to_string(),
            9 => "Async communication for remote teams".to_string(),
            10 => "Crisis communication & difficult conversations".to_string(),
            11 => "Public speaking & conference talks".to_string(),
            12 => "Personal brand & thought leadership".to_string(),
            _ => "Advanced communication topics".to_string(),
        },
        "voice" => match week {
            1 => "Breathing & diaphragm support techniques".to_string(),
            2 => "Resonance & vocal placement".to_string(),
            3 => "Pacing, pausing & silence as power".to_string(),
            4 => "Articulation & clarity drills".to_string(),
            5 => "Vocal variety: pitch & tone modulation".to_string(),
            6 => "Recording & self-assessment practice".to_string(),
            7 => "Authority & command projection".to_string(),
            8 => "Storytelling with voice: narrative arc".to_string(),
            9 => "Interview & podcast voice presence".to_string(),
            10 => "High-stakes speaking: board & investor pitches".to_string(),
            11 => "Improv & spontaneity exercises".to_string(),
            12 => "Integration: full performance practice".to_string(),
            _ => "Advanced voice training".to_string(),
        },
        _ => "Study session".to_string(),
    }
}

fn build_weekday_schedule(week: u32) -> Vec<ScheduleBlock> {
    vec![
        ScheduleBlock {
            pillar: "llm".to_string(),
            duration_min: 60,
            topic: get_pillar_topic("llm", week),
            time_label: "07:00 – 08:00".to_string(),
            emoji: "🧠".to_string(),
            color: "#2E5FA3".to_string(),
        },
        ScheduleBlock {
            pillar: "hardware".to_string(),
            duration_min: 45,
            topic: get_pillar_topic("hardware", week),
            time_label: "12:00 – 12:45".to_string(),
            emoji: "⚡".to_string(),
            color: "#0E7C86".to_string(),
        },
        ScheduleBlock {
            pillar: "sales".to_string(),
            duration_min: 30,
            topic: get_pillar_topic("sales", week),
            time_label: "17:30 – 18:00".to_string(),
            emoji: "🤝".to_string(),
            color: "#C9762A".to_string(),
        },
        ScheduleBlock {
            pillar: "voice".to_string(),
            duration_min: 15,
            topic: get_pillar_topic("voice", week),
            time_label: "19:00 – 19:15".to_string(),
            emoji: "🎙️".to_string(),
            color: "#B54A00".to_string(),
        },
    ]
}

fn build_weekend_schedule(week: u32, is_saturday: bool) -> Vec<ScheduleBlock> {
    if is_saturday {
        vec![
            ScheduleBlock {
                pillar: "llm".to_string(),
                duration_min: 90,
                topic: format!("Deep dive: {}", get_pillar_topic("llm", week)),
                time_label: "09:00 – 10:30".to_string(),
                emoji: "🧠".to_string(),
                color: "#2E5FA3".to_string(),
            },
            ScheduleBlock {
                pillar: "communication".to_string(),
                duration_min: 45,
                topic: get_pillar_topic("communication", week),
                time_label: "11:00 – 11:45".to_string(),
                emoji: "🗣️".to_string(),
                color: "#7B3F8E".to_string(),
            },
        ]
    } else {
        vec![
            ScheduleBlock {
                pillar: "sales".to_string(),
                duration_min: 60,
                topic: format!("Practice: {}", get_pillar_topic("sales", week)),
                time_label: "10:00 – 11:00".to_string(),
                emoji: "🤝".to_string(),
                color: "#C9762A".to_string(),
            },
            ScheduleBlock {
                pillar: "hardware".to_string(),
                duration_min: 30,
                topic: get_pillar_topic("hardware", week),
                time_label: "15:00 – 15:30".to_string(),
                emoji: "⚡".to_string(),
                color: "#0E7C86".to_string(),
            },
        ]
    }
}

/// Applies an active rebalance proposal to today's blocks: nudges each block's
/// duration toward behind pillars / away from ahead pillars (bounded), and
/// injects a short catch-up block for a behind pillar that has no block today.
/// With no adjustments, blocks are returned unchanged (backward compatible).
fn apply_adjustments(
    mut blocks: Vec<ScheduleBlock>,
    adjustments: &[PillarAdjustment],
    week: u32,
) -> Vec<ScheduleBlock> {
    if adjustments.is_empty() {
        return blocks;
    }

    for block in blocks.iter_mut() {
        if let Some(adj) = adjustments.iter().find(|a| a.pillar == block.pillar) {
            if adj.recommended_minutes_delta != 0 {
                let nudged = (block.duration_min as i64 + adj.recommended_minutes_delta as i64)
                    .clamp(MIN_BLOCK_MINUTES, MAX_BLOCK_MINUTES);
                block.duration_min = nudged as u32;
            }
        }
    }

    // Inject a catch-up block for the most-behind pillar absent from today.
    let mut behind: Vec<&PillarAdjustment> = adjustments
        .iter()
        .filter(|a| a.status == "behind" && a.recommended_minutes_delta > 0)
        .collect();
    behind.sort_by(|a, b| {
        b.weight_delta
            .partial_cmp(&a.weight_delta)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    if let Some(target) = behind
        .into_iter()
        .find(|a| !blocks.iter().any(|b| b.pillar == a.pillar))
    {
        blocks.push(ScheduleBlock {
            pillar: target.pillar.clone(),
            duration_min: CATCH_UP_BLOCK_MINUTES,
            topic: format!("Catch-up: {}", get_pillar_topic(&target.pillar, week)),
            time_label: "20:00 – 20:30".to_string(),
            emoji: "⏰".to_string(),
            color: pillar_color(&target.pillar),
        });
    }

    blocks
}

fn pillar_color(pillar: &str) -> String {
    match pillar {
        "llm" => "#2E5FA3",
        "hardware" => "#0E7C86",
        "sales" => "#C9762A",
        "communication" => "#7B3F8E",
        "voice" => "#B54A00",
        _ => "#4a5568",
    }
    .to_string()
}

#[tauri::command]
pub fn get_today_schedule(app: AppHandle, date: String) -> Result<TodaySchedule, String> {
    let today = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .unwrap_or_else(|_| Local::now().date_naive());

    let week = get_week_number(today);
    let weekday = today.weekday();

    let day_name = match weekday {
        Weekday::Mon => "Monday",
        Weekday::Tue => "Tuesday",
        Weekday::Wed => "Wednesday",
        Weekday::Thu => "Thursday",
        Weekday::Fri => "Friday",
        Weekday::Sat => "Saturday",
        Weekday::Sun => "Sunday",
    }
    .to_string();

    let base_blocks = match weekday {
        Weekday::Sat => build_weekend_schedule(week, true),
        Weekday::Sun => build_weekend_schedule(week, false),
        _ => build_weekday_schedule(week),
    };

    // Reweight using the single applied rebalance proposal, if any.
    let blocks = apply_adjustments(base_blocks, &load_applied_adjustments(&app), week);

    let current_focus = blocks
        .first()
        .map(|b| format!("{} {} — {}", b.emoji, capitalize(&b.pillar), b.topic))
        .unwrap_or_else(|| "Rest day".to_string());

    Ok(TodaySchedule {
        date,
        day_name,
        week_number: week,
        blocks,
        current_focus,
    })
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MorningBriefing {
    pub date: String,
    pub day_name: String,
    pub week_number: u32,
    pub first_block: Option<ScheduleBlock>,
    pub total_blocks: u32,
    pub current_focus: String,
    pub streak: i32,
    pub review_counts: ReviewCounts,
    pub headline: String,
    pub notification_body: String,
}

/// Aggregates today's schedule, due reviews, and current streak into a single
/// briefing payload for the Dashboard's morning "Jump In" card and push notification.
#[tauri::command]
pub fn get_morning_briefing(app: AppHandle, date: String) -> Result<MorningBriefing, String> {
    let schedule = get_today_schedule(app.clone(), date)?;
    let streak = get_streak(app.clone()).unwrap_or(0);
    let review_counts = get_review_counts(app).unwrap_or(ReviewCounts {
        total: 0,
        due: 0,
        due_today: 0,
    });

    let first_block = schedule.blocks.first().cloned();
    let total_blocks = schedule.blocks.len() as u32;

    let headline = match &first_block {
        Some(b) => format!(
            "{} {} — {} ({} min)",
            b.emoji,
            capitalize(&b.pillar),
            b.topic,
            b.duration_min
        ),
        None => "Rest day — no scheduled blocks".to_string(),
    };

    let mut parts: Vec<String> = Vec::new();
    if let Some(b) = &first_block {
        parts.push(format!("First up: {} at {}", capitalize(&b.pillar), b.time_label));
    }
    if review_counts.due > 0 {
        parts.push(format!("{} review{} due", review_counts.due, if review_counts.due == 1 { "" } else { "s" }));
    }
    if streak > 0 {
        parts.push(format!("🔥 {}-day streak", streak));
    }
    let notification_body = if parts.is_empty() {
        "Open the app to start today's session.".to_string()
    } else {
        parts.join(" · ")
    };

    Ok(MorningBriefing {
        date: schedule.date,
        day_name: schedule.day_name,
        week_number: schedule.week_number,
        first_block,
        total_blocks,
        current_focus: schedule.current_focus,
        streak,
        review_counts,
        notification_body,
        headline,
    })
}

#[tauri::command]
pub async fn schedule_notification(
    app: AppHandle,
    title: String,
    body: String,
    _hour: u8,
    _minute: u8,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;

    Ok(())
}
