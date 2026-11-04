/**
 * Shop Collections and Diamond-priced Shop Bundles (lib/storeBundles.ts).
 */
import { vi, describe, it, expect } from 'vitest';

vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role, stale] = token.split(':');
    return { uid, role: role || 'user', authTime: Math.floor(Date.now() / 1000) - (stale ? 3600 : 0) };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));
vi.mock('../src/lib/observability', () => ({ captureError: async () => undefined, logErrorToDb: async () => undefined }));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { computeMoneyHealth } from '../src/lib/moneyHealth';
import { featureForAction } from '../src/lib/appControl';
import { isSensitiveAdminRoute } from '../src/routes/admin';

const app = makeApp();
const ART = 'https://cdn.test/shop-banners/2026/11/0b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';

async function call(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function admin(env: TestEnv, method: string, path: string, body?: any, token = 'boss:admin') {
  const res = await app.request(
    `/admin${path}`,
    { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

/** A user with `dp` DP coin and `diamonds` Diamonds, opened by one ledger row so the invariants hold. */
async function seedUser(env: TestEnv, uid: string, dp = 0, diamonds = 0, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: dp + diamonds, lockedCoins: diamonds, createdAt: ts, updatedAt: ts, ...extra } as any);
  if (dp + diamonds) {
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES (?, ?, ?, 'admin_adjustment', 'seed', ?, ?)`)
      .bind(`seed:${uid}`, uid, dp + diamonds, ts, diamonds).run();
  }
}

async function balances(env: TestEnv, uid: string) {
  const u = await env.DB.prepare(`SELECT dpcoin, locked_coins, cosmetics FROM users WHERE uid = ?`).bind(uid).first<any>();
  return { total: Number(u.dpcoin), diamonds: Number(u.locked_coins), dp: Number(u.dpcoin) - Number(u.locked_coins), cosmetics: u.cosmetics };
}

async function assertLedger(env: TestEnv, uid: string) {
  const u = await balances(env, uid);
  const sums = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS a, COALESCE(SUM(locked_delta),0) AS l FROM coin_transactions WHERE uid = ?`).bind(uid).first<any>();
  expect(u.total).toBe(Number(sums.a));
  expect(u.diamonds).toBe(Number(sums.l));
  expect(u.diamonds).toBeLessThanOrEqual(u.total);
}

const ITEMS = ['bx_frame', 'bx_badge', 'bx_title', 'bx_sticker', 'bx_theme'];

async function setup(storeEnabled = true) {
  const { env } = makeEnv();
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: { monetization: { store: { enabled: storeEnabled } } } as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:appConfig');
  await seedUser(env, 'boss', 0, 0, { role: 'admin' });
  await seedUser(env, 'mod', 0, 0, { role: 'moderator' });
  await seedUser(env, 'alice', 500, 300);
  const ts = Date.now();
  const types = ['frame', 'badge', 'title', 'sticker', 'theme'];
  for (const [i, id] of ITEMS.entries()) {
    await env.DB.prepare(`INSERT INTO reward_catalog (id, type, name, description, rarity, asset, active, sort, created_at, updated_at) VALUES (?, ?, ?, '', 'rare', ?, 1, ?, ?, ?)`)
      .bind(id, types[i], `Item ${id}`, JSON.stringify({ tier: 'premium', text: 'Hi' }), i, ts, ts).run();
  }
  return env;
}

async function listItem(env: TestEnv, itemId: string, l: Record<string, any> = {}) {
  const ts = Date.now();
  await env.DB.prepare(
    `INSERT INTO store_listings (item_id, price_coins, ownership, refundable, stock_limit, active, starts_at, ends_at, sort, created_at, updated_at)
     VALUES (?, ?, 'permanent', 1, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(itemId, l.price ?? 50, l.stock ?? null, l.active === false ? 0 : 1, l.startsAt ?? null, l.endsAt ?? null, ts, ts).run();
}

const collection = (c: any = {}) => ({ name: 'Anime Collection', subtitle: 'Fan favourites', imageUrl: ART, accent: 'pink', sort: 0, active: true, itemIds: ['bx_frame', 'bx_badge'], ...c });
const bundle = (b: any = {}) => ({
  name: 'Starter Bundle', description: 'Three items', imageUrl: ART, badge: 'Best Value', priceDiamonds: 100, compareAtDiamonds: 150,
  startsAt: null, endsAt: null, stockLimit: null, sort: 0, active: true, itemIds: ['bx_frame', 'bx_badge', 'bx_title'], ...b,
});
const rid = (n: number | string) => `req-${String(n).padStart(8, '0')}`;
const buy = (env: TestEnv, uid: string, data: any = {}) =>
  call(env, uid, 'buyStoreBundle', { bundleId: 'starter', expectedPrice: 100, requestId: rid(1), ...data });

async function owned(env: TestEnv, uid: string) {
  const rows = await env.DB.prepare(`SELECT item_id, source, source_ref, revoked_at, revoke_reason FROM user_inventory WHERE uid = ? AND item_id LIKE 'bx_%' ORDER BY item_id`).bind(uid).all<any>();
  return rows.results ?? [];
}

// ===========================================================================
describe('wiring', () => {
  it('buyStoreBundle is behind the shopping kill switch; admin writes need a recent sign-in', () => {
    expect(featureForAction('buyStoreBundle')).toBe('shopping');
    expect(featureForAction('getShopCollections')).toBeNull();
    expect(isSensitiveAdminRoute('PUT', '/monetization/bundles/x')).toBe(true);
    expect(isSensitiveAdminRoute('PUT', '/monetization/collections/x')).toBe(true);
    expect(isSensitiveAdminRoute('POST', '/monetization/bundles/purchases/x/refund')).toBe(true);
  });
});

// ===========================================================================
describe('getShopCollections', () => {
  it('returns active collections with live listed items only, in admin order, and live bundles', async () => {
    const env = await setup();
    await listItem(env, 'bx_frame');
    await listItem(env, 'bx_badge');
    await listItem(env, 'bx_title', { active: false });
    await listItem(env, 'bx_sticker', { endsAt: Date.now() - 1000 });
    expect((await admin(env, 'PUT', '/monetization/collections/anime', collection({ itemIds: ['bx_badge', 'bx_title', 'bx_frame', 'bx_sticker', 'bx_theme'] }))).status).toBe(200);
    expect((await admin(env, 'PUT', '/monetization/collections/couple', collection({ name: 'Couple Collection', accent: 'gold', sort: -1, imageUrl: null, itemIds: ['bx_frame'] }))).status).toBe(200);
    expect((await admin(env, 'PUT', '/monetization/collections/hidden', collection({ name: 'Hidden', active: false }))).status).toBe(200);
    // Only unlisted items: omitted.
    expect((await admin(env, 'PUT', '/monetization/collections/festival', collection({ name: 'Festival Collection', itemIds: ['bx_theme', 'bx_title'] }))).status).toBe(200);
    expect((await admin(env, 'PUT', '/monetization/bundles/starter', bundle())).status).toBe(200);

    const res = await call(env, 'alice', 'getShopCollections');
    expect(res.status).toBe(200);
    expect(res.body.collections).toEqual([
      { id: 'couple', name: 'Couple Collection', subtitle: 'Fan favourites', imageUrl: null, accent: 'gold', itemIds: ['bx_frame'] },
      { id: 'anime', name: 'Anime Collection', subtitle: 'Fan favourites', imageUrl: ART, accent: 'pink', itemIds: ['bx_badge', 'bx_frame'] },
    ]);
    expect(res.body.bundles).toHaveLength(1);
    expect(res.body.bundles[0]).toMatchObject({
      id: 'starter', name: 'Starter Bundle', description: 'Three items', imageUrl: ART, badge: 'Best Value', priceDiamonds: 100, compareAtDiamonds: 150,
      startsAt: null, endsAt: null, remaining: null, ownedCount: 0, purchased: false,
    });
    expect(res.body.bundles[0].items.map((i: any) => i.itemId)).toEqual(['bx_frame', 'bx_badge', 'bx_title']);
    expect(res.body.bundles[0].items[0]).toEqual({ itemId: 'bx_frame', type: 'frame', name: 'Item bx_frame', rarity: 'rare', asset: { tier: 'premium', text: 'Hi' }, owned: false });

    // A deactivated catalog item disappears from the collection.
    await env.DB.prepare(`UPDATE reward_catalog SET active = 0 WHERE id = 'bx_frame'`).run();
    const after = await call(env, 'alice', 'getShopCollections');
    expect(after.body.collections.map((c: any) => c.id)).toEqual(['anime']);
    expect(after.body.bundles[0].items.map((i: any) => i.itemId)).toEqual(['bx_badge', 'bx_title']);
  });

  it('is empty when the store is disabled', async () => {
    const env = await setup(false);
    await listItem(env, 'bx_frame');
    await admin(env, 'PUT', '/monetization/collections/anime', collection());
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    expect((await call(env, 'alice', 'getShopCollections')).body).toEqual({ collections: [], bundles: [] });
    const b = await buy(env, 'alice');
    expect(b.status).toBe(412);
    expect(b.body.error.reason).toBe('store_disabled');
  });

  it('hides inactive, not started, expired, sold out bundles and those with fewer than 2 active items', async () => {
    const env = await setup();
    const now = Date.now();
    await admin(env, 'PUT', '/monetization/bundles/b_live', bundle({ name: 'Live', sort: 2, priceDiamonds: 10, compareAtDiamonds: null }));
    await admin(env, 'PUT', '/monetization/bundles/b_cheap', bundle({ name: 'Cheap', sort: 2, priceDiamonds: 5, compareAtDiamonds: null, stockLimit: 3 }));
    await admin(env, 'PUT', '/monetization/bundles/b_off', bundle({ name: 'Off', active: false }));
    await admin(env, 'PUT', '/monetization/bundles/b_future', bundle({ name: 'Future', startsAt: now + 60_000 }));
    await admin(env, 'PUT', '/monetization/bundles/b_past', bundle({ name: 'Past', startsAt: now - 120_000, endsAt: now - 60_000 }));
    await admin(env, 'PUT', '/monetization/bundles/b_sold', bundle({ name: 'Sold', stockLimit: 1 }));
    await env.DB.prepare(`UPDATE store_bundles SET sold_count = 1 WHERE id = 'b_sold'`).run();
    await admin(env, 'PUT', '/monetization/bundles/b_thin', bundle({ name: 'Thin', itemIds: ['bx_sticker', 'bx_theme'] }));
    await env.DB.prepare(`UPDATE reward_catalog SET active = 0 WHERE id = 'bx_theme'`).run();
    const res = await call(env, 'alice', 'getShopCollections');
    expect(res.body.bundles.map((b: any) => b.id)).toEqual(['b_cheap', 'b_live']);
    expect(res.body.bundles[0].remaining).toBe(3);
  });
});

// ===========================================================================
describe('buyStoreBundle', () => {
  it('debits Diamonds only (both dpcoin and locked_coins), writes the ledger row and grants the items', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    const res = await buy(env, 'alice');
    expect(res.status).toBe(200);
    const pid = `bundle:alice:${rid(1)}`;
    expect(res.body).toEqual({ success: true, purchase: { id: pid, bundleId: 'starter', priceDiamonds: 100, granted: ['bx_frame', 'bx_badge', 'bx_title'], replayed: false } });

    const b = await balances(env, 'alice');
    expect(b).toMatchObject({ total: 700, diamonds: 200, dp: 500 }); // DP coin untouched
    const led = await env.DB.prepare(`SELECT * FROM coin_transactions WHERE id = ?`).bind(`store_bundle_purchase:${pid}`).first<any>();
    expect(led).toMatchObject({ uid: 'alice', amount: -100, locked_delta: -100, type: 'store_bundle_purchase', description: 'Bundle: Starter Bundle' });
    const inv = await owned(env, 'alice');
    expect(inv.map((r: any) => [r.item_id, r.source, r.source_ref])).toEqual([
      ['bx_badge', 'store_bundle', pid], ['bx_frame', 'store_bundle', pid], ['bx_title', 'store_bundle', pid],
    ]);
    expect((await env.DB.prepare(`SELECT sold_count FROM store_bundles WHERE id = 'starter'`).first<any>()).sold_count).toBe(1);
    // No store_purchases rows for bundles.
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM store_purchases`).first<any>()).n).toBe(0);

    const view = await call(env, 'alice', 'getShopCollections');
    expect(view.body.bundles[0]).toMatchObject({ purchased: true, ownedCount: 3 });
    await assertLedger(env, 'alice');
  });

  it('a replay of the same requestId charges once and returns the stored purchase', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    expect((await buy(env, 'alice')).status).toBe(200);
    const again = await buy(env, 'alice');
    expect(again.status).toBe(200);
    expect(again.body.purchase).toMatchObject({ replayed: true, priceDiamonds: 100, granted: ['bx_frame', 'bx_badge', 'bx_title'] });
    expect((await balances(env, 'alice')).diamonds).toBe(200);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM coin_transactions WHERE type = 'store_bundle_purchase'`).first<any>()).n).toBe(1);
  });

  it('a second purchase of the same bundle is already_purchased', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    expect((await buy(env, 'alice')).status).toBe(200);
    // Even after losing an item, the bundle can't be bought again while the purchase stands.
    await env.DB.prepare(`DELETE FROM user_inventory WHERE uid = 'alice' AND item_id = 'bx_frame'`).run();
    const res = await buy(env, 'alice', { requestId: rid(2) });
    expect(res.status).toBe(409);
    expect(res.body.error.reason).toBe('already_purchased');
    expect((await balances(env, 'alice')).diamonds).toBe(200);
  });

  it('owning every item is already_owned; owning some grants only the missing ones at full price', async () => {
    const env = await setup();
    await seedUser(env, 'bob', 0, 500);
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    const ts = Date.now();
    for (const id of ['bx_frame', 'bx_badge', 'bx_title']) {
      await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at) VALUES ('alice', ?, 'grant', ?)`).bind(id, ts).run();
    }
    const all = await buy(env, 'alice');
    expect(all.status).toBe(409);
    expect(all.body.error.reason).toBe('already_owned');
    expect((await balances(env, 'alice')).diamonds).toBe(300);

    await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at) VALUES ('bob', 'bx_badge', 'grant', ?)`).bind(ts).run();
    const view = await call(env, 'bob', 'getShopCollections');
    expect(view.body.bundles[0]).toMatchObject({ ownedCount: 1 });
    expect(view.body.bundles[0].items.find((i: any) => i.itemId === 'bx_badge').owned).toBe(true);
    const some = await buy(env, 'bob');
    expect(some.status).toBe(200);
    expect(some.body.purchase.granted).toEqual(['bx_frame', 'bx_title']);
    expect((await balances(env, 'bob')).diamonds).toBe(400);
    const badge = await env.DB.prepare(`SELECT source FROM user_inventory WHERE uid = 'bob' AND item_id = 'bx_badge'`).first<any>();
    expect(badge.source).toBe('grant');
    await assertLedger(env, 'bob');
  });

  it('not enough Diamonds (plenty of DP coin) is refused and writes nothing; DP coin is never spent', async () => {
    const env = await setup();
    await seedUser(env, 'carol', 10_000, 50);
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    const res = await buy(env, 'carol');
    expect(res.status).toBe(412);
    expect(res.body.error.reason).toBe('not_enough_diamonds');
    expect(res.body.error.message).toMatch(/Diamond/);
    expect(await balances(env, 'carol')).toMatchObject({ total: 10_050, diamonds: 50, dp: 10_000 });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM coin_transactions WHERE uid = 'carol'`).first<any>()).n).toBe(1);
    expect(await owned(env, 'carol')).toEqual([]);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM store_bundle_purchases`).first<any>()).n).toBe(0);
    expect((await env.DB.prepare(`SELECT sold_count FROM store_bundles WHERE id = 'starter'`).first<any>()).sold_count).toBe(0);
  });

  it('price_changed when the expected price is stale', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle({ priceDiamonds: 120, compareAtDiamonds: null }));
    const res = await buy(env, 'alice');
    expect(res.status).toBe(412);
    expect(res.body.error.reason).toBe('price_changed');
    expect((await balances(env, 'alice')).diamonds).toBe(300);
  });

  it('inactive, expired, out-of-stock or unknown bundles are bundle_unavailable', async () => {
    const env = await setup();
    const now = Date.now();
    await admin(env, 'PUT', '/monetization/bundles/b_off', bundle({ active: false }));
    await admin(env, 'PUT', '/monetization/bundles/b_past', bundle({ startsAt: now - 120_000, endsAt: now - 60_000 }));
    await admin(env, 'PUT', '/monetization/bundles/b_sold', bundle({ stockLimit: 1 }));
    await env.DB.prepare(`UPDATE store_bundles SET sold_count = 1 WHERE id = 'b_sold'`).run();
    for (const [i, id] of ['b_off', 'b_past', 'b_sold', 'nope'].entries()) {
      const res = await buy(env, 'alice', { bundleId: id, requestId: rid(10 + i) });
      expect(res.status, id).toBe(404);
      expect(res.body.error.reason, id).toBe('bundle_unavailable');
    }
    const bad = await buy(env, 'alice', { bundleId: 'Bad Id!' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.reason).toBe('invalid_request');
    const badReq = await buy(env, 'alice', { requestId: 'short' });
    expect(badReq.body.error.reason).toBe('invalid_request');
    expect((await balances(env, 'alice')).diamonds).toBe(300);
  });

  it('stock limit: the last unit sells once', async () => {
    const env = await setup();
    await seedUser(env, 'bob', 0, 500);
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle({ stockLimit: 1 }));
    expect((await buy(env, 'alice')).status).toBe(200);
    const late = await buy(env, 'bob');
    expect(late.body.error.reason).toBe('bundle_unavailable');
    expect((await balances(env, 'bob')).diamonds).toBe(500);
  });
});

// ===========================================================================
describe('admin bundles + collections', () => {
  it('validates input with clear 400s', async () => {
    const env = await setup();
    const xp40 = await env.DB.prepare(`SELECT item_id FROM xp_cosmetic_unlocks WHERE collection = 'xp40' LIMIT 1`).first<any>();
    const cases: Array<[string, any]> = [
      ['/monetization/bundles/Bad Id', bundle()],
      ['/monetization/bundles/x', bundle()],
      ['/monetization/bundles/b1', bundle({ itemIds: ['bx_frame'] })],
      ['/monetization/bundles/b1', bundle({ itemIds: ['bx_frame', 'bx_frame'] })],
      ['/monetization/bundles/b1', bundle({ itemIds: Array.from({ length: 13 }, (_, i) => `item_${i}`) })],
      ['/monetization/bundles/b1', bundle({ itemIds: ['bx_frame', xp40.item_id] })],
      ['/monetization/bundles/b1', bundle({ itemIds: ['bx_frame', 'missing_item'] })],
      ['/monetization/bundles/b1', bundle({ compareAtDiamonds: 100 })],
      ['/monetization/bundles/b1', bundle({ compareAtDiamonds: 50 })],
      ['/monetization/bundles/b1', bundle({ priceDiamonds: 0 })],
      ['/monetization/bundles/b1', bundle({ priceDiamonds: 1_000_001, compareAtDiamonds: null })],
      ['/monetization/bundles/b1', bundle({ badge: 'x'.repeat(17) })],
      ['/monetization/bundles/b1', bundle({ name: 'x' })],
      ['/monetization/bundles/b1', bundle({ description: 'x'.repeat(161) })],
      ['/monetization/bundles/b1', bundle({ imageUrl: 'javascript:alert(1)' })],
      ['/monetization/bundles/b1', bundle({ startsAt: 2000, endsAt: 1000 })],
      ['/monetization/bundles/b1', bundle({ stockLimit: 0 })],
      ['/monetization/bundles/b1', bundle({ active: 'yes' })],
      ['/monetization/collections/c1', collection({ itemIds: [] })],
      ['/monetization/collections/c1', collection({ accent: 'red' })],
      ['/monetization/collections/c1', collection({ itemIds: [xp40.item_id] })],
      ['/monetization/collections/c1', collection({ subtitle: 'x'.repeat(81) })],
    ];
    for (const [path, body] of cases) {
      const res = await admin(env, 'PUT', path, body);
      expect(res.status, `${path} ${JSON.stringify(body).slice(0, 120)}`).toBe(400);
      expect(typeof res.body.error.message).toBe('string');
    }
    await env.DB.prepare(`UPDATE reward_catalog SET active = 0 WHERE id = 'bx_theme'`).run();
    expect((await admin(env, 'PUT', '/monetization/bundles/b1', bundle({ itemIds: ['bx_frame', 'bx_theme'] }))).status).toBe(400);
    // Collections may hold an inactive item (it is just hidden in the app).
    expect((await admin(env, 'PUT', '/monetization/collections/c1', collection({ itemIds: ['bx_theme'] }))).status).toBe(200);
    expect((await admin(env, 'PUT', '/monetization/bundles/b1', bundle(), 'mod:moderator')).status).toBe(403);
    expect((await admin(env, 'PUT', '/monetization/bundles/b1', bundle(), 'boss:admin:stale')).status).toBe(412);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM store_bundles`).first<any>()).n).toBe(0);
  });

  it('creates, updates, lists and deletes collections with audit before/after', async () => {
    const env = await setup();
    const created = await admin(env, 'PUT', '/monetization/collections/anime', collection());
    expect(created.body.collection).toMatchObject({ id: 'anime', name: 'Anime Collection', accent: 'pink', active: true, itemIds: ['bx_frame', 'bx_badge'] });
    await admin(env, 'PUT', '/monetization/collections/anime', collection({ itemIds: ['bx_title', 'bx_frame'], active: false }));
    const list = await admin(env, 'GET', '/monetization/collections');
    expect(list.body.collections).toHaveLength(1);
    expect(list.body.collections[0]).toMatchObject({ itemIds: ['bx_title', 'bx_frame'], active: false, sort: 0, imageUrl: ART });
    const audits = (await env.DB.prepare(`SELECT action, detail FROM admin_audit_log WHERE action LIKE 'store.collection.%' ORDER BY rowid`).all<any>()).results!;
    expect(audits.map((a: any) => a.action)).toEqual(['store.collection.create', 'store.collection.update']);
    const upd = JSON.parse(audits[1].detail);
    expect(upd.before.itemIds).toEqual(['bx_frame', 'bx_badge']);
    expect(upd.after.itemIds).toEqual(['bx_title', 'bx_frame']);
    expect((await admin(env, 'DELETE', '/monetization/collections/anime')).body).toEqual({ ok: true });
    expect((await admin(env, 'GET', '/monetization/collections')).body.collections).toEqual([]);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM store_collection_items`).first<any>()).n).toBe(0);
    expect((await admin(env, 'DELETE', '/monetization/collections/anime')).status).toBe(404);
  });

  it('lists bundles with sales stats and refuses a stock limit below sold', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle({ stockLimit: 5 }));
    await buy(env, 'alice');
    const list = await admin(env, 'GET', '/monetization/bundles');
    expect(list.body.bundles[0]).toMatchObject({
      id: 'starter', priceDiamonds: 100, compareAtDiamonds: 150, badge: 'Best Value', stockLimit: 5, soldCount: 1, purchases: 1, diamondsEarned: 100,
      itemIds: ['bx_frame', 'bx_badge', 'bx_title'], active: true,
    });
    await env.DB.prepare(`UPDATE store_bundles SET sold_count = 3 WHERE id = 'starter'`).run();
    expect((await admin(env, 'PUT', '/monetization/bundles/starter', bundle({ stockLimit: 2 }))).status).toBe(400);
    const upd = await admin(env, 'PUT', '/monetization/bundles/starter', bundle({ name: 'Renamed', stockLimit: 3 }));
    expect(upd.body.bundle).toMatchObject({ name: 'Renamed', stockLimit: 3, soldCount: 3 });
    const audits = (await env.DB.prepare(`SELECT action FROM admin_audit_log WHERE action LIKE 'store.bundle.%' ORDER BY rowid`).all<any>()).results!;
    expect(audits.map((a: any) => a.action)).toEqual(['store.bundle.create', 'store.bundle.update']);
  });

  it('refund returns the Diamonds, revokes only the granted rows, unequips them and is once only', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    // Alice already owns the badge from elsewhere: it is not granted, so not revoked.
    await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at) VALUES ('alice', 'bx_badge', 'grant', ?)`).bind(Date.now()).run();
    const res = await buy(env, 'alice');
    const pid = res.body.purchase.id;
    expect(res.body.purchase.granted).toEqual(['bx_frame', 'bx_title']);
    expect((await call(env, 'alice', 'equipCosmetic', { slot: 'frame', itemId: 'bx_frame' })).status).toBe(200);
    expect(JSON.parse((await balances(env, 'alice')).cosmetics).frame).toBe('bx_frame');

    expect((await admin(env, 'POST', `/monetization/bundles/purchases/${encodeURIComponent(pid)}/refund`, { reason: 'no' })).status).toBe(400);
    const ref = await admin(env, 'POST', `/monetization/bundles/purchases/${encodeURIComponent(pid)}/refund`, { reason: 'Customer asked' });
    expect(ref.status).toBe(200);
    expect(ref.body).toEqual({ ok: true });

    expect(await balances(env, 'alice')).toMatchObject({ total: 800, diamonds: 300, dp: 500 });
    const led = await env.DB.prepare(`SELECT * FROM coin_transactions WHERE id = ?`).bind(`store_bundle_refund:${pid}`).first<any>();
    expect(led).toMatchObject({ amount: 100, locked_delta: 100, type: 'store_bundle_refund' });
    const inv = await owned(env, 'alice');
    expect(inv.filter((r: any) => r.revoked_at).map((r: any) => [r.item_id, r.revoke_reason])).toEqual([
      ['bx_frame', `store_bundle_refund:${pid}`], ['bx_title', `store_bundle_refund:${pid}`],
    ]);
    expect(inv.find((r: any) => r.item_id === 'bx_badge').revoked_at).toBeNull();
    expect(JSON.parse((await balances(env, 'alice')).cosmetics ?? '{}').frame).toBeUndefined();

    const again = await admin(env, 'POST', `/monetization/bundles/purchases/${encodeURIComponent(pid)}/refund`, { reason: 'Customer asked' });
    expect(again.status).toBe(412);
    expect((await balances(env, 'alice')).diamonds).toBe(300);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM coin_transactions WHERE type = 'store_bundle_refund'`).first<any>()).n).toBe(1);

    const purchases = await admin(env, 'GET', '/monetization/bundles/purchases?status=refunded');
    expect(purchases.body.purchases).toEqual([
      expect.objectContaining({ id: pid, uid: 'alice', username: 'alice', bundleId: 'starter', bundleName: 'Starter Bundle', priceDiamonds: 100, granted: ['bx_frame', 'bx_title'], status: 'refunded', refundReason: 'Customer asked' }),
    ]);
    expect((await admin(env, 'GET', '/monetization/bundles/purchases?status=completed')).body.purchases).toEqual([]);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'store.bundle.refund'`).first<any>()).n).toBe(1);

    // After a refund the bundle can be bought again, and the refunded items are re-granted.
    const rebuy = await buy(env, 'alice', { requestId: rid(2) });
    expect(rebuy.status).toBe(200);
    expect(rebuy.body.purchase.granted).toEqual(['bx_frame', 'bx_title']);
    // A refunded bundle item can also be bought on its own in the DP-coin store.
    await assertLedger(env, 'alice');
  });

  it('money health invariants hold after buy + refund (dpcoin = SUM(amount), locked_coins = SUM(locked_delta))', async () => {
    const env = await setup();
    await seedUser(env, 'bob', 20, 400);
    await admin(env, 'PUT', '/monetization/bundles/starter', bundle());
    const a = await buy(env, 'alice');
    await buy(env, 'bob', { requestId: rid(5) });
    await admin(env, 'POST', `/monetization/bundles/purchases/${encodeURIComponent(a.body.purchase.id)}/refund`, { reason: 'Test refund' });
    for (const uid of ['alice', 'bob']) await assertLedger(env, uid);
    const health = await computeMoneyHealth(env);
    expect(health.ledgerDrift.count).toBe(0);
    expect(health.lockedDrift.count).toBe(0);
    expect(health.lockedDrift.overBalance).toBe(0);
    expect(health.negativeBalances.count).toBe(0);
    // Reports: bundle spend shows as Diamonds, not DP coin.
    const coins = await admin(env, 'GET', '/monetization/coins');
    expect(coins.body.diamond.shopBundles).toEqual({ count: 2, diamonds: 200, refunded: 100 });
    expect(coins.body.dpCoin.spentTotal).toBe(0);
  });
});
