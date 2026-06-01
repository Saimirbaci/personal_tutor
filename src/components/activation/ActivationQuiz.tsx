import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Loader2, ArrowRight, SkipForward } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useActivationQuiz, gradeToQuality } from '@/hooks/useActivationQuiz';
import { pillarColor } from '@/lib/utils';
import { ActivationQuestion, ActivationResult } from '@/data/types';
import QuestionCard from './QuestionCard';

type Phase = 'loading' | 'active' | 'done';

/**
 * Lightweight interstitial shown between "Jump In" and the tutor. Quizzes the learner
 * on the previous session's material (active recall) and grades answers back into SM-2.
 * Skips itself with no flicker when there is nothing to recall.
 */
export default function ActivationQuiz() {
  const pendingSessionPillar = useAppStore((s) => s.pendingSessionPillar);
  const length = useAppStore((s) => s.activationQuizLength);
  const completeActivation = useAppStore((s) => s.completeActivation);
  const { loadQuiz, submitResults } = useActivationQuiz();

  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<ActivationQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ActivationResult[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const loadedRef = useRef(false);

  // Load once on mount; empty quizzes short-circuit straight to the tutor.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    (async () => {
      let qs: ActivationQuestion[] = [];
      try {
        const quiz = await loadQuiz(pendingSessionPillar, length);
        qs = quiz.questions;
      } catch (err) {
        console.error('Failed to load activation quiz:', err);
      }
      if (cancelled) return;
      if (qs.length === 0) {
        completeActivation();
        return;
      }
      setQuestions(qs);
      setPhase('active');
    })();
    return () => { cancelled = true; };
  }, [loadQuiz, pendingSessionPillar, length, completeActivation]);

  const accent = pendingSessionPillar ? pillarColor(pendingSessionPillar) : '#2E5FA3';

  const handleAnswer = (correct: boolean) => {
    if (transitioning) return;
    const q = questions[index];
    const result: ActivationResult = {
      itemId: q.itemId ?? '',
      itemType: q.itemType,
      pillar: q.pillar,
      content: q.prompt,
      quality: gradeToQuality(correct),
    };
    setResults((prev) => [...prev, result]);
    setTransitioning(true);
    window.setTimeout(() => {
      if (index + 1 >= questions.length) setPhase('done');
      else setIndex((i) => i + 1);
      setTransitioning(false);
    }, 600);
  };

  const handleStartSession = async () => {
    await submitResults(results);
    completeActivation();
  };

  const handleSkip = () => completeActivation();

  // Loading / empty short-circuit — render a minimal placeholder (no question flash).
  if (phase === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-[#080d1a]">
        <Loader2 size={20} className="animate-spin text-[#4a5568]" />
      </div>
    );
  }

  const correctCount = results.filter((r) => r.quality >= 3).length;

  return (
    <div className="h-full overflow-y-auto bg-[#080d1a]">
      <div className="max-w-2xl mx-auto px-6 py-10 min-h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Brain size={18} style={{ color: accent }} />
            <h1 className="text-sm font-semibold text-[#e2e8f0]">Warm-up · Active Recall</h1>
          </div>
          {phase === 'active' && (
            <button
              onClick={handleSkip}
              className="flex items-center gap-1.5 text-xs text-[#4a5568] hover:text-[#e2e8f0] transition-colors"
            >
              <SkipForward size={13} />
              Skip
            </button>
          )}
        </div>

        {phase === 'active' && (
          <>
            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs text-[#4a5568] mb-2">
                <span>Question {index + 1} of {questions.length}</span>
                <span>Recall before you learn — it makes new material stick.</span>
              </div>
              <div className="h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: accent }}
                  animate={{ width: `${((index) / questions.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Question */}
            <div className="flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={questions[index].id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <QuestionCard
                    question={questions[index]}
                    accent={accent}
                    onAnswer={handleAnswer}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}

        {phase === 'done' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center text-center gap-5"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: accent + '20' }}
            >
              <Brain size={28} style={{ color: accent }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#e2e8f0]">Warm-up complete</h2>
              <p className="text-sm text-[#4a5568] mt-1">
                You recalled {correctCount} of {results.length}. Your review schedule is updated.
              </p>
            </div>
            <button
              onClick={handleStartSession}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: accent }}
            >
              Start Session
              <ArrowRight size={16} />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
