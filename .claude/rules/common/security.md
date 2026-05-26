# Security Rules

## API Keys
- Never hardcode API keys for Anthropic, OpenRouter, Google, or ElevenLabs in source code
- API keys are stored in `ProviderConfig` / `VoiceConfig` via Zustand persist (local app — acceptable)
- Never log API keys, tokens, or voice IDs — even at DEBUG level
- Never commit `.env` files containing real keys

## Tauri Command Security
- Tauri commands are the only bridge between frontend and system — keep them minimal
- Never expose raw file system paths to the frontend beyond what's needed
- Validate all inputs from frontend before using in SQL queries or shell operations
- Use `Mutex<Connection>` correctly — never hold the lock while doing async I/O

## Database
- All SQL uses rusqlite parameterized queries — never string interpolation
- Example: `conn.prepare("SELECT * FROM sessions WHERE pillar = ?1")?.query([&pillar])?`
- Database file is in `app_data_dir` — user-owned, not world-readable by default
- Never expose raw SQLite errors to the frontend — wrap in user-friendly messages

## LLM Prompt Safety
- Never inject raw, unsanitized user input directly into system prompts
- The system prompt in `useAI.ts` is constructed from static template + pillar context
- Never trust AI responses as code to execute — they are display-only (except GenUI rendering)
- The GenUI system renders known block types only — reject unknown `type` values silently

## Sync Server
- The local Axum sync server binds to `127.0.0.1` only — never `0.0.0.0` without auth
- Add authentication before accepting any data from the sync endpoint
- Validate sync payloads with Serde before touching the database

## Voice Data
- Audio data is base64-encoded and sent to ElevenLabs/STT services — never persisted locally
- Do not log audio buffers or transcription results at DEBUG level in production builds
- STT model files are downloaded from trusted sources (verify checksums when added)
