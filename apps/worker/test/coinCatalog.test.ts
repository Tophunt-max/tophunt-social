/**
 * Coin packages are gone (nothing is sold). What remains: the ₹ value of a coin
 * (Coin Economy → Values) is pushed to every open app with the app config.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { pushes } = vi.hoisted(() => ({ pushes: [] as { channels: string[]; payload: any }[] }));
vi.mock('../src/lib/publish', async (orig) => ({
  ...(await orig<any>()),
  publish: async () => {},
  publishMany: async (_env: unknown, channels: string[], payload: any) => {
    pushes.push({ channels, payload });
  },
}));

import { makeEnv, makeApp } from './helpers/harness';
import { APP_CONFIG_SHARDS } from '../src/lib/appControl';
import type { TestEnv } from './helpers/harness';

const app = makeApp();
beforeEach(() => {
  pushes.length = 0;
});

/** A ctx whose waitUntil work can be awaited (the push runs there). */
function ctx() {
  const work: Promise<unknown>[] = [];
  return { c: { waitUntil: (p: Promise<unknown>) => void work.push(p), passThroughOnException() {} } as any, done: () => Promise.all(work) };
}
async function admin(env: TestEnv, method: string, path: string, body?: unknown) {
  const x = ctx();
  const res = await app.request(
    `/admin${path}`,
    { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': 'test-admin-secret' }, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
    x.c,
  );
  await x.done();
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

describe('coin values', () => {
  it('a coin value (₹ per coin) change is pushed with the app config', async () => {
    const { env } = makeEnv();
    expect((await admin(env, 'POST', '/app-settings', { coinPricing: { dpCoinInr: 0.5, diamondInr: 0.1 } })).status).toBe(200);
    const p = pushes.find((x) => x.payload.type === 'config')!;
    expect(p.channels).toHaveLength(APP_CONFIG_SHARDS);
    expect(p.payload.config.coinValues).toEqual({ dpCoinInr: 0.5, diamondInr: 0.1 });
  });

  it('an old buy rate is ignored and no coin catalog is pushed', async () => {
    const { env } = makeEnv();
    expect((await admin(env, 'POST', '/app-settings', { coinPricing: { buyRate: 2 } })).status).toBe(200);
    expect(pushes.some((x) => x.payload.type === 'coin-packages')).toBe(false);
    const stored = await admin(env, 'GET', '/app-settings');
    expect(stored.body.coinPricing?.buyRate).toBeUndefined();
  });

  it('the coin package routes are gone', async () => {
    const { env } = makeEnv();
    expect((await admin(env, 'POST', '/coin-packages', { name: 'Starter', coins: 100 })).status).toBe(404);
    const res = await app.request('/read/coin-packages', {}, env, ctx().c);
    expect(res.status).toBe(404);
  });
});
