import { useCallback, useEffect, useRef, useState } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { ForgettingCurveSettings, ForgettingNudge } from '@/data/types';

const MINUTE_MS = 60_000;
const DAILY_COUNTER_PREFIX = 'fc-nudge-count-';

/** True when `hour` (0–23) falls inside the quiet-hours window, which may wrap
 *  past midnight (e.g. start 22, end 7). An empty window (start === end) never
 *  suppresses. */
export function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** localStorage key for today's fired-nudge counter (local calendar day). */
function dailyCounterKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${DAILY_COUNTER_PREFIX}${y}-${m}-${d}`;
}

function getDailyCount(now: Date): number {
  try {
    return Number(window.localStorage.getItem(dailyCounterKey(now))) || 0;
  } catch {
    return 0;
  }
}

function bumpDailyCount(now: Date, by: number): void {
  try {
    const next = getDailyCount(now) + by;
    window.localStorage.setItem(dailyCounterKey(now), String(next));
  } catch {
    // localStorage unavailable — daily cap silently degrades to backend dedup only
  }
}

/** Fires deduplicated, rate-limited, quiet-hours-aware OS notifications for
 *  review items that have crossed the forgetting threshold. Runs a poll while
 *  the app is open. All Tauri calls for this feature live here. */
async function runNudgeCheck(settings: ForgettingCurveSettings): Promise<void> {
  if (!settings.enabled) return;

  const now = new Date();
  if (isWithinQuietHours(now.getHours(), settings.quietHoursStart, settings.quietHoursEnd)) {
    return;
  }

  const fired = getDailyCount(now);
  const remaining = settings.dailyCap - fired;
  if (remaining <= 0) return;

  let nudges: ForgettingNudge[] = [];
  try {
    nudges = await tauriInvoke<ForgettingNudge[]>('get_forgetting_curve_due', {
      lookaheadMin: settings.lookaheadMinutes,
      maxItems: remaining,
    });
  } catch (err) {
    console.error('Failed to load forgetting-curve nudges:', err);
    return;
  }

  for (const nudge of nudges) {
    try {
      await tauriInvoke('schedule_notification', {
        title: nudge.title,
        body: nudge.body,
        hour: 0,
        minute: 0,
      });
      await tauriInvoke('mark_review_notified', { itemId: nudge.itemId });
      bumpDailyCount(now, 1);
    } catch (err) {
      // Mirror the rest of the app: notifications are best-effort, never fatal.
      console.error('Notification permission unavailable:', err);
    }
  }
}

export function useForgettingCurve() {
  const settings = useAppStore((s) => s.forgettingCurveSettings);
  // Keep the latest settings without re-arming the interval on every change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Guard against React StrictMode double-mount in dev.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void runNudgeCheck(settingsRef.current);
    const pollMs = Math.max(settingsRef.current.pollMinutes, 1) * MINUTE_MS;
    const id = window.setInterval(() => {
      void runNudgeCheck(settingsRef.current);
    }, pollMs);

    return () => {
      window.clearInterval(id);
      startedRef.current = false;
    };
  }, []);
}

/** Read-only fetch of the most-forgotten items for in-app surfacing (e.g. the
 *  Dashboard). Does NOT mark items as notified, so viewing them in-app does not
 *  suppress the OS nudge. */
export function useForgettingNudgePreview(limit = 3) {
  const enabled = useAppStore((s) => s.forgettingCurveSettings.enabled);
  const lookahead = useAppStore((s) => s.forgettingCurveSettings.lookaheadMinutes);
  const [nudges, setNudges] = useState<ForgettingNudge[]>([]);

  const load = useCallback(async () => {
    if (!enabled) {
      setNudges([]);
      return;
    }
    try {
      const list = await tauriInvoke<ForgettingNudge[]>('get_forgetting_curve_due', {
        lookaheadMin: lookahead,
        maxItems: limit,
      });
      setNudges(list);
    } catch (err) {
      console.error('Failed to load forgetting-curve preview:', err);
    }
  }, [enabled, lookahead, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { nudges, reload: load };
}
