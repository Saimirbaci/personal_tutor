import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke, tauriListen } from '@/lib/tauri';
import { AiMessage, GapSignalKind, KnowledgeGap, PillarId } from '@/data/types';
import { PILLARS } from '@/data/plan';
import { getWeekNumber, truncate } from '@/lib/utils';
import { useConversations } from './useConversations';

/** Max weak areas injected into the prompt to avoid bloat. */
const MAX_WEAK_AREAS = 3;
/** Only surface gaps at/above this severity so the tutor isn't naggy. */
const WEAK_AREA_MIN_SEVERITY = 0.35;

const SIGNAL_DESC: Record<GapSignalKind, string> = {
  weak_quiz: 'repeatedly answered incorrectly',
  low_ease: 'hard to retain across reviews',
  shallow_chat: 'engaged only superficially',
  stale: 'no recent practice',
};

const SYSTEM_PROMPT = `You are a personal learning tutor for a 3-month intensive growth sprint. Your student is Saimir Baci, CTO & co-founder of Augmentifai, focused on 12 learning pillars:

**Technical Mastery**
1. 🧠 LLM Architectures & RLHF — transformers, fine-tuning, alignment, scaling laws
2. ⚡ Inference Hardware — GPU architecture, custom silicon, optimization techniques
3. 🚀 MLOps & Production AI — deployment, monitoring, CI/CD for ML systems

**Leadership & Strategy**
4. 🗺️ Technical Roadmap — product strategy, prioritization, OKRs, architecture decisions
5. 💰 Fundraising & Investors — pitch decks, term sheets, investor relations, due diligence
6. 📊 Financial Literacy — P&L, burn rate, unit economics, cap table, SaaS metrics

**Go-to-Market**
7. 🤝 Technical Sales (Robotics) — enterprise sales for autonomous systems
8. 👥 Engineering Hiring & Culture — recruiting, onboarding, team building, eng culture

**Communication & Presence**
9. 🗣️ Communication Skills — executive-level structured communication
10. 🎙️ Voice & Command — vocal technique and authority projection

**Legal & Protection**
11. 🔐 Enterprise Security & Compliance — SOC2, GDPR, security architecture
12. ⚖️ IP Strategy & Technical Moat — patents, trade secrets, defensive IP

Your teaching style:
- Be a world-class expert tutor: precise, deep, and practical
- Explain concepts from first principles when asked
- Make complex ideas concrete with examples from robotics/AI
- Be concise but never superficial — depth over breadth
- Challenge the student's thinking with Socratic questions
- Celebrate progress, maintain high standards

CRITICAL: Use GenUI blocks to make your responses interactive and visually rich. Format them EXACTLY as shown:

For Mermaid diagrams:
<genui type="diagram">
graph TD
    A[Input] --> B[Attention]
    B --> C[Output]
</genui>

For flashcards:
<genui type="flashcard">
{"question": "What is the key equation in scaled dot-product attention?", "answer": "Attention(Q,K,V) = softmax(QK^T / √d_k)V\n\nWhere Q=queries, K=keys, V=values, d_k=key dimension for scaling"}
</genui>

For quizzes:
<genui type="quiz">
{"question": "Which parallelism strategy splits the model layers across GPUs?", "options": ["Data parallelism", "Tensor parallelism", "Pipeline parallelism", "Expert parallelism"], "correct": 2, "explanation": "Pipeline parallelism assigns different layers to different GPUs, creating a pipeline of computation across the model depth."}
</genui>

For code blocks:
<genui type="code">
{"language": "python", "code": "import torch\nimport torch.nn.functional as F\n\ndef attention(Q, K, V, d_k):\n    scores = torch.matmul(Q, K.transpose(-2, -1)) / (d_k ** 0.5)\n    weights = F.softmax(scores, dim=-1)\n    return torch.matmul(weights, V)", "filename": "attention.py"}
</genui>

For key insights:
<genui type="key-insight">
The roofline model reveals whether your workload is compute-bound or memory-bandwidth-bound — this determines whether better GPUs or better memory help more.
</genui>

Use GenUI blocks liberally — every technical concept deserves a visual representation. Mix text explanation with GenUI blocks naturally. Always end with a question or next step to keep the learning momentum going.`;

/** Builds a concise "KNOWN WEAK AREAS" section for the active pillar's top gaps. */
function buildWeakAreasSection(pillar: PillarId, gaps: KnowledgeGap[]): string {
  const pillarGaps = gaps
    .filter((g) => g.pillar === pillar && g.status === 'open' && g.severity >= WEAK_AREA_MIN_SEVERITY)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, MAX_WEAK_AREAS);

  if (pillarGaps.length === 0) return '';

  const lines = pillarGaps
    .map((g) => {
      const dominant = [...g.signals].sort((a, b) => b.weight - a.weight)[0];
      const desc = dominant ? SIGNAL_DESC[dominant.kind] : 'weak area';
      // gap.label is derived/truncated topic text — cap defensively against bloat.
      return `- ${truncate(g.label, 100)} (${desc})`;
    })
    .join('\n');

  return (
    `\n\nKNOWN WEAK AREAS (detected from this student's quiz/review history):\n${lines}\n\n` +
    `Naturally reinforce these weak areas when relevant. When one comes up — or when the ` +
    `student seems ready — PROACTIVELY propose a short targeted drill instead of waiting to ` +
    `be asked, emitting a quiz or flashcard GenUI block focused on the weak topic.`
  );
}

function buildContextualSystemPrompt(pillar: PillarId | null, gaps: KnowledgeGap[] = []): string {
  const week = getWeekNumber();
  let contextAddon = '';

  if (pillar) {
    const pillarInfo = PILLARS.find((p) => p.id === pillar);
    if (pillarInfo) {
      contextAddon = `\n\nCURRENT FOCUS: ${pillarInfo.emoji} ${pillarInfo.name}\nCurrent week: Week ${week} of 12\nDescription: ${pillarInfo.description}\n\nTailor your teaching and GenUI blocks to this pillar's specific concepts.`;
      contextAddon += buildWeakAreasSection(pillar, gaps);
    }
  } else {
    contextAddon = `\n\nCurrent week: Week ${week} of 12`;
  }

  return SYSTEM_PROMPT + contextAddon;
}

export function useAI() {
  const {
    messages,
    isStreaming,
    providerConfig,
    activePillar,
    addMessage,
    appendToken,
    finalizeStream,
    startStream,
    clearMessages,
    activeConversationId,
    knowledgeGaps,
  } = useAppStore();

  const { persistMessage } = useConversations();

  const unlistenTokenRef = useRef<(() => void) | null>(null);
  const unlistenDoneRef = useRef<(() => void) | null>(null);
  const unlistenErrorRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unlistenTokenRef.current?.();
      unlistenDoneRef.current?.();
      unlistenErrorRef.current?.();
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string, contextPillar?: PillarId) => {
      if (isStreaming) return;

      const userMessage: AiMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      };

      addMessage(userMessage);

      // Persist user message
      if (activeConversationId) {
        persistMessage(activeConversationId, userMessage);
      }

      startStream();

      // Set up event listeners
      unlistenTokenRef.current?.();
      unlistenDoneRef.current?.();
      unlistenErrorRef.current?.();

      const unlistenToken = await tauriListen('ai-token', (token) => {
        appendToken(token as string);
      });

      const unlistenDone = await tauriListen('ai-done', () => {
        finalizeStream();

        // Persist the assistant message that finalizeStream just created
        if (activeConversationId) {
          // finalizeStream() is synchronous — the new message is already in the store
          const latestMessages = useAppStore.getState().messages;
          const assistantMsg = latestMessages[latestMessages.length - 1];
          if (assistantMsg?.role === 'assistant') {
            persistMessage(activeConversationId, assistantMsg);
          }
        }

        unlistenToken();
        unlistenDone();
        unlistenErrorRef.current?.();
      });

      const unlistenError = await tauriListen('ai-error', (err) => {
        console.error('AI Error:', err);
        finalizeStream();
        unlistenToken();
        unlistenDone();
        unlistenError();
      });

      unlistenTokenRef.current = unlistenToken;
      unlistenDoneRef.current = unlistenDone;
      unlistenErrorRef.current = unlistenError;

      const systemPrompt = buildContextualSystemPrompt(
        contextPillar ?? activePillar,
        knowledgeGaps ?? []
      );

      const backendMessages = messages
        .concat(userMessage)
        .filter((m) => !m.genui || m.genui.length === 0 || m.role === 'user')
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        await tauriInvoke('stream_chat', {
          messages: backendMessages,
          system: systemPrompt,
          config: {
            provider: providerConfig.provider,
            api_key: providerConfig.apiKey,
            model: providerConfig.model,
            base_url: providerConfig.baseUrl,
          },
        });
      } catch (err) {
        console.error('stream_chat error:', err);
        finalizeStream();
      }
    },
    [messages, isStreaming, providerConfig, activePillar, activeConversationId,
     knowledgeGaps, addMessage, appendToken, finalizeStream, startStream, persistMessage]
  );

  return {
    messages,
    isStreaming,
    sendMessage,
    clearMessages,
  };
}
