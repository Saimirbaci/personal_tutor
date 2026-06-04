# Rust Rules (Personal Tutor Backend)

## Async Runtime
- Tokio async runtime via Tauri. All I/O must be async.
- Never block the runtime: no `std::thread::sleep()` — use `tokio::time::sleep()`
- Never use `std::fs` in async contexts — use `tokio::fs` or `spawn_blocking`
- Exception: rusqlite operations are synchronous — always run them in `spawn_blocking` or hold the `Mutex<Connection>` briefly and release before any await
- Non-`Send` parsers must run in `spawn_blocking`: `scraper::Html` is not `Send`, so all HTML extraction (`commands/source.rs::extract_readable`) runs inside `spawn_blocking` — never hold an `Html` across an `.await`

## Tauri Command Pattern
```rust
#[tauri::command]
pub async fn command_name(
    app: AppHandle,
    state: State<'_, DbState>,
    param: SomeType,
) -> Result<ReturnType, String> {
    let result = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        // do DB work here, return data
        conn.query_row("SELECT ...", params![param], |row| { ... })
            .map_err(|e| e.to_string())?
    }; // lock released here — before any await
    
    // do async work after releasing the lock
    Ok(result)
}
```

## Database (rusqlite)
Two access patterns coexist — pick one consistently per command file:
- **Shared `DbState(pub Mutex<Connection>)`** — preferred for write-heavy or transactional flows. Always `lock().map_err(|e| e.to_string())?` — never `.unwrap()`. Lock for the shortest possible scope; extract data and release before any `await`.
- **Per-call `db::get_connection(&app)`** — opens a fresh `Connection` (used by `review.rs`, `rebalance.rs`, `mastery.rs`, and `listen.rs`). Safe under WAL for short reads/writes; useful for synchronous `#[tauri::command] pub fn` handlers that don't share state. `listen.rs` does a brief synchronous `get_connection` read to gather learner context, then releases it before the async AI + TTS work.

Rules that apply to both:
- Use parameterized queries exclusively: `params![val1, val2]`
- Handle `rusqlite::Error::QueryReturnedNoRows` explicitly (map to `None` or 404)
- Tables: `sessions`, `milestones`, `settings`, `conversations`, `chat_messages`, `review_items`, `plan_adjustments`

## Schema Migrations
- `CREATE TABLE IF NOT EXISTS` only creates new tables — it cannot add a column to a pre-existing table. New columns go through `db/mod.rs::run_migrations()`, which runs after table creation in `init()`.
- Add columns with the `add_column_if_missing(conn, table, column, alter_sql)` helper — it checks `PRAGMA table_info` rather than swallowing a duplicate-column error.
- Every migration must be idempotent (safe to re-run on an already-migrated DB).

```rust
fn run_migrations(conn: &Connection) -> Result<()> {
    add_column_if_missing(
        conn,
        "review_items",
        "last_notified_at",
        "ALTER TABLE review_items ADD COLUMN last_notified_at TEXT",
    )?;
    Ok(())
}
```

## Pure Logic for Testability
- Extract ranking/scoring/formatting out of `#[tauri::command]` handlers into pure functions that take plain rows + a clock value (e.g. `build_nudges(rows, now, max)`, `retention(...)`), so they unit-test without `AppHandle`/SQLite.
- The command handler stays thin: open the connection, query rows into a private struct (e.g. `NudgeRow`), then call the pure function.
- Inject "now" as a parameter (`now: DateTime<Local>`) instead of calling `Local::now()` inside the pure function — lets tests pin a fixed timestamp.

```rust
// Good — brief lock, no await while holding
let messages = {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT * FROM chat_messages WHERE conversation_id = ?1")?;
    stmt.query_map([&conversation_id], |row| { ... })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
};
// Now safe to do async work
```

## Streaming AI Responses
Providers do **not** emit Tauri events directly — they push tokens into an `mpsc::Sender<String>`. The *command layer* decides what to do with the channel:
- `stream_chat` bridges the channel to Tauri events (`ai-token` per token, then `ai-done`/`ai-error`).
- `collect_completion` (one-shot, for background classifiers like depth scoring) drains the channel into a `String` and returns it — no events emitted.

```rust
// stream_chat: bridge the channel to window events
let window = app.get_webview_window("main").ok_or("No window")?;
window.emit("ai-token", token)?;
// ...
window.emit("ai-done", ())?;
// On error:
window.emit("ai-error", error_message)?;
```
Always emit `ai-done` or `ai-error` in event-driven flows — never leave the frontend in a streaming state.

```rust
// collect_completion: drain the channel into a String (no events)
let (tx, mut rx) = mpsc::channel::<String>(256);
let collector = tokio::spawn(async move {
    let mut buf = String::new();
    while let Some(token) = rx.recv().await { buf.push_str(&token); }
    buf
});
provider.stream_completion(messages, system, tx).await.map_err(|e| e.to_string())?;
collector.await.map_err(|e| e.to_string())
```

### Non-Streaming Background AI
For background features that need an AI rationale without touching the live chat stream (e.g. plan rebalancing), use `collect_completion(messages, system, config, timeout_secs)` in `commands/ai.rs`. It reuses the provider's `stream_completion` plumbing but collects tokens into a buffer via an mpsc channel instead of emitting them to the UI, bounded by a timeout. Returns the full text as `Result<String, String>`.

### UI-Agnostic Shared Helpers
- Keep network/synthesis work in a UI-agnostic `pub async fn` helper, then have the `#[tauri::command]` thinly wrap it. Example: `voice.rs::synthesize_tts(text, api_key, voice_id) -> Result<Vec<u8>, String>` returns raw MP3 bytes from the ElevenLabs streaming endpoint; the `tts_elevenlabs` command wraps it and base64-encodes, while `listen.rs` reuses it directly for multi-chunk narration.
- Push multi-step progress to the UI with a Tauri event rather than a return-value-only flow. `listen.rs::generate_audio_lesson` emits `audio-lesson-progress` (`{stage, current, total}`) per chunk so the player shows generation progress.
- Extract `build_lesson_context`, `clean_script`, and `chunk_script` (split under `MAX_CHUNK_CHARS`, never splitting a word) as pure helpers, unit-tested in `listen.rs`.

## AI Provider Trait
```rust
// src-tauri/src/ai/provider.rs
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream_completion(
        &self,
        messages: Vec<AiMessage>,
        system: Option<String>,
        event_emitter: Sender<String>,   // tokio::sync::mpsc::Sender — NOT a window
    ) -> Result<()>;                      // anyhow::Result

    fn default_model(&self) -> &str;
    fn available_models(&self) -> Vec<String>;
}
```
All providers implement this trait and stay UI-agnostic (channel in, tokens out). The command layer adapts the channel to events or a collected string. New providers go in `src-tauri/src/ai/`.

## Network Commands (no DB)
Not every command touches the database. `commands/source.rs::fetch_and_summarize_url` is a pure network/parse command — it takes neither `DbState` nor `db::get_connection`, just fetches + parses + (optionally) calls `collect_completion`.
- Validate untrusted URLs before fetching (see security.md "Outbound URL Fetching (SSRF)" — `validate_public_url`).
- Cap untrusted response bodies with a streamed read, not an unbounded `.bytes().await`:

```rust
// read_capped: stop reading once MAX_BODY_BYTES is exceeded
let mut stream = resp.bytes_stream();
let mut buf = Vec::new();
while let Some(chunk) = stream.next().await {
    let chunk = chunk.map_err(|e| e.to_string())?;
    if buf.len() + chunk.len() > MAX_BODY_BYTES {
        return Err("Source too large to import.".into());
    }
    buf.extend_from_slice(&chunk);
}
```

- Keep the pure-helper testability pattern: `extract_readable`, `validate_public_url`, `truncate_content`, and `make_excerpt` are plain functions unit-tested without `AppHandle` or network I/O.
- Optional AI enrichment (the teaching brief) is best-effort via `collect_completion(...).ok()` — a missing API key must never fail the import.

## reqwest Usage
- Use `reqwest::Client` with `stream` feature (already in Cargo.toml)
- For SSE streaming: use `.bytes_stream()` and `futures_util::StreamExt`
- Always set timeouts: `.timeout(Duration::from_secs(120))`
- Use `rustls-tls` feature (already configured) — no native TLS

## Error Handling
- All public commands: `Result<T, String>` — convert with `.map_err(|e| e.to_string())`
- Internal helpers: `anyhow::Result` or domain-specific errors
- Never `panic!` or `unwrap()` in command handlers — errors surface to the UI
- Log errors before returning: `tracing::error!("Failed to stream chat: {}", e)`

## Platform Gating
```rust
// STT modules are desktop-only
#[cfg(not(target_os = "android"))]
pub mod whisper_stt;
#[cfg(not(target_os = "android"))]
pub mod sherpa_stt;
```
Use `#[cfg(not(target_os = "android"))]` consistently for platform-specific code.

## Serialization
- All types crossing the Tauri IPC use `#[derive(Serialize, Deserialize)]`
- Frontend-facing types use `#[serde(rename_all = "camelCase")]` to match TypeScript
- `GenUI` data stored in `chat_messages.genui` as `TEXT` (JSON string)
- `chrono::DateTime` serializes as ISO 8601 strings — use `serde` feature on chrono

## Sync Server
```rust
// src-tauri/src/commands/sync_server.rs
// Axum router bound to 127.0.0.1 only
// Handle stored in: SyncServerHandle(Mutex<Option<JoinHandle<()>>>)
```
Always check if a server is already running before starting a new one.
