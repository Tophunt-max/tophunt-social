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
import { coinValuesFromConfig, dpCoinsForPaise } from '../src/lib/coinPricing';

const app = makeApp();
const RETIRED = { CASH_FLOWS_RETIRED: 'true' } as any;

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

/** As the server (X-Admin-Secret = superadmin) or as a Firebase admin token. */
async function admin(env: TestEnv, method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else headers['X-Admin-Secret'] = 'test-admin-secret';
  const res = await app.request(`/admin${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, dpcoin = 0, lockedCoins = 0, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin, lockedCoins, createdAt: ts, updatedAt: ts, ...extra } as any);
  if (dpcoin) {
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES (?, ?, ?, 'admin_adjustment', 'seed', ?, ?)`)
      .bind(`seed:${uid}`, uid, dpcoin, ts, lockedCoins).run();
  }
}
const user = (env: TestEnv, uid: string) => drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();

async function config(env: TestEnv, data: any) {
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data, updatedAt: Date.now() } as any)
    .onConflictDoUpdate({ target: schema.settings.id, set: { data } });
  await env.CACHE_KV.delete('settings:appConfig');
}

async function assertLedger(env: TestEnv, uid: string) {
  const u = await user(env, uid);
  const s = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS a, COALESCE(SUM(locked_delta),0) AS l FROM coin_transactions WHERE uid = ?`).bind(uid).first<any>();
  expect(Number(u!.dpcoin)).toBe(Number(s.a));
  expect(Number((u as any).lockedCoins)).toBe(Number(s.l));
}

const rid = (n: number | string) => `req-${String(n).padStart(8, '0')}`;
const address = { recipientName: 'Asha Rao', phone: '9876543210', addressLine1: '12 MG Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India' };

// ===========================================================================
describe('cash flows retired', () => {
  it('refuses new coin purchases, manual deposits and withdrawals server-side', async () => {
    const { env } = makeEnv(RETIRED);
    await seedUser(env, 'alice', 100, 10);
    for (const action of ['createOrder', 'requestDeposit', 'requestWithdrawal']) {
      const r = await call(env, 'alice', action, { packageId: 'p1', amount: 50, method: 'upi', accountDetails: 'a@upi', utr: '12345' });
      expect(r.status).toBe(412);
      expect(r.body.error.reason).toBe('cash_flows_retired');
    }
    expect((await user(env, 'alice'))!.dpcoin).toBe(100);
  });

  it('defaults to retired when the deploy flag is missing', async () => {
    const { env } = makeEnv({ CASH_FLOWS_RETIRED: undefined } as any);
    await seedUser(env, 'alice', 100);
    expect((await call(env, 'alice', 'requestWithdrawal', { amount: 50 })).body.error.reason).toBe('cash_flows_retired');
  });

  it('sells no coin packages', async () => {
    const { env } = makeEnv(RETIRED);
    const ts = Date.now();
    await drizzleOf(env).insert(schema.coinPackages).values({ id: 'p1', name: 'x', coins: 10, bonusCoins: 0, priceInr: 10, active: true, sortOrder: 0, createdAt: ts, updatedAt: ts } as any);
    const res = await app.request('/read/coin-packages', { method: 'GET' }, env, fakeCtx());
    expect(await res.json()).toEqual([]);
  });

  it('admin can no longer approve a withdrawal, but can reject it (DP coin returned)', async () => {
    const { env } = makeEnv(RETIRED);
    await seedUser(env, 'alice', 0);
    const ts = Date.now();
    await env.DB.prepare(`INSERT INTO withdrawals (id, user_id, amount, method, account_details, status, reserved, created_at, updated_at) VALUES ('w1', 'alice', 40, 'upi', 'a@upi', 'pending', 1, ?, ?)`).bind(ts, ts).run();
    const approve = await admin(env, 'PATCH', '/withdrawals/w1', { action: 'approve' });
    expect(approve.status).toBe(412);
    const reject = await admin(env, 'PATCH', '/withdrawals/w1', { action: 'reject', adminNote: 'retired' });
    expect(reject.status).toBe(200);
    expect((await user(env, 'alice'))!.dpcoin).toBe(40);
  });
});

// ===========================================================================
describe('coin values in INR', () => {
  it('derive DP coin prices from ₹ and never undercharge', () => {
    expect(dpCoinsForPaise(49900, 1)).toBe(499); // ₹499 at ₹1/coin
    expect(dpCoinsForPaise(49900, 0.5)).toBe(998);
    expect(dpCoinsForPaise(10000, 3)).toBe(34); // 33.33 → 34
    expect(dpCoinsForPaise(0, 1)).toBe(0);
  });

  it('fall back to the legacy payout rate, prefer the new keys, and are public', async () => {
    expect(coinValuesFromConfig({ withdrawal: { conversionRate: 0.25 } })).toEqual({ dpCoinInr: 0.25, diamondInr: 0.25 });
    expect(coinValuesFromConfig({ coinPricing: { dpCoinInr: 2, diamondInr: 0.1 } })).toEqual({ dpCoinInr: 2, diamondInr: 0.1 });
    const { env } = makeEnv(RETIRED);
    const bad = await admin(env, 'POST', '/app-settings', { coinPricing: { dpCoinInr: -1 } });
    expect(bad.status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { coinPricing: { dpCoinInr: 2, diamondInr: 0.5 } })).status).toBe(200);
    const pub = await app.request('/read/app-config', { method: 'GET' }, env, fakeCtx());
    expect(((await pub.json()) as any).coinValues).toEqual({ dpCoinInr: 2, diamondInr: 0.5 });
  });
});

// ===========================================================================
describe('physical shop', () => {
  async function setup(dp = 1000, diamonds = 0) {
    const { env } = makeEnv(RETIRED);
    await config(env, { monetization: { shop: { enabled: true } }, coinPricing: { dpCoinInr: 1 } });
    await seedUser(env, 'alice', dp + diamonds, diamonds);
    await seedUser(env, 'bob', 1000);
    const r = await admin(env, 'PUT', '/monetization/shop/products/tshirt', {
      title: 'TopHunt T-shirt', priceInr: 299, shippingInr: 50, active: true, returnDays: 7,
      images: ['https://cdn.test/t.jpg'], variants: [{ label: 'M', stock: 2 }, { label: 'L', stock: 5 }],
    });
    expect(r.status).toBe(200);
    const products = (await call(env, 'alice', 'getShopProducts')).body.products;
    const p = products[0];
    return { env, p, m: p.variants.find((v: any) => v.label === 'M'), l: p.variants.find((v: any) => v.label === 'L') };
  }
  const order = (env: TestEnv, uid: string, lines: any[], total: number, n: number | string = 1) =>
    call(env, uid, 'placeShopOrder', { items: lines, address, expectedTotalCoins: total, requestId: rid(n) });

  it('prices in DP coin from ₹ (delivery included) and places an order atomically', async () => {
    const { env, p, m } = await setup();
    expect(p.priceCoins).toBe(349);
    const res = await order(env, 'alice', [{ productId: p.id, variantId: m.id, qty: 2 }], 698);
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ status: 'placed', totalCoins: 698, totalInr: 698 });
    expect(res.body.order.items[0]).toMatchObject({ qty: 2, unitCoins: 349, variantLabel: 'M' });
    expect((await user(env, 'alice'))!.dpcoin).toBe(302);
    expect((await env.DB.prepare(`SELECT stock FROM shop_variants WHERE id = ?`).bind(m.id).first<any>()).stock).toBe(0);
    await assertLedger(env, 'alice');
  });

  it('pays with DP coin only: Diamonds cannot buy products', async () => {
    const { env, p, l } = await setup(100, 900);
    const res = await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 349);
    expect(res.body.error.reason).toBe('insufficient_coins');
    const a = await user(env, 'alice');
    expect(a!.dpcoin).toBe(1000);
    expect((await env.DB.prepare(`SELECT stock FROM shop_variants WHERE id = ?`).bind(l.id).first<any>()).stock).toBe(5);
  });

  it('never oversells under concurrent orders', async () => {
    const { env, p, m } = await setup();
    const results = await Promise.all([
      order(env, 'alice', [{ productId: p.id, variantId: m.id, qty: 2 }], 698, 1),
      order(env, 'bob', [{ productId: p.id, variantId: m.id, qty: 2 }], 698, 2),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await env.DB.prepare(`SELECT stock FROM shop_variants WHERE id = ?`).bind(m.id).first<any>()).stock).toBe(0);
    await assertLedger(env, 'alice');
    await assertLedger(env, 'bob');
  });

  it('a retry returns the same order and charges once; a changed total is refused', async () => {
    const { env, p, l } = await setup();
    const a = await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 349);
    const b = await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 349);
    expect(b.body.order).toMatchObject({ id: a.body.order.id, replayed: true });
    expect((await user(env, 'alice'))!.dpcoin).toBe(651);
    expect((await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 300, 2)).body.error.reason).toBe('price_changed');
    expect((await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 9 }], 3141, 3)).status).toBe(400);
  });

  it('a ₹ rate change re-prices new orders only', async () => {
    const { env, p, l } = await setup();
    const first = await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 349);
    await config(env, { monetization: { shop: { enabled: true } }, coinPricing: { dpCoinInr: 0.5 } });
    const again = (await call(env, 'alice', 'getShopProducts')).body.products[0];
    expect(again.priceCoins).toBe(698);
    const stored = await call(env, 'alice', 'getShopOrder', { orderId: first.body.order.id });
    expect(stored.body.order).toMatchObject({ totalCoins: 349, dpCoinInr: 1 });
  });

  it('customer cancel refunds DP coin and restocks, exactly once', async () => {
    const { env, p, m } = await setup();
    const o = (await order(env, 'alice', [{ productId: p.id, variantId: m.id, qty: 2 }], 698)).body.order;
    expect((await call(env, 'alice', 'cancelShopOrder', { orderId: o.id })).status).toBe(200);
    expect((await call(env, 'alice', 'cancelShopOrder', { orderId: o.id })).status).toBe(412);
    expect((await user(env, 'alice'))!.dpcoin).toBe(1000);
    expect((await env.DB.prepare(`SELECT stock FROM shop_variants WHERE id = ?`).bind(m.id).first<any>()).stock).toBe(2);
    await assertLedger(env, 'alice');
  });

  it('admin ships with tracking, delivers; customer returns; admin accepts and refunds once', async () => {
    const { env, p, l } = await setup();
    const o = (await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 349)).body.order;
    const id = encodeURIComponent(o.id);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'delivered' })).status).toBe(412);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'packed' })).status).toBe(200);
    expect((await call(env, 'alice', 'cancelShopOrder', { orderId: o.id })).status).toBe(412); // packed: support only
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'shipped' })).status).toBe(400); // needs tracking
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'shipped', carrier: 'India Post', trackingNumber: 'EE123456789IN' })).status).toBe(200);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'delivered' })).status).toBe(200);
    expect((await call(env, 'alice', 'requestShopReturn', { orderId: o.id, reason: 'Wrong size' })).status).toBe(200);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'returned', restock: true })).status).toBe(200);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'returned' })).status).toBe(412);
    const got = (await call(env, 'alice', 'getShopOrder', { orderId: o.id })).body.order;
    expect(got.status).toBe('returned');
    expect(got.trackingNumber).toBe('EE123456789IN');
    expect(got.history.map((h: any) => h.to)).toEqual(['placed', 'packed', 'shipped', 'delivered', 'return_requested', 'returned']);
    expect((await user(env, 'alice'))!.dpcoin).toBe(1000);
    await assertLedger(env, 'alice');
    expect(await env.DB.prepare(`SELECT 1 FROM admin_audit_log WHERE action = 'shop.order.status'`).first()).toBeTruthy();
  });

  it('orders are private to their owner and the shop can be switched off', async () => {
    const { env, p, l } = await setup();
    const o = (await order(env, 'alice', [{ productId: p.id, variantId: l.id, qty: 1 }], 349)).body.order;
    expect((await call(env, 'bob', 'getShopOrder', { orderId: o.id })).status).toBe(404);
    expect((await call(env, 'bob', 'cancelShopOrder', { orderId: o.id })).status).toBe(404);
    await config(env, { monetization: { shop: { enabled: false } } });
    expect((await call(env, 'alice', 'getShopProducts')).body.error.reason).toBe('shop_disabled');
  });

  it('moderators cannot manage products', async () => {
    const { env } = await setup();
    await seedUser(env, 'mod', 0, 0, { role: 'moderator' });
    expect((await admin(env, 'PUT', '/monetization/shop/products/x1', { title: 'x', priceInr: 10 }, 'mod:moderator')).status).toBe(403);
  });
});

// ===========================================================================
describe('XP → Diamond conversion', () => {
  async function setup(xp = 1000) {
    const { env } = makeEnv(RETIRED);
    await config(env, { monetization: { earning: { xpConversion: { enabled: true, xpPerDiamond: 100, maxDiamondsPerDay: 5 } } } });
    await seedUser(env, 'alice', 0, 0, { xp });
    return env;
  }

  it('turns XP into Diamonds without lowering XP or level', async () => {
    const env = await setup();
    const res = await call(env, 'alice', 'convertXp', { diamonds: 3, requestId: rid(1) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ diamonds: 3, xpSpent: 300, replayed: false });
    expect(res.body.status).toMatchObject({ convertibleXp: 700, diamondsToday: 3, availableDiamonds: 2 });
    const a = await user(env, 'alice');
    expect((a as any).xp).toBe(1000);
    expect((a as any).lockedCoins).toBe(3);
    expect(a!.dpcoin).toBe(3);
    await assertLedger(env, 'alice');
  });

  it('is idempotent, capped per day, and needs enough XP', async () => {
    const env = await setup(450);
    await call(env, 'alice', 'convertXp', { diamonds: 2, requestId: rid(1) });
    const replay = await call(env, 'alice', 'convertXp', { diamonds: 2, requestId: rid(1) });
    expect(replay.body.replayed).toBe(true);
    expect((await call(env, 'alice', 'convertXp', { diamonds: 3, requestId: rid(2) })).body.error.reason).toBe('not_enough_xp');
    await env.DB.prepare(`UPDATE users SET xp = 5000 WHERE uid = 'alice'`).run();
    expect((await call(env, 'alice', 'convertXp', { diamonds: 4, requestId: rid(3) })).body.error.reason).toBe('daily_limit');
    const all = await Promise.all([4, 5, 6].map((i) => call(env, 'alice', 'convertXp', { diamonds: 1, requestId: rid(i) })));
    expect(all.filter((r) => r.status === 200)).toHaveLength(3);
    expect((await call(env, 'alice', 'convertXp', { diamonds: 1, requestId: rid(7) })).status).toBe(429);
    expect((await user(env, 'alice') as any).lockedCoins).toBe(5);
    await assertLedger(env, 'alice');
  });

  it('is off by default', async () => {
    const { env } = makeEnv(RETIRED);
    await seedUser(env, 'alice', 0, 0, { xp: 1000 });
    expect((await call(env, 'alice', 'convertXp', { diamonds: 1, requestId: rid(1) })).body.error.reason).toBe('xp_conversion_disabled');
  });
});

// ===========================================================================
describe('economy reset', () => {
  const body = (extra: any = {}) => ({ resetId: 'reset-00000001', resetDpCoin: true, resetDiamonds: true, reason: 'Fresh start', confirm: 'RESET ECONOMY', ...extra });

  async function setup() {
    const { env } = makeEnv(RETIRED);
    await seedUser(env, 'alice', 120, 20);
    await seedUser(env, 'bob', 50, 0);
    await seedUser(env, 'carol', 0);
    // A held withdrawal of 30 DP coin from carol (debited at request time).
    const ts = Date.now();
    await env.DB.prepare(`INSERT INTO withdrawals (id, user_id, amount, method, account_details, status, reserved, created_at, updated_at) VALUES ('w1', 'carol', 30, 'upi', 'c@upi', 'pending', 1, ?, ?)`).bind(ts, ts).run();
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at) VALUES ('seed:carol', 'carol', 30, 'admin_adjustment', 'seed', ?), ('withdrawal_hold:w1', 'carol', -30, 'withdrawal_hold', 'hold', ?)`).bind(ts, ts).run();
    return env;
  }

  it('previews, then rejects withdrawals (refund) and zeroes every balance via ledger rows', async () => {
    const env = await setup();
    const prev = await admin(env, 'GET', '/monetization/economy/reset');
    expect(prev.body.preview).toMatchObject({ usersWithBalance: 2, openWithdrawals: 1, pendingDeposits: 0, confirmPhrase: 'RESET ECONOMY' });
    const res = await admin(env, 'POST', '/monetization/economy/reset', body());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ done: true, withdrawalsRejected: 1, usersReset: 3 });
    for (const uid of ['alice', 'bob', 'carol']) {
      const u = await user(env, uid);
      expect(u!.dpcoin).toBe(0);
      expect((u as any).lockedCoins).toBe(0);
      await assertLedger(env, uid);
    }
    expect((await env.DB.prepare(`SELECT status FROM withdrawals WHERE id = 'w1'`).first<any>()).status).toBe('rejected');
    // Repeating does nothing more.
    const again = await admin(env, 'POST', '/monetization/economy/reset', body());
    expect(again.body.done).toBe(true);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM coin_transactions WHERE type = 'economy_reset'`).first<any>()).n).toBe(3);
    const health = await admin(env, 'GET', '/money-health');
    if (health.status === 200) expect(health.body.ledgerDrift.count).toBe(0);
  });

  it('can reset DP coin only, keeping Diamonds', async () => {
    const env = await setup();
    await admin(env, 'POST', '/monetization/economy/reset', body({ resetDiamonds: false, resetId: 'reset-dp-only' }));
    const a = await user(env, 'alice');
    expect(a!.dpcoin).toBe(20);
    expect((a as any).lockedCoins).toBe(20);
    await assertLedger(env, 'alice');
  });

  it('refuses without the phrase, for non-superadmins, and while deposits are pending', async () => {
    const env = await setup();
    expect((await admin(env, 'POST', '/monetization/economy/reset', body({ confirm: 'yes' }))).status).toBe(400);
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    expect((await admin(env, 'POST', '/monetization/economy/reset', body(), 'boss:admin')).status).toBe(403);
    const ts = Date.now();
    await env.DB.prepare(`INSERT INTO deposits (id, user_id, amount, pay_amount, method, utr, status, created_at, updated_at) VALUES ('d1', 'bob', 10, 10, 'upi', 'UTR1234', 'pending', ?, ?)`).bind(ts, ts).run();
    const r = await admin(env, 'POST', '/monetization/economy/reset', body());
    expect(r.body.error.reason).toBe('pending_deposits');
    expect((await user(env, 'alice'))!.dpcoin).toBe(120);
  });
});
