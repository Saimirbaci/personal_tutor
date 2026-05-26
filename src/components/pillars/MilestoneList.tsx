import { motion } from 'framer-motion';
import { Target, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Milestone, Pillar } from '@/data/types';
import { useProgress } from '@/hooks/useProgress';
import { useAppStore } from '@/store/appStore';
import { PillarId } from '@/data/types';

interface MilestoneListProps {
  milestones: Milestone[];
  pillar: Pillar;
}

export default function MilestoneList({ milestones, pillar }: MilestoneListProps) {
  const { updateMilestone } = useProgress();
  const { progress } = useAppStore();

  const getStatus = (month: number): Milestone['status'] => {
    const saved = progress?.milestones?.find(
      (m) => m.pillar === pillar.id && m.month === month
    );
    if (saved) return saved.status as Milestone['status'];
    return milestones.find((m) => m.month === month)?.status ?? 'pending';
  };

  const cycleStatus = async (month: number, current: Milestone['status']) => {
    const next: Record<Milestone['status'], Milestone['status']> = {
      pending: 'in-progress',
      'in-progress': 'complete',
      complete: 'pending',
    };
    await updateMilestone(pillar.id as PillarId, month, next[current]);
  };

  const statusIcon = (status: Milestone['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 size={20} className="text-green-400" />;
      case 'in-progress':
        return <Loader2 size={20} style={{ color: pillar.color }} className="animate-spin" />;
      default:
        return <Clock size={20} className="text-[#4a5568]" />;
    }
  };

  return (
    <div className="space-y-4">
      {milestones.map((milestone, i) => {
        const status = getStatus(milestone.month);

        return (
          <motion.div
            key={milestone.month}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.08 }}
            className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5 hover:border-opacity-60 transition-all"
          >
            <div className="flex items-start gap-4">
              <button
                onClick={() => cycleStatus(milestone.month, status)}
                className="flex-shrink-0 mt-0.5 transition-transform hover:scale-110"
                title="Click to update status"
              >
                {statusIcon(status)}
              </button>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: pillar.color }}
                  >
                    Month {milestone.month} Milestone
                  </span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize"
                    style={
                      status === 'complete'
                        ? { backgroundColor: '#22c55e20', color: '#22c55e' }
                        : status === 'in-progress'
                        ? { backgroundColor: pillar.color + '20', color: pillar.color }
                        : { backgroundColor: '#1a2540', color: '#4a5568' }
                    }
                  >
                    {status.replace('-', ' ')}
                  </span>
                </div>

                <p className="text-sm font-semibold text-[#e2e8f0] leading-tight mb-2">
                  {milestone.description}
                </p>

                <div
                  className="flex items-start gap-2 p-3 rounded-lg text-xs leading-relaxed"
                  style={{
                    backgroundColor: pillar.color + '10',
                    borderLeft: `2px solid ${pillar.color}60`,
                  }}
                >
                  <Target size={12} className="flex-shrink-0 mt-0.5" style={{ color: pillar.color }} />
                  <p className="text-[#4a5568]">
                    <span className="font-semibold" style={{ color: pillar.color }}>Indicator: </span>
                    {milestone.indicator}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
