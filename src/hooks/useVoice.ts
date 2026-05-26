import { useCallback, useRef, useState } from 'react';
import { tauriInvoke, tauriListen } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { SttModelStatus, DownloadProgress } from '@/data/types';

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'speaking' | 'error';

interface UseVoiceReturn {
  state: VoiceState;
  transcript: string;
  error: string;
  downloadProgress: DownloadProgress | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  speak: (text: string) => Promise<void>;
  cancelSpeak: () => void;
  checkModelStatus: () => Promise<SttModelStatus>;
  downloadModel: () => Promise<void>;
}

// Target sample rate whisper expects
const SAMPLE_RATE = 16000;

export function useVoice(): UseVoiceReturn {
  const { voiceConfig } = useAppStore();

  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  // Audio capture refs
  const streamRef       = useRef<MediaStream | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const processorRef    = useRef<ScriptProcessorNode | null>(null);
  const sourceRef       = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef       = useRef<Float32Array[]>([]);

  // TTS playback ref (so we can cancel)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      setError('');
      setState('recording');
      chunksRef.current = [];

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Use AudioContext to capture raw PCM at 16 kHz
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = ctx.createMediaStreamSource(mediaStream);
      // ScriptProcessorNode gives us PCM buffers
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        const buf = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(buf));
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      streamRef.current    = mediaStream;
      audioCtxRef.current  = ctx;
      processorRef.current = processor;
      sourceRef.current    = source;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Microphone access denied: ${msg}`);
      setState('error');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    // Tear down capture
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await audioCtxRef.current?.close();

    processorRef.current = null;
    sourceRef.current    = null;
    streamRef.current    = null;
    audioCtxRef.current  = null;

    // Flatten all PCM chunks into one array
    const totalLen = chunksRef.current.reduce((s, c) => s + c.length, 0);
    const samples = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];

    if (samples.length < SAMPLE_RATE * 0.3) {
      // Less than 300 ms — too short to transcribe
      setState('idle');
      return '';
    }

    setState('transcribing');

    try {
      const text = await tauriInvoke<string>('transcribe_audio', {
        samples: Array.from(samples),
        engine: voiceConfig.sttEngine,
        model: voiceConfig.sttModel,
      });
      setTranscript(text);
      setState('idle');
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState('error');
      return '';
    }
  }, [voiceConfig.sttEngine, voiceConfig.sttModel]);

  // ── TTS ───────────────────────────────────────────────────────────────────

  const speak = useCallback(
    async (text: string) => {
      if (!voiceConfig.ttsEnabled || !voiceConfig.elevenLabsApiKey) return;

      // Cancel previous playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setState('speaking');
      setError('');

      try {
        const b64 = await tauriInvoke<string>('tts_elevenlabs', {
          text,
          apiKey: voiceConfig.elevenLabsApiKey,
          voiceId: voiceConfig.elevenLabsVoiceId,
        });

        // Decode base64 → Blob → Object URL → play
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setState('idle');
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setState('idle');
        };

        await audio.play();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setState('error');
      }
    },
    [voiceConfig.ttsEnabled, voiceConfig.elevenLabsApiKey, voiceConfig.elevenLabsVoiceId]
  );

  const cancelSpeak = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setState('idle');
    }
  }, []);

  // ── Model management ──────────────────────────────────────────────────────

  const checkModelStatus = useCallback(async (): Promise<SttModelStatus> => {
    return tauriInvoke<SttModelStatus>('get_stt_model_status', {
      engine: voiceConfig.sttEngine,
      model: voiceConfig.sttModel,
    });
  }, [voiceConfig.sttEngine, voiceConfig.sttModel]);

  const downloadModel = useCallback(async () => {
    setDownloadProgress({ engine: voiceConfig.sttEngine, model: voiceConfig.sttModel, percent: 0, downloadedMb: 0, totalMb: 0 });

    const unlisten = await tauriListen('stt-download-progress', (payload) => {
      setDownloadProgress(payload as DownloadProgress);
    });

    try {
      await tauriInvoke('download_stt_model', {
        engine: voiceConfig.sttEngine,
        model: voiceConfig.sttModel,
      });
    } finally {
      unlisten();
      setDownloadProgress(null);
    }
  }, [voiceConfig.sttEngine, voiceConfig.sttModel]);

  return {
    state,
    transcript,
    error,
    downloadProgress,
    startRecording,
    stopRecording,
    speak,
    cancelSpeak,
    checkModelStatus,
    downloadModel,
  };
}
