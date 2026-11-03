/**
 * Admin-managed digital items: create / edit any kind from the Shop, upload
 * WebP artwork, and sell the result end to end.
 */
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

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';
import { isSensitiveAdminRoute } from '../src/routes/admin';
import { ownedShopArtUrl, validateCatalogItemInput } from '../src/lib/catalogItem';

const app = makeApp();
// RIFF....WEBPVP8 : enough for the magic-byte sniffer in uploadToR2.
const WEBP = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 '), 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const ART = 'https://cdn.test/shop-items/2026/11/0b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';

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

async function setup() {
  const { env } = makeEnv();
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: { monetization: { store: { enabled: true } } } as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:appConfig');
  await seedUser(env, 'boss', 0, { role: 'admin' });
  await seedUser(env, 'mod', 0, { role: 'moderator' });
  await seedUser(env, 'alice', 500);
  return env;
}

const upload = (env: TestEnv, token: string, bytes: Uint8Array, type = 'image/webp') =>
  app.request('/admin/media/shop-item-art', { method: 'POST', headers: { 'Content-Type': type, Authorization: `Bearer ${token}` }, body: bytes }, env, fakeCtx());

const sticker = (asset: any = {}) => ({
  type: 'sticker', name: 'Party Cat', description: 'A dancing cat sticker.', rarity: 'epic',
  asset: { tier: 'premium', animated: true, imageUrl: ART, fx: 'twinkle', ...asset },
});
const listing = (l: any = {}) => ({ priceCoins: 40, compareAtCoins: 60, active: true, refundable: true, ...l });

// ===========================================================================
describe('shop item artwork upload', () => {
  it('is a sensitive route (recent sign-in)', () => {
    expect(isSensitiveAdminRoute('POST', '/media/shop-item-art')).toBe(true);
    expect(isSensitiveAdminRoute('PUT', '/monetization/store/items/x')).toBe(true);
  });

  it('full admins only, WebP only, stored under shop-items/ and audited', async () => {
    const env = await setup();
    expect((await upload(env, 'mod:moderator', WEBP)).status).toBe(403);
    expect((await upload(env, 'boss:admin:stale', WEBP)).status).toBe(412);
    expect((await upload(env, 'boss:admin', PNG, 'image/png')).status).toBe(400);
    expect((await upload(env, 'boss:admin', PNG, 'image/webp')).status).toBe(400); // bytes must be WebP
    expect((await upload(env, 'boss:admin', new Uint8Array(0))).status).toBe(400);
    const ok = await upload(env, 'boss:admin', WEBP);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any;
    expect(body.fileKey).toMatch(/^shop-items\/\d{4}\/\d{2}\/[A-Za-z0-9-]+\.webp$/);
    expect(body.publicUrl).toBe(`https://cdn.test/${body.fileKey}`);
    expect(ownedShopArtUrl(env, body.publicUrl)).toBe(body.publicUrl);
    expect(await env.MEDIA.get(body.fileKey)).toBeTruthy();
    const audit = await env.DB.prepare(`SELECT target_id FROM admin_audit_log WHERE action = 'shop.item_art.upload'`).first<any>();
    expect(audit?.target_id).toBe(body.fileKey);
  });
});

// ===========================================================================
describe('catalog item validation', () => {
  const env = { R2_PUBLIC_BASE_URL: 'https://cdn.test', R2_LEGACY_BASE_URLS: '' } as any;

  it('accepts only our own shop-items WebP urls', () => {
    expect(ownedShopArtUrl(env, ART)).toBe(ART);
    expect(ownedShopArtUrl(env, 'https://evil.test/shop-items/2026/11/0b9f3a8e-1c2d.webp')).toBeNull();
    expect(ownedShopArtUrl(env, 'https://cdn.test.evil.test/shop-items/2026/11/0b9f3a8e-1c2d.webp')).toBeNull();
    expect(ownedShopArtUrl(env, 'https://cdn.test/shop-banners/2026/11/0b9f3a8e-1c2d.webp')).toBeNull();
    expect(ownedShopArtUrl(env, 'https://cdn.test/shop-items/2026/11/../../avatars/x.webp')).toBeNull();
    expect(ownedShopArtUrl(env, `${ART}?x=1`)).toBeNull();
    expect(ownedShopArtUrl(env, 'https://cdn.test/shop-items/2026/11/0b9f3a8e-1c2d.png')).toBeNull();
  });

  it('normalises artwork fields and stamps the art kind', () => {
    const v = validateCatalogItemInput(env, sticker());
    expect(v.asset).toMatchObject({ imageUrl: ART, artKind: 'sticker', fx: 'twinkle', tier: 'premium' });
    const cleared = validateCatalogItemInput(env, sticker({ imageUrl: '', fxUrl: null, fx: 'spin' }));
    expect(cleared.asset.imageUrl).toBeUndefined();
    expect(cleared.asset.artKind).toBeUndefined();
    expect(cleared.asset.fx).toBeUndefined();
  });

  it('refuses bad fields with readable messages', () => {
    expect(() => validateCatalogItemInput(env, sticker({ fxUrl: ART, imageUrl: '' }))).toThrow(/base image/);
    expect(() => validateCatalogItemInput(env, sticker({ fx: 'explode' }))).toThrow(/asset.fx/);
    expect(() => validateCatalogItemInput(env, sticker({ avatarRatio: 0.8 }))).toThrow(/frames only/);
    expect(() => validateCatalogItemInput(env, { ...sticker(), type: 'frame', asset: { imageUrl: ART, avatarRatio: 0.2 } })).toThrow(/avatarRatio/);
    expect(() => validateCatalogItemInput(env, { ...sticker(), type: 'hat' })).toThrow(/type must be/);
    expect(() => validateCatalogItemInput(env, { ...sticker(), name: '' })).toThrow(/name is required/);
    expect(() => validateCatalogItemInput(env, { ...sticker(), description: 'x'.repeat(201) })).toThrow(/description/);
    expect(() => validateCatalogItemInput(env, sticker({ icon: 'Bad Icon!' }))).toThrow(/icon/);
    expect(() => validateCatalogItemInput(env, sticker({ imageUrl: 'javascript:alert(1)' }))).toThrow(/imageUrl/);
    expect(validateCatalogItemInput(env, { ...sticker(), type: 'frame', asset: { imageUrl: ART, avatarRatio: 0.8 } }).asset.avatarRatio).toBe(0.8);
  });
});

// ===========================================================================
describe('PUT /admin/monetization/store/items/:id', () => {
  it('creates an item of any kind with artwork and its listing in one write, then sells it', async () => {
    const env = await setup();
    for (const type of ['frame', 'theme', 'badge', 'title', 'sticker', 'collectible', 'effect']) {
      const asset: any = { tier: 'premium', imageUrl: ART };
      if (type === 'title') asset.text = 'Night Owl';
      const res = await admin(env, 'PUT', `/monetization/store/items/new_${type}`, { create: true, item: { type, name: `New ${type}`, rarity: 'rare', asset }, listing: listing() });
      expect(res.status, type).toBe(200);
    }
    const store = await admin(env, 'GET', '/monetization/store');
    const row = store.body.find((r: any) => r.itemId === 'new_sticker');
    expect(row).toMatchObject({ type: 'sticker', itemActive: true, asset: { imageUrl: ART, artKind: 'sticker' }, listing: { priceCoins: 40, compareAtCoins: 60, active: true } });

    // The app sees the artwork through the store list and the public catalog.
    const list = await call(env, 'alice', 'getStore');
    expect(list.body.items.find((i: any) => i.itemId === 'new_frame').asset.imageUrl).toBe(ART);
    const cat = await read(env, '/gamification/catalog');
    expect(cat.body.items.find((i: any) => i.id === 'new_badge').asset).toMatchObject({ imageUrl: ART, artKind: 'badge' });

    const buy = await call(env, 'alice', 'buyStoreItem', { itemId: 'new_frame', expectedPrice: 40, requestId: 'req-00000001' });
    expect(buy.status).toBe(200);
    expect((await call(env, 'alice', 'equipCosmetic', { slot: 'frame', itemId: 'new_frame' })).status).toBe(200);

    const audit = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'store.item.create'`).first<any>();
    expect(audit.n).toBe(7);
  });

  it('edits name, rarity and artwork of an existing item and leaves the listing alone when none is sent', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/store/items/party_cat', { create: true, item: sticker(), listing: listing() });
    const res = await admin(env, 'PUT', '/monetization/store/items/party_cat', { item: { ...sticker({ imageUrl: '', fx: null }), name: 'Party Cat II', rarity: 'legendary' } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT name, rarity, asset FROM reward_catalog WHERE id = 'party_cat'`).first<any>();
    expect(row).toMatchObject({ name: 'Party Cat II', rarity: 'legendary' });
    expect(JSON.parse(row.asset).imageUrl).toBeUndefined();
    const l = await env.DB.prepare(`SELECT price_coins, active FROM store_listings WHERE item_id = 'party_cat'`).first<any>();
    expect(l).toMatchObject({ price_coins: 40, active: 1 });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'store.item.update'`).first<any>()).n).toBe(1);
  });

  it('refuses: duplicate create, moderators, a stale sign-in, foreign artwork, xp40 items, owned type changes, stock below sold', async () => {
    const env = await setup();
    const path = '/monetization/store/items/party_cat';
    expect((await admin(env, 'PUT', path, { create: true, item: sticker() }, 'mod:moderator')).status).toBe(403);
    expect((await admin(env, 'PUT', path, { create: true, item: sticker() }, 'boss:admin:stale')).status).toBe(412);
    expect((await admin(env, 'PUT', path, { create: true, item: sticker({ imageUrl: 'https://evil.test/x.webp' }) })).status).toBe(400);
    expect((await admin(env, 'PUT', '/monetization/store/items/Bad Id', { item: sticker() })).status).toBe(400);
    expect((await admin(env, 'PUT', path, { create: true, item: sticker(), listing: listing({ priceCoins: 0 }) })).status).toBe(400);
    // A failed listing never leaves a half-saved item behind.
    expect(await env.DB.prepare(`SELECT id FROM reward_catalog WHERE id = 'party_cat'`).first()).toBeNull();

    expect((await admin(env, 'PUT', path, { create: true, item: sticker(), listing: listing({ stockLimit: 5 }) })).status).toBe(200);
    expect((await admin(env, 'PUT', path, { create: true, item: sticker() })).status).toBe(409);

    const xp40 = await env.DB.prepare(`SELECT item_id FROM xp_cosmetic_unlocks WHERE collection = 'xp40' LIMIT 1`).first<any>();
    const xpRes = await admin(env, 'PUT', `/monetization/store/items/${xp40.item_id}`, { item: { type: 'frame', name: 'Hijack', rarity: 'common', asset: {} } });
    expect(xpRes.status).toBe(412);

    expect((await call(env, 'alice', 'buyStoreItem', { itemId: 'party_cat', expectedPrice: 40, requestId: 'req-00000002' })).status).toBe(200);
    const retype = await admin(env, 'PUT', path, { item: { ...sticker(), type: 'collectible' } });
    expect(retype.status).toBe(412);
    await env.DB.prepare(`UPDATE store_listings SET sold_count = 3 WHERE item_id = 'party_cat'`).run();
    expect((await admin(env, 'PUT', path, { item: sticker(), listing: listing({ stockLimit: 2 }) })).status).toBe(400);
  });

  it('the Gamification catalog editor accepts the same uploaded artwork', async () => {
    const env = await setup();
    const res = await admin(env, 'PUT', '/gamification/catalog/frame_upload', { type: 'frame', name: 'Uploaded', rarity: 'rare', asset: { imageUrl: ART, fxUrl: ART, fx: 'spin' } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare(`SELECT asset FROM reward_catalog WHERE id = 'frame_upload'`).first<any>();
    expect(JSON.parse(row.asset)).toMatchObject({ imageUrl: ART, fxUrl: ART, fx: 'spin', artKind: 'frame' });
    expect((await admin(env, 'PUT', '/gamification/catalog/frame_upload', { type: 'frame', name: 'Uploaded', asset: { imageUrl: 'https://evil.test/a.webp' } })).status).toBe(400);
  });
});
