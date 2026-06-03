import { DepthScore, DepthScoreData } from '@/data/types';

/** Matches a single GenUI block — kept in sync with the store/utils parsers. */
const GENUI_REGEX = /<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g;

/** Removes every `<genui …>…</genui>` block from a string, returning the prose. */
export function stripGenUITags(content: string): string {
  return content.replace(GENUI_REGEX, '').trim();
}

/**
 * The session-depth classifier prompt. Scores how deeply a learner engaged in a
 * conversation on a 1–5 rubric and returns EXACTLY one machine-parseable block.
 *
 * The output contract is a single `<genui type="depth-score">` block carrying
 * `{score, rationale, dimensions[]}` so {@link parseDepthScore} can extract it.
 */
export const DEPTH_SCORE_PROMPT = `You are an engagement-depth classifier for a personal learning tutor app. You will be given a transcript of a tutoring conversation, with each turn labelled USER (the learner) or ASSISTANT (the tutor).

Rate how DEEPLY the learner engaged with the material on a 1–5 scale. Judge the LEARNER's engagement, not the tutor's eloquence.

Rubric:
1 — Pure surface. Single-shot definition lookups, "what is X" questions, passive consumption with no follow-up. The learner asked and moved on.
2 — Mostly surface with a little curiosity. A clarifying follow-up or two, but no application.
3 — Some application. The learner worked through examples, asked "how" / "why", or connected ideas — but stayed within the tutor's framing.
4 — Active engagement. The learner applied concepts to concrete scenarios, probed edge cases, or pushed back and reasoned through answers.
5 — Deep mastery work. Sustained Socratic back-and-forth, applied scenarios AND edge cases, the learner's own reasoning was challenged and defended, hypotheses tested.

Consider these dimensions (include the ones you actually observe in "dimensions"):
- "applied-scenarios" — learner applied ideas to concrete/real situations
- "edge-cases" — learner explored boundaries, exceptions, failure modes
- "socratic" — genuine back-and-forth, learner answered tutor's challenges
- "first-principles" — learner reasoned from fundamentals
- "follow-up" — learner asked meaningful follow-up questions
- "surface" — predominantly definition/explanation lookups

Return ONLY the following block and NOTHING else — no prose before or after:
<genui type="depth-score">{"score": N, "rationale": "one concise sentence citing what the learner did", "dimensions": ["..."]}</genui>

Where N is an integer 1–5.`;

/**
 * Extracts the `{score, rationale, dimensions[]}` payload from a classifier
 * response. Tolerant of either a `<genui type="depth-score">` block or a bare
 * JSON object. Clamps the score to 1–5 and defaults dimensions to `[]`.
 * Returns `null` when no valid score can be recovered.
 */
export function parseDepthScore(raw: string): DepthScoreData | null {
  if (!raw) return null;

  // Prefer the depth-score GenUI block; fall back to the first JSON object.
  const blockMatch = raw.match(/<genui\s+type="depth-score">([\s\S]*?)<\/genui>/);
  const jsonText = blockMatch ? blockMatch[1].trim() : extractFirstJsonObject(raw);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const rawScore =
    typeof obj.score === 'number'
      ? obj.score
      : typeof obj.score === 'string'
        ? Number.parseFloat(obj.score)
        : NaN;
  if (!Number.isFinite(rawScore)) return null;

  const score = Math.min(5, Math.max(1, Math.round(rawScore))) as DepthScore;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim() : '';
  const dimensions = Array.isArray(obj.dimensions)
    ? obj.dimensions.filter((d): d is string => typeof d === 'string').map((d) => d.trim()).filter(Boolean)
    : [];

  return { score, rationale, dimensions };
}

/** Returns the first balanced `{...}` JSON object substring, or null. */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Strict instruction the model must follow when asked to summarise a session.
 * It must return exactly ONE session-summary block and nothing else.
 */
export const SESSION_SUMMARY_PROMPT = `You are summarising a completed study session for a learner.

Return EXACTLY ONE GenUI block and NO other text:

<genui type="session-summary">
{
  "takeaways": ["...", "...", "..."],
  "reflection": "An open-ended question that pushes deeper reflection.",
  "flaggedItems": [
    { "type": "flashcard", "pillar": "llm", "question": "..." },
    { "type": "quiz", "pillar": null, "question": "..." }
  ]
}
</genui>

Rules:
- "takeaways": exactly 3 strings, each ≤ 140 characters, capturing the most important things learned.
- "reflection": exactly 1 open reflection question (no yes/no questions).
- "flaggedItems": select ONLY flashcards or quizzes that appeared in THIS conversation and are worth re-reviewing later. Use the "type" ("flashcard" or "quiz"), the originating "pillar" (one of the 12 pillar ids, or null), and the exact "question" text. If none are worth flagging, return an empty array.
- Do NOT include any prose, markdown, or text outside the single <genui> block.`;
