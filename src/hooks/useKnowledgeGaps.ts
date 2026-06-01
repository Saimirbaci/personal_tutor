import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke } from '@/lib/tauri';
import { KnowledgeGap, PillarId } from '@/data/types';

/** Pure selector: open gaps for a single pillar, severity-ranked. */
export function gapsForPillar(
  gaps: KnowledgeGap[] | null,
  pillar: PillarId | null
): KnowledgeGap[] {
  if (!gaps || !pillar) return [];
  return gaps.filter((g) => g.pillar === pillar);
}

/**
 * Loads and mutates the knowledge-gap list. Gaps are derived on the backend
 * from live SM-2 + chat signals, so they are never persisted client-side.
 */
export function useKnowledgeGaps() {
  const knowledgeGaps = useAppStore((s) => s.knowledgeGaps);
  const setKnowledgeGaps = useAppStore((s) => s.setKnowledgeGaps);

  const loadGaps = useCallback(
    async (pillar?: PillarId): Promise<void> => {
      try {
        const gaps = await tauriInvoke<KnowledgeGap[]>('get_knowledge_gaps', { pillar });
        setKnowledgeGaps(gaps);
      } catch (err) {
        console.error('Failed to load knowledge gaps:', err);
      }
    },
    [setKnowledgeGaps]
  );

  const dismissGap = useCallback(
    async (gapId: string, snoozeDays?: number): Promise<void> => {
      // Optimistic removal, then reconcile with a fresh recompute.
      const current = useAppStore.getState().knowledgeGaps ?? [];
      setKnowledgeGaps(current.filter((g) => g.gapId !== gapId));
      try {
        await tauriInvoke('dismiss_gap', { gapId, snoozeDays });
        await loadGaps();
      } catch (err) {
        console.error('Failed to dismiss knowledge gap:', err);
        await loadGaps();
      }
    },
    [setKnowledgeGaps, loadGaps]
  );

  const markDrilled = useCallback(
    async (gapId: string): Promise<void> => {
      try {
        await tauriInvoke('mark_gap_drilled', { gapId });
        await loadGaps();
      } catch (err) {
        console.error('Failed to mark knowledge gap drilled:', err);
      }
    },
    [loadGaps]
  );

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  return { knowledgeGaps, loadGaps, dismissGap, markDrilled };
}
