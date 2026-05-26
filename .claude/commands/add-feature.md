# Add Feature

You are implementing a new feature in the **Personal Tutor** app — a Tauri v2 desktop learning application.

## Repo Structure You Must Understand First

Read these files before writing any code:
1. `src-tauri/src/lib.rs` — to know what commands are registered
2. `src-tauri/src/db/mod.rs` — to understand the schema and add new tables
3. `src/store/appStore.ts` — to understand existing state and extend it
4. `src/data/types.ts` — to add new TypeScript interfaces

## Feature: $ARGUMENTS

## Implementation Process

### Step 1: Plan (read before writing)
Before writing any code, read the relevant existing files:
- Find similar existing features and understand their pattern
- Check `commands/` for a similar Tauri command you can model on
- Check if any DB tables need to change (look at `db/mod.rs`)
- Check if any types need to be added (look at `src/data/types.ts`)

### Step 2: Backend (Rust) — implement in this order:
1. **Types/structs** — add Serde structs needed for the command's input/output
2. **DB schema** (if needed) — add `CREATE TABLE IF NOT EXISTS` to `db/mod.rs::init()`
3. **Command handler** — create or update file in `src-tauri/src/commands/`
4. **Registration** — add the command to `lib.rs::tauri::generate_handler![...]`
5. **Verify**: run `cargo check` — zero errors required before moving to frontend

Key Rust rules for this repo:
- `DbState(Mutex<Connection>)` — never hold the lock across an `.await` point
- Return `Result<T, String>` from all commands
- SQL always uses `params![]` macro — no string interpolation
- STT/voice code gated with `#[cfg(not(target_os = "android"))]`

### Step 3: Frontend (TypeScript) — implement in this order:
1. **Types** — add interfaces to `src/data/types.ts` matching the Rust structs exactly (camelCase)
2. **Hook** — create or update hook in `src/hooks/` using `tauriInvoke<T>()` from `src/lib/tauri.ts`
3. **Store** (if needed) — add state and actions to `AppState` interface AND implementation in `src/store/appStore.ts`
4. **Component** — build the UI component using Tailwind classes
5. **Verify**: run `npx tsc --noEmit` — zero errors required

Key TypeScript rules for this repo:
- Use `tauriInvoke` and `tauriListen` from `@/lib/tauri`, never raw `invoke()`
- Fine-grained Zustand selectors — `useAppStore((s) => s.specificField)`
- `PillarId` typed, not raw strings — it's `'llm' | 'hardware' | 'sales' | ...`
- GenUI blocks (if adding a new type): update `GenUIBlock['type']` union in types.ts + add case to parser in `appStore.ts`

### Step 4: If AI Streaming Is Involved
This app streams via Tauri events. Pattern to follow:
```typescript
// In the hook:
useEffect(() => {
  const cleanup = tauriListen<string>('ai-token', (e) => appendToken(e.payload));
  return () => { cleanup.then(fn => fn()); };
}, []);
```
```rust
// In the command:
window.emit("ai-token", token_string)?;
// ...at end:
window.emit("ai-done", ())?;
// or on error:
window.emit("ai-error", error_message)?;
```
Always emit `ai-done` or `ai-error` — never leave the frontend streaming state active.

### Step 5: Test
- `cargo test` — Rust unit tests
- `npx tsc --noEmit` — TypeScript types
- Manual test: `npm run tauri dev` — verify the feature end-to-end

### Step 6: Summary
After implementing, provide:
- Files created/modified with 1-sentence description of each change
- Any new Tauri commands added (Rust name → TypeScript invoke name)
- Any new DB tables or columns
- Any caveats or follow-up work needed
