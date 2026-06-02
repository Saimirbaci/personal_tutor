import { useCallback } from 'react';
import { tauriInvoke } from '@/lib/tauri';
import { useAppStore } from '@/store/appStore';
import { PlanAdjustment, ProviderConfig } from '@/data/types';

/** Maps the camelCase Zustand ProviderConfig to the snake_case Rust struct. */
function toRustConfig(c: ProviderConfig) {
  return {
    provider: c.provider,
    api_key: c.apiKey,
    model: c.model,
    base_url: c.baseUrl,
  };
}

/**
 * Owns all weekly-rebalance Tauri calls and store writes. Generates, lists,
 * applies, and dismisses `plan_adjustments` proposals.
 */
export function usePlanRebalance() {
  const planAdjustments = useAppStore((s) => s.planAdjustments);
  const setPlanAdjustments = useAppStore((s) => s.setPlanAdjustments);
  const providerConfig = useAppStore((s) => s.providerConfig);

  const loadAdjustments = useCallback(
    async (limit = 12) => {
      try {
        const list = await tauriInvoke<PlanAdjustment[]>('get_plan_adjustments', { limit });
        setPlanAdjustments(list);
        return list;
      } catch (err) {
        console.error('Failed to load plan adjustments:', err);
        return [];
      }
    },
    [setPlanAdjustments]
  );

  const generate = useCallback(
    async (weekStart?: string) => {
      try {
        const proposal = await tauriInvoke<PlanAdjustment>('generate_plan_rebalance', {
          weekStart: weekStart ?? null,
          config: toRustConfig(providerConfig),
        });
        await loadAdjustments();
        return proposal;
      } catch (err) {
        console.error('Failed to generate plan rebalance:', err);
        return null;
      }
    },
    [providerConfig, loadAdjustments]
  );

  const apply = useCallback(
    async (weekStart: string) => {
      try {
        await tauriInvoke('apply_plan_adjustment', { weekStart });
        await loadAdjustments();
      } catch (err) {
        console.error('Failed to apply plan adjustment:', err);
      }
    },
    [loadAdjustments]
  );

  const dismiss = useCallback(
    async (weekStart: string) => {
      // Optimistic: flip status locally, then persist.
      const current = useAppStore.getState().planAdjustments;
      if (current) {
        setPlanAdjustments(
          current.map((a) => (a.weekStart === weekStart ? { ...a, status: 'dismissed' as const } : a))
        );
      }
      try {
        await tauriInvoke('dismiss_plan_adjustment', { weekStart });
      } catch (err) {
        console.error('Failed to dismiss plan adjustment:', err);
        await loadAdjustments();
      }
    },
    [setPlanAdjustments, loadAdjustments]
  );

  const maybeGenerateDue = useCallback(async () => {
    try {
      return await tauriInvoke<PlanAdjustment | null>('maybe_generate_due_rebalance');
    } catch (err) {
      console.error('Failed to check for due rebalance:', err);
      return null;
    }
  }, []);

  return { planAdjustments, loadAdjustments, generate, apply, dismiss, maybeGenerateDue };
}
