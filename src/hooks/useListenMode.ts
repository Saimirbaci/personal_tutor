import { useCallback, useEffect, useRef, useState } from 'react';
import { tauriInvoke, tauriListen } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { AudioLesson, AudioLessonProgress, PillarId } from '@/data/types';

interface UseListenModeReturn {
  /** Generate a fresh audio lesson for the pillar/topic. */
  generate: (pillar: PillarId, topic: string) => Promise<void>;
  isGenerating: boolean;
  /** The generated lesson (script + metadata), once ready. */
  lesson: AudioLesson | null;
  /** Object URL for the decoded MP3, ready for an <audio> element. */
  audioUrl: string | null;
  /** Live generation progress, or null when idle. */
  progress: AudioLessonProgress | null;
  error: string;
  /** Clear the current lesson and release the audio object URL. */
  reset: () => void;
}

/**
 * Listen Mode: generates a podcast-style audio lesson via the Rust
 * `generate_audio_lesson` command and decodes the returned base64 MP3 into a
 * playable object URL. All Tauri calls live here, never in components.
 */
export function useListenMode(): UseListenModeReturn {
  const { providerConfig, voiceConfig } = useAppStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [lesson, setLesson] = useState<AudioLesson | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<AudioLessonProgress | null>(null);
  const [error, setError] = useState('');

  // Track the active object URL so we can revoke it on replace/unmount.
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    revoke();
    setAudioUrl(null);
    setLesson(null);
    setProgress(null);
    setError('');
  }, [revoke]);

  const generate = useCallback(
    async (pillar: PillarId, topic: string) => {
      if (!voiceConfig.elevenLabsApiKey) {
        setError('Add your ElevenLabs key in Settings → Voice to generate audio lessons.');
        return;
      }

      setError('');
      setIsGenerating(true);
      setProgress({ stage: 'writing script', current: 0, total: 1 });

      const unlisten = await tauriListen('audio-lesson-progress', (payload) => {
        setProgress(payload as AudioLessonProgress);
      });

      try {
        const result = await tauriInvoke<AudioLesson>('generate_audio_lesson', {
          pillar,
          topic,
          config: providerConfig,
          apiKey: voiceConfig.elevenLabsApiKey,
          voiceId: voiceConfig.elevenLabsVoiceId,
        });

        // Decode base64 → Blob → object URL, replacing any previous lesson.
        const bytes = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);

        revoke();
        urlRef.current = url;
        setAudioUrl(url);
        setLesson(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        unlisten();
        setIsGenerating(false);
        setProgress(null);
      }
    },
    [providerConfig, voiceConfig.elevenLabsApiKey, voiceConfig.elevenLabsVoiceId, revoke]
  );

  // Release the object URL when the consuming component unmounts.
  useEffect(() => revoke, [revoke]);

  return { generate, isGenerating, lesson, audioUrl, progress, error, reset };
}
