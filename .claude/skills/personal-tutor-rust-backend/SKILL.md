---
name: personal-tutor-rust-backend
description: "Deep knowledge of the Personal Tutor Rust/Tauri backend. Use for: adding Tauri commands, database operations with rusqlite, streaming AI responses, sync server changes, voice command implementation, or any src-tauri/ work. Trigger when the user mentions commands/, db/, Cargo.toml, rusqlite, Mutex, stream_chat, or any backend Rust file."
---

# Personal Tutor — Rust Backend Deep Dive

You have deep knowledge of the Rust backend in `src-tauri/src/`. Use this to implement backend features correctly and avoid the specific pitfalls of this codebase.

---

## The #1 Rule: Mutex + Async

This is the most common source of bugs in this codebase:

```rust
// ❌ DEADLOCK — Mutex lock held across await
#[tauri::command]
pub async fn bad_command(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let data = conn.query_row("SELECT ...", [], |r| r.get(0))?;
    some_async_call().await?;  // DEADLOCK: conn still holds the lock
    Ok(data)
}

// ✅ CORRECT — lock released before await
#[tauri::command]
pub async fn good_command(state: State<'_, DbState>) -> Result<String, String> {
    let data = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT ...", [], |r| r.get(0))
            .map_err(|e| e.to_string())?
    }; // lock drops here
    some_async_call().await?;
    Ok(data)
}
```

---

## Adding a New Tauri Command (Checklist)

1. **Write handler** in `src-tauri/src/commands/<domain>.rs`
2. **Register** in `src-tauri/src/lib.rs`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       // ... existing commands ...
       domain::new_command,  // ← add here
   ])
   ```
3. **Verify**: `cargo check` — must compile before touching frontend

---

## Command Signatures

```rust
// Read-only DB command
#[tauri::command]
pub async fn list_conversations(
    state: State<'_, DbState>,
) -> Result<Vec<ConversationSummary>, String> {
    let rows = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        // ... query ...
    };
    Ok(rows)
}

// Write DB + return new ID
#[tauri::command]
pub async fn new_conversation(
    state: State<'_, DbState>,
    pillar: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO conversations (id, pillar, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![id, pillar, "New conversation", now],
        ).map_err(|e| e.to_string())?;
    }
    Ok(id)
}

// Streaming AI command (uses AppHandle for events)
#[tauri::command]
pub async fn stream_chat(
    app: AppHandle,
    _state: State<'_, DbState>,
    messages: Vec<Message>,
    provider_config: ProviderConfig,
) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("No main window")?;
    let provider = build_provider(&provider_config)?;
    provider.stream_completion(messages, &window).await
        .map_err(|e| {
            let _ = window.emit("ai-error", e.to_string());
            e
        })
}
```

---

## Database Operations

### Schema Location
All tables defined in `db/mod.rs::init()` — one `execute_batch()` call, all `CREATE TABLE IF NOT EXISTS`. No migration framework.

### Current Tables
```sql
sessions       (id TEXT PK, date TEXT, pillar TEXT, hours REAL, energy INTEGER, note TEXT, created_at TEXT)
milestones     (id TEXT PK, pillar TEXT, month INTEGER, status TEXT, updated_at TEXT) UNIQUE(pillar, month)
settings       (key TEXT PK, value TEXT)
conversations  (id TEXT PK, pillar TEXT, title TEXT, created_at TEXT, updated_at TEXT)
chat_messages  (id TEXT PK, conversation_id TEXT REFERENCES conversations ON DELETE CASCADE,
                role TEXT, content TEXT, genui TEXT, created_at TEXT)
review_items   (item_id TEXT PK, item_type TEXT, pillar TEXT, ease_factor REAL,
                interval_days INTEGER, repetitions INTEGER, next_due TEXT, last_reviewed TEXT)
```

### Two Access Patterns
```rust
// Pattern 1: Shared connection (most commands use this)
let conn = state.0.lock().map_err(|e| e.to_string())?;

// Pattern 2: Fresh connection per call (review.rs uses this)
let conn = db::get_connection(&app).map_err(|e| e.to_string())?;
// Safe under WAL mode — multiple readers, writes are serialized
```

### Query Patterns
```rust
// Single row → Option
let row = conn.query_row(
    "SELECT id, title FROM conversations WHERE id = ?1",
    params![id],
    |r| Ok(ConversationSummary { id: r.get(0)?, title: r.get(1)? }),
).optional().map_err(|e| e.to_string())?;

// Multiple rows → Vec
let mut stmt = conn.prepare("SELECT * FROM sessions WHERE pillar = ?1 ORDER BY date DESC")?;
let rows = stmt.query_map(params![pillar], |r| {
    Ok(SessionLog { id: r.get(0)?, date: r.get(1)?, /* ... */ })
})?
.collect::<Result<Vec<_>, _>>()
.map_err(|e| e.to_string())?;

// Insert
conn.execute(
    "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
    params![id, date, pillar, hours, energy, note, now],
).map_err(|e| e.to_string())?;
```

---

## AI Streaming Pattern

```rust
// In src-tauri/src/ai/provider.rs
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream_completion(
        &self,
        messages: Vec<Message>,
        window: &WebviewWindow,
    ) -> Result<(), String>;
}

// In a provider impl (e.g., anthropic.rs):
// 1. Build request
// 2. Stream response chunks
// 3. For each text token: window.emit("ai-token", token_string)?
// 4. At end: window.emit("ai-done", ())?
// 5. On error: window.emit("ai-error", error_message)?
// NEVER leave the frontend without an ai-done or ai-error
```

---

## Voice Commands (Desktop Only)

```rust
// src-tauri/src/commands/voice.rs
// All STT commands gated:
#[cfg(not(target_os = "android"))]
mod desktop_voice {
    use super::*;
    
    #[tauri::command]
    pub async fn transcribe_audio(
        audio_bytes: Vec<u8>,
        engine: String,  // "sherpa-onnx" | "whisper-cpp"
        model: String,   // "tiny" | "base" | "small"
        app: AppHandle,
    ) -> Result<String, String> { ... }
}
```

Sherpa-onnx and whisper-rs are in `[target.'cfg(not(target_os = "android"))'.dependencies]` in Cargo.toml.

### ElevenLabs TTS (all platforms)
`voice.rs` exposes a shared, UI-agnostic helper that returns raw MP3 bytes from the ElevenLabs streaming endpoint:

```rust
// src-tauri/src/commands/voice.rs
pub async fn synthesize_tts(text: &str, api_key: &str, voice_id: &str) -> Result<Vec<u8>, String>
```

The `tts_elevenlabs` command wraps `synthesize_tts` and base64-encodes the result. Listen Mode reuses `synthesize_tts` directly for multi-chunk narration.

---

## Listen Mode — Podcast-Style Audio Lessons

`src-tauri/src/commands/listen.rs` generates a **fresh** 5–10 min single-narrator (solo podcast) script each call, grounded in the learner's current progress/mastery/gaps, then synthesizes it to MP3 via ElevenLabs and returns base64.

```rust
#[tauri::command]
pub async fn generate_audio_lesson(
    app: AppHandle,
    pillar: String,
    topic: String,
    config: ProviderConfig,
    api_key: String,
    voice_id: String,
) -> Result<AudioLesson, String>
```

`AudioLesson` (serde camelCase): `pillar`, `topic`, `script`, `audioBase64`, `durationEstimateSecs`, `segmentCount`.

**Pattern**: per-call `db::get_connection` (like `review.rs`/`rebalance.rs`/`mastery.rs`) — no shared `DbState`.

**Flow**:
1. `gather_context` — brief synchronous read: `sessions` `SUM(hours)` + 3 recent non-empty notes, `mastery_scores` `AVG(score)`, up to 4 open `knowledge_gaps` labels ordered by severity.
2. `build_lesson_context` (pure) — compact prose summary; always returns a usable string even with no history.
3. `collect_completion` (in `commands/ai.rs`) writes the script with `LESSON_SYSTEM_PROMPT`, 120s timeout — no chat-stream events.
4. `clean_script` (pure) — strips markdown/genui/code-fences down to clean spoken prose.
5. `chunk_script` (pure) — splits under `MAX_CHUNK_CHARS = 2400` on sentence/word boundaries, never splitting a word.
6. `synthesize_tts` each chunk → concatenate MP3 bytes → base64.

Emits a Tauri event `audio-lesson-progress` with `{ stage, current, total }` (`emit_progress` helper) so the UI shows generation progress. Returns user-friendly errors (e.g. a missing ElevenLabs key) rather than raw provider output.

Pure helpers `build_lesson_context`, `clean_script`, `chunk_script`, and `estimate_duration_secs` are unit-tested in the same file.

Registered: `commands/mod.rs` adds `pub mod listen;`; `lib.rs` imports `listen` and registers `listen::generate_audio_lesson` in the invoke handler.

---

## Sync Server (Axum on 127.0.0.1)

```rust
// src-tauri/src/commands/sync_server.rs
pub struct SyncServerHandle(pub Mutex<Option<tokio::task::JoinHandle<()>>>);

// Registered in lib.rs:
app.manage(SyncServerHandle(Mutex::new(None)));

// Start: spawn Axum bound to 127.0.0.1:{port} only — never 0.0.0.0
// Stop: abort the JoinHandle
// Status: check if JoinHandle is Some and !is_finished()
```

---

## Cargo Dependencies (Key)

```toml
tauri = { version = "2", features = [] }
tauri-plugin-notification = "2"
tauri-plugin-store = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", default-features = false, features = ["json", "stream", "rustls-tls"] }
rusqlite = { version = "0.31", features = ["bundled"] }
chrono = { version = "0.4", features = ["serde"] }
anyhow = "1"
futures-util = "0.3"
uuid = { version = "1", features = ["v4"] }
async-trait = "0.1"
axum = { version = "0.7", features = ["json"] }
base64 = "0.22"

[target.'cfg(not(target_os = "android"))'.dependencies]
whisper-rs = { version = "0.14" }   # requires cmake + C++ toolchain
sherpa-onnx = "1.10"                # prebuilt libs, desktop only
```
