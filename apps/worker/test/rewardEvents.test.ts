/**
 * Special events (lib/rewardEvents.ts): admin CRUD, join, server-side task
 * progress since joining, once-only Diamond claims, budgets, cap, hold.
 */
import { vi, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user', authTime: Math.floor(Date.now() / 1000) };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));

vi.mock('../src/lib/firebaseAdmin', () => ({
  lookupAuthUser: async () => ({ email: null, emailVerified: false, phoneNumber: null }),
  revokeRefreshTokens: async () => undefined,
  deleteAuthUser: async () => undefined,
  updateAuthUser: async () => undefined,
  setCustomClaims: async () => undefined,
  getUserByEmail: async () => null,
  sendFcmToToken: async () => ({ ok: true, retryable: false, invalid: false, status: 200 }),
}));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import {
  DEFAULT_PROGRESSION,
  getProgression,
  levelFor,
  levelInfo,
  rankFor,
  sanitizeProgression,
  validateProgression,
  xpForLevel,
} from '../src/lib/progression';
import { awardXp, reconcileXp, reverseXp, xpAwardStatements } from '../src/lib/xpService';
import { syncProgression, tierFor } from '../src/lib/achievements';
import { settleRefund, settleWinner } from '../src/lib/contestSettlement';
import { finalizeSeason, leaderboardPage, myRank, rangeFor } from '../src/lib/seasons';
import { monthPeriod, weekPeriod } from '../src/lib/quests';
import { rewardDayNumber } from '../src/lib/gamification';

const app = makeApp();
const DAY = 86_400_000;
const CURVE = { xpThreshold: 500, xpIncrement: 500, maxLevel: 100 };

const fakeVoteCounter = () => ({ idFromName: (n: string) => n, get: () => ({ engagement: async () => ({ share: 1 }) }) });
const env0 = () => makeEnv({ VOTE_COUNTER: fakeVoteCounter() } as any).env;

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request(
    '/api',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function admin(env: TestEnv, method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else headers['X-Admin-Secret'] = 'test-admin-secret';
  const res = await app.request(`/admin${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function read(env: TestEnv, path: string, uid?: string) {
  const res = await app.request(`/read${path}`, uid ? { headers: { Authorization: `Bearer ${uid}` } } : {}, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, extra: Record<string, any> = {}) {
  const ts = Date.now() - 1000;
  await drizzleOf(env)
    .insert(schema.users)
    .values({ signupCompleted: true, status: 'active', uid, username: uid, fullName: uid, dpcoin: 0, createdAt: ts, updatedAt: ts, ...extra } as any);
}

async function setProgression(env: TestEnv, progression: Record<string, any>, extra: Record<string, any> = {}) {
  const db = drizzleOf(env);
  await db.delete(schema.settings).where(eq(schema.settings.id, 'gamification'));
  await db.insert(schema.settings).values({ id: 'gamification', data: { progression, ...extra } as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:gamification');
}

const on = (env: TestEnv, extra: Record<string, any> = {}) => setProgression(env, { enabled: true, ...extra });



const HOUR = 3_600_000;
/** A vote time after the join and before the claim. */
const afterJoin = async () => { await new Promise((r) => setTimeout(r, 15)); return Date.now() - 10; };
const bal = async (env: TestEnv, uid: string) => (await env.DB.prepare('SELECT dpcoin, locked_coins FROM users WHERE uid = ?').bind(uid).first<any>());
async function appConfig(env: TestEnv, data: any) {
  const db = drizzleOf(env);
  await db.delete(schema.settings).where(eq(schema.settings.id, 'appConfig'));
  await db.insert(schema.settings).values({ id: 'appConfig', data, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:appConfig');
}
async function votes(env: TestEnv, uid: string, n: number, at = Date.now()) {
  for (let i = 0; i < n; i++) {
    await env.DB.prepare(`INSERT INTO votes (id, match_id, voter_uid, voted_for_uid, created_at) VALUES (?, ?, ?, 'x', ?)`).bind(`v${at}_${i}_${uid}`, `m${at}_${i}`, uid, at + i).run();
  }
}
const EVENT = (over: any = {}) => ({
  title: 'Mega Rewards Event', description: 'Vote and win', status: 'active',
  startsAt: Date.now() - HOUR, endsAt: Date.now() + 48 * HOUR,
  tasks: [{ id: 'vote3', title: 'Vote in 3 battles', metric: 'votes', target: 3, coins: 40 }],
  ...over,
});
async function setup(over: any = {}) {
  const env = env0();
  await seedUser(env, 'boss', { role: 'admin' });
  await seedUser(env, 'alice', { createdAt: Date.now() - 30 * 86_400_000 } as any);
  const r = await admin(env, 'PUT', '/earning/events/mega', { create: true, ...EVENT(over) });
  expect(r.status).toBe(200);
  return env;
}

describe('special events', () => {
  it('join, progress counted only after joining, claim once for Diamonds as event_reward', async () => {
    const env = await setup();
    await votes(env, 'alice', 3, Date.now() - 30 * 60_000); // before joining: does not count
    let list = await call(env, 'alice', 'getEvents');
    expect(list.body.events[0]).toMatchObject({ id: 'mega', phase: 'live', joined: false, totalCoins: 40 });
    expect((await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).status).toBe(412);
    expect((await call(env, 'alice', 'joinEvent', { eventId: 'mega' })).status).toBe(200);
    expect((await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).status).toBe(412);
    await votes(env, 'alice', 3, await afterJoin());
    list = await call(env, 'alice', 'getEvents');
    expect(list.body.events[0].tasks[0]).toMatchObject({ progress: 3, claimable: true });
    const ok = await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' });
    expect(ok.status).toBe(200);
    expect(ok.body.diamonds).toBe(40);
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 40, locked_coins: 40 });
    expect((await env.DB.prepare(`SELECT type FROM coin_transactions WHERE id = 'event:mega:vote3:alice'`).first<any>()).type).toBe('event_reward');
    expect((await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).status).toBe(409);
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 40 });
    const stats = await admin(env, 'GET', '/earning/events');
    expect(stats.body.events[0].stats).toEqual({ participants: 1, claims: 1, diamonds: 40 });
  });

  it('event budget, daily cap and the abuse hold', async () => {
    const env = await setup({ totalBudget: 40 });
    await seedUser(env, 'bob', { createdAt: Date.now() - 30 * 86_400_000 } as any);
    for (const u of ['alice', 'bob']) {
      await call(env, u, 'joinEvent', { eventId: 'mega' });
      await votes(env, u, 3, await afterJoin());
    }
    expect((await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).status).toBe(200);
    const out = await call(env, 'bob', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' });
    expect(out.body.error.reason).toBe('event_budget_exhausted');
    expect(await bal(env, 'bob')).toMatchObject({ dpcoin: 0 });

    const env2 = await setup();
    await appConfig(env2, { monetization: { economy: { dailyFreeDiamondCap: 10 } } });
    await call(env2, 'alice', 'joinEvent', { eventId: 'mega' });
    await votes(env2, 'alice', 3, await afterJoin());
    expect((await call(env2, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).body.error.reason).toBe('daily_free_limit');
    await appConfig(env2, {});
    await env2.DB.prepare(`INSERT INTO xp_flags (id, uid, kind, detail, status, created_at) VALUES ('f', 'alice', 'velocity', '{}', 'open', 1)`).run();
    expect((await call(env2, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).body.error.reason).toBe('rewards_held');
  });

  it('scheduled, paused, draft and eligibility rules; claim grace after the end', async () => {
    const env = await setup({ startsAt: Date.now() + HOUR, endsAt: Date.now() + 5 * HOUR });
    expect((await call(env, 'alice', 'getEvents')).body.events[0].phase).toBe('scheduled');
    expect((await call(env, 'alice', 'joinEvent', { eventId: 'mega' })).status).toBe(412);
    await admin(env, 'PUT', '/earning/events/mega', EVENT({ status: 'paused' }));
    expect((await call(env, 'alice', 'getEvents')).body.events).toEqual([]);
    await admin(env, 'PUT', '/earning/events/mega', EVENT({ status: 'draft' }));
    expect((await call(env, 'alice', 'joinEvent', { eventId: 'mega' })).status).toBe(404);
    await admin(env, 'PUT', '/earning/events/mega', EVENT({ requireVerified: true, minAccountAgeDays: 60 }));
    const why = await call(env, 'alice', 'joinEvent', { eventId: 'mega' });
    expect(why.body.error.reason).toBe('event_ineligible');

    // Joined and completed in time, the event ended an hour ago: still claimable (grace).
    await admin(env, 'PUT', '/earning/events/mega', EVENT());
    await call(env, 'alice', 'joinEvent', { eventId: 'mega' });
    await votes(env, 'alice', 3, await afterJoin());
    await env.DB.prepare(`UPDATE reward_events SET ends_at = ? WHERE id = 'mega'`).bind(Date.now() + 5000).run();
    await env.DB.prepare(`UPDATE reward_events SET ends_at = ? WHERE id = 'mega'`).bind(Date.now() - 1).run();
    const late = await call(env, 'alice', 'getEvents');
    expect(late.body.events[0]).toMatchObject({ phase: 'ended' });
    expect((await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' })).status).toBe(200);
  });

  it('admin validation, permissions and locked tasks after claims', async () => {
    const env = await setup();
    await seedUser(env, 'mod', { role: 'moderator' });
    expect((await admin(env, 'PUT', '/earning/events/x2', EVENT(), 'mod:moderator')).status).toBe(403);
    expect((await admin(env, 'PUT', '/earning/events/mega', { create: true, ...EVENT() })).status).toBe(409);
    expect((await admin(env, 'PUT', '/earning/events/bad', EVENT({ endsAt: Date.now() - HOUR }))).status).toBe(400);
    expect((await admin(env, 'PUT', '/earning/events/bad', EVENT({ tasks: [] }))).status).toBe(400);
    expect((await admin(env, 'PUT', '/earning/events/bad', EVENT({ tasks: [{ id: 'a', title: 'x', metric: 'likes', target: 1, coins: 1 }] }))).status).toBe(400);
    expect((await admin(env, 'PUT', '/earning/events/bad', EVENT({ bannerUrl: 'http://evil/x.png' }))).status).toBe(400);
    await call(env, 'alice', 'joinEvent', { eventId: 'mega' });
    await votes(env, 'alice', 3, await afterJoin());
    await call(env, 'alice', 'claimEventTask', { eventId: 'mega', taskId: 'vote3' });
    const locked = await admin(env, 'PUT', '/earning/events/mega', EVENT({ tasks: [{ id: 'vote3', title: 'Vote', metric: 'votes', target: 3, coins: 999 }] }));
    expect(locked.status).toBe(412);
    expect((await admin(env, 'PUT', '/earning/events/mega', EVENT({ totalBudget: 10 }))).status).toBe(400);
    const audit = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE action LIKE 'earning.event.%'`).first<any>();
    expect(Number(audit.n)).toBeGreaterThanOrEqual(1);
  });
});
