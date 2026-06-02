---
name: personal-tutor-frontend
description: "Deep knowledge of the Personal Tutor React/TypeScript frontend. Use for: Zustand store changes, new React components, hooks, Tauri IPC wiring, styling, or any src/ work. Trigger when the user mentions appStore, useAI, tauriInvoke, components/, views/, hooks/, types.ts, Tailwind, Framer Motion, or any frontend file."
---

# Personal Tutor — Frontend Deep Dive

You have deep knowledge of the React 18 + TypeScript + Zustand + Tauri frontend in `src/`. Use this to build UI features correctly.

---

## Single Zustand Store (`src/store/appStore.ts`)

The entire app state lives in one store. Never create additional stores.

### State Shape
```typescript
interface AppState {
  // Navigation
  currentView: 'dashboard' | 'tutor' | 'pillar' | 'progress' | 'settings';
  activePillar: PillarId | null;

  // AI Streaming
  messages: AiMessage[];
  isStreaming: boolean;
  currentToken: string;
  streamingContent: string;       // accumulates during stream
  providerConfig: ProviderConfig;

  // Conversations
  activeConversationId: string | null;
  conversationList: ConversationSummary[];

  // Progress
  progress: ProgressData | null;
  streak: number;

  // Voice
  voiceConfig: VoiceConfig;

  // UI
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  logSessionModalOpen: boolean;
}
```

### Persisted Keys (survive app restart)
`providerConfig` | `voiceConfig` | `sidebarCollapsed` | `activePillar`

All other state is ephemeral — reset on app start.

### Correct Selector Pattern
```typescript
// ✅ Fine-grained — only re-renders when messages changes
const messages = useAppStore((s) => s.messages);

// ✅ Multiple fields — use shallow equality or separate selectors
const { isStreaming, currentToken } = useAppStore((s) => ({
  isStreaming: s.isStreaming,
  currentToken: s.currentToken,
}));

// ❌ Selects everything — triggers re-render on any store change
const store = useAppStore();
```

### Key Actions
```typescript
setView(view, pillar?)         // navigate + optionally set active pillar
addMessage(msg)                // add a finished message
startStream()                  // sets isStreaming=true, clears streaming state
appendToken(token)             // accumulates streamingContent
finalizeStream()               // parses GenUI, creates AiMessage, clears streaming state
clearMessages()                // reset conversation display
setActiveConversation(id)      // track which conversation is open
upsertConversation(summary)    // update or prepend to sidebar list
```

---

## Tauri IPC Layer (`src/lib/tauri.ts`)

Always use wrappers — never import `invoke` directly in components or hooks.

```typescript
import { tauriInvoke, tauriListen } from '@/lib/tauri';

// Command call (async, typed return)
const result = await tauriInvoke<SessionLog>('log_session', {
  pillar: 'llm' as PillarId,
  hours: 1.5,
  energy: 4,
  note: 'Studied RAG',
});

// Event listener with mandatory cleanup
useEffect(() => {
  const cleanup = tauriListen<string>('ai-token', (event) => {
    useAppStore.getState().appendToken(event.payload);
  });
  // cleanup is Promise<UnlistenFn> — must call on unmount
  return () => { cleanup.then(fn => fn()); };
}, []); // empty deps — subscribe once
```

The wrappers include browser mock fallbacks so components work in `npm run dev` (without Tauri running).

---

## Custom Hooks Pattern

All Tauri commands live in hooks. Components never call `tauriInvoke` directly.

```typescript
// src/hooks/useProgress.ts
export function useProgress() {
  const setProgress = useAppStore((s) => s.setProgress);
  const setStreak = useAppStore((s) => s.setStreak);

  const logSession = async (data: Omit<SessionLog, 'id' | 'created_at'>) => {
    await tauriInvoke('log_session', data);
    // refresh progress after logging
    const progress = await tauriInvoke<ProgressData>('get_progress');
    setProgress(progress);
  };

  const refreshStreak = async () => {
    const streak = await tauriInvoke<number>('get_streak');
    setStreak(streak);
  };

  return { logSession, refreshStreak };
}
```

Existing hooks: `useAI`, `useVoice`, `useProgress` — extend these before creating new ones.

---

## Types (`src/data/types.ts`)

The single source of truth. All interfaces must match Rust serde structs (camelCase).

Key types:
```typescript
type PillarId = 'llm' | 'hardware' | 'sales' | 'communication' | 'voice' |
                'fundraising' | 'roadmap' | 'security' | 'hiring' | 'mlops' | 'ip' | 'finance';

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;        // <genui> tags stripped
  genui?: GenUIBlock[];   // parsed blocks
  timestamp: Date;
}

interface GenUIBlock {
  type: 'diagram' | 'flashcard' | 'quiz' | 'code' | 'concept-map' | 'timeline' | 'key-insight';
  data: unknown;
}

interface ProviderConfig {
  provider: 'anthropic' | 'ollama' | 'openrouter' | 'google';
  apiKey?: string;
  model: string;
  baseUrl?: string;
}
```

---

## Pillar Colors (`src/data/pillars.ts`)

```typescript
// Each pillar has:
interface Pillar {
  id: PillarId;
  name: string;
  emoji: string;
  color: string;       // e.g., '#6366f1' — use for borders, highlights
  colorMuted: string;  // e.g., '#312e81' — use for backgrounds
  description: string;
}
```

Use these for pillar-branded UI rather than hardcoding colors.

---

## Mermaid Diagrams (Mermaid v11)

```typescript
import mermaid from 'mermaid';

// Initialize once at app level (App.tsx or index.tsx):
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  fontFamily: 'Inter, sans-serif',
});

// Render in a component:
const [svg, setSvg] = useState('');
useEffect(() => {
  if (!source) return;
  const uniqueId = `diagram-${Math.random().toString(36).slice(2)}`;
  mermaid.render(uniqueId, source)
    .then(({ svg }) => setSvg(svg))
    .catch(() => setSvg('<p>Diagram render failed</p>'));
}, [source]);

// Display (Mermaid output is safe):
<div dangerouslySetInnerHTML={{ __html: svg }} className="mermaid-container" />
```

---

## Shiki Code Highlighting (Shiki v1)

```typescript
import { codeToHtml } from 'shiki';

// In an async component or effect:
const [highlighted, setHighlighted] = useState('');
useEffect(() => {
  codeToHtml(code, { lang: language, theme: 'github-dark' })
    .then(setHighlighted);
}, [code, language]);

// Display (Shiki output is safe — it escapes content):
<div dangerouslySetInnerHTML={{ __html: highlighted }} className="not-prose" />
```

---

## Framer Motion Patterns

```typescript
import { motion, AnimatePresence } from 'framer-motion';

// Message entry:
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
>

// List items (when order changes):
<AnimatePresence>
  {messages.map((msg) => (
    <motion.div key={msg.id} layout exit={{ opacity: 0 }}>
      {/* ... */}
    </motion.div>
  ))}
</AnimatePresence>
```

---

## Styling Rules

- Tailwind v3 utility classes only — no inline styles, no CSS modules
- Dark mode: use `dark:` prefix classes (configured in tailwind.config.js)
- Component-specific Tailwind: keep class lists readable, extract long combinations into `cn()` helper if available
- Never use `style={{ ... }}` prop except for dynamic values Tailwind can't express (e.g., exact pillar hex colors)
