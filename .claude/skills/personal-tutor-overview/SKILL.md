---
name: personal-tutor-overview
description: "Full architecture, stack, and codemap for the Personal Tutor app. Use this skill at the start of any new session, when planning a cross-cutting feature, or when you need to understand where something lives in the codebase. Trigger on: 'where does X live', 'how does X work', 'what is the architecture', starting a new session on this project, source import / URL import / paper import / fetch_and_summarize_url / teach from source, or any question that spans both Rust backend and React frontend."
---

# Personal Tutor — Full Architecture & Codemap

You have deep knowledge of the Personal Tutor app's architecture, file layout, data flows, and constraints. Use this to accurately answer questions, locate code, and plan changes.

---

## What This App Is

Personal AI tutor app for **Saimir Baci** (CTO & co-founder of Augmentifai) during a 3-month accelerated learning sprint: **June 1 – Aug 31, 2026**. Desktop-first Tauri v2 app covering 12 Growth Pillars with AI-powered tutoring, voice I/O, session logging, progress tracking, and an interactive GenUI system.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Backend language | Rust + Tokio async runtime |
| Database | rusqlite 0.31 (bundled SQLite) + WAL mode |
| HTTP client | reqwest 0.12 (stream + rustls-tls) |
| HTML parsing | scraper 0.20 + url 2 (URL/paper import readable-text extraction) |
| Local server | Axum 0.7 (sync server) |
| Serialization | serde + serde_json |
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS v3 |
| State management | Zustand v4 (with persist middleware) |
| Animation | Framer Motion v11 |
| Code highlighting | Shiki v1 |
| Diagrams | Mermaid.js v11 |
| Markdown | react-markdown + remark-gfm |
| Routing | React Router v6 |

---

## Directory Layout

```
personal_tutor/
├── CLAUDE.md                      ← Project overview and conventions
├── package.json                   ← npm deps (react, zustand, framer-motion, mermaid, shiki...)
├── vite.config.ts                 ← Vite config with @/ path alias
├── tailwind.config.js
│
├── src/                           ← React frontend
│   ├── main.tsx                   ← React entry point
│   ├── App.tsx                    ← Router + layout
│   ├── data/
│   │   ├── types.ts               ← ALL TypeScript interfaces (single source of truth)
│   │   ├── pillars.ts             ← Pillar definitions (id, name, emoji, color, colorMuted)
│   │   └── curriculum.ts         ← 3-month curriculum data per pillar
│   ├── store/
│   │   └── appStore.ts            ← Single Zustand store + parseGenUIBlocks()
│   ├── hooks/
│   │   ├── useAI.ts               ← AI streaming, system prompt builder, event subscriptions
│   │   ├── useVoice.ts            ← STT/TTS, model download, transcription
│   │   ├── useProgress.ts         ← Session logging, streak, milestones
│   │   ├── useListenMode.ts       ← Listen Mode: generate_audio_lesson, base64→Blob audioUrl, progress
│   │   └── useSourceImport.ts     ← importUrl(url, generateBrief?) → fetch_and_summarize_url
│   ├── lib/
│   │   ├── tauri.ts               ← tauriInvoke<T>() + tauriListen<T>() wrappers with browser mocks
│   │   └── sourceImport.ts        ← detectUrl(text), buildTeachPrompt(summary, pillarName) pure helpers
│   ├── components/                ← Reusable UI components
│   └── views/                     ← Full-page views
│
└── src-tauri/
    ├── Cargo.toml                 ← Rust dependencies
    └── src/
        ├── lib.rs                 ← Plugin registration + ALL command registrations
        ├── db/
        │   └── mod.rs             ← DbState(Mutex<Connection>), schema init, get_connection()
        ├── commands/
        │   ├── mod.rs             ← Module declarations
        │   ├── ai.rs              ← stream_chat, get_providers, get_ollama_models,
        │   │                         get_openrouter_models, save_provider_config
        │   ├── conversations.rs   ← new_conversation, save_message, list_conversations,
        │   │                         get_conversation_messages, delete_conversation,
        │   │                         rename_conversation, bulk_import_sync
        │   ├── progress.rs        ← log_session, get_progress, get_streak, update_milestone
        │   ├── review.rs          ← SM-2: record_review_attempt, get_due_reviews, get_review_counts
        │   ├── source.rs          ← fetch_and_summarize_url (URL/paper import, scraper HTML extract, SSRF guard)
        │   ├── schedule.rs        ← get_today_schedule, schedule_notification,
        │   │                         get_morning_briefing (aggregates schedule + streak + reviews)
        │   ├── listen.rs          ← Listen Mode: generate_audio_lesson (solo-podcast script +
        │   │                         ElevenLabs MP3); pure helpers build_lesson_context,
        │   │                         clean_script, chunk_script, estimate_duration_secs
        │   ├── sync_server.rs     ← start_sync_server, stop_sync_server, get_sync_server_status
        │   └── voice.rs           ← get_stt_model_status, download_stt_model, transcribe_audio,
        │                             tts_elevenlabs (wraps shared synthesize_tts → raw MP3 bytes),
        │                             get_elevenlabs_voices
        └── ai/
            ├── provider.rs        ← AiProvider trait (async_trait)
            ├── anthropic.rs       ← Anthropic Claude SSE streaming
            ├── google.rs          ← Google AI Studio
            ├── ollama.rs          ← Ollama (local models)
            └── openrouter.rs      ← OpenRouter proxy
```

---

## 12 Growth Pillars

| PillarId | Name | Focus Area |
|----------|------|-----------|
| `llm` | LLM Engineering | Transformer architecture, fine-tuning, RAG, inference |
| `hardware` | Hardware & Compute | GPUs, edge compute, embedded systems |
| `sales` | Sales | Enterprise B2B, outbound, demo, closing |
| `communication` | Communication | Executive presence, investor pitches, storytelling |
| `voice` | Voice AI | STT/TTS, voice UX, streaming audio |
| `fundraising` | Fundraising | VC mechanics, SAFE/notes, pitch narratives |
| `roadmap` | Product Roadmap | Strategic planning, prioritization frameworks |
| `security` | Security | AppSec, infosec for AI systems |
| `hiring` | Hiring & Talent | Technical recruiting, team building |
| `mlops` | MLOps | Model deployment, monitoring, CI/CD for ML |
| `ip` | IP & Legal | Patents, open source licensing, founder agreements |
| `finance` | Finance | SaaS metrics, cap tables, unit economics |

---

## Data Flow: User Message → AI Response → Rendered UI

```
1. User types message in TutorChat component
2. handleSend() calls useAI hook
3. useAI builds contextual system prompt (useAI.ts::buildContextualSystemPrompt)
4. tauriInvoke('stream_chat', { messages, providerConfig }) → Rust
5. Rust selects provider from providerConfig.provider
6. Provider streams SSE/NDJSON → emits 'ai-token' Tauri events per chunk
7. Frontend useEffect listener calls store.appendToken(token)
8. Store accumulates in streamingContent (shown as live preview)
9. Provider emits 'ai-done' event when complete
10. store.finalizeStream() runs:
    a. parseGenUIBlocks(streamingContent) → strips <genui> tags, returns { text, blocks }
    b. Creates AiMessage { role:'assistant', content: text, genui: blocks }
    c. Appends to messages[], clears streaming state
11. React re-renders: TutorChat shows message, GenUIRenderer renders blocks
```

---

## Data Flow: Listen Mode — Podcast-Style Audio Lessons

```
1. TodayCard "Listen" button opens an inline AudioLessonPlayer for a block's pillar/topic
2. AudioLessonPlayer auto-fires useListenMode.generate(pillar, topic)
3. tauriInvoke('generate_audio_lesson', { pillar, topic, config, apiKey, voiceId }) → Rust
4. listen.rs gather_context (db::get_connection: sessions hours + recent notes,
   mastery AVG, open knowledge_gaps) → build_lesson_context (pure)
5. collect_completion writes a fresh 5–10 min solo-podcast script (LESSON_SYSTEM_PROMPT, 120s timeout)
6. clean_script strips markdown/genui/code-fences → chunk_script (<MAX_CHUNK_CHARS=2400, word-safe)
7. synthesize_tts each chunk (shared voice.rs helper) → concatenate MP3 bytes → base64
8. Emits 'audio-lesson-progress' { stage, current, total } throughout for live UI progress
9. Returns AudioLesson { pillar, topic, script, audioBase64, durationEstimateSecs, segmentCount }
10. useListenMode decodes base64 → Blob → object URL; <audio controls autoPlay> plays it
```

---

## GenUI Block Types

| Type | Data Format | Renderer |
|------|-------------|---------|
| `flashcard` | JSON: `{ question, answer }` | Flip card component |
| `quiz` | JSON: `{ question, options[], correct, explanation? }` | Multiple choice |
| `code` | JSON: `{ language, code, filename? }` | Shiki-highlighted block |
| `concept-map` | JSON: `{ nodes[{id,label,color?}], edges[{from,to,label?}] }` | Graph visualization |
| `timeline` | JSON: `{ events[{label,description,done}] }` | Progress timeline |
| `diagram` | Raw string (Mermaid source) | mermaid.render() |
| `key-insight` | Raw string (plain text) | Highlighted callout box |

---

## Database Schema (rusqlite, `db/mod.rs`)

```sql
sessions       (id, date, pillar, hours, energy, note, created_at)
milestones     (id, pillar, month, status, updated_at)  UNIQUE(pillar, month)
settings       (key, value)
conversations  (id, pillar, title, created_at, updated_at)
chat_messages  (id, conversation_id→conversations CASCADE, role, content, genui TEXT, created_at)
review_items   (item_id, item_type, pillar, ease_factor, interval_days, repetitions, next_due, last_reviewed)
```

---

## Zustand Store Structure (`appStore.ts`)

**Persisted** (survive app restart): `providerConfig`, `voiceConfig`, `sidebarCollapsed`, `activePillar`, `socraticModeByPillar`

**Ephemeral** (lost on restart): `messages`, `isStreaming`, `streamingContent`, `currentToken`, `activeConversationId`, `conversationList`, `progress`, `streak`

---

## Tauri Plugins Registered
- `tauri_plugin_notification` — schedule_notification
- `tauri_plugin_store` — (available)
- `tauri_plugin_shell` — (available)

---

## Critical Constraints
1. `Mutex<Connection>` must never be held across an `.await` point — deadlock
2. Every new `#[tauri::command]` must be added to `lib.rs::generate_handler![...]`
3. New DB tables → add `CREATE TABLE IF NOT EXISTS` in `db/mod.rs::init()`
4. STT code is `#[cfg(not(target_os = "android"))]` only
5. `src/lib/tauri.ts` wrappers must be used — never `invoke()` directly in components
6. `src/data/types.ts` is the single source of truth for TypeScript interfaces
