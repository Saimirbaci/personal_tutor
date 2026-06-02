import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Clock, Flame, Zap } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { tauriInvoke } from '@/lib/tauri';
import { MorningBriefing as MorningBriefingData } from '@/data/types';
import { toISODateString } from '@/lib/utils';

const BRIEFING_KEY = 'morning-briefing-shown';
const MORNING_END_HOUR = 12;

function shouldFireNotification(): boolean {
  const now = new Date();
  if (now.getHours() >= MORNING_END_HOUR) return false;
  const today = toISODateString(now);
  return localStorage.getItem(BRIEFING_KEY) !== today;
}

function markNotificationFired(): void {
  localStorage.setItem(BRIEFING_KEY, toISODateString());
}

export default function MorningBriefing() {
  const [briefing, setBriefing] = useState<MorningBriefingData | null>(null);
  const { setView } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const date = toISODateString();
        const data = await tauriInvoke<MorningBriefingData>('get_morning_briefing', { date });
        if (cancelled) return;
        setBriefing(data);

        if (shouldFireNotification()) {
          markNotificationFired();
          try {
            await tauriInvoke('schedule_notification', {
              title: `Morning briefing — Week ${data.weekNumber}`,
              body: data.notificationBody,
              hour: 0,
              minute: 0,
            });
          } catch (err) {
            console.warn('Notification permission unavailable:', err);
          }
        }
      } catch (err) {
        console.error('Failed to load morning briefing:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!briefing) return null;

  const block = briefing.firstBlock;
  const dueCount = briefing.reviewCounts.due;
  const accent = block?.color ?? '#C9A84C';

  const handleJumpIn = () => {
    setView('tutor');
    navigate('/tutor');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border p-5"
      style={{
        backgroundColor: accent + '10',
        borderColor: accent + '40',
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
              Morning Briefing
            </span>
            <span className="text-[10px] text-[#4a5568]">
              {briefing.dayName} · Week {briefing.weekNumber}
            </span>
          </div>
          <p className="text-sm md:text-base font-semibold text-[#e2e8f0] leading-snug">
            {briefing.headline}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[#94a3b8]">
            {block && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {block.time_label}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Brain size={12} />
              {dueCount} review{dueCount === 1 ? '' : 's'} due
            </span>
            <span className="flex items-center gap-1">
              <Flame size={12} style={{ color: briefing.streak > 0 ? '#C9A84C' : '#4a5568' }} />
              {briefing.streak}-day streak
            </span>
            <span className="text-[#4a5568]">
              {briefing.totalBlocks} block{briefing.totalBlocks === 1 ? '' : 's'} today
            </span>
          </div>
        </div>

        <button
          onClick={handleJumpIn}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:scale-105 active:scale-95"
          style={{ backgroundColor: accent }}
        >
          <Zap size={16} />
          Jump In
        </button>
      </div>
    </motion.div>
  );
}
