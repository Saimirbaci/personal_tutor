import { useNavigate } from 'react-router-dom';
import { Hourglass, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useForgettingNudgePreview } from '@/hooks/useForgettingCurve';
import { PILLARS } from '@/data/plan';

/** Non-intrusive Dashboard complement to OS notifications: lists the items
 *  whose retention has decayed the most, with a one-tap route into review.
 *  Read-only — does not mark items as notified, so it never suppresses a nudge. */
export default function ForgettingCurveCard() {
  const { nudges } = useForgettingNudgePreview(3);
  const { setView } = useAppStore();
  const navigate = useNavigate();

  if (nudges.length === 0) return null;

  const handleReview = () => {
    setView('tutor');
    navigate('/tutor');
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Hourglass size={16} style={{ color: '#C9762A' }} />
        <h2 className="text-sm font-semibold text-[#e2e8f0]">About to forget</h2>
      </div>

      <p className="text-xs text-[#94a3b8] mb-3">
        These concepts are decaying fastest — a quick review now locks them back in.
      </p>

      <ul className="space-y-1.5 mb-3">
        {nudges.map((n) => {
          const p = PILLARS.find((x) => x.id === n.pillar);
          const pct = Math.round(n.retention * 100);
          return (
            <li key={n.itemId} className="flex items-center gap-2 text-xs text-[#e2e8f0]">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: p?.color ?? '#4a5568' }}
              />
              <span className="truncate flex-1">{n.content}</span>
              <span className="text-[10px] font-mono text-[#C9762A] flex-shrink-0">{pct}%</span>
            </li>
          );
        })}
      </ul>

      <button
        onClick={handleReview}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all hover:bg-[#1a2540]"
        style={{ color: '#C9762A', border: '1px solid #C9762A40' }}
      >
        Review now
        <ChevronRight size={13} />
      </button>
    </div>
  );
}
