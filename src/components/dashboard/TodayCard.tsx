import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Play, Clock, Headphones } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { PillarId, ScheduleBlock, TodaySchedule } from '@/data/types';
import { cn } from '@/lib/utils';
import AudioLessonPlayer from './AudioLessonPlayer';

interface TodayCardProps {
  schedule: TodaySchedule;
  currentBlock: ScheduleBlock | null;
}

export default function TodayCard({ schedule, currentBlock }: TodayCardProps) {
  const { setView } = useAppStore();
  const navigate = useNavigate();
  const [listenBlock, setListenBlock] = useState<ScheduleBlock | null>(null);

  const handleStart = (_block: ScheduleBlock) => {
    setView('tutor');
    navigate('/tutor');
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#e2e8f0]">
          Today — {schedule.day_name}
        </h2>
        <span className="text-xs text-[#4a5568] font-mono">Week {schedule.week_number}</span>
      </div>

      <AnimatePresence>
        {listenBlock && (
          <div className="mb-4">
            <AudioLessonPlayer
              pillar={listenBlock.pillar as PillarId}
              topic={listenBlock.topic}
              color={listenBlock.color}
              onClose={() => setListenBlock(null)}
            />
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {schedule.blocks.map((block) => {
          const isActive =
            currentBlock?.pillar === block.pillar &&
            currentBlock?.time_label === block.time_label;

          return (
            <div
              key={`${block.pillar}-${block.time_label}`}
              className={cn(
                'relative rounded-lg p-4 border transition-all duration-200 cursor-pointer group',
                isActive
                  ? 'border-opacity-60 bg-opacity-10'
                  : 'border-[#1a2540] bg-[#080d1a] hover:border-opacity-40'
              )}
              style={
                isActive
                  ? {
                      borderColor: block.color,
                      backgroundColor: block.color + '12',
                    }
                  : {}
              }
              onClick={() => handleStart(block)}
            >
              {isActive && (
                <div
                  className="absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: block.color }}
                />
              )}

              <div className="flex items-start gap-2 mb-2">
                <span className="text-lg leading-none">{block.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-semibold capitalize leading-tight"
                    style={{ color: block.color }}
                  >
                    {block.pillar}
                  </p>
                  <p className="text-[10px] text-[#4a5568] flex items-center gap-1 mt-0.5">
                    <Clock size={9} />
                    {block.time_label}
                  </p>
                </div>
              </div>

              <p className="text-xs text-[#e2e8f0] leading-snug line-clamp-2 mb-3">
                {block.topic}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#4a5568]">
                  {block.duration_min} min
                </span>
                <div className="flex items-center gap-1">
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-[#94a3b8] border border-[#1a2540] hover:text-[#e2e8f0]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setListenBlock(block);
                    }}
                    title="Generate a podcast-style audio lesson"
                  >
                    <Headphones size={8} />
                    Listen
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: block.color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStart(block);
                    }}
                  >
                    <Play size={8} />
                    Start
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
