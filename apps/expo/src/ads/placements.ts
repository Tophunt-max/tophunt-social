/**
 * The ad platform as the app sees it (`monetization.adPlatform` in
 * /read/app-config, built by the Worker's lib/adPlatform.ts#publicAdPlatform):
 * which slots are on, for which platform, and the waterfall of networks to try.
 *
 * Slots are fixed in code (AD_SLOT_KEYS). The panel can switch them on and
 * configure them, but cannot add an ad to a screen that has no slot.
 */
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@/src/hooks/useAuth';
import { useAppConfig } from '@/src/services/appSettings';

export * from './placementRules';
import { resolvePlacement, type AdPlatformKey, type AdSlotKey, type PublicAdPlatform, type ResolvedPlacement } from './placementRules';

export const AD_PLATFORM: AdPlatformKey = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

/** The placement for `slot` on this device and for this viewer, or null when it should not show. */
export function useAdPlacement(slot: AdSlotKey): ResolvedPlacement | null {
  const { config } = useAppConfig();
  const { user } = useAuth();
  const cfg = (config as any)?.monetization?.adPlatform as PublicAdPlatform | undefined;
  const created = (user as any)?.metadata?.creationTime ? Date.parse((user as any).metadata.creationTime) : null;
  const signedIn = !!user;
  return useMemo(
    () => resolvePlacement(cfg, slot, AD_PLATFORM, { signedIn, accountCreatedAt: Number.isFinite(created) ? created : null }),
    [cfg, slot, signedIn, created],
  );
}
