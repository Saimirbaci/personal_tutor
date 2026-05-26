import { Bell, Plus, Menu } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { usePlan } from '@/hooks/usePlan';
import { PILLARS } from '@/data/plan';
import { getWeekNumber } from '@/lib/utils';
import { useMobile } from '@/hooks/useMobile';

const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  tutor: 'AI Tutor',
  pillar: 'Pillar',
  progress: 'Progress',
  settings: 'Settings',
};

export default function TopBar() {
  const { currentView, activePillar, setLogSessionModal, setMobileSidebarOpen } = useAppStore();
  const { currentBlock } = usePlan();
  const week = getWeekNumber();
  const today = new Date();
  const isMobile = useMobile();

  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const pillarData = activePillar ? PILLARS.find((p) => p.id === activePillar) : null;
  const title = currentView === 'pillar' && pillarData
    ? pillarData.name
    : VIEW_LABELS[currentView] ?? '';

  // ── Mobile top bar ────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a2540] bg-[#080d1a] flex-shrink-0">
        {/* Hamburger — opens pillars drawer */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="p-2 -ml-1 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-colors"
        >
          <Menu size={20} />
        </button>

        {/* Title */}
        <div className="flex items-center gap-1.5">
          {currentView === 'pillar' && pillarData && (
            <span>{pillarData.emoji}</span>
          )}
          <h1 className="text-sm font-semibold text-[#e2e8f0] truncate max-w-[160px]">{title}</h1>
        </div>

        {/* Log session — icon-only on mobile */}
        <button
          onClick={() => setLogSessionModal(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#2E5FA3] text-white hover:bg-[#3a71c1] transition-colors"
        >
          <Plus size={14} />
          <span>Log</span>
        </button>
      </div>
    );
  }

  // ── Desktop top bar ───────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a2540] bg-[#080d1a] flex-shrink-0">
      {/* Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-[#e2e8f0]">{title}</h1>
        {currentView === 'pillar' && pillarData && (
          <span className="text-xs text-[#4a5568]">{pillarData.emoji}</span>
        )}
      </div>

      {/* Center: Current block indicator */}
      {currentBlock && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium"
          style={{
            borderColor: currentBlock.color + '40',
            backgroundColor: currentBlock.color + '12',
            color: currentBlock.color,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse-glow"
            style={{ backgroundColor: currentBlock.color }}
          />
          <span>{currentBlock.emoji}</span>
          <span className="capitalize">{currentBlock.pillar}</span>
          <span className="text-[#4a5568]">—</span>
          <span>{currentBlock.duration_min} min</span>
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-xs text-[#e2e8f0] font-medium">{dateStr}</p>
          <p className="text-[10px] text-[#4a5568]">Week {week} of 12</p>
        </div>
        <button
          onClick={() => setLogSessionModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2E5FA3] text-white hover:bg-[#3a71c1] transition-colors"
        >
          <Plus size={12} />
          Log Session
        </button>
        <button className="p-2 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] transition-colors">
          <Bell size={16} />
        </button>
      </div>
    </div>
  );
}
