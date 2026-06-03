import { useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { PLAN } from '@/data/plan';
import {
  CurriculumItemRef,
  EffortMasteryMatrix,
  LearningVelocity,
  PillarId,
} from '@/data/types';
import { buildCurriculumItemId } from '@/hooks/useReview';

/** Every curriculum item across all pillars, as (itemId, pillarId, topic) refs.
 *  Kept module-scoped so it is computed once, not per render. */
const ALL_CURRICULUM_ITEMS: CurriculumItemRef[] = PLAN.flatMap((p) => {
  const pid = p.pillar.id as PillarId;
  return p.curriculum.flatMap((month) =>
    month.items.map((item) => ({
      itemId: buildCurriculumItemId(pid, item.topic),
      pillarId: pid,
      topic: item.topic,
    }))
  );
});

/**
 * Learning-velocity and effort-vs-mastery analytics. All Tauri IPC lives here —
 * components consume the ephemeral store payloads via selectors. `loadAll` first
 * recomputes mastery (so WoW deltas and matrix baselines reflect latest scores),
 * then loads both analytics payloads.
 */
export function useAnalytics() {
  const learningVelocity = useAppStore((s) => s.learningVelocity);
  const effortMatrix = useAppStore((s) => s.effortMatrix);
  const setLearningVelocity = useAppStore((s) => s.setLearningVelocity);
  const setEffortMatrix = useAppStore((s) => s.setEffortMatrix);

  const loadVelocity = useCallback(async (): Promise<void> => {
    try {
      const velocity = await tauriInvoke<LearningVelocity>('get_learning_velocity');
      setLearningVelocity(velocity);
    } catch (err) {
      console.error('Failed to load learning velocity:', err);
    }
  }, [setLearningVelocity]);

  const loadMatrix = useCallback(async (): Promise<void> => {
    try {
      const matrix = await tauriInvoke<EffortMasteryMatrix>('get_effort_mastery_matrix');
      setEffortMatrix(matrix);
    } catch (err) {
      console.error('Failed to load effort/mastery matrix:', err);
    }
  }, [setEffortMatrix]);

  const loadAll = useCallback(async (): Promise<void> => {
    // Refresh mastery snapshots first so deltas/baselines are current. A missing
    // API key or backend hiccup here must not block the analytics reads.
    try {
      await tauriInvoke('recompute_mastery', {
        pillar: undefined,
        items: ALL_CURRICULUM_ITEMS,
      });
    } catch (err) {
      console.error('Failed to recompute mastery before analytics load:', err);
    }
    await Promise.all([loadVelocity(), loadMatrix()]);
  }, [loadVelocity, loadMatrix]);

  return { learningVelocity, effortMatrix, loadVelocity, loadMatrix, loadAll };
}
