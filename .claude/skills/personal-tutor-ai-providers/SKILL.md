---
name: personal-tutor-ai-providers
description: "AI provider system, streaming implementation, and multi-provider routing for the Personal Tutor app. Use when: adding a new LLM provider, debugging streaming issues, changing the system prompt, modifying the useAI hook, or understanding how stream_chat works end to end. Trigger on: 'ai-token', 'ai-done', AiProvider trait, stream_chat, useAI, provider config, Anthropic, OpenRouter, Ollama, Google."
---

# Personal Tutor — AI Provider System

You have deep knowledge of how the Personal Tutor routes AI requests, streams responses, and delivers them to the UI.

---

## Full Streaming Pipeline

```
User sends message
       │
       ▼
useAI hook (src/hooks/useAI.ts)
  buildContextualSystemPrompt(activePillar)
       │
       ▼
tauriInvoke('stream_chat', { messages, providerConfig })
       │
       ▼ (Rust)
commands/ai.rs::stream_chat()
  Selects provider from providerConfig.provider
       │
       ▼
AiProvider::stream_completion(messages, &window)
  Streams HTTP response from LLM API
  For each text chunk:
    window.emit("ai-token", chunk_string)
  At end:
    window.emit("ai-done", ())
  On error:
    window.emit("ai-error", error_message)
       │
       ▼ (back to frontend via Tauri events)
useEffect listener in useAI:
  'ai-token' → store.appendToken(token)
  'ai-done'  → store.finalizeStream()
  'ai-error' → show error, clear streaming state
       │
       ▼
store.finalizeStream()
  parseGenUIBlocks(streamingContent)
  Creates AiMessage { content: clean_text, genui: blocks }
  Appends to messages[]
```

---

## AiProvider Trait (`src-tauri/src/ai/provider.rs`)

```rust
use async_trait::async_trait;
use tauri::WebviewWindow;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct Message {
    pub role: String,    // "user" | "assistant" | "system"
    pub content: String,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn stream_completion(
        &self,
        messages: Vec<Message>,
        window: &WebviewWindow,
    ) -> Result<(), String>;
}
```

---

## Adding a New Provider

1. Create `src-tauri/src/ai/<name>.rs`:
```rust
use super::provider::{AiProvider, Message};
use async_trait::async_trait;
use tauri::WebviewWindow;

pub struct NewProvider {
    api_key: String,
    model: String,
    base_url: Option<String>,
}

impl NewProvider {
    pub fn new(config: &ProviderConfig) -> Self {
        Self {
            api_key: config.api_key.clone().unwrap_or_default(),
            model: config.model.clone(),
            base_url: config.base_url.clone(),
        }
    }
}

#[async_trait]
impl AiProvider for NewProvider {
    async fn stream_completion(
        &self,
        messages: Vec<Message>,
        window: &WebviewWindow,
    ) -> Result<(), String> {
        // Build request, stream response
        // For each text token:
        window.emit("ai-token", token).map_err(|e| e.to_string())?;
        // At end:
        window.emit("ai-done", ()).map_err(|e| e.to_string())?;
        Ok(())
    }
}
```

2. Add to `commands/ai.rs::stream_chat()` match:
```rust
"newprovider" => Box::new(NewProvider::new(&provider_config)),
```

3. Declare in `ai/mod.rs`:
```rust
pub mod newprovider;
```

---

## Provider Configurations

### Anthropic (SSE streaming)
- API: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: {api_key}`, `anthropic-version: 2023-06-01`, `Accept: text/event-stream`
- Stream format: SSE with `data:` prefix, parse `delta.text` from JSON
- Models: `claude-sonnet-4-5` (default), `claude-opus-4-5`, `claude-haiku-4-5`

### Google AI Studio (SSE)
- API: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- Auth: `?key={api_key}` query param
- Models: `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`

### Ollama (NDJSON streaming)
- API: `http://localhost:11434/api/chat` (or configurable baseUrl)
- Stream format: NDJSON, parse `message.content` per line
- No API key needed
- Models: `llama3.2`, `qwen2.5-coder`, `gemma2`, etc. (fetched via `get_ollama_models`)

### OpenRouter (OpenAI-compatible SSE)
- API: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Authorization: Bearer {api_key}`
- Stream format: SSE, same as OpenAI
- Models: fetched via `get_openrouter_models`

---

## System Prompt Builder (`src/hooks/useAI.ts`)

```typescript
function buildContextualSystemPrompt(
  pillar: PillarId | null,
  gaps: KnowledgeGap[],
  socratic: boolean = false
): string {
  const weekNumber = getWeekNumber(); // based on June 1 start date
  
  const base = `You are a personal learning tutor for Saimir Baci,
CTO & co-founder of Augmentifai. You are helping him complete an intensive
3-month learning sprint (June 1 – Aug 31, 2026) across 12 growth pillars.

Your style: Socratic, technical, precise. Ask clarifying questions.
Use concrete examples. Generate GenUI blocks (<genui type="...">) when
they would aid understanding — flashcards for memorization, quizzes for
testing, diagrams for systems, timelines for sequences.

GenUI syntax:
<genui type="flashcard">{"question":"...","answer":"..."}</genui>
<genui type="quiz">{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}</genui>
<genui type="diagram">graph TD; A-->B</genui>
<genui type="key-insight">Concise insight text</genui>`;

  let prompt = base;
  if (pillar) {
    prompt += `\n\nCurrent pillar: ${pillar}. Sprint week: ${weekNumber}.`;
  }
  if (socratic) {
    prompt += `\n\n${SOCRATIC_MODIFIER}`;  // Retrieval-forcing, question-back style
  }
  return prompt;
}
```

**Socratic Mode:** When `socratic` is true (per-pillar toggle in `socraticModeByPillar`, keyed via `socraticKey(pillar)`), appends `SOCRATIC_MODIFIER` which flips the tutor from explain-first to retrieval-forcing, question-back style.

The system prompt is always prepended to the messages array sent to `stream_chat`.

---

## Debugging Streaming Issues

**Symptom: Spinner never stops**
→ `ai-done` event never fired. Check provider implementation — ensure `window.emit("ai-done", ())` is called even when the stream ends normally.

**Symptom: `ai-error` fires immediately**
→ API key missing or wrong. Check `providerConfig.apiKey` is saved in settings and passed to the command.

**Symptom: Messages appear out of order**
→ Tokens are accumulated in `streamingContent` string — they can't arrive out of order. More likely a React rendering issue with key props.

**Symptom: GenUI blocks show as raw text**
→ `parseGenUIBlocks` didn't match the tags. Check the regex in `appStore.ts`: `/<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g`. Tags must be exactly `<genui type="...">...</genui>`.

**Symptom: Ollama not connecting**
→ Verify Ollama is running: `curl http://localhost:11434/api/tags`. Check `baseUrl` in providerConfig — defaults to `http://localhost:11434`.
