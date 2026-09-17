import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Flag, Plus, Trash2 } from 'lucide-react';
import { useCommitments, useCommitmentList } from '@/hooks/useCommitments';
import { dueLabel, daysUntilDue } from '@/lib/commitments';
import { getPillarById } from '@/lib/utils';
import { Commitment } from '@/data/types';
import CommitmentForm from './CommitmentForm';

function CommitmentChip({
  c,
  onComplete,
  onRemove,
}: {
  c: Commitment;
  onComplete: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const pillar = getPillarById(c.pillar);
  const days = daysUntilDue(c.dueDate);
  const urgent = days <= 1;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
      style={{ borderColor: `${pillar.color}55`, backgroundColor: `${pillar.color}14` }}
    >
      <span className="text-sm">{pillar.emoji}</span>
      <span className="text-xs text-[#e2e8f0] truncate max-w-[280px]" title={c.commitment}>
        {c.commitment}
      </span>
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border whitespace-nowrap ${
          urgent
            ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
            : 'bg-[#080d1a] text-[#a0b4c8] border-[#1a2540]'
        }`}
      >
        due {dueLabel(c.dueDate)}
      </span>
      <button
        onClick={() => onComplete(c.id)}
        title="Mark complete"
        className="p-1 rounded-md text-[#4a5568] hover:text-green-400 hover:bg-[#1a2540] transition-all"
      >
        <Check size={13} />
      </button>
      <button
        onClick={() => onRemove(c.id)}
        title="Delete commitment"
        className="p-1 rounded-md text-[#4a5568] hover:text-red-400 hover:bg-[#1a2540] transition-all"
      >
        <Trash2 size={13} />
      </button>
    </motion.div>
  );
}

/** Dashboard strip of active commitments as pillar-colored chips with a due
 *  countdown, complete/delete actions, and an inline create form. */
export default function CommitmentStrip() {
  // useCommitmentList loads the shared store list once on mount.
  const { commitments } = useCommitmentList();
  const { create, complete, remove } = useCommitments();
  const [formOpen, setFormOpen] = useState(false);

  // Grouping is computed here, not stored (no derived data in Zustand).
  const active = useMemo(
    () =>
      commitments
        .filter((c) => c.status === 'active')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [commitments]
  );
  const completedCount = useMemo(
    () => commitments.filter((c) => c.status === 'completed').length,
    [commitments]
  );

  const handleCreate = async (
    text: string,
    pillar: Parameters<typeof create>[1],
    dueDate: string,
    linkCalendar: boolean
  ) => {
    await create(text, pillar, dueDate, linkCalendar);
    setFormOpen(false);
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-sm font-semibold text-[#e2e8f0] flex items-center gap-2">
          <Flag size={14} style={{ color: '#C9A84C' }} />
          Commitments
          {completedCount > 0 && (
            <span className="text-[10px] text-[#4a5568] font-mono bg-[#1a2540] px-2 py-0.5 rounded-full">
              {completedCount} kept
            </span>
          )}
        </h2>
        {!formOpen && (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg text-[#a0b4c8] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
          >
            <Plus size={13} />
            Add commitment
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {formOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <CommitmentForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {active.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {active.map((c) => (
              <CommitmentChip
                key={c.id}
                c={c}
                onComplete={(id) => void complete(id)}
                onRemove={(id) => void remove(id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        !formOpen && (
          <p className="text-xs text-[#4a5568]">
            No active commitments. Pledge something concrete — "Complete LLM week-3
            curriculum by Friday" — and the app will hold the deadline with you.
          </p>
        )
      )}
    </div>
  );
}
