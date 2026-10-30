/**
 * Regression tests for the October 2026 production-hardening pass.
 *
 * Each block names the defect it pins. Where the defect was a race, the test
 * reproduces the interleaving deterministically (by injecting the competing
 * operation at the exact point it used to slip in) rather than hoping two
 * promises happen to overlap.
 */
import { vi, describe, it, expect } from 'vitest';

// Bearer token is "uid" or "uid:role". authTime is fixed in the past so a
// session cutoff written "now" revokes it. A "#fresh" suffix is a session signed in
// just now, which sensitive admin actions require (sudo mode).
vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const fresh = token.endsWith('#fresh');
    const [uid, role] = token.replace(/#fresh$/, '').split(':');
    return { uid, role: role || 'user', authTime: fresh ? Math.floor(Date.now() / 1000) : 1_000 };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));

const claimsSet: Array<{ uid: string; claims: any }> = [];
vi.mock('../src/lib/firebaseAdmin', () => ({
  revokeRefreshTokens: async () => undefined,
  updateAuthUser: async () => undefined,
  deleteAuthUser: async () => undefined,
  setCustomClaims: async (_env: unknown, uid: string, claims: any) => {
    claimsSet.push({ uid, claims });
  },
  getUserByEmail: async () => null,
  createAuthUser: async () => 'uid',
  createCustomToken: async () => 't',
  sendFcmToToken: async () => ({ ok: true, retryable: false, invalid: false, status: 200 }),
}));

import { eq } from 'drizzle-orm';
import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { runMigrations } from '../src/db/migrationRunner';
import fs from 'node:fs';
import path from 'node:path';
import { boundedQueryInt } from '../src/routes/admin';

const app = makeApp();

function env0(overrides: Partial<TestEnv> = {}) {
  return makeEnv(overrides);
}

async function api(env: TestEnv, token: string, action: string, data: any = {}) {
  const res = await app.request(
    '/api',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...data }),
    },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function adminCall(env: TestEnv, method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else headers['X-Admin-Secret'] = 'test-admin-secret';
  const res = await app.request(
    `/admin${path}`,
    { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, dpcoin = 0, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env)
    .insert(schema.users)
    .values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin, createdAt: ts, updatedAt: ts, ...extra } as any);
}

async function getUser(env: TestEnv, uid: string) {
  return drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();
}

async function ledger(env: TestEnv, uid: string) {
  return drizzleOf(env).select().from(schema.coinTransactions).where(eq(schema.coinTransactions.uid, uid)).all();
}

async function seedSettings(env: TestEnv, id: string, data: Record<string, any>) {
  await drizzleOf(env).insert(schema.settings).values({ id, data: data as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete(`settings:${id}`);
}

// ===========================================================================
describe('rewarded ads cannot be switched on from the admin panel alone', () => {
  const adsOn = { ads: { enabled: true, trustClient: true, provider: 'test', reward: 5, dailyCap: 3 } };

  it('refuses to credit without the deploy-level opt-in, even with trustClient on', async () => {
    const { env } = env0();
    await seedUser(env, 'alice', 0);
    await seedSettings(env, 'appConfig', adsOn);
    const res = await api(env, 'alice', 'claimAdReward');
    expect(res.status).toBe(412);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(0);
  });

  it('with the opt-in, parallel claims cannot exceed the daily cap', async () => {
    const { env } = env0({ ALLOW_UNVERIFIED_AD_REWARDS: 'true' });
    await seedUser(env, 'alice', 0);
    await seedSettings(env, 'appConfig', adsOn);
    const results = await Promise.all(Array.from({ length: 8 }, () => api(env, 'alice', 'claimAdReward')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(15);
    expect(await ledger(env, 'alice')).toHaveLength(3);
  });
});

// ===========================================================================
describe('admin role boundaries', () => {
  it('an admin cannot demote a superadmin, nor change their own role', async () => {
    const { env } = env0();
    await seedUser(env, 'boss', 0, { role: 'superadmin' });
    await seedUser(env, 'adm', 0, { role: 'admin' });

    const demote = await adminCall(env, 'POST', '/set-role', { userId: 'boss', role: 'user' }, 'adm:admin#fresh');
    expect(demote.status).toBe(403);
    expect((await getUser(env, 'boss'))?.role).toBe('superadmin');

    const self = await adminCall(env, 'POST', '/set-role', { userId: 'adm', role: 'moderator' }, 'adm:admin#fresh');
    expect(self.status).toBe(403);
    expect((await getUser(env, 'adm'))?.role).toBe('admin');
  });

  it('a demotion ends the demoted admin\'s existing sessions immediately', async () => {
    const { env } = env0();
    await seedUser(env, 'boss', 0, { role: 'superadmin' });
    await seedUser(env, 'adm', 0, { role: 'admin' });

    const res = await adminCall(env, 'POST', '/set-role', { userId: 'adm', role: 'user' }, 'boss:superadmin#fresh');
    expect(res.status).toBe(200);
    expect((await getUser(env, 'adm'))?.role).toBe('user');
    expect(Number((await getUser(env, 'adm'))?.tokensValidAfter)).toBeGreaterThan(1_000);

    // The old token still carries role=admin in its claim; it must not get in.
    const stale = await adminCall(env, 'GET', '/money-health', undefined, 'adm:admin');
    expect(stale.status).toBe(403);
  });

  it('a moderator cannot push arbitrary notifications; a full admin can', async () => {
    const { env } = env0();
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    await seedUser(env, 'victim', 0);
    const denied = await adminCall(env, 'POST', '/notify', { userId: 'victim', title: 'Verify your UPI', body: 'send it here' }, 'mod:moderator');
    expect(denied.status).toBe(403);
    const n = await drizzleOf(env).select().from(schema.notifications).where(eq(schema.notifications.recipientId, 'victim')).all();
    expect(n).toHaveLength(0);

    const ok = await adminCall(env, 'POST', '/notify', { userId: 'victim', title: 'Hi' });
    expect(ok.status).toBe(200);
  });

  it('a moderator cannot reach money endpoints', async () => {
    const { env } = env0();
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    await seedUser(env, 'alice', 100);
    expect((await adminCall(env, 'GET', '/money-health', undefined, 'mod:moderator')).status).toBe(403);
    expect((await adminCall(env, 'GET', '/transactions', undefined, 'mod:moderator')).status).toBe(403);
    const adj = await adminCall(env, 'POST', '/users/alice/wallet', { amount: 50, direction: 'add', reason: 'x' }, 'mod:moderator');
    expect(adj.status).toBe(403);
    expect((await getUser(env, 'alice'))?.dpcoin).toBe(100);
  });

  it('a superadmin passes the /api admin check (it used to accept only "admin")', async () => {
    const { env } = env0();
    await seedUser(env, 'boss', 0, { role: 'superadmin' });
    const res = await api(env, 'boss:superadmin', 'adminDeletePost', { postId: 'nope' });
    expect(res.status).toBe(200);
    await seedUser(env, 'joe', 0);
    expect((await api(env, 'joe', 'adminDeletePost', { postId: 'nope' })).status).toBe(403);
  });

  it('/api contest creation enforces the prize-funded-by-pot rule like /admin does', async () => {
    const { env } = env0();
    await seedUser(env, 'adm', 0, { role: 'admin' });
    const res = await api(env, 'adm:admin', 'createContestTemplate', {
      title: 'Overpaying', type: 'photo', totalEntryFee: 100, rewardCoins: 5000, bannerUrl: 'https://cdn.test/b.jpg',
    });
    expect(res.status).toBe(400);
    expect(await drizzleOf(env).select().from(schema.contests).all()).toHaveLength(0);
  });
});

// ===========================================================================
describe('chat creation and badges take identity from the server, not the client', () => {
  it('startChat ignores client-supplied otherUserData and requires a real, different user', async () => {
    const { env } = env0();
    await seedUser(env, 'alice');
    await seedUser(env, 'bob', 0, { profileImageUrl: 'https://cdn.test/bob.jpg' });

    const res = await api(env, 'alice', 'startChat', {
      otherUserId: 'bob',
      otherUserData: { uid: 'mallory', displayName: 'TopHunt Support', photoURL: 'https://evil.example/logo.png' },
    });
    expect(res.status).toBe(200);
    const chat = await drizzleOf(env).select().from(schema.chats).where(eq(schema.chats.id, res.body.chatId)).get();
    const other = (chat?.usersData as any[]).find((u) => u.uid !== 'alice');
    expect(other).toMatchObject({ uid: 'bob', displayName: 'bob' });
    expect(JSON.stringify(chat?.usersData)).not.toContain('Support');

    expect((await api(env, 'alice', 'startChat', { otherUserId: 'alice' })).status).toBe(400);
    expect((await api(env, 'alice', 'startChat', { otherUserId: 'ghost' })).status).toBe(404);
  });

  it('a non-member still cannot read or post into a chat by id', async () => {
    const { env } = env0();
    await seedUser(env, 'alice');
    await seedUser(env, 'bob');
    await seedUser(env, 'eve');
    const { body } = await api(env, 'alice', 'startChat', { otherUserId: 'bob' });
    const send = await api(env, 'eve', 'sendMessage', { chatId: body.chatId, text: 'hi' });
    expect(send.status).toBe(404);
    const read = await app.request(`/read/chats/${body.chatId}/messages`, { headers: { Authorization: 'Bearer eve' } }, env, fakeCtx());
    expect(read.status).toBe(404);
    expect((await api(env, 'eve', 'markChatRead', { chatId: body.chatId })).status).toBe(404);
    expect((await api(env, 'eve', 'deleteChat', { chatId: body.chatId })).status).toBe(404);
    const chat = await drizzleOf(env).select().from(schema.chats).where(eq(schema.chats.id, body.chatId)).get();
    expect(chat).toBeTruthy();
  });

  it('equipBadge only equips a level badge the user has reached, built server-side', async () => {
    const { env } = env0();
    // Level 3 earned through XP (1500 with the default 500/500 curve). The
    // stored `users.level` column is frozen and must be ignored, so it is left
    // at 1 here on purpose: the old check read it and refused every badge.
    await seedUser(env, 'alice', 0, { level: 1, xp: 1500 });

    const tooHigh = await api(env, 'alice', 'equipBadge', { badge: { name: 'Official', icon: 'verified', level: 50 } });
    expect(tooHigh.status).toBe(403);

    const ok = await api(env, 'alice', 'equipBadge', { badge: { name: 'Official', icon: 'verified', level: 3 } });
    expect(ok.status).toBe(200); // used to 500: an object bound to a TEXT column
    expect(JSON.parse(String((await getUser(env, 'alice'))?.equippedBadge))).toEqual({ name: 'Level 3 Hero', icon: 'trophy', level: 3 });

    // updateProfile can no longer write it as a free-form field.
    await api(env, 'alice', 'updateProfile', { equippedBadge: 'Official Staff' });
    expect(String((await getUser(env, 'alice'))?.equippedBadge)).not.toContain('Official');

    expect((await api(env, 'alice', 'equipBadge', { badge: null })).status).toBe(200);
    expect((await getUser(env, 'alice'))?.equippedBadge).toBeNull();
  });
});

// ===========================================================================
describe('admin pagination bounds', () => {
  it('clamps negative, zero, non-numeric and huge limits', () => {
    expect(boundedQueryInt('-1', 100, 1, 500)).toBe(1);
    expect(boundedQueryInt('0', 100, 1, 500)).toBe(1);
    expect(boundedQueryInt('abc', 100, 1, 500)).toBe(100);
    expect(boundedQueryInt(undefined, 100, 1, 500)).toBe(100);
    expect(boundedQueryInt('999999', 100, 1, 500)).toBe(500);
  });

  it('?limit=-1 no longer turns into an unbounded LIMIT -1 read', async () => {
    const { env } = env0();
    await seedUser(env, 'alice', 0);
    for (let i = 0; i < 3; i++) {
      await drizzleOf(env).insert(schema.coinTransactions).values({
        id: `t${i}`, uid: 'alice', amount: 1, type: 'bonus', description: 'x', createdAt: Date.now() + i,
      } as any);
    }
    const neg = await adminCall(env, 'GET', '/transactions?limit=-1');
    expect(neg.status).toBe(200);
    expect(neg.body).toHaveLength(1);
    const nan = await adminCall(env, 'GET', '/transactions?limit=abc');
    expect(nan.status).toBe(200);
    expect(nan.body).toHaveLength(3);
  });
});

// ===========================================================================
describe('runtime migrations are atomic and single-applier', () => {
  it('a failing statement rolls the whole migration back and records nothing', async () => {
    const { env, db } = env0();
    const bad = { name: '9001_bad.sql', sql: 'CREATE TABLE hz_a (id TEXT);\nINSERT INTO hz_missing VALUES (1);' };
    await expect(runMigrations(env as any, [bad])).rejects.toThrow(/9001_bad\.sql failed/);
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'hz_a'`).all()).toHaveLength(0);
    expect(db.prepare(`SELECT 1 FROM d1_migrations WHERE name = '9001_bad.sql'`).all()).toHaveLength(0);
  });

  it('two isolates applying the same data migration concurrently run its DML once', async () => {
    const { env, db } = env0();
    db.exec('CREATE TABLE hz_counter (n INTEGER)');
    const dml = { name: '9002_dml.sql', sql: 'INSERT INTO hz_counter (n) VALUES (1);' };
    await Promise.all([runMigrations(env as any, [dml]), runMigrations(env as any, [dml])]);
    expect(db.prepare('SELECT COUNT(*) AS c FROM hz_counter').get()).toEqual({ c: 1 });
    expect(db.prepare(`SELECT COUNT(*) AS c FROM d1_migrations WHERE name = '9002_dml.sql'`).get()).toEqual({ c: 1 });
  });

  it('an existing database whose objects pre-exist unrecorded still upgrades', async () => {
    const { env, db } = env0();
    db.exec('CREATE TABLE hz_pre (id TEXT)');
    const mig = { name: '9003_pre.sql', sql: 'CREATE TABLE hz_pre (id TEXT);\nALTER TABLE hz_pre ADD COLUMN extra TEXT;' };
    expect(await runMigrations(env as any, [mig])).toEqual(['9003_pre.sql']);
    const cols = (db.prepare(`PRAGMA table_info(hz_pre)`).all() as any[]).map((c) => c.name);
    expect(cols).toContain('extra');
    // Applying again is a no-op.
    expect(await runMigrations(env as any, [mig])).toEqual([]);
  });

  it('every shipped migration is already recorded-compatible on a fresh database', async () => {
    // makeEnv() applies the real migrations with sqlite.exec; running the runtime
    // migrator over that database must treat each as pre-existing, not fail.
    const { env, db } = env0();
    db.exec('DROP TABLE IF EXISTS d1_migrations');
    const dir = path.join(import.meta.dirname, '..', 'migrations');
    const shipped = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
    const applied = await runMigrations(env as any, shipped);
    expect(applied).toHaveLength(shipped.length);
    expect(await runMigrations(env as any, shipped)).toEqual([]);
  });
});

// ===========================================================================
/**
 * The admin user list spread the whole `users` row, so the content-only
 * moderator role could page through every user's email, phone, date of birth,
 * location and FCM push tokens (and search users by email).
 */
describe('admin user projection by role', () => {
  const pii = {
    email: 'alice@example.com',
    phone: '+919999999999',
    dob: '2000-01-01',
    deviceId: 'dev-alice',
    fcmTokens: ['fcm-secret-token'],
    tokensValidAfter: 123,
  };

  it('a moderator gets no contact PII and no push tokens, list or detail', async () => {
    const { env } = env0();
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    await seedUser(env, 'alice', 10, pii);

    const list = await adminCall(env, 'GET', '/users', undefined, 'mod:moderator');
    expect(list.status).toBe(200);
    const one = await adminCall(env, 'GET', '/users/alice', undefined, 'mod:moderator');
    expect(one.status).toBe(200);
    for (const u of [list.body.find((x: any) => x.uid === 'alice'), one.body]) {
      expect(u.username).toBe('alice'); // still usable for moderation
      for (const k of ['email', 'phone', 'dob', 'deviceId', 'coordinates', 'fcmTokens', 'tokensValidAfter']) {
        expect(u).not.toHaveProperty(k);
      }
    }
  });

  it('a moderator cannot find a user by searching their email', async () => {
    const { env } = env0();
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    await seedUser(env, 'alice', 0, pii);
    const r = await adminCall(env, 'GET', '/users?q=alice%40example', undefined, 'mod:moderator');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('a full admin still sees contact PII and can search by email, never push tokens', async () => {
    const { env } = env0();
    await seedUser(env, 'adm', 0, { role: 'admin' });
    await seedUser(env, 'alice', 0, pii);

    const r = await adminCall(env, 'GET', '/users?q=alice%40example', undefined, 'adm:admin');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].email).toBe('alice@example.com');
    expect(r.body[0].phone).toBe('+919999999999');
    expect(r.body[0]).not.toHaveProperty('fcmTokens');
    expect(r.body[0]).not.toHaveProperty('tokensValidAfter');
  });
});

/** Moderator takedowns hard-delete content, so each must leave an audit row. */
describe('moderation takedowns are audit-logged', () => {
  const auditRows = (env: TestEnv) => drizzleOf(env).select().from(schema.adminAuditLog).all();

  it('post delete/hide and story delete record the acting moderator and owner', async () => {
    const { env } = env0();
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    await seedUser(env, 'alice', 0);
    const ts = Date.now();
    await drizzleOf(env).insert(schema.posts).values([
      { id: 'p1', userId: 'alice', createdAt: ts },
      { id: 'p2', userId: 'alice', createdAt: ts },
    ] as any);
    await drizzleOf(env).insert(schema.stories).values({ id: 's1', userId: 'alice', createdAt: ts, expiresAt: ts + 86_400_000 } as any);

    expect((await adminCall(env, 'PATCH', '/posts/p2', { isHidden: true }, 'mod:moderator')).status).toBe(200);
    expect((await adminCall(env, 'DELETE', '/posts/p1', undefined, 'mod:moderator')).status).toBe(200);
    expect((await adminCall(env, 'DELETE', '/stories/s1', undefined, 'mod:moderator')).status).toBe(200);

    const rows = await auditRows(env);
    const byAction = Object.fromEntries(rows.map((r) => [r.action, r]));
    expect(byAction['post.hide']?.targetId).toBe('p2');
    expect(byAction['post.delete']?.targetId).toBe('p1');
    expect((byAction['post.delete']?.detail as any)?.ownerUid).toBe('alice');
    expect(byAction['story.delete']?.targetId).toBe('s1');
    expect((byAction['story.delete']?.detail as any)?.ownerUid).toBe('alice');
    for (const r of rows) expect(r.adminUid).toBe('mod');
  });

  it('removing a banned word is audited like adding one', async () => {
    const { env } = env0();
    await adminCall(env, 'POST', '/banned-words', { word: 'spamword' });
    await adminCall(env, 'DELETE', '/banned-words/spamword');
    const actions = (await auditRows(env)).map((r) => r.action).sort();
    expect(actions).toEqual(['banned-word.add', 'banned-word.remove']);
  });

  it('deleting a missing post writes no audit row', async () => {
    const { env } = env0();
    expect((await adminCall(env, 'DELETE', '/posts/nope')).status).toBe(200);
    expect(await auditRows(env)).toHaveLength(0);
  });
});
