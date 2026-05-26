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

## State Management
Single Zustand store in `src/store/appStore.ts` with `persist` middleware.
Persisted keys: `providerConfig`, `voiceConfig`, `sidebarCollapsed`, `activePillar`.
Ephemeral: all messages, streaming state, conversation list, progress data.

## Database (rusqlite)
SQLite at `{app_data_dir}/tutor.db`. WAL mode, foreign keys ON.
- **`sessions`** — study session logs (pillar, hours, energy, note)
- **`milestones`** — per-pillar milestone status (pending/in-progress/complete)
- **`conversations`** — chat conversation metadata (pillar, title)
- **`chat_messages`** — individual messages (role, content, genui JSON)
- **`settings`** — key/value store

`DbState(Mutex<Connection>)` managed by Tauri. All DB access via `lock()`.

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
Key types: `PillarId`, `AiMessage`, `GenUIBlock`, `ProviderConfig`, `VoiceConfig`, `SessionLog`, `ProgressData`, `TodaySchedule`.

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
