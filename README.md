# ◈ Personal Tutor

A personal AI-powered learning companion for the **3-Month Growth Sprint** — built with Tauri v2 (Rust) + React. Runs on macOS desktop and iOS mobile.

---

## Features

| Feature | Details |
|---|---|
| **Dashboard** | Today's schedule with active block highlighting, pillar progress bars, streak heatmap |
| **AI Tutor** | Streaming chat with multi-provider support — Anthropic, Ollama, OpenRouter, Google AI Studio |
| **Generative UI** | AI renders interactive diagrams, flashcards, quizzes, code blocks, concept maps, timelines |
| **5 Pillars** | Curriculum checklists, resources, and milestone tracking for all 5 growth areas |
| **Progress Tracker** | SQLite-backed session logging, streak tracking, monthly milestone status |
| **Notifications** | Daily study session reminders via native OS notifications |
| **Multi-provider AI** | Switch between cloud and local LLMs without restarting |

---

## Stack

```
Frontend    React 18 + TypeScript + Vite + Tailwind CSS v3
State       Zustand
Animation   Framer Motion
Diagrams    Mermaid.js (rendered in Generative UI)
Syntax HL   Shiki
Routing     React Router v6

Backend     Rust + Tauri v2
Database    SQLite via rusqlite (bundled)
HTTP        reqwest (async, streaming)
Async       Tokio
Plugins     tauri-plugin-notification, tauri-plugin-store, tauri-plugin-shell
```

---

## Quick Start

### Prerequisites

- **Rust** (stable) — `rustup update stable`
- **Tauri CLI v2** — `cargo install tauri-cli --version "^2"`
- **Node.js 20+** and **npm**
- (Optional) **Xcode** for iOS target

```bash
# Clone / enter the project
cd /Users/saimirbaci/Dev/opsync/repos/automations/personal_tutor

# Install JS dependencies
npm install

# Run in development (opens desktop window)
npm run tauri dev

# UI-only browser dev (no Tauri, uses mock data)
npm run dev
```

### Production build

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## AI Provider Setup

Open **Settings** in the app and configure your preferred provider:

| Provider | Required | Notes |
|---|---|---|
| **Anthropic** | API key | `claude-sonnet-4-5` recommended |
| **Ollama** | Running locally | Default URL: `http://localhost:11434` — `llama3.2` default |
| **OpenRouter** | API key | Access to all major models |
| **Google AI Studio** | API key | `gemini-2.0-flash` default |

API keys are stored securely in Tauri's encrypted store (`tauri-plugin-store`), never in plain files.

---

## Architecture

```
personal_tutor/
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── lib.rs                # App setup, command registration
│       ├── main.rs               # Entry point
│       ├── db/mod.rs             # SQLite (sessions, milestones, settings)
│       ├── ai/
│       │   ├── provider.rs       # AiProvider trait + ProviderConfig types
│       │   ├── anthropic.rs      # Anthropic SSE streaming
│       │   ├── ollama.rs         # Ollama NDJSON streaming
│       │   ├── openrouter.rs     # OpenRouter SSE (OpenAI-compatible)
│       │   └── google.rs         # Gemini SSE streaming
│       └── commands/
│           ├── ai.rs             # stream_chat → emits ai-token / ai-done events
│           ├── progress.rs       # log_session, get_progress, get_streak, update_milestone
│           └── schedule.rs       # get_today_schedule, schedule_notification
│
└── src/                          # React frontend
    ├── data/
    │   ├── types.ts              # All TypeScript interfaces
    │   └── plan.ts               # Full 3-month curriculum (5 pillars × 12 weeks)
    ├── store/appStore.ts         # Zustand global state
    ├── lib/
    │   ├── tauri.ts              # Safe Tauri wrappers (+ browser mock fallback)
    │   └── utils.ts             # cn(), parseGenUIBlocks(), getWeekNumber()
    ├── hooks/
    │   ├── useAI.ts              # Streaming AI with GenUI system prompt
    │   ├── useProgress.ts        # Session logging + milestone updates
    │   └── usePlan.ts            # Today's schedule, current topic lookup
    └── components/
        ├── layout/               # Layout, Sidebar, TopBar
        ├── dashboard/            # Dashboard, TodayCard, PillarProgress, StreakWidget
        ├── tutor/
        │   ├── TutorChat.tsx     # Main tutor view with pillar selector
        │   ├── MessageBubble.tsx # Message renderer (text + GenUI blocks)
        │   ├── InputBar.tsx      # Cmd+Enter textarea input
        │   └── genui/            # Generative UI components:
        │       ├── Diagram.tsx   # Mermaid diagrams (dark themed)
        │       ├── Flashcard.tsx # 3D flip card (framer-motion rotateY)
        │       ├── Quiz.tsx      # Multiple choice with feedback
        │       ├── CodeBlock.tsx # Shiki syntax highlighting + copy
        │       ├── ConceptMap.tsx # SVG concept graph with hover
        │       ├── Timeline.tsx  # Animated stagger vertical timeline
        │       └── KeyInsight.tsx # Styled callout block
        ├── pillars/              # PillarView (tabs), CurriculumList, ResourceList, MilestoneList
        ├── progress/             # ProgressView (session history, charts)
        └── settings/             # Settings (provider config, notifications)
```

---

## Generative UI

The AI tutor uses structured tags to render rich interactive components inline. When prompting the AI, the system prompt instructs it to wrap content in `<genui>` tags:

```
<genui type="diagram">
graph TD
    A[User Input] --> B[Tokenizer]
    B --> C[Embedding Layer]
    C --> D[Transformer Blocks]
    D --> E[Output Head]
</genui>

<genui type="flashcard">
{"question": "What is the role of the Query matrix in attention?", "answer": "Q represents what information the current token is looking for. It's multiplied against Keys (K) to compute attention scores that determine how much to weight each position's Values (V)."}
</genui>

<genui type="quiz">
{"question": "Which of these is NOT a benefit of FlashAttention?", "options": ["Reduced memory usage", "Faster training on long sequences", "Improved model accuracy", "IO-aware tiling"], "correct": 2, "explanation": "FlashAttention improves speed and memory efficiency through IO-aware computation, but doesn't inherently change model accuracy."}
</genui>

<genui type="code">
{"language": "python", "filename": "attention.py", "code": "import torch\n\ndef scaled_dot_product_attention(Q, K, V):\n    d_k = Q.size(-1)\n    scores = torch.matmul(Q, K.transpose(-2, -1)) / d_k**0.5\n    weights = torch.softmax(scores, dim=-1)\n    return torch.matmul(weights, V)"}
</genui>

<genui type="key-insight">
The KV cache grows linearly with sequence length — this is why long-context inference is so memory-hungry and why techniques like GQA and sliding window attention exist.
</genui>
```

The `parseGenUIBlocks()` utility in `src/lib/utils.ts` extracts these tags from the streamed response and the `GenUIRenderer` in `src/components/tutor/genui/index.tsx` renders the right component.

---

## 5 Growth Pillars

| # | Pillar | Color | Daily Block |
|---|---|---|---|
| 🧠 | LLM Architectures & RLHF | `#2E5FA3` | 45 min (Mon/Wed/Fri) |
| ⚡ | Inference Hardware | `#0E7C86` | 45 min (Tue/Thu/Sat) |
| 🤝 | Technical Sales (Robotics) | `#C9762A` | 45 min alternating |
| 🗣️ | Communication Skills | `#7B3F8E` | 30 min (Wed focus) |
| 🎙️ | Voice & Command | `#B54A00` | 15 min daily |

Plan duration: **June 1 – August 31, 2026** (12 weeks, 90 days)

---

## Adding to iOS / Mobile

Tauri v2 supports iOS via `tauri ios`:

```bash
# Initialize iOS target (requires Xcode)
npm run tauri ios init

# Run on iOS simulator
npm run tauri ios dev
```

The app is responsive and works at mobile widths — the sidebar collapses to icon-only mode below 768px.

---

## Development Notes

- **Browser mode** (`npm run dev`) uses mock data from `src/lib/tauri.ts` so you can iterate on UI without the Tauri runtime
- **Hot reload** works for the React frontend; Rust changes require a full rebuild
- The DB lives at `{app_data_dir}/personal_tutor.db` (e.g. `~/Library/Application Support/com.augmentifai.personal-tutor/`)
- Tauri events used for streaming: `ai-token` (chunk), `ai-done` (finished), `ai-error` (error string)

---

## Roadmap

- [ ] Spaced repetition system for flashcards (SM-2 algorithm in Rust)
- [ ] Voice recording + transcription for the Voice pillar practice sessions
- [ ] AI-generated weekly review report (PDF export)
- [ ] iCloud sync for progress data
- [ ] Widget for macOS notification center showing today's block
- [ ] Multiplayer / accountability partner mode
