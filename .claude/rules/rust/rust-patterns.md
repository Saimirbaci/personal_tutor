# Rust Rules (Personal Tutor Backend)

## Async Runtime
- Tokio async runtime via Tauri. All I/O must be async.
- Never block the runtime: no `std::thread::sleep()` — use `tokio::time::sleep()`
- Never use `std::fs` in async contexts — use `tokio::fs` or `spawn_blocking`
- Exception: rusqlite operations are synchronous — always run them in `spawn_blocking` or hold the `Mutex<Connection>` briefly and release before any await

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
- **Per-call `db::get_connection(&app)`** — opens a fresh `Connection` (used by `review.rs`, `digest.rs`). Safe under WAL for short reads/writes; useful for synchronous `#[tauri::command] pub fn` handlers that don't share state, or for async commands that must release the connection before a long `await` (e.g. an AI call).

Rules that apply to both:
- Use parameterized queries exclusively: `params![val1, val2]`
- Handle `rusqlite::Error::QueryReturnedNoRows` explicitly (map to `None` or 404)
- Tables: `sessions`, `milestones`, `settings`, `conversations`, `chat_messages`, `review_items`, `conversation_summaries`, `weekly_digests`

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
```rust
// Pattern used in commands/ai.rs — emit Tauri events for each token
let window = app.get_webview_window("main").ok_or("No window")?;
window.emit("ai-token", token)?;
// ...
window.emit("ai-done", ())?;
// On error:
window.emit("ai-error", error_message)?;
```
Always emit `ai-done` or `ai-error` — never leave the frontend in a streaming state.

For background AI tasks (weekly digests, session summaries) that must NOT touch the live-chat event stream, use the `pub(crate) collect_completion(messages, system, config, timeout_secs)` helper in `commands/ai.rs` instead. It buffers every token into a single `String` and returns it without emitting `ai-token`/`ai-done`/`ai-error`, so it can run concurrently with live chat.

## AI Provider Trait
```rust
// src-tauri/src/ai/provider.rs
#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream_completion(
        &self,
        messages: Vec<Message>,
        window: &WebviewWindow,
    ) -> Result<(), String>;
}
```
All providers implement this trait. New providers go in `src-tauri/src/ai/`.

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
