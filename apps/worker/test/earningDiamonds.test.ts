/**
 * Rewards Center Diamonds: weekly/monthly missions (quests), achievements and
 * contest participation / runner-up rewards. Free-rewards budget, the daily
 * free Diamond cap, the bonus-chasing hold and once-only payment are pinned.
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


import { parseMonetizationConfig, validateMonetizationPatch } from '../src/lib/monetizationConfig';
import { invalidateGamificationCatalog } from '../src/lib/cosmetics';

const bal = async (env: TestEnv, uid: string) => (await env.DB.prepare('SELECT dpcoin, locked_coins FROM users WHERE uid = ?').bind(uid).first<any>());
async function appConfig(env: TestEnv, data: any) {
  const db = drizzleOf(env);
  await db.delete(schema.settings).where(eq(schema.settings.id, 'appConfig'));
  await db.insert(schema.settings).values({ id: 'appConfig', data, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:appConfig');
}
async function budget(env: TestEnv, total: number) {
  const ts = Date.now();
  await env.DB.prepare(`INSERT INTO promo_budgets (id, name, kind, total_coins, status, created_at, updated_at) VALUES ('fr', 'Free', 'free_rewards', ?, 'active', ?, ?)`).bind(total, ts, ts).run();
  return 'fr';
}
async function votes(env: TestEnv, uid: string, n: number) {
  const ts = Date.now();
  for (let i = 0; i < n; i++) {
    await env.DB.prepare(`INSERT INTO votes (id, match_id, voter_uid, voted_for_uid, created_at) VALUES (?, ?, ?, 'x', ?)`).bind(`m${i}_${uid}`, `m${i}`, uid, ts - i).run();
  }
}
const QUEST = { id: 'weekly_votes_d', title: 'Vote in 3 battles', period: 'week', metric: 'votes', target: 3, xp: 10, coins: 25, minLevel: 1, enabled: true };

describe('mission (quest) Diamonds', () => {
  it('pays XP and Diamonds once, from the free-rewards budget, as quest_reward', async () => {
    const env = env0();
    await on(env, { quests: [QUEST] });
    await appConfig(env, { freeRewardsBudgetId: await budget(env, 1000) });
    await seedUser(env, 'alice');
    await votes(env, 'alice', 3);
    const r = await call(env, 'alice', 'claimQuest', { questId: QUEST.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ diamonds: 25 });
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 25, locked_coins: 25 });
    const row = await env.DB.prepare(`SELECT type, locked_delta FROM coin_transactions WHERE uid = 'alice' AND type = 'quest_reward'`).first<any>();
    expect(row).toMatchObject({ type: 'quest_reward', locked_delta: 25 });
    const spent = await env.DB.prepare(`SELECT spent_coins FROM promo_budgets WHERE id = 'fr'`).first<any>();
    expect(Number(spent.spent_coins)).toBe(25);
    expect((await call(env, 'alice', 'claimQuest', { questId: QUEST.id })).status).toBe(409);
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 25 });
    const list = await call(env, 'alice', 'getQuests');
    expect(list.body.quests[0]).toMatchObject({ coins: 25, claimed: true });
  });

  it('respects the daily free Diamond cap (nothing recorded) and an empty budget (retry pays later, once)', async () => {
    const env = env0();
    await on(env, { quests: [QUEST] });
    await appConfig(env, { monetization: { economy: { dailyFreeDiamondCap: 10 } } });
    await seedUser(env, 'alice');
    await votes(env, 'alice', 3);
    const capped = await call(env, 'alice', 'claimQuest', { questId: QUEST.id });
    expect(capped.status).toBe(429);
    expect(capped.body.error.reason).toBe('daily_free_limit');
    expect(await env.DB.prepare(`SELECT 1 FROM quest_claims WHERE uid = 'alice'`).first()).toBeNull();

    await appConfig(env, { freeRewardsBudgetId: await budget(env, 5) });
    const empty = await call(env, 'alice', 'claimQuest', { questId: QUEST.id });
    expect(empty.status).toBe(412);
    expect(empty.body.error.reason).toBe('free_rewards_exhausted');
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 0 });
    await env.DB.prepare(`UPDATE promo_budgets SET total_coins = 100 WHERE id = 'fr'`).run();
    const retry = await call(env, 'alice', 'claimQuest', { questId: QUEST.id });
    expect(retry.status).toBe(200);
    expect(retry.body.diamonds).toBe(25);
    expect((await call(env, 'alice', 'claimQuest', { questId: QUEST.id })).status).toBe(409);
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 25 });
  });

  it('is held while the account has an open abuse flag; validates the Diamond amount', async () => {
    const env = env0();
    await on(env, { quests: [QUEST] });
    await seedUser(env, 'alice');
    await votes(env, 'alice', 3);
    await env.DB.prepare(`INSERT INTO xp_flags (id, uid, kind, detail, status, created_at) VALUES ('f1', 'alice', 'velocity', '{}', 'open', 1)`).run();
    const held = await call(env, 'alice', 'claimQuest', { questId: QUEST.id });
    expect(held.status).toBe(412);
    expect(held.body.error.reason).toBe('rewards_held');
    expect(() => validateProgression({ quests: [{ ...QUEST, coins: -1 }] }, { xpThreshold: 500, xpIncrement: 500 })).toThrow(/Diamond reward/);
  });
});

describe('achievement Diamonds', () => {
  it('an unlocked tier creates one claimable grant, claimed as achievement_reward', async () => {
    const env = env0();
    await on(env);
    await appConfig(env, { freeRewardsBudgetId: await budget(env, 1000) });
    await seedUser(env, 'boss', { role: 'admin' });
    const put = await admin(env, 'PUT', '/gamification/achievements/vote_star', { name: 'Voting Pro', metric: 'votes', threshold: 2, xpReward: 5, diamondReward: 100, rarity: 'rare' });
    expect(put.status).toBe(200);
    invalidateGamificationCatalog();
    await seedUser(env, 'alice');
    await syncProgression(env, 'alice', { full: true });
    await votes(env, 'alice', 2);
    await syncProgression(env, 'alice', { full: true });
    await syncProgression(env, 'alice', { full: true });
    const grants = await env.DB.prepare(`SELECT id, status, coins FROM reward_grants WHERE uid = 'alice' AND source_type = 'achievement'`).all<any>();
    expect(grants.results).toEqual([{ id: 'achievement:vote_star:1:alice', status: 'claimable', coins: 100 }]);
    const ach = await call(env, 'alice', 'getAchievements');
    expect(ach.body.achievements.find((a: any) => a.id === 'vote_star')).toMatchObject({ diamondReward: 100, unlocked: true });
    const claim = await call(env, 'alice', 'claimRewardGrant', { grantId: 'achievement:vote_star:1:alice' });
    expect(claim.status).toBe(200);
    expect(await bal(env, 'alice')).toMatchObject({ dpcoin: 100, locked_coins: 100 });
    expect((await env.DB.prepare(`SELECT type FROM coin_transactions WHERE id = 'reward_grant:achievement:vote_star:1:alice'`).first<any>()).type).toBe('achievement_reward');
    expect((await call(env, 'alice', 'claimRewardGrant', { grantId: 'achievement:vote_star:1:alice' })).status).toBe(409);
  });
});

describe('contest participation and runner-up Diamonds', () => {
  const CR = (over: any = {}) => ({ monetization: { earning: { contestRewards: { enabled: true, participation: 50, runnerUp: 200, paidOnly: true, ...over } } } });
  async function match(env: TestEnv, id: string, entryFee: number) {
    await drizzleOf(env).insert(schema.contestMatches).values({
      id, status: 'active', type: 'photo', title: 't', entryFee, userA: { uid: 'win' } as any, userB: { uid: 'lose' } as any, createdAt: Date.now(),
    } as any);
    return { matchId: id, expectedStatus: 'active' as const, winnerUid: 'win', loserUid: 'lose', rewardAmount: 0, description: 'x', completedAt: Date.now() };
  }

  it('settling a paid match creates participation for both and runner-up for the loser, once', async () => {
    const env = env0();
    await appConfig(env, { ...CR(), freeRewardsBudgetId: await budget(env, 1000) });
    await seedUser(env, 'win');
    await seedUser(env, 'lose');
    const input = await match(env, 'm1', 10);
    await Promise.all([settleWinner(env as any, input), settleWinner(env as any, input)]);
    const rows = await env.DB.prepare(`SELECT id, uid, coins, status FROM reward_grants WHERE source_type = 'contest' ORDER BY id`).all<any>();
    expect(rows.results).toEqual([
      { id: 'contest:m1:participation:lose', uid: 'lose', coins: 50, status: 'claimable' },
      { id: 'contest:m1:participation:win', uid: 'win', coins: 50, status: 'claimable' },
      { id: 'contest:m1:runner_up:lose', uid: 'lose', coins: 200, status: 'claimable' },
    ]);
    // Claimable with the gamification experience OFF (contest economy), shown by getProgression.
    const prog = await call(env, 'lose', 'getProgression');
    expect(prog.body.rewards.claimable.map((g: any) => g.id).sort()).toEqual(['contest:m1:participation:lose', 'contest:m1:runner_up:lose']);
    expect((await call(env, 'lose', 'claimRewardGrant', { grantId: 'contest:m1:runner_up:lose' })).status).toBe(200);
    expect((await env.DB.prepare(`SELECT type FROM coin_transactions WHERE id = 'reward_grant:contest:m1:runner_up:lose'`).first<any>()).type).toBe('contest_reward');
  });

  it('no grants for free matches (paidOnly), when switched off, or for a refunded match', async () => {
    const env = env0();
    await appConfig(env, CR());
    await seedUser(env, 'win');
    await seedUser(env, 'lose');
    await settleWinner(env as any, await match(env, 'free', 0));
    await appConfig(env, CR({ enabled: false }));
    await settleWinner(env as any, await match(env, 'off', 10));
    await appConfig(env, CR());
    await match(env, 'ref', 10);
    await settleRefund(env as any, { matchId: 'ref', expectedStatus: 'active', refunds: [], completedAt: Date.now(), reason: 'x' } as any).catch(() => undefined);
    expect(Number((await env.DB.prepare(`SELECT COUNT(*) AS n FROM reward_grants WHERE source_type = 'contest'`).first<any>()).n)).toBe(0);
  });

  it('a flagged account gets held contest grants; the config is validated and parsed', async () => {
    const env = env0();
    await appConfig(env, CR());
    await seedUser(env, 'win');
    await seedUser(env, 'lose');
    await env.DB.prepare(`INSERT INTO xp_flags (id, uid, kind, detail, status, created_at) VALUES ('f1', 'lose', 'velocity', '{}', 'open', 1)`).run();
    await settleWinner(env as any, await match(env, 'm2', 10));
    const st = await env.DB.prepare(`SELECT uid, status FROM reward_grants WHERE source_type = 'contest' AND id LIKE '%participation%' ORDER BY uid`).all<any>();
    expect(st.results).toEqual([{ uid: 'lose', status: 'held' }, { uid: 'win', status: 'claimable' }]);
    expect((await call(env, 'lose', 'claimRewardGrant', { grantId: 'contest:m2:participation:lose' })).body.error.reason).toBe('rewards_held');
    expect(parseMonetizationConfig({}).earning.contestRewards).toEqual({ enabled: false, participation: 50, runnerUp: 100, paidOnly: true });
    expect(() => validateMonetizationPatch({ earning: { contestRewards: { participation: -1 } } })).toThrow();
    expect(() => validateMonetizationPatch({ earning: { contestRewards: { bonus: 5 } } })).toThrow();
    expect(() => validateMonetizationPatch({ earning: { contestRewards: { enabled: true, participation: 50, runnerUp: 500 } } })).not.toThrow();
  });
});
