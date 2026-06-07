import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke } from '@/lib/tauri';
import { PillarId, ProgressData, StreakState } from '@/data/types';

interface RawProgressData {
  total_hours: Record<string, number>;
  target_hours: Record<string, number>;
  today_sessions: Array<{
    id: string;
    date: string;
    pillar: string;
    hours: number;
    energy: number;
    note: string;
    created_at: string;
  }>;
  recent_days: Array<{
    date: string;
    total_hours: number;
    pillars: string[];
  }>;
  milestones: Array<{
    pillar: string;
    month: number;
    status: string;
  }>;
}

export function useProgress() {
  const { setProgress, setStreak, setStreakState } = useAppStore();

  const loadStreakState = useCallback(async (): Promise<void> => {
    try {
      const state = await tauriInvoke<StreakState>('get_streak_state');
      setStreakState(state);
    } catch (err) {
      console.error('Failed to load streak state:', err);
    }
  }, [setStreakState]);

  const loadProgress = useCallback(async (): Promise<void> => {
    try {
      const raw = await tauriInvoke<RawProgressData>('get_progress');
      const streak = await tauriInvoke<number>('get_streak');

      const progress: ProgressData = {
        totalHours: raw.total_hours as Record<PillarId, number>,
        targetHours: raw.target_hours as Record<PillarId, number>,
        todaySessions: raw.today_sessions.map((s) => ({
          id: s.id,
          date: s.date,
          pillar: s.pillar as PillarId,
          hours: s.hours,
          energy: s.energy,
          note: s.note,
        })),
        recentDays: raw.recent_days,
        milestones: raw.milestones,
      };

      setProgress(progress);
      setStreak(streak);
      await loadStreakState();
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  }, [setProgress, setStreak, loadStreakState]);

  const logSession = useCallback(
    async (pillar: PillarId, hours: number, energy: number, note: string): Promise<void> => {
      await tauriInvoke('log_session', { pillar, hours, energy, note });
      await loadProgress();
    },
    [loadProgress]
  );

  /** Fetch the catch-up seed prompt for a pending recovery offer. */
  const startRecovery = useCallback(async (): Promise<string | null> => {
    try {
      return await tauriInvoke<string>('start_streak_recovery');
    } catch (err) {
      console.error('Failed to start streak recovery:', err);
      return null;
    }
  }, []);

  /** Mark the recovery completed (partial restore) and refresh streak state. */
  const completeRecovery = useCallback(async (): Promise<void> => {
    try {
      const state = await tauriInvoke<StreakState>('complete_streak_recovery');
      setStreakState(state);
    } catch (err) {
      console.error('Failed to complete streak recovery:', err);
    }
  }, [setStreakState]);

  const updateMilestone = useCallback(
    async (pillar: PillarId, month: number, status: string): Promise<void> => {
      await tauriInvoke('update_milestone', { pillar, month, status });
      await loadProgress();
    },
    [loadProgress]
  );

  return {
    loadProgress,
    loadStreakState,
    logSession,
    updateMilestone,
    startRecovery,
    completeRecovery,
  };
}
