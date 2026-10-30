/**
 * Phase G money and contest-integrity fixes:
 *  - joining a waiting battle past its deadline;
 *  - admin declare-winner following the automatic tie / minimum-votes rules;
 *  - admin wallet adjustments need a reason and are idempotent;
 *  - the daily streak bonus is capped and always ledgered;
 *  - money health alerts on a schedule.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user' };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));
vi.mock('../src/lib/firebaseAdmin', () => ({
  lookupAuthUser: async (_env: unknown, uid: string) => ({ email: `${uid}@example.com`, emailVerified: false, phoneNumber: null }),
  revokeRefreshTokens: async () => undefined,
  deleteAuthUser: async () => undefined,
  updateAuthUser: async () => undefined,
  setCustomClaims: async () => undefined,
  getUserByEmail: async () => null,
  sendFcmToToken: async () => ({ ok: true, retryable: false, invalid: false, status: 200 }),
}));
const tally = vi.hoisted(() => ({ votesA: 0, votesB: 0, finalized: 0 }));
vi.mock('../src/lib/voteCounter', async (orig) => ({
  ...(await orig<any>()),
  getLiveTally: async () => ({ votesA: tally.votesA, votesB: tally.votesB, total: tally.votesA + tally.votesB }),
  finalizeVotes: async () => {
    tally.finalized++;
    return { votesA: tally.votesA, votesB: tally.votesB, total: tally.votesA + tally.votesB };
  },
}));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { moneyHealthAlert, MONEY_HEALTH_ALERT_TITLE } from '../src/lib/moneyHealth';

const app = makeApp();
beforeEach(() => {
  tally.votesA = 0;
  tally.votesB = 0;
  tally.finalized = 0;
});

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request(
    '/api',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function admin(env: TestEnv, method: string, path: string, body?: any) {
  const res = await app.request(
    `/admin${path}`,
    { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': 'test-admin-secret' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function seedUser(env: TestEnv, uid: string, dpcoin = 0, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env)
    .insert(schema.users)
    .values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin, lockedCoins: dpcoin, createdAt: ts, updatedAt: ts, ...extra } as any);
}
const balance = async (env: TestEnv, uid: string) =>
  Number((await drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get())?.dpcoin ?? 0);
const ledgerSum = async (env: TestEnv, uid: string) =>
  ((await env.DB.prepare('SELECT COALESCE(SUM(amount),0) s FROM coin_transactions WHERE uid = ?').bind(uid).first()) as any).s;
async function seedContest(env: TestEnv, id: string, totalEntryFee: number) {
  await drizzleOf(env).insert(schema.contests).values({
    id, title: `Contest ${id}`, type: 'photo', status: 'live', totalEntryFee, rewardCoins: totalEntryFee,
    voteDurationDays: 1, autoCancelHours: 24, minVotes: 0, createdAt: Date.now(),
  } as any);
}

// ===========================================================================
describe('joinMatch', () => {
  it('refuses a waiting battle past its deadline and charges nobody', async () => {
    const { env } = makeEnv();
    await seedContest(env, 'c1', 100);
    await seedUser(env, 'alice', 100);
    await seedUser(env, 'bob', 100);
    const { body } = await call(env, 'alice', 'startMatch', { contestId: 'c1', mediaUrl: 'ma', mediaType: 'photo' });
    await drizzleOf(env).update(schema.contestMatches).set({ expiresAt: Date.now() - 1000 }).where(eq(schema.contestMatches.id, body.matchId));

    const r = await call(env, 'bob', 'joinMatch', { matchId: body.matchId, mediaUrl: 'mb', mediaType: 'photo' });
    expect(r.status).toBe(412);
    expect(await balance(env, 'bob')).toBe(100);
    const m = await drizzleOf(env).select().from(schema.contestMatches).where(eq(schema.contestMatches.id, body.matchId)).get();
    expect(m?.status).toBe('waiting_for_opponent');
  });
});

// ===========================================================================
describe('admin declare-winner', () => {
  async function activeMatch(env: TestEnv, minVotesRequired = 0) {
    await seedUser(env, 'pa', 0);
    await seedUser(env, 'pb', 0);
    await drizzleOf(env).insert(schema.contestMatches).values({
      id: 'm1', status: 'active', type: 'photo', title: 'Battle', entryFee: 100, prizeCoins: 100,
      userA: { uid: 'pa', username: 'pa' }, userB: { uid: 'pb', username: 'pb' },
      minVotesRequired, createdAt: Date.now(), activatedAt: Date.now(), expiresAt: Date.now() + 3_600_000,
    } as any);
  }

  it('refuses a tie without an explicit winner and leaves voting open', async () => {
    const { env } = makeEnv();
    await activeMatch(env);
    tally.votesA = 3;
    tally.votesB = 3;
    const r = await admin(env, 'POST', '/matches/m1/declare-winner', {});
    expect(r.status).toBe(412);
    expect(r.body.error.message).toMatch(/tied/i);
    expect(tally.finalized).toBe(0);
    expect(await balance(env, 'pa')).toBe(0);
  });

  it('refuses a battle below its minimum votes without an explicit winner', async () => {
    const { env } = makeEnv();
    await activeMatch(env, 5);
    tally.votesA = 2;
    tally.votesB = 1;
    const r = await admin(env, 'POST', '/matches/m1/declare-winner', {});
    expect(r.status).toBe(412);
    expect(r.body.error.message).toMatch(/required 5 votes/);
  });

  it('pays the leader when the rules are met, and an explicit winner can still decide a tie', async () => {
    const { env } = makeEnv();
    await activeMatch(env);
    tally.votesA = 1;
    tally.votesB = 4;
    expect((await admin(env, 'POST', '/matches/m1/declare-winner', {})).status).toBe(200);
    expect(await balance(env, 'pb')).toBe(100);

    const { env: env2 } = makeEnv();
    await activeMatch(env2);
    tally.votesA = 2;
    tally.votesB = 2;
    expect((await admin(env2, 'POST', '/matches/m1/declare-winner', { winnerUid: 'pa' })).status).toBe(200);
    expect(await balance(env2, 'pa')).toBe(100);
  });
});

// ===========================================================================
describe('admin wallet adjustment', () => {
  it('requires a reason and a request id', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    expect((await admin(env, 'POST', '/users/alice/wallet', { amount: 5, type: 'add', requestId: 'req-00000001' })).status).toBe(400);
    expect((await admin(env, 'POST', '/users/alice/wallet', { amount: 5, type: 'add', reason: 'ticket 9' })).status).toBe(400);
    expect(await balance(env, 'alice')).toBe(0);
  });

  it('a double submit with one request id moves the coins once, and the ledger says who and why', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    const body = { amount: 25, type: 'add', reason: 'ticket 42 goodwill', requestId: 'req-00000042' };
    await Promise.all([admin(env, 'POST', '/users/alice/wallet', body), admin(env, 'POST', '/users/alice/wallet', body)]);
    expect(await balance(env, 'alice')).toBe(25);
    expect(await ledgerSum(env, 'alice')).toBe(25);
    const row = await env.DB.prepare("SELECT description FROM coin_transactions WHERE uid = 'alice'").first<any>();
    expect(row.description).toContain('ticket 42 goodwill');
    const audit = await env.DB.prepare("SELECT detail FROM admin_audit_log WHERE action = 'wallet.adjust'").first<any>();
    expect(audit.detail).toContain('ticket 42 goodwill');
  });
});

// ===========================================================================
describe('daily reward', () => {
  it('caps the streak bonus at 30 days and keeps balance and ledger equal', async () => {
    const { env } = makeEnv();
    const yesterday = Date.now() - 24 * 3_600_000;
    await seedUser(env, 'alice', 0, { streak: 400, lastDailyClaim: yesterday });
    const r = await call(env, 'alice', 'claimDailyReward');
    expect(r.status).toBe(200);
    // defaults: 10 + min(401, 30) * 2
    expect(r.body.coinsEarned).toBe(70);
    expect(r.body.streak).toBe(401);
    expect(await balance(env, 'alice')).toBe(70);
    expect(await ledgerSum(env, 'alice')).toBe(70);
  });

  it('does not credit when this day\'s ledger row already exists (eligibility reset by hand)', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    await call(env, 'alice', 'claimDailyReward');
    // Someone moves last_daily_claim back within the same UTC day.
    await drizzleOf(env).update(schema.users).set({ lastDailyClaim: 1 } as any).where(eq(schema.users.uid, 'alice'));
    const again = await call(env, 'alice', 'claimDailyReward');
    expect(again.status).toBe(409);
    expect(await balance(env, 'alice')).toBe(await ledgerSum(env, 'alice'));
  });
});

// ===========================================================================
describe('money health', () => {
  it('the scheduled check writes one admin alert per day, not one per run', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', -5);
    await moneyHealthAlert(env as any);
    await moneyHealthAlert(env as any);
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM admin_notifications WHERE title = ?').bind(MONEY_HEALTH_ALERT_TITLE).first<any>();
    expect(n.n).toBe(1);
  });

  it('stays quiet when everything balances', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    expect((await moneyHealthAlert(env as any)).ok).toBe(true);
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM admin_notifications').first<any>();
    expect(n.n).toBe(0);
  });
});
