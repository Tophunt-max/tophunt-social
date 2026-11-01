import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  values: new Map<string, string>(),
  callApi: vi.fn(),
  removed: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => h.values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { h.values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { h.removed(key); h.values.delete(key); }),
  },
}));

vi.mock('../src/services/api', () => ({
  callApi: h.callApi,
  readApi: vi.fn(),
  readApiLive: vi.fn(),
}));

import { fetchXpCosmetics } from '../src/services/gamification';

const live = {
  collection: 'xp40', total: 40, counts: { frame: 10, theme: 10, badge: 10, title: 10, unlocked: 4 },
  levelInfo: { xp: 0, level: 1 }, equipped: { frame: null, theme: null, badge: null, title: null },
  nextUnlock: null, newlyUnlocked: [], items: [],
};

describe('XP cosmetics offline cache', () => {
  beforeEach(() => { h.values.clear(); h.callApi.mockReset(); h.removed.mockReset(); });

  it('uses the server first and saves a per-account snapshot', async () => {
    h.callApi.mockResolvedValue(live);
    const result = await fetchXpCosmetics('alice');
    expect(h.callApi).toHaveBeenCalledWith('getXpCosmetics');
    expect(result.offline).toBe(false);
    expect(JSON.parse(h.values.get('@tophunt/xp-cosmetics/v1/alice')!)).toMatchObject({ collection: 'xp40', total: 40, offline: false });
  });

  it('shows the last server snapshot offline without sharing it between accounts', async () => {
    h.values.set('@tophunt/xp-cosmetics/v1/alice', JSON.stringify(live));
    h.callApi.mockRejectedValue(new Error('offline'));
    expect(await fetchXpCosmetics('alice')).toMatchObject({ collection: 'xp40', offline: true });
    await expect(fetchXpCosmetics('bob')).rejects.toThrow('offline');
  });

  it('drops corrupt cache data and preserves the network error', async () => {
    h.values.set('@tophunt/xp-cosmetics/v1/alice', '{bad');
    h.callApi.mockRejectedValue(new Error('network down'));
    await expect(fetchXpCosmetics('alice')).rejects.toThrow('network down');
    expect(h.removed).toHaveBeenCalledWith('@tophunt/xp-cosmetics/v1/alice');
  });
});
