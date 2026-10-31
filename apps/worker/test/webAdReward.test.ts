/**
 * Rewarded ads on the web build (lib/webAdReward.ts): paid on the client's word,
 * so every limit is tested here.
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

import { eq } from 'drizzle-orm';
import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { parseMonetizationConfig, publicMonetizationConfig, validateMonetizationPatch } from '../src/lib/monetizationConfig';

const app = makeApp();
const UNIT = '/1234567/tophunt_rewarded';
const WEB_ON = { ads: { enabled: true, web: { enabled: true, adUnitPath: UNIT, rewardDiamonds: 2, dailyCap: 2, minWatchSec: 15 } } };

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request(
    '/api',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env)
    .insert(schema.users)
    .values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, lockedCoins: 0, phoneVerified: true, createdAt: ts, updatedAt: ts, ...extra } as any);
}

async function seedConfig(env: TestEnv, monetization: any) {
  await drizzleOf(env)
    .insert(schema.settings)
    .values({ id: 'appConfig', data: { monetization } as any, updatedAt: Date.now() } as any)
    .onConflictDoUpdate({ target: schema.settings.id, set: { data: { monetization } as any } });
  await env.CACHE_KV.delete('settings:appConfig');
}

const user = (env: TestEnv, uid: string) => drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();

async function webEnv(monetization: any = WEB_ON, allow = true) {
  const { env } = makeEnv(allow ? ({ ALLOW_WEB_AD_REWARDS: 'true' } as any) : {});
  await seedConfig(env, monetization);
  await seedUser(env, 'u1');
  return env;
}

/** Start a token, then move the clock past the minimum watch time. */
async function watched(env: TestEnv, uid = 'u1', afterMs = 16_000) {
  const start = await call(env, uid, 'startWebAd');
  expect(start.status, JSON.stringify(start.body)).toBe(200);
  vi.setSystemTime(Date.now() + afterMs);
  return start.body.token as string;
}

afterEach(() => vi.useRealTimers());

describe('web rewarded ads', () => {
  it('pays a watched ad once, in Diamonds, and counts it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv();
    const token = await watched(env);
    const claim = await call(env, 'u1', 'claimWebAdReward', { token });
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    expect(claim.body).toMatchObject({ success: true, reward: 2, lockedCoins: 2, remaining: 1 });
    const u = await user(env, 'u1');
    expect([Number(u!.dpcoin), Number((u as any).lockedCoins)]).toEqual([2, 2]);
    // The same token never pays twice.
    expect((await call(env, 'u1', 'claimWebAdReward', { token })).status).toBe(409);
    expect(Number((await user(env, 'u1'))!.dpcoin)).toBe(2);
    const tasks = await call(env, 'u1', 'getDailyTasks');
    expect(tasks.body.ads.web).toMatchObject({ enabled: true, rewardDiamonds: 2, dailyCap: 2, watchedToday: 1 });
    // App ads keep their own counter.
    expect(tasks.body.ads.watchedToday).toBe(0);
  });

  it('refuses a claim before the minimum watch time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv();
    const token = await watched(env, 'u1', 5_000);
    const r = await call(env, 'u1', 'claimWebAdReward', { token });
    expect(r.status).toBe(412);
    expect(Number((await user(env, 'u1'))!.dpcoin)).toBe(0);
  });

  it('refuses an expired, forged or someone else\'s token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv();
    await seedUser(env, 'u2');
    const token = await watched(env);
    expect((await call(env, 'u2', 'claimWebAdReward', { token })).status).toBe(400);
    const [payload, sig] = token.split('.');
    const forged = `${payload.slice(0, -2)}AA.${sig}`;
    expect((await call(env, 'u1', 'claimWebAdReward', { token: forged })).status).toBe(400);
    expect((await call(env, 'u1', 'claimWebAdReward', { token: 'nope' })).status).toBe(400);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await call(env, 'u1', 'claimWebAdReward', { token })).status).toBe(412);
    expect(Number((await user(env, 'u1'))!.dpcoin)).toBe(0);
  });

  it('stops at the web daily cap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv();
    const t1 = await watched(env);
    const t2 = await watched(env);
    // A third token cannot even be started once the cap is reached by claims...
    expect((await call(env, 'u1', 'claimWebAdReward', { token: t1 })).status).toBe(200);
    expect((await call(env, 'u1', 'claimWebAdReward', { token: t2 })).status).toBe(200);
    expect((await call(env, 'u1', 'startWebAd')).status).toBe(429);
    expect(Number((await user(env, 'u1'))!.dpcoin)).toBe(4);
  });

  it('a token started before the cap was reached still cannot go over it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv();
    const tokens = [await watched(env, 'u1', 0), await watched(env, 'u1', 0), await watched(env, 'u1', 0)];
    vi.setSystemTime(Date.now() + 16_000);
    const codes = [];
    for (const token of tokens) codes.push((await call(env, 'u1', 'claimWebAdReward', { token })).status);
    expect(codes).toEqual([200, 200, 429]);
    expect(Number((await user(env, 'u1'))!.dpcoin)).toBe(4);
  });

  it('needs a verified mobile number unless the admin turns that off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv();
    await seedUser(env, 'nophone', { phoneVerified: false });
    const r = await call(env, 'nophone', 'startWebAd');
    expect(r.status).toBe(412);
    expect(r.body.reason ?? r.body.error?.reason ?? JSON.stringify(r.body)).toContain('phone_not_verified');
    await seedConfig(env, { ads: { ...WEB_ON.ads, web: { ...WEB_ON.ads.web, requireVerifiedPhone: false } } });
    const token = await watched(env, 'nophone');
    expect((await call(env, 'nophone', 'claimWebAdReward', { token })).status).toBe(200);
  });

  it('pays nothing without the deploy switch, the panel switch or an ad unit', async () => {
    for (const [mon, allow] of [
      [WEB_ON, false],
      [{ ads: { ...WEB_ON.ads, web: { ...WEB_ON.ads.web, enabled: false } } }, true],
      [{ ads: { ...WEB_ON.ads, enabled: false } }, true],
      [{ ads: { ...WEB_ON.ads, web: { ...WEB_ON.ads.web, adUnitPath: '' } } }, true],
    ] as const) {
      const env = await webEnv(mon, allow);
      expect((await call(env, 'u1', 'startWebAd')).status, JSON.stringify(mon)).toBe(412);
      expect((await call(env, 'u1', 'getDailyTasks')).body.ads.web.enabled).toBe(false);
    }
  });

  it('respects the shared daily free Diamond cap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = await webEnv({ ...WEB_ON, economy: { dailyFreeDiamondCap: 1 } });
    const token = await watched(env);
    const r = await call(env, 'u1', 'claimWebAdReward', { token });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(Number((await user(env, 'u1'))!.dpcoin)).toBe(0);
  });

  it('validates and exposes the web block', () => {
    expect(() => validateMonetizationPatch({ ads: { web: { adUnitPath: 'ca-app-pub-1/2' } } })).toThrow();
    expect(() => validateMonetizationPatch({ ads: { web: { minWatchSec: 1 } } })).toThrow();
    expect(() => validateMonetizationPatch({ ads: { web: { surprise: true } } })).toThrow();
    expect(() => validateMonetizationPatch({ ads: { web: { enabled: true, adUnitPath: UNIT, rewardDiamonds: 3, dailyCap: 4, minWatchSec: 20, requireVerifiedPhone: false } } })).not.toThrow();
    const d = parseMonetizationConfig({});
    expect(d.ads.web).toMatchObject({ enabled: false, adUnitPath: '', requireVerifiedPhone: true });
    expect(publicMonetizationConfig({ monetization: WEB_ON }).ads.web).toMatchObject({ enabled: true, adUnitPath: UNIT, rewardDiamonds: 2 });
    expect(publicMonetizationConfig({ monetization: { ads: { enabled: true, web: { enabled: true } } } }).ads.web.enabled).toBe(false);
  });
});
