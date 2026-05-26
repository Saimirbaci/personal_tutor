export type PillarId =
  | 'llm'
  | 'hardware'
  | 'sales'
  | 'communication'
  | 'voice'
  | 'fundraising'
  | 'roadmap'
  | 'security'
  | 'hiring'
  | 'mlops'
  | 'ip'
  | 'finance';

export interface Pillar {
  id: PillarId;
  name: string;
  emoji: string;
  color: string;
  colorMuted: string;
  description: string;
}

export interface CurriculumItem {
  week: string;
  topic: string;
  resource: string;
  status: 'todo' | 'in-progress' | 'done';
}

export interface Milestone {
  month: 1 | 2 | 3;
  description: string;
  indicator: string;
  status: 'pending' | 'in-progress' | 'complete';
}

export interface Resource {
  title: string;
  type: 'Book' | 'Paper' | 'Video' | 'Tool' | 'Course' | 'Blog' | 'Podcast';
  why: string;
  url?: string;
}

export interface PillarData {
  pillar: Pillar;
  goal: string;
  curriculum: { month: number; label: string; items: CurriculumItem[] }[];
  resources: Resource[];
  milestones: Milestone[];
}

export interface SessionLog {
  id: string;
  date: string;
  pillar: PillarId;
  hours: number;
  energy: number;
  note: string;
  created_at?: string;
}

export interface DayProgress {
  date: string;
  total_hours: number;
  pillars: string[];
}

export interface MilestoneStatus {
  pillar: string;
  month: number;
  status: string;
}

export interface ProgressData {
  totalHours: Record<PillarId, number>;
  targetHours: Record<PillarId, number>;
  todaySessions: SessionLog[];
  recentDays: DayProgress[];
  milestones: MilestoneStatus[];
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  genui?: GenUIBlock[];
  timestamp: Date;
}

export interface GenUIBlock {
  type: 'diagram' | 'flashcard' | 'quiz' | 'code' | 'concept-map' | 'timeline' | 'key-insight';
  data: unknown;
}

export interface FlashcardData {
  question: string;
  answer: string;
}

export interface QuizData {
  question: string;
  options: string[];
  correct: number;
  explanation?: string;
}

export interface CodeData {
  language: string;
  code: string;
  filename?: string;
}

export interface ConceptMapData {
  nodes: { id: string; label: string; color?: string }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface TimelineData {
  events: { label: string; description: string; done: boolean }[];
}

export interface ProviderConfig {
  provider: 'anthropic' | 'ollama' | 'openrouter' | 'google';
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  default_model: string;
  available_models: string[];
  requires_api_key: boolean;
  base_url?: string;
}

export interface ScheduleBlock {
  pillar: string;
  duration_min: number;
  topic: string;
  time_label: string;
  emoji: string;
  color: string;
}

export interface TodaySchedule {
  date: string;
  day_name: string;
  week_number: number;
  blocks: ScheduleBlock[];
  current_focus: string;
}

// ── Voice / STT / TTS ─────────────────────────────────────────────────────────

/** whisper-cpp = whisper.cpp via whisper-rs (desktop only)
 *  sherpa-onnx = sherpa-onnx ONNX runtime (desktop + Android) */
export type SttEngine = 'whisper-cpp' | 'sherpa-onnx';
export type SttModel = 'tiny' | 'base' | 'small';

export interface VoiceConfig {
  enabled: boolean;
  sttEngine: SttEngine;
  sttModel: SttModel;
  /** Auto-submit transcript to chat without manual confirmation */
  autoSend: boolean;
  /** Read AI responses aloud via ElevenLabs TTS */
  ttsEnabled: boolean;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
}

export interface SttModelStatus {
  downloaded: boolean;
  sizeMb: number | null;
  path: string | null;
}

export interface DownloadProgress {
  engine: string;
  model: string;
  percent: number;
  downloadedMb: number;
  totalMb: number;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
}

// ── Spaced Repetition ─────────────────────────────────────────────────────────

export type ReviewItemType = 'flashcard' | 'quiz';

export interface ReviewItem {
  itemId: string;
  itemType: ReviewItemType;
  pillar: PillarId | null;
  content: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lastQuality: number | null;
  lastSeen: string;
  nextDue: string;
  createdAt: string;
}

export interface ReviewCounts {
  total: number;
  due: number;
  dueToday: number;
}

export interface MorningBriefing {
  date: string;
  dayName: string;
  weekNumber: number;
  firstBlock: ScheduleBlock | null;
  totalBlocks: number;
  currentFocus: string;
  streak: number;
  reviewCounts: ReviewCounts;
  headline: string;
  notificationBody: string;
}
