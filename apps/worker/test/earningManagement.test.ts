/**
 * Earning Management (routes/adminEarning.ts): artwork overrides delivered via
 * /read/app-config, analytics, CSV export, the earning audit trail, earning
 * alerts, and the special-event budget alert.
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
import { EARNING_ART_FILES, earningAssetProblem, isEarningAssetUrl, readImageHeader, sanitizeEarningAssets } from '../src/lib/earningAssets';
import { csvCell, earningWindow } from '../src/lib/earningAnalytics';
import { runCoinAlerts } from '../src/lib/coinAlerts';

const app = makeApp();
/** Minimal PNG header: signature + IHDR (w x h, 8-bit, colour type 6 = RGBA by default). */
function png(w: number, h: number, colorType = 6): Uint8Array {
  const b = new Uint8Array(45);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b[24] = 8;
  b[25] = colorType;
  dv.setUint32(33, 0);
  b.set([0x49, 0x45, 0x4e, 0x44], 37); // IEND
  return b;
}
/** Minimal extended WebP header (VP8X) with the alpha flag. */
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
const WEBP = webp(512, 512);
const PNG = png(512, 512);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ASSET = 'https://cdn.test/earning-assets/2026/11/0b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';

async function admin(env: TestEnv, method: string, path: string, body?: any, token = 'boss:admin') {
  const res = await app.request(
    `/admin${path}`,
    { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    fakeCtx(),
  );
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* CSV */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

async function seedUser(env: TestEnv, uid: string, extra: Record<string, any> = {}) {
  const ts = Date.now() - 86_400_000;
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, dpcoin: 0, lockedCoins: 0, createdAt: ts, updatedAt: ts, ...extra } as any);
}

async function setup() {
  const { env } = makeEnv();
  await drizzleOf(env).insert(schema.settings).values({ id: 'appConfig', data: { supportEmail: 'help@test' } as any, updatedAt: Date.now() } as any);
  await env.CACHE_KV.delete('settings:appConfig');
  await seedUser(env, 'boss', { role: 'admin' });
  await seedUser(env, 'mod', { role: 'moderator' });
  return env;
}

const upload = (env: TestEnv, token: string, bytes: Uint8Array, type = 'image/webp') =>
  app.request('/admin/media/earning-asset', { method: 'POST', headers: { 'Content-Type': type, Authorization: `Bearer ${token}` }, body: bytes }, env, fakeCtx());

async function coin(env: TestEnv, uid: string, id: string, type: string, amount: number, locked: number, at: number, description: string | null = null) {
  await env.DB.prepare(`INSERT INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, uid, amount, type, description, at, locked).run();
}

describe('artwork URL rules', () => {
  it('accepts only our own earning-assets WebP / PNG uploads', () => {
    expect(isEarningAssetUrl(ASSET, 'https://cdn.test')).toBe(true);
    expect(isEarningAssetUrl(ASSET.replace('.webp', '.png'), 'https://cdn.test/')).toBe(true);
    expect(isEarningAssetUrl(ASSET.replace('.webp', '.svg'), 'https://cdn.test')).toBe(false);
    expect(isEarningAssetUrl(ASSET.replace('cdn.test', 'evil.test'), 'https://cdn.test')).toBe(false);
    expect(isEarningAssetUrl(ASSET.replace('earning-assets', 'shop-items'), 'https://cdn.test')).toBe(false);
    expect(isEarningAssetUrl('https://cdn.test/earning-assets/2026/11/../../avatars/x.webp', 'https://cdn.test')).toBe(false);
    expect(isEarningAssetUrl(ASSET + '?x=1', 'https://cdn.test')).toBe(false);
    expect(isEarningAssetUrl(ASSET.replace('https', 'http'), 'http://cdn.test')).toBe(false);
    expect(sanitizeEarningAssets({ diamond: ASSET, notAKey: ASSET, xp: 'javascript:alert(1)' })).toEqual({ diamond: ASSET });
  });

  it('reads PNG / WebP headers and applies the artwork rules', () => {
    expect(readImageHeader(png(300, 300), 'image/png')).toEqual({ width: 300, height: 300, alpha: true, animated: false });
    expect(readImageHeader(webp(256, 256), 'image/webp')).toEqual({ width: 256, height: 256, alpha: true, animated: false });
    expect(readImageHeader(png(10, 10), 'image/webp')).toBeNull();
    expect(readImageHeader(new Uint8Array(4), 'image/png')).toBeNull();
    expect(earningAssetProblem({ width: 512, height: 505, alpha: true, animated: false })).toBeNull(); // within 2%
    expect(earningAssetProblem(null)).toContain('readable');
  });

  it('the bundled app artwork itself passes the upload rules', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const [, file] of EARNING_ART_FILES) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', '..', 'expo', 'assets', 'earning', file)));
      const h = readImageHeader(bytes, 'image/webp');
      expect(earningAssetProblem(h), file).toBeNull();
    }
  });

  it('knows every Rewards Center artwork key', () => {
    expect(EARNING_ART_FILES.length).toBe(48);
    expect(new Set(EARNING_ART_FILES.map(([k]) => k)).size).toBe(48);
  });

  it('upload and save are sensitive routes', () => {
    expect(isSensitiveAdminRoute('POST', '/media/earning-asset')).toBe(true);
    expect(isSensitiveAdminRoute('PUT', '/earning/assets/diamond')).toBe(true);
    expect(isSensitiveAdminRoute('GET', '/earning/analytics')).toBe(false);
  });
});

describe('artwork overrides', () => {
  it('upload: full admin, recent sign-in, WebP or PNG, 1 MB, audited', async () => {
    const env = await setup();
    expect((await upload(env, 'mod:moderator', WEBP)).status).toBe(403);
    expect((await upload(env, 'boss:admin:stale', WEBP)).status).toBe(412);
    expect((await upload(env, 'boss:admin', JPEG, 'image/jpeg')).status).toBe(400);
    expect((await upload(env, 'boss:admin', PNG, 'image/webp')).status).toBe(400);
    const big = new Uint8Array(1024 * 1024 + 10);
    big.set(PNG);
    expect((await upload(env, 'boss:admin', big, 'image/png')).status).toBe(400);
    const why = async (bytes: Uint8Array, type: string) => ((await (await upload(env, 'boss:admin', bytes, type)).json()) as any).error?.message as string;
    expect(await why(png(512, 300), 'image/png')).toContain('square');
    expect(await why(png(64, 64), 'image/png')).toContain('at least 128');
    expect(await why(png(4096, 4096), 'image/png')).toContain('at most 2048');
    expect(await why(png(512, 512, 2), 'image/png')).toContain('transparent');
    expect(await why(webp(512, 512, false), 'image/webp')).toContain('transparent');
    expect((await upload(env, 'boss:admin', WEBP)).status).toBe(200);
    const ok = await upload(env, 'boss:admin', PNG, 'image/png');
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as any;
    expect(body).toMatchObject({ width: 512, height: 512, alpha: true, animated: false });
    expect(body.fileKey).toMatch(/^earning-assets\/\d{4}\/\d{2}\/[A-Za-z0-9-]+\.png$/);
    expect(isEarningAssetUrl(body.publicUrl, 'https://cdn.test')).toBe(true);
    const audit = await env.DB.prepare(`SELECT target_id FROM admin_audit_log WHERE action = 'earning.asset.upload' AND target_id = ?`).bind(body.fileKey).first<any>();
    expect(audit?.target_id).toBe(body.fileKey);
  });

  it('set and reset reach the public app config; the full settings save leaves them alone', async () => {
    const env = await setup();
    expect((await admin(env, 'PUT', '/earning/assets/notAKey', { url: ASSET })).status).toBe(400);
    expect((await admin(env, 'PUT', '/earning/assets/diamond', { url: 'https://evil.test/x.webp' })).status).toBe(400);
    expect((await admin(env, 'PUT', '/earning/assets/diamond', { url: ASSET }, 'mod:moderator')).status).toBe(403);

    // Not in storage yet: refused.
    expect((await admin(env, 'PUT', '/earning/assets/diamond', { url: ASSET })).body.error.message).toContain('not found');
    await env.MEDIA.put(ASSET.replace('https://cdn.test/', ''), new Uint8Array([1]));
    const set = await admin(env, 'PUT', '/earning/assets/diamond', { url: ASSET });
    expect(set.status).toBe(200);
    const list = await admin(env, 'GET', '/earning/assets');
    expect(list.body.assets.find((a: any) => a.key === 'diamond')).toMatchObject({ url: ASSET, file: 'currencies/diamond.webp', group: 'currencies', changedBy: expect.anything() });
    expect(list.body.rules).toEqual({ minSide: 128, maxSide: 2048, square: true, alpha: true });
    expect(list.body.assets.find((a: any) => a.key === 'xp').url).toBeNull();

    const pub = await app.request('/read/app-config', {}, env, fakeCtx());
    expect(((await pub.json()) as any).earningAssets).toEqual({ diamond: ASSET });

    // A full App Settings save with a stale copy can't remove or inject artwork.
    const save = await admin(env, 'POST', '/app-settings', { supportEmail: 'new@test', earningAssets: { xp: 'https://evil.test/x.webp' } });
    expect(save.status).toBe(200);
    expect((await admin(env, 'GET', '/earning/assets')).body.assets.filter((a: any) => a.url).map((a: any) => a.key)).toEqual(['diamond']);

    expect((await admin(env, 'PUT', '/earning/assets/diamond', { url: null })).status).toBe(200);
    const pub2 = await app.request('/read/app-config?_=2', {}, env, fakeCtx());
    expect(((await pub2.json()) as any).earningAssets).toEqual({});

    const hist = await admin(env, 'GET', '/earning/assets/diamond/history');
    expect(hist.body.map((h: any) => [h.action, h.url])).toEqual([['earning.asset.reset', null], ['earning.asset.update', ASSET]]);
    expect((await admin(env, 'GET', '/earning/assets/nope/history')).status).toBe(400);
    const audit = await admin(env, 'GET', '/earning/audit');
    expect(audit.body.items.map((i: any) => i.action)).toEqual(['earning.asset.reset', 'earning.asset.update']);
    expect(audit.body.items[1].detail).toMatchObject({ before: null, after: ASSET });
  });
});

describe('analytics and export', () => {
  it('sums the window by day and type, excluding house accounts', async () => {
    const env = await setup();
    await seedUser(env, 'a');
    await seedUser(env, 'b');
    await seedUser(env, 'house', { role: 'superadmin' });
    const now = Date.now();
    await coin(env, 'a', 'a1', 'daily_reward', 5, 5, now - 1000);
    await coin(env, 'a', 'a2', 'quest_reward', 20, 20, now - 900);
    await coin(env, 'b', 'b1', 'contest_win_reward', 18, 0, now - 800);
    await coin(env, 'b', 'b2', 'referral_bonus', 10, 10, now - 700);
    await coin(env, 'b', 'b3', 'referral_clawback', -10, -10, now - 600);
    await coin(env, 'a', 'fee', 'contest_entry_fee', -5, -5, now - 500); // not earning
    await coin(env, 'house', 'h1', 'daily_reward', 999, 999, now - 500);
    await coin(env, 'a', 'old', 'daily_reward', 7, 7, now - 40 * 86_400_000);
    await env.DB.prepare(`INSERT INTO user_xp_daily (uid, day, action, xp, events) VALUES ('a', ?, 'vote', 30, 3)`)
      .bind(earningWindow(1, 0).endDay).run();

    const r = await admin(env, 'GET', '/earning/analytics?days=7');
    expect(r.status).toBe(200);
    expect(r.body.totals).toMatchObject({ diamondsEarned: 35, diamondsReversed: 10, dpcoinWon: 18, claims: 5, earners: 2 });
    expect(r.body.daily).toHaveLength(7);
    expect(r.body.byType.find((t: any) => t.type === 'quest_reward')).toMatchObject({ count: 1, diamonds: 20 });
    expect(r.body.byType.some((t: any) => t.type === 'contest_entry_fee')).toBe(false);
    expect(r.body.topEarners.map((t: any) => [t.uid, t.diamonds])).toEqual([['a', 25]]);
    expect((await admin(env, 'GET', '/earning/analytics', undefined, 'mod:moderator')).status).toBe(403);
  });

  it('exports CSV with formula-safe text', async () => {
    const env = await setup();
    await seedUser(env, '=evil', {});
    await coin(env, '=evil', 'e1', 'daily_reward', 5, 5, Date.now() - 1000, '=HYPERLINK("x")');
    const daily = await admin(env, 'GET', '/earning/export?kind=daily&days=7');
    expect(daily.status).toBe(200);
    expect(daily.headers.get('content-type')).toContain('text/csv');
    expect(daily.headers.get('content-disposition')).toContain('attachment');
    expect(daily.text.split('\r\n')[0]).toBe('date,source,type,rows,users,diamonds,dp_coin,xp');
    expect(daily.text).toContain(',ledger,daily_reward,1,1,5,0,0');

    const ledger = await admin(env, 'GET', '/earning/export?kind=ledger&days=7');
    expect(ledger.headers.get('x-truncated')).toBe('0');
    expect(ledger.text).toContain(`'=evil`);
    expect(ledger.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(ledger.text).not.toMatch(/,=/);
    const audit = await env.DB.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'earning.export'`).first<any>();
    expect(audit.n).toBe(2);
  });

  it('csv cells', () => {
    expect(csvCell(5)).toBe('5');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell(null)).toBe('');
  });
});

describe('audit trail and alerts', () => {
  it('lists only earning admin actions, newest first, with a cursor', async () => {
    const env = await setup();
    const ins = (id: string, action: string, at: number) =>
      env.DB.prepare(`INSERT INTO admin_audit_log (id, admin_uid, action, created_at) VALUES (?, 'boss', ?, ?)`).bind(id, action, at).run();
    await ins('1', 'earning.event.update', 1000);
    await ins('2', 'wallet.adjust', 2000);
    await ins('3', 'post.delete', 3000);
    await ins('4', 'settings.coinPricing.update', 4000);
    await ins('5', 'referral.reverse', 5000);
    await ins('6', 'settings.explore.update', 6000);
    const p1 = await admin(env, 'GET', '/earning/audit?limit=2');
    expect(p1.body.items.map((i: any) => i.id)).toEqual(['5', '4']);
    const p2 = await admin(env, 'GET', `/earning/audit?limit=2&before=${encodeURIComponent(p1.body.nextCursor)}`);
    expect(p2.body.items.map((i: any) => i.id)).toEqual(['2', '1']);
    expect(p2.body.nextCursor).toBeNull();
    expect((await admin(env, 'GET', '/earning/audit?before=bad')).status).toBe(400);
  });

  it('earning alerts, and an alert when an event budget is 80% claimed', async () => {
    const env = await setup();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO reward_events (id, title, status, starts_at, ends_at, total_budget, tasks, created_at, updated_at) VALUES ('ev', 'Diwali', 'active', ?, ?, 100, '[]', ?, ?)`,
    ).bind(now - 1000, now + 86_400_000, now, now).run();
    await env.DB.prepare(`INSERT INTO reward_event_claims (event_id, task_id, uid, coins, created_at) VALUES ('ev', 't', 'u1', 85, ?)`).bind(now).run();
    await env.DB.prepare(`INSERT INTO admin_notifications (id, title, message, link, created_at) VALUES ('ops', 'Cron failed', 'x', '/logs', ?)`).bind(now).run();
    const res = await runCoinAlerts(env, now);
    expect(res.eventBudgets).toBe(1);
    const again = await runCoinAlerts(env, now + 1000); // deduplicated
    expect(again.eventBudgets).toBe(0);
    const list = await admin(env, 'GET', '/earning/notifications');
    expect(list.status).toBe(200);
    expect(list.body.map((n: any) => n.link)).toEqual(['/earning-events']);
    expect(list.body[0].title).toContain('Diwali');
  });
});
