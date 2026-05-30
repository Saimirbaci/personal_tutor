import { useCallback, useEffect, useState } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import {
  ConversationSummary,
  FlaggedReviewItem,
  GenUIBlock,
  PillarId,
  SessionSummaryData,
} from '@/data/types';
import { SESSION_SUMMARY_PROMPT, stripGenUITags } from '@/lib/genui';
import { parseGenUIBlocks } from '@/lib/utils';
import { buildReviewItemId } from '@/hooks/useReview';

/** Backend row returned by the summary commands (camelCase, mirrors ConversationSummaryRow). */
interface SummaryRow {
  conversationId: string;
  takeaways: string[];
  reflection: string;
  flaggedItems: FlaggedReviewItem[];
  model?: string | null;
  createdAt: string;
  updatedAt: string;
  conversationTitle?: string | null;
  conversationPillar?: string | null;
}

interface StoredMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  genui: string | null;
  created_at: string;
}

/** Minimum messages (≈2 user turns) before a session is worth summarising. */
const MIN_MESSAGES = 4;

/** Module-scoped guard so concurrent triggers for the same conversation dedupe. */
const inFlight = new Set<string>();

function rowToSummary(row: SummaryRow): ConversationSummary {
  return {
    conversationId: row.conversationId,
    takeaways: row.takeaways,
    reflection: row.reflection,
    flaggedItems: row.flaggedItems,
    model: row.model ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    conversationTitle: row.conversationTitle ?? undefined,
    conversationPillar: (row.conversationPillar ?? null) as PillarId | null,
  };
}

/** Builds a transcript plus an inventory of interactive items the model can flag. */
function buildTranscript(messages: StoredMessage[]): string {
  const lines: string[] = [];
  const interactive: string[] = [];

  for (const m of messages) {
    const prose = stripGenUITags(m.content);
    if (prose) lines.push(`${m.role.toUpperCase()}: ${prose}`);

    if (m.genui) {
      try {
        const blocks = JSON.parse(m.genui) as GenUIBlock[];
        for (const b of blocks) {
          if (b.type === 'flashcard' || b.type === 'quiz') {
            const q = (b.data as { question?: string })?.question;
            if (q) interactive.push(`- [${b.type}] ${q}`);
          }
        }
      } catch {
        /* ignore malformed genui */
      }
    }
  }

  let out = lines.join('\n\n');
  if (interactive.length > 0) {
    out += `\n\n---\nFlashcards and quizzes shown in this session:\n${interactive.join('\n')}`;
  }
  return out;
}

/** Extracts the first session-summary GenUI block from a model response, if present. */
function extractSummaryBlock(raw: string): SessionSummaryData | null {
  const { blocks } = parseGenUIBlocks(raw);
  const block = blocks.find((b) => b.type === 'session-summary');
  if (!block) return null;
  const data = block.data as Partial<SessionSummaryData>;
  if (!Array.isArray(data.takeaways) || typeof data.reflection !== 'string') return null;
  return {
    takeaways: data.takeaways.map(String).slice(0, 3),
    reflection: data.reflection,
    flaggedItems: Array.isArray(data.flaggedItems) ? data.flaggedItems : [],
  };
}

/**
 * Generate (or fetch) the structured summary for a finished session.
 *
 * Plain async function (no React hooks) so it can run from components, the store,
 * or window-close handlers. Never call this while the user is mid-stream — it uses
 * the decoupled `summarize_conversation` command, but generating against an
 * incomplete transcript is wasteful.
 *
 * Returns the saved summary, or null when the session is too short / generation fails.
 */
export async function runSessionSummary(
  conversationId: string,
  opts?: { force?: boolean }
): Promise<ConversationSummary | null> {
  if (!conversationId || inFlight.has(conversationId)) return null;

  // 1. Short-circuit on an existing summary unless forced.
  try {
    const existing = await tauriInvoke<SummaryRow | null>('get_conversation_summary', {
      conversationId,
    });
    if (existing && !opts?.force) return rowToSummary(existing);
  } catch (err) {
    console.error('get_conversation_summary failed:', err);
  }

  inFlight.add(conversationId);
  try {
    // 2. Minimum-signal guard.
    const stored = await tauriInvoke<StoredMessage[]>('get_conversation_messages', {
      conversationId,
    });
    if (stored.length < MIN_MESSAGES) return null;

    // 3. Resolve pillar/context from the in-memory conversation list.
    const conv = useAppStore.getState().conversationList.find((c) => c.id === conversationId);
    const pillar = (conv?.pillar ?? null) as PillarId | null;
    const transcript = buildTranscript(stored);
    const userContent =
      `Pillar context: ${pillar ?? 'general'}\n\n` +
      `Conversation transcript follows.\n\n${transcript}`;

    const { providerConfig } = useAppStore.getState();
    const config = {
      provider: providerConfig.provider,
      api_key: providerConfig.apiKey,
      model: providerConfig.model,
      base_url: providerConfig.baseUrl,
    };

    // 4. Generate, with one strict retry if the block is missing/malformed.
    let data: SessionSummaryData | null = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      const system =
        attempt === 0
          ? SESSION_SUMMARY_PROMPT
          : `${SESSION_SUMMARY_PROMPT}\n\nYour previous attempt was rejected. Return ONLY the single <genui type="session-summary"> block — no prose before or after.`;
      try {
        console.log(`[session-summary] generating (attempt ${attempt + 1}) for ${conversationId}`);
        const raw = await tauriInvoke<string>('summarize_conversation', {
          transcript: userContent,
          system,
          config,
        });
        data = extractSummaryBlock(raw);
      } catch (err) {
        console.error('summarize_conversation failed:', err);
        break;
      }
    }

    if (!data) {
      console.error('[session-summary] no valid summary block produced');
      return null;
    }

    // 5. Fill deterministic review ids for the flagged items.
    const flaggedItems: FlaggedReviewItem[] = data.flaggedItems.map((it) => {
      const itemPillar = (it.pillar ?? null) as PillarId | null;
      return {
        type: it.type,
        pillar: itemPillar,
        question: it.question,
        reviewItemId: buildReviewItemId(it.type, itemPillar, it.question),
      };
    });

    const model = `${providerConfig.provider}/${providerConfig.model}`;

    // 6. Persist + seed the review queue.
    await tauriInvoke('save_conversation_summary', {
      conversationId,
      summaryJson: JSON.stringify({
        takeaways: data.takeaways,
        reflection: data.reflection,
        flaggedItems,
      }),
      model,
    });

    if (flaggedItems.length > 0) {
      try {
        await tauriInvoke('seed_review_items_from_summary', {
          conversationId,
          items: flaggedItems,
        });
      } catch (err) {
        console.error('seed_review_items_from_summary failed:', err);
      }
    }

    console.log(`[session-summary] saved for ${conversationId}`);

    // 7. Return the freshly-saved summary (re-read for joined title/pillar).
    const saved = await tauriInvoke<SummaryRow | null>('get_conversation_summary', {
      conversationId,
    });
    return saved ? rowToSummary(saved) : null;
  } catch (err) {
    console.error('runSessionSummary failed:', err);
    return null;
  } finally {
    inFlight.delete(conversationId);
  }
}

/** Imperative hook for triggering generation. */
export function useSessionSummary() {
  const generateSummary = useCallback(
    (conversationId: string, opts?: { force?: boolean }) =>
      runSessionSummary(conversationId, opts),
    []
  );
  return { generateSummary };
}

/** Read-only hook for displaying an existing summary. */
export function useConversationSummary(conversationId: string | null) {
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      const row = await tauriInvoke<SummaryRow | null>('get_conversation_summary', {
        conversationId,
      });
      setSummary(row ? rowToSummary(row) : null);
    } catch (err) {
      console.error('useConversationSummary failed:', err);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { summary, loading, refresh };
}
