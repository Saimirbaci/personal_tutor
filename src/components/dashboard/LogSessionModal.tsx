import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useProgress } from '@/hooks/useProgress';
import { PILLARS } from '@/data/plan';
import { PillarId } from '@/data/types';

export default function LogSessionModal() {
  const { setLogSessionModal } = useAppStore();
  const { logSession } = useProgress();

  const [pillar, setPillar] = useState<PillarId>('llm');
  const [hours, setHours] = useState(1);
  const [energy, setEnergy] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await logSession(pillar, hours, energy, note);
      setLogSessionModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setLogSessionModal(false)}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md rounded-2xl bg-[#0f1629] border border-[#1a2540] p-6 shadow-2xl z-10"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[#e2e8f0]">Log Study Session</h2>
          <button
            onClick={() => setLogSessionModal(false)}
            className="p-1.5 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Pillar */}
          <div>
            <label className="text-xs font-semibold text-[#4a5568] mb-2 block uppercase tracking-wide">
              Pillar
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPillar(p.id)}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all"
                  style={
                    pillar === p.id
                      ? { borderColor: p.color, backgroundColor: p.color + '20', color: p.color }
                      : { borderColor: '#1a2540', color: '#4a5568' }
                  }
                >
                  <span className="text-base">{p.emoji}</span>
                  <span className="text-[9px] text-center leading-tight">
                    {p.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Hours */}
          <div>
            <label className="text-xs font-semibold text-[#4a5568] mb-2 block uppercase tracking-wide">
              Duration (hours): <span className="text-[#e2e8f0]">{hours}h</span>
            </label>
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(parseFloat(e.target.value))}
              className="w-full accent-[#2E5FA3]"
            />
            <div className="flex justify-between text-[10px] text-[#4a5568] mt-1">
              <span>15m</span>
              <span>1h</span>
              <span>2h</span>
              <span>3h</span>
              <span>4h</span>
            </div>
          </div>

          {/* Energy */}
          <div>
            <label className="text-xs font-semibold text-[#4a5568] mb-2 block uppercase tracking-wide">
              Energy level
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((e) => (
                <button
                  key={e}
                  onClick={() => setEnergy(e)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                  style={
                    energy >= e
                      ? { borderColor: '#C9A84C', backgroundColor: '#C9A84C20', color: '#C9A84C' }
                      : { borderColor: '#1a2540', color: '#4a5568' }
                  }
                >
                  {'⚡'.repeat(e)}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-semibold text-[#4a5568] mb-2 block uppercase tracking-wide">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you learn? Any blockers?"
              className="w-full h-16 px-3 py-2 text-xs rounded-lg bg-[#080d1a] border border-[#1a2540] text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#2E5FA3] resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => setLogSessionModal(false)}
            className="flex-1 py-2 rounded-lg border border-[#1a2540] text-sm text-[#4a5568] hover:text-[#e2e8f0] hover:border-[#4a5568] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: '#2E5FA3' }}
          >
            {saving ? 'Saving…' : 'Log Session'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
