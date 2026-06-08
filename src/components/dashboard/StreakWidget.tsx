import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';
import { StreakStatus } from '@/data/types';

const STATUS_COLOR: Record<StreakStatus, string> = {
  active: '#C9A84C',
  at_risk: '#e0a458',
  recovery: '#38bdf8',
  broken: '#6b7280',
};

const STATUS_LABEL: Record<StreakStatus, string> = {
  active: 'On track',
  at_risk: 'Log today to keep it',
  recovery: 'Recoverable',
  broken: 'Streak reset',
};

/** A small ❄️ chip showing held freeze tokens. */
function FreezeTokenBadge({ tokens, usedThisWeek }: { tokens: number; usedThisWeek: boolean }) {
  if (tokens <= 0 && !usedThisWeek) return null;
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0c2030] border border-cyan-900/50"
      title={
        usedThisWeek
          ? 'A freeze token was used this week to save your streak'
          : 'Freeze tokens auto-save your streak on a missed day. Earn one per week with a deep session.'
      }
    >
      <span className="text-base leading-none">❄️</span>
      <span className="text-sm font-bold text-cyan-300">{tokens}</span>
      {usedThisWeek && <span className="text-[10px] text-cyan-500">used</span>}
    </div>
  );
}

export default function StreakWidget() {
  const { streak, streakState, progress } = useAppStore();

  const current = streakState?.current ?? streak;
  const status: StreakStatus = streakState?.status ?? 'active';
  const frozenSet = new Set(streakState?.frozenDays ?? []);
  const accent = STATUS_COLOR[status];

  // Build last 30 days array
  const days: { date: string; logged: boolean; frozen: boolean; isToday: boolean }[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const logged = progress?.recentDays?.some((rd) => rd.date === dateStr) ?? false;
    days.push({
      date: dateStr,
      logged,
      frozen: frozenSet.has(dateStr) && !logged,
      isToday: dateStr === todayStr,
    });
  }

  // Best streak: prefer backend, else derive from recent days.
  let bestStreak = streakState?.best ?? 0;
  if (!streakState) {
    const allLogged = progress?.recentDays?.map((d) => d.date) ?? [];
    let run = 0;
    for (const day of days) {
      if (allLogged.includes(day.date)) {
        run++;
        bestStreak = Math.max(bestStreak, run);
      } else {
        run = 0;
      }
    }
  }

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Study Streak</h2>
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
            style={{ color: accent, borderColor: `${accent}55`, backgroundColor: `${accent}11` }}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#4a5568]">Best: {bestStreak} days</span>
          <FreezeTokenBadge
            tokens={streakState?.freezeTokens ?? 0}
            usedThisWeek={streakState?.freezeUsedThisWeek ?? false}
          />
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1a2540]">
            <span className="text-base leading-none">🔥</span>
            <span className="text-sm font-bold" style={{ color: accent }}>
              {current}
            </span>
            <span className="text-xs text-[#4a5568]">days</span>
          </div>
        </div>
      </div>

      {/* 30-day heatmap */}
      <div className="flex items-center gap-1 flex-wrap">
        {days.map((day) => (
          <div
            key={day.date}
            title={`${day.date}${
              day.frozen ? ' — saved by freeze ❄️' : day.logged ? ' — session logged' : ''
            }`}
            className={cn(
              'w-5 h-5 rounded-sm transition-all duration-150 flex items-center justify-center text-[9px] leading-none',
              day.isToday && !day.logged
                ? 'ring-1 ring-offset-1 ring-offset-[#0f1629]'
                : ''
            )}
            style={{
              backgroundColor: day.frozen
                ? '#0c3a52'
                : day.logged
                ? '#2E5FA3'
                : day.isToday
                ? '#1a2540'
                : '#0f1629',
              border: `1px solid ${
                day.frozen ? '#1f6f99' : day.logged ? '#3a71c1' : '#1a2540'
              }`,
              boxShadow: day.isToday && !day.logged ? `0 0 0 1px ${accent}` : undefined,
            }}
          >
            {day.frozen ? '❄' : ''}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-[#4a5568]">30 days ago</span>
        <div className="flex items-center gap-2 text-[10px] text-[#4a5568]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#0f1629', border: '1px solid #1a2540' }} />
            No log
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#2E5FA3' }} />
            Logged
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#0c3a52', border: '1px solid #1f6f99' }} />
            Frozen
          </span>
        </div>
        <span className="text-[10px] text-[#4a5568]">Today</span>
      </div>
    </div>
  );
}
