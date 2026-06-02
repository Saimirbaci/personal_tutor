type UnlistenFn = () => void;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    return getMockData<T>(cmd, args);
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export async function tauriListen(
  event: string,
  handler: (payload: unknown) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }

  const { listen } = await import('@tauri-apps/api/event');
  return listen(event, (e) => handler(e.payload));
}

export async function tauriEmit(event: string, payload?: unknown): Promise<void> {
  if (!isTauri()) return;
  const { emit } = await import('@tauri-apps/api/event');
  await emit(event, payload);
}

// Mock data for browser development
function getMockData<T>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  const mocks: Record<string, unknown> = {
    get_providers: [
      {
        id: 'anthropic',
        name: 'Anthropic',
        default_model: 'claude-sonnet-4-5',
        available_models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
        requires_api_key: true,
        base_url: null,
      },
      {
        id: 'ollama',
        name: 'Ollama (Local)',
        default_model: 'llama3.2',
        available_models: ['llama3.2', 'llama3.1', 'mistral', 'codellama'],
        requires_api_key: false,
        base_url: 'http://localhost:11434',
      },
    ],
    get_progress: {
      total_hours: { llm: 4.5, hardware: 2.0, sales: 1.5, communication: 1.0, voice: 0.5 },
      target_hours: { llm: 36, hardware: 24, sales: 24, communication: 18, voice: 18 },
      today_sessions: [],
      recent_days: [
        { date: new Date().toISOString().split('T')[0], total_hours: 1.5, pillars: ['llm'] },
      ],
      milestones: [],
    },
    get_streak: 3,
    get_today_schedule: {
      date: new Date().toISOString().split('T')[0],
      day_name: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
      week_number: 1,
      blocks: [
        { pillar: 'llm', duration_min: 60, topic: 'Transformer architecture & attention mechanisms', time_label: '07:00 – 08:00', emoji: '🧠', color: '#2E5FA3' },
        { pillar: 'hardware', duration_min: 45, topic: 'GPU architecture: SMs, CUDA cores', time_label: '12:00 – 12:45', emoji: '⚡', color: '#0E7C86' },
        { pillar: 'sales', duration_min: 30, topic: 'Robotics industry landscape & buyers', time_label: '17:30 – 18:00', emoji: '🤝', color: '#C9762A' },
        { pillar: 'voice', duration_min: 15, topic: 'Diaphragmatic breathing & breath support', time_label: '19:00 – 19:15', emoji: '🎙️', color: '#B54A00' },
      ],
      current_focus: '🧠 LLM — Transformer architecture & attention mechanisms',
    },
    log_session: null,
    record_review_attempt: null,
    get_due_reviews: [],
    get_review_counts: { total: 0, due: 0, dueToday: 0 },
    get_forgetting_curve_due: [],
    mark_review_notified: null,
    update_milestone: null,
    save_provider_config: null,
    schedule_notification: null,
    get_pillar_drift: {
      thresholdDays: 7,
      generatedAt: new Date().toISOString(),
      drifted: [],
    },
    get_plan_adjustments: [],
    maybe_generate_due_rebalance: null,
    generate_plan_rebalance: null,
    apply_plan_adjustment: null,
    dismiss_plan_adjustment: null,
    get_rebalance_settings: {
      driftThresholdDays: 7,
      notifyOnRebalance: true,
      autoApplyRebalance: false,
    },
    set_rebalance_settings: null,
  };

  return Promise.resolve((mocks[cmd] ?? null) as T);
}
