import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AiMessage,
  Commitment,
  DriftReport,
  EffortMasteryMatrix,
  ForgettingCurveSettings,
  KnowledgeGap,
  LearningVelocity,
  MasteryScore,
  PillarId,
  PlanAdjustment,
  ProgressData,
  ProviderConfig,
  QuizMode,
  ReviewItem,
  StreakState,
  VoiceConfig,
  VoiceQuizState,
  WeeklyDigest,
} from '@/data/types';
import { socraticKey } from '@/lib/utils';

const DEFAULT_FORGETTING_CURVE_SETTINGS: ForgettingCurveSettings = {
  enabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  dailyCap: 4,
  pollMinutes: 30,
  lookaheadMinutes: 0,
};

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

  // Socratic Mode — per-pillar toggle. Keyed by PillarId, plus a '__global__'
  // sentinel for the no-pillar (general) tutor context. Persisted.
  socraticModeByPillar: Record<string, boolean>;

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

  // A prompt queued by another view (e.g. a summary's "Reply" or a drift
  // catch-up drill) to be sent once the tutor opens. Consumed once.
  pendingPrompt: string | null;
  // When true, the queued prompt should open in a brand-new conversation
  // (e.g. a spaced-review drill) rather than the resumed last one.
  pendingPromptFresh: boolean;

  // Spaced-review session (ephemeral, never persisted). When the user starts a
  // batch review, the due items are queued here and drilled ONE AT A TIME in the
  // tutor — the next item is only sent after the user advances. `reviewCursor`
  // is the index of the item currently being reviewed. Empty queue = no session.
  reviewQueue: ReviewItem[];
  reviewCursor: number;

  // Progress
  progress: ProgressData | null;
  streak: number;
  // Momentum streak snapshot (freeze tokens, frozen days, recovery). Ephemeral —
  // loaded from the backend, never persisted.
  streakState: StreakState | null;

  // Weekly digests (ephemeral — loaded from backend, never persisted)
  weeklyDigests: WeeklyDigest[];
  selectedDigestWeek: string | null;

  // Mastery (ephemeral — recomputable, never persisted)
  masteryByItem: Record<string, number>;

  // Knowledge gaps (ephemeral — recomputed from live signals, never persisted)
  knowledgeGaps: KnowledgeGap[] | null;

  // Learning analytics (ephemeral — raw backend payloads, never persisted)
  learningVelocity: LearningVelocity | null;
  effortMatrix: EffortMasteryMatrix | null;
  // Drift & rebalancing (ephemeral — loaded from backend, never persisted)
  pillarDrift: DriftReport | null;
  planAdjustments: PlanAdjustment[] | null;

  // Commitment contracts (raw backend list — ephemeral, never persisted).
  // Groupings (active/missed) are computed in selectors/components.
  commitments: Commitment[];
  // Local hour (0–23) at which the evening-before commitment reminder may
  // start firing. Persisted.
  commitmentReminderHour: number;

  // Voice
  voiceConfig: VoiceConfig;

  // Voice Quiz Mode (ephemeral — a live hands-free drill, never persisted).
  // `quizMode` is the raw mode flag; `voiceQuizState` is the current loop phase.
  // No derived data lives here — the orchestration hook owns the loop logic.
  quizMode: QuizMode;
  voiceQuizState: VoiceQuizState;

  // Forgetting-curve notifications
  forgettingCurveSettings: ForgettingCurveSettings;

  // UI
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  logSessionModalOpen: boolean;

  // Actions
  setView: (view: ViewType, pillar?: PillarId) => void;
  toggleSocraticMode: (pillar: PillarId | null) => void;
  setSocraticMode: (pillar: PillarId | null, enabled: boolean) => void;
  startActivation: (pillar: PillarId) => void;
  completeActivation: () => void;
  setActivationQuizEnabled: (enabled: boolean) => void;
  setActivationQuizLength: (length: number) => void;
  addMessage: (msg: AiMessage) => void;
  appendToken: (token: string) => void;
  finalizeStream: () => void;
  startStream: () => void;
  setActiveConversation: (id: string | null) => void;
  setConversationList: (list: ConversationListEntry[]) => void;
  upsertConversation: (summary: ConversationListEntry) => void;
  removeConversation: (id: string) => void;
  setPendingPrompt: (prompt: string | null, fresh?: boolean) => void;
  beginReviewSession: (items: ReviewItem[]) => void;
  advanceReviewSession: () => ReviewItem | null;
  endReviewSession: () => void;
  setProgress: (p: ProgressData) => void;
  setStreak: (s: number) => void;
  setStreakState: (s: StreakState | null) => void;
  setWeeklyDigests: (d: WeeklyDigest[]) => void;
  setSelectedDigestWeek: (weekStart: string | null) => void;
  setMasteryScores: (scores: MasteryScore[]) => void;
  setKnowledgeGaps: (gaps: KnowledgeGap[]) => void;
  setLearningVelocity: (velocity: LearningVelocity | null) => void;
  setEffortMatrix: (matrix: EffortMasteryMatrix | null) => void;
  setPillarDrift: (d: DriftReport | null) => void;
  setPlanAdjustments: (a: PlanAdjustment[] | null) => void;
  setCommitments: (c: Commitment[]) => void;
  setCommitmentReminderHour: (hour: number) => void;
  setProviderConfig: (c: ProviderConfig) => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  clearMessages: () => void;
  setLogSessionModal: (open: boolean) => void;
  setVoiceConfig: (c: Partial<VoiceConfig>) => void;
  setForgettingCurveSettings: (c: Partial<ForgettingCurveSettings>) => void;
  setQuizMode: (mode: QuizMode) => void;
  setVoiceQuizState: (state: VoiceQuizState) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentView: 'dashboard',
      activePillar: null,
      socraticModeByPillar: {},

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
      pendingPromptFresh: false,

      reviewQueue: [],
      reviewCursor: 0,

      progress: null,
      streak: 0,
      streakState: null,
      learningVelocity: null,
      effortMatrix: null,

      weeklyDigests: [],
      selectedDigestWeek: null,
      masteryByItem: {},
      knowledgeGaps: null,

      pillarDrift: null,
      planAdjustments: null,

      commitments: [],
      commitmentReminderHour: 18,

      voiceConfig: {
        enabled: false,
        sttEngine: 'sherpa-onnx',
        sttModel: 'small',
        autoSend: true,
        ttsEnabled: true,
        elevenLabsApiKey: '',
        elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL', // "Sarah" — good default
      },

      quizMode: 'off',
      voiceQuizState: 'idle',

      forgettingCurveSettings: DEFAULT_FORGETTING_CURVE_SETTINGS,

      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      logSessionModalOpen: false,

      setView: (view, pillar) =>
        set({ currentView: view, activePillar: pillar ?? get().activePillar }),

      toggleSocraticMode: (pillar) =>
        set((state) => {
          const key = socraticKey(pillar);
          return {
            socraticModeByPillar: {
              ...state.socraticModeByPillar,
              [key]: !state.socraticModeByPillar[key],
            },
          };
        }),
      setSocraticMode: (pillar, enabled) =>
        set((state) => ({
          socraticModeByPillar: {
            ...state.socraticModeByPillar,
            [socraticKey(pillar)]: enabled,
          },
        })),

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
      setPendingPrompt: (prompt, fresh = false) =>
        set({ pendingPrompt: prompt, pendingPromptFresh: prompt ? fresh : false }),

      beginReviewSession: (items) => set({ reviewQueue: items, reviewCursor: 0 }),
      // Advance to the next queued item and return it (null when the queue is
      // exhausted, leaving the session ended). The caller sends the returned
      // item's prompt into the tutor.
      advanceReviewSession: () => {
        const { reviewQueue, reviewCursor } = get();
        const next = reviewCursor + 1;
        if (next >= reviewQueue.length) {
          set({ reviewQueue: [], reviewCursor: 0 });
          return null;
        }
        set({ reviewCursor: next });
        return reviewQueue[next];
      },
      endReviewSession: () => set({ reviewQueue: [], reviewCursor: 0 }),

      setProgress: (p) => set({ progress: p }),
      setStreak: (s) => set({ streak: s }),
      setStreakState: (s) => set({ streakState: s }),
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
      setLearningVelocity: (velocity) => set({ learningVelocity: velocity }),
      setEffortMatrix: (matrix) => set({ effortMatrix: matrix }),
      setPillarDrift: (d) => set({ pillarDrift: d }),
      setPlanAdjustments: (a) => set({ planAdjustments: a }),
      setCommitments: (c) => set({ commitments: c }),
      setCommitmentReminderHour: (hour) =>
        set({ commitmentReminderHour: Math.min(23, Math.max(0, Math.round(hour))) }),
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
      setQuizMode: (mode) =>
        set({ quizMode: mode, voiceQuizState: 'idle' }),
      setVoiceQuizState: (voiceQuizState) => set({ voiceQuizState }),
    }),
    {
      name: 'personal-tutor-store',
      partialize: (state) => ({
        providerConfig: state.providerConfig,
        voiceConfig: state.voiceConfig,
        forgettingCurveSettings: state.forgettingCurveSettings,
        sidebarCollapsed: state.sidebarCollapsed,
        activePillar: state.activePillar,
        socraticModeByPillar: state.socraticModeByPillar,
        activationQuizEnabled: state.activationQuizEnabled,
        activationQuizLength: state.activationQuizLength,
        commitmentReminderHour: state.commitmentReminderHour,
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

  // Types whose body is rendered as a raw string (no JSON parse).
  const rawTypes = new Set(['diagram', 'key-insight']);

  for (const m of matches) {
    cleanText = cleanText.replace(m.full, '');

    if (rawTypes.has(m.type)) {
      blocks.push({ type: m.type as import('@/data/types').GenUIBlock['type'], data: m.data });
      continue;
    }

    // Structured blocks must contain valid JSON. If the model emitted prose
    // (e.g. a conversational "what's your answer?") inside the tag, the parse
    // fails — drop the block rather than handing a string to a renderer that
    // expects an object (which would crash, e.g. quiz's data.options.map).
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(m.data);
    } catch {
      continue;
    }

    if (!isValidBlockData(m.type, parsedData)) {
      continue;
    }

    blocks.push({
      type: m.type as import('@/data/types').GenUIBlock['type'],
      data: parsedData,
    });
  }

  // Strip any orphaned/half-streamed genui tags the matcher couldn't pair up,
  // so a stray "</genui>" never leaks into the visible message text.
  cleanText = cleanText.replace(/<\/?genui[^>]*>/g, '');

  return { text: cleanText.trim(), blocks };
}

/** Minimal shape validation so a structurally-wrong block is dropped instead of
 *  crashing its renderer. Only checks the fields each renderer dereferences. */
function isValidBlockData(type: string, data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  switch (type) {
    case 'quiz':
      return Array.isArray(d.options) && typeof d.question === 'string';
    case 'flashcard':
      return typeof d.question === 'string' && typeof d.answer === 'string';
    case 'code':
      return typeof d.code === 'string';
    case 'concept-map':
      return Array.isArray(d.nodes) && Array.isArray(d.edges);
    case 'timeline':
      return Array.isArray(d.events);
    case 'session-summary':
      return Array.isArray(d.takeaways) || typeof d.reflection === 'string';
    default:
      return true;
  }
}
