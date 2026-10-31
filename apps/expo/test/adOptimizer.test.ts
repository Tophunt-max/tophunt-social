/**
 * Client ad optimization (src/ads/optimizer.ts): server order + paused networks,
 * exploration, circuit breaker, adaptive timeouts, experiment buckets, fatigue,
 * suppression.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetAdOptimizer,
  adsSuppressed,
  attemptTimeout,
  effectiveRules,
  fatigueMultiplier,
  networkTripped,
  noteAdShown,
  noteAppBackground,
  noteFullscreenClosed,
  orderAttempts,
  pickVariant,
  recordNetworkResult,
  setAdsSuppressedUntil,
  setDecisions,
} from '../src/ads/optimizer';

const att = (id: string, type = 'gam') => ({ network: { id, type }, unit: 'u', timeoutMs: 3000 });
const ATTEMPTS = [att('adx', 'adx'), att('gam'), att('adsense', 'adsense'), att('house', 'house')];
const ids = (xs: { network: { id: string } }[]) => xs.map((x) => x.network.id);
const RULES = { firstPosition: 4, interval: 8, maxPerSession: 6, maxPerDay: 0, minIntervalSec: 300, refreshSec: 0 };

beforeEach(() => __resetAdOptimizer());

describe('orderAttempts', () => {
  it('keeps the admin order without decisions', () => {
    expect(ids(orderAttempts('home_feed', 'web', ATTEMPTS))).toEqual(['adx', 'gam', 'adsense', 'house']);
  });

  it("applies the server's order and drops paused networks, keeping unranked ones in place", () => {
    setDecisions({ generatedAt: 1, timeouts: {}, placements: { home_feed: { web: { order: ['gam', 'adx', 'house'], paused: ['adsense'], explore: 0 } } } });
    expect(ids(orderAttempts('home_feed', 'web', ATTEMPTS))).toEqual(['gam', 'adx', 'house']);
    // Another platform is untouched.
    expect(ids(orderAttempts('home_feed', 'android', ATTEMPTS))).toEqual(['adx', 'gam', 'adsense', 'house']);
    // A new network the server has not ranked keeps its admin position.
    const withNew = [att('adx', 'adx'), att('new'), att('gam'), att('house', 'house')];
    expect(ids(orderAttempts('home_feed', 'web', withNew))).toEqual(['gam', 'new', 'adx', 'house']);
  });

  it('explores: sometimes puts another (non-house) network first', () => {
    setDecisions({ generatedAt: 1, timeouts: {}, placements: { home_feed: { web: { order: ['gam', 'adx', 'adsense', 'house'], explore: 0.1 } } } });
    const rolls = [0.05, 0.99]; // explore, then pick the last of the others
    let i = 0;
    expect(ids(orderAttempts('home_feed', 'web', ATTEMPTS, () => rolls[i++]))).toEqual(['adsense', 'gam', 'adx', 'house']);
    expect(ids(orderAttempts('home_feed', 'web', ATTEMPTS, () => 0.5))).toEqual(['gam', 'adx', 'adsense', 'house']);
  });

  it('skips a network whose breaker is open on this device', () => {
    const t = Date.now();
    for (let k = 0; k < 5; k++) recordNetworkResult('adx', false, null, t);
    expect(networkTripped('adx', t)).toBe(true);
    expect(ids(orderAttempts('home_feed', 'web', ATTEMPTS, Math.random, t))).toEqual(['gam', 'adsense', 'house']);
    expect(networkTripped('adx', t + 11 * 60_000)).toBe(false);
  });

  it('does not trip on a mostly healthy network', () => {
    const t = Date.now();
    for (let k = 0; k < 4; k++) recordNetworkResult('gam', true, 500, t);
    for (let k = 0; k < 4; k++) recordNetworkResult('gam', false, null, t);
    expect(networkTripped('gam', t)).toBe(false);
  });
});

describe('attemptTimeout', () => {
  it('takes the tightest of admin, server and 3 × local latency, never under 1 s', () => {
    expect(attemptTimeout('gam', 'web', 4000)).toBe(4000);
    setDecisions({ generatedAt: 1, placements: {}, timeouts: { gam: { web: 2500 } } });
    expect(attemptTimeout('gam', 'web', 4000)).toBe(2500);
    recordNetworkResult('gam', true, 400);
    expect(attemptTimeout('gam', 'web', 4000)).toBe(1200);
    recordNetworkResult('fast', true, 100);
    expect(attemptTimeout('fast', 'web', 4000)).toBe(1000);
  });
});

describe('experiments', () => {
  const exp = { enabled: true, variants: [{ id: 'a', weight: 50, rules: {} }, { id: 'b', weight: 50, rules: { interval: 12 } }] };
  it('is stable per viewer and slot and splits roughly by weight', () => {
    expect(pickVariant('user1', 'home_feed', exp)?.id).toBe(pickVariant('user1', 'home_feed', exp)?.id);
    let b = 0;
    for (let i = 0; i < 2000; i++) if (pickVariant(`u${i}`, 'home_feed', exp)?.id === 'b') b++;
    expect(b).toBeGreaterThan(850);
    expect(b).toBeLessThan(1150);
    expect(pickVariant('u', 'home_feed', { ...exp, enabled: false })).toBeNull();
    expect(pickVariant('', 'home_feed', exp)).toBeNull();
  });

  it('applies the variant rules', () => {
    expect(effectiveRules(RULES, { id: 'b', weight: 50, rules: { interval: 12 } }, 1).interval).toBe(12);
  });
});

describe('fatigue', () => {
  it('stretches intervals after many ads and after quick exits from full-screen ads', () => {
    expect(fatigueMultiplier()).toBe(1);
    for (let i = 0; i < 10; i++) noteAdShown();
    expect(fatigueMultiplier()).toBeCloseTo(1.4);
    const t = Date.now();
    noteFullscreenClosed(t);
    noteAppBackground(t + 3000);
    expect(fatigueMultiplier()).toBeCloseTo(1.9);
    const r = effectiveRules(RULES, null);
    expect(r.interval).toBe(Math.round(8 * 1.9));
    expect(r.minIntervalSec).toBe(Math.round(300 * 1.9));
    expect(fatigueMultiplier(100, 10)).toBe(2.5);
  });
});

describe('suppression', () => {
  it('follows the server', () => {
    expect(adsSuppressed()).toBe(false);
    setAdsSuppressedUntil(Date.now() + 60_000);
    expect(adsSuppressed()).toBe(true);
  });
});
