---
name: personal-tutor-genui
description: "GenUI block system for Personal Tutor — all 7 block types, parseGenUIBlocks() parser, adding new block types, renderer components, flashcard/quiz spaced repetition integration. Use for: adding new GenUI types, fixing parsing bugs, building new renderer components, understanding how AI embeds interactive content. Trigger on: genui, parseGenUIBlocks, finalizeStream, GenUIBlock, GenUIRenderer, flashcard, quiz, diagram, concept-map, timeline, key-insight, code block rendering."
---

# Personal Tutor — GenUI Block System

You have deep knowledge of the GenUI system — how AI responses embed interactive blocks, how they're parsed, and how they're rendered. Use this to build new block types correctly and debug parsing issues.

---

## What GenUI Is

GenUI is the system that lets the AI tutor embed rich interactive components directly in its chat responses. The AI writes special XML-like tags; the frontend strips them from visible text and renders them as React components below the message.

**AI writes this:**
```
Here's a key concept about transformers:

<genui type="key-insight">Attention is O(n²) in sequence length — this is the core scaling challenge for long context.</genui>

Let me test your understanding:

<genui type="quiz">{"question":"What is the time complexity of self-attention?","options":["O(n)","O(n log n)","O(n²)","O(n³)"],"correct":2,"explanation":"Self-attention computes pairwise relationships between all token positions, giving O(n²) complexity."}</genui>
```

**User sees:**
- Clean text (tags stripped)
- A highlighted callout box
- An interactive multiple-choice quiz

---

## The 7 GenUI Block Types

| Type | Data Format | Rendered As |
|------|-------------|-------------|
| `flashcard` | JSON: `{ question, answer }` | Flip card — click to reveal answer |
| `quiz` | JSON: `{ question, options[], correct, explanation? }` | Multiple choice with feedback |
| `code` | JSON: `{ language, code, filename? }` | Shiki-highlighted code block |
| `concept-map` | JSON: `{ nodes[{id,label,color?}], edges[{from,to,label?}] }` | Graph visualization |
| `timeline` | JSON: `{ events[{label,description,done}] }` | Progress timeline |
| `diagram` | Raw string (Mermaid source) | `mermaid.render()` — SVG |
| `key-insight` | Raw string (plain text) | Highlighted callout box |

---

## AI Syntax Reference

```
<genui type="flashcard">{"question":"What does RLHF stand for?","answer":"Reinforcement Learning from Human Feedback — fine-tuning LLMs using human preference ratings."}</genui>

<genui type="quiz">{"question":"Which optimizer is most commonly used for transformer training?","options":["SGD","Adam","AdaGrad","RMSProp"],"correct":1,"explanation":"Adam (Adaptive Moment Estimation) combines momentum and adaptive learning rates, making it effective for sparse gradients in attention layers."}</genui>

<genui type="code">{"language":"python","code":"import torch\nfrom torch import nn\n\nclass SelfAttention(nn.Module):\n    def __init__(self, d_model):\n        super().__init__()\n        self.qkv = nn.Linear(d_model, 3 * d_model)\n    \n    def forward(self, x):\n        q, k, v = self.qkv(x).chunk(3, dim=-1)\n        return torch.softmax(q @ k.T / k.size(-1)**0.5, dim=-1) @ v","filename":"self_attention.py"}</genui>

<genui type="concept-map">{"nodes":[{"id":"llm","label":"LLM"},{"id":"transformer","label":"Transformer"},{"id":"attention","label":"Self-Attention"}],"edges":[{"from":"llm","to":"transformer","label":"based on"},{"from":"transformer","to":"attention","label":"uses"}]}</genui>

<genui type="timeline">{"events":[{"label":"2017","description":"Attention Is All You Need — Transformer paper","done":true},{"label":"2018","description":"BERT — bidirectional pre-training","done":true},{"label":"2020","description":"GPT-3 — 175B parameters","done":true},{"label":"2023","description":"GPT-4 — multimodal","done":false}]}</genui>

<genui type="diagram">graph TD
    A[Input Tokens] --> B[Embedding Layer]
    B --> C[Multi-Head Attention]
    C --> D[Feed Forward]
    D --> E[Layer Norm]
    E --> C
    E --> F[Output]</genui>

<genui type="key-insight">The residual connections in transformers allow gradients to flow directly through the network, enabling training of very deep architectures without vanishing gradients.</genui>
```

---

## Parser: `parseGenUIBlocks()` (`src/store/appStore.ts`)

```typescript
interface ParseResult {
  text: string;           // content with all <genui> tags removed
  blocks: GenUIBlock[];   // extracted blocks in order
}

function parseGenUIBlocks(content: string): ParseResult {
  const blocks: GenUIBlock[] = [];
  const regex = /<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g;
  
  const text = content.replace(regex, (_match, type, data) => {
    // Raw-string types: no JSON parse
    if (type === 'diagram' || type === 'key-insight') {
      blocks.push({ type, data: data.trim() });
    } else {
      // JSON types: parse, fall back to raw string on error
      try {
        blocks.push({ type, data: JSON.parse(data.trim()) });
      } catch {
        blocks.push({ type, data: data.trim() });
      }
    }
    return ''; // strip the tag from text
  });
  
  return { text: text.trim(), blocks };
}
```

**Critical regex:** `/<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g`
- `\s+` allows spaces before `type=` (don't require exactly one space)
- `[\s\S]*?` is non-greedy and matches newlines — required for multiline code blocks
- Tags MUST be exactly `<genui type="...">...</genui>` — case-sensitive

### Called in `finalizeStream()`

```typescript
finalizeStream: () => set((state) => {
  const { text, blocks } = parseGenUIBlocks(state.streamingContent);
  const message: AiMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: text,           // clean text without tags
    genui: blocks.length > 0 ? blocks : undefined,
    timestamp: new Date(),
  };
  return {
    messages: [...state.messages, message],
    isStreaming: false,
    streamingContent: '',
    currentToken: '',
  };
}),
```

---

## TypeScript Types (`src/data/types.ts`)

```typescript
interface GenUIBlock {
  type: 'diagram' | 'flashcard' | 'quiz' | 'code' | 'concept-map' | 'timeline' | 'key-insight';
  data: unknown;  // typed via discriminated union in renderers
}

// Per-type data shapes (define in types.ts):
interface FlashcardData {
  question: string;
  answer: string;
}

interface QuizData {
  question: string;
  options: string[];
  correct: number;  // 0-indexed
  explanation?: string;
}

interface CodeData {
  language: string;
  code: string;
  filename?: string;
}

interface ConceptMapData {
  nodes: Array<{ id: string; label: string; color?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
}

interface TimelineData {
  events: Array<{ label: string; description: string; done: boolean }>;
}
```

---

## `GenUIRenderer` Component

```typescript
// src/components/GenUIRenderer.tsx
import { Flashcard } from './genui/Flashcard';
import { Quiz } from './genui/Quiz';
import { CodeBlock } from './genui/CodeBlock';
import { ConceptMap } from './genui/ConceptMap';
import { Timeline } from './genui/Timeline';
import { Diagram } from './genui/Diagram';
import { KeyInsight } from './genui/KeyInsight';

interface Props {
  blocks: GenUIBlock[];
  pillar: PillarId | null;
}

export function GenUIRenderer({ blocks, pillar }: Props) {
  return (
    <div className="mt-4 space-y-4">
      {blocks.map((block, index) => (
        <GenUIBlock key={index} block={block} pillar={pillar} />
      ))}
    </div>
  );
}

function GenUIBlock({ block, pillar }: { block: GenUIBlock; pillar: PillarId | null }) {
  switch (block.type) {
    case 'flashcard':
      return <Flashcard data={block.data as FlashcardData} pillar={pillar} />;
    case 'quiz':
      return <Quiz data={block.data as QuizData} pillar={pillar} />;
    case 'code':
      return <CodeBlock data={block.data as CodeData} />;
    case 'concept-map':
      return <ConceptMap data={block.data as ConceptMapData} />;
    case 'timeline':
      return <Timeline data={block.data as TimelineData} />;
    case 'diagram':
      return <Diagram source={block.data as string} />;
    case 'key-insight':
      return <KeyInsight text={block.data as string} pillar={pillar} />;
    default:
      return null; // silently ignore unknown types
  }
}
```

---

## Flashcard & Quiz: Spaced Repetition Integration

`Flashcard` and `Quiz` components call `recordAttempt` from `useReview` on user interaction:

```typescript
// src/components/genui/Flashcard.tsx
import { useReview } from '@/hooks/useReview';
import { buildReviewItemId } from '@/lib/reviewUtils';

interface Props {
  data: FlashcardData;
  pillar: PillarId | null;
}

export function Flashcard({ data, pillar }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const { recordAttempt } = useReview();
  
  const handleFlip = () => {
    setFlipped(true);
    if (!recorded && pillar) {
      setRecorded(true);
      // Quality 4 = "correct with hesitation" for just viewing the answer
      const itemId = buildReviewItemId('flashcard', pillar, data.question);
      recordAttempt({ itemId, itemType: 'flashcard', pillar, quality: 4 });
    }
  };
  
  return (
    <div className="...">
      <div onClick={handleFlip}>
        {flipped ? data.answer : data.question}
      </div>
    </div>
  );
}
```

```typescript
// src/components/genui/Quiz.tsx
export function Quiz({ data, pillar }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const { recordAttempt } = useReview();
  
  const handleSelect = (index: number) => {
    if (selected !== null) return; // already answered
    setSelected(index);
    if (pillar) {
      const correct = index === data.correct;
      // Quality: 5=perfect, 3=correct with difficulty, 1=incorrect
      const quality = correct ? 5 : 1;
      const itemId = buildReviewItemId('quiz', pillar, data.question);
      recordAttempt({ itemId, itemType: 'quiz', pillar, quality });
    }
  };
  
  return (
    <div className="...">
      <p>{data.question}</p>
      {data.options.map((option, i) => (
        <button key={i} onClick={() => handleSelect(i)}
          className={selected !== null 
            ? i === data.correct ? 'bg-green-600' : i === selected ? 'bg-red-600' : ''
            : 'hover:bg-gray-700'
          }
        >
          {option}
        </button>
      ))}
      {selected !== null && data.explanation && (
        <p className="text-sm text-gray-400 mt-2">{data.explanation}</p>
      )}
    </div>
  );
}
```

### `buildReviewItemId` (deterministic hash)

```typescript
// src/lib/reviewUtils.ts
export function buildReviewItemId(
  type: string,
  pillar: PillarId,
  question: string
): string {
  // djb2 hash — deterministic so same flashcard maps to same review row
  const str = `${type}:${pillar}:${question}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // convert to 32-bit
  }
  return `${type}-${pillar}-${Math.abs(hash).toString(16)}`;
}
```

---

## Diagram Block (Mermaid)

```typescript
// src/components/genui/Diagram.tsx
import mermaid from 'mermaid';

// Initialize once at app level (App.tsx):
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  fontFamily: 'Inter, sans-serif',
});

export function Diagram({ source }: { source: string }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);
  
  useEffect(() => {
    if (!source) return;
    const id = `diagram-${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, source)
      .then(({ svg }) => setSvg(svg))
      .catch(() => {
        setError(true);
        setSvg('');
      });
  }, [source]);
  
  if (error) return <p className="text-red-400 text-sm">Diagram render failed</p>;
  // Mermaid output is safe — no user-controlled content
  return <div dangerouslySetInnerHTML={{ __html: svg }} className="mermaid-container overflow-auto" />;
}
```

---

## Code Block (Shiki)

```typescript
// src/components/genui/CodeBlock.tsx
import { codeToHtml } from 'shiki';

export function CodeBlock({ data }: { data: CodeData }) {
  const [html, setHtml] = useState('');
  
  useEffect(() => {
    codeToHtml(data.code, { lang: data.language, theme: 'github-dark' })
      .then(setHtml)
      .catch(() => setHtml(`<pre><code>${data.code}</code></pre>`));
  }, [data.code, data.language]);
  
  return (
    <div className="rounded-lg overflow-hidden border border-gray-700">
      {data.filename && (
        <div className="px-4 py-1 text-xs text-gray-400 bg-gray-800 border-b border-gray-700">
          {data.filename}
        </div>
      )}
      {/* Shiki output is safe — it escapes user content */}
      <div dangerouslySetInnerHTML={{ __html: html }} className="not-prose text-sm" />
    </div>
  );
}
```

---

## Adding a New GenUI Block Type

**1. Add to `GenUIBlock.type` union in `src/data/types.ts`:**
```typescript
type: 'diagram' | 'flashcard' | 'quiz' | 'code' | 'concept-map' | 'timeline' | 'key-insight' | 'your-new-type';
```

**2. Define data interface in `src/data/types.ts`:**
```typescript
interface YourNewTypeData {
  // define fields
}
```

**3. Add to parser in `src/store/appStore.ts`:**
- If data is raw text (like `key-insight`): add `type === 'your-new-type'` to the raw-string condition
- If data is JSON (like `quiz`): it automatically gets JSON.parse — no change needed to regex

**4. Create renderer component `src/components/genui/YourNewType.tsx`**

**5. Add case to `GenUIRenderer` switch:**
```typescript
case 'your-new-type':
  return <YourNewType data={block.data as YourNewTypeData} pillar={pillar} />;
```

**6. Update system prompt in `src/hooks/useAI.ts`** to show the AI the new syntax:
```typescript
<genui type="your-new-type">{"field":"value"}</genui>
```

---

## Debugging GenUI Issues

**Symptom: Tags show as raw text in chat**
→ `parseGenUIBlocks` regex didn't match. Most common causes:
- Extra whitespace or attributes in the tag: `<genui  type="quiz">` (double space) → regex needs `\s+` ✓ already handles this
- Wrong closing tag: `</genui >` with trailing space → not handled, AI must write exact `</genui>`
- Tags split across streaming chunks → `streamingContent` accumulates the full stream before `finalizeStream()` is called — this is safe

**Symptom: Block renders with `[object Object]` or crash**
→ `block.data` is a raw string instead of parsed JSON. Check:
- Was there a JSON parse error? (malformed AI output)
- Is the type listed in the raw-string condition by mistake?

**Symptom: Diagram shows "render failed"**
→ Mermaid syntax error in AI output. The AI must generate valid Mermaid. Add error boundary if needed.

**Symptom: Quiz/flashcard not updating spaced repetition**
→ `pillar` prop is null. Check that `GenUIRenderer` receives the active pillar, and that the message was sent from a pillar context.
