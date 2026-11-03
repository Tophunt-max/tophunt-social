/**
 * Level reward integrity (lib/rewardIntegrity.ts): the bonus-chasing hold,
 * clawback when XP drops, restore guards and the unowned-equipped sweep.
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


import { stripUnownedEquipped } from '../src/lib/rewardIntegrity';

const MS = [
  { level: 3, title: 'Three', description: '', items: [], feature: null, coins: 10 },
  { level: 8, title: 'Eight', description: '', items: [], feature: null, coins: 20 },
];
const setXpLevel = (env: TestEnv, uid: string, lvl: number) =>
  env.DB.prepare(`UPDATE users SET xp = ? WHERE uid = ?`).bind(xpForLevel(lvl, CURVE), uid).run();
const owns = async (env: TestEnv, uid: string, itemId: string) =>
  !!(await env.DB.prepare(`SELECT 1 FROM user_inventory WHERE uid = ? AND item_id = ? AND revoked_at IS NULL`).bind(uid, itemId).first());
const grant = (env: TestEnv, uid: string, lvl: number) =>
  env.DB.prepare(`SELECT status FROM reward_grants WHERE id = ?`).bind(`level:${lvl}:${uid}`).first<{ status: string }>();
const xpItemAt = async (env: TestEnv, lvl: number) =>
  (await env.DB.prepare(`SELECT item_id FROM xp_cosmetic_unlocks WHERE unlock_level = ?`).bind(lvl).first<{ item_id: string }>())!.item_id;
const flag = (env: TestEnv, uid: string, id = `velocity:${uid}:1:vote`) =>
  env.DB.prepare(`INSERT INTO xp_flags (id, uid, kind, detail, status, created_at) VALUES (?, ?, 'velocity', '{}', 'open', ?)`).bind(id, uid, Date.now()).run();

describe('bonus-chasing hold', () => {
  it('a flagged account levels up but its level items and Diamond wait for review; closing the flag pays them out', async () => {
    const env = env0();
    await on(env, { milestones: MS });
    await seedUser(env, 'alice');
    await syncProgression(env, 'alice'); // level 1, starter item
    await flag(env, 'alice');
    await setXpLevel(env, 'alice', 4);
    const r = await syncProgression(env, 'alice');
    expect(r).toMatchObject({ levelInfo: { level: 4 }, rewardsHeld: true, newItems: [] });
    expect(await owns(env, 'alice', await xpItemAt(env, 3))).toBe(false);
    expect(await grant(env, 'alice', 3)).toMatchObject({ status: 'held' });
    // A held grant cannot be claimed.
    expect((await call(env, 'alice', 'claimRewardGrant', { grantId: 'level:3:alice' })).status).toBeGreaterThanOrEqual(400);
    expect((await call(env, 'alice', 'getProgression')).body.rewards.held).toBe(true);

    const review = await admin(env, 'PATCH', '/gamification/flags/velocity:alice:1:vote', { status: 'dismissed', note: 'checked' });
    expect(review.status).toBe(200);
    expect(review.body.settled).toMatchObject({ level: 4, held: false, grantsReleased: 1 });
    for (const l of [2, 3, 4]) expect(await owns(env, 'alice', await xpItemAt(env, l))).toBe(true);
    expect(await grant(env, 'alice', 3)).toMatchObject({ status: 'claimable' });
  });

  it('can be switched off', async () => {
    const env = env0();
    await on(env, { milestones: MS, holdRewardsWhenFlagged: false });
    await seedUser(env, 'alice');
    await syncProgression(env, 'alice');
    await flag(env, 'alice');
    await setXpLevel(env, 'alice', 4);
    expect((await syncProgression(env, 'alice'))!.rewardsHeld).toBe(false);
    expect(await owns(env, 'alice', await xpItemAt(env, 4))).toBe(true);
  });
});

describe('level clawback', () => {
  it('reversing XP takes back level items above the new level (unequipped) and unclaimed Diamond; regaining the level restores them', async () => {
    const env = env0();
    await on(env, { milestones: MS });
    await seedUser(env, 'alice');
    await syncProgression(env, 'alice');
    await setXpLevel(env, 'alice', 9);
    await syncProgression(env, 'alice');
    const frame9 = await xpItemAt(env, 9);
    expect(await owns(env, 'alice', frame9)).toBe(true);
    expect((await call(env, 'alice', 'equipCosmetic', { slot: 'frame', itemId: frame9 })).status).toBe(200);
    expect(await grant(env, 'alice', 8)).toMatchObject({ status: 'claimable' });

    const drop = xpForLevel(4, CURVE) - xpForLevel(9, CURVE);
    const res = await admin(env, 'POST', '/gamification/users/alice/xp', { amount: drop, reason: 'farmed votes' });
    expect(res.status).toBe(200);
    expect(res.body.settled).toMatchObject({ level: 4, grantsClawedBack: 1 });
    expect(res.body.settled.itemsRevoked).toContain(frame9);
    expect(await owns(env, 'alice', frame9)).toBe(false);
    expect(await owns(env, 'alice', await xpItemAt(env, 4))).toBe(true);
    expect(await grant(env, 'alice', 8)).toMatchObject({ status: 'clawed_back' });
    expect(await grant(env, 'alice', 3)).toMatchObject({ status: 'claimable' });
    const u = await env.DB.prepare(`SELECT level_seen, json_extract(cosmetics, '$.frame') AS f FROM users WHERE uid = 'alice'`).first<any>();
    expect(u).toMatchObject({ level_seen: 4, f: null });
    const audit = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'gamification.rewards.settle'`).first<any>();
    expect(Number(audit.n)).toBe(1);
    // The clawed-back item cannot be hand-restored.
    expect((await admin(env, 'POST', `/gamification/users/alice/inventory/${frame9}/restore`, { reason: 'try' })).status).toBe(412);

    // Earned again for real: everything comes back, once.
    await setXpLevel(env, 'alice', 9);
    await syncProgression(env, 'alice');
    expect(await owns(env, 'alice', frame9)).toBe(true);
    expect(await grant(env, 'alice', 8)).toMatchObject({ status: 'claimable' });
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM user_inventory WHERE uid = 'alice' AND item_id = ?`).bind(frame9).first<any>();
    expect(Number(rows.n)).toBe(1);
  });

  it('a reversed XP event also settles the account', async () => {
    const env = env0();
    await on(env);
    await seedUser(env, 'alice');
    await syncProgression(env, 'alice');
    await awardXp(env, { uid: 'alice', action: 'admin_adjustment', eventId: 'boost:1', amount: xpForLevel(6, CURVE), sourceType: 'admin', sourceId: 'x', reason: 'r', actor: 'a', ts: Date.now() });
    await syncProgression(env, 'alice');
    const item6 = await xpItemAt(env, 6);
    expect(await owns(env, 'alice', item6)).toBe(true);
    const rev = await admin(env, 'POST', '/gamification/events/boost:1/reverse', { reason: 'farmed' });
    expect(rev.status).toBe(200);
    expect(rev.body.settled.level).toBe(1);
    expect(await owns(env, 'alice', item6)).toBe(false);
  });
});

describe('restore and display guards', () => {
  it('a refunded store item cannot be restored (coins were already returned)', async () => {
    const env = env0();
    await seedUser(env, 'alice');
    await env.DB.prepare(`INSERT INTO reward_catalog (id, type, name, rarity, asset, active, sort, created_at, updated_at) VALUES ('shop_f', 'frame', 'F', 'rare', '{}', 1, 0, 0, 0)`).run();
    await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at, revoked_at, revoke_reason) VALUES ('alice', 'shop_f', 'store', 1, 2, 'store_refund:p1')`).run();
    const r = await admin(env, 'POST', '/gamification/users/alice/inventory/shop_f/restore', { reason: 'please' });
    expect(r.status).toBe(412);
    expect(JSON.stringify(r.body)).toMatch(/refunded/);
  });

  it('the daily sweep unequips cosmetics the account no longer owns', async () => {
    const env = env0();
    await seedUser(env, 'alice', { cosmetics: { frame: 'xp40_frame_default', badge: 'xp40_badge_newbie' } });
    await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at) VALUES ('alice', 'xp40_badge_newbie', 'xp_level', 1)`).run();
    expect(await stripUnownedEquipped(env)).toBe(1);
    const u = await env.DB.prepare(`SELECT cosmetics FROM users WHERE uid = 'alice'`).first<any>();
    expect(JSON.parse(u.cosmetics)).toEqual({ badge: 'xp40_badge_newbie' });
    expect(await stripUnownedEquipped(env)).toBe(0);
  });
});
