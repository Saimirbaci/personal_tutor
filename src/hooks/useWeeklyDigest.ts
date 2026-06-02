import { useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { WeeklyDigest } from '@/data/types';

/** Maps the Zustand camelCase provider config to the snake_case Rust ProviderConfig. */
function toRustConfig() {
  const { providerConfig } = useAppStore.getState();
  return {
    provider: providerConfig.provider,
    api_key: providerConfig.apiKey,
    model: providerConfig.model,
    base_url: providerConfig.baseUrl,
  };
}

/**
 * Weekly Digest data access. All Tauri calls live here (never in components).
 *
 * The digest list is kept in the Zustand store so multiple views share it; this
 * hook owns loading, generating, the on-launch catch-up, and markdown export.
 */
export function useWeeklyDigest() {
  const setWeeklyDigests = useAppStore((s) => s.setWeeklyDigests);
  const setSelectedDigestWeek = useAppStore((s) => s.setSelectedDigestWeek);

  /** Load recent digests into the store, newest first. */
  const loadDigests = useCallback(
    async (limit = 12): Promise<WeeklyDigest[]> => {
      try {
        const rows = await tauriInvoke<WeeklyDigest[]>('get_weekly_digests', { limit });
        setWeeklyDigests(rows);
        return rows;
      } catch (err) {
        console.error('Failed to load weekly digests:', err);
        return [];
      }
    },
    [setWeeklyDigests]
  );

  /**
   * Generate (or regenerate) a digest for `weekStart` (defaults to the most recent
   * completed week). Refreshes the store list and selects the new digest.
   */
  const generate = useCallback(
    async (weekStart?: string): Promise<WeeklyDigest | null> => {
      try {
        const digest = await tauriInvoke<WeeklyDigest>('generate_weekly_digest', {
          weekStart: weekStart ?? null,
          config: toRustConfig(),
        });
        await loadDigests();
        setSelectedDigestWeek(digest.weekStart);
        return digest;
      } catch (err) {
        console.error('Failed to generate weekly digest:', err);
        throw err;
      }
    },
    [loadDigests, setSelectedDigestWeek]
  );

  /**
   * On-launch catch-up: generate the most-recently-completed week's digest if it is
   * missing. Backend reads the persisted provider config and returns null (rather
   * than throwing) when generation can't proceed. Idempotent via UNIQUE(week_start).
   */
  const maybeGenerateDue = useCallback(async (): Promise<WeeklyDigest | null> => {
    try {
      return await tauriInvoke<WeeklyDigest | null>('maybe_generate_due_digest');
    } catch (err) {
      console.error('maybe_generate_due_digest failed:', err);
      return null;
    }
  }, []);

  /** Export a digest's markdown to disk; returns the written path. */
  const exportDigest = useCallback(
    async (weekStart: string): Promise<string> => {
      return tauriInvoke<string>('export_weekly_digest', { weekStart, path: null });
    },
    []
  );

  return { loadDigests, generate, maybeGenerateDue, exportDigest };
}
