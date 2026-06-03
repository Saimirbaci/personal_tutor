import { useNavigate } from 'react-router-dom';
import { Brain, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useReviewCounts, useDueReviews } from '@/hooks/useReview';
import { PILLARS } from '@/data/plan';
import { ReviewItem } from '@/data/types';
import { singleReviewPrompt } from '@/lib/reviewPrompts';

export default function ReviewWidget() {
  const { counts } = useReviewCounts();
  const { items } = useDueReviews();
  const setView = useAppStore((s) => s.setView);
  const setPendingPrompt = useAppStore((s) => s.setPendingPrompt);
  const beginReviewSession = useAppStore((s) => s.beginReviewSession);
  const endReviewSession = useAppStore((s) => s.endReviewSession);
  const navigate = useNavigate();

  if (!counts || counts.total === 0) {
    return null;
  }

  const due = counts.due;
  const preview = items.slice(0, 3);

  // Open the tutor on the first item of `queue`, then drill the rest one at a
  // time as the user advances. A single-item review is just a queue of one.
  const startReview = (queue: ReviewItem[]) => {
    if (queue.length === 0) return;
    beginReviewSession(queue);
    setPendingPrompt(singleReviewPrompt(queue[0]), true); // fresh conversation
    setView('tutor', queue[0].pillar ?? undefined);
    navigate('/tutor');
  };

  const reviewSingle = (item: ReviewItem) => {
    endReviewSession(); // a single-item review has no follow-on queue
    setPendingPrompt(singleReviewPrompt(item), true);
    setView('tutor', item.pillar ?? undefined);
    navigate('/tutor');
  };

  const handleReview = () => startReview(items);

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
                    onClick={() => reviewSingle(item)}
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
