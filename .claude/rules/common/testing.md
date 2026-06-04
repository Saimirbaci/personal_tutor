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

### After any drift/rebalance change:
- [ ] Drift detection surfaces drifting pillars on the Dashboard (`DriftCatchUpCard`)
- [ ] "Catch up" queues a `pendingPrompt` and lands in the tutor with it sent once (one-shot, not re-sent on remount)
- [ ] Generate produces a `PlanAdjustment` proposal visible in `ProgressView` (`PlanRebalanceCard`)
- [ ] Apply reweights today's schedule (blocks bounded 15–120 min) and may inject a 30-min catch-up block for the most-behind pillar
- [ ] Dismiss clears the proposal and leaves the schedule unchanged
- [ ] Rebalance settings (drift threshold days, notifyOnRebalance, autoApplyRebalance) persist across restart
- [ ] `maybe_generate_due_rebalance` is idempotent — repeated app launches don't create duplicate proposals for the same week
- [ ] `rebalance.rs` Rust unit tests (`compute_drift`, `compute_rebalance`) pass via `cargo test`

### After any URL / paper-import change:
- [ ] Valid public article URL imports: title, excerpt, and content populate `SourceSummary`
- [ ] Private/loopback/link-local URLs are rejected (`localhost`, `127.0.0.1`, `[::1]`, `169.254.x`, `*.local`) — no fetch attempted
- [ ] Non-http(s) schemes (`file:`, `ftp:`, `data:`) are rejected
- [ ] Oversized body (>5MB) is capped — no memory blowup, graceful error
- [ ] Non-HTML / PDF / binary URL fails gracefully with a generic user-facing message (no raw fetch/parse error surfaced)
- [ ] `truncated` flag is set when content exceeds `MAX_CONTENT_CHARS` (12000)
- [ ] Import with missing API key still succeeds — `teachingBrief` simply absent (best-effort)
- [ ] `SourceImportChip` appears only when `detectUrl` finds a URL in the input
- [ ] "Teach from this" seeds `buildTeachPrompt` and the resulting GenUI flashcard/quiz blocks render and feed spaced repetition
- [ ] `source.rs` unit tests (extraction, boilerplate stripping, title/og:title fallback, URL scheme/host validation, private-host rejection, truncation, excerpt bounding) pass via `cargo test`

## GenUI Parser Tests (Critical)
The `parseGenUIBlocks` function in `appStore.ts` is core to the learning experience. Always verify:
- Tags are fully stripped from returned `text`
- JSON data is correctly parsed for `flashcard`, `quiz`, `code`, `concept-map`, `timeline`
- `diagram` and `key-insight` types return data as raw string (no JSON parse)
- Multiple blocks in one response are all extracted
- Malformed JSON inside a tag falls back to raw string (no crash)

## Classifier Parsers (`src/lib/genui.ts`)
Background classifiers (e.g. session depth scoring) reuse GenUI as an output contract. When changing `src/lib/genui.ts`, verify:
- `parseDepthScore` extracts the payload from a `<genui type="depth-score">` block **and** from a bare JSON object (fallback)
- Score is clamped to 1–5; float (`4.0`) and stringified (`"3"`) scores are tolerated
- `dimensions` defaults to `[]` when missing or non-array; `rationale` defaults to `''`
- Returns `null` (never throws) on unparseable input or a missing/non-numeric score
- `stripGenUITags` removes every `<genui>` block so a transcript carries only prose
- The Rust side mirrors these guarantees in `depth.rs::parse_depth_payload` — keep the two parsers' clamping/fallback behavior in sync. `depth.rs` has unit tests (clamp, float/string scores, malformed dimensions, save/get roundtrip, list ordering/limit) — use it as the model for new command-file tests.
