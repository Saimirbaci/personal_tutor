import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke } from '@/lib/tauri';
import { ConversationDepth } from '@/data/types';
import { DEPTH_SCORE_PROMPT, parseDepthScore, stripGenUITags } from '@/lib/genui';

/** Minimum messages before a conversation is worth scoring (≈2 exchanges). */
const MIN_MESSAGES = 4;
/** Cap transcript turns sent to the classifier to bound token cost. */
const MAX_TRANSCRIPT_MESSAGES = 60;

/** Raw message row returned by `get_conversation_messages`. */
interface StoredMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  genui: string | null;
  created_at: string;
}

/** Module-scoped dedupe so concurrent triggers for one conversation collapse. */
const inFlight = new Set<string>();

/** Builds a USER/ASSISTANT-labelled transcript with GenUI widgets stripped. */
function buildTranscript(messages: StoredMessage[]): string {
  return messages
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((m) => {
      const label = m.role === 'assistant' ? 'ASSISTANT' : 'USER';
      const body = stripGenUITags(m.content);
      return body ? `${label}: ${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Fire-and-forget engagement-depth scoring for a conversation. Idempotent and
 * concurrency-safe: short-circuits when already scored (unless `force`), dedupes
 * concurrent calls, and swallows errors so a missing API key never crashes the
 * caller. All Tauri access lives here — never in components.
 */
export async function runDepthScore(
  conversationId: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (!conversationId || inFlight.has(conversationId)) return;

  // Never score while a response is mid-stream — the transcript is incomplete.
  if (useAppStore.getState().isStreaming) return;

  inFlight.add(conversationId);
  try {
    // Short-circuit if already scored, unless explicitly forced (avoids re-spend).
    if (!opts.force) {
      const existing = await tauriInvoke<ConversationDepth | null>('get_conversation_depth', {
        conversationId,
      });
      if (existing) return;
    }

    const messages = await tauriInvoke<StoredMessage[]>('get_conversation_messages', {
      conversationId,
    });
    if (messages.length < MIN_MESSAGES) return;

    const transcript = buildTranscript(messages);
    if (!transcript) return;

    const { providerConfig } = useAppStore.getState();
    const config = {
      provider: providerConfig.provider,
      api_key: providerConfig.apiKey,
      model: providerConfig.model,
      base_url: providerConfig.baseUrl,
    };

    // One strict retry — classifiers occasionally wrap the block in prose.
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const completion = await tauriInvoke<string>('collect_completion', {
        messages: [{ role: 'user', content: transcript }],
        system: DEPTH_SCORE_PROMPT,
        config,
      });
      parsed = parseDepthScore(completion);
    }
    if (!parsed) {
      console.warn('Depth classifier returned no parseable score for', conversationId);
      return;
    }

    await tauriInvoke('save_conversation_depth', {
      conversationId,
      depthJson: JSON.stringify(parsed),
      model: providerConfig.model,
      messageCount: messages.length,
    });
  } catch (err) {
    // Graceful: provider/key errors must not surface as a UI crash.
    console.error('Failed to score conversation depth:', err);
  } finally {
    inFlight.delete(conversationId);
  }
}

/**
 * Read-only depth assessment for a single conversation, with a manual refresh.
 * Used by the active-thread view; the sidebar index loads the list separately.
 */
export function useConversationDepth(conversationId: string | null) {
  const [depth, setDepth] = useState<ConversationDepth | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!conversationId) {
      setDepth(null);
      return;
    }
    setLoading(true);
    try {
      const row = await tauriInvoke<ConversationDepth | null>('get_conversation_depth', {
        conversationId,
      });
      setDepth(row);
    } catch (err) {
      console.error('Failed to load conversation depth:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { depth, loading, refresh };
}
