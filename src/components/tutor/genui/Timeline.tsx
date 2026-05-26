import { motion } from 'framer-motion';
import { CheckCircle2, Circle } from 'lucide-react';
import { PillarId } from '@/data/types';
import { pillarColor } from '@/lib/utils';

interface TimelineEvent {
  label: string;
  description: string;
  done: boolean;
}

interface TimelineProps {
  data: { events: TimelineEvent[] };
  pillar?: PillarId | null;
}

export default function Timeline({ data, pillar }: TimelineProps) {
  const color = pillar ? pillarColor(pillar) : '#2E5FA3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color }}>
        Timeline
      </p>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-[#1a2540]" />

        <div className="space-y-0">
          {data.events.map((event, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: i * 0.07 }}
              className="relative flex gap-4 pb-4 last:pb-0"
            >
              {/* Dot */}
              <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center relative z-10">
                {event.done ? (
                  <CheckCircle2
                    size={18}
                    style={{ color }}
                    className="bg-[#0f1629]"
                  />
                ) : (
                  <Circle
                    size={18}
                    className="text-[#1a2540] bg-[#0f1629]"
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-1">
                <p
                  className="text-sm font-semibold leading-tight"
                  style={{ color: event.done ? color : '#e2e8f0' }}
                >
                  {event.label}
                </p>
                <p className="text-xs text-[#4a5568] mt-1 leading-relaxed">
                  {event.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
