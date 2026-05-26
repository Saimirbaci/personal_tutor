import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PillarId } from '@/data/types';
import { pillarColor } from '@/lib/utils';

interface QuizProps {
  data: {
    question: string;
    options: string[];
    correct: number;
    explanation?: string;
  };
  pillar?: PillarId | null;
}

export default function Quiz({ data, pillar }: QuizProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const color = pillar ? pillarColor(pillar) : '#2E5FA3';
  const answered = selected !== null;
  const isCorrect = selected === data.correct;

  const optionStyle = (i: number) => {
    if (!answered) {
      return 'border-[#1a2540] text-[#e2e8f0] hover:border-opacity-60 hover:bg-[#1a2540]';
    }
    if (i === data.correct) {
      return 'border-green-500 bg-green-500/10 text-green-400';
    }
    if (i === selected) {
      return 'border-red-500 bg-red-500/10 text-red-400';
    }
    return 'border-[#1a2540] text-[#4a5568] opacity-50';
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
        className="px-4 py-2.5 border-b text-xs font-semibold"
        style={{
          backgroundColor: color + '15',
          borderColor: color + '30',
          color,
        }}
      >
        QUIZ
      </div>

      <div className="bg-[#0f1629] p-4 space-y-3">
        <p className="text-sm text-[#e2e8f0] font-medium leading-relaxed">{data.question}</p>

        <div className="space-y-2">
          {data.options.map((option, i) => (
            <button
              key={i}
              onClick={() => !answered && setSelected(i)}
              disabled={answered}
              className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all flex items-center justify-between gap-3 ${optionStyle(i)}`}
            >
              <span className="flex items-center gap-3">
                <span
                  className="w-5 h-5 rounded-full border text-xs font-bold flex items-center justify-center flex-shrink-0"
                  style={
                    answered && i === data.correct
                      ? { borderColor: '#22c55e', color: '#22c55e' }
                      : answered && i === selected
                      ? { borderColor: '#ef4444', color: '#ef4444' }
                      : { borderColor: 'currentColor' }
                  }
                >
                  {String.fromCharCode(65 + i)}
                </span>
                {option}
              </span>
              {answered && i === data.correct && (
                <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
              )}
              {answered && i === selected && i !== data.correct && (
                <XCircle size={16} className="text-red-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {answered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="overflow-hidden"
            >
              <div
                className={`rounded-xl p-3 text-xs leading-relaxed border ${
                  isCorrect
                    ? 'border-green-500/30 bg-green-500/8 text-green-300'
                    : 'border-red-500/30 bg-red-500/8 text-red-300'
                }`}
              >
                <p className="font-semibold mb-1">
                  {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                </p>
                {data.explanation && (
                  <p className="text-[#e2e8f0]/80">{data.explanation}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
