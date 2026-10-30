import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Bypass Firebase token verification: the bearer token is "uid" or "uid:role".
vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user' };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';

const app = makeApp();

async function call(env: TestEnv, uid: string, action: string, data: any = {}, role = 'user') {
  const res = await app.request(
    '/api',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}:${role}` },
      body: JSON.stringify({ action, ...data }),
    },
    env,
    fakeCtx(),
  );
  const body: any = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function seedUser(env: TestEnv, uid: string, dpcoin = 0, extra: Record<string, any> = {}) {
  const db = drizzleOf(env);
  const ts = Date.now();
  await db.insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin, createdAt: ts, updatedAt: ts, ...extra } as any);
}

async function getUser(env: TestEnv, uid: string) {
  const db = drizzleOf(env);
  return db.select().from(schema.users).where(eq(schema.users.uid, uid)).get();
}

async function seedContest(env: TestEnv, id: string, totalEntryFee: number, extra: Record<string, any> = {}) {
  const db = drizzleOf(env);
  await db.insert(schema.contests).values({ id, title: `Contest ${id}`, type: 'photo', totalEntryFee, rewardCoins: totalEntryFee, createdAt: Date.now(), ...extra } as any);
}

/** Write an admin App Control settings document (settings/{id}.data). */
async function seedSettings(env: TestEnv, id: string, data: Record<string, any>) {
  const db = drizzleOf(env);
  await db.insert(schema.settings).values({ id, data: data as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete(`settings:${id}`);
}

// drizzle eq used in helpers above.
import { eq } from 'drizzle-orm';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================
describe('claimDailyReward', () => {
  it('credits base + streak bonus and sets streak=1 on first claim', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    const { status, body } = await call(env, 'alice', 'claimDailyReward', { dayIndex: 0 });
    expect(status).toBe(200);
    // default settings: 10 + streak(1)*2 = 12
    expect(body.coinsEarned).toBe(12);
    expect(body.streak).toBe(1);
    const u = await getUser(env, 'alice');
    expect(u?.dpcoin).toBe(12);
    expect(u?.xp).toBe(50);
  });

  it('rejects a second claim on the same day', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    await call(env, 'alice', 'claimDailyReward', {});
    const { status } = await call(env, 'alice', 'claimDailyReward', {});
    expect(status).toBe(409);
    const u = await getUser(env, 'alice');
    expect(u?.dpcoin).toBe(12); // still just one reward
  });
});

// ===========================================================================
describe('startMatch (entry fee)', () => {
  it('deducts half the entry fee and records a ledger entry', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 100, { lockedCoins: 100 });
    await seedContest(env, 'c1', 100); // fee = 50

    const { status, body } = await call(env, 'alice', 'startMatch', { contestId: 'c1', mediaUrl: 'm', mediaType: 'photo' });
    expect(status).toBe(200);
    expect(body.matchId).toBeTruthy();

    const u = await getUser(env, 'alice');
    expect(u?.dpcoin).toBe(50);

    const db = drizzleOf(env);
    const txns = await db.select().from(schema.coinTransactions).where(eq(schema.coinTransactions.uid, 'alice')).all();
    expect(txns.some((t: any) => t.type === 'contest_entry_fee' && t.amount === -50)).toBe(true);
  });

  it('takes the fee in Diamonds only: DP coins never pay an entry', async () => {
    const { env } = makeEnv();
    // 500 coins, of which 30 are Diamonds: enough in total, not in Diamonds.
    await seedUser(env, 'rich', 500, { lockedCoins: 30 });
    await seedContest(env, 'c1', 100); // fee = 50
    const { status, body } = await call(env, 'rich', 'startMatch', { contestId: 'c1', mediaUrl: 'm', mediaType: 'photo' });
    expect(status).toBe(412);
    expect(body.error.reason).toBe('not_enough_diamonds');
    expect(await getUser(env, 'rich')).toMatchObject({ dpcoin: 500, lockedCoins: 30 });

    await seedUser(env, 'gem', 80, { lockedCoins: 60 });
    expect((await call(env, 'gem', 'startMatch', { contestId: 'c1', mediaUrl: 'm', mediaType: 'photo' })).status).toBe(200);
    // 50 Diamonds spent, the 20 DP coins untouched.
    expect(await getUser(env, 'gem')).toMatchObject({ dpcoin: 30, lockedCoins: 10 });
    const fee = (await drizzleOf(env).select().from(schema.coinTransactions).where(eq(schema.coinTransactions.uid, 'gem')).all())
      .find((t: any) => t.type === 'contest_entry_fee');
    expect(fee).toMatchObject({ amount: -50, lockedDelta: -50 });
  });

  it('rejects when the user cannot afford the fee (no deduction)', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'poor', 10, { lockedCoins: 10 });
    await seedContest(env, 'c1', 100); // fee = 50
    const { status } = await call(env, 'poor', 'startMatch', { contestId: 'c1', mediaUrl: 'm', mediaType: 'photo' });
    expect(status).toBe(412);
    const u = await getUser(env, 'poor');
    expect(u?.dpcoin).toBe(10);
  });
});

// ===========================================================================
describe('joinMatch', () => {
  async function startWaitingMatch(env: TestEnv) {
    await seedContest(env, 'c1', 100); // fee = 50
    await seedUser(env, 'alice', 100, { lockedCoins: 100 });
    const { body } = await call(env, 'alice', 'startMatch', { contestId: 'c1', mediaUrl: 'ma', mediaType: 'photo' });
    return body.matchId as string;
  }

  it('activates the match and deducts the joiner fee', async () => {
    const { env } = makeEnv();
    const matchId = await startWaitingMatch(env);
    await seedUser(env, 'bob', 100, { lockedCoins: 100 });

    const { status, body } = await call(env, 'bob', 'joinMatch', { matchId, mediaUrl: 'mb', mediaType: 'photo' });
    expect(status).toBe(200);
    expect(body.status).toBe('active');

    const bob = await getUser(env, 'bob');
    expect(bob?.dpcoin).toBe(50);

    const db = drizzleOf(env);
    const match = await db.select().from(schema.contestMatches).where(eq(schema.contestMatches.id, matchId)).get();
    expect(match?.status).toBe('active');
  });

  it('forbids joining your own match', async () => {
    const { env } = makeEnv();
    const matchId = await startWaitingMatch(env);
    const { status } = await call(env, 'alice', 'joinMatch', { matchId, mediaUrl: 'x', mediaType: 'photo' });
    expect(status).toBe(412);
  });

  it('rejects a second joiner once the match is active', async () => {
    const { env } = makeEnv();
    const matchId = await startWaitingMatch(env);
    await seedUser(env, 'bob', 100, { lockedCoins: 100 });
    await seedUser(env, 'carol', 100, { lockedCoins: 100 });
    await call(env, 'bob', 'joinMatch', { matchId, mediaUrl: 'mb', mediaType: 'photo' });
    const { status } = await call(env, 'carol', 'joinMatch', { matchId, mediaUrl: 'mc', mediaType: 'photo' });
    expect(status).toBe(412);
    const carol = await getUser(env, 'carol');
    expect(carol?.dpcoin).toBe(100); // not charged
  });
});

// ===========================================================================
describe('submitVote (validation)', () => {
  async function activeMatch(env: TestEnv) {
    await seedContest(env, 'c1', 100);
    await seedUser(env, 'alice', 100, { lockedCoins: 100 });
    await seedUser(env, 'bob', 100, { lockedCoins: 100 });
    const { body } = await call(env, 'alice', 'startMatch', { contestId: 'c1', mediaUrl: 'ma', mediaType: 'photo' });
    await call(env, 'bob', 'joinMatch', { matchId: body.matchId, mediaUrl: 'mb', mediaType: 'photo' });
    return body.matchId as string;
  }

  it('rejects missing fields', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'carol', 0, { lockedCoins: 0 });
    const { status } = await call(env, 'carol', 'submitVote', { matchId: 'x' });
    expect(status).toBe(400);
  });

  it('rejects voting on a non-active match', async () => {
    const { env } = makeEnv();
    await seedContest(env, 'c1', 100);
    await seedUser(env, 'alice', 100, { lockedCoins: 100 });
    await seedUser(env, 'carol', 0, { lockedCoins: 0 });
    const { body } = await call(env, 'alice', 'startMatch', { contestId: 'c1', mediaUrl: 'ma', mediaType: 'photo' });
    const { status } = await call(env, 'carol', 'submitVote', { matchId: body.matchId, votedForUid: 'alice', deviceId: 'd1' });
    expect(status).toBe(412);
  });

  it('forbids a participant from voting in their own match', async () => {
    const { env } = makeEnv();
    const matchId = await activeMatch(env);
    const { status } = await call(env, 'alice', 'submitVote', { matchId, votedForUid: 'bob', deviceId: 'd1' });
    expect(status).toBe(412);
  });

  it('rejects a vote for a non-participant', async () => {
    const { env } = makeEnv();
    const matchId = await activeMatch(env);
    await seedUser(env, 'carol', 0, { lockedCoins: 0 });
    const { status } = await call(env, 'carol', 'submitVote', { matchId, votedForUid: 'nobody', deviceId: 'd1' });
    expect(status).toBe(400);
  });
});


// ===========================================================================
describe('claimAdReward', () => {
  // Rewarded ads mint withdrawable currency on the client's word alone, so the
  // feature is fail-closed: disabled unless an admin turns it on, and even then
  // it must be an explicit decision to trust an unverified client.
  const adsOn = { ads: { enabled: true, trustClient: true, provider: 'test', reward: 5, dailyCap: 10 } };

  it('is rejected when rewarded ads are not configured', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);

    const { status } = await call(env, 'alice', 'claimAdReward', {});
    expect(status).toBe(412);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(0);
  });

  it('is rejected when the provider has no server-side verification', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    await seedSettings(env, 'appConfig', { ads: { enabled: true, trustClient: false } });

    const { status } = await call(env, 'alice', 'claimAdReward', {});
    expect(status).toBe(412);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(0);
  });

  it('credits a capped reward and enforces the daily limit', async () => {
    const { env } = makeEnv({ ALLOW_UNVERIFIED_AD_REWARDS: 'true' });
    await seedUser(env, 'alice', 0);
    await seedSettings(env, 'appConfig', adsOn);

    // Daily cap is 10 × 5 coins.
    for (let i = 0; i < 10; i++) {
      const { status, body } = await call(env, 'alice', 'claimAdReward', {});
      expect(status).toBe(200);
      expect(body.coinsEarned).toBe(5);
    }
    const u = await getUser(env, 'alice');
    expect(u?.dpcoin).toBe(50);

    // 11th call in the same day is rejected, and no extra coins are credited.
    const over = await call(env, 'alice', 'claimAdReward', {});
    expect(over.status).toBe(429);
    const after = await getUser(env, 'alice');
    expect(after?.dpcoin).toBe(50);
  });

  it('writes exactly one ledger row per credited claim', async () => {
    const { env } = makeEnv({ ALLOW_UNVERIFIED_AD_REWARDS: 'true' });
    await seedUser(env, 'alice', 0);
    await seedSettings(env, 'appConfig', adsOn);

    await call(env, 'alice', 'claimAdReward', {});
    await call(env, 'alice', 'claimAdReward', {});

    const db = drizzleOf(env);
    const ledger = await db
      .select()
      .from(schema.coinTransactions)
      .where(eq(schema.coinTransactions.type, 'ad_reward'))
      .all();
    expect(ledger).toHaveLength(2);
    // Ledger total must equal the balance — the invariant the KV counter broke.
    const total = ledger.reduce((sum, row) => sum + Number(row.amount), 0);
    expect(total).toBe(Number((await getUser(env, 'alice'))?.dpcoin));
  });
});


// ===========================================================================
describe('claimDailyReward', () => {
  it('credits and ledgers in one transaction, once per UTC day', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);

    const first = await call(env, 'alice', 'claimDailyReward', {});
    expect(first.status).toBe(200);

    const second = await call(env, 'alice', 'claimDailyReward', {});
    expect(second.status).toBe(409);

    const db = drizzleOf(env);
    const ledger = await db.select().from(schema.coinTransactions)
      .where(eq(schema.coinTransactions.type, 'daily_reward')).all();
    // Exactly one ledger row, and it reconciles with the balance.
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].amount)).toBe(Number((await getUser(env, 'alice'))?.dpcoin));
  });
});
