/**
 * The ad platform as the app sees it (`monetization.adPlatform` in
 * /read/app-config, built by the Worker's lib/adPlatform.ts#publicAdPlatform):
 * which slots are on, for which platform, and the waterfall of networks to try.
 *
 * Slots are fixed in code (AD_SLOT_KEYS). The panel can switch them on and
 * configure them, but cannot add an ad to a screen that has no slot.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { useAuth } from '@/src/hooks/useAuth';
import { useAppConfig } from '@/src/services/appSettings';
import { readApi } from '@/src/services/api';
import { adsSuppressed, attemptTimeout, effectiveRules, getViewerKey, orderAttempts, pickVariant, setDecisions, type ServerDecisions } from './optimizer';

export * from './placementRules';
import { resolvePlacement, type AdPlatformKey, type AdSlotKey, type PublicAdPlatform, type ResolvedPlacement } from './placementRules';

export const AD_PLATFORM: AdPlatformKey = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

/** Server decisions (waterfall order, paused networks, timeouts), shared by every slot. */
export function useAdDecisions(): ServerDecisions | null {
  const { config } = useAppConfig();
  const on = !!(config as any)?.monetization?.adPlatform?.enabled;
  const q = useQuery({
    queryKey: ['ad-decisions'],
    queryFn: async () => (await readApi('/read/ads/decisions')) as ServerDecisions,
    enabled: on,
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (q.data) setDecisions(q.data);
  }, [q.data]);
  return q.data ?? null;
}

/**
 * The placement for `slot` on this device and for this viewer, or null when it
 * should not show: admin config → experiment variant → fatigue → server order,
 * paused networks and timeouts → this device's circuit breakers.
 */
export function useAdPlacement(slot: AdSlotKey): ResolvedPlacement | null {
  const { config } = useAppConfig();
  const { user } = useAuth();
  const decisions = useAdDecisions();
  const cfg = (config as any)?.monetization?.adPlatform as PublicAdPlatform | undefined;
  const created = (user as any)?.metadata?.creationTime ? Date.parse((user as any).metadata.creationTime) : null;
  const signedIn = !!user;
  const key = user?.uid || getViewerKey();
  return useMemo(() => {
    if (adsSuppressed()) return null;
    const base = resolvePlacement(cfg, slot, AD_PLATFORM, { signedIn, accountCreatedAt: Number.isFinite(created) ? created : null });
    if (!base) return null;
    const variant = pickVariant(key, slot, base.experiment);
    const attempts = orderAttempts(slot, AD_PLATFORM, base.attempts).map((a) => ({ ...a, timeoutMs: attemptTimeout(a.network.id, AD_PLATFORM, a.timeoutMs) }));
    if (!attempts.length) return null;
    return { ...base, attempts, rules: effectiveRules(base.rules, variant), variant: variant?.id ?? '-' };
    // `decisions` re-runs this when the server's order changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, slot, signedIn, created, key, decisions]);
}
