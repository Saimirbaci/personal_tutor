//! Listen Mode — podcast-style audio lessons.
//!
//! `generate_audio_lesson` builds a fresh 5–10 minute single-narrator script for
//! a pillar/topic, grounded in the learner's current progress and mastery gaps,
//! then synthesizes it to MP3 via ElevenLabs. The script is generated each call
//! (not a static recording) so it adapts to where the learner currently is.
//!
//! Flow: gather context (brief SQLite read) → write script (`collect_completion`)
//! → clean prose → chunk under the ElevenLabs per-request char cap → synthesize
//! each chunk → concatenate MP3 bytes → return base64.
//!
//! Pure, unit-tested helpers (`build_lesson_context`, `clean_script`,
//! `chunk_script`) keep the orchestration command thin and testable.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::ai::{AiMessage, ProviderConfig};
use crate::commands::voice::synthesize_tts;
use crate::db::get_connection;

// ── Tunables ────────────────────────────────────────────────────────────────

/// Conservative per-request character cap for ElevenLabs. The API allows more,
/// but staying under ~2500 chars keeps each request fast and well within limits.
const MAX_CHUNK_CHARS: usize = 2400;

/// Spoken narration runs roughly 150 words / minute ≈ ~13 chars/sec. Used only
/// to surface a rough duration estimate to the UI.
const CHARS_PER_SECOND: f32 = 13.0;

/// Generous timeout for script generation — the model writes ~1000+ words.
const SCRIPT_TIMEOUT_SECS: u64 = 120;

// ── Wire types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioLesson {
    pub pillar: String,
    pub topic: String,
    /// Full narration script (clean prose, no markdown/genui).
    pub script: String,
    /// Base64-encoded MP3 of the full multi-chunk narration.
    pub audio_base64: String,
    /// Rough spoken-duration estimate in seconds, derived from script length.
    pub duration_estimate_secs: u32,
    /// Number of TTS chunks synthesized and concatenated.
    pub segment_count: u32,
}

/// Lightweight per-pillar learning signals assembled from SQLite. Plain data so
/// the context-building helper stays pure and unit-testable.
#[derive(Debug, Clone, Default)]
pub struct LessonContextRows {
    pub pillar: String,
    pub topic: String,
    /// Total hours logged for the pillar.
    pub total_hours: f32,
    /// Notes from the most recent sessions (newest first), if any.
    pub recent_notes: Vec<String>,
    /// Average mastery score 0–100 for the pillar, when computed.
    pub avg_mastery: Option<f32>,
    /// Open knowledge-gap labels for the pillar (the weak spots to target).
    pub gap_labels: Vec<String>,
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/// Builds a compact, prose context summary from the gathered rows. Always
/// returns a usable string, even when the pillar has no history yet.
pub fn build_lesson_context(rows: &LessonContextRows) -> String {
    let mut parts: Vec<String> = Vec::new();

    if rows.total_hours > 0.0 {
        parts.push(format!(
            "The learner has logged {:.1} hours on this pillar so far.",
            rows.total_hours
        ));
    } else {
        parts.push("The learner is just getting started on this pillar with little prior logged time.".to_string());
    }

    match rows.avg_mastery {
        Some(m) if m >= 70.0 => parts.push(format!(
            "Their average mastery here is strong (~{:.0}/100), so go deeper than the basics.",
            m
        )),
        Some(m) if m >= 40.0 => parts.push(format!(
            "Their average mastery here is moderate (~{:.0}/100); reinforce fundamentals while extending them.",
            m
        )),
        Some(m) => parts.push(format!(
            "Their average mastery here is still low (~{:.0}/100); keep the explanation grounded and build from first principles.",
            m
        )),
        None => parts.push("There is no mastery signal yet; assume an informed beginner.".to_string()),
    }

    if !rows.gap_labels.is_empty() {
        parts.push(format!(
            "Known weak spots to address head-on: {}.",
            rows.gap_labels.join("; ")
        ));
    }

    if !rows.recent_notes.is_empty() {
        let notes = rows
            .recent_notes
            .iter()
            .map(|n| format!("\"{}\"", n.trim()))
            .collect::<Vec<_>>()
            .join(", ");
        parts.push(format!("Recent session notes for continuity: {}.", notes));
    }

    parts.join(" ")
}

/// Strips markdown/GenUI artifacts so only clean spoken prose reaches TTS.
/// Removes `<genui>` blocks, headings, list bullets, emphasis markers, code
/// fences, and link syntax — anything a narrator would otherwise read literally.
pub fn clean_script(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_fence = false;

    for raw_line in text.lines() {
        let mut line = raw_line.trim().to_string();

        // Drop fenced code blocks entirely (the fence lines and their contents).
        if line.starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if line.contains("<genui") || line == "</genui>" {
            continue;
        }

        // Strip leading markdown heading hashes and list/quote markers.
        line = line.trim_start_matches('#').trim_start().to_string();
        if let Some(rest) = line.strip_prefix("- ") {
            line = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("* ") {
            line = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("> ") {
            line = rest.to_string();
        }

        out.push_str(&line);
        out.push('\n');
    }

    // Remove inline emphasis / code markers and collapse whitespace.
    let stripped: String = out
        .chars()
        .filter(|c| !matches!(c, '*' | '_' | '`' | '#'))
        .collect();

    stripped
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

/// Splits a script into chunks no longer than `max_chars`, never breaking a
/// word. Prefers sentence boundaries; falls back to word boundaries for runs of
/// text without punctuation. Rejoining the chunks reproduces the input text
/// (modulo single spaces between segments).
pub fn chunk_script(text: &str, max_chars: usize) -> Vec<String> {
    let max = max_chars.max(1);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    // Split into sentences, keeping terminal punctuation attached.
    let mut sentences: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in trimmed.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?') {
            sentences.push(current.trim().to_string());
            current.clear();
        }
    }
    if !current.trim().is_empty() {
        sentences.push(current.trim().to_string());
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut buf = String::new();

    let push_unit = |unit: &str, chunks: &mut Vec<String>, buf: &mut String| {
        if buf.is_empty() {
            *buf = unit.to_string();
        } else if buf.len() + 1 + unit.len() <= max {
            buf.push(' ');
            buf.push_str(unit);
        } else {
            chunks.push(std::mem::take(buf));
            *buf = unit.to_string();
        }
    };

    for sentence in sentences {
        if sentence.len() <= max {
            push_unit(&sentence, &mut chunks, &mut buf);
        } else {
            // Sentence alone exceeds the cap — split it on word boundaries.
            for word in sentence.split_whitespace() {
                if word.len() > max {
                    // Pathologically long token: hard-split it.
                    let mut start = 0;
                    let bytes: Vec<char> = word.chars().collect();
                    while start < bytes.len() {
                        let end = (start + max).min(bytes.len());
                        let piece: String = bytes[start..end].iter().collect();
                        push_unit(&piece, &mut chunks, &mut buf);
                        start = end;
                    }
                } else {
                    push_unit(word, &mut chunks, &mut buf);
                }
            }
        }
    }

    if !buf.trim().is_empty() {
        chunks.push(buf);
    }

    chunks
}

fn estimate_duration_secs(script: &str) -> u32 {
    (script.len() as f32 / CHARS_PER_SECOND).round() as u32
}

// ── Prompt construction ─────────────────────────────────────────────────────

const LESSON_SYSTEM_PROMPT: &str = "You are an expert tutor scripting a single-narrator audio lesson \
(like a focused solo podcast episode). Write a 5 to 10 minute spoken-word script — roughly 750 to 1500 words. \
CRITICAL constraints: \
- Output ONLY the words to be spoken aloud. \
- NO markdown, NO headings, NO bullet points, NO bold/italic markers, NO code fences, NO stage directions, NO speaker labels, NO sound cues. \
- Write in flowing, conversational paragraphs that sound natural read aloud. \
- Open by naming the topic and why it matters; build concepts step by step; use concrete examples and analogies; \
explicitly address the learner's known weak spots; close with a short recap and one reflective question. \
Ground everything in the supplied learner context — do not invent progress data.";

fn build_lesson_user_message(pillar: &str, topic: &str, context: &str) -> String {
    format!(
        "Pillar: {pillar}\nTopic: {topic}\n\nLearner context:\n{context}\n\nWrite the audio-lesson narration script now."
    )
}

// ── SQLite gathering ────────────────────────────────────────────────────────

fn gather_context(app: &AppHandle, pillar: &str, topic: &str) -> LessonContextRows {
    let mut rows = LessonContextRows {
        pillar: pillar.to_string(),
        topic: topic.to_string(),
        ..Default::default()
    };

    let conn = match get_connection(app) {
        Ok(c) => c,
        Err(_) => return rows,
    };

    rows.total_hours = conn
        .query_row(
            "SELECT COALESCE(SUM(hours), 0) FROM sessions WHERE pillar = ?1",
            rusqlite::params![pillar],
            |r| r.get::<_, f32>(0),
        )
        .unwrap_or(0.0);

    if let Ok(mut stmt) = conn.prepare(
        "SELECT note FROM sessions WHERE pillar = ?1 AND TRIM(note) != ''
         ORDER BY created_at DESC LIMIT 3",
    ) {
        if let Ok(iter) = stmt.query_map(rusqlite::params![pillar], |r| r.get::<_, String>(0)) {
            rows.recent_notes = iter.flatten().collect();
        }
    }

    rows.avg_mastery = conn
        .query_row(
            "SELECT AVG(score) FROM mastery_scores WHERE pillar_id = ?1",
            rusqlite::params![pillar],
            |r| r.get::<_, Option<f32>>(0),
        )
        .ok()
        .flatten();

    if let Ok(mut stmt) = conn.prepare(
        "SELECT label FROM knowledge_gaps WHERE pillar = ?1 AND status = 'open'
         ORDER BY severity DESC LIMIT 4",
    ) {
        if let Ok(iter) = stmt.query_map(rusqlite::params![pillar], |r| r.get::<_, String>(0)) {
            rows.gap_labels = iter.flatten().collect();
        }
    }

    rows
}

fn emit_progress(app: &AppHandle, stage: &str, current: u32, total: u32) {
    let _ = app.emit(
        "audio-lesson-progress",
        serde_json::json!({ "stage": stage, "current": current, "total": total }),
    );
}

// ── Command ─────────────────────────────────────────────────────────────────

/// Generates a podcast-style audio lesson for `pillar`/`topic`, grounded in the
/// learner's current progress and mastery gaps, and returns it as base64 MP3.
///
/// Emits `audio-lesson-progress` events (`stage`, `current`, `total`) so the UI
/// can show generation progress. Returns user-friendly errors (e.g. a missing
/// ElevenLabs key) rather than raw provider output.
#[tauri::command]
pub async fn generate_audio_lesson(
    app: AppHandle,
    pillar: String,
    topic: String,
    config: ProviderConfig,
    api_key: String,
    voice_id: String,
) -> Result<AudioLesson, String> {
    if api_key.trim().is_empty() {
        return Err("Add your ElevenLabs key in Settings → Voice to generate audio lessons.".to_string());
    }

    // 1. Gather learning context (brief synchronous read; no lock held across await).
    emit_progress(&app, "writing script", 0, 1);
    let context_rows = gather_context(&app, &pillar, &topic);
    let context = build_lesson_context(&context_rows);

    // 2. Generate the narration script.
    let messages = vec![AiMessage {
        role: "user".to_string(),
        content: build_lesson_user_message(&pillar, &topic, &context),
    }];
    let raw_script = crate::commands::ai::collect_completion(
        messages,
        Some(LESSON_SYSTEM_PROMPT.to_string()),
        config,
        Some(SCRIPT_TIMEOUT_SECS),
    )
    .await
    .map_err(|e| format!("Couldn't write the lesson script: {e}"))?;

    let script = clean_script(&raw_script);
    if script.trim().is_empty() {
        return Err("The lesson script came back empty. Try again in a moment.".to_string());
    }

    // 3. Chunk + synthesize each segment, concatenating the MP3 bytes.
    let chunks = chunk_script(&script, MAX_CHUNK_CHARS);
    let total = chunks.len() as u32;
    let mut audio: Vec<u8> = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        emit_progress(&app, "synthesizing", (i as u32) + 1, total);
        let bytes = synthesize_tts(chunk, &api_key, &voice_id).await?;
        audio.extend_from_slice(&bytes);
    }

    if audio.is_empty() {
        return Err("No audio was produced for this lesson.".to_string());
    }

    emit_progress(&app, "done", total, total);

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(AudioLesson {
        pillar,
        topic,
        duration_estimate_secs: estimate_duration_secs(&script),
        segment_count: total,
        audio_base64: STANDARD.encode(&audio),
        script,
    })
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_handles_empty_history() {
        let rows = LessonContextRows {
            pillar: "llm".to_string(),
            topic: "Attention".to_string(),
            ..Default::default()
        };
        let ctx = build_lesson_context(&rows);
        assert!(ctx.contains("just getting started"));
        assert!(ctx.contains("no mastery signal"));
        assert!(!ctx.is_empty());
    }

    #[test]
    fn context_includes_gaps_and_notes() {
        let rows = LessonContextRows {
            pillar: "llm".to_string(),
            topic: "Attention".to_string(),
            total_hours: 12.5,
            recent_notes: vec!["confused about KV cache".to_string()],
            avg_mastery: Some(82.0),
            gap_labels: vec!["positional encoding".to_string()],
        };
        let ctx = build_lesson_context(&rows);
        assert!(ctx.contains("12.5 hours"));
        assert!(ctx.contains("strong"));
        assert!(ctx.contains("positional encoding"));
        assert!(ctx.contains("KV cache"));
    }

    #[test]
    fn clean_script_strips_markdown_and_genui() {
        let raw = "# Heading\n\nThis is **bold** and _italic_ text.\n- a bullet\n```\ncode\n```\n<genui type=\"quiz\">{}</genui>\nFinal line.";
        let cleaned = clean_script(raw);
        assert!(!cleaned.contains('#'));
        assert!(!cleaned.contains('*'));
        assert!(!cleaned.contains('`'));
        assert!(!cleaned.contains("genui"));
        assert!(!cleaned.contains("code"));
        assert!(cleaned.contains("This is bold and italic text."));
        assert!(cleaned.contains("a bullet"));
        assert!(cleaned.contains("Final line."));
    }

    #[test]
    fn chunk_respects_cap_and_preserves_text() {
        let text = "First sentence here. Second sentence is a bit longer than the first one. Third! Fourth sentence ends it.";
        let chunks = chunk_script(text, 40);
        assert!(!chunks.is_empty());
        for c in &chunks {
            assert!(c.len() <= 40, "chunk too long: {:?}", c);
        }
        // Rejoining reproduces the words in order.
        let rejoined = chunks.join(" ");
        let orig_words: Vec<&str> = text.split_whitespace().collect();
        let join_words: Vec<&str> = rejoined.split_whitespace().collect();
        assert_eq!(orig_words, join_words);
    }

    #[test]
    fn chunk_never_splits_a_word() {
        let text = "supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis";
        let chunks = chunk_script(text, 20);
        // Each non-hard-split word should appear intact somewhere when short
        // enough; here every word is longer than 20, so hard-splitting applies
        // but no chunk exceeds the cap.
        for c in &chunks {
            assert!(c.len() <= 20);
        }
        let rejoined: String = chunks.join("");
        let orig_no_space: String = text.chars().filter(|c| !c.is_whitespace()).collect();
        let rejoined_no_space: String = rejoined.chars().filter(|c| !c.is_whitespace()).collect();
        assert_eq!(orig_no_space, rejoined_no_space);
    }

    #[test]
    fn chunk_empty_input_yields_no_chunks() {
        assert!(chunk_script("", 100).is_empty());
        assert!(chunk_script("   \n  ", 100).is_empty());
    }

    #[test]
    fn duration_scales_with_length() {
        let short = estimate_duration_secs("a".repeat(130).as_str());
        assert_eq!(short, 10);
    }
}
