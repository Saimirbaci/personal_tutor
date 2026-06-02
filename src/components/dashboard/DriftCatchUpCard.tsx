import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useDrift } from '@/hooks/useDrift';
import { getPillarById } from '@/lib/utils';
import { PillarDrift } from '@/data/types';

/** Builds a forward-looking catch-up drill prompt for the tutor. */
function catchUpPrompt(d: PillarDrift, pillarName: string): string {
  const gap =
    d.daysSinceActivity == null
      ? `I haven't started ${pillarName} yet`
      : `I haven't touched ${pillarName} in ${d.daysSinceActivity} days`;
  return `${gap}. Give me a focused 30-minute catch-up session: a quick recap of where I should be this week, then a drill or two to get me back on track.`;
}

function severityLabel(d: PillarDrift): { text: string; className: string } {
  if (d.daysSinceActivity == null) {
    return { text: 'Not started', className: 'bg-red-950/40 text-red-300 border-red-800/40' };
  }
  if (d.severity >= 2) {
    return { text: `${d.daysSinceActivity}d idle`, className: 'bg-red-950/40 text-red-300 border-red-800/40' };
  }
  return { text: `${d.daysSinceActivity}d idle`, className: 'bg-amber-950/40 text-amber-300 border-amber-800/40' };
}

export default function DriftCatchUpCard() {
  const { pillarDrift } = useDrift();
  const setView = useAppStore((s) => s.setView);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const navigate = useNavigate();

  const drifted = pillarDrift?.drifted ?? [];
  if (drifted.length === 0) return null;

  const handleCatchUp = (d: PillarDrift) => {
    const pillar = getPillarById(d.pillar);
    setPendingPrompt(catchUpPrompt(d, pillar.name));
    setView('tutor', d.pillar);
    navigate('/tutor');
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-amber-800/30 p-5">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={15} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-[#e2e8f0]">Time to catch up</h2>
        <span className="text-[10px] text-[#4a5568] font-mono bg-[#1a2540] px-2 py-0.5 rounded-full">
          {drifted.length} pillar{drifted.length !== 1 ? 's' : ''} drifting
        </span>
      </div>
      <p className="text-xs text-[#4a5568] mb-4">
        These pillars are part of your plan but haven't seen activity lately. A short session keeps you on pace.
      </p>

      <div className="space-y-2">
        {drifted.map((d) => {
          const pillar = getPillarById(d.pillar);
          const sev = severityLabel(d);
          return (
            <div
              key={d.pillar}
              className="flex items-center gap-3 p-3 rounded-lg bg-[#080d1a] border border-[#1a2540]"
            >
              <span className="text-lg flex-shrink-0">{pillar.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-[#e2e8f0] truncate">{pillar.name}</p>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${sev.className}`}>
                    {sev.text}
                  </span>
                </div>
                <p className="text-[11px] text-[#4a5568] mt-0.5 truncate">{d.suggestion}</p>
              </div>
              <button
                onClick={() => handleCatchUp(d)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                style={{ backgroundColor: pillar.color }}
              >
                Catch up
                <ArrowRight size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
