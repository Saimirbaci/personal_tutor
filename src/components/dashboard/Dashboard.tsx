import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { usePlan } from '@/hooks/usePlan';
import { useMobile } from '@/hooks/useMobile';
import { getGreeting, getWeekNumber } from '@/lib/utils';
import TodayCard from './TodayCard';
import PillarProgress from './PillarProgress';
import StreakWidget from './StreakWidget';
import ReviewWidget from './ReviewWidget';

export default function Dashboard() {
  const { currentBlock, todaySchedule } = usePlan();
  const { setView } = useAppStore();
  const navigate = useNavigate();
  const greeting = getGreeting();
  const week = getWeekNumber();
  const isMobile = useMobile();

  const handleJumpIn = () => {
    if (currentBlock) {
      setView('tutor');
      navigate('/tutor');
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={isMobile ? 'flex flex-col gap-3' : 'flex items-start justify-between'}
        >
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#e2e8f0]">
              {greeting}, <span style={{ color: '#C9A84C' }}>Saimir</span>
            </h1>
            <p className="text-sm text-[#4a5568] mt-1">
              Week {week} of 12 · Sprint started June 1, 2026
            </p>
          </div>

          {currentBlock && (
            <button
              onClick={handleJumpIn}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:scale-105 active:scale-95 self-start"
              style={{ backgroundColor: currentBlock.color }}
            >
              <Zap size={16} />
              Jump In — {currentBlock.emoji} {currentBlock.pillar.charAt(0).toUpperCase() + currentBlock.pillar.slice(1)}
            </button>
          )}
        </motion.div>

        {/* Today's schedule */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          {todaySchedule ? (
            <TodayCard schedule={todaySchedule} currentBlock={currentBlock} />
          ) : (
            <div className="h-40 rounded-xl bg-[#0f1629] border border-[#1a2540] animate-pulse" />
          )}
        </motion.div>

        {/* Due reviews (spaced repetition) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
        >
          <ReviewWidget />
        </motion.div>

        {/* Pillar progress row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <PillarProgress />
        </motion.div>

        {/* Streak widget */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <StreakWidget />
        </motion.div>
      </div>
    </div>
  );
}
