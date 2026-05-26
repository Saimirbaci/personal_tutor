# Run Tests

Run all tests for the **Personal Tutor** app and report results.

## Commands to Run

```bash
# 1. Rust type check (fastest — run first)
cargo check

# 2. Rust linter
cargo clippy -- -D warnings

# 3. Rust unit tests
cargo test -- --nocapture

# 4. TypeScript type check
npx tsc --noEmit
```

## After Running

Report:
1. **Rust build**: PASS / FAIL (with first error if failed)
2. **Clippy**: PASS / warnings (list any warnings)
3. **Rust tests**: X passed, Y failed (with names of failing tests)
4. **TypeScript**: PASS / FAIL (with first error and file if failed)

## If Tests Fail

### Rust compile errors
- Read the exact error and affected file
- Common causes in this repo:
  - `Mutex<Connection>` held across `.await` — extract DB ops into scoped block
  - Missing command in `lib.rs::generate_handler![...]`
  - Type mismatch between Rust struct and what's passed from TypeScript
  - `whisper-rs`/`sherpa-onnx` missing cmake/C++ toolchain (desktop only)

### Rust test failures
- Run specific test: `cargo test test_name -- --nocapture`
- DB tests: check if schema in test setup matches `db/mod.rs`

### TypeScript errors
- Common causes:
  - New Zustand state added to implementation but not to `AppState` interface
  - New `GenUIBlock` type not added to the union in `src/data/types.ts`
  - `tauriInvoke<T>()` return type mismatch with Rust command return
  - `PillarId` used where a raw string was passed

### Clippy warnings
- Fix all warnings — they're treated as errors in this project
- Common: unused variables (`_` prefix), redundant clones, deprecated APIs
