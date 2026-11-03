import { vi, describe, it, expect } from 'vitest';

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
import { isSafeAppPath, isSafeImageUrl } from '../src/lib/shopHomeConfig';
import { compareAtCoinsOf, validateProductInput } from '../src/lib/shop';
import { isSensitiveAdminRoute } from '../src/routes/admin';

const app = makeApp();
const NOW = 1_800_000_000_000;
const IMG = 'https://cdn.test/shop-banners/2026/01/a.webp';

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

async function read(env: TestEnv, path: string) {
  const res = await app.request(`/read${path}`, { method: 'GET' }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function seedUser(env: TestEnv, uid: string, dpcoin = 0, extra: Record<string, any> = {}) {
  const ts = Date.now();
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin, lockedCoins: 0, createdAt: ts, updatedAt: ts, ...extra } as any);
  if (dpcoin) {
    await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES (?, ?, ?, 'admin_adjustment', 'seed', ?, 0)`)
      .bind(`seed:${uid}`, uid, dpcoin, ts).run();
  }
}

async function config(env: TestEnv, data: any) {
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data, updatedAt: Date.now() } as any)
    .onConflictDoUpdate({ target: schema.settings.id, set: { data } });
  await env.CACHE_KV.delete('settings:appConfig');
}

const slide = (s: any = {}) => ({
  id: 'mythic-week',
  enabled: true,
  title: 'Mythic Week',
  itemIds: ['frame_a', 'frame_b'],
  target: { kind: 'items' },
  ...s,
});
const card = (c: any = {}) => ({
  id: 'mega',
  enabled: true,
  title: 'Mega Shop Deal',
  source: { kind: 'all_discounts' },
  ...c,
});

// ===========================================================================
describe('shop hero slider config', () => {
  const v = (slider: any) => () => validateMonetizationPatch({ store: { slider } }, NOW);
  const vs = (s: any) => v({ slides: [slide(s)] });

  it('defaults off and parses garbage back to safe values (bad slides dropped, not the slider)', () => {
    expect(parseMonetizationConfig({}).store.slider).toEqual({ enabled: false, autoplaySec: 4, slides: [] });
    const g = parseMonetizationConfig({
      monetization: { store: { slider: { enabled: 'yes', autoplaySec: 99, slides: [slide(), slide({ id: 'BAD ID' }), slide(), slide({ id: 'x2', target: { kind: 'url', path: 'https://evil.test' } })] } } },
    }).store.slider;
    expect(g.enabled).toBe(false);
    expect(g.autoplaySec).toBe(4);
    expect(g.slides.map((s) => s.id)).toEqual(['mythic-week']);
    expect(g.slides[0]).toMatchObject({ ctaLabel: 'Explore Collection', badge: '', imageUrl: null, mobileImageUrl: null, startsAt: null, endsAt: null, showCountdown: false });
  });

  it('refuses bad patches instead of clamping them', () => {
    expect(v({ bogus: 1 })).toThrow(/unknown setting store.slider.bogus/);
    expect(v({ enabled: 'on' })).toThrow(/true or false/);
    expect(v({ autoplaySec: 1 })).toThrow(/2 to 15/);
    expect(v({ autoplaySec: 16 })).toThrow(/2 to 15/);
    expect(v({ autoplaySec: 4.5 })).toThrow(/2 to 15/);
    expect(v({ slides: 'x' })).toThrow(/must be a list/);
    expect(v({ slides: Array.from({ length: 9 }, (_, i) => slide({ id: `s${i}x` })) })).toThrow(/at most 8 slides/);
    expect(v({ slides: [slide(), slide()] })).toThrow(/"mythic-week" twice/);
    expect(vs({ id: 'A' })).toThrow(/id must be/);
    expect(vs({ id: 'Has Space' })).toThrow(/id must be/);
    expect(vs({ extra: 1 })).toThrow(/unknown setting store.slider.slides\[0\].extra/);
    expect(vs({ title: '' })).toThrow(/cannot be empty/);
    expect(vs({ title: undefined })).toThrow(/title is required/);
    expect(vs({ title: 'x'.repeat(61) })).toThrow(/at most 60/);
    expect(vs({ badge: 'x'.repeat(25) })).toThrow(/at most 24/);
    expect(vs({ subtitle: 'x'.repeat(141) })).toThrow(/at most 140/);
    expect(vs({ ctaLabel: '  ' })).toThrow(/cannot be empty/);
    expect(vs({ ctaLabel: 'x'.repeat(25) })).toThrow(/at most 24/);
    expect(vs({ imageUrl: 'http://cdn.test/a.png' })).toThrow(/https image URL/);
    expect(vs({ imageUrl: 'javascript:alert(1)' })).toThrow(/https image URL/);
    expect(vs({ mobileImageUrl: 'https://user:pw@cdn.test/a.png' })).toThrow(/https image URL/);
    expect(vs({ itemIds: ['ok_1', 'ok_1'] })).toThrow(/twice/);
    expect(vs({ itemIds: Array.from({ length: 13 }, (_, i) => `item_${i}`) })).toThrow(/0 to 12/);
    expect(vs({ itemIds: [], target: { kind: 'physical' } })).toThrow(/needs an image or at least one item/);
    expect(vs({ itemIds: [], imageUrl: IMG })).toThrow(/kind "items" needs at least one item/);
    expect(vs({ target: { kind: 'nope' } })).toThrow(/kind must be one of/);
    expect(vs({ target: { kind: 'item' } })).toThrow(/itemId must be an item id/);
    expect(vs({ target: { kind: 'product', productId: 'bad id!' } })).toThrow(/productId/);
    expect(vs({ target: { kind: 'digital', type: 'car' } })).toThrow(/type must be one of/);
    expect(vs({ target: { kind: 'digital', rarities: ['ultra'] } })).toThrow(/rarities/);
    expect(vs({ target: { kind: 'physical', extra: 1 } })).toThrow(/unknown setting/);
    for (const path of ['https://evil.test', '//evil.test', 'evil.test', '/a//b', 'javascript:alert(1)', '/a b', '/\\evil', `/${'a'.repeat(120)}`]) {
      expect(vs({ target: { kind: 'url', path } })).toThrow(/app path/);
    }
    expect(vs({ startsAt: 'soon' })).toThrow(/time/);
    expect(vs({ startsAt: NOW, endsAt: NOW })).toThrow(/after startsAt/);
    expect(vs({ startsAt: NOW + 10, endsAt: NOW })).toThrow(/after startsAt/);
    expect(vs({ showCountdown: 1 })).toThrow(/true or false/);
  });

  it('accepts every target kind and normalises slides in place', () => {
    const patch: any = {
      store: {
        slider: {
          enabled: true,
          autoplaySec: 6,
          slides: [
            slide({ title: '  Mythic Week  ', badge: 'Hot', imageUrl: IMG, mobileImageUrl: IMG, startsAt: NOW, endsAt: NOW + 1000, showCountdown: true }),
            slide({ id: 'one', itemIds: ['frame_a'], target: { kind: 'item', itemId: 'frame_a' } }),
            slide({ id: 'dig', target: { kind: 'digital', type: 'frame', rarities: ['legendary', 'mythic'] } }),
            slide({ id: 'phys', itemIds: [], imageUrl: IMG, target: { kind: 'physical' } }),
            slide({ id: 'prod', itemIds: [], mobileImageUrl: IMG, target: { kind: 'product', productId: 'TopHunt-Tee_1' } }),
            slide({ id: 'link', target: { kind: 'url', path: '/explore/battles?tab=live' } }),
          ],
        },
      },
    };
    expect(() => validateMonetizationPatch(patch, NOW)).not.toThrow();
    expect(patch.store.slider.slides[0]).toMatchObject({ title: 'Mythic Week', ctaLabel: 'Explore Collection', showCountdown: true });
    expect(patch.store.slider.slides[2].target).toEqual({ kind: 'digital', type: 'frame', rarities: ['legendary', 'mythic'] });
    expect(isSafeAppPath('/shop?tab=physical')).toBe(true);
    expect(isSafeImageUrl('https://tophunt.in/shop-banners/x.webp')).toBe(true);
  });

  it('is public only while the store and slider are on, with only live slides (server time)', () => {
    const pub = (store: any, now = NOW, shop: any = {}) => publicMonetizationConfig({ monetization: { store, shop } }, now).store as any;
    const slides = [
      slide({ id: 'live', endsAt: NOW + 60_000, showCountdown: true }),
      slide({ id: 'off', enabled: false }),
      slide({ id: 'later', startsAt: NOW + 1 }),
      slide({ id: 'ended', endsAt: NOW }),
      slide({ id: 'nocount', showCountdown: true }),
    ];
    expect(pub({ enabled: true, slider: { enabled: false, slides } }).slider).toBeUndefined();
    expect(pub({ enabled: false, slider: { enabled: true, slides } }).slider).toBeUndefined();
    const live = pub({ enabled: true, slider: { enabled: true, autoplaySec: 7, slides } }).slider;
    expect(live.autoplaySec).toBe(7);
    expect(live.slides.map((s: any) => s.id)).toEqual(['live', 'nocount']);
    expect(live.slides[0]).toEqual({
      id: 'live', badge: '', title: 'Mythic Week', subtitle: '', ctaLabel: 'Explore Collection', imageUrl: null, mobileImageUrl: null,
      itemIds: ['frame_a', 'frame_b'], target: { kind: 'items' }, endsAt: NOW + 60_000, showCountdown: true,
    });
    // A countdown without an end is never sent as on.
    expect(live.slides[1].showCountdown).toBe(false);
    // The scheduled slide appears once it starts; the live one goes after its end.
    expect(pub({ enabled: true, slider: { enabled: true, slides } }, NOW + 60_000).slider.slides.map((s: any) => s.id)).toEqual(['later', 'nocount']);
    // Nothing live: no slider block at all.
    expect(pub({ enabled: true, slider: { enabled: true, slides: [slide({ enabled: false })] } }).slider).toBeUndefined();
  });

  it('keeps the featured drop working next to it (back-compat)', () => {
    const featured = { enabled: true, title: 'Drop', itemIds: ['frame_a'] };
    const both = publicMonetizationConfig({ monetization: { store: { enabled: true, featured, slider: { enabled: true, slides: [slide()] } } } }, NOW).store as any;
    expect(both.featured).toMatchObject({ title: 'Drop', heroItemId: 'frame_a' });
    expect(both.slider.slides).toHaveLength(1);
    const old = publicMonetizationConfig({ monetization: { store: { enabled: true, featured } } }, NOW).store as any;
    expect(Object.keys(old).sort()).toEqual(['enabled', 'featured']);
  });
});

// ===========================================================================
describe('shop deals config', () => {
  const v = (deals: any) => () => validateMonetizationPatch({ store: { deals } }, NOW);
  const vc = (c: any) => v({ cards: [card(c)] });

  it('defaults off and drops malformed cards when parsing', () => {
    expect(parseMonetizationConfig({}).store.deals).toEqual({ enabled: false, title: 'Special Offers & Daily Deals', cards: [] });
    const g = parseMonetizationConfig({ monetization: { store: { deals: { enabled: true, title: 'x'.repeat(41), cards: [card(), card({ id: 'two', discountPercent: 90 }), card({ id: 'three', ribbon: 'big' })] } } } }).store.deals;
    expect(g.title).toBe('Special Offers & Daily Deals');
    expect(g.cards.map((c) => c.id)).toEqual(['mega']);
    expect(g.cards[0]).toMatchObject({ ctaLabel: 'Grab Now', ribbon: 'auto', showTimer: false, imageUrl: null });
  });

  it('refuses bad patches, including any admin-typed discount', () => {
    expect(v({ bogus: 1 })).toThrow(/unknown setting store.deals.bogus/);
    expect(v({ title: '' })).toThrow(/cannot be empty/);
    expect(v({ title: 'x'.repeat(41) })).toThrow(/at most 40/);
    expect(v({ cards: Array.from({ length: 7 }, (_, i) => card({ id: `c${i}x` })) })).toThrow(/at most 6 cards/);
    expect(v({ cards: [card(), card()] })).toThrow(/"mega" twice/);
    expect(vc({ discountPercent: 40 })).toThrow(/unknown setting store.deals.cards\[0\].discountPercent/);
    expect(vc({ id: '!' })).toThrow(/id must be/);
    expect(vc({ title: 'x'.repeat(41) })).toThrow(/at most 40/);
    expect(vc({ subtitle: 'x'.repeat(91) })).toThrow(/at most 90/);
    expect(vc({ ctaLabel: 'x'.repeat(21) })).toThrow(/at most 20/);
    expect(vc({ imageUrl: 'ftp://x/a.png' })).toThrow(/https image URL/);
    expect(vc({ ribbon: 'big' })).toThrow(/ribbon/);
    expect(vc({ source: { kind: 'digital_items', itemIds: [] } })).toThrow(/1 to 24/);
    expect(vc({ source: { kind: 'digital_items', itemIds: Array.from({ length: 25 }, (_, i) => `item_${i}`) } })).toThrow(/1 to 24/);
    expect(vc({ source: { kind: 'digital_items', itemIds: ['a_1', 'a_1'] } })).toThrow(/twice/);
    expect(vc({ source: { kind: 'product' } })).toThrow(/productId/);
    expect(vc({ source: { kind: 'all_discounts', itemIds: ['a_1'] } })).toThrow(/unknown setting/);
    expect(vc({ source: { kind: 'coupon' } })).toThrow(/kind must be one of/);
    expect(vc({ startsAt: NOW, endsAt: NOW - 1 })).toThrow(/after startsAt/);
    expect(vc({ showTimer: 'yes' })).toThrow(/true or false/);
    expect(() => validateMonetizationPatch({ store: { deals: { enabled: true, title: 'Daily Deals', cards: [
      card({ imageUrl: IMG, ribbon: 'none', endsAt: NOW + 1000, showTimer: true }),
      card({ id: 'items', source: { kind: 'digital_items', itemIds: ['frame_a'] } }),
      card({ id: 'tee', source: { kind: 'product', productId: 'tshirt' } }),
    ] } } }, NOW)).not.toThrow();
  });

  it('is public only with live cards whose side (store / shop) is open', () => {
    const cards = [
      card({ id: 'digital', endsAt: NOW + 5000, showTimer: true }),
      card({ id: 'product', source: { kind: 'product', productId: 'tshirt' } }),
      card({ id: 'off', enabled: false }),
      card({ id: 'later', startsAt: NOW + 1 }),
      card({ id: 'ended', endsAt: NOW }),
    ];
    const pub = (m: any, now = NOW) => publicMonetizationConfig({ monetization: m }, now).store as any;
    expect(pub({ store: { enabled: true, deals: { enabled: false, cards } }, shop: { enabled: true } }).deals).toBeUndefined();
    const both = pub({ store: { enabled: true, deals: { enabled: true, cards } }, shop: { enabled: true } }).deals;
    expect(both.title).toBe('Special Offers & Daily Deals');
    expect(both.cards.map((c: any) => c.id)).toEqual(['digital', 'product']);
    expect(both.cards[0]).toEqual({
      id: 'digital', title: 'Mega Shop Deal', subtitle: '', ctaLabel: 'Grab Now', imageUrl: null, source: { kind: 'all_discounts' }, ribbon: 'auto', endsAt: NOW + 5000, showTimer: true,
    });
    expect(pub({ store: { enabled: false, deals: { enabled: true, cards } }, shop: { enabled: true } }).deals.cards.map((c: any) => c.id)).toEqual(['product']);
    expect(pub({ store: { enabled: true, deals: { enabled: true, cards } }, shop: { enabled: false } }).deals.cards.map((c: any) => c.id)).toEqual(['digital']);
    expect(pub({ store: { enabled: false, deals: { enabled: true, cards } }, shop: { enabled: false } }).deals).toBeUndefined();
    expect(pub({ store: { enabled: true, deals: { enabled: true, cards } }, shop: { enabled: true } }, NOW + 5000).deals.cards.map((c: any) => c.id)).toEqual(['product', 'later']);
  });

  it('slider and deals are saved by a full admin through /admin/app-settings, audited, and served by /read/app-config', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss', 0, { role: 'admin' });
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    const body = {
      monetization: {
        store: { enabled: true, slider: { enabled: true, autoplaySec: 5, slides: [slide({ imageUrl: IMG })] }, deals: { enabled: true, cards: [card()] } },
      },
    };
    expect((await admin(env, 'POST', '/app-settings', body, 'mod:moderator')).status).toBe(403);
    expect((await admin(env, 'POST', '/app-settings', body, 'boss:admin:stale')).status).toBe(412);
    expect((await admin(env, 'POST', '/app-settings', { monetization: { store: { slider: { slides: [slide({ target: { kind: 'url', path: 'https://evil.test' } })] } } } })).status).toBe(400);
    expect((await admin(env, 'POST', '/app-settings', body)).status).toBe(200);
    expect(await env.DB.prepare(`SELECT 1 FROM admin_audit_log WHERE action = 'settings.monetization.update'`).first()).toBeTruthy();
    const pub = await read(env, '/app-config');
    expect(pub.body.monetization.store.slider).toMatchObject({ autoplaySec: 5, slides: [{ id: 'mythic-week', imageUrl: IMG }] });
    expect(pub.body.monetization.store.deals.cards[0]).toMatchObject({ id: 'mega', ribbon: 'auto' });
    const cfg = await admin(env, 'GET', '/monetization/config');
    expect(cfg.body.effective.store.slider.slides[0]).toMatchObject({ id: 'mythic-week', enabled: true });
    // Saving the slider alone keeps the deals (settings merge objects, replace arrays).
    expect((await admin(env, 'POST', '/app-settings', { monetization: { store: { slider: { slides: [] } } } })).status).toBe(200);
    const after = await admin(env, 'GET', '/monetization/config');
    expect(after.body.effective.store.slider.slides).toEqual([]);
    expect(after.body.effective.store.deals.cards).toHaveLength(1);
  });
});

// ===========================================================================
describe('shop banner upload', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const upload = (env: TestEnv, token: string, bytes: Uint8Array, type = 'image/png') =>
    app.request('/admin/media/shop-banner', { method: 'POST', headers: { 'Content-Type': type, Authorization: `Bearer ${token}` }, body: bytes }, env, fakeCtx());

  it('is a sensitive route (recent sign-in) like the other admin writes', () => {
    expect(isSensitiveAdminRoute('POST', '/media/shop-banner')).toBe(true);
    expect(isSensitiveAdminRoute('GET', '/media/shop-banner')).toBe(false);
  });

  it('full admins only; stores to R2 under shop-banners/, returns the public URL and is audited', async () => {
    const { env } = makeEnv();
    await seedUser(env, 'boss', 0, { role: 'admin' });
    await seedUser(env, 'mod', 0, { role: 'moderator' });
    expect((await upload(env, 'mod:moderator', PNG)).status).toBe(403);
    expect((await upload(env, 'boss:admin:stale', PNG)).status).toBe(412);
    expect((await upload(env, 'boss:admin', PNG, 'image/svg+xml')).status).toBe(400);
    expect((await upload(env, 'boss:admin', new TextEncoder().encode('<svg/>'), 'image/png')).status).toBe(400);
    expect((await upload(env, 'boss:admin', new Uint8Array(0))).status).toBe(400);
    const ok = await upload(env, 'boss:admin', PNG);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any;
    expect(body.fileKey.startsWith('shop-banners/')).toBe(true);
    expect(body.publicUrl).toBe(`https://cdn.test/${body.fileKey}`);
    expect(isSafeImageUrl(body.publicUrl)).toBe(true);
    expect(await env.MEDIA.get(body.fileKey)).toBeTruthy();
    const audit = await env.DB.prepare(`SELECT target_id FROM admin_audit_log WHERE action = 'shop.banner.upload'`).first<any>();
    expect(audit?.target_id).toBe(body.fileKey);
  });
});

// ===========================================================================
describe('physical product compare-at price', () => {
  const RELAXED = { requireVerifiedPhone: true, minAccountAgeDays: 3, maxOrdersPer30Days: 50, maxCoinsPer30Days: 1_000_000, maxAccountsPerAddress: 5, reviewFirstOrder: false, reviewAboveCoins: 0 };
  const address = { recipientName: 'Asha Rao', phone: '9876543210', addressLine1: '12 MG Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India' };
  const base = { title: 'TopHunt Tee', priceInr: 299, shippingInr: 50, active: true, variants: [{ label: 'M', stock: 5 }] };

  it('validates: empty = none; whole ₹ above the price only', () => {
    expect(validateProductInput(base).compareAtPaise).toBeNull();
    expect(validateProductInput({ ...base, compareAtInr: '' }).compareAtPaise).toBeNull();
    expect(validateProductInput({ ...base, compareAtInr: 499 }).compareAtPaise).toBe(49_900);
    expect(() => validateProductInput({ ...base, compareAtInr: 299 })).toThrow(/more than the price/);
    expect(() => validateProductInput({ ...base, compareAtInr: 100 })).toThrow(/more than the price/);
    expect(() => validateProductInput({ ...base, compareAtInr: 399.5 })).toThrow(/whole ₹/);
    expect(() => validateProductInput({ ...base, compareAtInr: 'abc' })).toThrow(/whole ₹/);
    expect(() => validateProductInput({ ...base, compareAtInr: 2_000_000 })).toThrow(/whole ₹/);
  });

  it('converts with the same rate and delivery as the price, and never rounds into a fake discount', () => {
    expect(compareAtCoinsOf(49_900, 29_900, 5_000, 1)).toBe(549);
    expect(compareAtCoinsOf(null, 29_900, 5_000, 1)).toBeNull();
    expect(compareAtCoinsOf(29_900, 29_900, 5_000, 1)).toBeNull();
    // ₹299.10 vs ₹299 at ₹10 per coin: both round up to 30 coins → no discount shown.
    expect(compareAtCoinsOf(29_910, 29_900, 0, 10)).toBeNull();
  });

  it('is returned to the app and the panel; checkout still charges the price and price_changed is unchanged', async () => {
    const { env } = makeEnv();
    await config(env, { monetization: { shop: { enabled: true, fraud: RELAXED } }, coinPricing: { dpCoinInr: 1 } });
    await seedUser(env, 'boss', 0, { role: 'admin' });
    await seedUser(env, 'alice', 1000, { phone: '9876543210', phoneVerified: true, createdAt: Date.now() - 30 * 86_400_000 });
    expect((await admin(env, 'PUT', '/monetization/shop/products/tee', { ...base, compareAtInr: 299 })).status).toBe(400);
    expect((await admin(env, 'PUT', '/monetization/shop/products/tee', { ...base, compareAtInr: 499 })).status).toBe(200);
    expect(await env.DB.prepare(`SELECT compare_at_inr_paise AS c FROM shop_products WHERE id = 'tee'`).first<any>()).toEqual({ c: 49_900 });
    const panel = await admin(env, 'GET', '/monetization/shop/products');
    expect(panel.body.products[0]).toMatchObject({ compareAtInr: 499, compareAtCoins: 549, priceCoins: 349 });

    const p = (await call(env, 'alice', 'getShopProducts')).body.products[0];
    expect(p).toMatchObject({ priceCoins: 349, compareAtCoins: 549 });
    const line = [{ productId: p.id, variantId: p.variants[0].id, qty: 1 }];
    // The "original" price is never what is charged.
    expect((await call(env, 'alice', 'placeShopOrder', { items: line, address, expectedTotalCoins: 549, requestId: 'req-00000001' })).body.error.reason).toBe('price_changed');
    const ok = await call(env, 'alice', 'placeShopOrder', { items: line, address, expectedTotalCoins: 349, requestId: 'req-00000002' });
    expect(ok.status).toBe(200);
    expect(ok.body.order.totalCoins).toBe(349);
    const u = await drizzleOf(env).select().from(schema.users).where(eq(schema.users.uid, 'alice')).get();
    expect(u!.dpcoin).toBe(651);

    // Clearing it removes the discount.
    expect((await admin(env, 'PUT', '/monetization/shop/products/tee', { ...base, compareAtInr: null })).status).toBe(200);
    expect((await call(env, 'alice', 'getShopProducts')).body.products[0].compareAtCoins).toBeNull();
  });
  it('a product-image used by a shop product cannot be deleted from under it', async () => {
    const { env } = makeEnv();
    await config(env, { monetization: { shop: { enabled: true } }, coinPricing: { dpCoinInr: 1 } });
    await seedUser(env, 'boss', 0, { role: 'admin' });
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const up = async () => {
      const r = await app.request('/admin/media/product-image', { method: 'POST', headers: { 'Content-Type': 'image/png', Authorization: 'Bearer boss:admin' }, body: PNG }, env, fakeCtx());
      expect(r.status).toBe(200);
      return ((await r.json()) as any).publicUrl as string;
    };
    const used = await up();
    const spare = await up();
    expect((await admin(env, 'PUT', '/monetization/shop/products/tee', { ...base, images: [used] })).status).toBe(200);
    expect((await admin(env, 'DELETE', '/media/product-image', { url: used })).status).toBe(412);
    expect((await admin(env, 'DELETE', '/media/product-image', { url: spare })).status).toBe(200);
  });
});
