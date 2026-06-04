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
- Persisted keys: `providerConfig`, `voiceConfig`, `forgettingCurveSettings`, `sidebarCollapsed`, `activePillar`
- Ephemeral (NOT persisted) drift/rebalance keys: `pillarDrift`, `planAdjustments`, `pendingPrompt` — `pendingPrompt` is a one-shot queued for the tutor (e.g. a drift catch-up drill), consumed once after the tutor mounts
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
- Learning analytics: `useMastery`, `useActivationQuiz`, `useKnowledgeGaps`, `useDepthScore`
- Drift: `useDrift` — `loadDrift(thresholdDays?)` calls `get_pillar_drift`, stores the `DriftReport` (auto-loads on mount)
- Rebalance: `usePlanRebalance` — `loadAdjustments`, `generate`, `apply(weekStart)`, `dismiss(weekStart)`, `maybeGenerateDue` wrap the plan-rebalance commands
- Forgetting curve: `useForgettingCurve` — in-app poll that fires OS nudges (quiet-hours + daily-cap gated); `useForgettingNudgePreview` is a read-only fetch that must NOT call `mark_review_notified`
- Listen Mode: `useListenMode` — `generate(pillar, topic)` calls `generate_audio_lesson`, subscribes to `audio-lesson-progress`, decodes the base64 MP3 to a Blob object URL for `<audio>` (revokes the URL on replace/unmount); exposes `{ generate, isGenerating, lesson, audioUrl, progress, error, reset }`
- Background polls/timers must guard against React StrictMode double-mount (e.g. a `startedRef`) and clear their interval on cleanup
- Never call `tauriInvoke` directly inside React components

### Background classification (fire-and-forget)
- Pattern: `useDepthScore.ts` exports a module-level async `runDepthScore(id, {force?})` (a plain function, not a React hook) alongside the read hook `useConversationDepth`. Use this when work is triggered by an event (navigate-away, unmount) rather than render.
- Make it idempotent and safe: a module-scoped `inFlight` `Set` dedupes concurrent calls, skip while `isStreaming`, short-circuit if already computed, and **swallow errors** (a missing API key must never crash the caller — `console.error`, don't throw).
- One-shot LLM calls (no streaming UI) go through the `collect_completion` Tauri command, not `stream_chat`.
- GenUI/classifier text helpers live in `src/lib/genui.ts` (`stripGenUITags`, `parseDepthScore`, `DEPTH_SCORE_PROMPT`) — keep `parseDepthScore`'s clamp/fallback behavior in sync with Rust `depth.rs::parse_depth_payload`.

## Types
- All shared TypeScript interfaces in `src/data/types.ts` — single source of truth
- Mirror Rust serde structs exactly (camelCase after `#[serde(rename_all = "camelCase")]`)
- Use `PillarId` type everywhere — never raw strings for pillar identifiers
- `GenUIBlock.type` is a discriminated union — use it in switch statements

```typescript
// GenUI rendering pattern
switch (block.type) {
  case 'flashcard': return <Flashcard data={block.data as FlashcardData} />;
  case 'quiz': return <Quiz data={block.data as QuizData} />;
  // ...
}
```

## Styling (Tailwind v3)
- Tailwind utility classes exclusively — no inline styles, no CSS modules
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
