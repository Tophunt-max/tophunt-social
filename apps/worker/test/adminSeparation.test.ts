/**
 * Admin panel separation (Shop vs Earning):
 *  - every catalogue row has one owner (reward_catalog.managed_by, migration
 *    0089) and only that side's editor may write it;
 *  - the raw Rewards JSON editor is superadmin only; admins may change just
 *    the keys the validated Earn forms send.
 */
import { vi, describe, it, expect } from 'vitest';

// Bearer token is "uid:role".
vi.mock('../src/lib/firebaseAuth', () => ({
  verifyIdToken: async (token: string) => {
    const [uid, role] = token.split(':');
    return { uid, role: role || 'user', authTime: Math.floor(Date.now() / 1000) };
  },
  bearerToken: (h?: string | null) => (h && h.startsWith('Bearer ') ? h.slice(7) : null),
}));
vi.mock('../src/lib/observability', () => ({ captureError: async () => undefined, logErrorToDb: async () => undefined }));

import { makeEnv, makeApp, fakeCtx, drizzleOf, type TestEnv } from './helpers/harness';
import * as schema from '../src/db/schema';

const app = makeApp();
const ADMIN = 'boss:admin';
const ROOT = 'root:superadmin';

async function admin(env: TestEnv, method: string, path: string, body?: any, token = ADMIN) {
  const res = await app.request(
    `/admin${path}`,
    { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    fakeCtx(),
  );
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

async function setup() {
  const { env } = makeEnv();
  const ts = Date.now();
  for (const [uid, role] of [['boss', 'admin'], ['root', 'superadmin']] as const) {
    await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, lockedCoins: 0, createdAt: ts, updatedAt: ts, role } as any);
  }
  return env;
}

const ownerOf = async (env: TestEnv, id: string) =>
  ((await env.DB.prepare(`SELECT managed_by FROM reward_catalog WHERE id = ?`).bind(id).first<any>())?.managed_by ?? null) as string | null;

const shopItem = (asset: any = {}) => ({ type: 'frame', name: 'Shop Frame', rarity: 'epic', asset: { tier: 'premium', key: 'shop.frame_rose_petal', ...asset } });
const listing = { priceCoins: 30, active: true, refundable: true };

describe('catalogue ownership (migration 0089)', () => {
  it('backfills owners from the seeded catalogue: XP level rewards, Shop items, Earning rewards', async () => {
    const env = await setup();
    const counts = await env.DB.prepare(`SELECT managed_by, COUNT(*) AS n FROM reward_catalog GROUP BY managed_by`).all<any>();
    const by = Object.fromEntries((counts.results ?? []).map((r: any) => [r.managed_by, Number(r.n)]));
    expect(by.xp).toBeGreaterThan(0);
    expect(by.shop).toBeGreaterThan(0);
    expect(by.earning).toBeGreaterThan(0);
    // Every XP level reward is 'xp'; every Premium-tier row is 'shop'.
    const wrongXp = await env.DB.prepare(`SELECT COUNT(*) AS n FROM reward_catalog WHERE id IN (SELECT item_id FROM xp_cosmetic_unlocks) AND managed_by <> 'xp'`).first<any>();
    expect(Number(wrongXp.n)).toBe(0);
    const wrongShop = await env.DB.prepare(`SELECT COUNT(*) AS n FROM reward_catalog WHERE json_extract(asset, '$.tier') = 'premium' AND managed_by <> 'shop'`).first<any>();
    expect(Number(wrongShop.n)).toBe(0);
  });

  it('Earning → Reward Items (Gamification catalog route) refuses Shop items and XP level rewards', async () => {
    const env = await setup();
    expect((await admin(env, 'PUT', '/monetization/store/items/shop_frame_x', { create: true, item: shopItem(), listing })).status).toBe(200);
    expect(await ownerOf(env, 'shop_frame_x')).toBe('shop');

    const shopEdit = await admin(env, 'PUT', '/gamification/catalog/shop_frame_x', { type: 'frame', name: 'Hijack', rarity: 'common', asset: { key: 'frame.gold' } });
    expect(shopEdit.status).toBe(412);
    expect(JSON.stringify(shopEdit.body)).toMatch(/Shop → Digital Items/);
    // The Shop item is untouched.
    const row = await env.DB.prepare(`SELECT name, asset FROM reward_catalog WHERE id = 'shop_frame_x'`).first<any>();
    expect(row.name).toBe('Shop Frame');
    expect(JSON.parse(row.asset).tier).toBe('premium');

    const xpId = ((await env.DB.prepare(`SELECT item_id FROM xp_cosmetic_unlocks LIMIT 1`).first<any>()) as any).item_id;
    const xpEdit = await admin(env, 'PUT', `/gamification/catalog/${xpId}`, { type: 'frame', name: 'Hijack', rarity: 'common', asset: { key: 'frame.gold' } });
    expect(xpEdit.status).toBe(412);
    expect(JSON.stringify(xpEdit.body)).toMatch(/Level Rewards/);
  });

  it('Earning → Reward Items (Gamification catalog route) refuses to create Premium or XP-collection items', async () => {
    const env = await setup();
    const premium = await admin(env, 'PUT', '/gamification/catalog/new_premium', { type: 'frame', name: 'P', rarity: 'rare', asset: { tier: 'premium', key: 'frame.gold' } });
    expect(premium.status).toBe(400);
    expect(await ownerOf(env, 'new_premium')).toBeNull();
    const xp40 = await admin(env, 'PUT', '/gamification/catalog/new_xp40', { type: 'frame', name: 'X', rarity: 'common', asset: { collection: 'xp40', key: 'frame.gold' } });
    expect(xp40.status).toBe(400);

    const ok = await admin(env, 'PUT', '/gamification/catalog/season_frame', { type: 'frame', name: 'Season Frame', rarity: 'rare', asset: { key: 'frame.gold' } });
    expect(ok.status).toBe(200);
    expect(await ownerOf(env, 'season_frame')).toBe('earning');
  });

  it('listing an Earning item in the Shop moves it to the Shop, after which Gamification cannot edit it', async () => {
    const env = await setup();
    expect((await admin(env, 'PUT', '/gamification/catalog/promo_frame', { type: 'frame', name: 'Promo', rarity: 'rare', asset: { key: 'frame.gold' } })).status).toBe(200);
    expect(await ownerOf(env, 'promo_frame')).toBe('earning');
    // An Earning item is not in the Shop's list until it is listed.
    expect((await admin(env, 'GET', '/monetization/store')).body.some((r: any) => r.itemId === 'promo_frame')).toBe(false);

    expect((await admin(env, 'PUT', '/monetization/store/promo_frame', listing)).status).toBe(200);
    expect(await ownerOf(env, 'promo_frame')).toBe('shop');
    expect((await admin(env, 'GET', '/monetization/store')).body.some((r: any) => r.itemId === 'promo_frame')).toBe(true);
    expect((await admin(env, 'PUT', '/gamification/catalog/promo_frame', { type: 'frame', name: 'Back', rarity: 'rare', asset: { key: 'frame.gold' } })).status).toBe(412);

    const audit = await env.DB.prepare(`SELECT detail FROM admin_audit_log WHERE action = 'store.listing.create' AND target_id = 'promo_frame'`).first<any>();
    expect(String(audit?.detail ?? '')).toContain('adoptedFrom');
  });

  it('the Gamification catalogue read reports each owner, for read-only rows in the panel', async () => {
    const env = await setup();
    await admin(env, 'PUT', '/monetization/store/items/shop_frame_y', { create: true, item: shopItem(), listing });
    const rows = (await admin(env, 'GET', '/gamification/catalog')).body as any[];
    expect(rows.find((r) => r.id === 'shop_frame_y')?.managedBy).toBe('shop');
    expect(rows.every((r) => ['shop', 'earning', 'xp'].includes(r.managedBy))).toBe(true);
  });
});

describe('raw Rewards editor (POST /admin/rewards)', () => {
  it('an admin may save the Earn form keys', async () => {
    const env = await setup();
    const r = await admin(env, 'POST', '/rewards', { dailyLoginReward: 12, dailyStreakBonus: 3, hallOfFameRewards: [300, 200, 100] });
    expect(r.status).toBe(200);
  });

  it('an admin is refused any other (raw) key; a superadmin may save it', async () => {
    const env = await setup();
    const raw = await admin(env, 'POST', '/rewards', { dailyLoginReward: 12, badges: [{ level: 5, name: 'Rookie', icon: 'star' }] });
    expect(raw.status).toBe(403);
    expect(JSON.stringify(raw.body)).toMatch(/badges/);
    // Nothing was written by the refused request.
    const stored = await env.DB.prepare(`SELECT data FROM settings WHERE id = 'gamification'`).first<any>();
    expect(String(stored?.data ?? '')).not.toContain('Rookie');

    const root = await admin(env, 'POST', '/rewards', { badges: [{ level: 5, name: 'Rookie', icon: 'star' }] }, ROOT);
    expect(root.status).toBe(200);
  });
});
