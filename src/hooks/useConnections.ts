import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke } from '@/lib/tauri';
import { AiMessage, ConnectionCallout, PillarId } from '@/data/types';

/** Module-scoped dedupe so concurrent triggers for one conversation collapse. */
const inFlight = new Set<string>();

/** Conversations already surfaced this app session — avoid re-injecting cards
 *  on every navigate/return. Cleared only on full reload (ephemeral by design). */
const surfacedThisSession = new Set<string>();

/** Provider config shaping for the snake_case Tauri command boundary. */
function providerArgs() {
  const { providerConfig } = useAppStore.getState();
  return {
    provider: providerConfig.provider,
    api_key: providerConfig.apiKey,
    model: providerConfig.model,
    base_url: providerConfig.baseUrl,
  };
}

/**
 * Fire-and-forget cross-pillar connection detection for a conversation.
 *
 * Mirrors {@link runDepthScore}: idempotent, concurrency-safe (module `inFlight`
 * dedupe), skips while a response is streaming, and swallows errors so a missing
 * API key never crashes the caller. On success it injects the returned callouts
 * as a synthetic (non-persisted) assistant message so they render inline as
 * connection cards in the active thread.
 *
 * All Tauri access lives here — never in components.
 */
export async function runConnectionDetection(
  conversationId: string,
  pillar: PillarId | null,
  opts: { force?: boolean } = {}
): Promise<void> {
  if (!conversationId || !pillar) return;
  if (inFlight.has(conversationId)) return;

  // Never detect mid-stream — the transcript/topics are incomplete.
  if (useAppStore.getState().isStreaming) return;

  // Only surface once per conversation per session unless explicitly forced.
  if (!opts.force && surfacedThisSession.has(conversationId)) return;

  inFlight.add(conversationId);
  try {
    const callouts = await tauriInvoke<ConnectionCallout[]>('detect_connections', {
      conversationId,
      pillar,
      config: providerArgs(),
    });

    surfacedThisSession.add(conversationId);
    if (!callouts || callouts.length === 0) return;

    // Only inject if we're still looking at the same conversation — a callout
    // belongs to the thread that produced it.
    const state = useAppStore.getState();
    if (state.activeConversationId !== conversationId || state.isStreaming) return;

    const message: AiMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      // Empty visible text — the card carries the content. MessageBubble renders
      // genui blocks; an empty content body is fine.
      content: '',
      genui: callouts.map((c) => ({ type: 'connection' as const, data: c })),
      timestamp: new Date(),
    };
    state.addMessage(message);
  } catch (err) {
    // Graceful: provider/key errors must not surface as a UI crash.
    console.error('Failed to detect cross-pillar connections:', err);
  } finally {
    inFlight.delete(conversationId);
  }
}

/**
 * Thin read hook exposing a manual trigger. Background surfacing is driven by
 * {@link runConnectionDetection} from TutorChat — this is for explicit refreshes.
 */
export function useConnections() {
  const [running, setRunning] = useState(false);

  const detect = async (conversationId: string, pillar: PillarId | null, force = false) => {
    setRunning(true);
    try {
      await runConnectionDetection(conversationId, pillar, { force });
    } finally {
      setRunning(false);
    }
  };

  return { detect, running };
}
