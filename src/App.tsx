import { Component, useEffect, useRef, type ReactNode } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// ── App-level error boundary ───────────────────────────────────────────────
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-[#080d1a] text-[#e2e8f0] px-8">
          <div className="max-w-lg w-full rounded-xl border border-red-800/40 bg-red-950/20 p-6 space-y-4">
            <h1 className="text-lg font-bold text-red-400">Something went wrong</h1>
            <p className="text-sm text-[#4a5568]">{err.message}</p>
            <pre className="text-xs font-mono text-red-500/70 bg-[#0f1629] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {err.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg bg-[#2E5FA3] text-sm font-semibold text-white hover:bg-[#3a71c1] transition-all"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import Layout from '@/components/layout/Layout';
import Dashboard from '@/components/dashboard/Dashboard';
import TutorChat from '@/components/tutor/TutorChat';
import PillarView from '@/components/pillars/PillarView';
import ProgressView from '@/components/progress/ProgressView';
import Settings from '@/components/settings/Settings';
import { useAppStore } from '@/store/appStore';
import { useProgress } from '@/hooks/useProgress';
import { runSessionSummary } from '@/hooks/useSessionSummary';
import { useWeeklyDigest } from '@/hooks/useWeeklyDigest';
import { tauriInvoke } from '@/lib/tauri';
import type { ConversationListEntry } from '@/store/appStore';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function App() {
  const { loadProgress } = useProgress();
  const { maybeGenerateDue, loadDigests } = useWeeklyDigest();
  const { currentView, activePillar } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const digestChecked = useRef(false);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  // On-launch catch-up: generate any missing completed-week digest, then refresh
  // the list so it appears in Progress without manual action. Idempotent on the
  // backend (UNIQUE week_start); the ref guards against StrictMode double-mount.
  useEffect(() => {
    if (digestChecked.current) return;
    digestChecked.current = true;
    void (async () => {
      await maybeGenerateDue();
      await loadDigests();
    })();
  }, [maybeGenerateDue, loadDigests]);

  // ── Post-session summary: on-load retry + best-effort window-close trigger ──
  useEffect(() => {
    // Best-effort: summarise the open conversation when the window/app closes.
    const onBeforeUnload = () => {
      const id = useAppStore.getState().activeConversationId;
      if (id) void runSessionSummary(id); // fire-and-forget; not awaited
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    // On launch, backfill summaries for recent conversations that have messages
    // but no summary row (e.g. the app was closed mid-session last time).
    let cancelled = false;
    (async () => {
      try {
        const list = await tauriInvoke<ConversationListEntry[]>('list_conversations');
        if (cancelled) return;
        const candidates = list
          .filter((c) => c.message_count >= 4)
          .slice(0, 3); // cap work on launch
        for (const c of candidates) {
          if (cancelled) break;
          void runSessionSummary(c.id); // short-circuits if a summary already exists
        }
      } catch (err) {
        console.error('summary backfill failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  // Sync store navigation with router
  useEffect(() => {
    switch (currentView) {
      case 'dashboard':
        if (location.pathname !== '/') navigate('/');
        break;
      case 'tutor':
        if (location.pathname !== '/tutor') navigate('/tutor');
        break;
      case 'pillar':
        if (activePillar && location.pathname !== `/pillar/${activePillar}`) {
          navigate(`/pillar/${activePillar}`);
        }
        break;
      case 'progress':
        if (location.pathname !== '/progress') navigate('/progress');
        break;
      case 'settings':
        if (location.pathname !== '/settings') navigate('/settings');
        break;
    }
  }, [currentView, activePillar, navigate, location.pathname]);

  return (
    <AppErrorBoundary>
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={
              <motion.div
                key="dashboard"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <Dashboard />
              </motion.div>
            }
          />
          <Route
            path="/tutor"
            element={
              <motion.div
                key="tutor"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <TutorChat />
              </motion.div>
            }
          />
          <Route
            path="/pillar/:id"
            element={
              <motion.div
                key="pillar"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <PillarView />
              </motion.div>
            }
          />
          <Route
            path="/progress"
            element={
              <motion.div
                key="progress"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <ProgressView />
              </motion.div>
            }
          />
          <Route
            path="/settings"
            element={
              <motion.div
                key="settings"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <Settings />
              </motion.div>
            }
          />
        </Routes>
      </AnimatePresence>
    </Layout>
    </AppErrorBoundary>
  );
}
