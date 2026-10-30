import { vi, describe, it, expect, afterEach } from 'vitest';

// Bearer token is "uid", "uid:role", or "uid:role:stale" (sign-in older than the reauth window).
vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role, stale] = token.split(':');
    return { uid, role: role || 'user', authTime: Math.floor(Date.now() / 1000) - (stale ? 3600 : 0) };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));
vi.mock('../src/lib/observability', () => ({ captureError: async () => undefined, logErrorToDb: async () => undefined }));

import { eq } from 'drizzle-orm';
import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { parseMonetizationConfig, publicMonetizationConfig, validateMonetizationPatch } from '../src/lib/monetizationConfig';
import { derToRaw, VERIFIER_KEYS_URL } from '../src/lib/admobSsv';
import { ecpm, estimateRevenue } from '../src/lib/adMetrics';

const app = makeApp();

async function call(env: TestEnv, uid: string | null, action: string, data: any = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (uid) headers.Authorization = `Bearer ${uid}`;
  const res = await app.request('/api', { method: 'POST', headers, body: JSON.stringify({ action, ...data }) }, env, fakeCtx());
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

async function read(env: TestEnv, path: string) {
  const res = await app.request(`/read${path}`, { method: 'GET' }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, dpcoin = 0, lockedCoins = 0, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin, lockedCoins, createdAt: ts, updatedAt: ts, ...extra } as any);
  // Opening balance as a ledger row, so the ledger invariants hold from the start.
  if (dpcoin) {
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES (?, ?, ?, 'admin_adjustment', 'seed', ?, ?)`)
      .bind(`seed:${uid}`, uid, dpcoin, ts, lockedCoins).run();
  }
}

const user = (env: TestEnv, uid: string) => drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, uid)).get();

async function seedConfig(env: TestEnv, monetization: any, extra: any = {}) {
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: { monetization, ...extra } as any, updatedAt: Date.now() } as any)
    .onConflictDoUpdate({ target: schema.settings.id, set: { data: { monetization, ...extra } as any } });
  await env.CACHE_KV.delete('settings:appConfig');
}

/** Both ledger invariants for one user. */
async function assertLedger(env: TestEnv, uid: string) {
  const u = await user(env, uid);
  const sums = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS a, COALESCE(SUM(locked_delta),0) AS l FROM coin_transactions WHERE uid = ?`).bind(uid).first<any>();
  expect(Number(u!.dpcoin)).toBe(Number(sums.a));
  expect(Number((u as any).lockedCoins)).toBe(Number(sums.l));
  expect(Number((u as any).lockedCoins)).toBeLessThanOrEqual(Number(u!.dpcoin));
}

const rid = (n: number | string) => `req-${String(n).padStart(8, '0')}`;

afterEach(() => vi.unstubAllGlobals());

// ===========================================================================
describe('monetization config', () => {
  it('defaults to everything off and fails closed on garbage', () => {
    const cfg = parseMonetizationConfig({ monetization: { ads: { enabled: 'yes', provider: 'evil', feedNative: { interval: -5 } } } });
    expect(cfg.ads.enabled).toBe(false);
    expect(cfg.ads.provider).toBe('none');
    expect(cfg.ads.feedNative.interval).toBe(3);
    expect(cfg.gifts.enabled).toBe(false);
    expect(cfg.ads.requireConsent).toBe(true);
  });

  it('refuses unknown keys, out-of-range numbers, bad ad ids and disabling consent', () => {
    expect(() => validateMonetizationPatch({ ads: { bogus: 1 } })).toThrow(/unknown setting/);
    expect(() => validateMonetizationPatch({ ads: { feedNative: { interval: 1 } } })).toThrow(/3 to 100/);
    expect(() => validateMonetizationPatch({ ads: { admob: { android: { native: 'nope' } } } })).toThrow(/AdMob id/);
    expect(() => validateMonetizationPatch({ ads: { requireConsent: false } })).toThrow(/consent/);
    expect(() => validateMonetizationPatch({ gifts: { creatorShareBps: 20000 } })).toThrow();
    expect(() => validateMonetizationPatch({ ads: { feedNative: { enabled: true, interval: 10 } }, gifts: { enabled: true } })).not.toThrow();
  });

  it('never tells the app ads are on while the provider is unconfigured', () => {
    const off = publicMonetizationConfig({ monetization: { ads: { enabled: true, provider: 'none' } } });
    expect(off.ads.enabled).toBe(false);
    const prodNoIds = publicMonetizationConfig({ monetization: { ads: { enabled: true, provider: 'admob', mode: 'production' } } });
    expect(prodNoIds.ads.enabled).toBe(false);
    const test = publicMonetizationConfig({ monetization: { ads: { enabled: true, provider: 'admob', mode: 'test', rewarded: { enabled: true } } } });
    expect(test.ads.enabled).toBe(true);
    expect(test.ads.rewarded.enabled).toBe(true);
  });

  it('is saved through /admin/app-settings, audited, and served by /read/app-config', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    const bad = await admin(env, 'POST', '/app-settings', { monetization: { ads: { feedNative: { interval: 0 } } } });
    expect(bad.status).toBe(400);
    const ok = await admin(env, 'POST', '/app-settings', { monetization: { sponsored: { enabled: true, interval: 9 }, gifts: { enabled: true } } });
    expect(ok.status).toBe(200);
    const audit = await env.DB.prepare(`SELECT action FROM admin_audit_log WHERE action = 'settings.monetization.update'`).first();
    expect(audit).toBeTruthy();
    const pub = await read(env, '/app-config');
    expect(pub.body.monetization.sponsored).toMatchObject({ enabled: true, interval: 9 });
    expect(pub.body.monetization.gifts.enabled).toBe(true);
  });
});

// ===========================================================================
describe('virtual gifts', () => {
  async function setup(senderCoins = 100, senderDiamonds = 0) {
    const { env } = makeEnv();
    await seedConfig(env, { gifts: { enabled: true, maxQuantity: 10, maxCoinsPerSend: 500 } });
    await seedUser(env, 'alice', senderCoins, senderDiamonds);
    await seedUser(env, 'bob');
    return env;
  }
  const send = (env: TestEnv, extra: any = {}) =>
    call(env, 'alice', 'sendGift', { recipientUid: 'bob', giftId: 'rose', expectedUnitPrice: 5, requestId: rid(1), ...extra });

  it('lists the seeded live catalogue', async () => {
    const env = await setup();
    const res = await call(env, 'alice', 'getGiftCatalog');
    expect(res.status).toBe(200);
    expect(res.body.gifts.map((g: any) => g.id)).toEqual(['heart', 'clap', 'rose', 'star', 'fireworks', 'crown']);
  });

  it('sends a gift: one debit of DP coin only (Diamonds untouched), one ledger row, one gift record', async () => {
    const env = await setup(100, 12);
    const res = await send(env, { quantity: 3 });
    expect(res.status).toBe(200);
    expect(res.body.gift).toMatchObject({ totalCoins: 15, quantity: 3, diamondsSpent: 0, replayed: false });
    const a = await user(env, 'alice');
    expect(a!.dpcoin).toBe(85);
    expect((a as any).lockedCoins).toBe(12);
    const b = await user(env, 'bob');
    expect(b!.dpcoin ?? 0).toBe(0); // the recipient is NOT credited coins
    await assertLedger(env, 'alice');
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM gift_transactions`).first<any>();
    expect(n.n).toBe(1);
  });

  it('a retried request returns the original result and never charges twice', async () => {
    const env = await setup();
    const first = await send(env);
    const again = await send(env);
    expect(again.status).toBe(200);
    expect(again.body.gift).toMatchObject({ id: first.body.gift.id, replayed: true });
    expect((await user(env, 'alice'))!.dpcoin).toBe(95);
    await assertLedger(env, 'alice');
  });

  it('concurrent sends with the same requestId charge exactly once', async () => {
    const env = await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => send(env)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await user(env, 'alice'))!.dpcoin).toBe(95);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM coin_transactions WHERE type = 'gift_send'`).first<any>();
    expect(n.n).toBe(1);
  });

  it('concurrent distinct sends can never overdraw', async () => {
    const env = await setup(12);
    const results = await Promise.all([1, 2, 3, 4].map((i) => send(env, { requestId: rid(i) })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 412)).toHaveLength(2);
    expect((await user(env, 'alice'))!.dpcoin).toBe(2);
    await assertLedger(env, 'alice');
  });

  it('Diamonds can never pay for a gift', async () => {
    const env = await setup(50, 48); // 2 DP coin + 48 Diamond
    const res = await send(env);
    expect(res.body.error.reason).toBe('insufficient_coins');
    expect((await user(env, 'alice'))!.dpcoin).toBe(50);
  });

  it('insufficient balance writes nothing', async () => {
    const env = await setup(4);
    const res = await send(env);
    expect(res.status).toBe(412);
    expect(res.body.error.reason).toBe('insufficient_coins');
    expect((await user(env, 'alice'))!.dpcoin).toBe(4);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM gift_transactions`).first<any>()).n).toBe(0);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM coin_transactions WHERE type = 'gift_send'`).first<any>()).n).toBe(0);
  });

  it('refuses self, unknown, blocked or deleted recipients with the same answer', async () => {
    const env = await setup();
    expect((await send(env, { recipientUid: 'alice' })).status).toBe(400);
    expect((await send(env, { recipientUid: 'ghost' })).status).toBe(404);
    await seedUser(env, 'gone', 0, 0, { status: 'deleted' });
    expect((await send(env, { recipientUid: 'gone' })).status).toBe(404);
    await env.DB.prepare(`INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES ('bob', 'alice', ?)`).bind(Date.now()).run();
    const blocked = await send(env);
    expect(blocked.status).toBe(404);
    expect((await user(env, 'alice'))!.dpcoin).toBe(100);
  });

  it('refuses a changed price, an expired or inactive gift, and oversize sends', async () => {
    const env = await setup(1000);
    expect((await send(env, { expectedUnitPrice: 1 })).body.error.reason).toBe('price_changed');
    await env.DB.prepare(`UPDATE virtual_gifts SET ends_at = ? WHERE id = 'rose'`).bind(Date.now() - 1000).run();
    expect((await send(env)).body.error.reason).toBe('gift_unavailable');
    await env.DB.prepare(`UPDATE virtual_gifts SET ends_at = NULL, active = 0 WHERE id = 'rose'`).run();
    expect((await send(env)).status).toBe(404);
    expect((await send(env, { giftId: 'crown', expectedUnitPrice: 100, quantity: 6 })).status).toBe(400); // 600 > 500 cap
    expect((await send(env, { giftId: 'heart', expectedUnitPrice: 1, quantity: 11 })).status).toBe(400); // > maxQuantity
    expect((await send(env, { requestId: 'short' })).status).toBe(400);
    expect((await user(env, 'alice'))!.dpcoin).toBe(1000);
  });

  it('is refused while gifts are switched off', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice', 100);
    await seedUser(env, 'bob');
    const res = await call(env, 'alice', 'sendGift', { recipientUid: 'bob', giftId: 'rose', expectedUnitPrice: 5, requestId: rid(1) });
    expect(res.body.error.reason).toBe('gifts_disabled');
  });

  it('history is private to each side; the gift wall shows totals only', async () => {
    const env = await setup();
    await send(env, { quantity: 2 });
    const sent = await call(env, 'alice', 'getGiftHistory', { direction: 'sent' });
    expect(sent.body.items).toHaveLength(1);
    expect(sent.body.items[0]).toMatchObject({ counterpartUid: 'bob', quantity: 2 });
    const received = await call(env, 'bob', 'getGiftHistory', { direction: 'received' });
    expect(received.body.items[0].counterpartUid).toBe('alice');
    expect((await call(env, 'bob', 'getGiftHistory', { direction: 'sent' })).body.items).toHaveLength(0);
    const wall = await read(env, '/users/bob/gift-wall');
    expect(wall.body).toEqual({ totalGifts: 2, supporters: 1, gifts: [{ giftId: 'rose', name: 'Rose', count: 2 }] });
  });

  it('requires authentication', async () => {
    const env = await setup();
    expect((await call(env, null, 'sendGift', {})).status).toBe(401);
  });
});

// ===========================================================================
describe('digital store', () => {
  async function setup(coins = 100, diamonds = 0) {
    const { env } = makeEnv();
    await seedConfig(env, { store: { enabled: true } });
    await seedUser(env, 'alice', coins, diamonds);
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    const item = await env.DB.prepare(`SELECT id, type FROM reward_catalog WHERE type = 'frame' AND active = 1 ORDER BY id LIMIT 1`).first<any>();
    const listed = await admin(env, 'PUT', `/monetization/store/${item.id}`, { priceCoins: 30, active: true });
    expect(listed.status).toBe(200);
    return { env, item };
  }
  const buy = (env: TestEnv, itemId: string, extra: any = {}) => call(env, 'alice', 'buyStoreItem', { itemId, expectedPrice: 30, requestId: rid(1), ...extra });

  it('lists live items with ownership and sells one, granting the entitlement atomically', async () => {
    const { env, item } = await setup(100, 10);
    const list = await call(env, 'alice', 'getStore');
    expect(list.body.items.find((i: any) => i.itemId === item.id)).toMatchObject({ priceCoins: 30, owned: false });
    const res = await buy(env, item.id);
    expect(res.status).toBe(200);
    expect(res.body.purchase).toMatchObject({ priceCoins: 30, diamondsSpent: 0, status: 'completed' });
    const inv = await env.DB.prepare(`SELECT source, revoked_at FROM user_inventory WHERE uid = 'alice' AND item_id = ?`).bind(item.id).first<any>();
    expect(inv).toMatchObject({ source: 'store', revoked_at: null });
    expect((await user(env, 'alice'))!.dpcoin).toBe(70);
    await assertLedger(env, 'alice');
    const listed = await env.DB.prepare(`SELECT sold_count FROM store_listings WHERE item_id = ?`).bind(item.id).first<any>();
    expect(listed.sold_count).toBe(1);
    // Ownership now unlocks equipping through the existing cosmetics path.
    expect((await call(env, 'alice', 'equipCosmetic', { slot: 'frame', itemId: item.id })).status).toBe(200);
  });

  it('replays return the purchase; a second request id cannot buy it again', async () => {
    const { env, item } = await setup();
    await buy(env, item.id);
    const again = await buy(env, item.id);
    expect(again.body.purchase.replayed).toBe(true);
    const dup = await buy(env, item.id, { requestId: rid(2) });
    expect(dup.status).toBe(409);
    expect(dup.body.error.reason).toBe('already_owned');
    expect((await user(env, 'alice'))!.dpcoin).toBe(70);
  });

  it('concurrent purchases of the same item charge once', async () => {
    const { env, item } = await setup();
    const results = await Promise.all([1, 2, 3].map((i) => buy(env, item.id, { requestId: rid(i) })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await user(env, 'alice'))!.dpcoin).toBe(70);
    await assertLedger(env, 'alice');
  });

  it('a failed purchase grants nothing', async () => {
    const { env, item } = await setup(10);
    const res = await buy(env, item.id);
    expect(res.body.error.reason).toBe('insufficient_coins');
    expect(await env.DB.prepare(`SELECT 1 FROM user_inventory WHERE uid = 'alice' AND item_id = ?`).bind(item.id).first()).toBeNull();
    expect((await env.DB.prepare(`SELECT sold_count FROM store_listings WHERE item_id = ?`).bind(item.id).first<any>()).sold_count).toBe(0);
  });

  it('honours stock limits, inactive listings and price changes', async () => {
    const { env, item } = await setup(1000);
    expect((await buy(env, item.id, { expectedPrice: 29 })).body.error.reason).toBe('price_changed');
    await admin(env, 'PUT', `/monetization/store/${item.id}`, { priceCoins: 30, active: false });
    expect((await buy(env, item.id)).body.error.reason).toBe('item_unavailable');
    await admin(env, 'PUT', `/monetization/store/${item.id}`, { priceCoins: 30, active: true, stockLimit: 1 });
    await env.DB.prepare(`UPDATE store_listings SET sold_count = 1 WHERE item_id = ?`).bind(item.id).run();
    expect((await buy(env, item.id)).body.error.reason).toBe('item_unavailable');
  });

  it('refund returns the exact split, revokes and unequips, once; the item can then be re-bought', async () => {
    const { env, item } = await setup(100, 10);
    const p = (await buy(env, item.id)).body.purchase;
    await call(env, 'alice', 'equipCosmetic', { slot: 'frame', itemId: item.id });
    const noReason = await admin(env, 'POST', `/monetization/store/purchases/${encodeURIComponent(p.id)}/refund`, {});
    expect(noReason.status).toBe(400);
    const ok = await admin(env, 'POST', `/monetization/store/purchases/${encodeURIComponent(p.id)}/refund`, { reason: 'bought by mistake' });
    expect(ok.status).toBe(200);
    const a = await user(env, 'alice');
    expect(a!.dpcoin).toBe(100);
    expect((a as any).lockedCoins).toBe(10);
    const cos = (a as any).cosmetics;
    expect((typeof cos === 'string' ? JSON.parse(cos) : cos ?? {}).frame).toBeUndefined();
    await assertLedger(env, 'alice');
    const twice = await admin(env, 'POST', `/monetization/store/purchases/${encodeURIComponent(p.id)}/refund`, { reason: 'again' });
    expect(twice.status).toBe(412);
    expect((await user(env, 'alice'))!.dpcoin).toBe(100);
    expect((await env.DB.prepare(`SELECT action FROM admin_audit_log WHERE action = 'store.purchase.refund'`).first())).toBeTruthy();
    const rebuy = await buy(env, item.id, { requestId: rid(9) });
    expect(rebuy.status).toBe(200);
  });

  it('an item an admin revoked for another reason cannot be bought back', async () => {
    const { env, item } = await setup();
    await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at, revoked_at, revoke_reason) VALUES ('alice', ?, 'achievement', 1, 2, 'abuse')`).bind(item.id).run();
    const res = await buy(env, item.id);
    expect(res.body.error.reason).toBe('item_revoked');
    expect((await user(env, 'alice'))!.dpcoin).toBe(100);
  });
});

// ===========================================================================
describe('admin authorization', () => {
  it('moderators and plain users are refused; stale sessions must re-authenticate for writes', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'mod', 0, 0, { role: 'moderator' });
    await seedUser(env, 'joe');
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    expect((await admin(env, 'GET', '/monetization/overview', undefined, 'mod:moderator')).status).toBe(403);
    expect((await admin(env, 'GET', '/monetization/overview', undefined, 'joe')).status).toBe(403);
    const stale = await admin(env, 'PUT', '/monetization/gifts/rose', { name: 'Rose', priceCoins: 1 }, 'boss:admin:stale');
    expect(stale.status).toBe(412);
    expect((await admin(env, 'GET', '/monetization/overview')).status).toBe(200);
  });

  it('gift price edits are audited and never rewrite past sends', async () => {
    const { env } = makeEnv();
    await seedConfig(env, { gifts: { enabled: true } });
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    await seedUser(env, 'alice', 100);
    await seedUser(env, 'bob');
    await call(env, 'alice', 'sendGift', { recipientUid: 'bob', giftId: 'rose', expectedUnitPrice: 5, requestId: rid(1) });
    const res = await admin(env, 'PUT', '/monetization/gifts/rose', { name: 'Rose', priceCoins: 7, category: 'flower', asset: { emoji: '🌹' } });
    expect(res.status).toBe(200);
    const tx = await env.DB.prepare(`SELECT unit_price_coins FROM gift_transactions`).first<any>();
    expect(tx.unit_price_coins).toBe(5);
    expect(await env.DB.prepare(`SELECT 1 FROM admin_audit_log WHERE action = 'gift.update' AND target_id = 'rose'`).first()).toBeTruthy();
  });
});

// ===========================================================================
describe('sponsored campaigns', () => {
  async function setup() {
    const { env } = makeEnv();
    await seedConfig(env, { sponsored: { enabled: true } });
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    await seedUser(env, 'boss2', 0, 0, { role: 'admin' });
    await seedUser(env, 'alice');
    const adv = await admin(env, 'POST', '/monetization/advertisers', { name: 'Acme Shoes', contactEmail: 'ads@acme.test' });
    const camp = await admin(env, 'POST', '/monetization/campaigns', {
      advertiserId: adv.body.id,
      title: 'Diwali launch',
      startsAt: Date.now() - 1000,
      endsAt: Date.now() + 86_400_000,
      pricingModel: 'cpm',
      cpmPaise: 15000,
      budgetPaise: 1_000_000,
      creative: { headline: 'New shoes', body: 'Light and fast', imageUrl: 'https://cdn.acme.test/a.jpg', ctaLabel: 'Shop', ctaUrl: 'https://acme.test' },
    });
    expect(camp.status).toBe(200);
    return { env, id: camp.body.id as string };
  }

  it('serves only approved campaigns, and creator cannot self-approve', async () => {
    const { env, id } = await setup();
    expect((await read(env, '/sponsored?placement=feed')).body.campaigns).toHaveLength(0);
    expect((await admin(env, 'POST', `/monetization/campaigns/${id}/status`, { status: 'approved' })).status).toBe(412); // draft → approved not allowed
    expect((await admin(env, 'POST', `/monetization/campaigns/${id}/status`, { status: 'pending' })).status).toBe(200);
    expect((await admin(env, 'POST', `/monetization/campaigns/${id}/status`, { status: 'approved' })).status).toBe(403);
    expect((await admin(env, 'POST', `/monetization/campaigns/${id}/status`, { status: 'approved' }, 'boss2:admin')).status).toBe(200);
    const served = await read(env, '/sponsored?placement=feed');
    expect(served.body.campaigns).toHaveLength(1);
    expect(served.body.campaigns[0]).toMatchObject({ id, advertiser: 'Acme Shoes', disclosure: 'Sponsored' });
    expect(JSON.stringify(served.body)).not.toMatch(/budget|cpm|invoice/i);
  });

  it('counts at most one impression per viewer per hour and reports aggregates', async () => {
    const { env, id } = await setup();
    await admin(env, 'POST', `/monetization/campaigns/${id}/status`, { status: 'pending' });
    await admin(env, 'POST', `/monetization/campaigns/${id}/status`, { status: 'approved' }, 'boss2:admin');
    expect((await call(env, 'alice', 'recordSponsoredEvent', { campaignId: id, event: 'impression' })).body.counted).toBe(true);
    expect((await call(env, 'alice', 'recordSponsoredEvent', { campaignId: id, event: 'impression' })).body.counted).toBe(false);
    await call(env, 'alice', 'recordSponsoredEvent', { campaignId: id, event: 'click' });
    const report = await admin(env, 'GET', `/monetization/campaigns/${id}/report`);
    expect(report.body.totals).toMatchObject({ impressions: 1, clicks: 1 });
    expect(report.body.measurement).toBe('first_party');
  });

  it('refuses a creative without a clear paid disclosure or with a non-https link', async () => {
    const { env } = await setup();
    const adv = (await admin(env, 'GET', '/monetization/advertisers')).body[0];
    const base = { advertiserId: adv.id, title: 'x campaign', startsAt: Date.now(), endsAt: Date.now() + 1000, creative: { headline: 'h', imageUrl: 'https://a.test/i.png', ctaUrl: 'https://a.test' } };
    expect((await admin(env, 'POST', '/monetization/campaigns', { ...base, disclosure: 'Hello' })).status).toBe(400);
    expect((await admin(env, 'POST', '/monetization/campaigns', { ...base, creative: { ...base.creative, ctaUrl: 'javascript:alert(1)' } })).status).toBe(400);
  });
});

// ===========================================================================
describe('ad measurement', () => {
  it('validates and aggregates client diagnostics', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'alice');
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    expect((await call(env, 'alice', 'recordAdEvents', { events: [{ placement: 'nope', event: 'request', provider: 'admob', platform: 'android' }] })).status).toBe(400);
    const ok = await call(env, 'alice', 'recordAdEvents', {
      platform: 'android',
      events: [
        { placement: 'feed_native', event: 'request', provider: 'admob', count: 4 },
        { placement: 'feed_native', event: 'fill', provider: 'admob', count: 3 },
      ],
    });
    expect(ok.body.recorded).toBe(2);
    const day = new Date().toISOString().slice(0, 10);
    const rep = await admin(env, 'GET', `/monetization/ads/report`);
    expect(rep.body.diagnostics[0]).toMatchObject({ placement: 'feed_native', requests: 4, fills: 3, fillRate: 75 });
    expect(day).toMatch(/^\d{4}/);
  });

  it('imports provider revenue; finalized rows are never downgraded; eCPM math', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss', 0, 0, { role: 'admin' });
    const row = { day: '2026-10-01', provider: 'admob', impressions: 2000, revenue: 3, currency: 'USD', status: 'finalized' };
    expect((await admin(env, 'POST', '/monetization/ads/revenue', { rows: [row] })).status).toBe(200);
    await admin(env, 'POST', '/monetization/ads/revenue', { rows: [{ ...row, status: 'estimated', revenue: 4 }] });
    const r = await env.DB.prepare(`SELECT status, revenue_micros FROM ad_revenue_reports`).first<any>();
    expect(r).toMatchObject({ status: 'finalized', revenue_micros: 4_000_000 });
    expect((await admin(env, 'POST', '/monetization/ads/revenue', { rows: [{ ...row, provider: 'fake' }] })).status).toBe(400);
    expect(ecpm(3_000_000, 2000)).toBe(1.5);
    expect(ecpm(0, 0)).toBeNull();
    expect(estimateRevenue(10_000, 1.5)).toBe(15);
  });
});

// ===========================================================================
describe('AdMob server-side verification', () => {
  function rawToDer(raw: Uint8Array): Uint8Array {
    const int = (b: Uint8Array) => {
      let i = 0;
      while (i < b.length - 1 && b[i] === 0) i++;
      let v = b.slice(i);
      if (v[0] & 0x80) v = Uint8Array.from([0, ...v]);
      return Uint8Array.from([0x02, v.length, ...v]);
    };
    const r = int(raw.slice(0, 32));
    const s = int(raw.slice(32));
    return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
  }
  const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function keys() {
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const spki = Buffer.from(await crypto.subtle.exportKey('spki', kp.publicKey)).toString('base64');
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      expect(String(u)).toBe(VERIFIER_KEYS_URL);
      return new Response(JSON.stringify({ keys: [{ keyId: 42, base64: spki }] }), { status: 200 });
    }));
    return kp;
  }

  async function signedQuery(kp: CryptoKeyPair, tx: string, userId: string) {
    const content = `ad_network=5450213213286189855&ad_unit=1234567890&reward_amount=1&reward_item=diamond&timestamp=${Date.now()}&transaction_id=${tx}&user_id=${userId}`;
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(content)));
    return `${content}&signature=${b64url(rawToDer(raw))}&key_id=42`;
  }

  const ssv = (env: TestEnv, q: string) => app.request(`/webhook/admob/ssv?${q}`, { method: 'GET' }, env, fakeCtx());

  async function setup(enabled = true) {
    const { env } = makeEnv();
    await seedConfig(env, { ads: { enabled, provider: 'admob', mode: 'test', rewarded: { enabled, rewardDiamonds: 3, dailyCap: 2 } } });
    await seedUser(env, 'alice');
    return env;
  }

  it('derToRaw round-trips', () => {
    const raw = new Uint8Array(64).map((_, i) => (i === 0 ? 0x90 : i));
    expect(Array.from(derToRaw(rawToDer(raw)))).toEqual(Array.from(raw));
  });

  it('credits Diamonds once per transaction and enforces the daily cap', async () => {
    const env = await setup();
    const kp = await keys();
    const res = await ssv(env, await signedQuery(kp, 'abcdef0123456789', 'alice'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).outcome).toBe('credited');
    let a = await user(env, 'alice');
    expect(a!.dpcoin).toBe(3);
    expect((a as any).lockedCoins).toBe(3); // Diamonds: never withdrawable
    const dup = await ssv(env, await signedQuery(kp, 'abcdef0123456789', 'alice'));
    expect(((await dup.json()) as any).outcome).toBe('duplicate');
    await ssv(env, await signedQuery(kp, 'abcdef0123456780', 'alice'));
    const capped = await ssv(env, await signedQuery(kp, 'abcdef0123456781', 'alice'));
    expect(((await capped.json()) as any).outcome).toBe('cap_reached');
    a = await user(env, 'alice');
    expect(a!.dpcoin).toBe(6);
    await assertLedger(env, 'alice');
  });

  it('rejects forged, tampered or reordered callbacks', async () => {
    const env = await setup();
    const kp = await keys();
    const good = await signedQuery(kp, 'abcdef0123456789', 'alice');
    expect((await ssv(env, good.replace('user_id=alice', 'user_id=mallory'))).status).toBe(400);
    expect((await ssv(env, good.replace('key_id=42', 'key_id=43'))).status).toBe(400);
    expect((await ssv(env, `${good}&extra=1`)).status).toBe(400);
    expect((await ssv(env, 'transaction_id=x&user_id=alice')).status).toBe(400);
    expect((await user(env, 'alice'))!.dpcoin ?? 0).toBe(0);
  });

  it('does not credit while rewarded ads are switched off', async () => {
    const env = await setup(false);
    const kp = await keys();
    const res = await ssv(env, await signedQuery(kp, 'abcdef0123456789', 'alice'));
    expect(((await res.json()) as any).outcome).toBe('disabled');
    expect((await user(env, 'alice'))!.dpcoin ?? 0).toBe(0);
  });

  it('leaves the legacy client-claimed reward fail-closed', async () => {
    const env = await setup();
    const res = await call(env, 'alice', 'claimAdReward');
    expect(res.status).toBe(412);
  });
});
