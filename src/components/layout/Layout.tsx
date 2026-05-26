import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import MobileDrawer from './MobileDrawer';
import LogSessionModal from '@/components/dashboard/LogSessionModal';
import { useAppStore } from '@/store/appStore';
import { useMobile } from '@/hooks/useMobile';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { logSessionModalOpen } = useAppStore();
  const isMobile = useMobile();

  return (
    <div className="flex h-screen overflow-hidden bg-[#080d1a]">
      {/* Desktop sidebar — hidden on mobile */}
      {!isMobile && <Sidebar />}

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        {isMobile && <BottomNav />}
      </div>

      {/* Mobile pillars drawer */}
      {isMobile && <MobileDrawer />}

      {logSessionModalOpen && <LogSessionModal />}
    </div>
  );
}
