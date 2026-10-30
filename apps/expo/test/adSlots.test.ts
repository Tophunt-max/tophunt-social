import { describe, expect, it } from 'vitest';
import {
  adPositions,
  canShowInterstitial,
  interleaveSponsored,
  isSponsoredRow,
  newFrequencyState,
  recordInterstitial,
  type SponsoredCampaign,
} from '../src/lib/adSlots';

const camp = (id: string, weight = 10): SponsoredCampaign => ({
  id,
  advertiser: 'Acme',
  disclosure: 'Sponsored',
  weight,
  creative: { headline: 'h', body: '', imageUrl: 'https://x/i.png', ctaLabel: 'Go', ctaUrl: 'https://x' },
});

describe('adPositions', () => {
  it('places the first ad at the configured row, then every interval', () => {
    // first ad is row 3 (index 2), then after every 4 more organic rows.
    expect(adPositions(20, { firstPosition: 3, interval: 4, maxPerSession: 10 })).toEqual([2, 7, 12, 17, 22]);
  });
  it('respects the session cap and never trails or leads the list', () => {
    expect(adPositions(20, { firstPosition: 3, interval: 4, maxPerSession: 2 })).toEqual([2, 7]);
    expect(adPositions(2, { firstPosition: 3, interval: 4, maxPerSession: 5 })).toEqual([]);
    expect(adPositions(10, { firstPosition: 1, interval: 4, maxPerSession: 5 })).toEqual([]);
    expect(adPositions(10, { firstPosition: 3, interval: 4, maxPerSession: 0 })).toEqual([]);
  });
});

describe('interleaveSponsored', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}` }));

  it('keeps every organic item, in order', () => {
    const out = interleaveSponsored(items, [camp('a')], { firstPosition: 3, interval: 3, maxPerSession: 5 });
    expect(out.filter((x) => !isSponsoredRow(x))).toEqual(items);
    expect(out.filter(isSponsoredRow)).toHaveLength(3);
    expect(isSponsoredRow(out[2])).toBe(true);
  });

  it('does nothing with no rule or no campaigns', () => {
    expect(interleaveSponsored(items, [], { firstPosition: 3, interval: 3, maxPerSession: 5 })).toEqual(items);
    expect(interleaveSponsored(items, [camp('a')], null)).toEqual(items);
  });

  it('rotates campaigns without back-to-back repeats and is deterministic', () => {
    const rule = { firstPosition: 2, interval: 2, maxPerSession: 4 };
    const a = interleaveSponsored(items, [camp('a', 50), camp('b', 10)], rule).filter(isSponsoredRow).map((r) => r.campaign.id);
    for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
    const b = interleaveSponsored(items, [camp('a', 50), camp('b', 10)], rule).filter(isSponsoredRow).map((r) => r.campaign.id);
    expect(a).toEqual(b);
  });

  it('gives each slot a stable id distinct from battle ids', () => {
    const rows = interleaveSponsored(items, [camp('a')], { firstPosition: 3, interval: 3, maxPerSession: 5 }).filter(isSponsoredRow);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.id.startsWith('sp:'))).toBe(true);
  });
});

describe('canShowInterstitial', () => {
  const rule = { enabled: true, minIntervalSec: 300, maxPerSession: 2, maxPerHour: 3 };
  const t0 = 1_000_000_000;

  it('enforces disable, protected screens, spacing and caps', () => {
    let s = newFrequencyState();
    expect(canShowInterstitial(s, { ...rule, enabled: false }, { now: t0, sessionMaxAds: 10, context: 'feed' })).toBe(false);
    expect(canShowInterstitial(s, rule, { now: t0, sessionMaxAds: 10, context: 'checkout' })).toBe(false);
    expect(canShowInterstitial(s, rule, { now: t0, sessionMaxAds: 10, context: 'chat' })).toBe(false);
    expect(canShowInterstitial(s, rule, { now: t0, sessionMaxAds: 10, context: 'feed' })).toBe(true);
    s = recordInterstitial(s, t0);
    expect(canShowInterstitial(s, rule, { now: t0 + 60_000, sessionMaxAds: 10, context: 'feed' })).toBe(false);
    expect(canShowInterstitial(s, rule, { now: t0 + 301_000, sessionMaxAds: 10, context: 'feed' })).toBe(true);
    s = recordInterstitial(s, t0 + 301_000);
    expect(canShowInterstitial(s, rule, { now: t0 + 900_000, sessionMaxAds: 10, context: 'feed' })).toBe(false); // session cap
  });

  it('enforces the cross-placement session ceiling', () => {
    const s = { shown: [], sessionAds: 5 };
    expect(canShowInterstitial(s, rule, { now: t0, sessionMaxAds: 5, context: 'feed' })).toBe(false);
  });
});
