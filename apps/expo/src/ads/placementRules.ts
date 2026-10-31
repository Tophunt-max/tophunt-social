/**
 * Pure ad platform types and placement resolution (no React, no native
 * modules), so the rules are unit-tested (test/adPlacements.test.ts).
 * See placements.ts for the hook the screens use.
 */
export const AD_SLOT_KEYS = [
  'home_feed',
  'explore_grid',
  'battle_page',
  'result_page',
  'blog_list',
  'blog_article',
  'leaderboard',
  'share_sheet',
  'entry_share',
  'referral_share',
  'notifications',
  'profile_wins',
  'prizes',
  'hall_of_fame',
  'story_between',
  'story_card',
  'earn_rewarded',
  'contest_join_rewarded',
  'result_exit_interstitial',
] as const;
export type AdSlotKey = (typeof AD_SLOT_KEYS)[number];

export type AdNetworkType = 'admob' | 'gam' | 'adx' | 'adsense' | 'house';
export type AdFormat = 'banner' | 'native' | 'interstitial' | 'rewarded';
export type AdPlatformKey = 'web' | 'android' | 'ios';

export interface PublicAdNetwork {
  id: string;
  type: AdNetworkType;
  platforms: Record<AdPlatformKey, boolean>;
  testMode: boolean;
  publisherId: string;
}

export interface PlacementRules {
  firstPosition: number;
  interval: number;
  maxPerSession: number;
  maxPerDay: number;
  minIntervalSec: number;
}

export interface PublicPlacement {
  slot: AdSlotKey;
  enabled: boolean;
  platforms: Record<AdPlatformKey, boolean>;
  format: AdFormat;
  waterfall: { networkId: string; units: Partial<Record<AdPlatformKey, string>>; timeoutMs: number }[];
  rules: PlacementRules;
  audience: { guests: boolean; newUserGraceDays: number };
}

export interface PublicAdPlatform {
  enabled: boolean;
  networks: PublicAdNetwork[];
  placements: PublicPlacement[];
}

/** One step of a waterfall, resolved for this platform. */
export interface AdAttempt {
  network: PublicAdNetwork;
  /** Ad unit (empty for house ads). */
  unit: string;
  timeoutMs: number;
}

export interface ResolvedPlacement {
  slot: AdSlotKey;
  format: AdFormat;
  rules: PlacementRules;
  attempts: AdAttempt[];
}

const DAY_MS = 86_400_000;

/** Pure resolution, so the rules are unit-tested (test/adPlacements.test.ts). */
export function resolvePlacement(
  cfg: PublicAdPlatform | null | undefined,
  slot: AdSlotKey,
  platform: AdPlatformKey,
  viewer: { signedIn: boolean; accountCreatedAt: number | null },
  now = Date.now(),
): ResolvedPlacement | null {
  if (!cfg?.enabled) return null;
  const p = cfg.placements?.find((x) => x.slot === slot);
  if (!p || !p.enabled || !p.platforms?.[platform]) return null;
  if (!viewer.signedIn && !p.audience?.guests) return null;
  const grace = Number(p.audience?.newUserGraceDays) || 0;
  if (viewer.signedIn && grace > 0 && viewer.accountCreatedAt && now - viewer.accountCreatedAt < grace * DAY_MS) return null;
  const nets = new Map((cfg.networks ?? []).map((n) => [n.id, n]));
  const attempts: AdAttempt[] = [];
  for (const w of p.waterfall ?? []) {
    const network = nets.get(w.networkId);
    if (!network || !network.platforms?.[platform] || !(platform in (w.units ?? {}))) continue;
    const unit = w.units[platform] ?? '';
    if (network.type !== 'house' && !unit) continue;
    attempts.push({ network, unit, timeoutMs: Math.max(500, Number(w.timeoutMs) || 3000) });
  }
  if (!attempts.length) return null;
  return { slot, format: p.format, rules: p.rules, attempts };
}

