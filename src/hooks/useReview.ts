import { useCallback, useEffect, useState } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { PillarId, ReviewCounts, ReviewItem, ReviewItemType } from '@/data/types';

/** Stable djb2 hash for deriving review item IDs from question text. */
function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function buildReviewItemId(
  itemType: ReviewItemType,
  pillar: PillarId | null,
  question: string
): string {
  return `${itemType}:${pillar ?? 'none'}:${stableHash(question.trim())}`;
}

/** Deterministic id for a curriculum item, derived from its pillar + topic.
 *  Topic strings are not unique across months, so the pillar is folded in.
 *  Shared by the frontend and the mastery recompute payload so item_ids align. */
export function buildCurriculumItemId(pillar: PillarId, topic: string): string {
  return `curriculum:${pillar}:${stableHash(topic.trim())}`;
}

export function useReview() {
  const recordAttempt = useCallback(
    async (
      itemId: string,
      itemType: ReviewItemType,
      pillar: PillarId | null,
      content: string,
      quality: number
    ): Promise<void> => {
      try {
        await tauriInvoke('record_review_attempt', {
          itemId,
          itemType,
          pillar,
          content,
          quality,
        });
      } catch (err) {
        console.error('Failed to record review attempt:', err);
      }
    },
    []
  );

  return { recordAttempt };
}

export function useReviewCounts(pollMs = 60_000) {
  const [counts, setCounts] = useState<ReviewCounts | null>(null);

  const refresh = useCallback(async () => {
    try {
      const c = await tauriInvoke<ReviewCounts>('get_review_counts');
      setCounts(c);
    } catch (err) {
      console.error('Failed to load review counts:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  return { counts, refresh };
}

export function useDueReviews() {
  const [items, setItems] = useState<ReviewItem[]>([]);

  const load = useCallback(async (limit = 50) => {
    try {
      const list = await tauriInvoke<ReviewItem[]>('get_due_reviews', { limit });
      setItems(list);
    } catch (err) {
      console.error('Failed to load due reviews:', err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, reload: load };
}
