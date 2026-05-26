import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';

export default function StreakWidget() {
  const { streak, progress } = useAppStore();

  // Build last 30 days array
  const days: { date: string; logged: boolean; isToday: boolean }[] = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const logged = progress?.recentDays?.some((rd) => rd.date === dateStr) ?? false;
    days.push({ date: dateStr, logged, isToday: dateStr === todayStr });
  }

  // Calculate best streak from recent days
  const allLogged = progress?.recentDays?.map((d) => d.date) ?? [];
  let bestStreak = 0;
  let current = 0;
  for (const day of days) {
    if (allLogged.includes(day.date)) {
      current++;
      bestStreak = Math.max(bestStreak, current);
    } else {
      current = 0;
    }
  }

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#e2e8f0]">Study Streak</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#4a5568]">Best: {bestStreak} days</span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1a2540]">
            <span className="text-base leading-none">🔥</span>
            <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>
              {streak}
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
            title={`${day.date}${day.logged ? ' — session logged' : ''}`}
            className={cn(
              'w-5 h-5 rounded-sm transition-all duration-150',
              day.isToday && !day.logged
                ? 'ring-1 ring-[#C9A84C] ring-offset-1 ring-offset-[#0f1629]'
                : ''
            )}
            style={{
              backgroundColor: day.logged
                ? '#2E5FA3'
                : day.isToday
                ? '#1a2540'
                : '#0f1629',
              border: `1px solid ${day.logged ? '#3a71c1' : '#1a2540'}`,
            }}
          />
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
        </div>
        <span className="text-[10px] text-[#4a5568]">Today</span>
      </div>
    </div>
  );
}
