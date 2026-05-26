import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke } from '@/lib/tauri';
import { PillarId, ProgressData } from '@/data/types';

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
  const { setProgress, setStreak } = useAppStore();

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
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  }, [setProgress, setStreak]);

  const logSession = useCallback(
    async (pillar: PillarId, hours: number, energy: number, note: string): Promise<void> => {
      await tauriInvoke('log_session', { pillar, hours, energy, note });
      await loadProgress();
    },
    [loadProgress]
  );

  const updateMilestone = useCallback(
    async (pillar: PillarId, month: number, status: string): Promise<void> => {
      await tauriInvoke('update_milestone', { pillar, month, status });
      await loadProgress();
    },
    [loadProgress]
  );

  return { loadProgress, logSession, updateMilestone };
}
