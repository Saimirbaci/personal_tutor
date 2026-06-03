import { motion } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { PILLARS } from '@/data/plan';
import { EffortMasteryQuadrant } from '@/data/types';

// SVG layout (viewBox units; rendered responsively via width=100%).
const W = 340;
const H = 260;
const PAD = { l: 36, r: 16, t: 28, b: 30 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

const QUADRANT_LABELS: Record<EffortMasteryQuadrant, string> = {
  quickWin: 'Quick Wins',
  diminishingReturns: 'Diminishing Returns',
  building: 'Building',
  coasting: 'Coasting',
};

export default function EffortMasteryMatrix() {
  const matrix = useAppStore((s) => s.effortMatrix);

  if (!matrix) {
    return (
      <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
        <h2 className="text-sm font-semibold text-[#e2e8f0] mb-2">Effort vs Mastery</h2>
        <p className="text-xs text-[#4a5568]">Mapping your pillars…</p>
      </div>
    );
  }

  if (matrix.points.length === 0) {
    return (
      <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
        <h2 className="text-sm font-semibold text-[#e2e8f0] mb-2">Effort vs Mastery</h2>
        <p className="text-xs text-[#4a5568]">
          Log study hours and complete quizzes to map effort against mastery gains.
        </p>
      </div>
    );
  }

  // Domains with headroom; gain may be negative, so anchor the y floor at min(0, …).
  const efforts = matrix.points.map((p) => p.effort);
  const gains = matrix.points.map((p) => p.masteryGain);
  const effortMax = Math.max(...efforts, matrix.effortThreshold, 1) * 1.18;
  const gainMax = Math.max(...gains, matrix.masteryThreshold, 1) * 1.18;
  const gainMin = Math.min(...gains, 0) * 1.18;
  const gainSpan = gainMax - gainMin || 1;

  const sx = (effort: number) => PAD.l + (effort / effortMax) * PLOT_W;
  const sy = (gain: number) => PAD.t + PLOT_H - ((gain - gainMin) / gainSpan) * PLOT_H;

  const thrX = sx(matrix.effortThreshold);
  const thrY = sy(matrix.masteryThreshold);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
    >
      <h2 className="text-sm font-semibold text-[#e2e8f0] mb-1">Effort vs Mastery</h2>
      <p className="text-[11px] text-[#4a5568] mb-3">
        Where you're getting quick wins vs diminishing returns
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Effort versus mastery gain scatter by pillar">
        {/* Plot border */}
        <rect x={PAD.l} y={PAD.t} width={PLOT_W} height={PLOT_H} fill="#080d1a" stroke="#1a2540" />

        {/* Quadrant dividers (median split) */}
        <line x1={thrX} y1={PAD.t} x2={thrX} y2={PAD.t + PLOT_H} stroke="#2a3a5c" strokeDasharray="3 3" />
        <line x1={PAD.l} y1={thrY} x2={PAD.l + PLOT_W} y2={thrY} stroke="#2a3a5c" strokeDasharray="3 3" />

        {/* Quadrant labels */}
        <text x={PAD.l + 5} y={PAD.t + 13} fill="#16A34A" fontSize="9" fontWeight="600">{QUADRANT_LABELS.quickWin}</text>
        <text x={PAD.l + PLOT_W - 5} y={PAD.t + 13} fill="#2E5FA3" fontSize="9" fontWeight="600" textAnchor="end">{QUADRANT_LABELS.building}</text>
        <text x={PAD.l + 5} y={PAD.t + PLOT_H - 6} fill="#4a5568" fontSize="9" fontWeight="600">{QUADRANT_LABELS.coasting}</text>
        <text x={PAD.l + PLOT_W - 5} y={PAD.t + PLOT_H - 6} fill="#DC2626" fontSize="9" fontWeight="600" textAnchor="end">{QUADRANT_LABELS.diminishingReturns}</text>

        {/* Axis labels */}
        <text x={PAD.l + PLOT_W / 2} y={H - 8} fill="#4a5568" fontSize="9" textAnchor="middle">Effort (hours) →</text>
        <text x={10} y={PAD.t + PLOT_H / 2} fill="#4a5568" fontSize="9" textAnchor="middle" transform={`rotate(-90 10 ${PAD.t + PLOT_H / 2})`}>Mastery gain →</text>

        {/* Pillar dots */}
        {matrix.points.map((pt) => {
          const pillar = PILLARS.find((p) => p.id === pt.pillarId);
          const cx = sx(pt.effort);
          const cy = sy(pt.masteryGain);
          return (
            <g key={pt.pillarId}>
              <title>
                {`${pillar?.name ?? pt.pillarId} — ${QUADRANT_LABELS[pt.quadrant]}\n` +
                  `${pt.effort.toFixed(1)}h effort · +${pt.masteryGain.toFixed(0)} mastery gain · ${pt.currentMastery.toFixed(0)} now`}
              </title>
              <circle cx={cx} cy={cy} r={6} fill={pillar?.color ?? '#2E5FA3'} stroke="#0f1629" strokeWidth={1.5} />
              <text x={cx} y={cy - 9} fill="#e2e8f0" fontSize="8" textAnchor="middle">{pillar?.emoji}</text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1.5 mt-3 text-[10px] text-[#4a5568]">
        <span><span style={{ color: '#16A34A' }}>●</span> Quick Wins — low effort, high gain</span>
        <span><span style={{ color: '#2E5FA3' }}>●</span> Building — high effort, high gain</span>
        <span><span style={{ color: '#DC2626' }}>●</span> Diminishing — high effort, low gain</span>
        <span><span style={{ color: '#4a5568' }}>●</span> Coasting — low effort, low gain</span>
      </div>
    </motion.div>
  );
}
