/**
 * Admin-managed ad platform (lib/adPlatform.ts): validation, what the app sees,
 * ads.txt, and the ad-event providers it adds.
 */
import { vi, describe, it, expect } from 'vitest';

vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user', authTime: Math.floor(Date.now() / 1000) };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));
vi.mock('../src/lib/observability', () => ({ captureError: async () => undefined, logErrorToDb: async () => undefined }));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { parseAdPlatform, publicAdPlatform, validateAdPlatformPatch, webRewardedUnitFrom } from '../src/lib/adPlatform';
import { publicMonetizationConfig, validateMonetizationPatch } from '../src/lib/monetizationConfig';

const app = makeApp();
const ADMOB_UNIT = 'ca-app-pub-1234567890123456/1234567890';
const GAM = '/1234567/tophunt_feed';

const NETWORKS = [
  { id: 'gam', type: 'gam', name: 'Ad Manager', enabled: true, platforms: { web: true, android: false, ios: false }, testMode: false },
  { id: 'adsense', type: 'adsense', name: 'AdSense', enabled: true, platforms: { web: true, android: false, ios: false }, testMode: false, publisherId: 'ca-pub-1234567890123456' },
  { id: 'admob', type: 'admob', name: 'AdMob', enabled: true, platforms: { web: false, android: true, ios: true }, testMode: true },
  { id: 'house', type: 'house', name: 'House', enabled: true, platforms: { web: true, android: true, ios: true }, testMode: false },
];
const FEED = {
  slot: 'home_feed',
  enabled: true,
  platforms: { web: true, android: true, ios: true },
  format: 'native',
  waterfall: [
    { networkId: 'gam', units: { web: GAM }, timeoutMs: 3000 },
    { networkId: 'adsense', units: { web: '1234567890' }, timeoutMs: 3000 },
    { networkId: 'admob', units: { android: ADMOB_UNIT, ios: ADMOB_UNIT }, timeoutMs: 3000 },
    { networkId: 'house', units: {}, timeoutMs: 2000 },
  ],
  rules: { firstPosition: 4, interval: 8, maxPerSession: 6, maxPerDay: 30, minIntervalSec: 0 },
  audience: { guests: true, newUserGraceDays: 1 },
};
const VALID = { enabled: true, networks: NETWORKS, placements: [FEED], adsTxt: 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0', appAdsTxt: '' };

async function admin(env: TestEnv, method: string, path: string, body?: any) {
  const res = await app.request(
    `/admin${path}`,
    { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer boss:admin' }, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const expectBad = (patch: any, msg?: RegExp) => {
  const t = () => validateAdPlatformPatch(clone(patch));
  if (msg) expect(t).toThrow(msg);
  else expect(t).toThrow();
};

describe('ad platform: validation', () => {
  it('accepts a full, valid setup', () => {
    expect(() => validateAdPlatformPatch(clone(VALID))).not.toThrow();
    expect(() => validateMonetizationPatch({ adPlatform: clone(VALID) })).not.toThrow();
  });

  it('refuses networks on platforms they cannot run on, bad ids and missing AdSense ids', () => {
    expectBad({ networks: [{ ...NETWORKS[1], platforms: { android: true } }] }, /does not run on android/);
    expectBad({ networks: [{ ...NETWORKS[2], platforms: { web: true } }] }, /does not run on web/);
    expectBad({ networks: [{ ...NETWORKS[0], id: 'Bad Id' }] });
    expectBad({ networks: [NETWORKS[0], NETWORKS[0]] }, /twice/);
    expectBad({ networks: [{ ...NETWORKS[1], publisherId: '' }] }, /publisher id/);
    expectBad({ networks: [{ ...NETWORKS[0], type: 'facebook' }] });
  });

  it('refuses unknown slots, wrong formats, bad units and impossible waterfalls', () => {
    const one = (pl: any) => ({ networks: NETWORKS, placements: [pl] });
    expectBad(one({ ...FEED, slot: 'checkout_page' }), /unknown slot/);
    expectBad(one({ ...FEED, format: 'interstitial' }), /format/);
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'gam', units: { web: 'ca-app-pub-1/2' } }] }), /Ad Manager ad unit path/);
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'admob', units: { android: '/123/x' } }] }), /AdMob unit id/);
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'nope', units: {} }] }), /unknown network/);
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'gam', units: {} }, { networkId: 'gam', units: {} }] }), /twice/);
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'house', units: { web: '123' } }] }), /house ads take no ad unit/);
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'gam', units: { web: GAM }, timeoutMs: 100 }] }), /timeoutMs/);
    // AdSense and house ads cannot serve rewarded / interstitial.
    expectBad(one({ slot: 'earn_rewarded', format: 'rewarded', waterfall: [{ networkId: 'adsense', units: { web: '1234567890' } }] }), /cannot serve rewarded/);
    expectBad(one({ slot: 'result_exit_interstitial', format: 'interstitial', waterfall: [{ networkId: 'house', units: {} }] }), /cannot serve interstitial/);
    // Interstitials are apps-only and need a real gap.
    expectBad(one({ slot: 'result_exit_interstitial', format: 'interstitial', platforms: { web: true } }), /apps only/);
    expectBad(one({ slot: 'result_exit_interstitial', format: 'interstitial', rules: { minIntervalSec: 10 } }), /60 seconds/);
    // Rewarded in the apps must go through AdMob (SSV).
    expectBad(one({ slot: 'earn_rewarded', format: 'rewarded', waterfall: [{ networkId: 'gam', units: { android: GAM } }] }), /AdMob/);
    expectBad(one({ ...FEED, startsAt: 2000, endsAt: 1000 }), /after the start/);
    expectBad({ ...VALID, surprise: 1 }, /unknown setting/);
    expectBad({ adsTxt: '<script>' }, /characters/);
  });
});

describe('ad platform: AdX', () => {
  const ADX = { id: 'adx', type: 'adx', name: 'Google AdX', enabled: true, platforms: { web: true, android: true, ios: true }, testMode: false };
  it('takes Ad Manager unit paths, runs everywhere and is served first in the waterfall', () => {
    const cfg = { enabled: true, networks: [ADX, ...NETWORKS], placements: [{ ...FEED, waterfall: [{ networkId: 'adx', units: { web: '/1234567/tophunt_adx_feed', android: '/1234567/tophunt_adx_app' } }, ...FEED.waterfall] }] };
    expect(() => validateAdPlatformPatch(clone(cfg))).not.toThrow();
    const feed = publicAdPlatform(parseAdPlatform(cfg)).placements[0];
    expect(feed.waterfall.map((w) => w.networkId)).toEqual(['adx', 'gam', 'adsense', 'admob', 'house']);
    expect(feed.waterfall[0].units).toEqual({ web: '/1234567/tophunt_adx_feed', android: '/1234567/tophunt_adx_app' });
  });
  it('refuses AdMob-style units and app rewarded, and feeds the web rewarded flow', () => {
    const one = (pl: any) => ({ networks: [ADX], placements: [pl] });
    expectBad(one({ ...FEED, waterfall: [{ networkId: 'adx', units: { web: ADMOB_UNIT } }] }), /AdX demand/);
    expectBad(one({ slot: 'earn_rewarded', format: 'rewarded', waterfall: [{ networkId: 'adx', units: { android: '/1/x' } }] }), /AdMob/);
    const cfg = parseAdPlatform({ enabled: true, networks: [ADX], placements: [{ slot: 'earn_rewarded', enabled: true, platforms: { web: true }, format: 'rewarded', waterfall: [{ networkId: 'adx', units: { web: '/1234567/adx_rewarded' } }] }] });
    expect(webRewardedUnitFrom(cfg)).toBe('/1234567/adx_rewarded');
  });
});

describe('ad platform: what the app sees', () => {
  it('only live networks and placements, with the waterfall for each platform', () => {
    const pub = publicAdPlatform(parseAdPlatform(VALID));
    expect(pub.enabled).toBe(true);
    const feed = pub.placements.find((p) => p.slot === 'home_feed')!;
    expect(feed.waterfall.map((w) => w.networkId)).toEqual(['gam', 'adsense', 'admob', 'house']);
    expect(feed.waterfall[0].units).toEqual({ web: GAM });
    expect(feed.waterfall[3].units).toEqual({ web: '', android: '', ios: '' });
    expect(pub.networks.find((n) => n.id === 'adsense')?.publisherId).toBe('ca-pub-1234567890123456');
    expect((pub as any).adsTxt).toBeUndefined();
  });

  it('drops switched-off networks, then platforms that have nothing left to try', () => {
    const cfg = clone(VALID);
    cfg.networks = cfg.networks.map((n: any) => (n.id === 'admob' || n.id === 'house' ? { ...n, enabled: false } : n));
    const feed = publicAdPlatform(parseAdPlatform(cfg)).placements[0];
    expect(feed.waterfall.map((w) => w.networkId)).toEqual(['gam', 'adsense']);
    expect(feed.platforms).toEqual({ web: true, android: false, ios: false });
  });

  it('honours the master switch, the placement switch and the schedule', () => {
    expect(publicAdPlatform(parseAdPlatform({ ...VALID, enabled: false })).placements).toEqual([]);
    expect(publicAdPlatform(parseAdPlatform({ ...VALID, placements: [{ ...FEED, enabled: false }] })).placements).toEqual([]);
    const now = Date.now();
    expect(publicAdPlatform(parseAdPlatform({ ...VALID, placements: [{ ...FEED, startsAt: now + 60_000 }] }), now).placements).toEqual([]);
    expect(publicAdPlatform(parseAdPlatform({ ...VALID, placements: [{ ...FEED, endsAt: now - 1 }] }), now).placements).toEqual([]);
    expect(publicAdPlatform(parseAdPlatform({ ...VALID, placements: [{ ...FEED, startsAt: now - 1, endsAt: now + 60_000 }] }), now).placements).toHaveLength(1);
  });

  it('feeds the web rewarded flow its Ad Manager unit from the Earn slot', () => {
    const cfg = parseAdPlatform({
      ...VALID,
      placements: [{ slot: 'earn_rewarded', enabled: true, platforms: { web: true }, format: 'rewarded', waterfall: [{ networkId: 'gam', units: { web: '/1234567/tophunt_rewarded' } }] }],
    });
    expect(webRewardedUnitFrom(cfg)).toBe('/1234567/tophunt_rewarded');
    const pub = publicMonetizationConfig({ monetization: { ads: { enabled: true, web: { enabled: true } }, adPlatform: cfg } });
    expect(pub.ads.web).toMatchObject({ enabled: true, adUnitPath: '/1234567/tophunt_rewarded' });
  });
});

describe('ad platform: routes', () => {
  async function seeded() {
    const { env } = makeEnv();
    await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: { monetization: { adPlatform: VALID } } as any, updatedAt: Date.now() } as any);
    await env.CACHE_KV.delete('settings:appConfig');
    return env;
  }

  it('serves ads.txt as plain text, and 404s an empty app-ads.txt', async () => {
    const env = await seeded();
    const web = await app.request('/read/ads-txt', {}, env, fakeCtx());
    expect(web.status).toBe(200);
    expect(web.headers.get('content-type')).toContain('text/plain');
    expect(await web.text()).toBe('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
    expect((await app.request('/read/ads-txt?kind=app', {}, env, fakeCtx())).status).toBe(404);
  });

  it('saves through app-settings and reports the registry to the panel', async () => {
    const { env } = makeEnv();
    const bad = await admin(env, 'POST', '/app-settings', { monetization: { adPlatform: { placements: [{ slot: 'login_page' }] } } });
    expect(bad.status).toBe(400);
    const ok = await admin(env, 'POST', '/app-settings', { monetization: { adPlatform: clone(VALID) } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const cfg = await admin(env, 'GET', '/monetization/config');
    expect(cfg.body.effective.adPlatform.placements[0].slot).toBe('home_feed');
    expect(cfg.body.adPlatformRegistry.slots.map((s: any) => s.key)).toContain('result_exit_interstitial');
    const pubCfg = await app.request('/read/app-config', {}, env, fakeCtx());
    const body: any = await pubCfg.json();
    expect(body.monetization.adPlatform.placements[0].waterfall).toHaveLength(4);
  });

  it('records ad events under a network id the admin created', async () => {
    const env = await seeded();
    const ts = Date.now();
    await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid: 'u1', username: 'u1', fullName: 'u1', dpcoin: 0, createdAt: ts, updatedAt: ts } as any);
    const call = (events: any[]) =>
      app.request(
        '/api',
        { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer u1' }, body: JSON.stringify({ action: 'recordAdEvents', platform: 'web', events }) },
        env,
        fakeCtx(),
      );
    expect((await call([{ placement: 'home_feed', event: 'fill', provider: 'adsense' }])).status).toBe(200);
    expect((await call([{ placement: 'home_feed', event: 'fail', provider: 'gam' }])).status).toBe(200);
    expect((await call([{ placement: 'home_feed', event: 'fill', provider: 'evil-network' }])).status).toBe(400);
    expect((await call([{ placement: 'checkout', event: 'fill', provider: 'gam' }])).status).toBe(400);
    const rows = await env.DB.prepare(`SELECT placement, provider, event, count FROM ad_event_counters ORDER BY provider`).all<any>();
    expect(rows.results.map((r: any) => `${r.placement}/${r.provider}/${r.event}`)).toEqual(['home_feed/adsense/fill', 'home_feed/gam/fail']);
  });
});
