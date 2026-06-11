import { useCallback, useEffect, useRef } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { Commitment, CommitmentStatus, PillarId } from '@/data/types';
import { buildGoogleCalendarUrl } from '@/lib/commitments';

/**
 * Commitment contracts data access. All Tauri calls live here (never in
 * components). The raw list sits in the Zustand store (ephemeral) so the
 * Dashboard strip and the Weekly Digest share one source of truth.
 */
export function useCommitments() {
  const setCommitments = useAppStore((s) => s.setCommitments);

  /** Reload the full commitment list into the store, sweeping past-due
   *  active ones into `missed` first so callers always see fresh statuses. */
  const loadCommitments = useCallback(async (): Promise<Commitment[]> => {
    try {
      await tauriInvoke<Commitment[]>('get_missed_commitments');
      const rows = await tauriInvoke<Commitment[]>('list_commitments', {
        statusFilter: null,
      });
      setCommitments(rows);
      return rows;
    } catch (err) {
      console.error('Failed to load commitments:', err);
      return [];
    }
  }, [setCommitments]);

  /** Create a commitment; when `linkCalendar` is set, also opens a Google
   *  Calendar template deep link blocking an evening-before focus window. */
  const create = useCallback(
    async (
      commitment: string,
      pillar: PillarId,
      dueDate: string,
      linkCalendar = false
    ): Promise<Commitment | null> => {
      try {
        const created = await tauriInvoke<Commitment>('create_commitment', {
          commitment,
          pillar,
          dueDate,
          linkCalendar,
        });
        if (linkCalendar) {
          try {
            await shellOpen(buildGoogleCalendarUrl(commitment, pillar, dueDate));
          } catch (err) {
            // Calendar link is best-effort — the commitment itself is saved.
            console.error('Failed to open Google Calendar link:', err);
          }
        }
        await loadCommitments();
        return created;
      } catch (err) {
        console.error('Failed to create commitment:', err);
        throw err;
      }
    },
    [loadCommitments]
  );

  const setStatus = useCallback(
    async (id: string, status: CommitmentStatus): Promise<void> => {
      try {
        await tauriInvoke<Commitment>('update_commitment_status', { id, status });
        await loadCommitments();
      } catch (err) {
        console.error('Failed to update commitment status:', err);
      }
    },
    [loadCommitments]
  );

  /** Mark a commitment kept. */
  const complete = useCallback((id: string) => setStatus(id, 'completed'), [setStatus]);

  /** Give a commitment a new due date — back to active, reminder re-armed. */
  const reschedule = useCallback(
    async (id: string, newDueDate: string): Promise<void> => {
      try {
        await tauriInvoke<Commitment>('reschedule_commitment', { id, newDueDate });
        await loadCommitments();
      } catch (err) {
        console.error('Failed to reschedule commitment:', err);
      }
    },
    [loadCommitments]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await tauriInvoke('delete_commitment', { id });
        await loadCommitments();
      } catch (err) {
        console.error('Failed to delete commitment:', err);
      }
    },
    [loadCommitments]
  );

  return { loadCommitments, create, complete, reschedule, remove };
}

/** Loads commitments once on mount (StrictMode-safe) and returns the shared
 *  store list. Use in views that only need to read the list. */
export function useCommitmentList() {
  const commitments = useAppStore((s) => s.commitments);
  const { loadCommitments } = useCommitments();
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadCommitments();
  }, [loadCommitments]);

  return { commitments, reload: loadCommitments };
}
