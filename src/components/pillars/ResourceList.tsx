import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Resource, Pillar } from '@/data/types';

interface ResourceListProps {
  resources: Resource[];
  pillar: Pillar;
}

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  Book: { bg: '#3b82f620', text: '#60a5fa' },
  Paper: { bg: '#8b5cf620', text: '#a78bfa' },
  Video: { bg: '#ef444420', text: '#f87171' },
  Tool: { bg: '#22c55e20', text: '#4ade80' },
  Course: { bg: '#f59e0b20', text: '#fbbf24' },
  Blog: { bg: '#ec489920', text: '#f472b6' },
  Podcast: { bg: '#06b6d420', text: '#22d3ee' },
};

export default function ResourceList({ resources, pillar }: ResourceListProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {resources.map((resource, i) => {
        const typeStyle = TYPE_STYLES[resource.type] ?? { bg: '#1a254020', text: '#4a5568' };

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-4 flex flex-col gap-3 hover:border-opacity-60 transition-all"
            style={{ '--hover-border': pillar.color } as React.CSSProperties}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
                  >
                    {resource.type}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#e2e8f0] leading-tight">{resource.title}</h3>
              </div>
              {resource.url && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 p-1.5 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            <p className="text-xs text-[#4a5568] leading-relaxed flex-1">
              <span className="font-semibold" style={{ color: pillar.color }}>Why: </span>
              {resource.why}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
