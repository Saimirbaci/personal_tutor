import { ReviewItem } from '@/data/types';

/** Prompt for drilling a single due review item in the tutor.
 *  Asks for ONE self-contained GenUI block (click-to-reveal) plus a one-line
 *  note — never a batch. Spaced review runs one item at a time so each LLM
 *  response stays small and streams smoothly; the next item is sent only after
 *  the user advances. */
export function singleReviewPrompt(item: ReviewItem): string {
  const kind = item.itemType === 'quiz' ? 'a quiz' : 'a flashcard';
  return (
    `I'm due to review this ${item.itemType}: "${item.content}". ` +
    `Render exactly one ${kind} GenUI block to test my recall of it, then add a ` +
    `one-line note on the core idea I should remember. Keep it to this single ` +
    `item — don't add other questions.`
  );
}
