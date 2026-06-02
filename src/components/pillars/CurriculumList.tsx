import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Clock, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CurriculumItem, Pillar, PillarId } from '@/data/types';
import { getWeekNumber } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { buildCurriculumItemId } from '@/hooks/useReview';
import MasteryRing from './MasteryRing';

interface CurriculumMonth {
  month: number;
  label: string;
  items: CurriculumItem[];
}

interface CurriculumListProps {
  curriculum: CurriculumMonth[];
  pillar: Pillar;
}

export default function CurriculumList({ curriculum, pillar }: CurriculumListProps) {
  const currentWeek = getWeekNumber();
  const masteryByItem = useAppStore((s) => s.masteryByItem);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1, 2, 3]));
  const [itemStatuses, setItemStatuses] = useState<Record<string, CurriculumItem['status']>>({});

  const toggleMonth = (month: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  const cycleStatus = (key: string, current: CurriculumItem['status']) => {
    const next: Record<CurriculumItem['status'], CurriculumItem['status']> = {
      todo: 'in-progress',
      'in-progress': 'done',
      done: 'todo',
    };
    setItemStatuses((prev) => ({ ...prev, [key]: next[current] }));
  };

  return (
    <div className="space-y-3">
      {curriculum.map((month) => {
        const doneCount = month.items.filter((item) => {
          const key = `${month.month}-${item.week}`;
          const status = itemStatuses[key] ?? item.status;
          return status === 'done';
        }).length;
        const isOpen = expanded.has(month.month);

        return (
          <div
            key={month.month}
            className="rounded-xl bg-[#0f1629] border border-[#1a2540] overflow-hidden"
          >
            {/* Month header */}
            <button
              onClick={() => toggleMonth(month.month)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#1a2540]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? (
                  <ChevronDown size={15} className="text-[#4a5568]" />
                ) : (
                  <ChevronRight size={15} className="text-[#4a5568]" />
                )}
                <div>
                  <span className="text-sm font-semibold text-[#e2e8f0]">
                    Month {month.month} — {month.label}
                  </span>
                  <span className="ml-3 text-xs text-[#4a5568]">
                    {doneCount}/{month.items.length} complete
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="w-24 h-1 bg-[#1a2540] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(doneCount / month.items.length) * 100}%`,
                      backgroundColor: pillar.color,
                    }}
                  />
                </div>
                <span className="text-xs font-mono" style={{ color: pillar.color }}>
                  {Math.round((doneCount / month.items.length) * 100)}%
                </span>
              </div>
            </button>

            {/* Items */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-[#1a2540]"
                >
                  <div className="divide-y divide-[#1a2540]">
                    {month.items.map((item) => {
                      const key = `${month.month}-${item.week}`;
                      const status = itemStatuses[key] ?? item.status;
                      const weekNum = parseInt(item.week.replace('Week ', ''), 10);
                      const isCurrent = weekNum === currentWeek;
                      const itemId = buildCurriculumItemId(pillar.id as PillarId, item.topic);
                      const masteryScore = masteryByItem[itemId] ?? 0;

                      return (
                        <div
                          key={key}
                          className={`flex items-start gap-4 px-5 py-3.5 hover:bg-[#1a2540]/30 transition-colors ${
                            isCurrent ? 'bg-[#1a2540]/20' : ''
                          }`}
                        >
                          {/* Status toggle */}
                          <button
                            onClick={() => cycleStatus(key, status)}
                            className="flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center border transition-all"
                            style={
                              status === 'done'
                                ? { backgroundColor: pillar.color, borderColor: pillar.color }
                                : status === 'in-progress'
                                ? { borderColor: pillar.color }
                                : { borderColor: '#4a5568' }
                            }
                            title="Click to cycle status"
                          >
                            {status === 'done' && <Check size={11} className="text-white" />}
                            {status === 'in-progress' && (
                              <PlayCircle size={11} style={{ color: pillar.color }} />
                            )}
                            {status === 'todo' && <Clock size={11} className="text-[#4a5568]" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span
                                className="text-[10px] font-mono font-semibold"
                                style={{ color: isCurrent ? pillar.color : '#4a5568' }}
                              >
                                {item.week}
                              </span>
                              {isCurrent && (
                                <span
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                                  style={{
                                    backgroundColor: pillar.color + '20',
                                    color: pillar.color,
                                  }}
                                >
                                  Current
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-sm font-medium leading-tight ${
                                status === 'done' ? 'line-through text-[#4a5568]' : 'text-[#e2e8f0]'
                              }`}
                            >
                              {item.topic}
                            </p>
                            <p className="text-xs text-[#4a5568] mt-1 leading-relaxed">
                              {item.resource}
                            </p>
                          </div>

                          {/* Mastery ring */}
                          <MasteryRing score={masteryScore} color={pillar.color} />

                          {/* Status badge */}
                          <span
                            className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={
                              status === 'done'
                                ? { backgroundColor: '#22c55e20', color: '#22c55e' }
                                : status === 'in-progress'
                                ? { backgroundColor: pillar.color + '20', color: pillar.color }
                                : { backgroundColor: '#1a2540', color: '#4a5568' }
                            }
                          >
                            {status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
