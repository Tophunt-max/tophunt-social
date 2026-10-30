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
const OLD = Date.now() - 30 * 86_400_000;
/** A shop customer who passes the hard rules: verified phone, 30-day-old account. */
const verified = (phone: string, extra: Record<string, any> = {}) => ({ phone, phoneVerified: true, createdAt: OLD, ...extra });
/** Fraud rules relaxed so the lifecycle tests are about the lifecycle. */
const RELAXED = { requireVerifiedPhone: true, minAccountAgeDays: 3, maxOrdersPer30Days: 50, maxCoinsPer30Days: 1_000_000, maxAccountsPerAddress: 5, reviewFirstOrder: false, reviewAboveCoins: 0 };
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

  it('tells old app builds that buying, UPI deposits and withdrawals are off, whatever the stored config says', async () => {
    const { env } = makeEnv(RETIRED);
    await config(env, { features: { topups: true, withdrawals: true }, withdrawal: { enabled: true }, paymentGateway: { mode: 'manual', upiId: 'x@upi', qrImageUrl: 'https://media.test/qr.jpg' } });
    const res = await app.request('/read/app-config', {}, env, fakeCtx());
    const body: any = await res.json();
    expect(body.features).toMatchObject({ topups: false, withdrawals: false });
    expect(body.withdrawal).toMatchObject({ enabled: false, payoutsFrozen: true });
    expect(body.paymentGateway).toEqual({ mode: 'off' });
    expect(JSON.stringify(body)).not.toMatch(/x@upi|qr\.jpg/);
  });

  it('admin can no longer approve an old manual deposit, only reject it', async () => {
    const { env } = makeEnv(RETIRED);
    await seedUser(env, 'alice');
    const ts = Date.now();
    await drizzleOf(env).insert(schema.deposits).values({ id: 'd1', userId: 'alice', amount: 100, payAmount: 10, utr: 'UTR12345', status: 'pending', createdAt: ts, updatedAt: ts } as any);
    let r = await admin(env, 'PATCH', '/deposits/d1', { action: 'approve' });
    expect(r.body.error.reason).toBe('cash_flows_retired');
    expect((await user(env, 'alice'))!.dpcoin).toBe(0);
    r = await admin(env, 'PATCH', '/deposits/d1', { action: 'reject', adminNote: 'retired' });
    expect(r.status).toBe(200);
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
    await config(env, { monetization: { shop: { enabled: true, fraud: RELAXED } }, coinPricing: { dpCoinInr: 1 } });
    await seedUser(env, 'alice', dp + diamonds, diamonds, verified('9876543210'));
    await seedUser(env, 'bob', 1000, 0, verified('9876500000'));
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
    await config(env, { monetization: { shop: { enabled: true, fraud: RELAXED } }, coinPricing: { dpCoinInr: 0.5 } });
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
describe('shop fraud protection', () => {
  const STRICT = { requireVerifiedPhone: true, minAccountAgeDays: 3, maxOrdersPer30Days: 2, maxCoinsPer30Days: 800, maxAccountsPerAddress: 2, reviewFirstOrder: true, reviewAboveCoins: 500 };
  async function setup(fraud: any = STRICT) {
    const { env } = makeEnv(RETIRED);
    await config(env, { monetization: { shop: { enabled: true, fraud } }, coinPricing: { dpCoinInr: 1 } });
    await admin(env, 'PUT', '/monetization/shop/products/cap', { title: 'Cap', priceInr: 100, active: true, variants: [{ label: 'One size', stock: 100 }] });
    const { env: e } = { env };
    return e;
  }
  const variantOf = async (env: TestEnv) => (await env.DB.prepare(`SELECT id FROM shop_variants WHERE product_id = 'cap'`).first<any>()).id as string;
  const buy = async (env: TestEnv, uid: string, qty: number, n: number | string, addr: any = address) => {
    const r = await call(env, uid, 'placeShopOrder', { items: [{ productId: 'cap', variantId: await variantOf(env), qty }], address: addr, expectedTotalCoins: 100 * qty, requestId: rid(n) });
    return r;
  };

  it('refuses an unverified phone and a brand-new account, charging nothing', async () => {
    const env = await setup();
    await seedUser(env, 'nophone', 1000, 0, { createdAt: OLD });
    expect((await buy(env, 'nophone', 1, 1)).body.error.reason).toBe('phone_not_verified');
    await seedUser(env, 'newbie', 1000, 0, verified('9000000001', { createdAt: Date.now() - 3600_000 }));
    expect((await buy(env, 'newbie', 1, 2)).body.error.reason).toBe('account_too_new');
    expect((await user(env, 'nophone'))!.dpcoin).toBe(1000);
    expect((await user(env, 'newbie'))!.dpcoin).toBe(1000);
  });

  it('enforces the 30-day order and DP coin limits, also under concurrency', async () => {
    const env = await setup({ ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 });
    await seedUser(env, 'alice', 5000, 0, verified('9876543210'));
    expect((await buy(env, 'alice', 5, 1)).status).toBe(200); // 500
    expect((await buy(env, 'alice', 4, 2)).body.error.reason).toBe('coin_limit'); // 500 + 400 > 800
    expect((await buy(env, 'alice', 1, 3)).status).toBe(200); // 2nd order
    expect((await buy(env, 'alice', 1, 4)).body.error.reason).toBe('order_limit');
    const { env: env2 } = makeEnv(RETIRED);
    await config(env2, { monetization: { shop: { enabled: true, fraud: { ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0, maxOrdersPer30Days: 1 } } }, coinPricing: { dpCoinInr: 1 } });
    await admin(env2, 'PUT', '/monetization/shop/products/cap', { title: 'Cap', priceInr: 100, active: true, variants: [{ label: 'One size', stock: 100 }] });
    await seedUser(env2, 'bob', 5000, 0, verified('9876500000'));
    const results = await Promise.all([1, 2, 3].map((i) => buy(env2, 'bob', 1, `c${i}`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await user(env2, 'bob'))!.dpcoin).toBe(4900);
    await assertLedger(env2, 'bob');
  });

  it('caps how many accounts can ship to one address or phone', async () => {
    const env = await setup({ ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 });
    for (const [uid, phone] of [['a1', '9100000001'], ['a2', '9100000002'], ['a3', '9100000003']]) await seedUser(env, uid, 1000, 0, verified(phone));
    expect((await buy(env, 'a1', 1, 1)).status).toBe(200);
    expect((await buy(env, 'a2', 1, 2)).status).toBe(200); // 2 accounts allowed
    const third = await buy(env, 'a3', 1, 3);
    expect(third.body.error.reason).toBe('address_limit');
    // Same phone, different address, is caught too.
    const other = { ...address, phone: '9123456780', addressLine1: '99 Other Lane', postalCode: '560001', city: 'Bengaluru', state: 'Karnataka' };
    expect((await buy(env, 'a3', 1, 4, other)).status).toBe(200);
    expect((await buy(env, 'a3', 1, 5, { ...other, phone: address.phone })).body.error.reason).toBe('address_limit');
  });

  it('holds weak-signal orders for review: first order, large order, shared device, collusion', async () => {
    const env = await setup();
    await seedUser(env, 'alice', 5000, 0, verified('9876543210', { deviceId: 'dev-1' }));
    await seedUser(env, 'twin', 0, 0, verified('9876543211', { deviceId: 'dev-1' }));
    // 3 wins, all against twin.
    for (let i = 0; i < 3; i++) {
      await env.DB.prepare(`INSERT INTO contest_matches (id, status, user_a, user_b, winner_uid, created_at) VALUES (?, 'completed', ?, ?, 'alice', ?)`)
        .bind(`m${i}`, JSON.stringify({ uid: 'alice' }), JSON.stringify({ uid: 'twin' }), Date.now() - 86_400_000).run();
    }
    const r = await buy(env, 'alice', 5, 1); // 500 = large
    expect(r.status).toBe(200);
    expect(r.body.order.reviewStatus).toBe('pending');
    const row = await env.DB.prepare(`SELECT risk_flags FROM shop_orders WHERE id = ?`).bind(r.body.order.id).first<any>();
    expect(JSON.parse(row.risk_flags).sort()).toEqual(['first_order', 'large_order', 'same_opponent_wins', 'shared_device']);
    // Coins are held, but the admin cannot pack it until reviewed.
    expect((await user(env, 'alice'))!.dpcoin).toBe(4500);
    const id = encodeURIComponent(r.body.order.id);
    const pack = await admin(env, 'POST', `/monetization/shop/orders/${id}/status`, { status: 'packed' });
    expect(pack.body.error.reason).toBe('review_pending');
    const list = await admin(env, 'GET', '/monetization/shop/orders?review=pending');
    expect(list.body.orders).toHaveLength(1);
    expect(list.body.counts.review_pending).toBe(1);
    const detail = await admin(env, 'GET', `/monetization/shop/orders/${id}`);
    expect(detail.body.next).toEqual(['cancelled']);
    expect(detail.body.risk.flags).toContain('shared_device');
  });

  it('approve lets the order ship; reject cancels it and refunds once', async () => {
    const env = await setup();
    await seedUser(env, 'alice', 5000, 0, verified('9876543210'));
    const a = (await buy(env, 'alice', 1, 1)).body.order;
    expect(a.reviewStatus).toBe('pending'); // first order
    const ida = encodeURIComponent(a.id);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${ida}/review`, { decision: 'approve' })).status).toBe(200);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${ida}/status`, { status: 'packed' })).status).toBe(200);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${ida}/review`, { decision: 'reject', note: 'x y z' })).status).toBe(412);

    const b = (await buy(env, 'alice', 5, 2)).body.order; // large → pending
    const idb = encodeURIComponent(b.id);
    expect((await admin(env, 'POST', `/monetization/shop/orders/${idb}/review`, { decision: 'reject' })).status).toBe(400); // reason needed
    expect((await admin(env, 'POST', `/monetization/shop/orders/${idb}/review`, { decision: 'reject', note: 'Suspicious account' })).status).toBe(200);
    const got = (await call(env, 'alice', 'getShopOrder', { orderId: b.id })).body.order;
    expect(got).toMatchObject({ status: 'cancelled', reviewStatus: 'rejected' });
    expect((await user(env, 'alice'))!.dpcoin).toBe(4900); // only the approved 100 stays spent
    expect((await env.DB.prepare(`SELECT stock FROM shop_variants WHERE product_id = 'cap'`).first<any>()).stock).toBe(99);
    await assertLedger(env, 'alice');
    expect(await env.DB.prepare(`SELECT 1 FROM admin_audit_log WHERE action = 'shop.order.review.reject'`).first()).toBeTruthy();
  });

  it('admin user summary shows orders, limits and review state; moderators are refused', async () => {
    const env = await setup();
    await seedUser(env, 'alice', 5000, 0, verified('9876543210'));
    await buy(env, 'alice', 2, 1);
    const r = await admin(env, 'GET', '/monetization/users/alice/summary');
    expect(r.status).toBe(200);
    expect(r.body.orders).toHaveLength(1);
    expect(r.body.orders[0]).toMatchObject({ totalCoins: 200, reviewStatus: 'pending' });
    expect(r.body.limits).toMatchObject({ orders30: 1, maxOrders30: 2, coins30: 200, maxCoins30: 800 });
    await seedUser(env, 'mod', 0, 0, { role: 'moderator' });
    expect((await admin(env, 'GET', '/monetization/users/alice/summary', undefined, 'mod:moderator')).status).toBe(403);
    const ov = await admin(env, 'GET', '/overview');
    expect(ov.body.pendingShopReview).toBe(1);
  });

  it('daily trend reports Diamonds earned, DP coin spent and orders', async () => {
    const env = await setup({ ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 });
    await seedUser(env, 'alice', 5000, 0, verified('9876543210'));
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES ('d1', 'alice', 7, 'daily_reward', 'x', ?, 7)`).bind(Date.now()).run();
    await buy(env, 'alice', 2, 1);
    const r = await admin(env, 'GET', '/monetization/daily?days=3');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(3);
    expect(r.body[2]).toMatchObject({ diamondsEarned: 7, dpCoinSpent: 200, orders: 1 });
  });

  it('monthly shop budget (₹) caps physical orders platform-wide; cancelled orders free it again', async () => {
    const env = await setup({ ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 });
    await config(env, { monetization: { shop: { enabled: true, monthlyBudgetInr: 300, fraud: { ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 } } }, coinPricing: { dpCoinInr: 1 } });
    await seedUser(env, 'alice', 5000, 0, verified('9876543210'));
    await seedUser(env, 'bob', 5000, 0, verified('9876500000'));
    const a = await buy(env, 'alice', 2, 1); // ₹200
    expect(a.status).toBe(200);
    const b = await buy(env, 'bob', 2, 2); // would be ₹400 > ₹300
    expect(b.body.error.reason).toBe('shop_budget_exhausted');
    expect((await user(env, 'bob'))!.dpcoin).toBe(5000);
    expect((await buy(env, 'bob', 1, 3)).status).toBe(200); // ₹300 exactly
    await call(env, 'alice', 'cancelShopOrder', { orderId: a.body.order.id });
    expect((await buy(env, 'bob', 2, 4)).status).toBe(200); // ₹100 + ₹200 after the cancel
  });

  it('three-coin report: XP, Diamond, DP coin and the shop budget meter', async () => {
    const env = await setup({ ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 });
    await config(env, {
      monetization: { shop: { enabled: true, monthlyBudgetInr: 1000, fraud: { ...STRICT, reviewFirstOrder: false, reviewAboveCoins: 0 } }, earning: { xpConversion: { enabled: true, xpPerDiamond: 100, maxDiamondsPerDay: 5 } } },
      coinPricing: { dpCoinInr: 1, diamondInr: 0.5 },
    });
    await seedUser(env, 'alice', 5000, 0, verified('9876543210', { xp: 1000 }));
    await call(env, 'alice', 'convertXp', { diamonds: 2, requestId: rid('x1') });
    await buy(env, 'alice', 3, 1);
    const r = await admin(env, 'GET', '/monetization/coins?days=7');
    expect(r.status).toBe(200);
    expect(r.body.xp).toMatchObject({ total: 1000, converted: 200, convertible: 800 });
    expect(r.body.xp.period).toMatchObject({ conversions: 1, xpSpent: 200, diamonds: 2 });
    expect(r.body.diamond).toMatchObject({ supply: 2, valueInr: 1 });
    expect(r.body.diamond.earned).toContainEqual({ type: 'xp_conversion', count: 1, diamonds: 2 });
    expect(r.body.dpCoin.supply).toBe(4700);
    expect(r.body.dpCoin.spent).toContainEqual({ type: 'shop_order', count: 1, dpCoin: 300 });
    expect(r.body.shopBudget).toMatchObject({ monthlyBudgetInr: 1000, spentThisMonthInr: 300 });
  });

  it('a customer can still cancel an order that is under review', async () => {
    const env = await setup();
    await seedUser(env, 'alice', 5000, 0, verified('9876543210'));
    const o = (await buy(env, 'alice', 1, 1)).body.order;
    expect((await call(env, 'alice', 'cancelShopOrder', { orderId: o.id })).status).toBe(200);
    expect((await user(env, 'alice'))!.dpcoin).toBe(5000);
  });

  it('settings are validated and thresholds are not public', async () => {
    const { env } = makeEnv(RETIRED);
    expect((await admin(env, 'POST', '/app-settings', { monetization: { shop: { fraud: { maxAccountsPerAddress: 0 } } } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { monetization: { shop: { fraud: { bogus: 1 } } } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', { monetization: { shop: { enabled: true, fraud: { maxOrdersPer30Days: 4 } } } })).status).toBe(200);
    const pub = (await (await app.request('/read/app-config', { method: 'GET' }, env, fakeCtx())).json()) as any;
    expect(pub.monetization.shop).toEqual({ enabled: true, requireVerifiedPhone: true });
  });
});
