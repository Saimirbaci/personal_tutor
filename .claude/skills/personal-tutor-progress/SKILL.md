---
name: personal-tutor-progress
description: "Progress tracking and spaced repetition for Personal Tutor — session logging, streak calculation, milestone tracking, SM-2 algorithm in review.rs, record_review_attempt, get_due_reviews, ReviewWidget, MorningBriefing aggregator, buildReviewItemId hash. Use for: adding progress features, understanding spaced repetition implementation, debugging review item state, building the ReviewWidget or Dashboard progress section, the morning briefing card. Trigger on: useProgress, useReview, useReviewCounts, useDueReviews, log_session, get_progress, get_streak, record_review_attempt, get_due_reviews, get_review_counts, get_morning_briefing, MorningBriefing, ReviewItem, ReviewCounts, SM-2, spaced repetition, milestones, sessions table."
---

# Personal Tutor — Progress & Spaced Repetition

You have deep knowledge of the progress tracking and SM-2 spaced repetition system. Use this to implement, debug, or extend anything related to session logging, streaks, milestones, or flashcard/quiz review scheduling.

---

## Data Model Overview

```
User completes a study session
         │
         ▼
sessions table (log_session)
  pillar | hours | energy | note | date

User interacts with flashcard/quiz
         │
         ▼
review_items table (record_review_attempt)
  SM-2 algorithm updates ease_factor, interval_days, repetitions, next_due

Progress view reads
         │
         ├── get_progress()    → ProgressData (hours per pillar, total, etc.)
         ├── get_streak()      → number (consecutive active days)
         └── update_milestone() → per-pillar, per-month milestone status
```

---

## Database Schema (from `db/mod.rs`)

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,              -- ISO 8601 date string
    pillar TEXT NOT NULL,            -- PillarId: 'llm' | 'hardware' | etc.
    hours REAL NOT NULL,
    energy INTEGER NOT NULL,         -- 1-5 energy level
    note TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    pillar TEXT NOT NULL,
    month INTEGER NOT NULL,          -- 1, 2, or 3 (sprint month)
    status TEXT NOT NULL,            -- 'pending' | 'in-progress' | 'complete'
    updated_at TEXT NOT NULL,
    UNIQUE(pillar, month)
);

CREATE TABLE IF NOT EXISTS review_items (
    item_id TEXT PRIMARY KEY,        -- deterministic hash (see buildReviewItemId)
    item_type TEXT NOT NULL,         -- 'flashcard' | 'quiz'
    pillar TEXT NOT NULL,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 1,
    repetitions INTEGER NOT NULL DEFAULT 0,
    next_due TEXT NOT NULL,          -- ISO 8601 date, used to schedule reviews
    last_reviewed TEXT               -- nullable
);
```

---

## Rust Commands (`src-tauri/src/commands/progress.rs`)

### `log_session`

```rust
#[tauri::command]
pub async fn log_session(
    state: State<'_, DbState>,
    pillar: String,
    hours: f64,
    energy: i32,
    note: Option<String>,
) -> Result<SessionLog, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    let date = now.format("%Y-%m-%d").to_string();
    let created_at = now.to_rfc3339();
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO sessions (id, date, pillar, hours, energy, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, date, pillar, hours, energy, note, created_at],
        ).map_err(|e| e.to_string())?;
    }
    Ok(SessionLog { id, date, pillar, hours, energy, note, created_at })
}
```

### `get_progress`

Returns aggregated data for the progress dashboard:

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressData {
    pub total_hours: f64,
    pub hours_by_pillar: HashMap<String, f64>,
    pub sessions_this_week: i32,
    pub avg_energy: f64,
    pub milestones: Vec<MilestoneStatus>,
}

#[tauri::command]
pub async fn get_progress(
    state: State<'_, DbState>,
) -> Result<ProgressData, String> { ... }
```

### `get_streak`

```rust
#[tauri::command]
pub async fn get_streak(
    state: State<'_, DbState>,
) -> Result<i32, String> {
    // Count consecutive days with at least one session, going backward from today
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT date FROM sessions ORDER BY date DESC"
    ).map_err(|e| e.to_string())?;
    // Walk backward from today; break on first missing day
    // Returns count of consecutive days
}
```

### `update_milestone`

```rust
#[tauri::command]
pub async fn update_milestone(
    state: State<'_, DbState>,
    pillar: String,
    month: i32,           // 1, 2, or 3
    status: String,       // "pending" | "in-progress" | "complete"
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO milestones (id, pillar, month, status, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(pillar, month) DO UPDATE SET status=?4, updated_at=?5",
        params![uuid, pillar, month, status, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
```

---

## SM-2 Spaced Repetition (`src-tauri/src/commands/review.rs`)

This file uses `db::get_connection(&app)` (fresh connection per call) rather than `DbState`.

### SM-2 Algorithm

```rust
// Quality grades: 0-5 (≥3 is a successful recall)
// 0 = complete blackout, 5 = perfect recall

pub fn calculate_sm2(
    current_ease: f64,
    current_interval: i32,
    current_reps: i32,
    quality: i32,          // 0-5
) -> (f64, i32, i32) {    // (new_ease, new_interval, new_reps)
    
    if quality < 3 {
        // Failed — reset to beginning
        return (current_ease, 1, 0);
    }
    
    let new_ease = (current_ease + 0.1 - (5.0 - quality as f64) * (0.08 + (5.0 - quality as f64) * 0.02))
        .max(1.3);  // floor at 1.3
    
    let new_interval = match current_reps {
        0 => 1,
        1 => 6,
        _ => (current_interval as f64 * current_ease).round() as i32,
    };
    
    let new_reps = current_reps + 1;
    
    (new_ease, new_interval, new_reps)
}
```

### `record_review_attempt`

```rust
#[tauri::command]
pub fn record_review_attempt(
    app: AppHandle,
    item_id: String,
    item_type: String,    // "flashcard" | "quiz"
    pillar: String,
    quality: i32,         // 0-5
) -> Result<(), String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;
    
    // Load or create review item
    let existing = conn.query_row(
        "SELECT ease_factor, interval_days, repetitions FROM review_items WHERE item_id = ?1",
        params![item_id],
        |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?, row.get::<_, i32>(2)?)),
    ).optional().map_err(|e| e.to_string())?;
    
    let (ease, interval, reps) = existing.unwrap_or((2.5, 1, 0));
    let (new_ease, new_interval, new_reps) = calculate_sm2(ease, interval, reps, quality);
    
    let now = chrono::Utc::now();
    let next_due = (now + chrono::Duration::days(new_interval as i64))
        .format("%Y-%m-%d").to_string();
    let last_reviewed = now.format("%Y-%m-%d").to_string();
    
    conn.execute(
        "INSERT INTO review_items (item_id, item_type, pillar, ease_factor, interval_days, repetitions, next_due, last_reviewed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(item_id) DO UPDATE SET
             ease_factor=?4, interval_days=?5, repetitions=?6,
             next_due=?7, last_reviewed=?8",
        params![item_id, item_type, pillar, new_ease, new_interval, new_reps, next_due, last_reviewed],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

### `get_due_reviews`

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub item_id: String,
    pub item_type: String,
    pub pillar: String,
    pub ease_factor: f64,
    pub interval_days: i32,
    pub repetitions: i32,
    pub next_due: String,
    pub last_reviewed: Option<String>,
}

#[tauri::command]
pub fn get_due_reviews(
    app: AppHandle,
    pillar: Option<String>,   // filter by pillar, or all pillars if None
) -> Result<Vec<ReviewItem>, String> {
    let conn = db::get_connection(&app).map_err(|e| e.to_string())?;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    
    // Returns items where next_due <= today
    let sql = match &pillar {
        Some(_) => "SELECT * FROM review_items WHERE next_due <= ?1 AND pillar = ?2 ORDER BY next_due",
        None    => "SELECT * FROM review_items WHERE next_due <= ?1 ORDER BY next_due",
    };
    // ... query execution
}
```

### `get_review_counts`

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCounts {
    pub total: i32,       // all review_items rows
    pub due: i32,         // next_due <= now (overdue + today)
    pub due_today: i32,   // next_due falls on today's local date
}

#[tauri::command]
pub fn get_review_counts(app: AppHandle) -> Result<ReviewCounts, String> { ... }
```

---

## TypeScript Types (`src/data/types.ts`)

```typescript
interface SessionLog {
  id: string;
  date: string;          // 'YYYY-MM-DD'
  pillar: PillarId;
  hours: number;
  energy: number;        // 1-5
  note?: string;
  createdAt: string;
}

interface ProgressData {
  totalHours: number;
  hoursByPillar: Record<PillarId, number>;
  sessionsThisWeek: number;
  avgEnergy: number;
  milestones: MilestoneStatus[];
}

interface MilestoneStatus {
  pillar: PillarId;
  month: 1 | 2 | 3;
  status: 'pending' | 'in-progress' | 'complete';
  updatedAt: string;
}

interface ReviewItem {
  itemId: string;
  itemType: 'flashcard' | 'quiz';
  pillar: PillarId;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextDue: string;       // 'YYYY-MM-DD'
  lastReviewed?: string;
}

interface ReviewCounts {
  total: number;
  due: number;
  dueToday: number;
}

interface MorningBriefing {
  date: string;
  dayName: string;
  weekNumber: number;
  firstBlock: ScheduleBlock | null;
  totalBlocks: number;
  currentFocus: string;
  streak: number;
  reviewCounts: ReviewCounts;
  headline: string;            // pre-formatted, e.g. "🧠 LLM — Attention mechanisms (45 min)"
  notificationBody: string;    // "First up: LLM at 8:00 · 3 reviews due · 🔥 5-day streak"
}
```

---

## Frontend Hooks

### `useProgress` (`src/hooks/useProgress.ts`)

```typescript
export function useProgress() {
  const setProgress = useAppStore((s) => s.setProgress);
  const setStreak = useAppStore((s) => s.setStreak);
  
  const logSession = async (data: {
    pillar: PillarId;
    hours: number;
    energy: number;
    note?: string;
  }) => {
    await tauriInvoke('log_session', data);
    // Refresh progress after logging
    const [progress, streak] = await Promise.all([
      tauriInvoke<ProgressData>('get_progress'),
      tauriInvoke<number>('get_streak'),
    ]);
    setProgress(progress);
    setStreak(streak);
  };
  
  const refreshProgress = async () => {
    const [progress, streak] = await Promise.all([
      tauriInvoke<ProgressData>('get_progress'),
      tauriInvoke<number>('get_streak'),
    ]);
    setProgress(progress);
    setStreak(streak);
  };
  
  const updateMilestone = async (pillar: PillarId, month: 1|2|3, status: MilestoneStatus['status']) => {
    await tauriInvoke('update_milestone', { pillar, month, status });
    await refreshProgress();
  };
  
  return { logSession, refreshProgress, updateMilestone };
}
```

### `useReview` (`src/hooks/useReview.ts`)

```typescript
export function useReview() {
  const recordAttempt = async (params: {
    itemId: string;
    itemType: 'flashcard' | 'quiz';
    pillar: PillarId;
    quality: number;   // 0-5
  }) => {
    // Fire-and-forget — don't block the UI
    tauriInvoke('record_review_attempt', params).catch(console.error);
  };
  
  const getDueReviews = async (pillar?: PillarId): Promise<ReviewItem[]> => {
    return tauriInvoke<ReviewItem[]>('get_due_reviews', { pillar });
  };
  
  return { recordAttempt, getDueReviews };
}
```

### `useReviewCounts` (`src/hooks/useReviewCounts.ts`)

Polls every 60 seconds — displayed on the Dashboard `ReviewWidget`:

```typescript
export function useReviewCounts() {
  const [counts, setCounts] = useState<ReviewCounts | null>(null);
  
  const fetchCounts = async () => {
    const result = await tauriInvoke<ReviewCounts>('get_review_counts');
    setCounts(result);
  };
  
  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000); // every 60s
    return () => clearInterval(interval);
  }, []);
  
  return counts;
}
```

### `useDueReviews` (`src/hooks/useDueReviews.ts`)

```typescript
export function useDueReviews(pillar?: PillarId) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    setLoading(true);
    tauriInvoke<ReviewItem[]>('get_due_reviews', { pillar })
      .then(setReviews)
      .finally(() => setLoading(false));
  }, [pillar]);
  
  return { reviews, loading };
}
```

---

## Morning Briefing Aggregator (`schedule.rs::get_morning_briefing`)

The Dashboard's `MorningBriefing` card calls a single Tauri command that composes
`get_today_schedule`, `get_streak`, and `get_review_counts` into one payload:

```rust
#[tauri::command]
pub fn get_morning_briefing(app: AppHandle, date: String) -> Result<MorningBriefing, String>
```

- Internally calls the three commands above; streak/review errors fall back to zero defaults so the briefing never fails on first run.
- Pre-formats `headline` (first block of the day) and `notificationBody` (joined "First up · N reviews · 🔥 streak").
- Frontend (`src/components/dashboard/MorningBriefing.tsx`) calls `get_morning_briefing` on mount and, if before 12:00 local and not yet fired today (`localStorage['morning-briefing-shown']`), also calls `schedule_notification` to fire a system push.

Lives in `commands/schedule.rs` — not `progress.rs` or `review.rs` — but cross-references both. When changing `ReviewCounts` or `get_streak` signatures, update the briefing struct too.

---

## `ReviewWidget` (Dashboard Component)

The Dashboard shows a `ReviewWidget` with the count of due reviews:

```typescript
// src/components/ReviewWidget.tsx
export function ReviewWidget() {
  const counts = useReviewCounts();
  const setView = useAppStore((s) => s.setView);
  
  if (!counts || counts.dueToday === 0) return null;
  
  return (
    <div className="rounded-lg bg-yellow-900/30 border border-yellow-600/40 p-4"
      onClick={() => setView('progress')}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔁</span>
        <div>
          <p className="font-semibold text-yellow-200">
            {counts.dueToday} review{counts.dueToday !== 1 ? 's' : ''} due
          </p>
          <p className="text-sm text-yellow-400">
            {counts.dueThisWeek} total this week
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

## `buildReviewItemId` — Deterministic Hash

The same flashcard/quiz question always maps to the same review row, so SM-2 state persists across sessions:

```typescript
// src/lib/reviewUtils.ts
export function buildReviewItemId(
  type: 'flashcard' | 'quiz',
  pillar: PillarId,
  question: string
): string {
  // djb2 hash algorithm
  const str = `${type}:${pillar}:${question}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // keep as 32-bit integer
  }
  return `${type}-${pillar}-${Math.abs(hash).toString(16)}`;
}
```

**Key property**: `buildReviewItemId('quiz', 'llm', 'What is self-attention?')` always returns the same string. This lets the same question appear in multiple conversations while updating the same SM-2 row.

---

## Sprint Context (June 1 – Aug 31, 2026)

Progress is tracked against a fixed 3-month sprint:

```typescript
// Used in the system prompt and progress view
export function getWeekNumber(): number {
  const start = new Date('2026-06-01');
  const now = new Date();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / msPerWeek));
}

export function getSprintMonth(): 1 | 2 | 3 {
  const start = new Date('2026-06-01');
  const now = new Date();
  const monthDiff = (now.getFullYear() - start.getFullYear()) * 12
    + (now.getMonth() - start.getMonth());
  return Math.min(3, Math.max(1, monthDiff + 1)) as 1 | 2 | 3;
}
```

Milestones are per `(pillar, month)` — each pillar has 3 milestones (one per sprint month).

---

## Quality Grade Reference (SM-2)

| Grade | Meaning | Result |
|-------|---------|--------|
| 0 | Complete blackout | Reset to interval=1, reps=0 |
| 1 | Incorrect, remembered on seeing answer | Reset to interval=1, reps=0 |
| 2 | Incorrect, easy to recall once seen | Reset to interval=1, reps=0 |
| 3 | Correct with significant difficulty | Passes, ease_factor decreases |
| 4 | Correct after hesitation | Passes, ease_factor slightly decreases |
| 5 | Perfect recall | Passes, ease_factor increases |

**Flashcard interaction**: User flips card → quality=4 (correct with hesitation, conservative)
**Quiz interaction**: Correct answer → quality=5; Wrong answer → quality=1

---

## Debugging Progress Issues

**Symptom: Streak shows 0 after using the app daily**
→ Sessions must have `date` in `YYYY-MM-DD` format. Check that the date stored matches the user's local timezone, not UTC. `chrono::Local::now()` vs `chrono::Utc::now()` — use local for date-based logic.

**Symptom: Review item not appearing as due**
→ Check `next_due` date format. Must be `YYYY-MM-DD`. If `record_review_attempt` hasn't been called yet for this item, it won't appear in `review_items` at all — only items that have been attempted once are tracked.

**Symptom: Different question text produces same item_id**
→ Hash collision (rare but possible). The djb2 hash produces a 32-bit int — collisions theoretically possible. For practical purposes this is acceptable; just be aware.

**Symptom: `get_progress` returns empty `hoursByPillar`**
→ No sessions logged yet, or sessions table empty. Verify `log_session` is being called on form submit.

**Symptom: `record_review_attempt` in `review.rs` conflicts with other commands using `DbState`**
→ `review.rs` uses `db::get_connection(&app)` (fresh connection), NOT `DbState`. Under WAL mode, multiple readers + one writer is safe. Do not change `review.rs` to use `DbState` — it's intentionally separate.
