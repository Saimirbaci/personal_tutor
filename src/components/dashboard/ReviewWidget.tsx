import { useNavigate } from 'react-router-dom';
import { Brain, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useReviewCounts, useDueReviews } from '@/hooks/useReview';
import { PILLARS } from '@/data/plan';
import { ReviewItem } from '@/data/types';

/** Prompt for drilling a single due review item in the tutor.
 *  Asks for a GenUI block (self-contained, click-to-reveal) rather than a
 *  conversational quiz, so the rendered card works as intended. */
function singleReviewPrompt(item: ReviewItem): string {
  const kind = item.itemType === 'quiz' ? 'a quiz' : 'a flashcard';
  return (
    `I'm due to review this ${item.itemType}: "${item.content}". ` +
    `Render ${kind} GenUI block to test my recall of it, then add a one-line note on ` +
    `the core idea I should remember.`
  );
}

/** Prompt for running a short batch review session. */
function batchReviewPrompt(count: number): string {
  return (
    `I have ${count} spaced-repetition item${count === 1 ? '' : 's'} due for review. ` +
    `Run a focused review session over what I've been learning: emit a few quiz and ` +
    `flashcard GenUI blocks (each self-contained with its answer), spaced with brief ` +
    `explanations of the trickiest points.`
  );
}

export default function ReviewWidget() {
  const { counts } = useReviewCounts();
  const { items } = useDueReviews();
  const setView = useAppStore((s) => s.setView);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const navigate = useNavigate();

  if (!counts || counts.total === 0) {
    return null;
  }

  const due = counts.due;
  const preview = items.slice(0, 3);

  const startReview = (prompt: string, pillar?: ReviewItem['pillar']) => {
    setPendingPrompt(prompt, true); // open in a fresh conversation
    setView('tutor', pillar ?? undefined);
    navigate('/tutor');
  };

  const handleReview = () => startReview(batchReviewPrompt(due));

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: '#C9A84C' }} />
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Spaced Review</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#4a5568]">
          <span>{counts.total} tracked</span>
          <span
            className="px-2 py-0.5 rounded-md font-semibold"
            style={{
              backgroundColor: due > 0 ? '#C9A84C20' : '#1a2540',
              color: due > 0 ? '#C9A84C' : '#4a5568',
            }}
          >
            {due} due
          </span>
        </div>
      </div>

      {due === 0 ? (
        <p className="text-xs text-[#4a5568]">
          All caught up. Next item due {counts.dueToday > 0 ? 'later today' : 'soon'}.
        </p>
      ) : (
        <>
          <p className="text-xs text-[#94a3b8] mb-3">
            Review these before starting a new session — the forgetting curve is steepest now.
          </p>

          <ul className="space-y-1.5 mb-3">
            {preview.map((item) => {
              const p = PILLARS.find((x) => x.id === item.pillar);
              return (
                <li key={item.itemId}>
                  <button
                    type="button"
                    onClick={() => startReview(singleReviewPrompt(item), item.pillar)}
                    className="w-full flex items-center gap-2 text-xs text-left text-[#e2e8f0] rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-[#1a2540]"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p?.color ?? '#4a5568' }}
                    />
                    <span className="truncate">
                      <span className="uppercase tracking-wider text-[10px] text-[#4a5568] mr-2">
                        {item.itemType}
                      </span>
                      {item.content}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            onClick={handleReview}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:bg-[#1a2540]"
            style={{ color: '#C9A84C', border: '1px solid #C9A84C40' }}
          >
            Review {due} item{due === 1 ? '' : 's'}
            <ChevronRight size={13} />
          </button>
        </>
      )}
    </div>
  );
}
