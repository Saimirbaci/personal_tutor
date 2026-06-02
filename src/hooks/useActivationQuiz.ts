import { useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { ActivationQuiz, ActivationResult, PillarId } from '@/data/types';
import { buildReviewItemId, useReview } from '@/hooks/useReview';

/** SM-2 quality assigned to a correct activation answer. >=3 is a pass. */
export const PASS_QUALITY = 4;
/** SM-2 quality assigned to an incorrect activation answer (resets interval). */
export const FAIL_QUALITY = 1;

/** Map a right/wrong activation answer to an SM-2 quality grade. */
export function gradeToQuality(correct: boolean): number {
  return correct ? PASS_QUALITY : FAIL_QUALITY;
}

/**
 * Loads the pre-session activation quiz and persists graded answers back into the
 * spaced-repetition store. All Tauri access lives here — never in components.
 */
export function useActivationQuiz() {
  const { recordAttempt } = useReview();

  const loadQuiz = useCallback(
    async (pillar?: PillarId | null, limit = 4): Promise<ActivationQuiz> => {
      return tauriInvoke<ActivationQuiz>('get_activation_quiz', {
        pillar: pillar ?? null,
        limit,
      });
    },
    []
  );

  /**
   * Record each graded answer via record_review_attempt. Summary-sourced questions
   * arrive without an itemId, so derive a stable one via buildReviewItemId so the
   * first attempt creates a consistent review_items row.
   */
  const submitResults = useCallback(
    async (results: ActivationResult[]): Promise<void> => {
      for (const r of results) {
        const itemId =
          r.itemId || buildReviewItemId(r.itemType, r.pillar, r.content);
        await recordAttempt(itemId, r.itemType, r.pillar, r.content, r.quality);
      }
    },
    [recordAttempt]
  );

  return { loadQuiz, submitResults };
}
