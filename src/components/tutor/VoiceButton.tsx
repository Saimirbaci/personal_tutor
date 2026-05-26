import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { useVoice, VoiceState } from '@/hooks/useVoice';
import { useAppStore } from '@/store/appStore';

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const { voiceConfig } = useAppStore();
  const { state, error, startRecording, stopRecording } = useVoice();

  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasStartedRef = useRef(false);

  // Cleanup timer on unmount
  useEffect(() => () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); }, []);

  // ── Press-and-hold OR tap-to-toggle ──────────────────────────────────────

  const handlePointerDown = useCallback(async () => {
    if (disabled || state === 'transcribing' || state === 'speaking') return;

    if (state === 'recording') {
      // Second tap → stop
      hasStartedRef.current = false;
      setIsHolding(false);
      const text = await stopRecording();
      if (text) onTranscript(text);
      return;
    }

    setIsHolding(true);
    hasStartedRef.current = true;
    await startRecording();
  }, [disabled, state, startRecording, stopRecording, onTranscript]);

  const handlePointerUp = useCallback(async () => {
    // Only auto-stop if it was a very short tap (< 500 ms means intentional release)
    // For hold-to-talk: release stops recording
    if (!hasStartedRef.current) return;
    if (state !== 'recording') return;

    // Brief tap: keep recording (tap-to-toggle mode, stop on second tap)
    // Treat as hold-to-talk if held for > 300ms
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    setIsHolding(false);
    hasStartedRef.current = false;
    const text = await stopRecording();
    if (text) onTranscript(text);
  }, [state, stopRecording, onTranscript]);

  if (!voiceConfig.enabled) return null;

  const icon = getIcon(state, isHolding);
  const label = getLabel(state);
  const color = getColor(state);

  return (
    <div className="relative flex-shrink-0">
      {/* Error tooltip */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full mb-2 right-0 w-56 px-3 py-2 rounded-lg bg-red-950/80 border border-red-800/50 text-[10px] text-red-300 z-50 pointer-events-none"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording pulse ring */}
      <AnimatePresence>
        {state === 'recording' && (
          <motion.div
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeOut' }}
            className="absolute inset-0 rounded-full bg-red-500 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <motion.button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        whileTap={{ scale: 0.92 }}
        title={label}
        disabled={disabled || state === 'transcribing' || state === 'speaking'}
        className="relative w-8 h-8 flex items-center justify-center rounded-xl transition-all disabled:opacity-40 select-none"
        style={{ backgroundColor: color + '25', border: `1px solid ${color}60`, color }}
      >
        {icon}
      </motion.button>

      {/* State label shown while active */}
      <AnimatePresence>
        {state !== 'idle' && state !== 'error' && (
          <motion.div
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded-md bg-[#0f1629] border border-[#1a2540]"
            style={{ color }}
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getIcon(state: VoiceState, _isHolding: boolean) {
  switch (state) {
    case 'recording':
      return <Mic size={14} className="animate-pulse" />;
    case 'transcribing':
      return <Loader2 size={14} className="animate-spin" />;
    case 'speaking':
      return <Volume2 size={14} className="animate-pulse" />;
    case 'error':
      return <MicOff size={14} />;
    default:
      return <Mic size={14} />;
  }
}

function getLabel(state: VoiceState): string {
  switch (state) {
    case 'recording':    return 'Tap to stop…';
    case 'transcribing': return 'Transcribing…';
    case 'speaking':     return 'Speaking…';
    case 'error':        return 'Error';
    default:             return 'Hold to speak';
  }
}

function getColor(state: VoiceState): string {
  switch (state) {
    case 'recording':    return '#EF4444'; // red
    case 'transcribing': return '#F59E0B'; // amber
    case 'speaking':     return '#10B981'; // green
    case 'error':        return '#6B7280'; // gray
    default:             return '#2E5FA3'; // brand blue
  }
}
