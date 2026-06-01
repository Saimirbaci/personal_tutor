import { useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { CurriculumItemRef, MasteryScore, PillarId } from '@/data/types';

/**
 * Per-topic mastery scores. `loadMastery` reads persisted scores; `recompute`
 * re-derives them from quiz/SR/conversation signals for the supplied curriculum
 * items, then both push the result into the ephemeral `masteryByItem` store map.
 */
export function useMastery() {
  const masteryByItem = useAppStore((s) => s.masteryByItem);
  const setMasteryScores = useAppStore((s) => s.setMasteryScores);

  const loadMastery = useCallback(
    async (pillar?: PillarId): Promise<void> => {
      try {
        const scores = await tauriInvoke<MasteryScore[]>('get_mastery_scores', { pillar });
        setMasteryScores(scores);
      } catch (err) {
        console.error('Failed to load mastery scores:', err);
      }
    },
    [setMasteryScores]
  );

  const recompute = useCallback(
    async (pillar: PillarId | undefined, items: CurriculumItemRef[]): Promise<void> => {
      try {
        const scores = await tauriInvoke<MasteryScore[]>('recompute_mastery', {
          pillar,
          items,
        });
        setMasteryScores(scores);
      } catch (err) {
        console.error('Failed to recompute mastery scores:', err);
      }
    },
    [setMasteryScores]
  );

  return { masteryByItem, loadMastery, recompute };
}
