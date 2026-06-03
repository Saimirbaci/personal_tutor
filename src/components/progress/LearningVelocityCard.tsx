import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, Minus } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { PILLARS } from '@/data/plan';
import { ProjectionStatus } from '@/data/types';

interface StatusStyle {
  label: string;
  color: string;
  bg: string;
}

const STATUS_STYLES: Record<ProjectionStatus, StatusStyle> = {
  onTrack: { label: 'On track', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
  atRisk: { label: 'At risk', color: '#C9A84C', bg: 'rgba(201,168,76,0.12)' },
  behind: { label: 'Behind', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  insufficientData: { label: 'Not enough data', color: '#4a5568', bg: 'rgba(74,85,104,0.12)' },
};

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-[10px] text-[#4a5568] inline-flex items-center gap-0.5"><Minus size={11} /> —</span>;
  }
  const positive = delta >= 0;
  const color = positive ? '#16A34A' : '#DC2626';
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className="text-[11px] font-mono inline-flex items-center gap-0.5" style={{ color }}>
      <Icon size={12} />
      {positive ? '+' : ''}
      {delta.toFixed(1)}
    </span>
  );
}

export default function LearningVelocityCard() {
  const velocity = useAppStore((s) => s.learningVelocity);

  if (!velocity) {
    return (
      <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
        <h2 className="text-sm font-semibold text-[#e2e8f0] mb-2">Learning Velocity</h2>
        <p className="text-xs text-[#4a5568]">Crunching your pace…</p>
      </div>
    );
  }

  const atRisk = velocity.atRiskCount > 0;
  // Only pillars with a real projection are worth listing.
  const tracked = velocity.pillars.filter((p) => p.projection.status !== 'insufficientData');
  const coldStart = tracked.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#e2e8f0]">Learning Velocity</h2>
        <span className="text-[10px] text-[#4a5568] font-mono">
          {velocity.weeksRemaining.toFixed(1)} weeks left
        </span>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-[#080d1a] border border-[#1a2540] p-3">
          <p className="text-[10px] text-[#4a5568] mb-1">Topics this week</p>
          <p className="text-lg font-bold text-[#e2e8f0]">{velocity.topicsThisWeek}</p>
          <p className="text-[10px] text-[#4a5568]">avg {velocity.topicsPerWeekAvg.toFixed(1)}/wk</p>
        </div>
        <div className="rounded-lg bg-[#080d1a] border border-[#1a2540] p-3">
          <p className="text-[10px] text-[#4a5568] mb-1">Mastery Δ WoW</p>
          <div className="text-lg font-bold"><DeltaBadge delta={velocity.masteryDeltaWoW} /></div>
          <p className="text-[10px] text-[#4a5568]">vs last week</p>
        </div>
        <div className="rounded-lg bg-[#080d1a] border border-[#1a2540] p-3">
          <p className="text-[10px] text-[#4a5568] mb-1">Sessions</p>
          <p className="text-lg font-bold text-[#e2e8f0]">{velocity.sessionsThisWeek}</p>
          <p className="text-[10px] text-[#4a5568]">logged this week</p>
        </div>
      </div>

      {/* Risk banner */}
      {atRisk && (
        <div
          className="rounded-lg p-3 mb-4 flex items-start gap-2.5 border"
          style={{ backgroundColor: 'rgba(220,38,38,0.08)', borderColor: 'rgba(220,38,38,0.3)' }}
        >
          <AlertTriangle size={16} style={{ color: '#DC2626' }} className="mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[#e2e8f0]">
            <span className="font-semibold">{velocity.atRiskCount}</span>{' '}
            {velocity.atRiskCount === 1 ? 'pillar is' : 'pillars are'} off-pace to finish the
            sprint. Increase weekly hours or rebalance focus.
          </p>
        </div>
      )}

      {/* Per-pillar projections */}
      {coldStart ? (
        <p className="text-xs text-[#4a5568]">
          Log a few sessions to project sprint-completion confidence.
        </p>
      ) : (
        <div className="space-y-2">
          {tracked.map((pv) => {
            const pillar = PILLARS.find((p) => p.id === pv.pillarId);
            const style = STATUS_STYLES[pv.projection.status];
            const pct = Math.min(pv.projection.projectedPercent, 100);
            return (
              <div key={pv.pillarId} className="flex items-center gap-3">
                <span className="text-sm w-5 text-center flex-shrink-0">{pillar?.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[#e2e8f0] truncate">{pillar?.name}</span>
                    <DeltaBadge delta={pv.masteryDeltaWoW} />
                  </div>
                  <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: style.color }} />
                  </div>
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color: style.color, backgroundColor: style.bg }}
                >
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
