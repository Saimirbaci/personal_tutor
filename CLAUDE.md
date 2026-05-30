# Personal Tutor — 3-Month AI Learning Sprint

## What This Is
Personal AI tutor app for Saimir Baci (CTO & co-founder of Augmentifai) covering a 3-month accelerated learning plan (June 1 – Aug 31, 2026). Desktop-first Tauri v2 app with 12 Growth Pillars, AI-powered tutoring with multiple LLM providers, voice input/output, session logging, progress tracking, and a GenUI system for rich interactive learning content.

## Quick Start
```bash
npm install && npm run tauri dev     # Desktop app (Tauri v2 dev mode)
npm run dev                          # Frontend only (Vite, port 1420)
cargo build                          # Rust backend only
cargo test                           # Rust unit tests
```

## Architecture
```
Frontend (React 18 + Vite + Tailwind, port 1420)
├── src/
│   ├── components/          → UI components (TutorChat, GenUIRenderer, Sidebar, etc.)
│   ├── views/               → Page views (Dashboard, PillarView, ProgressView, SettingsView)
│   ├── hooks/               → Custom hooks (useAI, useVoice, useProgress, etc.)
│   ├── store/               → Zustand store (appStore.ts — single store with persist)
│   ├── data/                → Static data (pillars.ts, curriculum.ts) and types.ts
│   └── lib/                 → Utilities (tauri.ts wrappers, formatters)
│
Rust Backend (Tauri v2 + rusqlite + Tokio)
└── src-tauri/src/
    ├── lib.rs               → App entry, plugin registration, command registration
    ├── db/mod.rs            → DbState(Mutex<Connection>), schema init, WAL mode
    ├── commands/            → Tauri command handlers (grouped by domain)
    │   ├── ai.rs            → stream_chat, get_providers, model listing, save_provider_config
    │   ├── conversations.rs → CRUD + bulk_import_sync
    │   ├── progress.rs      → log_session, get_progress, get_streak, update_milestone
    │   ├── review.rs        → SM-2 spaced repetition (record_review_attempt, get_due_reviews, get_review_counts)
    │   ├── summaries.rs     → save_conversation_summary, get_conversation_summary, list_recent_summaries, seed_review_items_from_summary
    │   ├── digest.rs        → weekly digest (generate_weekly_digest, get_weekly_digests, maybe_generate_due_digest, export_weekly_digest)
    │   ├── schedule.rs      → get_today_schedule, schedule_notification
    │   ├── sync_server.rs   → Axum-based local sync server (start/stop/status)
    │   └── voice.rs         → STT model management, transcribe_audio, ElevenLabs TTS
    └── ai/                  → LLM provider implementations
        ├── provider.rs      → AiProvider trait (async_trait)
        ├── anthropic.rs     → Anthropic Claude (SSE streaming)
        ├── google.rs        → Google AI Studio
        ├── ollama.rs        → Ollama (local)
        └── openrouter.rs    → OpenRouter proxy
```

## 12 Growth Pillars
`llm` | `hardware` | `sales` | `communication` | `voice` | `fundraising` | `roadmap` | `security` | `hiring` | `mlops` | `ip` | `finance`

## GenUI System
AI responses can embed interactive UI blocks using this syntax:
```
<genui type="flashcard">{"question": "...", "answer": "..."}</genui>
<genui type="quiz">{"question": "...", "options": [...], "correct": 0, "explanation": "..."}</genui>
<genui type="code">{"language": "rust", "code": "..."}</genui>
<genui type="concept-map">{"nodes": [...], "edges": [...]}</genui>
<genui type="timeline">{"events": [...]}</genui>
<genui type="diagram">Mermaid diagram source</genui>
<genui type="key-insight">Plain text insight</genui>
```
`parseGenUIBlocks()` in `appStore.ts::finalizeStream()` strips these from the visible text and attaches them as `AiMessage.genui`. The `GenUIRenderer` component renders each block type.

## AI Streaming
All AI responses stream via Tauri events — never polled:
- `ai-token` → `appendToken(token)` in store
- `ai-done` → `finalizeStream()` (parses GenUI, saves to messages)
- `ai-error` → error display

The `useAI` hook in `src/hooks/useAI.ts` handles event subscriptions and calls the `stream_chat` Tauri command.

Background AI tasks (session summaries, weekly digests) use the shared `collect_completion(messages, system, config, timeout_secs)` helper in `ai.rs`, which buffers tokens silently and returns the final text without emitting `ai-token`/`ai-done`/`ai-error` events. This allows them to run concurrently with live chat without interfering with the streaming UI. `summarize_conversation` (in `ai.rs`) is a thin wrapper over `collect_completion`.

## State Management
Single Zustand store in `src/store/appStore.ts` with `persist` middleware.
Persisted keys: `providerConfig`, `voiceConfig`, `sidebarCollapsed`, `activePillar`.
Ephemeral: all messages, streaming state, conversation list, progress data, `pendingPrompt` (queued reflection reply), `weeklyDigests` + `selectedDigestWeek` (digest list and UI selection, never persisted).

## Database (rusqlite)
SQLite at `{app_data_dir}/tutor.db`. WAL mode, foreign keys ON.
- **`sessions`** — study session logs (pillar, hours, energy, note)
- **`milestones`** — per-pillar milestone status (pending/in-progress/complete)
- **`conversations`** — chat conversation metadata (pillar, title)
- **`chat_messages`** — individual messages (role, content, genui JSON)
- **`review_items`** — SM-2 spaced repetition state (item_id, item_type, pillar, ease_factor, interval_days, repetitions, next_due)
- **`conversation_summaries`** — post-session summary notes (takeaways, reflection, flagged review items, model, timestamps)
- **`weekly_digests`** — auto-generated weekly learning summaries (week_start UNIQUE, week_end, week_number, content, metrics JSON, created_at); index `idx_weekly_digests_week_start` on `week_start DESC`
- **`settings`** — key/value store

Two DB access patterns coexist:
- `DbState(Mutex<Connection>)` — shared connection, locked per call (used by most commands)
- `db::get_connection(&app)` — opens a fresh `rusqlite::Connection` per call (used by `review.rs`, `digest.rs`); safe under WAL but bypasses the shared mutex

## Sync Server
Axum HTTP server on a local port (start/stop via Tauri commands). Used to sync conversations from mobile/web to desktop. `SyncServerHandle(Mutex<Option<...>>)` managed as Tauri app state.

## Voice
**STT** (desktop only, behind `#[cfg(not(target_os = "android"))]`):
- `sherpa-onnx` — default, ONNX runtime (faster startup)
- `whisper-rs` — whisper.cpp via FFI (higher accuracy, requires cmake)
Models downloaded on demand. Status tracked by `SttModelStatus`.

**TTS**: ElevenLabs API. Voice ID configurable in `VoiceConfig`. Streamed audio bytes returned from Tauri command.

## Provider Config
`ProviderConfig { provider, model, apiKey?, baseUrl? }` persisted in Zustand.
Supported providers: `anthropic` | `ollama` | `openrouter` | `google`.
Default: `anthropic / claude-sonnet-4-5`.

## Key Types
All TypeScript interfaces in `src/data/types.ts`. Match Rust serde structs exactly (camelCase).
Key types: `PillarId`, `AiMessage`, `GenUIBlock`, `ProviderConfig`, `VoiceConfig`, `SessionLog`, `ProgressData`, `TodaySchedule`, `ReviewItem`, `ReviewCounts`, `ConversationSummary`, `FlaggedReviewItem`, `SessionSummaryData`, `WeeklyDigest`, `DigestMetrics`.

## Spaced Repetition
SM-2 algorithm in `src-tauri/src/commands/review.rs`. Quality grades 0–5 (≥3 passes). Failed reviews reset interval to 1 day; ease factor floored at 1.3.
- Frontend hooks: `useReview` (recordAttempt), `useReviewCounts` (polls every 60s), `useDueReviews`
- Item IDs derived deterministically via `buildReviewItemId(type, pillar, question)` (djb2 hash) so the same flashcard/quiz across sessions maps to one review row
- `Flashcard` and `Quiz` GenUI renderers call `recordAttempt` on user interaction
- `ReviewWidget` on the Dashboard surfaces due-count

## Post-Session Summaries
AI-generated structured notes at the end of each chat session, capturing key takeaways, a reflection question, and flagged flashcards/quizzes for spaced repetition.
- Frontend hook: `useSessionSummary` — calls `runSessionSummary(conversationId)` to generate/fetch summary
- Read-only hook: `useConversationSummary(conversationId)` — displays existing summary with loading state
- Tauri commands: `get_conversation_summary`, `save_conversation_summary`, `list_recent_summaries`, `seed_review_items_from_summary` (in `summaries.rs`); `summarize_conversation` (in `ai.rs`)
- Zustand: `pendingPrompt` state + `setPendingPrompt` action for queuing reflection replies
- Automatic triggers: window close (beforeunload), conversation switch, new conversation, startup backfill
- UI: `SummaryCard` component renders takeaways/reflection/flagged items, shown in ProgressView and at top of active conversation
- Prompt: `SESSION_SUMMARY_PROMPT` in `src/lib/genui.ts` instructs the model to emit a single `<genui type="session-summary">` block

## Weekly Digest
Auto-generated weekly learning report covering session stats, pillar mastery deltas, knowledge gaps, and AI-written recommendations for the next week.
- Frontend hook: `useWeeklyDigest` — `loadDigests(limit=12)`, `generate(weekStart?)`, `maybeGenerateDue()` (on-launch catch-up), `exportDigest(weekStart)` (markdown export to disk)
- Tauri commands (in `digest.rs`): `generate_weekly_digest`, `get_weekly_digests`, `maybe_generate_due_digest`, `export_weekly_digest`. Uses the per-call `db::get_connection(&app)` pattern (like `review.rs`) and the `collect_completion` helper for AI generation; `export_weekly_digest` writes via `tokio::fs::write`.
- Database: `weekly_digests` table keyed by `week_start` (Monday, `UNIQUE`); `metrics` is a JSON blob of `DigestMetrics` (totalHours, hoursByPillar, sessionsCount, streak, pillarsCovered, topGaps, recommendedFocus)
- Week boundaries: Monday–Sunday; `most_recent_completed_week()` treats Sunday as the completion trigger. Sprint week number 1–12 aligns with `schedule.rs::get_week_number` (sprint start 2026-06-01)
- Zustand ephemeral state: `weeklyDigests` (list) + `selectedDigestWeek` (UI selection); actions `setWeeklyDigests` / `setSelectedDigestWeek` — never persisted
- UI: `WeeklyDigestCard` component (in `src/components/progress/`, rendered by `ProgressView`) shows the digest markdown, a past-week selector, and regenerate/export controls
- Automatic trigger: App.tsx on-launch effect calls `maybeGenerateDue()` then `loadDigests()`, guarded by a `useRef` against StrictMode double-mount. Idempotent on the backend via `UNIQUE(week_start)`

## Tauri IPC Layer
`src/lib/tauri.ts` provides `tauriInvoke()` and `tauriListen()` wrappers with browser fallback mocks for dev server testing without full Tauri.

## Claude Code Customizations
This project includes Claude Code agents, commands, and rules under `.claude/`:

### `.claude/agents/`
Custom agents for specialized tasks:
- `staff-backend-dev` — Rust backend implementation (Tauri, database, AI providers)
- `staff-frontend-dev` — React/TypeScript frontend (components, hooks, state)
- `staff-planner` — Architecture planning and implementation strategies
- `staff-code-reviewer` — Code quality, patterns, and consistency checks
- `staff-tdd-guide` — Test-driven development for Rust/TypeScript
- `staff-security-reviewer` — Security-sensitive changes (prompts, API keys, sync server)
- `staff-qa-testing-engineer` — QA test plans and manual testing checklists
- `staff-researcher` — Research techniques and library evaluation (within Tauri v2 + React 18 constraints)
- `staff-product-manager` — Product decisions for pillars, session logging, and learning features

### `.claude/commands/`
Custom slash commands for workflow automation:
- `/run-tests` — Execute Rust and TypeScript tests
- `/add-feature` — Scaffold new features
- `/refactor-clean` — Review and improve code quality
- `/stack-status` — Show project build and test status
- `/update-skills` — Refresh Claude skills

### `.claude/rules/`
Centralized coding standards organized by domain:
- `common/coding-style.md` — General style (naming, docs, error messages, React/Tauri patterns)
- `common/git-workflow.md` — Commit messages, branching, pre-commit checks
- `common/security.md` — API keys, Tauri security, database safety, prompt injection, sync auth
- `common/testing.md` — Rust tests, TypeScript type checks, manual QA checklist, GenUI parser validation
- `typescript/typescript-patterns.md` — React, Zustand, Tauri IPC, hooks, types, styling
- `rust/rust-patterns.md` — Async runtime, Tauri commands, database, streaming, error handling, serialization

## Never Do
- Never call `DbState.lock()` and hold the lock across an `await` — deadlock risk
- Never use `unwrap()` in command handlers — return `Result<T, String>`
- Never store derived/computed data in Zustand — compute in selectors or components
- Never add network calls directly in components — always go through hooks and Tauri commands
- Never hardcode the system prompt in components — it lives in `useAI.ts`
- Never bypass the GenUI parser — all AI text goes through `finalizeStream()`
- Never use `std::fs` in async Tauri commands — it blocks the runtime
- Never store sensitive API keys in the Zustand persist layer (they're already in providerConfig — acceptable for local app)
