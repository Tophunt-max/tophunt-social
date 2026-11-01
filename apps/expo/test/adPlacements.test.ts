/**
 * Ad platform on the client: which waterfall a device gets, list positions,
 * and the per-slot frequency caps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));

import { resolvePlacement, type PublicAdPlatform } from '../src/ads/placementRules';
import { interleaveAdRows, isAdSlotRow } from '../src/lib/adSlots';
import { __resetAdFrequency, canShowAd, recordAdShown } from '../src/ads/frequency';

const all = { web: true, android: true, ios: true };
const CFG: PublicAdPlatform = {
  enabled: true,
  networks: [
    { id: 'gam', type: 'gam', platforms: { web: true, android: false, ios: false }, testMode: false, publisherId: '' },
    { id: 'adsense', type: 'adsense', platforms: { web: true, android: false, ios: false }, testMode: false, publisherId: 'ca-pub-1234567890123456' },
    { id: 'admob', type: 'admob', platforms: { web: false, android: true, ios: true }, testMode: true, publisherId: '' },
    { id: 'house', type: 'house', platforms: all, testMode: false, publisherId: '' },
  ],
  placements: [
    {
      slot: 'home_feed',
      enabled: true,
      platforms: all,
      format: 'native',
      waterfall: [
        { networkId: 'gam', units: { web: '/1/feed' }, timeoutMs: 3000 },
        { networkId: 'adsense', units: { web: '1234567890' }, timeoutMs: 3000 },
        { networkId: 'admob', units: { android: 'ca-app-pub-1/2' }, timeoutMs: 3000 },
        { networkId: 'house', units: { web: '', android: '', ios: '' }, timeoutMs: 2000 },
      ],
      rules: { firstPosition: 4, interval: 8, maxPerSession: 2, maxPerDay: 3, minIntervalSec: 0 },
      audience: { guests: false, newUserGraceDays: 2 },
    },
  ],
};
const member = { signedIn: true, accountCreatedAt: Date.now() - 10 * 86_400_000 };

describe('resolvePlacement', () => {
  it('gives each platform its own waterfall, in order', () => {
    expect(resolvePlacement(CFG, 'home_feed', 'web', member)!.attempts.map((a) => a.network.id)).toEqual(['gam', 'adsense', 'house']);
    expect(resolvePlacement(CFG, 'home_feed', 'android', member)!.attempts.map((a) => a.network.id)).toEqual(['admob', 'house']);
    // No AdMob unit for iOS: only house ads are left.
    expect(resolvePlacement(CFG, 'home_feed', 'ios', member)!.attempts.map((a) => a.network.id)).toEqual(['house']);
  });

  it('respects the master switch, unknown slots, guests and the new-user grace period', () => {
    expect(resolvePlacement({ ...CFG, enabled: false }, 'home_feed', 'web', member)).toBeNull();
    expect(resolvePlacement(CFG, 'blog_list', 'web', member)).toBeNull();
    expect(resolvePlacement(CFG, 'home_feed', 'web', { signedIn: false, accountCreatedAt: null })).toBeNull();
    expect(resolvePlacement(CFG, 'home_feed', 'web', { signedIn: true, accountCreatedAt: Date.now() - 86_400_000 })).toBeNull();
    expect(resolvePlacement(null, 'home_feed', 'web', member)).toBeNull();
  });
});

describe('interleaveAdRows', () => {
  it('puts ad rows at the first position, then every interval, up to the session cap', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}` }));
    const rows = interleaveAdRows(items, 'home_feed', { firstPosition: 4, interval: 8, maxPerSession: 2 });
    const at = rows.map((r, i) => (isAdSlotRow(r) ? i : -1)).filter((i) => i >= 0);
    expect(at.length).toBe(2);
    expect(at[0]).toBe(3);
    expect(rows.filter((r) => !isAdSlotRow(r))).toHaveLength(30);
    expect((rows[at[0]] as any).id).toBe('ad:home_feed:0');
    expect(interleaveAdRows(items, 'home_feed', null)).toHaveLength(30);
  });
});

describe('ad frequency', () => {
  beforeEach(() => __resetAdFrequency());
  const rules = { firstPosition: 1, interval: 8, maxPerSession: 2, maxPerDay: 3, minIntervalSec: 0 };

  it('caps per session', () => {
    expect(canShowAd('home_feed', rules)).toBe(true);
    recordAdShown('home_feed');
    recordAdShown('home_feed');
    expect(canShowAd('home_feed', rules)).toBe(false);
    // Another slot has its own count.
    expect(canShowAd('blog_list', rules)).toBe(true);
  });

  it('keeps full-screen ads apart', () => {
    const r = { ...rules, maxPerSession: 5, minIntervalSec: 300 };
    const t = Date.now();
    recordAdShown('result_exit_interstitial', t);
    expect(canShowAd('result_exit_interstitial', r, t + 60_000)).toBe(false);
    expect(canShowAd('result_exit_interstitial', r, t + 301_000)).toBe(true);
  });

  it('a session cap of 0 means never', () => {
    expect(canShowAd('home_feed', { ...rules, maxPerSession: 0 })).toBe(false);
  });
});
