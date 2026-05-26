import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  BarChart2,
  Settings2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { PILLARS } from '@/data/plan';
import { PillarId } from '@/data/types';
import { cn } from '@/lib/utils';

export default function Sidebar() {
  const { currentView, activePillar, sidebarCollapsed, streak, toggleSidebar, setView } =
    useAppStore();
  const navigate = useNavigate();

  const navMain = [
    {
      label: 'Dashboard',
      icon: <LayoutDashboard size={18} />,
      view: 'dashboard' as const,
      path: '/',
      color: '#C9A84C',
    },
    {
      label: 'AI Tutor',
      icon: <MessageSquare size={18} />,
      view: 'tutor' as const,
      path: '/tutor',
      color: '#2E5FA3',
    },
  ];

  const navBottom = [
    {
      label: 'Progress',
      icon: <BarChart2 size={18} />,
      view: 'progress' as const,
      path: '/progress',
      color: '#C9A84C',
    },
    {
      label: 'Settings',
      icon: <Settings2 size={18} />,
      view: 'settings' as const,
      path: '/settings',
      color: '#4a5568',
    },
  ];

  const handleNav = (view: 'dashboard' | 'tutor' | 'progress' | 'settings', path: string) => {
    setView(view);
    navigate(path);
  };

  const handlePillar = (id: PillarId) => {
    setView('pillar', id);
    navigate(`/pillar/${id}`);
  };

  return (
    <motion.div
      animate={{ width: sidebarCollapsed ? 60 : 220 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="flex flex-col h-full bg-[#080d1a] border-r border-[#1a2540] overflow-hidden flex-shrink-0 relative z-10"
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#1a2540]">
        {!sidebarCollapsed && (
          <span className="text-sm font-bold tracking-widest" style={{ color: '#C9A84C' }}>
            ◈ TUTOR
          </span>
        )}
        {sidebarCollapsed && (
          <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>
            ◈
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540] ml-auto"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        <div className="space-y-0.5 px-2">
          {navMain.map((item) => (
            <NavItem
              key={item.view}
              icon={item.icon}
              label={item.label}
              color={item.color}
              active={currentView === item.view}
              collapsed={sidebarCollapsed}
              onClick={() => handleNav(item.view, item.path)}
            />
          ))}
        </div>

        {/* Pillars section */}
        <div className="mt-4 px-2">
          {!sidebarCollapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5568] px-3 mb-2">
              Pillars
            </p>
          )}
          {sidebarCollapsed && <div className="border-t border-[#1a2540] mx-2 mb-2" />}
          <div className="space-y-0.5">
            {PILLARS.map((pillar) => (
              <NavItem
                key={pillar.id}
                icon={<span className="text-base leading-none">{pillar.emoji}</span>}
                label={pillar.name}
                color={pillar.color}
                active={currentView === 'pillar' && activePillar === pillar.id}
                collapsed={sidebarCollapsed}
                onClick={() => handlePillar(pillar.id)}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-[#1a2540] py-3 px-2 space-y-0.5">
        {navBottom.map((item) => (
          <NavItem
            key={item.view}
            icon={item.icon}
            label={item.label}
            color={item.color}
            active={currentView === item.view}
            collapsed={sidebarCollapsed}
            onClick={() => handleNav(item.view, item.path)}
          />
        ))}

        {/* Streak badge */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 mt-2 rounded-lg bg-[#1a2540]',
            sidebarCollapsed && 'justify-center px-2'
          )}
        >
          <span className="text-base">🔥</span>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-semibold text-[#C9A84C] whitespace-nowrap"
              >
                {streak} day streak
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, color, active, collapsed, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150',
        'text-sm font-medium',
        active
          ? 'bg-[#1a2540] text-[#e2e8f0]'
          : 'text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#0f1629]',
        collapsed && 'justify-center px-2'
      )}
      style={active ? { borderLeft: `3px solid ${color}`, paddingLeft: collapsed ? 8 : 9 } : {}}
    >
      <span style={{ color: active ? color : undefined, flexShrink: 0 }}>{icon}</span>
      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="truncate overflow-hidden whitespace-nowrap"
            style={{ color: active ? color : undefined }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
