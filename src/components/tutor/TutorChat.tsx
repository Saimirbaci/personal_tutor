import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeft, Plus, Trash2, Pencil, Check, X, MessageSquare, FileText, ArrowRight, CheckCircle2 } from 'lucide-react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { useAI } from '@/hooks/useAI';
import { useConversations } from '@/hooks/useConversations';
import { runSessionSummary, useConversationSummary } from '@/hooks/useSessionSummary';
import { useVoice } from '@/hooks/useVoice';
import SummaryCard from '@/components/SummaryCard';
import { useMobile } from '@/hooks/useMobile';
import { PILLARS, PLAN } from '@/data/plan';
import { PillarId, CurriculumItem } from '@/data/types';
import { singleReviewPrompt } from '@/lib/reviewPrompts';
import { ConversationListEntry } from '@/store/appStore';
import MessageBubble from './MessageBubble';
import InputBar from './InputBar';
import MarkdownContent from './MarkdownContent';

// ── Contextual prompt templates ────────────────────────────────────────────────

type PillarCategory = 'technical' | 'leadership' | 'communication';

const PILLAR_CATEGORY: Record<PillarId, PillarCategory> = {
  llm: 'technical', hardware: 'technical', mlops: 'technical', security: 'technical',
  roadmap: 'leadership', fundraising: 'leadership', hiring: 'leadership',
  finance: 'leadership', ip: 'leadership',
  sales: 'communication', communication: 'communication', voice: 'communication',
};

function buildPrompts(topic: string, category: PillarCategory): string[] {
  const t = topic;
  if (category === 'technical') {
    return [
      `Explain ${t} from first principles`,
      `Quiz me on the key concepts in ${t}`,
      `Give me a concept map for ${t}`,
      `How does ${t} apply to Physical AI and robotics?`,
    ];
  }
  if (category === 'leadership') {
    return [
      `Walk me through the essentials of ${t}`,
      `What frameworks or mental models do I need for ${t}?`,
      `Give me a realistic scenario for ${t} and coach me through it`,
      `What mistakes do first-time CTOs make with ${t}?`,
    ];
  }
  // communication / sales / voice
  return [
    `Give me a practice exercise for ${t}`,
    `Coach me on the most common weaknesses in ${t}`,
    `Create a drill or script I can practice for ${t}`,
    `What does excellent look like in ${t}? Give examples`,
  ];
}

/** Returns 4 contextual prompts for the given pillar.
 *  Picks the first in-progress item, then the first todo, then falls
 *  back to the pillar goal phrasing when no curriculum items are found. */
function getContextualSuggestions(pillarId: PillarId | null): string[] {
  if (!pillarId) {
    return [
      'What should I prioritise learning this week as an AI CTO?',
      'Give me a briefing across all 12 learning areas',
      'Quiz me on today\'s learning focus',
      'What\'s the most important skill gap I should close first?',
    ];
  }

  const category = PILLAR_CATEGORY[pillarId];
  const planEntry = PLAN.find((p) => p.pillar.id === pillarId);
  if (!planEntry) return buildPrompts(pillarId, category);

  // Flatten all curriculum items in order
  const allItems: CurriculumItem[] = planEntry.curriculum.flatMap((m) => m.items);

  // Prefer in-progress, then todo
  const current =
    allItems.find((i) => i.status === 'in-progress') ??
    allItems.find((i) => i.status === 'todo');

  const topic = current?.topic ?? planEntry.goal;
  return buildPrompts(topic, category);
}

// ── Relative date label ────────────────────────────────────────────────────────
function relativeDate(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Group conversations by day label ─────────────────────────────────────────
function groupByDate(list: ConversationListEntry[]): { label: string; items: ConversationListEntry[] }[] {
  const groups = new Map<string, ConversationListEntry[]>();
  for (const c of list) {
    const label = relativeDate(c.updated_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

// ── Inline rename input ───────────────────────────────────────────────────────
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div className="flex items-center gap-1 w-full">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(value.trim() || initial);
          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 min-w-0 bg-[#080d1a] border border-[#2E5FA3] rounded px-2 py-0.5 text-xs text-[#e2e8f0] focus:outline-none"
      />
      <button onClick={() => onCommit(value.trim() || initial)} className="text-green-400 hover:text-green-300">
        <Check size={11} />
      </button>
      <button onClick={onCancel} className="text-[#4a5568] hover:text-[#e2e8f0]">
        <X size={11} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TutorChat() {
  const {
    messages,
    isStreaming,
    streamingContent,
    activePillar,
    activeConversationId,
    conversationList,
    setActiveConversation,
    pendingPrompt,
    pendingPromptFresh,
    setPendingPrompt,
    reviewQueue,
    reviewCursor,
    advanceReviewSession,
    endReviewSession,
  } = useAppStore((s) => ({
    messages: s.messages,
    isStreaming: s.isStreaming,
    streamingContent: s.streamingContent,
    activePillar: s.activePillar,
    activeConversationId: s.activeConversationId,
    conversationList: s.conversationList,
    setActiveConversation: s.setActiveConversation,
    pendingPrompt: s.pendingPrompt,
    pendingPromptFresh: s.pendingPromptFresh,
    setPendingPrompt: s.setPendingPrompt,
    reviewQueue: s.reviewQueue,
    reviewCursor: s.reviewCursor,
    advanceReviewSession: s.advanceReviewSession,
    endReviewSession: s.endReviewSession,
  }));

  const { sendMessage, clearMessages } = useAI();
  const {
    loadConversationList,
    createConversation,
    loadConversationMessages,
    deleteConversation,
    renameConversation,
  } = useConversations();
  const { speak, state: _voiceState } = useVoice();
  const { voiceConfig } = useAppStore((s) => ({ voiceConfig: s.voiceConfig }));
  const isMobile = useMobile();

  const [selectedPillar, setSelectedPillar] = useState<PillarId | null>(activePillar);
  // Conversation sidebar: closed by default on mobile to give chat full width
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(false);

  // Read-only summary for the conversation currently open (shown at top of the thread).
  const { summary: activeSummary } = useConversationSummary(activeConversationId);

  // Ids of conversations that have a saved summary (for the sidebar badge).
  const [summarisedIds, setSummarisedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await tauriInvoke<Array<{ conversationId: string }>>('list_recent_summaries', {
          limit: 200,
        });
        if (!cancelled) setSummarisedIds(new Set(rows.map((r) => r.conversationId)));
      } catch (err) {
        console.error('Failed to load summary index:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSummary, conversationList.length]);

  // Fire-and-forget summary generation for a session that's ending.
  // runSessionSummary internally short-circuits (existing summary / <4 messages) and dedupes.
  const summariseSession = useCallback((conversationId: string | null) => {
    if (!conversationId) return;
    if (useAppStore.getState().isStreaming) return; // never summarise mid-stream
    void runSessionSummary(conversationId);
  }, []);

  // ── On mount: load conversation list and open/create the right thread ──────
  useEffect(() => {
    async function init() {
      const list = await loadConversationList();
      // A queued review/drill drill wants a clean thread, not the last chat.
      if (useAppStore.getState().pendingPromptFresh) {
        clearMessages();
        await createConversation(selectedPillar);
      } else if (list.length > 0) {
        // Resume the most-recent conversation
        const latest = list[0];
        setActiveConversation(latest.id);
        const msgs = await loadConversationMessages(latest.id);
        // Hydrate the store with stored messages
        useAppStore.setState({ messages: msgs });
      } else {
        // No conversations yet — create one
        await createConversation(selectedPillar);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Consume a queued prompt (e.g. a spaced-review drill, a drift catch-up, or a
  // "Reply" from a summary's reflection). Cleared immediately so it's never
  // re-sent. A `fresh` prompt arriving while already mounted spins up a new
  // conversation first so the drill doesn't land in the current thread.
  const startingFreshRef = useRef(false);
  useEffect(() => {
    if (!pendingPrompt || isStreaming || startingFreshRef.current) return;
    const prompt = pendingPrompt;
    const fresh = pendingPromptFresh;
    setPendingPrompt(null);

    if (fresh && activeConversationId && messages.length > 0) {
      // Already in a populated thread — open a clean one before drilling.
      startingFreshRef.current = true;
      (async () => {
        summariseSession(activeConversationId);
        clearMessages();
        await createConversation(selectedPillar);
        startingFreshRef.current = false;
        sendMessage(prompt, selectedPillar ?? undefined);
      })();
    } else {
      // Fresh-on-mount is handled by init(); just send into the active thread.
      sendMessage(prompt, selectedPillar ?? undefined);
    }
  }, [
    pendingPrompt,
    pendingPromptFresh,
    isStreaming,
    activeConversationId,
    messages.length,
    sendMessage,
    selectedPillar,
    setPendingPrompt,
    summariseSession,
    clearMessages,
    createConversation,
  ]);

  // TTS: auto-speak the last assistant message when streaming finishes
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      if (voiceConfig.ttsEnabled && voiceConfig.elevenLabsApiKey) {
        const last = messages[messages.length - 1];
        if (last?.role === 'assistant' && last.content) {
          // Speak at most first 500 chars to keep it concise
          speak(last.content.slice(0, 500));
        }
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Summarise on navigate-away / unmount ──────────────────────────────────
  // Track the latest active id in a ref so the unmount cleanup isn't stale.
  const activeConvRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    activeConvRef.current = activeConversationId;
  }, [activeConversationId]);
  useEffect(() => {
    return () => {
      summariseSession(activeConvRef.current);
    };
  }, [summariseSession]);

  // ── New conversation ──────────────────────────────────────────────────────
  const handleNewConversation = useCallback(async () => {
    summariseSession(activeConversationId); // session ending — summarise the old one
    endReviewSession(); // abandon any in-progress spaced-review drill
    clearMessages();
    await createConversation(selectedPillar);
  }, [clearMessages, createConversation, selectedPillar, summariseSession, activeConversationId, endReviewSession]);

  // ── Switch to a conversation ──────────────────────────────────────────────
  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationId) return;
      summariseSession(activeConversationId); // leaving the current session
      endReviewSession(); // leaving the review thread abandons the drill
      clearMessages();
      setActiveConversation(id);
      const msgs = await loadConversationMessages(id);
      useAppStore.setState({ messages: msgs });
    },
    [activeConversationId, clearMessages, setActiveConversation, loadConversationMessages, summariseSession, endReviewSession]
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (id === activeConversationId) {
        clearMessages();
        // Try to open the next conversation
        const remaining = conversationList.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id);
        } else {
          await createConversation(selectedPillar);
        }
      }
    },
    [activeConversationId, conversationList, deleteConversation, clearMessages,
     handleSelectConversation, createConversation, selectedPillar]
  );

  const handleSend = (content: string) => {
    sendMessage(content, selectedPillar ?? undefined);
  };

  // ── Spaced review: advance to the next queued item ────────────────────────
  // A batch review drills items one at a time. The next item's prompt is sent
  // into the SAME conversation only after the user clicks "Next question", so
  // each LLM response stays small and streams smoothly.
  const inReviewSession = reviewQueue.length > 0;
  const reviewRemaining = inReviewSession ? reviewQueue.length - reviewCursor - 1 : 0;
  // Only surface the prompt once the current item's answer has rendered.
  const lastMessageIsAssistant =
    messages.length > 0 && messages[messages.length - 1].role === 'assistant';
  const showReviewControls = inReviewSession && !isStreaming && lastMessageIsAssistant;

  const handleNextReviewItem = useCallback(() => {
    const next = advanceReviewSession();
    if (next) {
      sendMessage(singleReviewPrompt(next), next.pillar ?? undefined);
    }
  }, [advanceReviewSession, sendMessage]);

  // ── Render ────────────────────────────────────────────────────────────────
  const groups = groupByDate(conversationList);

  /** Shared conversation list JSX — rendered in both desktop sidebar and mobile drawer */
  const renderConversationList = () => (
    <div className="flex-1 overflow-y-auto py-1">
      {conversationList.length === 0 && (
        <div className="px-3 py-4 text-[10px] text-[#4a5568] text-center">
          No conversations yet
        </div>
      )}

      {groups.map(({ label, items }) => (
        <div key={label}>
          <div className="px-3 py-1.5 text-[9px] font-semibold text-[#4a5568] uppercase tracking-wider">
            {label}
          </div>
          {items.map((conv) => (
            <div
              key={conv.id}
              className={`group relative flex items-center gap-1.5 px-3 py-2 mx-1 rounded-lg cursor-pointer transition-colors ${
                conv.id === activeConversationId
                  ? 'bg-[#1a2540] text-[#e2e8f0]'
                  : 'text-[#4a5568] hover:bg-[#0f1629] hover:text-[#e2e8f0]'
              }`}
              onClick={() => {
                if (renamingId !== conv.id) handleSelectConversation(conv.id);
              }}
            >
              <MessageSquare size={11} className="shrink-0 opacity-60" />
              <div className="flex-1 min-w-0">
                {renamingId === conv.id ? (
                  <RenameInput
                    initial={conv.title}
                    onCommit={(title) => {
                      renameConversation(conv.id, title);
                      setRenamingId(null);
                    }}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <>
                    <p className="text-[11px] truncate">{conv.title}</p>
                    {summarisedIds.has(conv.id) && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[9px] text-[#2E5FA3]/80">
                        <FileText size={9} />
                        Summary
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Action buttons — visible on hover */}
              {renamingId !== conv.id && (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenamingId(conv.id); }}
                    className="p-0.5 rounded hover:text-[#2E5FA3] transition-colors"
                    title="Rename"
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
                    className="p-0.5 rounded hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Conversation history sidebar / mobile drawer ─────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          isMobile ? (
            /* On mobile: full-screen overlay drawer */
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-30"
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                key="sidebar"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="fixed left-0 top-0 bottom-0 w-72 z-40 flex flex-col bg-[#0f1629] border-r border-[#1a2540] overflow-hidden"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
              >
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a2540]">
              <span className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wider">
                History
              </span>
              <button
                onClick={handleNewConversation}
                title="New conversation"
                className="flex items-center gap-1 text-[10px] text-[#4a5568] hover:text-[#2E5FA3] transition-colors px-1.5 py-1 rounded hover:bg-[#0f1629]"
              >
                <Plus size={12} />
                New
              </button>
            </div>

            {/* Conversation list */}
            {renderConversationList()}
            </motion.aside>
            </>
          ) : (
            /* On desktop: inline side panel */
            <motion.aside
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="flex-shrink-0 flex flex-col bg-[#080d1a] border-r border-[#1a2540] overflow-hidden"
              style={{ minWidth: 0 }}
            >
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a2540]">
                <span className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wider">
                  History
                </span>
                <button
                  onClick={handleNewConversation}
                  title="New conversation"
                  className="flex items-center gap-1 text-[10px] text-[#4a5568] hover:text-[#2E5FA3] transition-colors px-1.5 py-1 rounded hover:bg-[#0f1629]"
                >
                  <Plus size={12} />
                  New
                </button>
              </div>
              {/* Conversation list — reused below */}
              {renderConversationList()}
            </motion.aside>
          )
        )}
      </AnimatePresence>

      {/* ── Main chat area ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-[#1a2540] flex-shrink-0 min-w-0">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Hide history' : 'Show history'}
            className={`flex-shrink-0 p-1.5 rounded-lg border transition-all ${
              sidebarOpen
                ? 'border-[#2E5FA3] text-[#2E5FA3] bg-[#2E5FA3]/10'
                : 'border-[#1a2540] text-[#4a5568] hover:text-[#e2e8f0] hover:border-[#4a5568]'
            }`}
          >
            <PanelLeft size={13} />
          </button>

          {/* Pillar filter chips — horizontally scrollable on mobile */}
          <div className="flex-1 overflow-x-auto min-w-0">
            <div className="flex items-center gap-1.5 w-max">
              <span className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wide flex-shrink-0 hidden md:inline">
                Context
              </span>
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPillar(selectedPillar === p.id ? null : p.id)}
                  title={p.name}
                  className="px-2 md:px-2.5 py-1 rounded-lg text-xs font-medium border transition-all flex-shrink-0"
                  style={
                    selectedPillar === p.id
                      ? { borderColor: p.color, backgroundColor: p.color + '20', color: p.color }
                      : { borderColor: '#1a2540', color: '#4a5568' }
                  }
                >
                  {p.emoji} <span className="hidden md:inline">{p.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleNewConversation}
            className="flex-shrink-0 text-xs text-[#4a5568] hover:text-[#e2e8f0] px-2.5 py-1 rounded-lg hover:bg-[#1a2540] transition-all flex items-center gap-1"
          >
            <Plus size={12} />
            <span className="hidden md:inline">New chat</span>
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              {(() => {
                const pillarData = selectedPillar ? PILLARS.find((p) => p.id === selectedPillar) : null;
                const planEntry  = selectedPillar ? PLAN.find((p) => p.pillar.id === selectedPillar) : null;
                const allItems   = planEntry?.curriculum.flatMap((m) => m.items) ?? [];
                const currentItem =
                  allItems.find((i) => i.status === 'in-progress') ??
                  allItems.find((i) => i.status === 'todo');
                const suggestions = getContextualSuggestions(selectedPillar);

                return (
                  <>
                    <div className="text-4xl mb-4">{pillarData?.emoji ?? '🧠'}</div>
                    <h2 className="text-lg font-semibold text-[#e2e8f0] mb-1">Ready to learn</h2>

                    {/* Context label */}
                    <div className="flex flex-col items-center mb-8 gap-1">
                      <p className="text-sm text-[#4a5568]">
                        {pillarData
                          ? `Focused on ${pillarData.name}`
                          : 'Select a pillar above or ask anything'}
                      </p>
                      {currentItem && (
                        <p className="text-xs text-[#2E5FA3]/80 font-mono">
                          {currentItem.week} · {currentItem.topic}
                        </p>
                      )}
                    </div>

                    {/* Dynamic suggestion chips */}
                    <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                      {suggestions.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handleSend(prompt)}
                          className="text-left text-xs text-[#4a5568] hover:text-[#e2e8f0] px-4 py-3 rounded-xl border border-[#1a2540] hover:border-[#2E5FA3] hover:bg-[#0f1629] transition-all"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Existing session summary — read-only context at the top of the thread */}
          {activeSummary && messages.length > 0 && <SummaryCard summary={activeSummary} />}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <MessageBubble message={msg} pillar={selectedPillar} />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-[#0f1629] border border-[#1a2540] px-4 py-3">
                <MarkdownContent content={streamingContent} />
                <span className="inline-block w-0.5 h-3.5 bg-[#2E5FA3] animate-pulse ml-0.5 align-text-bottom" />
              </div>
            </motion.div>
          )}

          {isStreaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#0f1629] border border-[#1a2540]">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#2E5FA3]"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Spaced-review session controls — drill the queue one item at a time */}
          {showReviewControls && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-2 pt-2"
            >
              <span className="text-[10px] font-semibold text-[#4a5568] uppercase tracking-wider">
                Review · {reviewCursor + 1} of {reviewQueue.length}
              </span>
              {reviewRemaining > 0 ? (
                <button
                  onClick={handleNextReviewItem}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:bg-[#1a2540]"
                  style={{ color: '#C9A84C', border: '1px solid #C9A84C40' }}
                >
                  Next question
                  <ArrowRight size={13} />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-[#C9A84C]">
                    <CheckCircle2 size={14} />
                    Review complete — nicely done.
                  </span>
                  <button
                    onClick={endReviewSession}
                    className="text-[11px] text-[#4a5568] hover:text-[#e2e8f0] px-3 py-1 rounded-lg hover:bg-[#1a2540] transition-all"
                  >
                    Finish
                  </button>
                </div>
              )}
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <InputBar
          onSend={handleSend}
          disabled={isStreaming}
          pillar={selectedPillar}
        />
      </div>
    </div>
  );
}
