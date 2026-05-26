# Stack Status

Check the current state of the **Personal Tutor** app codebase and report a health summary.

## What to Check

### 1. Rust Backend Health
```bash
cargo check 2>&1 | tail -5
cargo clippy 2>&1 | grep -E "^error|^warning" | head -20
```
Report: compile status, number of warnings

### 2. TypeScript Health  
```bash
npx tsc --noEmit 2>&1 | head -20
```
Report: type error count, first error if any

### 3. Dependency Status
Read `src-tauri/Cargo.toml` and `package.json` and report:
- Tauri version (should be v2)
- Key Rust deps: reqwest, rusqlite, tokio, async-trait versions
- Key npm deps: react, zustand, framer-motion, mermaid, shiki versions
- Any obviously outdated or pinned versions

### 4. Command Registration Audit
Read `src-tauri/src/lib.rs` and list all registered Tauri commands.
Cross-check: are all commands in `commands/*.rs` actually registered?

### 5. DB Schema Status
Read `src-tauri/src/db/mod.rs` and list all tables with their columns.
Report if any tables look incomplete (missing `created_at`, missing FK constraints, etc.)

### 6. Zustand Store Health
Read `src/store/appStore.ts` and check:
- `AppState` interface matches the store implementation
- Persisted keys are what's expected: `providerConfig`, `voiceConfig`, `sidebarCollapsed`, `activePillar`
- No obviously stale state (state fields that are defined but never used)

### 7. GenUI Coverage
Read `src/data/types.ts` and check `GenUIBlock['type']` union.
Report all supported block types and whether each has a renderer component.

## Output Format

```
## Personal Tutor — Stack Status

### Build Health
- Rust: ✅ Compiles / ❌ N errors
- Clippy: ✅ Clean / ⚠️ N warnings
- TypeScript: ✅ No errors / ❌ N errors

### Dependencies
- Tauri: v2.x.x ✅
- Rust key deps: [versions]
- npm key deps: [versions]

### Tauri Commands Registered: N
[list]

### DB Tables: N
[table names]

### GenUI Block Types Supported: N
[type names]

### Issues Found
[any inconsistencies or health concerns]

### Recommendations
[ordered list of what to address]
```
