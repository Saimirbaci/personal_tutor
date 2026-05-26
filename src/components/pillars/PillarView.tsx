import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, BookOpen, Target, Layers } from 'lucide-react';
import { PLAN } from '@/data/plan';
import { PillarId } from '@/data/types';
import { useAppStore } from '@/store/appStore';
import CurriculumList from './CurriculumList';
import ResourceList from './ResourceList';
import MilestoneList from './MilestoneList';

type Tab = 'curriculum' | 'resources' | 'milestones';

export default function PillarView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setView } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>('curriculum');

  const pillarData = PLAN.find((p) => p.pillar.id === id);

  if (!pillarData) {
    return (
      <div className="flex items-center justify-center h-full text-[#4a5568]">
        Pillar not found
      </div>
    );
  }

  const { pillar } = pillarData;

  const handleTutor = () => {
    setView('tutor', pillar.id as PillarId);
    navigate('/tutor');
  };

  const tabs = [
    { id: 'curriculum' as const, label: 'Curriculum', icon: <Layers size={14} /> },
    { id: 'resources' as const, label: 'Resources', icon: <BookOpen size={14} /> },
    { id: 'milestones' as const, label: 'Milestones', icon: <Target size={14} /> },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 border"
          style={{
            borderColor: pillar.color + '40',
            background: `linear-gradient(135deg, ${pillar.color}18 0%, transparent 60%)`,
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border"
                style={{
                  backgroundColor: pillar.color + '20',
                  borderColor: pillar.color + '40',
                }}
              >
                {pillar.emoji}
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#e2e8f0]">{pillar.name}</h1>
                <p className="text-sm text-[#4a5568] mt-1 max-w-lg">{pillar.description}</p>
              </div>
            </div>

            <button
              onClick={handleTutor}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ backgroundColor: pillar.color }}
            >
              <MessageSquare size={15} />
              Ask Tutor
            </button>
          </div>

          <div className="mt-4 pt-4 border-t" style={{ borderColor: pillar.color + '30' }}>
            <p className="text-xs text-[#4a5568] leading-relaxed">
              <span className="font-semibold" style={{ color: pillar.color }}>Goal: </span>
              {pillarData.goal}
            </p>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[#0f1629] rounded-xl border border-[#1a2540]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all"
              style={
                activeTab === tab.id
                  ? { backgroundColor: pillar.color + '20', color: pillar.color }
                  : { color: '#4a5568' }
              }
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'curriculum' && (
            <CurriculumList curriculum={pillarData.curriculum} pillar={pillar} />
          )}
          {activeTab === 'resources' && (
            <ResourceList resources={pillarData.resources} pillar={pillar} />
          )}
          {activeTab === 'milestones' && (
            <MilestoneList milestones={pillarData.milestones} pillar={pillar} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
