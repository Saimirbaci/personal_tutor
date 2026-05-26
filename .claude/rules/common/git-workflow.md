# Git Workflow Rules

## Commit Messages
- Format: `type(scope): description`
- Types: feat, fix, refactor, test, docs, chore, perf
- Scopes: tauri, frontend, ai, voice, db, sync, progress, genui, store, schedule, commands
- Keep subject under 72 characters. Use body for "why" details.
- Examples:
  - `feat(genui): add concept-map block renderer with Mermaid`
  - `fix(voice): handle sherpa-onnx model download failure gracefully`
  - `feat(ai): add Google AI Studio provider with streaming`
  - `refactor(store): extract finalizeStream into dedicated parser module`
  - `fix(db): release Mutex lock before awaiting notification`

## Branching
- `main` — production-ready, tested on desktop
- Feature branches: `feature/<description>`
- Bugfix branches: `fix/<description>`

## Pre-Commit Checks
```bash
cargo check                        # Rust type check — must pass
cargo clippy -- -D warnings        # Rust lint — zero warnings
npm run type-check                 # or: npx tsc --noEmit
```
Never commit with Rust compilation errors or TypeScript type errors.

## What Not To Commit
- `.env` files, API keys, ElevenLabs voice IDs (personal)
- `target/` — Rust build artifacts
- `node_modules/`, `dist/`
- `src-tauri/gen/` — Tauri generated files (platform-specific)
- Downloaded STT model files (`.onnx`, `.bin`)
- User database `tutor.db` or any runtime data
