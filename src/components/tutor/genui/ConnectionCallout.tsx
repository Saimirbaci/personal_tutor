import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, X, ArrowRight, History } from 'lucide-react';
import { ConnectionCallout as ConnectionCalloutData, Pillar } from '@/data/types';
import { PILLARS } from '@/data/plan';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';

interface ConnectionCalloutProps {
  data: ConnectionCalloutData;
}

/** Safe pillar lookup — tolerates an unknown id from a malformed payload. */
function findPillar(id: string): Pillar | undefined {
  return PILLARS.find((p) => p.id === id);
}

/**
 * Inline callout card highlighting a semantic link between two pillars. Renders
 * the two pillars, the relationship, a "covered recently" evidence line, an
 * optional deep-link into the related conversation, and a dismiss action.
 */
export default function ConnectionCallout({ data }: ConnectionCalloutProps) {
  const [dismissed, setDismissed] = useState(false);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const requestOpenConversation = useAppStore((s) => s.requestOpenConversation);

  const from = findPillar(data.fromPillar);
  const to = findPillar(data.toPillar);

  // Drop the card silently if either end is an unknown pillar.
  if (!from || !to || dismissed) return null;

  const accent = to.color;

  const handleDismiss = () => {
    setDismissed(true); // optimistic hide
    if (activeConversationId) {
      void tauriInvoke('dismiss_connection', {
        conversationId: activeConversationId,
        fromPillar: data.fromPillar,
        toPillar: data.toPillar,
      }).catch((err) => console.error('Failed to dismiss connection:', err));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="relative rounded-xl border p-4 overflow-hidden"
      style={{ borderColor: accent + '40', backgroundColor: accent + '0C' }}
    >
      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        title="Dismiss this connection"
        className="absolute top-2.5 right-2.5 p-1 rounded text-[#4a5568] hover:text-[#e2e8f0] hover:bg-white/5 transition-colors"
      >
        <X size={13} />
      </button>

      {/* Header label */}
      <div className="flex items-center gap-1.5 mb-3">
        <Link2 size={13} style={{ color: accent }} />
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: accent }}
        >
          Cross-pillar connection
        </span>
      </div>

      {/* Two pillars */}
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border"
          style={{ borderColor: from.color + '40', color: from.color, backgroundColor: from.color + '12' }}
        >
          <span>{from.emoji}</span>
          {from.name.split(' ')[0]}
        </span>
        <ArrowRight size={14} className="text-[#4a5568] shrink-0" />
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border"
          style={{ borderColor: to.color + '40', color: to.color, backgroundColor: to.color + '12' }}
        >
          <span>{to.emoji}</span>
          {to.name.split(' ')[0]}
        </span>
      </div>

      {/* Relationship label + rationale */}
      <p className="text-sm font-medium text-[#e2e8f0] mb-1">{data.label}</p>
      <p className="text-xs text-[#94a3b8] leading-relaxed">{data.rationale}</p>

      {/* Recent-activity evidence */}
      {data.recentEvidence && (
        <div className="flex items-start gap-1.5 mt-3 text-[11px]" style={{ color: accent }}>
          <History size={12} className="mt-0.5 shrink-0" />
          <span>{data.recentEvidence}</span>
        </div>
      )}

      {/* Deep-link into the related conversation */}
      {data.conversationId && data.conversationId !== activeConversationId && (
        <button
          onClick={() => requestOpenConversation(data.conversationId!)}
          className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold transition-colors hover:underline"
          style={{ color: accent }}
        >
          Open that session
          <ArrowRight size={12} />
        </button>
      )}
    </motion.div>
  );
}
