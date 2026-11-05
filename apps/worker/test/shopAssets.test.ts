/**
 * Shop → Shop Assets (lib/shopAssets.ts, routes/adminShopAssets.ts and
 * POST /admin/media/shop-asset): artwork rules, upload, set / reset delivered
 * via /read/app-config, history, and that every bundled file passes the rules.
 */
import { vi, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
import { readImageHeader } from '../src/lib/earningAssets';
import { SHOP_ICON_FILES, isShopAssetUrl, sanitizeShopAssets, shopAssetProblem } from '../src/lib/shopAssets';

const app = makeApp();

function png(w: number, h: number, colorType = 6): Uint8Array {
  const b = new Uint8Array(45);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b[24] = 8;
  b[25] = colorType;
  b.set([0x49, 0x45, 0x4e, 0x44], 37);
  return b;
}
function webp(w: number, h: number, alpha = true): Uint8Array {
  const b = new Uint8Array(40);
  const enc = new TextEncoder();
  b.set(enc.encode('RIFF'), 0);
  new DataView(b.buffer).setUint32(4, 32, true);
  b.set(enc.encode('WEBPVP8X'), 8);
  new DataView(b.buffer).setUint32(16, 10, true);
  b[20] = alpha ? 0x10 : 0;
  const u24 = (o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; b[o + 2] = (v >> 16) & 0xff; };
  u24(24, w - 1);
  u24(27, h - 1);
  return b;
}
const ASSET = 'https://cdn.test/shop-assets/2026/11/0b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';

async function admin(env: TestEnv, method: string, p: string, body?: any, token = 'boss:admin') {
  const res = await app.request(
    `/admin${p}`,
    { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    fakeCtx(),
  );
  let json: any = {};
  try { json = JSON.parse(await res.text()); } catch { /* empty */ }
  return { status: res.status, body: json };
}

async function setup() {
  const { env } = makeEnv();
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: { supportEmail: 'help@test' } as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:appConfig');
  const ts = Date.now() - 86_400_000;
  for (const [uid, role] of [['boss', 'admin'], ['mod', 'moderator']]) {
    await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, lockedCoins: 0, role, createdAt: ts, updatedAt: ts } as any);
  }
  return env;
}

const upload = (env: TestEnv, token: string, key: string, bytes: Uint8Array, type = 'image/webp') =>
  app.request(`/admin/media/shop-asset?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': type, Authorization: `Bearer ${token}` }, body: bytes }, env, fakeCtx());

describe('shop artwork rules', () => {
  it('accepts only our own shop-assets WebP / PNG uploads', () => {
    expect(isShopAssetUrl(ASSET, 'https://cdn.test')).toBe(true);
    expect(isShopAssetUrl(ASSET.replace('.webp', '.png'), 'https://cdn.test')).toBe(true);
    expect(isShopAssetUrl(ASSET.replace('.webp', '.svg'), 'https://cdn.test')).toBe(false);
    expect(isShopAssetUrl(ASSET.replace('cdn.test', 'evil.test'), 'https://cdn.test')).toBe(false);
    expect(isShopAssetUrl(ASSET.replace('shop-assets', 'earning-assets'), 'https://cdn.test')).toBe(false);
    expect(isShopAssetUrl('https://cdn.test/shop-assets/2026/11/../../avatars/x.webp', 'https://cdn.test')).toBe(false);
    expect(isShopAssetUrl(`${ASSET}?x=1`, 'https://cdn.test')).toBe(false);
    expect(isShopAssetUrl(ASSET.replace('https:', 'http:'), 'https://cdn.test')).toBe(false);
    expect(sanitizeShopAssets({ flame: ASSET, nope: ASSET, star: 'javascript:alert(1)' })).toEqual({ flame: ASSET });
  });

  it('checks the aspect ratio of the key, the size and transparency', () => {
    expect(shopAssetProblem('flame', readImageHeader(png(512, 512), 'image/png'))).toBeNull();
    expect(shopAssetProblem('tileFrame', readImageHeader(png(480, 400), 'image/png'))).toBeNull();
    expect(shopAssetProblem('tileFrame', readImageHeader(png(512, 512), 'image/png'))).toContain('48:40');
    expect(shopAssetProblem('laurel', readImageHeader(png(64, 128), 'image/png'))).toBeNull();
    expect(shopAssetProblem('flame', readImageHeader(png(100, 100), 'image/png'))).toContain('at least 128');
    expect(shopAssetProblem('flame', readImageHeader(png(4096, 4096), 'image/png'))).toContain('at most 2048');
    expect(shopAssetProblem('flame', readImageHeader(png(512, 512, 2), 'image/png'))).toContain('transparent');
    expect(shopAssetProblem('nope', readImageHeader(png(512, 512), 'image/png'))).toContain('Unknown');
  });

  it('every bundled Shop icon passes the upload rules for its own key', () => {
    const dir = path.join(__dirname, '..', '..', 'expo', 'assets', 'icons', 'shop');
    expect(new Set(SHOP_ICON_FILES.map(([k]) => k)).size).toBe(SHOP_ICON_FILES.length);
    for (const [key, file] of SHOP_ICON_FILES) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(dir, file)));
      expect(shopAssetProblem(key, readImageHeader(bytes, 'image/webp')), file).toBeNull();
    }
  });

  it('upload and save are sensitive (recent sign-in)', () => {
    expect(isSensitiveAdminRoute('POST', '/media/shop-asset')).toBe(true);
    expect(isSensitiveAdminRoute('PUT', '/shop/assets/flame')).toBe(true);
    expect(isSensitiveAdminRoute('GET', '/shop/assets')).toBe(false);
  });
});

describe('shop artwork overrides', () => {
  it('upload: full admin, recent sign-in, known key, WebP or PNG, 1 MB, right shape, audited', async () => {
    const env = await setup();
    const WEBP = webp(512, 512);
    expect((await upload(env, 'mod:moderator', 'flame', WEBP)).status).toBe(403);
    expect((await upload(env, 'boss:admin:stale', 'flame', WEBP)).status).toBe(412);
    expect((await upload(env, 'boss:admin', 'nope', WEBP)).status).toBe(400);
    expect((await upload(env, 'boss:admin', 'flame', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), 'image/jpeg')).status).toBe(400);
    expect((await upload(env, 'boss:admin', 'flame', png(512, 512), 'image/webp')).status).toBe(400);
    const big = new Uint8Array(1024 * 1024 + 10);
    big.set(png(512, 512));
    expect((await upload(env, 'boss:admin', 'flame', big, 'image/png')).status).toBe(400);
    const wrong = await upload(env, 'boss:admin', 'tileFrame', WEBP);
    expect(((await wrong.json()) as any).error.message).toContain('48:40');
    const ok = await upload(env, 'boss:admin', 'tileFrame', webp(480, 400));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any;
    expect(body.fileKey).toMatch(/^shop-assets\/\d{4}\/\d{2}\/[A-Za-z0-9-]+\.webp$/);
    expect(isShopAssetUrl(body.publicUrl, 'https://cdn.test')).toBe(true);
    const audit = await env.DB.prepare(`SELECT target_id FROM admin_audit_log WHERE action = 'shop.asset.upload'`).first<any>();
    expect(audit?.target_id).toBe(body.fileKey);
  });

  it('set and reset reach the public app config; the full settings save leaves them alone', async () => {
    const env = await setup();
    expect((await admin(env, 'PUT', '/shop/assets/notAKey', { url: ASSET })).status).toBe(400);
    expect((await admin(env, 'PUT', '/shop/assets/flame', { url: 'https://evil.test/x.webp' })).status).toBe(400);
    expect((await admin(env, 'PUT', '/shop/assets/flame', { url: ASSET }, 'mod:moderator')).status).toBe(403);
    expect((await admin(env, 'PUT', '/shop/assets/flame', { url: ASSET })).body.error.message).toContain('not found');

    await env.MEDIA.put(ASSET.replace('https://cdn.test/', ''), new Uint8Array([1]));
    expect((await admin(env, 'PUT', '/shop/assets/flame', { url: ASSET })).status).toBe(200);
    const list = await admin(env, 'GET', '/shop/assets');
    expect(list.body.assets).toHaveLength(SHOP_ICON_FILES.length);
    expect(list.body.assets.find((a: any) => a.key === 'flame')).toMatchObject({ url: ASSET, file: 'icons/flame.webp', group: 'icons', aspect: [24, 24], tint: false, changedBy: expect.anything() });
    expect(list.body.assets.find((a: any) => a.key === 'laurel')).toMatchObject({ aspect: [12, 24], tint: true, url: null });

    const pub = await app.request('/read/app-config', {}, env, fakeCtx());
    expect(((await pub.json()) as any).shopAssets).toEqual({ flame: ASSET });

    const save = await admin(env, 'POST', '/app-settings', { supportEmail: 'new@test', shopAssets: { star: ASSET } });
    expect(save.status).toBe(200);
    expect((await admin(env, 'GET', '/shop/assets')).body.assets.filter((a: any) => a.url).map((a: any) => a.key)).toEqual(['flame']);

    expect((await admin(env, 'PUT', '/shop/assets/flame', { url: null })).status).toBe(200);
    const pub2 = await app.request('/read/app-config?_=2', {}, env, fakeCtx());
    expect(((await pub2.json()) as any).shopAssets).toEqual({});

    const hist = await admin(env, 'GET', '/shop/assets/flame/history');
    expect(hist.body.map((h: any) => [h.action, h.url])).toEqual([['shop.asset.reset', null], ['shop.asset.update', ASSET]]);
    expect((await admin(env, 'GET', '/shop/assets/nope/history')).status).toBe(400);
  });
});
