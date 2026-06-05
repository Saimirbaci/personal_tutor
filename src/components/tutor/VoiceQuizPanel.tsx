import { motion } from 'framer-motion';
import {
  Headphones, Mic, Loader2, Brain, Volume2, X, RotateCcw,
  SkipForward, Check, Play, AlertTriangle,
} from 'lucide-react';
import { PillarId, VoiceQuizState } from '@/data/types';
import { useVoiceQuiz } from '@/hooks/useVoiceQuiz';

interface VoiceQuizPanelProps {
  pillar: PillarId | null;
  onExit: () => void;
}

/** Visual treatment for each loop phase — large, glanceable, hands-free. */
function phaseView(state: VoiceQuizState): { icon: JSX.Element; label: string; sub: string; color: string } {
  switch (state) {
    case 'asking':
      return { icon: <Volume2 size={40} className="animate-pulse" />, label: 'Asking…', sub: 'Listen to the question', color: '#2E5FA3' };
    case 'listening':
      return { icon: <Mic size={40} className="animate-pulse" />, label: 'Listening…', sub: 'Answer out loud, then tap Done', color: '#EF4444' };
    case 'transcribing':
      return { icon: <Loader2 size={40} className="animate-spin" />, label: 'Transcribing…', sub: 'Turning your answer into text', color: '#F59E0B' };
    case 'grading':
      return { icon: <Brain size={40} className="animate-pulse" />, label: 'Thinking…', sub: 'Scoring your answer', color: '#8B5CF6' };
    case 'feedback':
      return { icon: <Volume2 size={40} className="animate-pulse" />, label: 'Feedback', sub: 'Here\'s how you did', color: '#10B981' };
    case 'error':
      return { icon: <AlertTriangle size={40} />, label: 'Voice setup needed', sub: '', color: '#F59E0B' };
    default:
      return { icon: <Headphones size={40} />, label: 'Voice Quiz', sub: 'Hands-free active recall', color: '#C9A84C' };
  }
}

/** Large, accessible control button. */
function BigButton({ onClick, color, children, filled }: {
  onClick: () => void; color: string; children: React.ReactNode; filled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:brightness-110 active:scale-95"
      style={
        filled
          ? { backgroundColor: color, color: '#080d1a' }
          : { color, border: `1px solid ${color}60`, backgroundColor: `${color}12` }
      }
    >
      {children}
    </button>
  );
}

export default function VoiceQuizPanel({ pillar, onExit }: VoiceQuizPanelProps) {
  const {
    voiceQuizState, question, transcript, verdict, error,
    autoAdvance, setAutoAdvance,
    start, stop, submitAnswer, repeatQuestion, skipQuestion,
  } = useVoiceQuiz(pillar);

  const view = phaseView(voiceQuizState);
  const isIdle = voiceQuizState === 'idle';
  const isError = voiceQuizState === 'error';
  const isListening = voiceQuizState === 'listening';
  const isBusy = !isIdle && !isError && !isListening; // asking/transcribing/grading/feedback

  const handleExit = () => { stop(); onExit(); };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#080d1a]/95 backdrop-blur-sm px-6"
    >
      {/* Exit */}
      <button
        onClick={handleExit}
        title="Exit Voice Quiz Mode"
        className="absolute top-3 right-3 p-2 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
      >
        <X size={18} />
      </button>

      {/* Phase indicator */}
      <motion.div
        key={voiceQuizState}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-3"
        style={{ color: view.color }}
      >
        <div
          className="flex items-center justify-center w-24 h-24 rounded-full"
          style={{ backgroundColor: `${view.color}1A`, border: `2px solid ${view.color}40` }}
        >
          {view.icon}
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">{view.label}</p>
          {view.sub && <p className="text-xs text-[#4a5568] mt-0.5">{view.sub}</p>}
        </div>
      </motion.div>

      {/* Question / transcript / verdict — optional glancing, fully usable by ear */}
      <div className="w-full max-w-md flex flex-col gap-3 text-center">
        {question && !isError && (
          <p className="text-sm text-[#e2e8f0] leading-relaxed">{question}</p>
        )}
        {transcript && (
          <p className="text-xs text-[#4a5568] italic">You said: “{transcript}”</p>
        )}
        {verdict && voiceQuizState === 'feedback' && (
          <p className="text-xs text-[#10B981]">{verdict}</p>
        )}
        {isError && error && (
          <p className="text-sm text-[#F59E0B] leading-relaxed">{error}</p>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {(isIdle || isError) && (
            <BigButton onClick={start} color="#C9A84C" filled>
              <Play size={16} />
              {verdict ? 'Ask another' : 'Start quiz'}
            </BigButton>
          )}

          {isListening && (
            <>
              <BigButton onClick={submitAnswer} color="#10B981" filled>
                <Check size={16} />
                Done answering
              </BigButton>
              <BigButton onClick={repeatQuestion} color="#2E5FA3">
                <RotateCcw size={15} />
                Repeat
              </BigButton>
              <BigButton onClick={skipQuestion} color="#4a5568">
                <SkipForward size={15} />
                Skip
              </BigButton>
            </>
          )}

          {isBusy && (
            <BigButton onClick={stop} color="#4a5568">
              <X size={15} />
              Stop
            </BigButton>
          )}
        </div>

        {/* Auto-advance preference (session-only) */}
        <button
          onClick={() => setAutoAdvance(!autoAdvance)}
          className="flex items-center gap-2 text-[11px] text-[#4a5568] hover:text-[#e2e8f0] transition-colors"
        >
          <span
            className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${autoAdvance ? 'bg-[#C9A84C]/60' : 'bg-[#1a2540]'}`}
          >
            <span
              className={`w-3 h-3 rounded-full bg-[#e2e8f0] transition-transform ${autoAdvance ? 'translate-x-4' : ''}`}
            />
          </span>
          Auto-advance to the next question
        </button>
      </div>
    </motion.div>
  );
}
