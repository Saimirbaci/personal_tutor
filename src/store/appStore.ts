import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AiMessage, KnowledgeGap, MasteryScore, PillarId, ProgressData, ProviderConfig, VoiceConfig, WeeklyDigest } from '@/data/types';

/** A lightweight conversation row used in the sidebar/history list.
 *  (Distinct from the AI-generated `ConversationSummary` note in data/types.ts.) */
export interface ConversationListEntry {
  id: string;
  title: string;
  pillar: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

type ViewType = 'dashboard' | 'tutor' | 'pillar' | 'progress' | 'settings' | 'activation';

/** Activation quiz length is clamped to this range (mirrors the backend). */
export const MIN_ACTIVATION_LENGTH = 3;
export const MAX_ACTIVATION_LENGTH = 5;

interface AppState {
  // Navigation
  currentView: ViewType;
  activePillar: PillarId | null;

  // Pre-session activation quiz
  pendingSessionPillar: PillarId | null;
  activationQuizEnabled: boolean;
  activationQuizLength: number;

  // AI
  messages: AiMessage[];
  isStreaming: boolean;
  currentToken: string;
  streamingContent: string;
  providerConfig: ProviderConfig;

  // Conversations
  activeConversationId: string | null;
  conversationList: ConversationListEntry[];
  /** A prompt queued by another view (e.g. a summary's "Reply") to be sent once the tutor opens. */
  pendingPrompt: string | null;

  // Progress
  progress: ProgressData | null;
  streak: number;

  // Weekly digests (ephemeral — loaded from backend, never persisted)
  weeklyDigests: WeeklyDigest[];
  selectedDigestWeek: string | null;

  // Mastery (ephemeral — recomputable, never persisted)
  masteryByItem: Record<string, number>;

  // Knowledge gaps (ephemeral — recomputed from live signals, never persisted)
  knowledgeGaps: KnowledgeGap[] | null;

  // Voice
  voiceConfig: VoiceConfig;

  // UI
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  logSessionModalOpen: boolean;

  // Actions
  setView: (view: ViewType, pillar?: PillarId) => void;
  startActivation: (pillar: PillarId) => void;
  completeActivation: () => void;
  setActivationQuizEnabled: (enabled: boolean) => void;
  setActivationQuizLength: (length: number) => void;
  addMessage: (msg: AiMessage) => void;
  appendToken: (token: string) => void;
  finalizeStream: () => void;
  startStream: () => void;
  setActiveConversation: (id: string | null) => void;
  setPendingPrompt: (prompt: string | null) => void;
  setConversationList: (list: ConversationListEntry[]) => void;
  upsertConversation: (summary: ConversationListEntry) => void;
  removeConversation: (id: string) => void;
  setProgress: (p: ProgressData) => void;
  setStreak: (s: number) => void;
  setWeeklyDigests: (d: WeeklyDigest[]) => void;
  setSelectedDigestWeek: (weekStart: string | null) => void;
  setMasteryScores: (scores: MasteryScore[]) => void;
  setKnowledgeGaps: (gaps: KnowledgeGap[]) => void;
  setProviderConfig: (c: ProviderConfig) => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  clearMessages: () => void;
  setLogSessionModal: (open: boolean) => void;
  setVoiceConfig: (c: Partial<VoiceConfig>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentView: 'dashboard',
      activePillar: null,

      pendingSessionPillar: null,
      activationQuizEnabled: true,
      activationQuizLength: 4,

      messages: [],
      isStreaming: false,
      currentToken: '',
      streamingContent: '',
      providerConfig: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      },

      activeConversationId: null,
      conversationList: [],
      pendingPrompt: null,

      progress: null,
      streak: 0,
      knowledgeGaps: null,

      weeklyDigests: [],
      selectedDigestWeek: null,
      masteryByItem: {},

      voiceConfig: {
        enabled: false,
        sttEngine: 'sherpa-onnx',
        sttModel: 'small',
        autoSend: true,
        ttsEnabled: true,
        elevenLabsApiKey: '',
        elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — good default
      },

      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      logSessionModalOpen: false,

      setView: (view, pillar) =>
        set({ currentView: view, activePillar: pillar ?? get().activePillar }),

      startActivation: (pillar) =>
        set({ currentView: 'activation', pendingSessionPillar: pillar }),
      completeActivation: () =>
        set({ currentView: 'tutor', pendingSessionPillar: null }),
      setActivationQuizEnabled: (enabled) => set({ activationQuizEnabled: enabled }),
      setActivationQuizLength: (length) =>
        set({
          activationQuizLength: Math.min(
            MAX_ACTIVATION_LENGTH,
            Math.max(MIN_ACTIVATION_LENGTH, Math.round(length))
          ),
        }),

      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),

      appendToken: (token) =>
        set((state) => ({
          streamingContent: state.streamingContent + token,
          currentToken: token,
        })),

      startStream: () =>
        set({ isStreaming: true, streamingContent: '', currentToken: '' }),

      finalizeStream: () => {
        const { streamingContent, messages } = get();
        if (!streamingContent) {
          set({ isStreaming: false, currentToken: '', streamingContent: '' });
          return;
        }

        // Parse GenUI blocks from content
        const { text, blocks } = parseGenUIBlocks(streamingContent);

        const finalMessage: AiMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          genui: blocks.length > 0 ? blocks : undefined,
          timestamp: new Date(),
        };

        set({
          messages: [...messages, finalMessage],
          isStreaming: false,
          streamingContent: '',
          currentToken: '',
        });
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
      setConversationList: (list) => set({ conversationList: list }),
      upsertConversation: (summary) =>
        set((state) => {
          const exists = state.conversationList.some((c) => c.id === summary.id);
          if (exists) {
            return {
              conversationList: state.conversationList.map((c) =>
                c.id === summary.id ? summary : c
              ),
            };
          }
          return { conversationList: [summary, ...state.conversationList] };
        }),
      removeConversation: (id) =>
        set((state) => ({
          conversationList: state.conversationList.filter((c) => c.id !== id),
          activeConversationId:
            state.activeConversationId === id ? null : state.activeConversationId,
        })),

      setProgress: (p) => set({ progress: p }),
      setStreak: (s) => set({ streak: s }),
      setWeeklyDigests: (d) => set({ weeklyDigests: d }),
      setSelectedDigestWeek: (weekStart) => set({ selectedDigestWeek: weekStart }),
      setMasteryScores: (scores) =>
        set(() => ({
          masteryByItem: scores.reduce<Record<string, number>>((acc, s) => {
            acc[s.itemId] = s.score;
            return acc;
          }, {}),
        })),
      setKnowledgeGaps: (gaps) => set({ knowledgeGaps: gaps }),
      setProviderConfig: (c) => set({ providerConfig: c }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      clearMessages: () => set({ messages: [], streamingContent: '', currentToken: '' }),
      setLogSessionModal: (open) => set({ logSessionModalOpen: open }),
      setVoiceConfig: (c) =>
        set((state) => ({ voiceConfig: { ...state.voiceConfig, ...c } })),
    }),
    {
      name: 'personal-tutor-store',
      partialize: (state) => ({
        providerConfig: state.providerConfig,
        voiceConfig: state.voiceConfig,
        sidebarCollapsed: state.sidebarCollapsed,
        activePillar: state.activePillar,
        activationQuizEnabled: state.activationQuizEnabled,
        activationQuizLength: state.activationQuizLength,
      }),
    }
  )
);

function parseGenUIBlocks(content: string): { text: string; blocks: import('@/data/types').GenUIBlock[] } {
  const blocks: import('@/data/types').GenUIBlock[] = [];
  const genUIRegex = /<genui\s+type="([^"]+)">([\s\S]*?)<\/genui>/g;

  let match;
  let cleanText = content;

  const matches: Array<{ full: string; type: string; data: string }> = [];

  while ((match = genUIRegex.exec(content)) !== null) {
    matches.push({ full: match[0], type: match[1], data: match[2].trim() });
  }

  for (const m of matches) {
    cleanText = cleanText.replace(m.full, '');
    let parsedData: unknown = m.data;

    try {
      if (m.type !== 'diagram' && m.type !== 'key-insight') {
        parsedData = JSON.parse(m.data);
      }
    } catch {
      parsedData = m.data;
    }

    blocks.push({
      type: m.type as import('@/data/types').GenUIBlock['type'],
      data: parsedData,
    });
  }

  return { text: cleanText.trim(), blocks };
}
