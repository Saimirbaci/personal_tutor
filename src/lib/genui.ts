/**
 * Shared GenUI helpers.
 *
 * The post-session summary feature reuses the existing GenUI transport: the
 * model is asked to emit a single `<genui type="session-summary">` block whose
 * JSON payload matches `SessionSummaryData`. This keeps the prompt format
 * identical to the rest of the GenUI system and works across all four providers
 * without per-provider plumbing.
 */

/** Matches a single GenUI block — kept in sync with the store/utils parsers. */
const GENUI_REGEX = /<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g;

/** Removes every `<genui …>…</genui>` block from a string, returning the prose. */
export function stripGenUITags(content: string): string {
  return content.replace(GENUI_REGEX, '').trim();
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
