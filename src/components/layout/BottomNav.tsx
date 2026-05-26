import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, BarChart2, Settings2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

const TABS = [
  { label: 'Home',     icon: LayoutDashboard, view: 'dashboard' as const, path: '/'          },
  { label: 'Tutor',    icon: MessageSquare,   view: 'tutor'     as const, path: '/tutor'     },
  { label: 'Progress', icon: BarChart2,       view: 'progress'  as const, path: '/progress'  },
  { label: 'Settings', icon: Settings2,       view: 'settings'  as const, path: '/settings'  },
] as const;

export default function BottomNav() {
  const { currentView, setView } = useAppStore();
  const navigate = useNavigate();

  return (
    <nav className="flex-shrink-0 flex items-stretch bg-[#080d1a] border-t border-[#1a2540]"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {TABS.map(({ label, icon: Icon, view, path }) => {
        const active = currentView === view;
        return (
          <button
            key={view}
            onClick={() => { setView(view); navigate(path); }}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
          >
            <Icon
              size={20}
              className="transition-colors"
              style={{ color: active ? '#2E5FA3' : '#4a5568' }}
            />
            <span
              className="text-[10px] font-medium transition-colors"
              style={{ color: active ? '#2E5FA3' : '#4a5568' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
