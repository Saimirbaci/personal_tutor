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
│   └── lib/                 → Utilities (tauri.ts wrappers, genui.ts helpers, formatters)
│
Rust Backend (Tauri v2 + rusqlite + Tokio)
└── src-tauri/src/
    ├── lib.rs               → App entry, plugin registration, command registration
    ├── db/mod.rs            → DbState(Mutex<Connection>), schema init, WAL mode
    ├── commands/            → Tauri command handlers (grouped by domain)
    │   ├── ai.rs            → stream_chat, get_providers, model listing, save_provider_config, collect_completion (non-streaming AI for background features)
    │   ├── conversations.rs → CRUD + bulk_import_sync
    │   ├── progress.rs      → log_session, get_progress, get_streak, update_milestone
    │   ├── review.rs        → SM-2 spaced repetition (record_review_attempt, get_due_reviews, get_review_counts)
    │   ├── mastery.rs       → per-topic mastery scoring (recompute_mastery, get_mastery_scores)
    │   ├── activation.rs    → pre-session activation quiz (get_activation_quiz)
    │   ├── gaps.rs          → knowledge-gap detection (get_knowledge_gaps, detect_knowledge_gaps, dismiss_gap, mark_gap_drilled)
    │   ├── depth.rs         → session depth scoring (save/get/list_conversation_depth)
    │   ├── rebalance.rs     → drift detection + adaptive plan rebalancing (get_pillar_drift, generate/apply/dismiss_plan_adjustment, maybe_generate_due_rebalance, get/set_rebalance_settings)
    │   ├── schedule.rs      → get_today_schedule, schedule_notification
    │   ├── source.rs        → URL / paper import (fetch_and_summarize_url) — network/parse only, no DB; SSRF-guarded fetch + scraper HTML extraction + optional collect_completion teaching brief
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

**Non-rendered GenUI (classifier contract):** some blocks are an output *contract* for a background classifier rather than UI. `<genui type="depth-score">{"score": N, "rationale": "...", "dimensions": [...]}</genui>` is emitted by the session-depth classifier and parsed by `parseDepthScore()` in `src/lib/genui.ts` — it is never shown in chat. `src/lib/genui.ts` also holds `stripGenUITags()` (removes `<genui>` blocks from a transcript before sending it to a classifier) and `DEPTH_SCORE_PROMPT` (the classifier system prompt). See **Session Depth Scoring** below.

## AI Streaming
All AI responses stream via Tauri events — never polled:
- `ai-token` → `appendToken(token)` in store
- `ai-done` → `finalizeStream()` (parses GenUI, saves to messages)
- `ai-error` → error display

The `useAI` hook in `src/hooks/useAI.ts` handles event subscriptions and calls the `stream_chat` Tauri command.

## Socratic Mode
Per-pillar toggle that switches the tutor from explain-first to retrieval-forcing, question-back pedagogy. Frontend-only (no backend changes).
- Store state: `socraticModeByPillar: Record<string, boolean>` keyed by `PillarId` or `'__global__'` for general context. Persisted.
- Helpers: `src/lib/utils.ts` exports `SOCRATIC_GLOBAL_KEY` and `socraticKey(pillar)` — single source of truth for key derivation.
- Prompt: `useAI.ts` appends `SOCRATIC_MODIFIER` to the system prompt when mode is on for the resolved pillar context.
- UI: `TutorChat` header toggle (MessageCircleQuestion icon) calls `toggleSocraticMode(selectedPillar)`.

## State Management
Single Zustand store in `src/store/appStore.ts` with `persist` middleware.
Persisted keys: `providerConfig`, `voiceConfig`, `forgettingCurveSettings`, `sidebarCollapsed`, `activePillar`, `socraticModeByPillar`, `activationQuizEnabled`, `activationQuizLength`.
Ephemeral: all messages, streaming state, conversation list, progress data, `pillarDrift`, `planAdjustments`, `pendingPrompt` (NOT persisted).
Actions: `toggleSocraticMode(pillar)`, `setSocraticMode(pillar, enabled)` for per-pillar Socratic toggle.

## Database (rusqlite)
SQLite at `{app_data_dir}/tutor.db`. WAL mode, foreign keys ON.
- **`sessions`** — study session logs (pillar, hours, energy, note)
- **`milestones`** — per-pillar milestone status (pending/in-progress/complete)
- **`conversations`** — chat conversation metadata (pillar, title)
- **`chat_messages`** — individual messages (role, content, genui JSON)
- **`review_items`** — SM-2 spaced repetition state (item_id, item_type, pillar, ease_factor, interval_days, repetitions, next_due)
- **`mastery_scores`** — per-topic mastery (PK `pillar_id`+`item_id`; score, quiz_accuracy, ease_norm, depth_norm)
- **`knowledge_gaps`** — auto-detected gaps (PK `gap_id`; pillar, topic_key, severity, signal_summary, status; UNIQUE pillar+topic_key)
- **`conversation_depth`** — engagement-depth assessment per conversation (PK `conversation_id` → conversations ON DELETE CASCADE; score 1–5, rationale, dimensions JSON, model, message_count)
- **`settings`** — key/value store
- **`plan_adjustments`** — weekly rebalance proposals (week_start UNIQUE, week_number, rationale, adjustments JSON, status proposed/applied/dismissed, applied_at)
- **`settings`** — key/value store (also holds rebalance settings, e.g. `drift_threshold_days`)

Two DB access patterns coexist:
- `DbState(Mutex<Connection>)` — shared connection, locked per call (used by most commands)
- `db::get_connection(&app)` — opens a fresh `rusqlite::Connection` per call (used by `review.rs` and most newer feature commands: `mastery.rs`, `activation.rs`, `gaps.rs`, `depth.rs`); safe under WAL but bypasses the shared mutex. Preferred for synchronous `#[tauri::command] pub fn` handlers that don't share state.

Not every command touches the database: `source.rs` (`fetch_and_summarize_url`) is a pure network/parse command and uses **neither** access pattern — it has no `DbState`, no `get_connection`, and no SQL.

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
Key types: `PillarId`, `AiMessage`, `GenUIBlock`, `ProviderConfig`, `VoiceConfig`, `SessionLog`, `ProgressData`, `TodaySchedule`, `ReviewItem`, `ReviewCounts`, `MasteryScore`, `ActivationResult`, `KnowledgeGap`, `GapSignalKind`, `DepthScore`, `DepthScoreData`, `ConversationDepth`, `PillarDrift`, `DriftReport`, `PillarStatus`, `AdjustmentStatus`, `PillarAdjustment`, `PlanAdjustment`, `RebalanceSettings`, `SourceSummary`, `FetchSourceRequest`.

## Spaced Repetition
SM-2 algorithm in `src-tauri/src/commands/review.rs`. Quality grades 0–5 (≥3 passes). Failed reviews reset interval to 1 day; ease factor floored at 1.3.
- Frontend hooks: `useReview` (recordAttempt), `useReviewCounts` (polls every 60s), `useDueReviews`
- Item IDs derived deterministically via `buildReviewItemId(type, pillar, question)` (djb2 hash) so the same flashcard/quiz across sessions maps to one review row
- `Flashcard` and `Quiz` GenUI renderers call `recordAttempt` on user interaction
- `ReviewWidget` on the Dashboard surfaces due-count

## Per-Topic Mastery
`mastery.rs` computes a 0–1 mastery score per `(pillar_id, item_id)` blending quiz accuracy, normalized SM-2 ease, and depth signals (`quiz_accuracy`, `ease_norm`, `depth_norm`). Commands: `recompute_mastery`, `get_mastery_scores`. Frontend hook: `useMastery`. Type: `MasteryScore`.

## Pre-Session Activation Quiz
`activation.rs::get_activation_quiz` generates a short warm-up quiz to prime recall before a study session. Frontend hook: `useActivationQuiz`. Type: `ActivationResult`.

## Knowledge Gap Auto-Detection
`gaps.rs` detects weak topics from signals (`weak_quiz`, `low_ease`, `shallow_chat`, `stale` — see `GapSignalKind`) and persists them to `knowledge_gaps` (UNIQUE per pillar+topic_key). Commands: `get_knowledge_gaps`, `detect_knowledge_gaps`, `dismiss_gap`, `mark_gap_drilled`. Frontend hook: `useKnowledgeGaps`. Type: `KnowledgeGap`.

## Session Depth Scoring
Rates how deeply a learner engaged in a conversation on a 1–5 rubric (1 = surface Q&A, 5 = Socratic + applied scenarios + edge cases). Runs as a **fire-and-forget background classification** — it never touches the live chat stream.
- `ai.rs::collect_completion` — one-shot, non-streaming completion. Collects every token into a `String` (via an mpsc collector task) and returns it instead of emitting `ai-token`/`ai-done`. Used by classifiers that need a result without driving the chat UI.
- `src/lib/genui.ts` — `DEPTH_SCORE_PROMPT` (classifier system prompt), `stripGenUITags()` (clean transcript), `parseDepthScore()` (tolerant parse of the `<genui type="depth-score">` block or bare JSON; clamps score to 1–5, defaults `dimensions` to `[]`, returns `null` on failure).
- `src/hooks/useDepthScore.ts` — `runDepthScore(conversationId, {force?})` is idempotent and concurrency-safe (module-scoped `inFlight` dedupe, skips while `isStreaming`, short-circuits if already scored, swallows errors). `useConversationDepth(id)` reads a single assessment. `TutorChat` triggers scoring on navigate-away/new/switch/unmount and shows a `DepthIndicator` chip in the sidebar.
- `depth.rs` — `save_conversation_depth` (clamps 1–5, preserves original `created_at` on re-score, bumps the conversation's `updated_at`), `get_conversation_depth`, `list_conversation_depths`. Persists to `conversation_depth`. Has unit tests for clamping, float/string-score tolerance, malformed dimensions, and list ordering.
- Types: `DepthScore` (1|2|3|4|5), `DepthScoreData`, `ConversationDepth`.

## Drift Detection & Adaptive Rebalancing
"Drift" = Growth Pillars that have planned hours but no recent activity (older than the drift threshold, default 7 days). Logic lives in `src-tauri/src/commands/rebalance.rs` (per-call `db::get_connection` pattern, like `review.rs`). Pure helpers `compute_drift`, `compute_rebalance`, and `load_applied_adjustments` are unit-tested.
- **Weekly flow**: `generate_plan_rebalance` builds a `PlanAdjustment` (one per `week_start`, persisted in `plan_adjustments`) — shifting minutes toward behind pillars and trimming ahead ones, with an AI-written rationale via `collect_completion`. The user resolves it with `apply_plan_adjustment(weekStart)` or `dismiss_plan_adjustment(weekStart)`.
- **Schedule reweighting**: `get_today_schedule(app, date)` applies the single *applied* proposal (via `load_applied_adjustments`) to reweight today's blocks (bounded 15–120 min) and may inject a 30-min catch-up block for the most-behind pillar absent from today.
- **Tutor handoff**: the `DriftCatchUpCard` "Catch up" action sets the one-shot `pendingPrompt` and navigates to the tutor; `TutorChat` consumes `pendingPrompt` once on mount to seed a catch-up drill.
- **On launch**: `App.tsx` calls `maybe_generate_due_rebalance` once (idempotent — ensures the Sunday proposal exists).
- Frontend hooks: `useDrift` (`loadDrift`, auto-loads on mount), `usePlanRebalance` (`loadAdjustments`, `generate`, `apply`, `dismiss`, `maybeGenerateDue`)
- Components: `DriftCatchUpCard` (Dashboard), `PlanRebalanceCard` (ProgressView — on apply calls `usePlan().loadSchedule()` to reconcile), `RebalanceSettingsSection` in Settings (drift threshold days, notifyOnRebalance, autoApplyRebalance — persisted via `set_rebalance_settings`)

## URL / Paper Import (Teach-From-Source)
Lets the learner paste an article or research-paper URL and have the tutor teach from it. The import is a **network/parse-only** flow — `source.rs` uses no database (neither `DbState` nor `db::get_connection`).
- `source.rs::fetch_and_summarize_url(request: FetchSourceRequest) -> Result<SourceSummary, String>` — validates the URL, fetches it (reqwest, 30s timeout, browser UA), caps the body at `MAX_BODY_BYTES` (5 MB) via streamed `read_capped`, extracts readable text, truncates to `MAX_CONTENT_CHARS` (12 000 chars), and optionally drafts an AI teaching brief. Registered in `lib.rs` invoke_handler; `pub mod source` in `commands/mod.rs`. New deps: `scraper = "0.20"`, `url = "2"`.
- **SSRF guard**: `validate_public_url(raw)` allows only http/https and rejects localhost / `.local` / `.localhost` and private/loopback/link-local/unspecified IPv4+IPv6 (incl. `169.254.169.254` metadata and `[::1]`). Always validate before fetching.
- **Pure, unit-tested helpers**: `extract_readable(html, base)` (scraper-based title/byline/content — prefers og:title, prefers `article`/`main`/`[role=main]` containers, strips `nav`/`footer`/`header`/`aside`/`script`/`style` boilerplate, keeps leaf blocks), `truncate_content` (returns `(text, truncated)`), `make_excerpt` (280-char preview). `extract_readable` runs in `spawn_blocking` because scraper's `Html` is not `Send`. `source.rs` has a `#[cfg(test)] mod tests` with 8 unit tests.
- **AI brief is best-effort**: `generate_teaching_brief` reuses `collect_completion` and is called with `.ok()` — a missing API key or provider error never fails the import (the teaching flow works from `content` alone).
- **Frontend**: type `SourceSummary` ({ url, title, byline?, excerpt, content, wordCount, truncated, teachingBrief? }) in `src/data/types.ts` mirrors the Rust serde camelCase. Hook `src/hooks/useSourceImport.ts` → `useSourceImport()` returns `{ importUrl(url, generateBrief?), isImporting, error }`, threads `providerConfig`, swallows errors (returns `null` on failure). Pure helpers in `src/lib/sourceImport.ts`: `detectUrl(text)` (first http(s) URL, strips trailing punctuation) and `buildTeachPrompt(summary, pillarName)` (composes a pillar-aware teaching prompt that requests `genui` flashcard + quiz blocks).
- **Pipeline reuse**: `buildTeachPrompt` deliberately asks for GenUI flashcard/quiz blocks so the generated content flows through the existing `parseGenUIBlocks()`/`finalizeStream()` and spaced-repetition pipeline — no new rendering or review path.
- **UI**: `SourceImportChip.tsx` ("Teach from this" CTA) appears above the input when `InputBar.tsx` detects a URL; clicking it imports the source and seeds `buildTeachPrompt` via `onSend`.

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
- `staff-build-error-resolver` — Resolve Rust/Tauri build, TypeScript type, and cargo/npm dependency errors
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
- `/update-skills` — Audit and update `.claude/` agents, rules, and CLAUDE.md against the current codebase

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
