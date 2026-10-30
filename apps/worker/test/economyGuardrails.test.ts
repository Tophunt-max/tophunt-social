/**
 * Economy guardrails (lib/economyLimits.ts, config `monetization.economy`):
 * contest platform fee, shared daily free Diamond cap, monthly DP coin win cap,
 * same-opponent XP farming, Hall of Fame under the free-rewards budget, and the
 * economy health report.
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

import { eq } from 'drizzle-orm';
import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { settleWinner } from '../src/lib/contestSettlement';
import { computeMoneyHealth } from '../src/lib/moneyHealth';
import { adjustUserWallet } from '../src/lib/money';
import { monthlyHallOfFame } from '../src/cron';
import { contestPrizeCoins } from '../src/lib/economyLimits';

const app = makeApp();
const PW = 'secret-123';
const BANNER = 'https://media.test/contest-banners/2026/01/x.jpg';

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function admin(env: TestEnv, method: string, path: string, body?: any, who = 'boss:admin') {
  const res = await app.request(`/admin${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who}` }, body: body ? JSON.stringify(body) : undefined }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function seedUser(env: TestEnv, uid: string, extra: Record<string, any> = {}) {
  const ts = Date.now() - 30 * 86_400_000;
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, createdAt: ts, updatedAt: ts, ...extra } as any);
}
async function seedPlayer(env: TestEnv, uid: string, diamonds: number) {
  await seedUser(env, uid);
  await adjustUserWallet(env as any, { uid, amount: diamonds, direction: 'add', type: 'purchase', description: 'test diamonds', locked: true });
}
const user = (env: TestEnv, uid: string) => drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();
async function settings(env: TestEnv, data: any) {
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data, updatedAt: Date.now() } as any).onConflictDoUpdate({ target: schema.settings.id, set: { data } });
  await env.CACHE_KV.delete('settings:appConfig');
}
const economy = (e: Record<string, number>, extra: any = {}) => ({ ...extra, monetization: { ...(extra.monetization || {}), economy: e } });
async function expectBalanced(env: TestEnv) {
  const h = await computeMoneyHealth(env as any);
  expect(h.ledgerDrift.count).toBe(0);
  expect(h.lockedDrift).toMatchObject({ count: 0, overBalance: 0 });
  expect(h.staleReservations).toBe(0);
}
async function seedMatch(env: TestEnv, id: string, a: string, b: string) {
  await drizzleOf(env).insert(schema.contestMatches).values({
    id, status: 'active', type: 'photo', title: 't', entryFee: 0,
    userA: { uid: a, username: a }, userB: { uid: b, username: b }, createdAt: Date.now(),
  } as any);
}
const win = (env: TestEnv, matchId: string, winnerUid: string, loserUid: string, rewardAmount: number) =>
  settleWinner(env as any, { matchId, contestId: null as any, expectedStatus: 'active', winnerUid, loserUid, rewardAmount, description: 'win', completedAt: Date.now() });

describe('contest platform fee', () => {
  it('computes the prize from the pot and exempts promo and product contests', () => {
    expect(contestPrizeCoins({ rewardCoins: 100, totalEntryFee: 100 }, 25)).toBe(75);
    expect(contestPrizeCoins({ rewardCoins: 50, totalEntryFee: 100 }, 25)).toBe(50);
    expect(contestPrizeCoins({ rewardCoins: 100, totalEntryFee: 10 }, 0)).toBe(10); // never above the pot
    expect(contestPrizeCoins({ rewardCoins: 100, totalEntryFee: 100, subsidyBudgetId: 'b' }, 25)).toBe(100);
    expect(contestPrizeCoins({ rewardCoins: 7, totalEntryFee: 101 }, 25)).toBe(7);
  });

  it('a new match snapshots the prize after the fee, the listing shows it, and settlement keeps the fee', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss');
    await seedPlayer(env, 'al', 100);
    await seedPlayer(env, 'bo', 100);
    await settings(env, economy({ contestPlatformFeePercent: 25 }));
    const cid = (await admin(env, 'POST', '/contests', { title: 'Fee', type: 'photo', status: 'live', totalEntryFee: 20, rewardCoins: 20, bannerUrl: BANNER })).body.id;
    const list: any = await (await app.request('/read/contests', {}, env, fakeCtx())).json();
    expect(list.find((x: any) => x.id === cid)).toMatchObject({ rewardCoins: 15 });

    const m = (await call(env, 'al', 'startMatch', { contestId: cid, mediaUrl: 'https://m.test/a.jpg', mediaType: 'photo', deviceId: 'd-a' })).body.matchId;
    expect(await drizzleOf(env).select().from(schema.contestMatches).where(eq(schema.contestMatches.id, m)).get()).toMatchObject({ prizeCoins: 15 });
    expect((await call(env, 'bo', 'joinMatch', { matchId: m, mediaUrl: 'https://m.test/b.jpg', mediaType: 'photo', deviceId: 'd-b' })).status).toBe(200);
    expect(await win(env, m, 'bo', 'al', 15)).toBe(true);
    const fee = await env.DB.prepare(`SELECT coins FROM platform_ledger WHERE kind = 'platform_fee' AND match_id = ?`).bind(m).first<any>();
    expect(fee.coins).toBe(5);
    await expectBalanced(env);
  });
});

describe('daily free Diamond cap', () => {
  it('is shared by ads, check-in, tasks and XP conversion, and a refused claim leaves nothing behind', async () => {
    const { env } = makeEnv({ ALLOW_UNVERIFIED_AD_REWARDS: 'true' } as any);
    await seedUser(env, 'al', { xp: 1000 });
    await settings(env, economy(
      { dailyFreeDiamondCap: 12 },
      {
        ads: { enabled: true, trustClient: true, provider: 't', reward: 5, dailyCap: 10 },
        monetization: { earning: { xpConversion: { enabled: true, xpPerDiamond: 100, maxDiamondsPerDay: 20 } } },
      },
    ));
    expect((await call(env, 'al', 'claimAdReward')).status).toBe(200);
    expect((await call(env, 'al', 'claimAdReward')).status).toBe(200);
    // Check-in pays 10 by default: 10 + 10 > 12.
    let r = await call(env, 'al', 'claimDailyReward');
    expect(r.body.error.reason).toBe('daily_free_limit');
    expect((await user(env, 'al'))?.lastDailyClaim ?? null).toBeNull();
    r = await call(env, 'al', 'claimAdReward');
    expect(r.body.error.reason).toBe('daily_free_limit');
    const claims = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ad_reward_claims WHERE uid = 'al'`).first<any>();
    expect(claims.n).toBe(2);
    // XP conversion fills the last 2.
    expect((await call(env, 'al', 'convertXp', { diamonds: 3, requestId: 'req-00000001' })).body.error.reason).toBe('daily_free_limit');
    expect((await call(env, 'al', 'convertXp', { diamonds: 2, requestId: 'req-00000002' })).status).toBe(200);
    expect(await user(env, 'al')).toMatchObject({ dpcoin: 12, lockedCoins: 12 });
    await expectBalanced(env);
  });

  it('caps daily tasks without marking the task claimed', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss');
    await seedUser(env, 'al');
    await settings(env, economy({ dailyFreeDiamondCap: 5 }));
    expect((await admin(env, 'POST', '/rewards', { dailyTasks: [{ id: 'share1', title: 'Share once', reward: 7, target: 1, type: 'share' }] })).status).toBe(200);
    await env.DB.prepare(`INSERT INTO shares (id, user_id, target_type, target_id, created_at) VALUES ('s1', 'al', 'match', 'm1', ?)`).bind(Date.now()).run();
    expect((await call(env, 'al', 'getDailyTasks')).body.tasks[0]).toMatchObject({ id: 'share1', claimable: true });
    const r = await call(env, 'al', 'claimDailyTask', { taskId: 'share1' });
    expect(r.body.error.reason).toBe('daily_free_limit');
    expect((await call(env, 'al', 'getDailyTasks')).body.tasks[0]).toMatchObject({ claimed: false });
    const claimed = await env.DB.prepare(`SELECT COUNT(*) AS n FROM daily_task_claims WHERE uid = 'al'`).first<any>();
    expect(claimed.n).toBe(0);
    expect((await user(env, 'al'))?.dpcoin).toBe(0);
  });
});

describe('monthly DP coin win cap', () => {
  it('pays the part above the cap as Diamonds, keeping both ledgers balanced', async () => {
    const { env } = makeEnv();
    for (const u of ['w', 'l1', 'l2', 'l3']) await seedUser(env, u);
    await settings(env, economy({ monthlyDpCoinWinCap: 30 }));
    for (const [m, l] of [['m1', 'l1'], ['m2', 'l2'], ['m3', 'l3']]) await seedMatch(env, m, 'w', l);
    await win(env, 'm1', 'w', 'l1', 20);
    expect(await user(env, 'w')).toMatchObject({ dpcoin: 20, lockedCoins: 0 });
    await win(env, 'm2', 'w', 'l2', 20);
    expect(await user(env, 'w')).toMatchObject({ dpcoin: 40, lockedCoins: 10 });
    await win(env, 'm3', 'w', 'l3', 20);
    expect(await user(env, 'w')).toMatchObject({ dpcoin: 60, lockedCoins: 30 });
    const row = await env.DB.prepare(`SELECT locked_delta, description FROM coin_transactions WHERE id = 'contest_win:m2'`).first<any>();
    expect(row.locked_delta).toBe(10);
    expect(row.description).toMatch(/10 as Diamond/);
    await expectBalanced(env);
  });

  it('is off by default', async () => {
    const { env } = makeEnv();
    for (const u of ['w', 'l']) await seedUser(env, u);
    await seedMatch(env, 'm1', 'w', 'l');
    await win(env, 'm1', 'w', 'l', 5000);
    expect(await user(env, 'w')).toMatchObject({ dpcoin: 5000, lockedCoins: 0 });
  });
});

describe('same-opponent farming', () => {
  it('pays the prize but no XP or monthly win after the daily limit for one pair', async () => {
    const { env } = makeEnv();
    for (const u of ['a', 'b', 'c']) await seedUser(env, u);
    await settings(env, economy({ sameOpponentRewardsPerDay: 1 }));
    for (const [m, x, y] of [['m1', 'a', 'b'], ['m2', 'b', 'a'], ['m3', 'a', 'c']]) await seedMatch(env, m, x, y);
    await win(env, 'm1', 'a', 'b', 10);
    const after1 = await user(env, 'a');
    expect(after1).toMatchObject({ wins: 1, monthlyWins: 1 });
    expect(Number(after1?.xp)).toBeGreaterThan(0);
    await win(env, 'm2', 'a', 'b', 10); // same pair (sides swapped), same day
    const after2 = await user(env, 'a');
    expect(after2).toMatchObject({ wins: 2, monthlyWins: 1, dpcoin: 20, xp: after1?.xp });
    await win(env, 'm3', 'a', 'c', 10); // a new opponent still counts
    expect(await user(env, 'a')).toMatchObject({ wins: 3, monthlyWins: 2 });
    expect(Number((await user(env, 'a'))?.xp)).toBeGreaterThan(Number(after1?.xp));
    await expectBalanced(env);
  });
});

describe('Hall of Fame under the free-rewards budget', () => {
  it('spends the budget, and an empty budget fails the run without losing the winner', async () => {
    const { env } = makeEnv();
    const ts = Date.now();
    await seedUser(env, 'boss');
    for (const [uid, wins] of [['w1', 5], ['w2', 3]] as const) {
      await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, monthlyWins: wins, createdAt: ts, updatedAt: ts } as any);
    }
    await admin(env, 'POST', '/approval-password', { next: PW });
    const fb = (await admin(env, 'POST', '/promo-budgets', { name: 'Free 400', kind: 'free_rewards', totalCoins: 400, reason: 'test budget', approvalPassword: PW })).body.id;
    expect((await admin(env, 'POST', '/app-settings', { freeRewardsBudgetId: fb, approvalPassword: PW })).status).toBe(200);
    expect((await admin(env, 'POST', '/rewards', { hallOfFameRewards: [300, 150, 75] })).status).toBe(200);

    await expect(monthlyHallOfFame(env as any, '2026-09')).rejects.toThrow(/w2/);
    expect((await user(env, 'w1'))?.lockedCoins).toBe(300);
    expect(await user(env, 'w2')).toMatchObject({ dpcoin: 0, monthlyWins: 3 });
    expect((await admin(env, 'GET', `/promo-budgets/${fb}`)).body.budget).toMatchObject({ spentCoins: 300, heldCoins: 0 });

    // Admin raises the budget; the re-run pays w2 once.
    expect((await admin(env, 'PATCH', `/promo-budgets/${fb}`, { totalCoins: 500, reason: 'raise for HoF', approvalPassword: PW })).status).toBe(200);
    const r = await monthlyHallOfFame(env as any, '2026-09');
    expect(r.paid).toBe(1);
    expect((await user(env, 'w2'))?.lockedCoins).toBe(150);
    expect((await admin(env, 'GET', `/promo-budgets/${fb}`)).body.budget).toMatchObject({ spentCoins: 450 });
    await expectBalanced(env);
  });
});

describe('economy settings and health', () => {
  it('validates the settings and reports cost, revenue and guardrails', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss');
    expect((await admin(env, 'POST', '/app-settings', { monetization: { economy: { bogus: 1 } } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { monetization: { economy: { contestPlatformFeePercent: 95 } } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { monetization: { economy: { contestPlatformFeePercent: 25, dailyFreeDiamondCap: 100 } } })).status).toBe(200);

    const r = await admin(env, 'GET', '/monetization/economy-health?days=30');
    expect(r.status).toBe(200);
    expect(r.body.guardrails).toMatchObject({ contestPlatformFeePercent: 25, dailyFreeDiamondCap: 100, monthlyDpCoinWinCap: 0 });
    expect(r.body.alerts).toEqual(expect.arrayContaining(['no_monthly_win_cap', 'no_free_rewards_budget']));
    expect(r.body.alerts).not.toContain('no_contest_fee');
    expect(r.body).toHaveProperty('revenue.totalInr', 0);
    expect(r.body).toHaveProperty('cost.shopInr', 0);
  });
});
