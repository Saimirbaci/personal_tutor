import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { PillarId } from '@/data/types';
import { pillarColor } from '@/lib/utils';

interface KeyInsightProps {
  text: string;
  pillar?: PillarId | null;
}

export default function KeyInsight({ text, pillar }: KeyInsightProps) {
  const color = pillar ? pillarColor(pillar) : '#C9A84C';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-4 flex gap-3"
      style={{
        borderColor: color + '40',
        backgroundColor: color + '0C',
      }}
    >
      <Lightbulb
        size={18}
        className="flex-shrink-0 mt-0.5"
        style={{ color }}
      />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color }}>
          Key Insight
        </p>
        <p className="text-sm text-[#e2e8f0] leading-relaxed">{text}</p>
      </div>
    </motion.div>
  );
}
