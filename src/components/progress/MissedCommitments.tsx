import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, HeartHandshake } from 'lucide-react';
import { useCommitments, useCommitmentList } from '@/hooks/useCommitments';
import { getPillarById } from '@/lib/utils';
import { Commitment } from '@/data/types';

/** Local YYYY-MM-DD `days` from today, for the reschedule date default/min. */
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function MissedRow({ c }: { c: Commitment }) {
  const { reschedule, remove } = useCommitments();
  const pillar = getPillarById(c.pillar);
  const [newDate, setNewDate] = useState(isoInDays(3));
  const [busy, setBusy] = useState(false);

  const handleReschedule = async () => {
    setBusy(true);
    await reschedule(c.id, newDate);
    setBusy(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex flex-wrap items-center gap-2.5 rounded-lg bg-[#080d1a] border border-[#1a2540] px-3 py-2.5"
    >
      <span className="text-sm">{pillar.emoji}</span>
      <div className="flex-1 min-w-[180px]">
        <p className="text-xs text-[#e2e8f0]">{c.commitment}</p>
        <p className="text-[10px] text-[#4a5568] font-mono mt-0.5">was due {c.dueDate}</p>
      </div>
      <input
        type="date"
        value={newDate}
        min={isoInDays(1)}
        onChange={(e) => setNewDate(e.target.value)}
        className="bg-[#0f1629] border border-[#1a2540] rounded-lg px-2 py-1 text-[11px] text-[#e2e8f0] focus:outline-none focus:border-[#2E5FA3] [color-scheme:dark]"
      />
      <button
        onClick={handleReschedule}
        disabled={busy}
        className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-[#2E5FA3] text-white hover:bg-[#3a71c1] disabled:opacity-50 transition-all"
      >
        <CalendarClock size={12} />
        Reschedule
      </button>
      <button
        onClick={() => void remove(c.id)}
        className="text-[11px] px-2 py-1.5 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
      >
        Let it go
      </button>
    </motion.div>
  );
}

/** Weekly Digest companion: missed commitments with a no-judgment reschedule
 *  prompt. Hidden entirely when nothing was missed. */
export default function MissedCommitments() {
  const { commitments } = useCommitmentList();

  const missed = useMemo(
    () =>
      commitments
        .filter((c) => c.status === 'missed')
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [commitments]
  );

  if (missed.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-[#1a2540] bg-[#0c1222] p-4">
      <div className="flex items-center gap-2 mb-1">
        <HeartHandshake size={14} className="text-[#C9A84C]" />
        <h3 className="text-xs font-semibold text-[#e2e8f0]">
          Commitments that slipped past their date
        </h3>
      </div>
      <p className="text-[11px] text-[#4a5568] mb-3">
        Deadlines slip — that's part of an intensive sprint, not a verdict on you.
        Pick a new date that fits this week, or let one go guilt-free.
      </p>
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {missed.map((c) => (
            <MissedRow key={c.id} c={c} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
