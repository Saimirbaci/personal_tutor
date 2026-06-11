import { useEffect, useRef } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { Commitment } from '@/data/types';
import { reminderBody } from '@/lib/commitments';
import { isWithinQuietHours } from '@/hooks/useForgettingCurve';

const MINUTE_MS = 60_000;
const POLL_MINUTES = 30;

/**
 * One evening-before reminder check. Fires an OS notification per commitment
 * due tomorrow, then marks it reminded so the backend dedupes — at most one
 * nudge per commitment per deadline (rescheduling re-arms it).
 *
 * Gated to the configured evening hour (and the shared quiet-hours window) so
 * the nudge lands the evening before, not at app launch in the morning.
 */
async function runReminderCheck(reminderHour: number, quietStart: number, quietEnd: number): Promise<void> {
  const now = new Date();
  if (now.getHours() < reminderHour) return;
  if (isWithinQuietHours(now.getHours(), quietStart, quietEnd)) return;

  let due: Commitment[] = [];
  try {
    due = await tauriInvoke<Commitment[]>('get_due_reminders');
  } catch (err) {
    console.error('Failed to load commitment reminders:', err);
    return;
  }

  for (const c of due) {
    try {
      await tauriInvoke('schedule_notification', {
        title: 'Commitment due tomorrow',
        body: reminderBody(c),
        hour: 0,
        minute: 0,
      });
      await tauriInvoke('mark_commitment_reminded', { id: c.id });
    } catch (err) {
      // Notifications are best-effort, never fatal (mirrors useForgettingCurve).
      console.error('Commitment reminder failed:', err);
    }
  }
}

/** In-app poll for the evening-before commitment reminder. Mount once at the
 *  App level; guards against StrictMode double-mount. */
export function useCommitmentReminders() {
  const reminderHour = useAppStore((s) => s.commitmentReminderHour);
  const quietStart = useAppStore((s) => s.forgettingCurveSettings.quietHoursStart);
  const quietEnd = useAppStore((s) => s.forgettingCurveSettings.quietHoursEnd);

  // Latest settings without re-arming the interval on every change.
  const settingsRef = useRef({ reminderHour, quietStart, quietEnd });
  settingsRef.current = { reminderHour, quietStart, quietEnd };
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const check = () => {
      const s = settingsRef.current;
      void runReminderCheck(s.reminderHour, s.quietStart, s.quietEnd);
    };
    check();
    const id = window.setInterval(check, POLL_MINUTES * MINUTE_MS);

    return () => {
      window.clearInterval(id);
      startedRef.current = false;
    };
  }, []);
}
