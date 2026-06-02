import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AiMessage, DriftReport, ForgettingCurveSettings, PillarId, PlanAdjustment, ProgressData, ProviderConfig, VoiceConfig } from '@/data/types';

const DEFAULT_FORGETTING_CURVE_SETTINGS: ForgettingCurveSettings = {
  enabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  dailyCap: 4,
  pollMinutes: 30,
  lookaheadMinutes: 0,
};

export interface ConversationSummary {
  id: string;
  title: string;
  pillar: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

type ViewType = 'dashboard' | 'tutor' | 'pillar' | 'progress' | 'settings';

interface AppState {
  // Navigation
  currentView: ViewType;
  activePillar: PillarId | null;

  // AI
  messages: AiMessage[];
  isStreaming: boolean;
  currentToken: string;
  streamingContent: string;
  providerConfig: ProviderConfig;

  // Conversations
  activeConversationId: string | null;
  conversationList: ConversationSummary[];

  // Progress
  progress: ProgressData | null;
  streak: number;

  // Drift & rebalancing (ephemeral — loaded from backend, never persisted)
  pillarDrift: DriftReport | null;
  planAdjustments: PlanAdjustment[] | null;

  // A prompt queued for the tutor (e.g. a drift catch-up drill). Consumed once.
  pendingPrompt: string | null;

  // Voice
  voiceConfig: VoiceConfig;

  // Forgetting-curve notifications
  forgettingCurveSettings: ForgettingCurveSettings;

  // UI
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  logSessionModalOpen: boolean;

  // Actions
  setView: (view: ViewType, pillar?: PillarId) => void;
  addMessage: (msg: AiMessage) => void;
  appendToken: (token: string) => void;
  finalizeStream: () => void;
  startStream: () => void;
  setActiveConversation: (id: string | null) => void;
  setConversationList: (list: ConversationSummary[]) => void;
  upsertConversation: (summary: ConversationSummary) => void;
  removeConversation: (id: string) => void;
  setProgress: (p: ProgressData) => void;
  setStreak: (s: number) => void;
  setPillarDrift: (d: DriftReport | null) => void;
  setPlanAdjustments: (a: PlanAdjustment[] | null) => void;
  setPendingPrompt: (p: string | null) => void;
  setProviderConfig: (c: ProviderConfig) => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  clearMessages: () => void;
  setLogSessionModal: (open: boolean) => void;
  setVoiceConfig: (c: Partial<VoiceConfig>) => void;
  setForgettingCurveSettings: (c: Partial<ForgettingCurveSettings>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentView: 'dashboard',
      activePillar: null,

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

      progress: null,
      streak: 0,

      pillarDrift: null,
      planAdjustments: null,
      pendingPrompt: null,

      voiceConfig: {
        enabled: false,
        sttEngine: 'sherpa-onnx',
        sttModel: 'small',
        autoSend: true,
        ttsEnabled: true,
        elevenLabsApiKey: '',
        elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — good default
      },

      forgettingCurveSettings: DEFAULT_FORGETTING_CURVE_SETTINGS,

      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      logSessionModalOpen: false,

      setView: (view, pillar) =>
        set({ currentView: view, activePillar: pillar ?? get().activePillar }),

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
      setPillarDrift: (d) => set({ pillarDrift: d }),
      setPlanAdjustments: (a) => set({ planAdjustments: a }),
      setPendingPrompt: (p) => set({ pendingPrompt: p }),
      setProviderConfig: (c) => set({ providerConfig: c }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      clearMessages: () => set({ messages: [], streamingContent: '', currentToken: '' }),
      setLogSessionModal: (open) => set({ logSessionModalOpen: open }),
      setVoiceConfig: (c) =>
        set((state) => ({ voiceConfig: { ...state.voiceConfig, ...c } })),
      setForgettingCurveSettings: (c) =>
        set((state) => ({
          forgettingCurveSettings: { ...state.forgettingCurveSettings, ...c },
        })),
    }),
    {
      name: 'personal-tutor-store',
      partialize: (state) => ({
        providerConfig: state.providerConfig,
        voiceConfig: state.voiceConfig,
        forgettingCurveSettings: state.forgettingCurveSettings,
        sidebarCollapsed: state.sidebarCollapsed,
        activePillar: state.activePillar,
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
