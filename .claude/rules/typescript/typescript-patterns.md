# TypeScript Rules (Personal Tutor Frontend)

## React Patterns
- Functional components only — no class components
- Keep components under 200 lines — extract sub-components and custom hooks
- Pillar-specific logic goes in pillar hooks, not directly in components
- Import path alias `@/` maps to `./src/` (configured in vite.config + tsconfig)

## State Management (Zustand)
- Single store: `src/store/appStore.ts` — do not create additional stores
- All AI streaming state lives in the store: `messages`, `isStreaming`, `streamingContent`, `currentToken`
- Never store derived data in the store — compute with selectors
- Persisted keys: `providerConfig`, `voiceConfig`, `sidebarCollapsed`, `activePillar`
- Use `useAppStore` hook — always select only what the component needs:

```typescript
// Good — fine-grained selector
const messages = useAppStore((s) => s.messages);
const isStreaming = useAppStore((s) => s.isStreaming);

// Avoid — subscribes to entire store
const store = useAppStore();
```

## Tauri IPC
- All Tauri calls go through `src/lib/tauri.ts` wrappers — never call `invoke()` directly in components
- Use `tauriInvoke<ReturnType>('command_name', args)` for commands
- Use `tauriListen('event-name', handler)` for events — remember to call the returned unlisten function in cleanup

```typescript
// In hooks/useAI.ts pattern
useEffect(() => {
  const unlisten = tauriListen<string>('ai-token', (event) => {
    appendToken(event.payload);
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

## Custom Hooks
- All Tauri command calls belong in hooks under `src/hooks/`
- AI interactions: `useAI` — builds system prompt, calls `stream_chat`, manages Tauri event subscriptions
- Voice: `useVoice` — calls `transcribe_audio`, `tts_elevenlabs`, model status/download
- Progress: `useProgress` — calls `log_session`, `get_progress`, `get_streak`
- Session summaries: `useSessionSummary` (imperative, triggers summary generation), `useConversationSummary` (read-only, displays existing summary)
- Never call `tauriInvoke` directly inside React components

## Types
- All shared TypeScript interfaces in `src/data/types.ts` — single source of truth
- Mirror Rust serde structs exactly (camelCase after `#[serde(rename_all = "camelCase")]`)
- Use `PillarId` type everywhere — never raw strings for pillar identifiers
- `GenUIBlock.type` is a discriminated union (now includes 'session-summary') — use it in switch statements
- `ConversationSummary` — AI-generated session notes (takeaways, reflection, flagged items); `SessionSummaryData` — model-emitted GenUI payload

```typescript
// GenUI rendering pattern
switch (block.type) {
  case 'flashcard': return <Flashcard data={block.data as FlashcardData} />;
  case 'quiz': return <Quiz data={block.data as QuizData} />;
  // ...
}
```

## Styling (Tailwind v3)
- Tailwind utility classes exclusively — no CSS modules or component-scoped CSS files
- Inline styles allowed only for dynamic values (e.g. pillar colors from data) that cannot be expressed as Tailwind utility classes
- Dark mode: use `dark:` prefix classes (Tailwind dark mode configured)
- Animation: Framer Motion for transitions — not CSS keyframes
- Pillar colors are defined in `src/data/pillars.ts` as `Pillar.color` and `Pillar.colorMuted`

## Markdown / Code Rendering
- Code blocks: use Shiki (`shiki` package) for syntax highlighting — not highlight.js or prism
- Mermaid: `mermaid.render()` for diagram GenUI blocks — call after DOM insertion
- `react-markdown` with `remark-gfm` for AI text content
- Never use `dangerouslySetInnerHTML` unless with sanitized Shiki/Mermaid output

## Type Safety
- Strict mode is enabled in `tsconfig.json` — no `any` types
- `tauriInvoke` return types must be explicitly typed
- Zustand actions must be fully typed in the `AppState` interface
- All Tauri event payloads should be typed with generics: `tauriListen<string>(...)`, `tauriListen<DownloadProgress>(...)`
