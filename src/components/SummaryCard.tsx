import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Lightbulb,
  MessageCircleQuestion,
  Flag,
  CornerUpLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConversationSummary, FlaggedReviewItem, PillarId } from '@/data/types';
import { useAppStore } from '@/store/appStore';
import { useConversations } from '@/hooks/useConversations';
import { PILLARS } from '@/data/plan';
import { pillarColor } from '@/lib/utils';

interface SummaryCardProps {
  summary: ConversationSummary;
  conversation?: { title: string; pillar: PillarId | null };
  defaultOpen?: boolean;
}

interface SummarySectionProps {
  icon: ReactNode;
  title: string;
  color: string;
  children: ReactNode;
}

function SummarySection({ icon, title, color, children }: SummarySectionProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SummaryCard({ summary, conversation, defaultOpen = false }: SummaryCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const navigate = useNavigate();
  const { setView, setActiveConversation, setPendingPrompt } = useAppStore((s) => ({
    setView: s.setView,
    setActiveConversation: s.setActiveConversation,
    setPendingPrompt: s.setPendingPrompt,
  }));
  const { loadConversationMessages } = useConversations();

  const pillarId = (conversation?.pillar ?? summary.conversationPillar ?? null) as PillarId | null;
  const title = conversation?.title ?? summary.conversationTitle ?? 'Session summary';
  const pillar = pillarId ? PILLARS.find((p) => p.id === pillarId) : null;
  const color = pillarId ? pillarColor(pillarId) : '#2E5FA3';
  const flaggedCount = summary.flaggedItems.length;

  // Reply to the reflection question inside the originating conversation.
  const handleReply = async () => {
    setActiveConversation(summary.conversationId);
    const msgs = await loadConversationMessages(summary.conversationId);
    useAppStore.setState({ messages: msgs });
    setPendingPrompt(summary.reflection);
    setView('tutor');
    navigate('/tutor');
  };

  const handleOpenReview = () => {
    setView('progress');
    navigate('/progress');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border overflow-hidden bg-[#0f1629]"
      style={{ borderColor: color + '40' }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[#1a2540]/40"
        style={{ backgroundColor: color + '12' }}
      >
        <span className="text-base shrink-0">{pillar?.emoji ?? '📝'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#e2e8f0] truncate">{title}</p>
          <p className="text-[10px] text-[#4a5568]">Session summary · {relativeTime(summary.createdAt)}</p>
        </div>
        {flaggedCount > 0 && (
          <span
            className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold"
            style={{ backgroundColor: color + '20', color }}
          >
            {flaggedCount} flagged
          </span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-[#4a5568]">
          <ChevronDown size={15} />
        </motion.span>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-4 border-t border-[#1a2540]">
              <SummarySection icon={<Lightbulb size={12} />} title="Key takeaways" color={color}>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-[#e2e8f0] leading-relaxed marker:text-[#4a5568]">
                  {summary.takeaways.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </SummarySection>

              <SummarySection icon={<MessageCircleQuestion size={12} />} title="Reflect" color={color}>
                <p className="text-xs italic text-[#94a3b8] leading-relaxed mb-2">{summary.reflection}</p>
                <button
                  onClick={handleReply}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:bg-[#1a2540]"
                  style={{ color, border: `1px solid ${color}40` }}
                >
                  <CornerUpLeft size={12} />
                  Reply in chat
                </button>
              </SummarySection>

              {flaggedCount > 0 && (
                <SummarySection icon={<Flag size={12} />} title="Flagged for review" color={color}>
                  <ul className="space-y-1.5">
                    {summary.flaggedItems.map((item: FlaggedReviewItem, i) => {
                      const ip = item.pillar ? PILLARS.find((p) => p.id === item.pillar) : null;
                      return (
                        <li key={item.reviewItemId || i} className="flex items-center gap-2 text-xs text-[#e2e8f0]">
                          <span className="uppercase tracking-wider text-[10px] text-[#4a5568] shrink-0 w-14">
                            {item.type}
                          </span>
                          <span className="flex-1 min-w-0 truncate" title={item.question}>
                            {ip ? `${ip.emoji} ` : ''}
                            {item.question}
                          </span>
                          <button
                            onClick={handleOpenReview}
                            className="shrink-0 inline-flex items-center gap-1 text-[10px] text-[#4a5568] hover:text-[#e2e8f0] transition-colors"
                            title="Open review"
                          >
                            <ExternalLink size={11} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </SummarySection>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Skeleton placeholder shown while a summary is being generated. */
export function SummaryCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#1a2540] bg-[#0f1629] px-4 py-3 flex items-center gap-2.5">
      <Loader2 size={15} className="animate-spin text-[#2E5FA3]" />
      <span className="text-xs text-[#4a5568]">Summarising session…</span>
    </div>
  );
}

/** Error / retry variant shown when summary generation fails. */
export function SummaryCardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-800/40 bg-red-950/20 px-4 py-3 flex items-center justify-between gap-2">
      <span className="text-xs text-red-400">Couldn't generate a session summary.</span>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-300 hover:text-red-200"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}
