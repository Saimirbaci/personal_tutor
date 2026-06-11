import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { PILLARS } from '@/data/plan';
import { PillarId } from '@/data/types';

interface CommitmentFormProps {
  onSubmit: (
    commitment: string,
    pillar: PillarId,
    dueDate: string,
    linkCalendar: boolean
  ) => Promise<void>;
  onCancel: () => void;
}

/** Local YYYY-MM-DD for `days` from today (used as the date input default/min). */
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function CommitmentForm({ onSubmit, onCancel }: CommitmentFormProps) {
  const [text, setText] = useState('');
  const [pillar, setPillar] = useState<PillarId>('llm');
  const [dueDate, setDueDate] = useState(isoInDays(3));
  const [linkCalendar, setLinkCalendar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!text.trim() || !dueDate) {
      setError('Write the commitment and pick a due date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(text.trim(), pillar, dueDate, linkCalendar);
    } catch {
      setError('Could not save the commitment. Please try again.');
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="rounded-lg bg-[#080d1a] border border-[#1a2540] p-3 space-y-2.5">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder='e.g. "Complete LLM week-3 curriculum"'
        autoFocus
        className="w-full bg-[#0f1629] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#2E5FA3]"
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={pillar}
          onChange={(e) => setPillar(e.target.value as PillarId)}
          className="bg-[#0f1629] border border-[#1a2540] rounded-lg px-2.5 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#2E5FA3]"
        >
          {PILLARS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dueDate}
          min={isoInDays(0)}
          onChange={(e) => setDueDate(e.target.value)}
          className="bg-[#0f1629] border border-[#1a2540] rounded-lg px-2.5 py-1.5 text-xs text-[#e2e8f0] focus:outline-none focus:border-[#2E5FA3] [color-scheme:dark]"
        />

        <label className="flex items-center gap-1.5 text-xs text-[#a0b4c8] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={linkCalendar}
            onChange={(e) => setLinkCalendar(e.target.checked)}
            className="accent-[#2E5FA3]"
          />
          <CalendarPlus size={13} />
          Block focus time on Google Calendar
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#2E5FA3] text-white hover:bg-[#3a71c1] disabled:opacity-50 transition-all"
        >
          {saving ? 'Saving…' : 'Commit'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
