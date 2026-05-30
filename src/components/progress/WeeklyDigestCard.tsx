import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useWeeklyDigest } from '@/hooks/useWeeklyDigest';
import { parseGenUIBlocks } from '@/lib/utils';
import MarkdownContent from '@/components/tutor/MarkdownContent';
import GenUIRenderer from '@/components/tutor/genui';
import { WeeklyDigest } from '@/data/types';

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function weekLabel(d: WeeklyDigest): string {
  return `Week ${d.weekNumber} · ${formatDay(d.weekStart)} – ${formatDay(d.weekEnd)}`;
}

export default function WeeklyDigestCard() {
  const digests = useAppStore((s) => s.weeklyDigests);
  const selectedWeek = useAppStore((s) => s.selectedDigestWeek);
  const setSelectedDigestWeek = useAppStore((s) => s.setSelectedDigestWeek);
  const { loadDigests, generate, exportDigest } = useWeeklyDigest();

  const [generating, setGenerating] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDigests();
  }, [loadDigests]);

  // Default the selection to the newest digest once loaded.
  useEffect(() => {
    if (!selectedWeek && digests.length > 0) {
      setSelectedDigestWeek(digests[0].weekStart);
    }
  }, [digests, selectedWeek, setSelectedDigestWeek]);

  const selected = useMemo(
    () => digests.find((d) => d.weekStart === selectedWeek) ?? digests[0] ?? null,
    [digests, selectedWeek]
  );

  const parsed = useMemo(
    () => (selected ? parseGenUIBlocks(selected.content) : { text: '', blocks: [] }),
    [selected]
  );

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setExportMsg(null);
    try {
      await generate();
    } catch {
      setError('Could not generate a digest. Check your AI provider in Settings.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!selected) return;
    setError(null);
    setExportMsg(null);
    try {
      const path = await exportDigest(selected.weekStart);
      setExportMsg(`Exported to ${path}`);
    } catch {
      setError('Export failed.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07 }}
      className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5"
    >
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-sm font-semibold text-[#e2e8f0] flex items-center gap-2">
          <Sparkles size={14} style={{ color: '#C9A84C' }} />
          Weekly Digest
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[#2E5FA3] text-white hover:bg-[#3a71c1] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
          {generating ? 'Generating…' : 'Generate this week'}
        </button>
      </div>

      {/* Week selector */}
      {digests.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {digests.map((d) => {
            const isActive = selected?.weekStart === d.weekStart;
            return (
              <button
                key={d.weekStart}
                onClick={() => setSelectedDigestWeek(d.weekStart)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                  isActive
                    ? 'bg-[#2E5FA3]/20 border-[#2E5FA3] text-[#e2e8f0]'
                    : 'bg-[#080d1a] border-[#1a2540] text-[#4a5568] hover:text-[#a0b4c8]'
                }`}
              >
                {weekLabel(d)}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      {exportMsg && <p className="text-xs text-green-400 mb-3 break-all">{exportMsg}</p>}

      {selected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-3 text-[11px] text-[#4a5568] font-mono">
              <span>{selected.metrics.totalHours.toFixed(1)}h</span>
              <span>{selected.metrics.sessionsCount} sessions</span>
              <span>🔥 {selected.metrics.streak}d</span>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-[11px] text-[#4a5568] hover:text-[#e2e8f0] px-2 py-1 rounded-lg hover:bg-[#1a2540] transition-all"
            >
              <Download size={12} />
              Export markdown
            </button>
          </div>

          <div className="rounded-lg bg-[#080d1a] border border-[#1a2540] p-4">
            <MarkdownContent content={parsed.text} size="xs" />
            {parsed.blocks
              .filter((b) => b.type === 'key-insight')
              .map((block, i) => (
                <div key={i} className="mt-3">
                  <GenUIRenderer block={block} pillar={null} />
                </div>
              ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#4a5568]">
          No weekly digests yet. They generate automatically each week — or click
          “Generate this week” to create one now.
        </p>
      )}
    </motion.div>
  );
}
