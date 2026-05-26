import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { PILLARS } from '@/data/plan';
import { PillarId } from '@/data/types';

export default function MobileDrawer() {
  const { mobileSidebarOpen, setMobileSidebarOpen, currentView, activePillar, setView, streak } =
    useAppStore();
  const navigate = useNavigate();

  const handlePillar = (id: PillarId) => {
    setView('pillar', id);
    navigate(`/pillar/${id}`);
    setMobileSidebarOpen(false);
  };

  return (
    <AnimatePresence>
      {mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setMobileSidebarOpen(false)}
          />

          {/* Drawer panel — slides up from bottom */}
          <motion.div
            key="drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f1629] border-t border-[#1a2540] rounded-t-2xl overflow-hidden"
            style={{ maxHeight: '80vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Handle */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#1a2540]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-widest" style={{ color: '#C9A84C' }}>
                  ◈ TUTOR
                </span>
                <span className="text-xs text-[#4a5568]">🔥 {streak}-day streak</span>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-lg text-[#4a5568] hover:text-[#e2e8f0] hover:bg-[#1a2540]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Pillars grid */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5568] px-5 pt-4 pb-2">
                Learning Pillars
              </p>
              <div className="grid grid-cols-2 gap-2 px-4 pb-6">
                {PILLARS.map((pillar) => {
                  const active = currentView === 'pillar' && activePillar === pillar.id;
                  return (
                    <button
                      key={pillar.id}
                      onClick={() => handlePillar(pillar.id)}
                      className="flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left transition-all"
                      style={{
                        backgroundColor: active ? pillar.color + '18' : '#080d1a',
                        borderColor: active ? pillar.color + '60' : '#1a2540',
                      }}
                    >
                      <span className="text-xl leading-none flex-shrink-0">{pillar.emoji}</span>
                      <span
                        className="text-xs font-medium leading-tight"
                        style={{ color: active ? pillar.color : '#e2e8f0' }}
                      >
                        {pillar.name.split(' ').slice(0, 3).join(' ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
