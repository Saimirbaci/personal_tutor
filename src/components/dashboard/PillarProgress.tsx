import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { PILLARS } from '@/data/plan';
import { PillarId } from '@/data/types';
import { formatHours } from '@/lib/utils';

export default function PillarProgress() {
  const { progress, setView } = useAppStore();
  const navigate = useNavigate();

  const handleClick = (id: PillarId) => {
    setView('pillar', id);
    navigate(`/pillar/${id}`);
  };

  return (
    <div className="rounded-xl bg-[#0f1629] border border-[#1a2540] p-5">
      <h2 className="text-sm font-semibold text-[#e2e8f0] mb-4">Sprint Progress</h2>
      <div className="space-y-3">
        {PILLARS.map((pillar) => {
          const logged = progress?.totalHours?.[pillar.id] ?? 0;
          const target = progress?.targetHours?.[pillar.id] ?? 36;
          const pct = Math.min((logged / target) * 100, 100);

          return (
            <div
              key={pillar.id}
              className="flex items-center gap-4 cursor-pointer group"
              onClick={() => handleClick(pillar.id)}
            >
              <div className="flex items-center gap-2 w-40 flex-shrink-0">
                <span className="text-sm leading-none">{pillar.emoji}</span>
                <span className="text-xs text-[#4a5568] group-hover:text-[#e2e8f0] transition-colors truncate">
                  {pillar.name.split(' ')[0]}
                </span>
              </div>

              <div className="flex-1 h-1.5 bg-[#1a2540] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: pillar.color }}
                />
              </div>

              <div className="text-right w-20 flex-shrink-0">
                <span className="text-xs font-mono text-[#4a5568]">
                  {formatHours(logged)}{' '}
                  <span className="text-[#1a2540]">/</span>{' '}
                  {formatHours(target)}
                </span>
              </div>

              <span
                className="text-xs font-semibold w-10 text-right flex-shrink-0"
                style={{ color: pillar.color }}
              >
                {Math.round(pct)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
