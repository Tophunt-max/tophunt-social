/**
 * Ad optimization: event stats + ILRD, invalid-traffic guard, the optimizer
 * (order, health, adaptive timeouts, alerts), revenue import from the AdMob /
 * AdSense APIs, reconciliation, and the new config fields.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';

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
import { utcDay } from '../src/lib/adMetrics';
import { parseAdPlatform, validateAdPlatformPatch } from '../src/lib/adPlatform';
import { adOptimizerJob, computeDecisions, rankWaterfall, readDecisions } from '../src/lib/adOptimizer';
import { adRevenueImportJob, parseAdmobReport, parseAdsenseReport, unitSlotMap } from '../src/lib/adRevenueImport';
import { IVT_MAX_CLICKS_PER_DAY } from '../src/lib/adStats';

const app = makeApp();
const ADMOB_A = 'ca-app-pub-1234567890123456/1111111111';
const NETWORKS = [
  { id: 'adx', type: 'adx', name: 'AdX', enabled: true, platforms: { web: true, android: false, ios: false }, testMode: false },
  { id: 'gam', type: 'gam', name: 'GAM', enabled: true, platforms: { web: true, android: false, ios: false }, testMode: false },
  { id: 'adsense', type: 'adsense', name: 'AdSense', enabled: true, platforms: { web: true, android: false, ios: false }, testMode: false, publisherId: 'ca-pub-1234567890123456' },
  { id: 'admob', type: 'admob', name: 'AdMob', enabled: true, platforms: { web: false, android: true, ios: true }, testMode: false },
  { id: 'house', type: 'house', name: 'House', enabled: true, platforms: { web: true, android: true, ios: true }, testMode: false },
];
const FEED = {
  slot: 'home_feed',
  enabled: true,
  platforms: { web: true, android: true, ios: false },
  format: 'native',
  autoOptimize: true,
  waterfall: [
    { networkId: 'adx', units: { web: '/1234567/adx_feed' }, timeoutMs: 4000 },
    { networkId: 'gam', units: { web: '/1234567/gam_feed' }, timeoutMs: 4000 },
    { networkId: 'adsense', units: { web: '2222222222' }, timeoutMs: 3000 },
    { networkId: 'admob', units: { android: ADMOB_A }, timeoutMs: 3000 },
    { networkId: 'house', units: {}, timeoutMs: 2000 },
  ],
};
const PLATFORM = { enabled: true, networks: NETWORKS, placements: [FEED] };

async function seedConfig(env: TestEnv, adPlatform: any = PLATFORM) {
  await drizzleOf(env)
    .insert(schema.settings)
    .values({ id: 'appConfig', data: { monetization: { adPlatform } } as any, updatedAt: Date.now() } as any)
    .onConflictDoUpdate({ target: schema.settings.id, set: { data: { monetization: { adPlatform } } as any } });
  await env.CACHE_KV.delete('settings:appConfig');
}
async function seedUser(env: TestEnv, uid: string) {
  const ts = Date.now();
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, createdAt: ts, updatedAt: ts } as any);
}
async function api(env: TestEnv, uid: string, action: string, data: any = {}, headers: Record<string, string> = {}) {
  const res = await app.request(
    '/api',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}`, ...headers }, body: JSON.stringify({ action, ...data }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function admin(env: TestEnv, method: string, path: string) {
  const res = await app.request(`/admin${path}`, { method, headers: { Authorization: 'Bearer boss:admin' } }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function stat(env: TestEnv, day: string, platform: string, placement: string, provider: string, c: Partial<Record<string, number>>) {
  await env.DB.prepare(
    `INSERT INTO ad_stats (day, platform, placement, provider, country, variant, requests, fills, impressions, clicks, fails, timeouts, rewards, latency_ms)
     VALUES (?, ?, ?, ?, 'IN', '-', ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(day, platform, placement, provider, c.requests ?? 0, c.fills ?? 0, c.impressions ?? 0, c.clicks ?? 0, c.fails ?? 0, c.timeouts ?? 0, c.latency ?? 0).run();
}

afterEach(() => vi.unstubAllGlobals());

describe('ad stats ingestion', () => {
  it('writes ad_stats (with country, variant, latency) and SDK revenue to ad_ilrd', async () => {
    const { env } = makeEnv();
    await seedConfig(env);
    await seedUser(env, 'u1');
    const r = await api(env, 'u1', 'recordAdEvents', {
      platform: 'android',
      events: [
        { placement: 'home_feed', provider: 'admob', event: 'request', variant: 'b' },
        { placement: 'home_feed', provider: 'admob', event: 'fill', variant: 'b', latencyMs: 640 },
        { placement: 'home_feed', provider: 'admob', event: 'impression', variant: 'b' },
        { placement: 'home_feed', provider: 'admob', event: 'paid', variant: 'b', valueMicros: 2500, currency: 'usd' },
        { placement: 'home_feed', provider: 'admob', event: 'timeout' },
      ],
    }, { 'cf-ipcountry': 'IN' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const s = await env.DB.prepare(`SELECT country, variant, requests, fills, impressions, timeouts, latency_ms FROM ad_stats ORDER BY variant`).all<any>();
    expect(s.results).toEqual([
      { country: 'IN', variant: '-', requests: 0, fills: 0, impressions: 0, timeouts: 1, latency_ms: 0 },
      { country: 'IN', variant: 'b', requests: 1, fills: 1, impressions: 1, timeouts: 0, latency_ms: 640 },
    ]);
    expect(await env.DB.prepare(`SELECT currency, micros, events FROM ad_ilrd`).first()).toEqual({ currency: 'USD', micros: 2500, events: 1 });
  });

  it('switches ads off for an account that clicks far more than people do', async () => {
    const { env } = makeEnv();
    await seedConfig(env);
    await seedUser(env, 'clicker');
    const clicks = Array.from({ length: 10 }, () => ({ placement: 'home_feed', provider: 'admob', event: 'click' }));
    expect((await api(env, 'clicker', 'recordAdEvents', { platform: 'android', events: clicks })).body.adsSuppressedUntil).toBeUndefined();
    const second = await api(env, 'clicker', 'recordAdEvents', { platform: 'android', events: clicks });
    expect(10 + 10).toBeGreaterThan(IVT_MAX_CLICKS_PER_DAY);
    expect(second.body.adsSuppressedUntil).toBeGreaterThan(Date.now());
    expect((await api(env, 'clicker', 'getAdStatus')).body.adsSuppressedUntil).toBeGreaterThan(Date.now());
    expect((await admin(env, 'DELETE', '/monetization/ads/suppression/clicker')).status).toBe(200);
    expect((await api(env, 'clicker', 'getAdStatus')).body.adsSuppressedUntil).toBe(0);
  });
});

describe('optimizer', () => {
  it('ranks by fill × eCPM, moves only networks with enough data, never scores house ads', () => {
    const stats = new Map([
      ['adx', { requests: 1000, fills: 300 }],
      ['gam', { requests: 1000, fills: 800 }],
      ['adsense', { requests: 10, fills: 10 }],
    ]);
    const ecpms = new Map<string, number | null>([['adx', 2], ['gam', 1.5], ['adsense', 9]]);
    const r = rankWaterfall(['adx', 'gam', 'adsense', 'house'], stats, ecpms, new Set(['house']));
    // gam: 0.8 × 1.5 = 1.2 beats adx: 0.3 × 2 = 0.6; adsense has too little data and keeps its place.
    expect(r.order).toEqual(['gam', 'adx', 'adsense', 'house']);
    expect(r.scores.adsense.score).toBeNull();
    expect(r.scores.house.score).toBeNull();
  });

  it('computes order, pauses a failing network, sets adaptive timeouts and alerts once', async () => {
    const { env } = makeEnv();
    await seedConfig(env);
    const today = utcDay(Date.now());
    const yday = utcDay(Date.now() - 86_400_000);
    await stat(env, yday, 'web', 'home_feed', 'adx', { requests: 500, fills: 100, latency: 100 * 400 });
    await stat(env, yday, 'web', 'home_feed', 'gam', { requests: 500, fills: 400, latency: 400 * 300 });
    // AdSense fails almost everything today.
    await stat(env, today, 'web', 'home_feed', 'adsense', { requests: 100, fails: 70, timeouts: 25 });
    await env.DB.prepare(`INSERT INTO ad_ilrd (day, platform, placement, provider, variant, currency, micros, events) VALUES (?, 'web', 'home_feed', 'adx', '-', 'USD', 400000, 100)`).bind(yday).run();

    const d = await computeDecisions(env, parseAdPlatform(PLATFORM));
    expect(d.placements.home_feed.web?.order).toEqual(['gam', 'adx', 'adsense', 'house']);
    expect(d.placements.home_feed.web?.paused).toEqual(['adsense']);
    expect(d.placements.home_feed.web?.explore).toBe(0.1);
    // 2.5 × 300 ms = 750 → floor 1 s; 2.5 × 400 = 1000.
    expect(d.timeouts.gam.web).toBe(1000);
    expect(d.timeouts.adx.web).toBe(1000);

    const job = await adOptimizerJob(env);
    expect(job.paused).toBe(1);
    // The paused network, and (today's fills collapsed with it) a fill-rate drop.
    const kinds = (await env.DB.prepare(`SELECT kind FROM ad_alerts ORDER BY kind`).all<any>()).results.map((r: any) => r.kind);
    expect(kinds).toEqual(['fill_drop', 'network_paused']);
    expect((await readDecisions(env))?.placements.home_feed.web?.paused).toEqual(['adsense']);
    // Same state next hour: no second alert.
    expect((await adOptimizerJob(env)).alerts).toBe(0);
    const pub = await app.request('/read/ads/decisions', {}, env, fakeCtx());
    const body: any = await pub.json();
    expect(body.placements.home_feed.web.paused).toEqual(['adsense']);
    expect(body.scores).toBeUndefined();
  });

  it('alerts on a fill-rate collapse', async () => {
    const { env } = makeEnv();
    await seedConfig(env);
    for (let i = 1; i <= 3; i++) await stat(env, utcDay(Date.now() - i * 86_400_000), 'web', 'battle_page', 'gam', { requests: 300, fills: 240 });
    await stat(env, utcDay(Date.now()), 'web', 'battle_page', 'gam', { requests: 200, fills: 20 });
    const r = await adOptimizerJob(env);
    expect(r.alerts).toBeGreaterThanOrEqual(1);
    const a = await env.DB.prepare(`SELECT kind, placement FROM ad_alerts WHERE kind = 'fill_drop'`).first<any>();
    expect(a).toEqual({ kind: 'fill_drop', placement: 'battle_page' });
  });
});

describe('revenue import', () => {
  const slots = unitSlotMap(parseAdPlatform(PLATFORM));

  it('parses AdMob and AdSense reports and maps units to slots', () => {
    const admob = parseAdmobReport(
      [
        { header: { localizationSettings: { currencyCode: 'USD' } } },
        { row: { dimensionValues: { DATE: { value: '20261029' }, AD_UNIT: { value: ADMOB_A }, PLATFORM: { value: 'Android' } }, metricValues: { AD_REQUESTS: { integerValue: '1000' }, MATCHED_REQUESTS: { integerValue: '900' }, IMPRESSIONS: { integerValue: '850' }, CLICKS: { integerValue: '9' }, ESTIMATED_EARNINGS: { microsValue: '1250000' } } } },
        { row: { dimensionValues: { DATE: { value: '20261029' }, AD_UNIT: { value: 'ca-app-pub-1234567890123456/9999999999' }, PLATFORM: { value: 'iOS' } }, metricValues: { IMPRESSIONS: { integerValue: '5' } } } },
        { footer: { matchingRowCount: 2 } },
      ],
      slots,
    );
    expect(admob[0]).toEqual({ day: '2026-10-29', provider: 'admob', placement: 'home_feed', platform: 'android', requests: 1000, matched: 900, impressions: 850, clicks: 9, micros: 1250000 });
    expect(admob[1]).toMatchObject({ placement: 'all', platform: 'ios', impressions: 5 });
    const adsense = parseAdsenseReport(
      {
        headers: [{ name: 'DATE' }, { name: 'AD_UNIT_ID' }, { name: 'AD_REQUESTS' }, { name: 'MATCHED_AD_REQUESTS' }, { name: 'IMPRESSIONS' }, { name: 'CLICKS' }, { name: 'ESTIMATED_EARNINGS' }],
        rows: [{ cells: [{ value: '2026-10-29' }, { value: 'ca-pub-1234567890123456:2222222222' }, { value: '400' }, { value: '300' }, { value: '290' }, { value: '3' }, { value: '0.87' }] }],
      },
      slots,
    );
    expect(adsense[0]).toEqual({ day: '2026-10-29', provider: 'adsense', placement: 'home_feed', platform: 'web', requests: 400, matched: 300, impressions: 290, clicks: 3, micros: 870000 });
  });

  it('runs the job against the APIs and upserts USD rows, never touching finalized ones', async () => {
    const { env } = makeEnv({
      GOOGLE_ADS_CLIENT_ID: 'id', GOOGLE_ADS_CLIENT_SECRET: 'secret', GOOGLE_ADS_REFRESH_TOKEN: 'rt',
      ADMOB_PUBLISHER_ID: 'pub-1234567890123456', ADSENSE_ACCOUNT_ID: 'pub-1234567890123456',
    } as any);
    await seedConfig(env);
    await env.DB.prepare(
      `INSERT INTO ad_revenue_reports (id, day, provider, placement, platform, impressions, revenue_micros, currency, status, source, created_at, updated_at)
       VALUES ('f', '2026-10-28', 'adsense', 'home_feed', 'web', 1, 1, 'USD', 'finalized', 'manual_import', 0, 0)`,
    ).run();
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: any) => {
      calls.push(String(url));
      if (String(url).startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok' }));
      expect(init?.headers?.Authorization).toBe('Bearer tok');
      if (String(url).includes('admob.googleapis.com')) {
        expect(JSON.parse(init.body).reportSpec.localizationSettings.currencyCode).toBe('USD');
        return new Response(JSON.stringify([{ row: { dimensionValues: { DATE: { value: '20261029' }, AD_UNIT: { value: ADMOB_A }, PLATFORM: { value: 'Android' } }, metricValues: { IMPRESSIONS: { integerValue: '100' }, ESTIMATED_EARNINGS: { microsValue: '500000' } } } }]));
      }
      expect(String(url)).toContain('currencyCode=USD');
      return new Response(JSON.stringify({
        headers: [{ name: 'DATE' }, { name: 'AD_UNIT_ID' }, { name: 'AD_REQUESTS' }, { name: 'MATCHED_AD_REQUESTS' }, { name: 'IMPRESSIONS' }, { name: 'CLICKS' }, { name: 'ESTIMATED_EARNINGS' }],
        rows: [
          { cells: [{ value: '2026-10-28' }, { value: 'ca-pub-1:2222222222' }, { value: '9' }, { value: '9' }, { value: '9' }, { value: '0' }, { value: '5.00' }] },
          { cells: [{ value: '2026-10-29' }, { value: 'ca-pub-1:2222222222' }, { value: '9' }, { value: '9' }, { value: '9' }, { value: '0' }, { value: '1.50' }] },
        ],
      }));
    });
    const r = await adRevenueImportJob(env);
    expect(r.errors).toEqual([]);
    expect([r.admob, r.adsense]).toEqual([1, 2]);
    expect(calls.some((u) => u.includes('/accounts/pub-1234567890123456/networkReport:generate'))).toBe(true);
    const rows = await env.DB.prepare(`SELECT day, provider, placement, platform, revenue_micros, status, source FROM ad_revenue_reports ORDER BY provider, day`).all<any>();
    expect(rows.results).toEqual([
      { day: '2026-10-29', provider: 'admob', placement: 'home_feed', platform: 'android', revenue_micros: 500000, status: 'estimated', source: 'admob_api' },
      { day: '2026-10-28', provider: 'adsense', placement: 'home_feed', platform: 'web', revenue_micros: 1, status: 'finalized', source: 'manual_import' },
      { day: '2026-10-29', provider: 'adsense', placement: 'home_feed', platform: 'web', revenue_micros: 1500000, status: 'estimated', source: 'adsense_api' },
    ]);
  });

  it('reports a refused token as an error and an alert, and does nothing without credentials', async () => {
    const { env } = makeEnv({ GOOGLE_ADS_CLIENT_ID: 'id', GOOGLE_ADS_CLIENT_SECRET: 's', GOOGLE_ADS_REFRESH_TOKEN: 'bad', ADMOB_PUBLISHER_ID: 'pub-1234567890123456' } as any);
    await seedConfig(env);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    const r = await adRevenueImportJob(env);
    expect(r.errors[0]).toContain('invalid_grant');
    expect(await env.DB.prepare(`SELECT kind FROM ad_alerts`).first<any>()).toEqual({ kind: 'import_failed' });
    const { env: bare } = makeEnv();
    expect((await adRevenueImportJob(bare)).errors).toEqual([]);
  });
});

describe('config: optimization fields', () => {
  const one = (pl: any, extra: any = {}) => ({ networks: NETWORKS, placements: [pl], ...extra });
  it('accepts refresh, auto-optimize, experiments, app open and web consent', () => {
    expect(() =>
      validateAdPlatformPatch(
        one(
          {
            ...FEED,
            format: 'banner',
            rules: { refreshSec: 60 },
            experiment: { enabled: true, variants: [{ id: 'a', weight: 50, rules: { interval: 6 } }, { id: 'b', weight: 50, rules: { interval: 10 } }] },
          },
          { webConsent: { enabled: true, publisherId: 'pub-1234567890123456' } },
        ),
      ),
    ).not.toThrow();
    expect(() => validateAdPlatformPatch(one({ slot: 'app_open', format: 'app_open', platforms: { android: true }, waterfall: [{ networkId: 'admob', units: { android: ADMOB_A } }], rules: { minIntervalSec: 14400 } }))).not.toThrow();
    const parsed = parseAdPlatform(one({ ...FEED, experiment: { enabled: true, variants: [{ id: 'a', weight: 30 }, { id: 'b', weight: 70, rules: { interval: 12 } }] } }));
    expect(parsed.placements[0]).toMatchObject({ autoOptimize: true, experiment: { enabled: true, variants: [{ id: 'a', weight: 30 }, { id: 'b', weight: 70, rules: { interval: 12 } }] } });
  });

  it('refuses unsafe values', () => {
    const bad = (p: any, re: RegExp) => expect(() => validateAdPlatformPatch(p)).toThrow(re);
    bad(one({ ...FEED, format: 'banner', rules: { refreshSec: 10 } }), /refreshSec/);
    bad(one({ ...FEED, rules: { refreshSec: 60 } }), /only banner/);
    bad(one({ ...FEED, experiment: { enabled: true, variants: [{ id: 'a', weight: 50 }] } }), /at least 2 variants/);
    bad(one({ ...FEED, experiment: { variants: [{ id: 'A!', weight: 50 }] } }), /variant id/);
    bad(one({ slot: 'app_open', format: 'app_open', platforms: { web: true } }), /apps only/);
    bad(one({ slot: 'app_open', format: 'app_open', rules: { minIntervalSec: 600 } }), /1 hour/);
    bad(one({ ...FEED }, { webConsent: { enabled: true, publisherId: '' } }), /publisher id/);
  });
});
