import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronRight, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useKnowledgeGaps } from '@/hooks/useKnowledgeGaps';
import { PILLARS } from '@/data/plan';
import { GapSignalKind, KnowledgeGap } from '@/data/types';

const SIGNAL_LABELS: Record<GapSignalKind, string> = {
  weak_quiz: 'Quiz misses',
  low_ease: 'Hard to retain',
  shallow_chat: 'Shallow chat',
  stale: 'Stalled',
};

function severityLabel(severity: number): { label: string; color: string } {
  if (severity >= 0.66) return { label: 'High', color: '#DC2626' };
  if (severity >= 0.33) return { label: 'Medium', color: '#CA8A04' };
  return { label: 'Low', color: '#4a5568' };
}

export default function NeedsAttention() {
  const { knowledgeGaps, dismissGap } = useKnowledgeGaps();
  const setView = useAppStore((s) => s.setView);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const navigate = useNavigate();

  const gaps = (knowledgeGaps ?? []).filter((g) => g.status === 'open');
  if (gaps.length === 0) return null;

  const handleDrill = (gap: KnowledgeGap) => {
    const pillar = PILLARS.find((p) => p.id === gap.pillar);
    const pillarName = pillar?.name ?? gap.pillar;
    const topic = gap.topicKey === '_pillar' ? `the ${pillarName} area` : `"${gap.label}"`;
    setPendingPrompt(
      `I keep struggling with ${topic}. Run a short, targeted drill: quiz me with two ` +
        `questions and a flashcard to close this gap, then explain what I'm missing.`
    );
    setView('tutor', gap.pillar);
    navigate('/tutor');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} style={{ color: '#CA8A04' }} />
        <h2 className="text-sm font-semibold text-[#e2e8f0]">Needs attention</h2>
        <span className="text-xs text-[#4a5568]">{gaps.length} weak {gaps.length === 1 ? 'area' : 'areas'}</span>
      </div>

      <div className="space-y-2.5">
        {gaps.map((gap, i) => {
          const pillar = PILLARS.find((p) => p.id === gap.pillar);
          const sev = severityLabel(gap.severity);
          const kinds = Array.from(new Set(gap.signals.map((s) => s.kind)));

          return (
            <motion.div
              key={gap.gapId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.04 }}
              className="flex items-start gap-3 p-3 rounded-lg bg-[#080d1a] border border-[#1a2540]"
            >
              <span className="text-lg leading-none mt-0.5" title={pillar?.name}>
                {pillar?.emoji ?? '•'}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: sev.color + '20', color: sev.color }}
                  >
                    {sev.label}
                  </span>
                  <span className="text-xs font-medium text-[#e2e8f0] truncate">{gap.label}</span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {kinds.map((kind) => (
                    <span
                      key={kind}
                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#1a2540] text-[#94a3b8]"
                    >
                      {SIGNAL_LABELS[kind]}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleDrill(gap)}
                  className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ color: pillar?.color ?? '#2E5FA3' }}
                >
                  Start drill
                  <ChevronRight size={13} />
                </button>
              </div>

              <button
                onClick={() => dismissGap(gap.gapId, 7)}
                title="Snooze for 7 days"
                className="text-[#4a5568] hover:text-[#94a3b8] transition-colors mt-0.5"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
