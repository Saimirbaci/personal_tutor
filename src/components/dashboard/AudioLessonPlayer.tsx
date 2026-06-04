import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Headphones, Loader2, X, AlertCircle } from 'lucide-react';
import { useListenMode } from '@/hooks/useListenMode';
import { PillarId } from '@/data/types';

interface AudioLessonPlayerProps {
  pillar: PillarId;
  topic: string;
  color: string;
  onClose: () => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generates and plays a podcast-style audio lesson for a single pillar/topic.
 * Self-contained: the generate button, live progress, native audio controls,
 * and graceful error display all live here.
 */
export default function AudioLessonPlayer({ pillar, topic, color, onClose }: AudioLessonPlayerProps) {
  const { generate, isGenerating, lesson, audioUrl, progress, error } = useListenMode();

  // Kick off generation as soon as the player opens.
  useEffect(() => {
    void generate(pillar, topic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillar, topic]);

  const progressLabel = progress
    ? progress.stage === 'synthesizing'
      ? `Synthesizing audio ${progress.current}/${progress.total}…`
      : 'Writing your lesson script…'
    : 'Preparing…';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Headphones size={16} style={{ color }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#e2e8f0] capitalize leading-tight">
              {pillar} — Listen Mode
            </p>
            <p className="text-xs text-[#4a5568] line-clamp-1">{topic}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#4a5568] hover:text-[#e2e8f0] transition-colors shrink-0"
          aria-label="Close audio lesson"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[#2a1416] border border-[#5a2326] px-3 py-2.5 text-xs text-[#f0a0a0]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && isGenerating && (
        <div className="flex items-center gap-3 py-3">
          <Loader2 size={18} className="animate-spin" style={{ color }} />
          <div className="min-w-0">
            <p className="text-xs text-[#e2e8f0]">{progressLabel}</p>
            <p className="text-[10px] text-[#4a5568] mt-0.5">
              Building a fresh 5–10 minute lesson from your progress — this takes a moment.
            </p>
          </div>
        </div>
      )}

      {!error && !isGenerating && lesson && audioUrl && (
        <div className="space-y-3">
          <audio controls autoPlay src={audioUrl} className="w-full">
            Your browser does not support audio playback.
          </audio>
          <div className="flex items-center justify-between text-[10px] font-mono text-[#4a5568]">
            <span>~{formatDuration(lesson.durationEstimateSecs)} min lesson</span>
            <span>{lesson.segmentCount} segment{lesson.segmentCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
