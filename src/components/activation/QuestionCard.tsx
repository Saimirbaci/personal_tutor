import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';
import { ActivationQuestion } from '@/data/types';

interface QuestionCardProps {
  question: ActivationQuestion;
  accent: string;
  /** Called once the learner has answered/graded this question. */
  onAnswer: (correct: boolean) => void;
}

/**
 * Renders a single activation question. Multiple-choice questions (with `options`)
 * are auto-graded against `correctIndex`; option-less queue questions are presented
 * as self-graded active-recall prompts. Visual style mirrors the Quiz GenUI renderer.
 */
export default function QuestionCard({ question, accent, onAnswer }: QuestionCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const isMultipleChoice = !!question.options && question.correctIndex != null;
  const answered = isMultipleChoice ? selected !== null : revealed;

  const handleSelect = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
    onAnswer(i === question.correctIndex);
  };

  const optionStyle = (i: number) => {
    if (selected === null) {
      return 'border-[#1a2540] text-[#e2e8f0] hover:border-opacity-60 hover:bg-[#1a2540]';
    }
    if (i === question.correctIndex) return 'border-green-500 bg-green-500/10 text-green-400';
    if (i === selected) return 'border-red-500 bg-red-500/10 text-red-400';
    return 'border-[#1a2540] text-[#4a5568] opacity-50';
  };

  return (
    <div className="space-y-4">
      <p className="text-lg text-[#e2e8f0] font-medium leading-relaxed">{question.prompt}</p>

      {isMultipleChoice ? (
        <div className="space-y-2">
          {question.options!.map((option, i) => (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={selected !== null}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center justify-between gap-3 ${optionStyle(i)}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full border text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                {option}
              </span>
              {answered && i === question.correctIndex && (
                <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
              )}
              {answered && i === selected && i !== question.correctIndex && (
                <XCircle size={16} className="text-red-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {revealed && question.answer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed border text-[#e2e8f0]/90"
                  style={{ borderColor: accent + '40', backgroundColor: accent + '0d' }}
                >
                  <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: accent }}>
                    Answer
                  </p>
                  {question.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#1a2540] text-sm font-semibold text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
            >
              <Eye size={15} />
              {question.answer ? 'Reveal answer' : 'I have it — grade myself'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => onAnswer(true)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-green-400 bg-green-400/10 hover:bg-green-400/20 border border-green-400/20 transition-all"
              >
                <CheckCircle2 size={15} />
                Got it
              </button>
              <button
                onClick={() => onAnswer(false)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-orange-400 bg-orange-400/10 hover:bg-orange-400/20 border border-orange-400/20 transition-all"
              >
                <XCircle size={15} />
                Missed it
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
