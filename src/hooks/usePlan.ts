import { useState, useEffect, useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { CurriculumItem, PillarId, ScheduleBlock, TodaySchedule } from '@/data/types';
import { PLAN } from '@/data/plan';
import { getWeekNumber, toISODateString } from '@/lib/utils';

export function usePlan() {
  const [todaySchedule, setTodaySchedule] = useState<TodaySchedule | null>(null);

  const loadSchedule = useCallback(async () => {
    try {
      const date = toISODateString();
      const schedule = await tauriInvoke<TodaySchedule>('get_today_schedule', { date });
      setTodaySchedule(schedule);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const currentBlock: ScheduleBlock | null = (() => {
    if (!todaySchedule?.blocks.length) return null;
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentMinutes = hour * 60 + minute;

    for (const block of todaySchedule.blocks) {
      const [startTime] = block.time_label.split(' – ');
      const [h, m] = startTime.split(':').map(Number);
      const blockStart = h * 60 + m;
      const blockEnd = blockStart + block.duration_min;

      if (currentMinutes >= blockStart && currentMinutes < blockEnd) {
        return block;
      }
    }

    // Return first upcoming block
    for (const block of todaySchedule.blocks) {
      const [startTime] = block.time_label.split(' – ');
      const [h, m] = startTime.split(':').map(Number);
      const blockStart = h * 60 + m;
      if (currentMinutes < blockStart) {
        return block;
      }
    }

    return todaySchedule.blocks[0] ?? null;
  })();

  const getCurrentTopic = useCallback((pillar: PillarId): string => {
    const week = getWeekNumber();
    const pillarData = PLAN.find((p) => p.pillar.id === pillar);
    if (!pillarData) return 'Study session';

    for (const month of pillarData.curriculum) {
      for (const item of month.items) {
        const itemWeek = parseInt(item.week.replace('Week ', ''), 10);
        if (itemWeek === week) {
          return item.topic;
        }
      }
    }
    return pillarData.curriculum[0]?.items[0]?.topic ?? 'Study session';
  }, []);

  const getWeekItems = useCallback((pillar: PillarId, week: number): CurriculumItem[] => {
    const pillarData = PLAN.find((p) => p.pillar.id === pillar);
    if (!pillarData) return [];

    const weekStr = `Week ${week}`;
    const items: CurriculumItem[] = [];

    for (const month of pillarData.curriculum) {
      for (const item of month.items) {
        if (item.week === weekStr) {
          items.push(item);
        }
      }
    }
    return items;
  }, []);

  return {
    todaySchedule,
    currentBlock,
    getCurrentTopic,
    getWeekItems,
    loadSchedule,
  };
}
