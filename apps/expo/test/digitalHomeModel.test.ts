import { describe, expect, it } from 'vitest';
import {
  DIGITAL_SHELF_MAX,
  digitalShelf,
  digitalShelves,
  digitalTag,
  fromPrice,
  giftFromPrice,
  isDefaultDigitalFilter,
  rarityPill,
  specialCards,
} from '@/src/lib/digitalHomeModel';
import { NO_FILTER, type ShopItem } from '@/src/lib/shopModel';

const NOW = Date.UTC(2025, 5, 1);
const OLD = NOW - 90 * 86_400_000;

const item = (over: Partial<ShopItem> & { itemId: string }): ShopItem => ({
  type: 'theme',
  name: over.itemId,
  rarity: 'common',
  priceCoins: 100,
  remaining: null,
  endsAt: null,
  owned: false,
  createdAt: OLD,
  ...over,
});

describe('isDefaultDigitalFilter', () => {
  it('is true for no filter and for the empty object openDigital({}) builds', () => {
    expect(isDefaultDigitalFilter(NO_FILTER)).toBe(true);
    expect(isDefaultDigitalFilter({ ...NO_FILTER })).toBe(true);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, query: '   ' })).toBe(true);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, rarities: [] })).toBe(true);
    expect(isDefaultDigitalFilter(null)).toBe(true);
  });
  it('is false for every real filter (home links, admin targets, upgrade banner)', () => {
    expect(isDefaultDigitalFilter({ ...NO_FILTER, type: 'frame' })).toBe(false);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, rarity: 'epic' })).toBe(false);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, query: 'gold' })).toBe(false);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, ids: [] })).toBe(false);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, wishlist: true })).toBe(false);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, rarities: ['epic', 'legendary'] })).toBe(false);
    expect(isDefaultDigitalFilter({ ...NO_FILTER, discounted: true })).toBe(false);
  });
});

describe('digitalShelves', () => {
  const items = [
    item({ itemId: 't1', rarity: 'rare', priceCoins: 500 }),
    item({ itemId: 't2', rarity: 'legendary', priceCoins: 3000 }),
    item({ itemId: 't3', rarity: 'rare', priceCoins: 900 }),
    item({ itemId: 't4', rarity: 'epic', priceCoins: 100 }),
    item({ itemId: 't5', rarity: 'common', priceCoins: 50 }),
    item({ itemId: 'b1', type: 'badge', rarity: 'epic' }),
    item({ itemId: 'f1', type: 'frame', rarity: 'mythic' }),
  ];
  it('keeps one type, rarest then priciest first, capped', () => {
    expect(digitalShelf(items, 'theme', 4).map((i) => i.itemId)).toEqual(['t2', 't4', 't3', 't1']);
    expect(digitalShelf(items, 'theme', 0)).toEqual([]);
  });
  it('builds the four shelves with the mock row sizes and leaves missing types empty', () => {
    const s = digitalShelves(items);
    expect(s.theme).toHaveLength(DIGITAL_SHELF_MAX.theme);
    expect(s.badge.map((i) => i.itemId)).toEqual(['b1']);
    expect(s.frame.map((i) => i.itemId)).toEqual(['f1']);
    expect(s.title).toEqual([]);
  });
  it('does not mutate the store list', () => {
    const before = items.map((i) => i.itemId);
    digitalShelves(items);
    expect(items.map((i) => i.itemId)).toEqual(before);
  });
});

describe('fromPrice / giftFromPrice', () => {
  it('is the lowest real price of the type, null without items', () => {
    const items = [item({ itemId: 'e1', type: 'effect', priceCoins: 800 }), item({ itemId: 'e2', type: 'effect', priceCoins: 450 }), item({ itemId: 'x', priceCoins: 1 })];
    expect(fromPrice(items, 'effect')).toBe(450);
    expect(fromPrice(items, 'vs')).toBeNull();
    expect(fromPrice([item({ itemId: 'n', type: 'effect', priceCoins: Number.NaN })], 'effect')).toBeNull();
  });
  it('gift price: lowest positive DP coin price, only when gifts are on', () => {
    expect(giftFromPrice([{ priceCoins: 50 }, { priceCoins: 10 }, { priceCoins: 0 }])).toBe(10);
    expect(giftFromPrice([{ priceCoins: 50 }], false)).toBeNull();
    expect(giftFromPrice([])).toBeNull();
    expect(giftFromPrice(undefined)).toBeNull();
    expect(giftFromPrice([{ priceCoins: 0 }])).toBeNull();
  });
});

describe('digitalTag', () => {
  it('FREE only for a 0 price', () => {
    expect(digitalTag(item({ itemId: 'a', priceCoins: 0, rarity: 'legendary' }), NOW, true).label).toBe('FREE');
  });
  it('Legendary and Mythic show their rarity', () => {
    expect(digitalTag(item({ itemId: 'a', rarity: 'legendary' }), NOW, true)).toEqual({ kind: 'rarity', label: 'LEGENDARY', rarity: 'legendary' });
    expect(digitalTag(item({ itemId: 'a', rarity: 'mythic' }), NOW, true).label).toBe('MYTHIC');
  });
  it('NEW / LIMITED from real fields beat PREMIUM', () => {
    expect(digitalTag(item({ itemId: 'a', rarity: 'rare', createdAt: NOW - 86_400_000 }), NOW, true).label).toBe('NEW');
    expect(digitalTag(item({ itemId: 'a', rarity: 'rare', remaining: 5 }), NOW, true).label).toBe('LIMITED');
  });
  it('PREMIUM for paid premium artwork, else the rarity', () => {
    expect(digitalTag(item({ itemId: 'a', rarity: 'rare' }), NOW, true)).toEqual({ kind: 'premium', label: 'PREMIUM' });
    expect(digitalTag(item({ itemId: 'a', rarity: 'epic' }), NOW, false)).toEqual({ kind: 'rarity', label: 'EPIC', rarity: 'epic' });
  });
});

describe('rarityPill', () => {
  it('FREE for 0, else the rarity name (unknown → COMMON)', () => {
    expect(rarityPill({ priceCoins: 0, rarity: 'epic' }).label).toBe('FREE');
    expect(rarityPill({ priceCoins: 10, rarity: 'epic' })).toEqual({ kind: 'rarity', label: 'EPIC', rarity: 'epic' });
    expect(rarityPill({ priceCoins: 10, rarity: 'weird' }).label).toBe('COMMON');
  });
});

describe('specialCards', () => {
  const effect = [item({ itemId: 'e1', type: 'effect', priceCoins: 1200 }), item({ itemId: 'e2', type: 'effect', priceCoins: 700 })];
  const byKey = (cards: ReturnType<typeof specialCards>) => Object.fromEntries(cards.map((c) => [c.key, c]));
  it('draws the four mock cards in order', () => {
    expect(specialCards([], { enabled: false, list: null }).map((c) => c.title)).toEqual(['VS Effects', 'Victory Animations', 'Profile Effects', 'Virtual Gifts']);
  });
  it('VS and Victory are always soon (no item type); effect uses its lowest live price', () => {
    const c = byKey(specialCards(effect, { enabled: true, list: [{ priceCoins: 20 }] }));
    expect(c.vs).toMatchObject({ state: 'soon', price: null, target: null });
    expect(c.victory).toMatchObject({ state: 'soon', price: null, target: null });
    expect(c.effect).toMatchObject({ state: 'price', price: 700, target: { kind: 'type', type: 'effect' } });
    expect(c.gifts).toMatchObject({ state: 'price', price: 20, target: { kind: 'gifts' } });
  });
  it('no effect items → soon', () => {
    expect(byKey(specialCards([], { enabled: true, list: [] })).effect.state).toBe('soon');
  });
  it('gifts: off or empty → soon; still loading → no price and no chip', () => {
    expect(byKey(specialCards([], { enabled: false, list: [{ priceCoins: 5 }] })).gifts).toMatchObject({ state: 'soon', target: null });
    expect(byKey(specialCards([], { enabled: true, list: [] })).gifts).toMatchObject({ state: 'soon', target: null });
    expect(byKey(specialCards([], { enabled: true, list: null })).gifts).toMatchObject({ state: 'none', target: null });
    expect(byKey(specialCards([], { enabled: true, list: [{ priceCoins: 0 }] })).gifts).toMatchObject({ state: 'none', price: null, target: { kind: 'gifts' } });
  });
});
