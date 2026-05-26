# Refactor Clean

Perform a targeted refactor or cleanup in the **Personal Tutor** codebase.

## Target

$ARGUMENTS

If no target is specified, perform a general code health pass focusing on the highest-impact areas.

## Refactoring Process

### Step 1: Understand Before Changing
Read the target file(s) completely before making any edits.
Identify:
- What pattern is currently used?
- What's the improved pattern?
- What else depends on this code? (check with Grep)

### Step 2: Apply Refactors (Safe Patterns for This Repo)

**Extract repeated DB query patterns into helpers:**
```rust
// Before: repeated in multiple commands
let conn = state.0.lock().map_err(|e| e.to_string())?;
let mut stmt = conn.prepare("SELECT ...")?;
// ...

// After: extract to a helper function
fn get_messages_by_conversation(conn: &Connection, id: &str) -> rusqlite::Result<Vec<ChatMessage>> {
    // ...
}
```

**Extract repeated Zustand selectors into custom hooks:**
```typescript
// Before: repeated in multiple components
const messages = useAppStore((s) => s.messages);
const isStreaming = useAppStore((s) => s.isStreaming);

// After: custom hook
function useChatState() {
  return useAppStore((s) => ({ messages: s.messages, isStreaming: s.isStreaming }));
}
```

**Clean up unused Zustand state:**
- Check if state fields defined in `AppState` are actually used anywhere
- Grep for usages before removing

**Fix GenUI block type exhaustiveness:**
```typescript
// Add exhaustive check to switch
function renderBlock(block: GenUIBlock): JSX.Element {
  switch (block.type) {
    case 'flashcard': return <Flashcard data={block.data as FlashcardData} />;
    // ... all cases ...
    default: {
      const _exhaustive: never = block.type;
      return <div>Unknown block: {block.type}</div>;
    }
  }
}
```

**Tauri command extraction:**
If a command handler is over 50 lines, extract the logic into a helper function that can be unit tested independently.

### Step 3: Verify After Each Change
```bash
cargo check           # After Rust changes
npx tsc --noEmit      # After TypeScript changes
cargo test            # Run after any DB/logic changes
```

### Step 4: Do Not Refactor
- The `parseGenUIBlocks` function — it works, and changing parsing logic risks breaking all GenUI blocks
- The AI streaming event protocol (`ai-token`, `ai-done`, `ai-error`) — frontend and Tauri are coupled on these names
- Zustand `persist` configuration — changing keys breaks existing users' persisted state
- DB schema — never rename/drop columns in `db/mod.rs` without adding migration logic

### Step 5: Report
- Files changed and what changed
- Lines added/removed (approximate)
- Tests that passed after refactor
- Any remaining TODOs or follow-up work
