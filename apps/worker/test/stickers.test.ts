/**
 * Owned stickers sent in DMs and comments (lib/stickers.ts, migration 0083).
 */
import { describe, it, expect, vi } from 'vitest';

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
import { invalidateGamificationCatalog } from '../src/lib/cosmetics';

const app = makeApp();
const ART = 'https://cdn.test/shop-items/2026/11/0b9f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp';

async function seedUser(env: TestEnv, uid: string) {
  const ts = Date.now();
  await drizzleOf(env).insert(schema.users).values({ signupCompleted: true, uid, username: uid, fullName: uid, createdAt: ts, updatedAt: ts } as any);
}
async function api(env: TestEnv, uid: string, action: string, data: any = {}) {
  const res = await app.request('/api', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid}` }, body: JSON.stringify({ action, ...data }) }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function get(env: TestEnv, uid: string, path: string) {
  const res = await app.request(`/read${path}`, { headers: { Authorization: `Bearer ${uid}` } }, env, fakeCtx());
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

async function setup() {
  invalidateGamificationCatalog();
  const { env } = makeEnv();
  await seedUser(env, 'alice');
  await seedUser(env, 'bob');
  const ts = Date.now();
  await env.DB.prepare(`INSERT INTO reward_catalog (id, type, name, description, rarity, asset, active, sort, created_at, updated_at) VALUES (?, 'sticker', 'Party Cat', '', 'epic', ?, 1, 0, ?, ?)`)
    .bind('party_cat', JSON.stringify({ imageUrl: ART, artKind: 'sticker' }), ts, ts).run();
  await env.DB.prepare(`INSERT INTO reward_catalog (id, type, name, description, rarity, asset, active, sort, created_at, updated_at) VALUES ('frame_x', 'frame', 'X', '', 'rare', '{}', 1, 0, ?, ?)`).bind(ts, ts).run();
  for (const item of ['party_cat', 'frame_x']) {
    await env.DB.prepare(`INSERT INTO user_inventory (uid, item_id, source, acquired_at) VALUES ('alice', ?, 'store', ?)`).bind(item, ts).run();
  }
  await env.DB.prepare(`INSERT INTO posts (id, user_id, media_url, created_at) VALUES ('p1', 'bob', 'x.jpg', ?)`).bind(ts).run();
  const chatId = (await api(env, 'alice', 'startChat', { otherUserId: 'bob' })).body.chatId as string;
  return { env, chatId };
}

describe('stickers in DMs', () => {
  it('sends an owned sticker; readers get the sticker view, the inbox a preview', async () => {
    const { env, chatId } = await setup();
    const res = await api(env, 'alice', 'sendMessage', { chatId, stickerId: 'party_cat', clientId: 'stick-0001' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({ type: 'sticker', stickerId: 'party_cat', mediaUrl: null, sticker: { id: 'party_cat', name: 'Party Cat', asset: { imageUrl: ART } } });

    const thread = await get(env, 'bob', `/chats/${chatId}/messages`);
    expect(thread.body.at(-1)).toMatchObject({ type: 'sticker', stickerId: 'party_cat', mediaUrl: null, sticker: { name: 'Party Cat' } });
    const inbox = await get(env, 'bob', '/chats');
    expect(JSON.stringify(inbox.body)).toContain('🎨 Sticker');
  });

  it('refuses stickers the sender does not own, non-stickers, revoked copies and sticker + text', async () => {
    const { env, chatId } = await setup();
    expect((await api(env, 'bob', 'sendMessage', { chatId, stickerId: 'party_cat' })).status).toBe(412);
    expect((await api(env, 'alice', 'sendMessage', { chatId, stickerId: 'frame_x' })).status).toBe(412);
    expect((await api(env, 'alice', 'sendMessage', { chatId, stickerId: 'party_cat', text: 'hi' })).status).toBe(400);
    expect((await api(env, 'alice', 'sendMessage', { chatId, stickerId: '../x' })).status).toBe(400);
    await env.DB.prepare(`UPDATE user_inventory SET revoked_at = 1 WHERE uid = 'alice' AND item_id = 'party_cat'`).run();
    expect((await api(env, 'alice', 'sendMessage', { chatId, stickerId: 'party_cat' })).status).toBe(412);
  });
});

describe('stickers in comments', () => {
  it('posts a sticker-only comment and a sticker with text; the thread carries the sticker', async () => {
    const { env } = await setup();
    expect((await api(env, 'alice', 'addComment', { targetType: 'posts', targetId: 'p1', stickerId: 'party_cat' })).status).toBe(200);
    expect((await api(env, 'alice', 'addComment', { targetType: 'posts', targetId: 'p1', stickerId: 'party_cat', text: 'love it' })).status).toBe(200);
    const thread = await get(env, 'bob', '/comments?targetType=posts&targetId=p1');
    expect(thread.body.items).toHaveLength(2);
    for (const c of thread.body.items) expect(c).toMatchObject({ stickerId: 'party_cat', sticker: { name: 'Party Cat', asset: { imageUrl: ART } } });
    expect(thread.body.items.map((c: any) => c.text).sort()).toEqual(['', 'love it']);
    // Plain comments are unchanged.
    expect((await api(env, 'bob', 'addComment', { targetType: 'posts', targetId: 'p1', text: 'thanks' })).status).toBe(200);
  });

  it('still refuses empty comments and unowned stickers', async () => {
    const { env } = await setup();
    expect((await api(env, 'alice', 'addComment', { targetType: 'posts', targetId: 'p1', text: '  ' })).status).toBe(400);
    expect((await api(env, 'bob', 'addComment', { targetType: 'posts', targetId: 'p1', stickerId: 'party_cat' })).status).toBe(412);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM post_comments`).first<any>()).toMatchObject({ n: 0 });
  });
});
