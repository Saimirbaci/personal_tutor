import { SourceSummary } from '@/data/types';

/** Matches the first http(s) URL in a string. */
const URL_REGEX = /https?:\/\/[^\s]+/i;

/**
 * Returns the first http/https URL found in `text`, with common trailing
 * punctuation stripped, or null when none is present.
 */
export function detectUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  if (!match) return null;
  return match[0].replace(/[)\].,;!?]+$/, '');
}

/**
 * Composes a pillar-aware teaching prompt from an imported source. Asks the
 * tutor to summarize, connect to the active pillar's curriculum, and emit
 * GenUI flashcards + a quiz — all of which flow through the existing
 * parseGenUIBlocks / spaced-repetition pipeline unchanged.
 */
export function buildTeachPrompt(summary: SourceSummary, pillarName: string | null): string {
  const byline = summary.byline ? ` by ${summary.byline}` : '';
  const pillarLine = pillarName
    ? `Connect it explicitly to my ${pillarName} curriculum and current milestones.`
    : 'Connect it to whichever of my 12 learning pillars is most relevant.';
  const truncNote = summary.truncated
    ? '\n\n(Note: this source was long and the content below has been truncated.)'
    : '';

  return (
    [
      `Teach me from this source titled "${summary.title}"${byline}.`,
      '',
      'Do the following:',
      '1. Summarize the core ideas and key contributions concisely.',
      `2. ${pillarLine}`,
      '3. Generate several <genui type="flashcard"> blocks covering the most important ideas, and at least one <genui type="quiz"> block to test my understanding.',
      '4. End with a question that pushes my understanding further.',
      '',
      `Source URL: ${summary.url}`,
      'Source content:',
      summary.content,
    ].join('\n') + truncNote
  );
}
