/**
 * Balance/ledger integrity.
 *
 * money.test.ts covers the happy paths of earning and spending.
 * This file covers the invariant underneath all of them, stated in the README as
 * "every balance change and its ledger row are written in one D1 transaction,
 * gated on the same claim token" — and specifically the places that used to break
 * it. Every `describe` below corresponds to a real defect, so these are
 * regression tests first and documentation second.
 */
import { vi, describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';

// Bypass Firebase token verification: the bearer token is "uid" or "uid:role".
vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user' };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));

// Firebase Admin is only reachable from a deployed worker. Account deletion calls
// deleteAuthUser; nothing here asserts on it.
vi.mock('../src/lib/firebaseAdmin', () => ({
  // createProfile reads email/phone from Firebase's record, not the body.
  lookupAuthUser: async (_env: unknown, uid: string) => ({ email: `${uid}@example.com`, emailVerified: false, phoneNumber: null }),
  // Session revocation calls this; without it the mock throws on property access.
  revokeRefreshTokens: async () => undefined,
  deleteAuthUser: async () => undefined,
  updateAuthUser: async () => undefined,
  setCustomClaims: async () => undefined,
  getUserByEmail: async () => null,
  sendFcmToToken: async () => ({ ok: true, retryable: false, invalid: false, status: 200 }),
}));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { getSettings } from '../src/lib/gamification';
import { deleteOwnAccount } from '../src/lib/accountDeletion';

const app = makeApp();

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request(
    '/api',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` },
      body: JSON.stringify({ action, ...data }),
    },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

/** Call an /admin route with the shared server secret (treated as superadmin). */
async function admin(env: TestEnv, method: string, path: string, body?: any) {
  const res = await app.request(
    `/admin${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': 'test-admin-secret' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
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

async function getUser(env: TestEnv, uid: string) {
  return drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();
}

async function ledger(env: TestEnv, uid: string) {
  return drizzleOf(env).select().from(schema.coinTransactions).where(eq(schema.coinTransactions.uid, uid)).all();
}

/** The ledger must always explain the balance. */
async function ledgerSum(env: TestEnv, uid: string) {
  return (await ledger(env, uid)).reduce((total, row: any) => total + Number(row.amount), 0);
}

async function seedContest(env: TestEnv, id: string, totalEntryFee: number, extra: Record<string, any> = {}) {
  await drizzleOf(env)
    .insert(schema.contests)
    .values({
      id, title: `Contest ${id}`, type: 'photo', status: 'live',
      totalEntryFee, rewardCoins: totalEntryFee, voteDurationDays: 1, autoCancelHours: 24,
      minVotes: 0, createdAt: Date.now(), ...extra,
    } as any);
}

// ===========================================================================
describe('startMatch charges atomically', () => {
  it('writes the debit and its ledger row together', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 100);
    await seedContest(env, 'c1', 40); // 20 per player

    const res = await call(env, 'alice', 'startMatch', {
      contestId: 'c1', mediaUrl: 'a.jpg', mediaType: 'photo', deviceId: 'd1',
    });

    expect(res.status).toBe(200);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(80);
    const rows = await ledger(env, 'alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('contest_entry_fee');
    expect(Number(rows[0].amount)).toBe(-20);
    // The ledger explains the balance change exactly.
    expect(await ledgerSum(env, 'alice')).toBe(-20);
    expect(rows[0].id).toBe(`contest_entry:${res.body.matchId}:alice`);
  });

  it('leaves absolutely nothing behind when the user cannot afford it', async () => {
    // The old shape deducted first and compensated in a `catch`. If that refund
    // failed the coins were gone, so the important assertion is that a rejected
    // attempt writes no balance change, no ledger row AND no match.
    const { env } = makeEnv();
    await seedUser(env, 'alice', 5);
    await seedContest(env, 'c1', 40);

    const res = await call(env, 'alice', 'startMatch', {
      contestId: 'c1', mediaUrl: 'a.jpg', mediaType: 'photo', deviceId: 'd1',
    });

    expect(res.status).toBe(412);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(5);
    expect(await ledger(env, 'alice')).toHaveLength(0);
    expect(await drizzleOf(env).select().from(schema.contestMatches).all()).toHaveLength(0);
  });

  it('creates the match with the prize capped at the entry-fee pot', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 100);
    // A template promising more than two players fund would mint coins.
    await seedContest(env, 'c1', 40, { rewardCoins: 500 });

    const res = await call(env, 'alice', 'startMatch', {
      contestId: 'c1', mediaUrl: 'a.jpg', mediaType: 'photo', deviceId: 'd1',
    });

    const match: any = await drizzleOf(env)
      .select().from(schema.contestMatches).where(eq(schema.contestMatches.id, res.body.matchId)).get();
    expect(Number(match.prizeCoins)).toBe(40); // pot, not the 500 advertised
    expect(match.status).toBe('waiting_for_opponent');
    expect(match.userA.uid).toBe('alice');
    expect(match.joinIdA).toBeTruthy();
  });

  it('stores an invite as a private match', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 100);
    await seedUser(env, 'bob', 100);
    await seedContest(env, 'c1', 40);

    const res = await call(env, 'alice', 'startMatch', {
      contestId: 'c1', mediaUrl: 'a.jpg', mediaType: 'photo', deviceId: 'd1', invitedUid: 'bob',
    });

    const match: any = await drizzleOf(env)
      .select().from(schema.contestMatches).where(eq(schema.contestMatches.id, res.body.matchId)).get();
    expect(match.isPrivate).toBe(true);
    expect(match.invitedUid).toBe('bob');
  });
});

// ===========================================================================
describe('reward settings cannot corrupt a balance', () => {
  it('rejects a fractional or negative coin reward at the admin API', async () => {
    const { env } = makeEnv();

    // Coins are a whole-number currency; a fraction would break every balance
    // that claimed it.
    expect((await admin(env, 'POST', '/rewards', { dailyLoginReward: 10.5 })).status).toBe(400);
    // A negative "reward" would silently DEBIT users.
    expect((await admin(env, 'POST', '/rewards', { dailyStreakBonus: -50 })).status).toBe(400);
    expect((await admin(env, 'POST', '/rewards', { dailyBaseReward: 'free' })).status).toBe(400);
    // Nothing was stored.
    expect(await drizzleOf(env).select().from(schema.settings).all()).toHaveLength(0);

    // A sane value is accepted.
    expect((await admin(env, 'POST', '/rewards', { dailyLoginReward: 25 })).status).toBe(200);
  });

  it('floors a fractional value that was stored before validation existed', async () => {
    const { env } = makeEnv();
    await drizzleOf(env).insert(schema.settings).values({
      id: 'gamification',
      data: { dailyLoginReward: 10.9, dailyStreakBonus: -5, xpThreshold: 0 } as any,
      updatedAt: Date.now(),
    } as any);

    const settings = await getSettings(env as any);

    expect(settings.dailyLoginReward).toBe(10); // floored, never rounded up
    expect(settings.dailyStreakBonus).toBe(2); // negative → back to the default
    expect(settings.xpThreshold).toBeGreaterThanOrEqual(1); // 0 would loop forever
  });

  it('pays a whole number of coins for a daily claim even from a bad setting', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);
    await drizzleOf(env).insert(schema.settings).values({
      id: 'gamification', data: { dailyLoginReward: 7.9, dailyStreakBonus: 0 } as any, updatedAt: Date.now(),
    } as any);

    const res = await call(env, 'alice', 'claimDailyReward');

    expect(res.status).toBe(200);
    const balance = Number((await getUser(env, 'alice'))?.dpcoin);
    expect(Number.isInteger(balance)).toBe(true);
    expect(balance).toBe(7);
    expect(await ledgerSum(env, 'alice')).toBe(7);
  });
});

// ===========================================================================
describe('there is no signup bonus', () => {
  /**
   * The signup bonus was removed: new users are rewarded only through the referral
   * program (lib/referralProgram.ts). A legacy `rewardSettings.signupBonus` still
   * stored in app settings must mint nothing.
   */
  async function seedSignupBonus(env: TestEnv, signupBonus: number) {
    await drizzleOf(env).insert(schema.settings).values({
      id: 'appConfig',
      data: { rewardSettings: { signupBonus }, verificationReward: { enabled: false } } as any,
      updatedAt: Date.now(),
    } as any);
    await env.CACHE_KV.delete('settings:appConfig');
  }

  /** `createProfile` takes the uid from the verified token, so no Firebase user is needed. */
  const createProfile = (env: TestEnv, uid: string) =>
    app.request(
      '/auth',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` },
        body: JSON.stringify({ action: 'createProfile', username: uid, fullName: uid }),
      },
      env,
      fakeCtx(),
    );

  it('a stored legacy signupBonus grants nothing', async () => {
    const { env } = makeEnv();
    await seedSignupBonus(env, 100);

    const res = await createProfile(env, 'newbie');
    expect(res.status).toBe(200);
    await createProfile(env, 'newbie');

    expect(Number((await getUser(env, 'newbie'))?.dpcoin)).toBe(0);
    expect(await ledger(env, 'newbie')).toHaveLength(0);
  });

  it('nor with the verification reward on (its registration part is gone too)', async () => {
    const { env } = makeEnv();
    await createProfile(env, 'newbie');
    expect(Number((await getUser(env, 'newbie'))?.dpcoin)).toBe(0);
    expect(await ledger(env, 'newbie')).toHaveLength(0);
  });
});

// ===========================================================================
describe('account deletion records the forfeiture in the ledger', () => {
  it('zeroes the balance and explains it with a matching debit', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 250);
    // Give the balance a provenance so the ledger starts consistent.
    await drizzleOf(env).insert(schema.coinTransactions).values({
      id: 'admin_adjustment:seed', uid: 'alice', amount: 250, type: 'admin_adjustment',
      description: 'seed', createdAt: Date.now(),
    } as any);

    const result = await deleteOwnAccount(env as any, 'alice', 'no longer needed');

    expect(result.forfeitedCoins).toBe(250);
    expect(Number((await getUser(env, 'alice'))?.dpcoin)).toBe(0);

    const rows = await ledger(env, 'alice');
    const forfeit: any = rows.find((r: any) => r.type === 'account_deletion_forfeit');
    expect(forfeit).toBeTruthy();
    expect(Number(forfeit.amount)).toBe(-250);
    expect(forfeit.id).toBe('account_deletion:alice');
    // Ledger still sums to the (now zero) balance.
    expect(await ledgerSum(env, 'alice')).toBe(0);
  });

  it('writes no forfeiture row when there was nothing to forfeit', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);

    await deleteOwnAccount(env as any, 'alice');

    expect((await ledger(env, 'alice')).filter((r: any) => r.type === 'account_deletion_forfeit')).toHaveLength(0);
  });
});

// ===========================================================================
describe('no unledgered coin printer remains', () => {
  it('does not export awardReward from the gamification module', async () => {
    // It credited `dpcoin` with no ledger row, no idempotency and no amount
    // validation. It had no callers, so it was removed rather than repaired; this
    // test exists so it cannot quietly come back.
    const gamification: Record<string, unknown> = await import('../src/lib/gamification');
    expect('awardReward' in gamification).toBe(false);
  });

  it('keeps admin wallet adjustments balanced and replay-safe', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 0);

    const first = await admin(env, 'POST', '/users/alice/wallet', { amount: 50, type: 'add', reason: 'support ticket 1', requestId: 'req-00000001' });
    expect(first.status).toBe(200);
    expect(Number((await getUser(env, 'alice'))?.dpcoin)).toBe(50);
    expect(await ledgerSum(env, 'alice')).toBe(50);

    // Subtracting more than the balance must fail loudly rather than clamp,
    // which is what used to desynchronise the ledger from the balance.
    const overdraw = await admin(env, 'POST', '/users/alice/wallet', { amount: 500, type: 'subtract', reason: 'support ticket 2', requestId: 'req-00000002' });
    expect(overdraw.status).toBe(412);
    expect(Number((await getUser(env, 'alice'))?.dpcoin)).toBe(50);
    expect(await ledgerSum(env, 'alice')).toBe(50);
  });
});


// ===========================================================================
describe('reward settings in app-settings cannot corrupt a balance', () => {
  it('rejects a fractional, negative, non-numeric or oversized referral or signup bonus; the signup bonus pays after verification', async () => {
    const { env } = makeEnv();

    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { referralBonus: 10.5 } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { referralBonus: -1 } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { referralBonus: 'free' } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { referralBonus: 2_000_000 } })).status).toBe(400);
    // The signup bonus is validated like any coin amount...
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { signupBonus: -5 } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { signupBonus: 2.5 } })).status).toBe(400);
    // Nothing bad was stored.
    expect(await drizzleOf(env).select().from(schema.settings).all()).toHaveLength(0);
    // ...and a valid one becomes the after-verification amount (verificationReward.completionReward).
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { signupBonus: 100 } })).status).toBe(200);
    const stored: any = (await drizzleOf(env).select().from(schema.settings).all())[0]?.data;
    expect(stored.verificationReward).toMatchObject({ completionReward: 100, maxTotalReward: 100 });

    // Whole values within range are accepted (and a zero signup bonus is harmless).
    expect(
      (await admin(env, 'POST', '/app-settings', { rewardSettings: { signupBonus: 0, referralBonus: 50 } })).status,
    ).toBe(200);
  });
});

// ===========================================================================
describe('the referral bonus is credited once, atomically, from app settings', () => {
  async function seedProgram(env: TestEnv, referralProgram: Record<string, any>) {
    await drizzleOf(env).insert(schema.settings).values({
      id: 'appConfig', data: { referralProgram } as any, updatedAt: Date.now(),
    } as any);
    await env.CACHE_KV.delete('settings:appConfig');
  }

  it('with qualifyAction=signup, credits both sides exactly once, each with a ledger row', async () => {
    const { env } = makeEnv();
    await seedProgram(env, { qualifyAction: 'signup', referrerReward: 40, refereeReward: 60 });
    await seedUser(env, 'ref', 0, { referralCode: 'THTEST1' });
    await seedUser(env, 'newbie', 0);

    const res = await call(env, 'newbie', 'completeSignup', { referralCode: 'THTEST1', deviceId: 'dev-newbie' });
    expect(res.status).toBe(200);
    await call(env, 'newbie', 'completeSignup', { referralCode: 'THTEST1', deviceId: 'dev-newbie' });

    expect(Number((await getUser(env, 'ref'))?.dpcoin)).toBe(40);
    expect(Number((await getUser(env, 'newbie'))?.dpcoin)).toBe(60);
    // The ledger explains both balances — nothing appeared from nowhere.
    expect(await ledgerSum(env, 'ref')).toBe(40);
    expect(await ledgerSum(env, 'newbie')).toBe(60);
    expect((await getUser(env, 'newbie'))?.referredBy).toBe('ref');
    const rows = await drizzleOf(env).select().from(schema.referrals).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'rewarded', referrerReward: 40, refereeReward: 60 });
  });

  it('by default (first contest) pays nothing at signup: the referral is pending', async () => {
    const { env } = makeEnv();
    await seedProgram(env, { referrerReward: 50, refereeReward: 50 });
    await seedUser(env, 'ref', 0, { referralCode: 'THTEST1' });
    await seedUser(env, 'newbie', 0);

    await call(env, 'newbie', 'completeSignup', { referralCode: 'THTEST1' });

    expect(Number((await getUser(env, 'ref'))?.dpcoin)).toBe(0);
    expect(Number((await getUser(env, 'newbie'))?.dpcoin)).toBe(0);
    const rows = await drizzleOf(env).select().from(schema.referrals).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', qualifyAction: 'first_contest' });
  });

  it('refuses a self-referral', async () => {
    const { env } = makeEnv();
    await seedProgram(env, { qualifyAction: 'signup' });
    await seedUser(env, 'solo', 0, { referralCode: 'THSELF1' });

    const res = await call(env, 'solo', 'completeSignup', { referralCode: 'THSELF1' });
    expect(res.status).toBe(200); // signup completion itself still succeeds
    expect(res.body.referral?.status).toBe('refused');

    expect(Number((await getUser(env, 'solo'))?.dpcoin)).toBe(0);
    expect(await drizzleOf(env).select().from(schema.referrals).all()).toHaveLength(0);
  });

  it('refuses a retroactive claim from an older account', async () => {
    const { env } = makeEnv();
    await seedProgram(env, { qualifyAction: 'signup' });
    await seedUser(env, 'ref', 0, { referralCode: 'THTEST1' });
    // Created well outside the apply window — a long-existing user.
    await seedUser(env, 'veteran', 0, { createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000 });

    const res = await call(env, 'veteran', 'completeSignup', { referralCode: 'THTEST1' });
    expect(res.status).toBe(200);

    expect(Number((await getUser(env, 'ref'))?.dpcoin)).toBe(0);
    expect(Number((await getUser(env, 'veteran'))?.dpcoin)).toBe(0);
    expect((await getUser(env, 'veteran'))?.referredBy).toBeFalsy();
    expect(await drizzleOf(env).select().from(schema.referrals).all()).toHaveLength(0);
  });

  it('before a program is saved, the legacy referralBonus seeds both rewards; gamification is ignored', async () => {
    const { env } = makeEnv();
    await drizzleOf(env).insert(schema.settings).values({
      id: 'appConfig', data: { rewardSettings: { referralBonus: 77 }, referralProgram: { qualifyAction: 'signup' } } as any, updatedAt: Date.now(),
    } as any);
    // A leftover gamification.referralBonus must have NO effect on the payout.
    await drizzleOf(env).insert(schema.settings).values({
      id: 'gamification', data: { referralBonus: 999 } as any, updatedAt: Date.now(),
    } as any);
    await env.CACHE_KV.delete('settings:gamification');
    await seedUser(env, 'ref', 0, { referralCode: 'THTEST1' });
    await seedUser(env, 'newbie', 0);

    await call(env, 'newbie', 'completeSignup', { referralCode: 'THTEST1', deviceId: 'dev-newbie' });

    expect(Number((await getUser(env, 'newbie'))?.dpcoin)).toBe(77);
    expect(Number((await getUser(env, 'ref'))?.dpcoin)).toBe(77);
  });
});
