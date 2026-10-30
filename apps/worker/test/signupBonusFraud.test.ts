/**
 * Signup bonus anti-fraud (lib/verificationReward.ts): paid only after email AND
 * mobile are verified, and only when the hard rules, the waiting period and the
 * review holds allow it. Admin approves / rejects held bonuses.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user', email: `${uid}@example.com`, authTime: Math.floor(Date.now() / 1000) };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));
const { firebaseUsers } = vi.hoisted(() => ({
  firebaseUsers: new Map<string, { email: string | null; emailVerified: boolean; phoneNumber: string | null }>(),
}));
vi.mock('../src/lib/firebaseAdmin', () => ({
  revokeRefreshTokens: async () => undefined,
  updateAuthUser: async () => undefined,
  createAuthUser: async () => 'new-uid',
  createCustomToken: async () => 'custom-token',
  getUserByEmail: async () => null,
  deleteAuthUser: async () => undefined,
  setCustomClaims: async () => undefined,
  sendFcmToToken: async () => ({ ok: true, retryable: false, invalid: false, status: 200 }),
  lookupAuthUser: async (_env: unknown, uid: string) => firebaseUsers.get(uid) ?? null,
}));
vi.mock('../src/lib/observability', () => ({ captureError: async () => undefined, logErrorToDb: async () => undefined }));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { sweepSignupBonuses } from '../src/lib/verificationReward';
import { computeMoneyHealth } from '../src/lib/moneyHealth';

const app = makeApp();
const PW = 'secret-123';
let phoneSeq = 0;

beforeEach(() => firebaseUsers.clear());

async function post(env: TestEnv, route: string, token: string | null, data: any, ip = '203.0.113.7') {
  const res = await app.request(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function admin(env: TestEnv, method: string, path: string, body?: any) {
  const res = await app.request(`/admin${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer boss:admin' }, body: body ? JSON.stringify(body) : undefined }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function seedConfig(env: TestEnv, appConfig: Record<string, any>) {
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: appConfig as any, updatedAt: Date.now() } as any)
    .onConflictDoUpdate({ target: schema.settings.id, set: { data: appConfig as any } });
  await env.CACHE_KV.delete('settings:appConfig');
}
/** Sign up through the real path, then mark email + mobile verified (as the OTP flows do). */
async function verifiedSignup(env: TestEnv, uid: string, email = `${uid}@example.com`) {
  const phone = `+9198765${String(++phoneSeq).padStart(5, '0')}`;
  firebaseUsers.set(uid, { email, emailVerified: false, phoneNumber: phone });
  expect((await post(env, '/auth', uid, { action: 'createProfile', username: uid, fullName: uid })).status).toBe(200);
  await env.DB.prepare(`UPDATE users SET email = ?, phone = ?, email_verified = 1, phone_verified = 1 WHERE uid = ?`).bind(email, phone, uid).run();
}
const claim = (env: TestEnv, uid: string, deviceId: string | null, ip?: string) =>
  post(env, '/api', uid, { action: 'claimVerificationReward', ...(deviceId ? { deviceId } : {}) }, ip);
const user = (env: TestEnv, uid: string) => drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();
async function expectBalanced(env: TestEnv) {
  const h = await computeMoneyHealth(env as any);
  expect(h.ledgerDrift.count).toBe(0);
  expect(h.lockedDrift).toMatchObject({ count: 0, overBalance: 0 });
}
const STRICT = {
  rewardSettings: { signupBonus: 100 },
  verificationReward: { registrationReward: 0, completionReward: 100, maxTotalReward: 100, requireDevice: true, oneBonusPerDevice: true, maxBonusesPerIpPerDay: 1, maxAccountsPerDevice: 2 },
};

describe('signup bonus: paid only after verification and the fraud checks', () => {
  it('nothing at signup; 100 Diamonds once verified, on a clean device', async () => {
    const { env } = makeEnv();
    await seedConfig(env, STRICT);
    await verifiedSignup(env, 'alice');
    expect((await user(env, 'alice'))?.dpcoin).toBe(0);
    const r = await claim(env, 'alice', 'dev-a');
    expect(r.body.reward).toMatchObject({ credited: true, coins: 100 });
    expect(await user(env, 'alice')).toMatchObject({ dpcoin: 100, lockedCoins: 100, deviceId: 'dev-a' });
    expect((await claim(env, 'alice', 'dev-a')).body.reward.reason).toBe('already_completed');
    await expectBalanced(env);
  });

  it('hard rule: one bonus per device', async () => {
    const { env } = makeEnv();
    await seedConfig(env, { ...STRICT, verificationReward: { ...STRICT.verificationReward, maxBonusesPerIpPerDay: 0 } });
    await verifiedSignup(env, 'alice');
    await verifiedSignup(env, 'bob');
    expect((await claim(env, 'alice', 'dev-1')).body.reward.credited).toBe(true);
    expect((await claim(env, 'bob', 'dev-1')).body.reward.reason).toBe('device_already_rewarded');
    expect((await user(env, 'bob'))?.dpcoin).toBe(0);
  });

  it('hard rule: a disposable email is never paid', async () => {
    const { env } = makeEnv();
    await seedConfig(env, STRICT);
    // Signup refuses a throwaway address; one stored before the list grew is still never paid.
    firebaseUsers.set('mallory', { email: 'mallory@yopmail.com', emailVerified: false, phoneNumber: null });
    expect((await post(env, '/auth', 'mallory', { action: 'createProfile', username: 'mallory', fullName: 'm' })).status).toBe(400);
    await verifiedSignup(env, 'alice');
    await env.DB.prepare(`UPDATE users SET email = 'alice@yopmail.com' WHERE uid = 'alice'`).run();
    expect((await claim(env, 'alice', 'dev-a')).body.reward.reason).toBe('disposable_email');
  });

  it('waits until the account is old enough; the hourly sweep then pays once', async () => {
    const { env } = makeEnv();
    await seedConfig(env, { ...STRICT, verificationReward: { ...STRICT.verificationReward, minAccountAgeHours: 24 } });
    await verifiedSignup(env, 'alice');
    const r = await claim(env, 'alice', 'dev-a');
    expect(r.body.reward.reason).toBe('waiting');
    expect(r.body.reward.availableAt).toBeGreaterThan(Date.now());
    expect((await sweepSignupBonuses(env as any)).paid).toBe(0);
    await env.DB.prepare(`UPDATE users SET created_at = ? WHERE uid = 'alice'`).bind(Date.now() - 25 * 3_600_000).run();
    expect((await sweepSignupBonuses(env as any)).paid).toBe(1);
    expect((await sweepSignupBonuses(env as any)).paid).toBe(0);
    expect((await user(env, 'alice'))?.lockedCoins).toBe(100);
    await expectBalanced(env);
  });

  it('review holds: no device and an IP burst wait for an admin, who approves or rejects', async () => {
    const { env } = makeEnv();
    await seedConfig(env, STRICT);
    await verifiedSignup(env, 'boss');
    await verifiedSignup(env, 'alice');
    await verifiedSignup(env, 'bob');
    await verifiedSignup(env, 'carol');
    expect((await claim(env, 'alice', 'dev-a', '198.51.100.1')).body.reward.credited).toBe(true);
    expect((await claim(env, 'bob', 'dev-b', '198.51.100.1')).body.reward.reason).toBe('under_review'); // same IP
    expect((await claim(env, 'carol', null, '198.51.100.9')).body.reward.reason).toBe('under_review'); // no device
    // Still held on retry; nothing paid.
    expect((await claim(env, 'bob', 'dev-b', '198.51.100.2')).body.reward.reason).toBe('under_review');
    expect((await user(env, 'bob'))?.dpcoin).toBe(0);

    const list = await admin(env, 'GET', '/verification-reward/reviews');
    expect(list.status).toBe(200);
    const flags = Object.fromEntries(list.body.items.map((i: any) => [i.uid, i.flags]));
    expect(flags).toEqual({ bob: ['ip_burst'], carol: ['no_device'] });
    expect(list.body.items[0].email).not.toMatch(/^bob@example\.com$/); // masked
    expect((await admin(env, 'GET', '/verification-reward')).body.stats.pendingReview).toBe(2);

    let r = await admin(env, 'POST', '/verification-reward/reviews/bob', { decision: 'approve' });
    expect(r.body.result).toMatchObject({ credited: true, coins: 100 });
    expect((await user(env, 'bob'))?.lockedCoins).toBe(100);
    expect((await admin(env, 'POST', '/verification-reward/reviews/carol', { decision: 'reject' })).status).toBe(400); // needs a reason
    r = await admin(env, 'POST', '/verification-reward/reviews/carol', { decision: 'reject', note: 'farm account' });
    expect(r.body.status).toBe('rejected');
    expect((await claim(env, 'carol', 'dev-c')).body.reward.reason).toBe('rejected');
    expect((await user(env, 'carol'))?.dpcoin).toBe(0);
    expect((await admin(env, 'POST', '/verification-reward/reviews/bob', { decision: 'approve' })).status).toBe(412); // already done
    const audit = await env.DB.prepare(`SELECT action FROM admin_audit_log WHERE action LIKE 'signup-bonus.%'`).all<any>();
    expect(audit.results.map((a: any) => a.action).sort()).toEqual(['signup-bonus.approve', 'signup-bonus.reject']);
    await expectBalanced(env);
  });

  it('a device shared by many accounts is held', async () => {
    const { env } = makeEnv();
    await seedConfig(env, { ...STRICT, verificationReward: { ...STRICT.verificationReward, maxBonusesPerIpPerDay: 0, oneBonusPerDevice: false } });
    for (const u of ['acc1', 'acc2', 'acc3']) await verifiedSignup(env, u);
    await env.DB.prepare(`UPDATE users SET device_id = 'shared' WHERE uid IN ('acc1', 'acc2', 'acc3')`).run();
    expect((await claim(env, 'acc3', 'shared')).body.reward.reason).toBe('under_review');
  });

  it('is charged to the free-rewards budget and stops when it runs out', async () => {
    const { env } = makeEnv();
    await seedConfig(env, { ...STRICT, verificationReward: { ...STRICT.verificationReward, maxBonusesPerIpPerDay: 0 } });
    await verifiedSignup(env, 'boss');
    await verifiedSignup(env, 'alice');
    await verifiedSignup(env, 'bob');
    await admin(env, 'POST', '/approval-password', { next: PW });
    const fb = (await admin(env, 'POST', '/promo-budgets', { name: 'Free 150', kind: 'free_rewards', totalCoins: 150, reason: 'test budget', approvalPassword: PW })).body.id;
    expect((await admin(env, 'POST', '/app-settings', { freeRewardsBudgetId: fb, approvalPassword: PW })).status).toBe(200);
    expect((await claim(env, 'alice', 'dev-a')).body.reward.credited).toBe(true);
    expect((await claim(env, 'bob', 'dev-b')).body.reward.reason).toBe('free_rewards_exhausted');
    expect((await admin(env, 'GET', `/promo-budgets/${fb}`)).body.budget).toMatchObject({ spentCoins: 100 });
    // Raising the budget lets the same claim succeed once.
    expect((await admin(env, 'PATCH', `/promo-budgets/${fb}`, { totalCoins: 300, reason: 'more room', approvalPassword: PW })).status).toBe(200);
    expect((await claim(env, 'bob', 'dev-b')).body.reward.credited).toBe(true);
    await expectBalanced(env);
  });

  it('admin sets the amount as rewardSettings.signupBonus; new signups are promised it', async () => {
    const { env } = makeEnv();
    await verifiedSignup(env, 'boss');
    expect((await admin(env, 'POST', '/app-settings', { rewardSettings: { signupBonus: 120 }, verificationReward: { registrationReward: 0 } })).status).toBe(200);
    await verifiedSignup(env, 'neo');
    const row = await drizzleOf(env).select().from(schema.verificationRewards).where(eq(schema.verificationRewards.uid, 'neo')).get();
    expect(row).toMatchObject({ registrationReward: 0, completionReward: 120 });
    expect((await user(env, 'neo'))?.dpcoin).toBe(0);
    expect((await admin(env, 'POST', '/app-settings', { verificationReward: { requireDevice: 'yes' } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { verificationReward: { minAccountAgeHours: 1000 } })).status).toBe(400);
  });
});
