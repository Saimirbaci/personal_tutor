import { useEffect, useState } from 'react';
import { Scale, Check, X, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { usePlanRebalance } from '@/hooks/usePlanRebalance';
import { usePlan } from '@/hooks/usePlan';
import { getPillarById } from '@/lib/utils';
import { PillarAdjustment, PillarStatus, PlanAdjustment } from '@/data/types';
import MarkdownContent from '@/components/tutor/MarkdownContent';

const STATUS_META: Record<PillarStatus, { label: string; className: string }> = {
  ahead: { label: 'Ahead', className: 'bg-green-950/40 text-green-300 border-green-800/40' },
  behind: { label: 'Behind', className: 'bg-red-950/40 text-red-300 border-red-800/40' },
  on_track: { label: 'On track', className: 'bg-[#1a2540] text-[#4a5568] border-[#1a2540]' },
};

function formatDelta(minutes: number): string {
  if (minutes === 0) return '—';
  return `${minutes > 0 ? '+' : ''}${minutes} min`;
}

function AdjustmentRow({ adj }: { adj: PillarAdjustment }) {
  const pillar = getPillarById(adj.pillar);
  const meta = STATUS_META[adj.status];
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-base flex-shrink-0">{pillar.emoji}</span>
      <span className="text-xs text-[#e2e8f0] flex-1 min-w-0 truncate">{pillar.name}</span>
      <span className="text-[10px] font-mono text-[#4a5568] w-20 text-right">
        {adj.actualHours.toFixed(1)} / {adj.plannedHours.toFixed(1)}h
      </span>
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border w-16 text-center ${meta.className}`}>
        {meta.label}
      </span>
      <span
        className={`text-[10px] font-mono w-16 text-right ${
          adj.recommendedMinutesDelta > 0
            ? 'text-green-400'
            : adj.recommendedMinutesDelta < 0
            ? 'text-amber-400'
            : 'text-[#4a5568]'
        }`}
      >
        {formatDelta(adj.recommendedMinutesDelta)}
      </span>
    </div>
  );
}

export default function PlanRebalanceCard() {
  const { planAdjustments, loadAdjustments, generate, apply, dismiss } = usePlanRebalance();
  const { loadSchedule } = usePlan();
  const [busy, setBusy] = useState<'generate' | 'apply' | 'dismiss' | null>(null);

  useEffect(() => {
    loadAdjustments();
  }, [loadAdjustments]);

  // Surface the most recent non-dismissed proposal.
  const proposal: PlanAdjustment | undefined = (planAdjustments ?? []).find(
    (a) => a.status !== 'dismissed'
  );

  const handleGenerate = async () => {
    setBusy('generate');
    await generate();
    setBusy(null);
  };

  const handleApply = async (weekStart: string) => {
    setBusy('apply');
    await apply(weekStart);
    await loadSchedule(); // reconcile so the reweighted schedule is visible
    setBusy(null);
  };

  const handleDismiss = async (weekStart: string) => {
    setBusy('dismiss');
    await dismiss(weekStart);
    setBusy(null);
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale size={15} className="text-[#7C3AED]" />
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Weekly Plan Rebalance</h2>
        </div>
        <button
          onClick={handleGenerate}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-xs text-[#4a5568] hover:text-[#7C3AED] transition-colors disabled:opacity-40"
        >
          {busy === 'generate' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {proposal ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {!proposal ? (
        <p className="text-xs text-[#4a5568]">
          No rebalance proposal yet. It's generated automatically each Sunday — or generate one now to compare
          your planned vs. completed hours and reweight the remaining weeks.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#4a5568] font-mono">
              Week {proposal.weekNumber} · {proposal.weekStart}
            </span>
            {proposal.status === 'applied' && (
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-green-950/40 text-green-300 border border-green-800/40">
                <CheckCircle2 size={10} /> Applied — schedule reweighted
              </span>
            )}
          </div>

          <div className="text-xs text-[#cbd5e1]">
            <MarkdownContent content={proposal.rationale} size="sm" />
          </div>

          <div className="rounded-lg bg-[#080d1a] border border-[#1a2540] px-3 py-1.5 divide-y divide-[#1a2540]/60">
            {proposal.adjustments.map((adj) => (
              <AdjustmentRow key={adj.pillar} adj={adj} />
            ))}
          </div>

          {proposal.status !== 'applied' && (
            <div className="flex gap-2">
              <button
                onClick={() => handleApply(proposal.weekStart)}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C3AED] text-xs font-semibold text-white hover:bg-[#8b4ff5] transition-all disabled:opacity-50"
              >
                {busy === 'apply' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Apply reweight
              </button>
              <button
                onClick={() => handleDismiss(proposal.weekStart)}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#1a2540] text-xs text-[#4a5568] hover:text-[#e2e8f0] hover:border-[#4a5568] transition-all disabled:opacity-50"
              >
                <X size={13} />
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
