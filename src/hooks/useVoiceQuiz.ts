import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useVoice } from './useVoice';
import { useAI } from './useAI';
import { buildReviewItemId, useReview } from './useReview';
import { PillarId, VoiceQuizState } from '@/data/types';
import {
  generateVoiceQuizQuestionPrompt,
  gradeVoiceAnswerPrompt,
  parseVoiceGrade,
} from '@/lib/voiceQuizPrompts';

/** Result of the listening phase — either a transcript to grade, or a skip. */
interface AnswerOutcome {
  transcript: string;
  skipped: boolean;
}

export interface UseVoiceQuizReturn {
  /** Current loop phase (mirrors the store so the panel can render off it). */
  voiceQuizState: VoiceQuizState;
  /** The question currently being drilled (for optional on-screen display). */
  question: string;
  /** The learner's last transcribed answer (for optional on-screen display). */
  transcript: string;
  /** The tutor's last spoken verdict (for optional on-screen display). */
  verdict: string;
  /** A friendly error message when the loop can't run (config/mic/STT). */
  error: string;
  /** When true, the next question auto-asks after feedback. Session-only. */
  autoAdvance: boolean;
  setAutoAdvance: (v: boolean) => void;
  /** Begin (or resume) the hands-free loop. */
  start: () => Promise<void>;
  /** Halt the loop, release mic + TTS, return to idle. */
  stop: () => void;
  /** While listening: finish answering → transcribe → grade. */
  submitAnswer: () => void;
  /** While listening: re-speak the current question. */
  repeatQuestion: () => Promise<void>;
  /** While listening: abandon this question (no grade) and move on. */
  skipQuestion: () => void;
}

/**
 * Orchestrates the hands-free Voice Quiz loop:
 * asking (TTS) → listening (STT) → transcribing → grading (AI) → feedback (TTS)
 * → auto-advance or idle. Composes {@link useVoice}, {@link useAI}, and
 * {@link useReview}; drives the loop off the store's streaming flags rather than
 * racing useAI's own ai-done listener. Graded answers feed SM-2 via
 * `recordAttempt` with a deterministic itemId, exactly like the on-screen Quiz.
 */
export function useVoiceQuiz(pillar: PillarId | null): UseVoiceQuizReturn {
  const { speak, cancelSpeak, startRecording, stopRecording, checkModelStatus } = useVoice();
  const { sendMessage } = useAI();
  const { recordAttempt } = useReview();

  const voiceQuizState = useAppStore((s) => s.voiceQuizState);
  const setVoiceQuizState = useAppStore((s) => s.setVoiceQuizState);
  const voiceConfig = useAppStore((s) => s.voiceConfig);

  const [question, setQuestion] = useState('');
  const [transcript, setTranscript] = useState('');
  const [verdict, setVerdict] = useState('');
  const [error, setError] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(true);

  // ── Loop control refs (avoid stale closures inside the async loop) ──────────
  const runningRef = useRef(false);
  const autoAdvanceRef = useRef(autoAdvance);
  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  // Keep the latest sendMessage/pillar without re-binding the running loop.
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  const pillarRef = useRef(pillar);
  useEffect(() => { pillarRef.current = pillar; }, [pillar]);

  // Resolver for the listening phase — settled by submit/skip/stop.
  const answerResolveRef = useRef<((o: AnswerOutcome) => void) | null>(null);
  // Item ids already graded this session, so a question is never double-recorded.
  const recordedRef = useRef<Set<string>>(new Set());

  const setPhase = useCallback(
    (s: VoiceQuizState) => setVoiceQuizState(s),
    [setVoiceQuizState]
  );

  // Resolves with the assistant's full reply once the next stream completes.
  // Subscribes BEFORE the caller sends, so the isStreaming true→false edge is
  // never missed. Returns '' if no assistant message landed (e.g. ai-error).
  const awaitAssistantReply = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      let sawStreaming = false;
      const unsub = useAppStore.subscribe((state) => {
        if (state.isStreaming) {
          sawStreaming = true;
        } else if (sawStreaming) {
          unsub();
          const msgs = state.messages;
          const last = msgs[msgs.length - 1];
          resolve(last?.role === 'assistant' ? last.content : '');
        }
      });
    });
  }, []);

  // Sends a prompt and waits for the assistant's reply, off the store flags.
  const sendAndAwait = useCallback(
    async (prompt: string): Promise<string> => {
      const replyP = awaitAssistantReply();
      // sendMessage flips isStreaming synchronously before its first await, so
      // subscribing first (above) guarantees we catch the transition.
      void sendMessageRef.current(prompt, pillarRef.current ?? undefined);
      return replyP;
    },
    [awaitAssistantReply]
  );

  // One full ask→listen→grade→feedback cycle. Recurses for auto-advance.
  const runCycle = useCallback(async () => {
    if (!runningRef.current) return;

    // ── ASK ──────────────────────────────────────────────────────────────
    setPhase('asking');
    setTranscript('');
    setVerdict('');
    const rawQuestion = (await sendAndAwait(generateVoiceQuizQuestionPrompt(pillarRef.current))).trim();
    if (!runningRef.current) return;
    if (!rawQuestion) {
      setError('The tutor could not generate a question. Check your AI provider in Settings.');
      setPhase('error');
      runningRef.current = false;
      return;
    }
    setQuestion(rawQuestion);
    await speak(rawQuestion);
    if (!runningRef.current) return;

    // ── LISTEN ───────────────────────────────────────────────────────────
    setPhase('listening');
    await startRecording();
    if (!runningRef.current) return;
    const outcome = await new Promise<AnswerOutcome>((resolve) => {
      answerResolveRef.current = resolve;
    });
    answerResolveRef.current = null;
    if (!runningRef.current) return;

    if (outcome.skipped) {
      // Abandon without grading; advance if auto, else idle.
      if (autoAdvanceRef.current && runningRef.current) {
        void runCycle();
      } else {
        setPhase('idle');
        runningRef.current = false;
      }
      return;
    }

    setTranscript(outcome.transcript);

    // ── GRADE ────────────────────────────────────────────────────────────
    setPhase('grading');
    const graded = await sendAndAwait(gradeVoiceAnswerPrompt(rawQuestion, outcome.transcript));
    if (!runningRef.current) return;
    const { quality, spokenText } = parseVoiceGrade(graded);
    setVerdict(spokenText);

    // Record into SM-2 once per question (same path as the on-screen Quiz).
    const itemId = buildReviewItemId('quiz', pillarRef.current, rawQuestion);
    if (!recordedRef.current.has(itemId)) {
      recordedRef.current.add(itemId);
      void recordAttempt(itemId, 'quiz', pillarRef.current, rawQuestion, quality);
    }

    // ── FEEDBACK ─────────────────────────────────────────────────────────
    setPhase('feedback');
    if (spokenText) await speak(spokenText);
    if (!runningRef.current) return;

    if (autoAdvanceRef.current && runningRef.current) {
      void runCycle();
    } else {
      setPhase('idle');
      runningRef.current = false;
    }
  }, [setPhase, sendAndAwait, speak, startRecording, recordAttempt]);

  // ── Public controls ────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (runningRef.current) return; // already running — guard StrictMode re-entry
    setError('');

    // Config gates → graceful, Settings-pointing messages (no raw errors).
    if (!voiceConfig.enabled) {
      setError('Enable voice in Settings to use Voice Quiz Mode.');
      setPhase('error');
      return;
    }
    if (!voiceConfig.ttsEnabled || !voiceConfig.elevenLabsApiKey) {
      setError('Add your ElevenLabs key and enable spoken answers in Settings.');
      setPhase('error');
      return;
    }
    try {
      const status = await checkModelStatus();
      if (!status.downloaded) {
        setError('Download the speech-to-text model in Settings to answer aloud.');
        setPhase('error');
        return;
      }
    } catch {
      setError('Could not check the speech-to-text model. Open Settings to verify voice setup.');
      setPhase('error');
      return;
    }

    runningRef.current = true;
    void runCycle();
  }, [voiceConfig.enabled, voiceConfig.ttsEnabled, voiceConfig.elevenLabsApiKey, checkModelStatus, runCycle, setPhase]);

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelSpeak();
    // Release the mic if we were mid-recording (ignore the discarded transcript).
    void stopRecording().catch(() => {});
    // Unblock any awaiting listening phase so the loop can unwind cleanly.
    answerResolveRef.current?.({ transcript: '', skipped: true });
    answerResolveRef.current = null;
    setPhase('idle');
  }, [cancelSpeak, stopRecording, setPhase]);

  const submitAnswer = useCallback(() => {
    if (!answerResolveRef.current) return;
    const resolve = answerResolveRef.current;
    answerResolveRef.current = null;
    setPhase('transcribing');
    void (async () => {
      const text = await stopRecording();
      resolve({ transcript: text, skipped: false });
    })();
  }, [stopRecording, setPhase]);

  const skipQuestion = useCallback(() => {
    if (!answerResolveRef.current) return;
    const resolve = answerResolveRef.current;
    answerResolveRef.current = null;
    void stopRecording().catch(() => {});
    resolve({ transcript: '', skipped: true });
  }, [stopRecording]);

  const repeatQuestion = useCallback(async () => {
    if (!runningRef.current || !question) return;
    await speak(question);
  }, [question, speak]);

  // ── Cleanup on unmount: stop loop, release mic + TTS ───────────────────────
  useEffect(() => {
    return () => {
      runningRef.current = false;
      cancelSpeak();
      void stopRecording().catch(() => {});
      answerResolveRef.current?.({ transcript: '', skipped: true });
      answerResolveRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    voiceQuizState,
    question,
    transcript,
    verdict,
    error,
    autoAdvance,
    setAutoAdvance,
    start,
    stop,
    submitAnswer,
    repeatQuestion,
    skipQuestion,
  };
}
