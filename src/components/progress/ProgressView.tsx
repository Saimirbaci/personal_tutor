import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { PILLARS } from '@/data/plan';
import { formatHours, formatDateShort } from '@/lib/utils';
import { PillarId } from '@/data/types';
import { useAnalytics } from '@/hooks/useAnalytics';
import LearningVelocityCard from './LearningVelocityCard';
import EffortMasteryMatrix from './EffortMasteryMatrix';
import PlanRebalanceCard from './PlanRebalanceCard';

export default function ProgressView() {
  const { progress, streak } = useAppStore();
  const { loadAll } = useAnalytics();
  const loadedRef = useRef(false);

  // Load analytics once on mount (guard against StrictMode double-invoke).
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadAll();
  }, [loadAll]);

  const pillars = PILLARS;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-xl font-bold text-[#e2e8f0] mb-1">Progress</h1>
          <p className="text-sm text-[#4a5568]">Track your 3-month sprint performance</p>
        </motion.div>

        {/* Streak banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 flex items-center gap-4"
        >
          <span className="text-4xl">🔥</span>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#C9A84C' }}>
              {streak} day streak
            </p>
            <p className="text-xs text-[#4a5568] mt-0.5">
              Keep logging daily sessions to maintain momentum
            </p>
          </div>
        </motion.div>

        {/* Weekly plan rebalance proposal */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <PlanRebalanceCard />
        </motion.div>

        {/* Learning velocity — pace, WoW mastery delta, completion confidence */}
        <LearningVelocityCard />

        {/* Effort vs mastery 2×2 — quick wins vs diminishing returns */}
        <EffortMasteryMatrix />

        {/* Pillar breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
        >
          <h2 className="text-sm font-semibold text-[#e2e8f0] mb-4">Hours by Pillar</h2>
          <div className="space-y-4">
            {pillars.map((pillar) => {
              const logged = progress?.totalHours?.[pillar.id as PillarId] ?? 0;
              const target = progress?.targetHours?.[pillar.id as PillarId] ?? 36;
              const pct = Math.min((logged / target) * 100, 100);

              return (
                <div key={pillar.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-[#e2e8f0] flex items-center gap-2">
                      {pillar.emoji} {pillar.name}
                    </span>
                    <span className="text-xs font-mono text-[#4a5568]">
                      {formatHours(logged)} / {formatHours(target)}
                    </span>
                  </div>
                  <div className="h-2 bg-[#1a2540] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: pillar.color }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-[#4a5568]">{Math.round(pct)}% complete</span>
                    <span className="text-[10px] text-[#4a5568]">
                      {formatHours(target - logged)} remaining
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Today's sessions */}
        {progress?.todaySessions && progress.todaySessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
          >
            <h2 className="text-sm font-semibold text-[#e2e8f0] mb-3">Today's Sessions</h2>
            <div className="space-y-2">
              {progress.todaySessions.map((session) => {
                const pillar = PILLARS.find((p) => p.id === session.pillar);
                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-[#080d1a] border border-[#1a2540]"
                  >
                    <span className="text-lg">{pillar?.emoji}</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-[#e2e8f0] capitalize">{session.pillar}</p>
                      {session.note && <p className="text-xs text-[#4a5568] mt-0.5">{session.note}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono font-semibold" style={{ color: pillar?.color }}>
                        {formatHours(session.hours)}
                      </p>
                      <p className="text-[10px] text-[#4a5568]">
                        {'⚡'.repeat(session.energy)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Recent activity */}
        {progress?.recentDays && progress.recentDays.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
          >
            <h2 className="text-sm font-semibold text-[#e2e8f0] mb-3">Recent Activity (30 days)</h2>
            <div className="space-y-2">
              {progress.recentDays.slice(0, 14).map((day) => (
                <div
                  key={day.date}
                  className="flex items-center gap-4 py-1.5"
                >
                  <span className="text-xs font-mono text-[#4a5568] w-24 flex-shrink-0">
                    {formatDateShort(new Date(day.date + 'T12:00:00'))}
                  </span>
                  <div className="flex-1 h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((day.total_hours / 4) * 100, 100)}%`,
                        backgroundColor: '#2E5FA3',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-[#4a5568] w-12 text-right flex-shrink-0">
                    {formatHours(day.total_hours)}
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    {day.pillars.map((p) => {
                      const pillar = PILLARS.find((pl) => pl.id === p);
                      return pillar ? (
                        <span key={p} className="text-xs" title={pillar.name}>{pillar.emoji}</span>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
