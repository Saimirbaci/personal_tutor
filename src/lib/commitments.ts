import { Commitment } from '@/data/types';

/** Focus block placed on the evening before the due date, local time. */
const FOCUS_BLOCK_START_HOUR = 18;
const FOCUS_BLOCK_HOURS = 2;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Floating local-time stamp for Google Calendar (no Z → user's calendar TZ). */
function gcalStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(
    d.getHours()
  )}${pad(d.getMinutes())}00`;
}

/**
 * Google Calendar "create event" template deep link blocking a 2-hour focus
 * window the evening before the commitment's due date. No OAuth, no stored
 * tokens — the user confirms the event in their own calendar.
 */
export function buildGoogleCalendarUrl(commitment: string, pillar: string, dueDate: string): string {
  const due = new Date(`${dueDate}T00:00:00`);
  const start = new Date(due);
  start.setDate(start.getDate() - 1);
  start.setHours(FOCUS_BLOCK_START_HOUR, 0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + FOCUS_BLOCK_HOURS);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Focus: ${commitment}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details: `Commitment for the ${pillar} pillar — due ${dueDate}. Created by Personal Tutor.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Whole days from `today` (local) until the due date. Negative = past due. */
export function daysUntilDue(dueDate: string, today = new Date()): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

/** Short human label for the strip chips: "today", "tomorrow", "3d", "2d late". */
export function dueLabel(dueDate: string, today = new Date()): string {
  const days = daysUntilDue(dueDate, today);
  if (days < 0) return `${-days}d late`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days}d`;
}

/** Body copy for the evening-before OS reminder. */
export function reminderBody(c: Commitment): string {
  return `Your commitment "${c.commitment}" is due tomorrow. A focused session tonight or tomorrow gets it done.`;
}
