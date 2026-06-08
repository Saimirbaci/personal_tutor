import { useNavigate } from 'react-router-dom';
import { HeartPulse, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useProgress } from '@/hooks/useProgress';

/**
 * Shown when a single missed day broke the streak but a partial recovery is
 * available. Offers a short catch-up session that restores the streak to a
 * partial value instead of a hard zero-reset. The "Start catch-up" CTA seeds
 * the one-shot `pendingPrompt` (the existing drift-catch-up handoff) and lands
 * the user in the tutor; completing the seeded session restores the streak.
 */
export default function RecoveryBanner() {
  const streakState = useAppStore((s) => s.streakState);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const setView = useAppStore((s) => s.setView);
  const { startRecovery } = useProgress();
  const navigate = useNavigate();

  if (streakState?.status !== 'recovery' || !streakState.recovery) return null;
  const { priorStreak, restoreTo } = streakState.recovery;

  const handleStart = async () => {
    const seed = await startRecovery();
    if (seed) {
      setPendingPrompt(seed, true);
      setView('tutor');
      navigate('/tutor');
    }
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-cyan-800/40 p-5">
      <div className="flex items-center gap-2 mb-1">
        <HeartPulse size={15} className="text-cyan-400" />
        <h2 className="text-sm font-semibold text-[#e2e8f0]">Recover your streak</h2>
        <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-full">
          was {priorStreak} days
        </span>
      </div>
      <p className="text-xs text-[#4a5568] mb-4">
        You missed a day, but you don't have to start over. Do a short catch-up session and
        we'll restore your streak to{' '}
        <span className="text-cyan-300 font-semibold">{restoreTo} day{restoreTo !== 1 ? 's' : ''}</span>.
      </p>
      <button
        onClick={handleStart}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-700 hover:bg-cyan-600 transition-all hover:scale-105 active:scale-95"
      >
        Start catch-up
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
