# Testing Rules

## Rust Backend Tests
- Unit tests in same file: `#[cfg(test)] mod tests { ... }`
- Use `rusqlite::Connection::open_in_memory()` for DB tests — never touch the real file
- Mock LLM API calls — never hit real Anthropic/OpenRouter/Ollama in tests
- Test Tauri commands by extracting pure business logic into testable helper functions
- Use `tokio::test` for async tests

```bash
cargo test                     # All Rust tests
cargo test -- --nocapture      # With stdout
cargo check                    # Fast type check
cargo clippy                   # Lint
```

## TypeScript Frontend Tests
- Unit tests: Vitest (if configured) or manual test with `npm run dev`
- Type check: `npx tsc --noEmit` — zero errors required
- Test Zustand store: test pure state transitions (addMessage, finalizeStream, etc.)
- Test `parseGenUIBlocks`: verify it strips `<genui>` tags from text and parses JSON correctly

```bash
npx tsc --noEmit               # TypeScript type check
npm run lint                   # ESLint (if configured)
```

## Manual Testing Checklist

### After any AI/streaming change:
- [ ] Message sends and streams tokens to UI correctly
- [ ] `ai-done` triggers `finalizeStream()` and message appears
- [ ] `ai-error` shows error state (no crash, graceful recovery)
- [ ] GenUI blocks parse and render for each type: flashcard, quiz, code, diagram, key-insight, concept-map, timeline

### After any DB/rusqlite change:
- [ ] App starts fresh (no existing DB) without error
- [ ] App starts with existing DB — no migration conflict
- [ ] Conversation CRUD: create, list, load messages, delete
- [ ] Session log saves and appears in progress view

### After any voice change:
- [ ] STT model status check works
- [ ] Model download progress events fire
- [ ] Transcription returns text from audio
- [ ] TTS plays ElevenLabs audio for AI response

### After any provider change:
- [ ] Provider config saves and persists across restart
- [ ] Streaming works with the new provider
- [ ] Error message shown when API key is missing/invalid

## GenUI Parser Tests (Critical)
The `parseGenUIBlocks` function in `appStore.ts` is core to the learning experience. Always verify:
- Tags are fully stripped from returned `text`
- JSON data is correctly parsed for `flashcard`, `quiz`, `code`, `concept-map`, `timeline`
- `diagram` and `key-insight` types return data as raw string (no JSON parse)
- Multiple blocks in one response are all extracted
- Malformed JSON inside a tag falls back to raw string (no crash)
