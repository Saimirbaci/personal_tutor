import { PillarId, VoiceQuizGrade } from '@/data/types';
import { PILLARS } from '@/data/plan';

/**
 * Prompt builders + grade parser for the hands-free Voice Quiz Mode.
 *
 * The tutor SPEAKS a question, the learner answers ALOUD, and the AI grades the
 * spoken transcript. Both prompts are tuned for speech: no multiple-choice
 * options (you can't read options aloud) and no GenUI question blocks (the
 * question is delivered as plain prose so it can be sent straight to TTS).
 *
 * Grading carries a machine-readable SM-2 quality back through a `QUALITY: N`
 * sentinel line that {@link parseVoiceGrade} extracts and strips before the
 * verdict is read aloud, so the learner never hears the marker.
 */

/** Default SM-2 quality used when the model's verdict can't be parsed. A 3 is a
 *  bare pass — neither rewards nor punishes on an unparseable grade. */
export const DEFAULT_VOICE_QUALITY = 3;

function pillarName(pillar: PillarId | null): string {
  if (!pillar) return 'general CTO learning topics';
  return PILLARS.find((p) => p.id === pillar)?.name ?? pillar;
}

/**
 * Asks the tutor to pose ONE concise, speech-friendly recall question for the
 * active pillar. No options, no GenUI — just a single spoken question.
 */
export function generateVoiceQuizQuestionPrompt(pillar: PillarId | null): string {
  return (
    `We are running a HANDS-FREE VOICE QUIZ. Ask me exactly ONE short, ` +
    `open-ended recall question about ${pillarName(pillar)} that I can answer ` +
    `out loud from memory.\n\n` +
    `Strict rules:\n` +
    `- Output ONLY the question itself — no preamble, no "Sure!", no numbering.\n` +
    `- Do NOT provide multiple-choice options (I am answering by voice).\n` +
    `- Do NOT include any GenUI blocks, markdown, or code.\n` +
    `- Keep it to one or two sentences, phrased naturally for the ear.\n` +
    `- Make it a genuine active-recall question, not a yes/no question.`
  );
}

/**
 * Asks the tutor to grade the learner's spoken answer. The verdict is read
 * aloud, so it must be plain spoken prose. The SM-2 quality is carried on a
 * final `QUALITY: N` line (0–5) that the app strips before TTS.
 */
export function gradeVoiceAnswerPrompt(question: string, transcript: string): string {
  const answer = transcript.trim() || '(no answer was heard)';
  return (
    `You just asked me this voice-quiz question:\n"${question}"\n\n` +
    `Here is my spoken answer, transcribed:\n"${answer}"\n\n` +
    `Grade my answer for active recall. Respond with SHORT spoken prose I can ` +
    `hear: briefly say whether I was right, correct anything I missed, and give ` +
    `the key point of the correct answer. Keep it under ~60 words.\n\n` +
    `Then, on a FINAL separate line and nothing after it, output the SM-2 grade ` +
    `exactly in this format:\nQUALITY: N\n` +
    `where N is an integer 0–5:\n` +
    `- 5 = perfect, confident, complete\n` +
    `- 4 = correct with a minor gap\n` +
    `- 3 = mostly right but hesitant/incomplete\n` +
    `- 2 = partially right, significant gaps\n` +
    `- 1 = mostly wrong but some recognition\n` +
    `- 0 = wrong, blank, or no answer heard\n\n` +
    `Do NOT use any markdown or GenUI blocks. The QUALITY line must be the last line.`
  );
}

/** Matches the `QUALITY: N` sentinel anywhere in the verdict (case-insensitive). */
const QUALITY_RE = /QUALITY:\s*([0-5])/i;

/**
 * Parses the graded verdict into a `{quality, spokenText}` pair. Tolerant: pulls
 * the SM-2 grade from the `QUALITY: N` sentinel, clamps it to 0–5, and strips
 * the marker line from the spoken text so it is never read aloud. Falls back to
 * {@link DEFAULT_VOICE_QUALITY} when no grade can be recovered.
 */
export function parseVoiceGrade(content: string): VoiceQuizGrade {
  const raw = content ?? '';
  const match = raw.match(QUALITY_RE);

  let quality = DEFAULT_VOICE_QUALITY;
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed)) {
      quality = Math.min(5, Math.max(0, parsed));
    }
  }

  // Strip the whole QUALITY line (and any trailing blank lines) so TTS only
  // reads the human verdict.
  const spokenText = raw
    .replace(/^\s*QUALITY:\s*[0-5].*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { quality, spokenText: spokenText || raw.trim() };
}
