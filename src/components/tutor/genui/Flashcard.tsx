import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, CheckCircle2, RefreshCw } from 'lucide-react';
import { PillarId } from '@/data/types';
import { pillarColor } from '@/lib/utils';

interface FlashcardProps {
  data: { question: string; answer: string };
  pillar?: PillarId | null;
}

export default function Flashcard({ data, pillar }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<'idle' | 'got-it' | 'review'>('idle');
  const color = pillar ? pillarColor(pillar) : '#2E5FA3';

  const handleGotIt = () => {
    setStatus('got-it');
    setFlipped(false);
  };

  const handleReview = () => {
    setStatus('review');
    setFlipped(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: color + '40' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b text-xs font-semibold"
        style={{
          backgroundColor: color + '15',
          borderColor: color + '30',
          color,
        }}
      >
        <span>FLASHCARD</span>
        <button
          onClick={() => { setFlipped(false); setStatus('idle'); }}
          className="opacity-60 hover:opacity-100 transition-opacity"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Card area */}
      <div
        className="relative min-h-[140px] cursor-pointer select-none bg-[#0f1629] perspective-1000"
        onClick={() => setFlipped(!flipped)}
        style={{ perspective: '1000px' }}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          style={{ transformStyle: 'preserve-3d' }}
          className="relative w-full h-full min-h-[140px]"
        >
          {/* Front — Question */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-6"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <p className="text-[10px] uppercase tracking-widest text-[#4a5568] mb-3">Question</p>
            <p className="text-sm text-[#e2e8f0] text-center leading-relaxed">{data.question}</p>
            <p className="text-[10px] text-[#4a5568] mt-4">Click to reveal answer</p>
          </div>

          {/* Back — Answer */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-6"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              backgroundColor: color + '08',
            }}
          >
            <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color }}>Answer</p>
            <p className="text-sm text-[#e2e8f0] text-center leading-relaxed whitespace-pre-wrap">
              {data.answer}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Actions (shown after flip) */}
      {flipped && status === 'idle' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-2 px-4 py-3 bg-[#0f1629] border-t border-[#1a2540]"
        >
          <button
            onClick={handleGotIt}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-green-400 bg-green-400/10 hover:bg-green-400/20 border border-green-400/20 transition-all"
          >
            <CheckCircle2 size={13} />
            Got it ✓
          </button>
          <button
            onClick={handleReview}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-orange-400 bg-orange-400/10 hover:bg-orange-400/20 border border-orange-400/20 transition-all"
          >
            <RefreshCw size={13} />
            Review again
          </button>
        </motion.div>
      )}

      {/* Status badge */}
      {status !== 'idle' && (
        <div
          className={`px-4 py-2 text-center text-xs font-semibold border-t border-[#1a2540] ${
            status === 'got-it' ? 'text-green-400' : 'text-orange-400'
          }`}
        >
          {status === 'got-it' ? '✓ Marked as learned' : '↺ Queued for review'}
        </div>
      )}
    </motion.div>
  );
}
