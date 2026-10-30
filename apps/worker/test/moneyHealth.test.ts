/**
 * Money-flow integrity console.
 *
 * The core invariant of the coin economy is `users.dpcoin == SUM(ledger)` for
 * every user — a drift means coins were minted or burned without a ledger row,
 * the one bug you must never find out about late. This proves computeMoneyHealth
 * actually detects that (and the other real money leaks), and that a clean books
 * reads green. The queries are raw SQL over the D1 shim, so this is also what
 * catches a typo in one of them.
 */
import { describe, it, expect } from 'vitest';
import { computeMoneyHealth } from '../src/lib/moneyHealth';
import { makeEnv, drizzleOf } from './helpers/harness';
import { schema } from '../src/db';

/** Seed a user with a balance and (optionally) matching ledger rows. */
async function user(db: ReturnType<typeof drizzleOf>, uid: string, dpcoin: number) {
  await db.insert(schema.users).values({ signupCompleted: true, uid, dpcoin, createdAt: Date.now(), updatedAt: Date.now() } as any).run();
}
async function ledger(db: ReturnType<typeof drizzleOf>, uid: string, amount: number, type = 'admin_adjust') {
  await db.insert(schema.coinTransactions).values({
    id: `${uid}-${amount}-${Math.random()}`, uid, amount, type, createdAt: Date.now(),
  }).run();
}

describe('computeMoneyHealth — ledger drift (the core invariant)', () => {
  it('is clean when every balance equals its ledger sum', async () => {
    const { env } = makeEnv();
    const db = drizzleOf(env);
    await user(db, 'alice', 100);
    await ledger(db, 'alice', 60, 'daily_reward');
    await ledger(db, 'alice', 40, 'reward');

    const h = await computeMoneyHealth(env);
    expect(h.ledgerDrift.count).toBe(0);
    expect(h.ok).toBe(true);
  });

  it('flags a user whose balance does not match the ledger', async () => {
    const { env } = makeEnv();
    const db = drizzleOf(env);
    // Balance 100 but ledger only accounts for 70 → 30 coins appeared unledgered.
    await user(db, 'bob', 100);
    await ledger(db, 'bob', 70, 'daily_reward');

    const h = await computeMoneyHealth(env);
    expect(h.ledgerDrift.count).toBe(1);
    expect(h.ok).toBe(false);
    const sample = h.ledgerDrift.samples.find((s) => s.uid === 'bob')!;
    expect(sample.balance).toBe(100);
    expect(sample.ledger).toBe(70);
    expect(sample.diff).toBeCloseTo(30);
  });

  it('treats a user with no ledger rows and a zero balance as consistent', async () => {
    const { env } = makeEnv();
    const db = drizzleOf(env);
    await user(db, 'carol', 0);
    const h = await computeMoneyHealth(env);
    expect(h.ledgerDrift.count).toBe(0);
  });
});

describe('computeMoneyHealth — negative balances', () => {
  it('flags a balance below zero', async () => {
    const { env } = makeEnv();
    const db = drizzleOf(env);
    await user(db, 'dave', -5);
    await ledger(db, 'dave', -5, 'contest_entry_fee');

    const h = await computeMoneyHealth(env);
    expect(h.negativeBalances.count).toBe(1);
    expect(h.negativeBalances.samples[0]).toMatchObject({ uid: 'dave', balance: -5 });
    expect(h.ok).toBe(false);
  });
});

describe('computeMoneyHealth — Diamonds (locked_coins)', () => {
  async function lockedUser(env: any, uid: string, dpcoin: number, locked: number, ledgerAmount: number, ledgerLocked: number) {
    const ts = Date.now();
    await env.DB.prepare(`INSERT INTO users (uid, signup_completed, dpcoin, locked_coins, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)`)
      .bind(uid, dpcoin, locked, ts, ts).run();
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, locked_delta, type, created_at) VALUES (?, ?, ?, ?, 'daily_reward', ?)`)
      .bind(`${uid}-seed`, uid, ledgerAmount, ledgerLocked, ts).run();
  }

  it('is clean when Diamonds match their ledger and sit inside the balance', async () => {
    const { env } = makeEnv();
    await lockedUser(env, 'erin', 50, 20, 50, 20);
    const h = await computeMoneyHealth(env);
    expect(h.lockedDrift).toMatchObject({ count: 0, overBalance: 0 });
    expect(h.ok).toBe(true);
  });

  it('flags Diamonds out of step with their ledger', async () => {
    const { env } = makeEnv();
    await lockedUser(env, 'fay', 50, 30, 50, 20);
    const h = await computeMoneyHealth(env);
    expect(h.lockedDrift.count).toBe(1);
    expect(h.lockedDrift.samples[0]).toMatchObject({ uid: 'fay', locked: 30, ledger: 20 });
    expect(h.ok).toBe(false);
  });

  it('flags Diamonds above the balance they are part of', async () => {
    const { env } = makeEnv();
    await lockedUser(env, 'gus', 10, 40, 10, 40);
    const h = await computeMoneyHealth(env);
    expect(h.lockedDrift.count).toBe(0);
    expect(h.lockedDrift.overBalance).toBe(1);
    expect(h.ok).toBe(false);
  });
});

describe('computeMoneyHealth — promo-budget holds', () => {
  it('counts a held reservation on a finished match, not one on a live match', async () => {
    const { env } = makeEnv();
    const ts = Date.now();
    await env.DB.prepare(`INSERT INTO contest_matches (id, status, created_at) VALUES ('m-done', 'completed', ?), ('m-live', 'active', ?)`).bind(ts, ts).run();
    await env.DB.prepare(
      `INSERT INTO promo_reservations (id, budget_id, uid, coins, status, ref_type, ref_id, created_at, updated_at)
       VALUES ('r1', 'b1', 'u1', 5, 'held', 'match', 'm-done', ?, ?), ('r2', 'b1', 'u1', 5, 'held', 'match', 'm-live', ?, ?),
              ('r3', 'b1', 'u1', 5, 'committed', 'match', 'm-done', ?, ?)`,
    ).bind(ts, ts, ts, ts, ts, ts).run();
    const h = await computeMoneyHealth(env);
    expect(h.staleReservations).toBe(1);
    expect(h.ok).toBe(false);
  });
});

describe('computeMoneyHealth — shape', () => {
  it('reports only the coin checks: no payment, deposit or withdrawal metrics', async () => {
    const { env } = makeEnv();
    const h = await computeMoneyHealth(env);
    expect(Object.keys(h).sort()).toEqual(['ledgerDrift', 'lockedDrift', 'negativeBalances', 'ok', 'staleReservations', 'ts']);
    expect(h.ok).toBe(true);
  });
});

describe('GET /admin/money-health route', () => {
  it('returns the health payload to a full admin', async () => {
    const { makeApp } = await import('./helpers/harness');
    const { env } = makeEnv();
    const db = drizzleOf(env);
    await user(db, 'bob', 100);
    await ledger(db, 'bob', 70, 'daily_reward');

    const app = makeApp();
    const res = await app.request('/admin/money-health', { headers: { 'X-Admin-Secret': 'test-admin-secret' } }, env);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.ledgerDrift.count).toBe(1);
    expect(body.ok).toBe(false);
  });
});
