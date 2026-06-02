import { useCallback, useEffect } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { DriftReport } from '@/data/types';

/**
 * Loads pillar drift (planned-but-untouched pillars) into the store.
 * Pass `thresholdDays` to override the configured default; omit to use the
 * backend's stored `drift_threshold_days` setting.
 */
export function useDrift() {
  const pillarDrift = useAppStore((s) => s.pillarDrift);
  const setPillarDrift = useAppStore((s) => s.setPillarDrift);

  const loadDrift = useCallback(
    async (thresholdDays?: number) => {
      try {
        const report = await tauriInvoke<DriftReport>('get_pillar_drift', {
          thresholdDays: thresholdDays ?? null,
        });
        setPillarDrift(report);
      } catch (err) {
        console.error('Failed to load pillar drift:', err);
      }
    },
    [setPillarDrift]
  );

  useEffect(() => {
    loadDrift();
  }, [loadDrift]);

  return { pillarDrift, loadDrift };
}
