/**
 * Reward History (getRewardHistory) and the 💎 Diamond leaderboard
 * (/read/leaderboard/diamonds), lib/rewardHistory.ts.
 */
import { vi, describe, it, expect } from 'vitest';

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

import { makeEnv, makeApp, fakeCtx, type TestEnv } from './helpers/harness';
import { parseHistoryCursor, rangeMs, tieIdFor } from '../src/lib/rewardHistory';

const app = makeApp();
const env0 = () => makeEnv().env;

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request(
    '/api',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function read(env: TestEnv, path: string, uid?: string) {
  const res = await app.request(`/read${path}`, uid ? { headers: { Authorization: `Bearer ${uid}` } } : {}, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, status = 'active') {
  const ts = Date.now() - 86_400_000 * 30;
  await env.DB.prepare(
    `INSERT INTO users (uid, username, full_name, signup_completed, status, dpcoin, locked_coins, xp, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 0, 0, 0, ?, ?)`,
  ).bind(uid, uid, uid, status, ts, ts).run();
}

async function coin(env: TestEnv, uid: string, id: string, type: string, amount: number, locked: number, at: number, description: string | null = null) {
  await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, uid, amount, type, description, at, locked).run();
}

async function xp(env: TestEnv, uid: string, id: string, action: string, delta: number, at: number, reverses: string | null = null) {
  await env.DB.prepare(`INSERT INTO user_xp_events (id, uid, action, delta, requested, day, reverses, reason, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'staff note', ?)`)
    .bind(id, uid, action, delta, delta, reverses, at).run();
}

async function seedHistory(env: TestEnv) {
  const t = Date.now() - 60_000;
  await seedUser(env, 'u1');
  await coin(env, 'u1', 'd1', 'daily_reward', 5, 5, t + 1);
  await coin(env, 'u1', 'q1', 'quest_reward', 20, 20, t + 2);
  await coin(env, 'u1', 'fee1', 'contest_entry_fee', -10, -10, t + 3);
  await coin(env, 'u1', 'win1', 'contest_win_reward', 18, 0, t + 4);
  await coin(env, 'u1', 'xp_conversion:xpconv:u1:r1', 'xp_conversion', 3, 3, t + 5, '300 XP → 3 Diamond');
  await env.DB.prepare(`INSERT INTO xp_conversions (id, uid, day, xp_spent, diamonds, nonce, created_at) VALUES ('xpconv:u1:r1', 'u1', 0, 300, 3, 'n1', ?)`).bind(t + 5).run();
  await coin(env, 'u1', 'rev1', 'referral_clawback', -4, -4, t + 6);
  await coin(env, 'u1', 'adj1', 'admin_adjustment', 2, 2, t + 7);
  await coin(env, 'u1', 'gift1', 'gift_send', -1, 0, t + 8);
  await xp(env, 'u1', 'vote:m1:u1', 'vote', 10, t + 3);
  await xp(env, 'u1', 'vote:m2:u1', 'vote', 10, t + 7);
  await xp(env, 'u1', 'rev:vote:m2:u1', 'reversal', -10, t + 9, 'vote:m2:u1');
  // Someone else's rows never show.
  await seedUser(env, 'u2');
  await coin(env, 'u2', 'other', 'daily_reward', 5, 5, t + 1);
}

describe('cursor helpers', () => {
  it('parses and rejects cursors', () => {
    expect(parseHistoryCursor(undefined)).toBeNull();
    expect(parseHistoryCursor('12:c:abc:def')).toEqual({ ts: 12, key: 'c:abc:def' });
    expect(() => parseHistoryCursor('12:z:abc')).toThrow();
    expect(() => parseHistoryCursor('x:c:a')).toThrow();
    expect(() => parseHistoryCursor(5)).toThrow();
  });

  it('resumes each source right after the cursor row', () => {
    const c = { ts: 1, key: 'c:abc' };
    expect(tieIdFor('c', c)).toBe('abc');
    expect(tieIdFor('x', c)).toBe(''); // x rows at the same ms sort before c rows: already returned
    const x = { ts: 1, key: 'x:abc' };
    expect(tieIdFor('c', x)).toBe('\uffff'); // all c rows at that ms are still to come
    expect(tieIdFor('x', x)).toBe('abc');
  });

  it('turns a reward-day range into an epoch-ms window', () => {
    expect(rangeMs({ startDay: 10, endDay: 10 }, 330)).toEqual({ startMs: 10 * 86_400_000 - 330 * 60_000, endMs: 11 * 86_400_000 - 330 * 60_000 });
  });
});

describe('getRewardHistory', () => {
  it('filters each tab from the ledgers', async () => {
    const env = env0();
    await seedHistory(env);
    const keys = async (tab: string) => (await call(env, 'u1', 'getRewardHistory', { tab })).body.items.map((i: any) => i.key);

    expect(await keys('diamonds')).toEqual(['c:xp_conversion:xpconv:u1:r1', 'c:q1', 'c:d1']);
    expect(await keys('xp')).toEqual(['x:vote:m2:u1', 'x:vote:m1:u1']);
    expect(await keys('dpcoin')).toEqual(['c:win1']);
    expect(await keys('spent')).toEqual(['c:fee1']);
    expect(await keys('conversion')).toEqual(['c:xp_conversion:xpconv:u1:r1']);
    expect(await keys('adjusted')).toEqual(['x:rev:vote:m2:u1', 'c:adj1', 'c:rev1']);
    expect((await keys('all')).length).toBe(11);

    const conv = (await call(env, 'u1', 'getRewardHistory', { tab: 'conversion' })).body.items[0];
    expect(conv).toMatchObject({ diamonds: 3, dpcoin: 0, xpSpent: 300, source: 'coin', type: 'xp_conversion' });
    const win = (await call(env, 'u1', 'getRewardHistory', { tab: 'dpcoin' })).body.items[0];
    expect(win).toMatchObject({ diamonds: 0, dpcoin: 18 });
    const rev = (await call(env, 'u1', 'getRewardHistory', { tab: 'xp' })).body.items[0];
    expect(rev.label).toBe('Voted in a battle');
    expect(JSON.stringify(rev)).not.toContain('staff note');
  });

  it('pages the merged tab without gaps or repeats, including rows in the same millisecond', async () => {
    const env = env0();
    await seedHistory(env);
    const t = Date.now();
    // Same timestamp in both ledgers.
    await coin(env, 'u1', 'same-a', 'daily_task', 1, 1, t);
    await coin(env, 'u1', 'same-b', 'daily_task', 1, 1, t);
    await xp(env, 'u1', 'same-x', 'daily_task', 5, t);

    const full = (await call(env, 'u1', 'getRewardHistory', { tab: 'all', limit: 50 })).body.items.map((i: any) => i.key);
    const paged: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const r = await call(env, 'u1', 'getRewardHistory', { tab: 'all', limit: 2, ...(cursor ? { cursor } : {}) });
      expect(r.status).toBe(200);
      paged.push(...r.body.items.map((x: any) => x.key));
      cursor = r.body.nextCursor;
      if (!cursor) break;
    }
    expect(full.length).toBe(14);
    expect(paged).toEqual(full);
    expect(full.slice(0, 3)).toEqual(['x:same-x', 'c:same-b', 'c:same-a']);
  });

  it('rejects a bad cursor and an unknown tab falls back to all', async () => {
    const env = env0();
    await seedHistory(env);
    expect((await call(env, 'u1', 'getRewardHistory', { cursor: 'nope' })).status).toBe(400);
    const r = await call(env, 'u1', 'getRewardHistory', { tab: 'hack' });
    expect(r.body.tab).toBe('all');
  });
});

describe('Diamond leaderboard', () => {
  it('ranks reward Diamonds in the period, nets reversals and skips one-off bonuses', async () => {
    const env = env0();
    const now = Date.now();
    await seedUser(env, 'a');
    await seedUser(env, 'b');
    await seedUser(env, 'c');
    await seedUser(env, 'gone', 'blocked');
    await coin(env, 'a', 'a1', 'daily_reward', 10, 10, now - 1000);
    await coin(env, 'a', 'a2', 'referral_bonus', 30, 30, now - 900);
    await coin(env, 'a', 'a3', 'referral_clawback', -30, -30, now - 800); // reversed referral
    await coin(env, 'b', 'b1', 'quest_reward', 25, 25, now - 1000);
    await coin(env, 'c', 'c1', 'signup_bonus', 100, 100, now - 1000); // one-off: not ranked
    await coin(env, 'c', 'c2', 'contest_win_reward', 50, 0, now - 1000); // DP coin: not ranked
    await coin(env, 'gone', 'g1', 'quest_reward', 999, 999, now - 1000);
    await coin(env, 'b', 'old', 'quest_reward', 500, 500, now - 40 * 86_400_000); // outside the month

    const r = await read(env, '/leaderboard/diamonds?period=month');
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: any) => [x.uid, x.rank, x.score])).toEqual([['b', 1, 25], ['a', 2, 10]]);
    expect(r.body.rows[0].level).toBeGreaterThanOrEqual(1);

    expect((await read(env, '/leaderboard/diamonds/me?period=month', 'a')).body).toMatchObject({ rank: 2, score: 10 });
    expect((await read(env, '/leaderboard/diamonds/me?period=month', 'c')).body).toMatchObject({ rank: null, score: 0 });
    expect((await read(env, '/leaderboard/diamonds/me?period=week', 'b')).body.rank).toBe(1);
  });

  it('the XP board accepts a daily period', async () => {
    const env = env0();
    const r = await read(env, '/leaderboard/xp?period=day');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ period: 'day', label: 'Today' });
  });
});
