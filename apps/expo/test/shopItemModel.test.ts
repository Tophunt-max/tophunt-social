import { describe, expect, it } from 'vitest';
import {
  availability,
  bundlesWithItem,
  buyBarState,
  coinsShort,
  collectionsWithItem,
  equipSlotFor,
  heroTag,
  isEquipped,
  itemShareCaption,
  itemShareUrl,
  previewContexts,
  similarItems,
} from '@/src/lib/shopItemModel';
import { NEW_WINDOW_MS, type ShopBundleDef, type ShopCollectionDef, type ShopItem } from '@/src/lib/shopModel';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function it_(over: Partial<ShopItem> & { itemId: string }): ShopItem {
  return { type: 'frame', name: over.itemId, rarity: 'rare', priceCoins: 100, remaining: null, endsAt: null, owned: false, ...over };
}

function bundle(id: string, itemIds: string[], over: Partial<ShopBundleDef> = {}): ShopBundleDef {
  return {
    id,
    name: id,
    description: '',
    imageUrl: null,
    badge: null,
    priceDiamonds: 50,
    compareAtDiamonds: null,
    startsAt: null,
    endsAt: null,
    remaining: null,
    items: itemIds.map((itemId) => ({ itemId, type: 'frame', name: itemId, rarity: 'rare', asset: {}, owned: false })),
    ownedCount: 0,
    purchased: false,
    ...over,
  };
}

const base = { signedIn: true, live: true, dpcoin: 500, now: NOW, equipped: false };

describe('equipSlotFor', () => {
  it('maps the worker EQUIP_SLOTS types to themselves', () => {
    for (const t of ['frame', 'theme', 'title', 'badge', 'accessory', 'effect']) expect(equipSlotFor(t)).toBe(t);
  });
  it('returns null for types without a slot', () => {
    expect(equipSlotFor('sticker')).toBeNull();
    expect(equipSlotFor('collectible')).toBeNull();
    expect(equipSlotFor('')).toBeNull();
    expect(equipSlotFor(undefined)).toBeNull();
  });
});

describe('isEquipped', () => {
  const item = { itemId: 'f1', type: 'frame' };
  it('uses the per-item flag when the item is listed', () => {
    expect(isEquipped({ items: [{ id: 'f1', equipped: true }] }, item)).toBe(true);
    expect(isEquipped({ items: [{ id: 'f1', equipped: false }], equipped: { frame: 'f1' } }, item)).toBe(false);
  });
  it('falls back to the equipped map (id string or object)', () => {
    expect(isEquipped({ equipped: { frame: 'f1' } }, item)).toBe(true);
    expect(isEquipped({ equipped: { frame: { id: 'f1' } } }, item)).toBe(true);
    expect(isEquipped({ equipped: { frame: 'f2' } }, item)).toBe(false);
  });
  it('is false without data or for slot-less types', () => {
    expect(isEquipped(null, item)).toBe(false);
    expect(isEquipped({ equipped: { sticker: 's1' } }, { itemId: 's1', type: 'sticker' })).toBe(false);
  });
});

describe('previewContexts', () => {
  it('frame and badge show everywhere a person shows', () => {
    expect(previewContexts('frame')).toEqual(['profile', 'post', 'comment', 'battle']);
    expect(previewContexts('badge')).toEqual(['profile', 'post', 'comment', 'battle']);
  });
  it('title skips the battle card; theme and effect are profile only', () => {
    expect(previewContexts('title')).toEqual(['profile', 'post', 'comment']);
    expect(previewContexts('theme')).toEqual(['profile']);
    expect(previewContexts('effect')).toEqual(['profile']);
  });
  it('stickers preview in a comment; unknown types on the profile', () => {
    expect(previewContexts('sticker')).toEqual(['comment']);
    expect(previewContexts('mystery')).toEqual(['profile']);
    expect(previewContexts(null)).toEqual(['profile']);
  });
});

describe('buyBarState', () => {
  it('signed out wins over everything', () => {
    expect(buyBarState(it_({ itemId: 'a', owned: true }), { ...base, signedIn: false })).toBe('signin');
  });
  it('owned: equip / equipped, or owned for slot-less types', () => {
    expect(buyBarState(it_({ itemId: 'a', owned: true }), base)).toBe('equip');
    expect(buyBarState(it_({ itemId: 'a', owned: true }), { ...base, equipped: true })).toBe('equipped');
    expect(buyBarState(it_({ itemId: 'a', type: 'sticker', owned: true }), base)).toBe('owned');
  });
  it('owned beats an ended sale', () => {
    expect(buyBarState(it_({ itemId: 'a', owned: true, endsAt: NOW - 1 }), base)).toBe('equip');
  });
  it('not started → soon; ended or sold out → ended', () => {
    expect(buyBarState(it_({ itemId: 'a', startsAt: NOW + DAY }), base)).toBe('soon');
    expect(buyBarState(it_({ itemId: 'a', endsAt: NOW }), base)).toBe('ended');
    expect(buyBarState(it_({ itemId: 'a', remaining: 0 }), base)).toBe('ended');
  });
  it('short only with a live balance below the price', () => {
    expect(buyBarState(it_({ itemId: 'a', priceCoins: 600 }), base)).toBe('short');
    expect(buyBarState(it_({ itemId: 'a', priceCoins: 600 }), { ...base, live: false, dpcoin: 0 })).toBe('buy');
    expect(buyBarState(it_({ itemId: 'a', priceCoins: 500 }), base)).toBe('buy');
  });
  it('a future sale end or past start still buys', () => {
    expect(buyBarState(it_({ itemId: 'a', endsAt: NOW + DAY, startsAt: NOW - DAY }), base)).toBe('buy');
  });
});

describe('coinsShort', () => {
  it('is the gap with a live balance below the price, else null', () => {
    expect(coinsShort(40, 100, true)).toBe(60);
    expect(coinsShort(100, 100, true)).toBeNull();
    expect(coinsShort(0, 100, false)).toBeNull();
  });
});

describe('availability', () => {
  it('reports only real, future signals', () => {
    expect(availability(it_({ itemId: 'a', remaining: 3, endsAt: NOW + DAY, startsAt: NOW + 1 }), NOW)).toEqual({
      stockLeft: 3,
      saleEndsAt: NOW + DAY,
      startsAt: NOW + 1,
    });
    expect(availability(it_({ itemId: 'a', remaining: 0, endsAt: NOW - 1, startsAt: NOW - 1 }), NOW)).toEqual({
      stockLeft: null,
      saleEndsAt: null,
      startsAt: null,
    });
  });
  it('shows nothing for an owned item', () => {
    expect(availability(it_({ itemId: 'a', owned: true, remaining: 3, endsAt: NOW + DAY }), NOW)).toEqual({ stockLeft: null, saleEndsAt: null, startsAt: null });
  });
});

describe('heroTag', () => {
  it('NEW from a recent listing date', () => {
    const a = it_({ itemId: 'a', createdAt: NOW - DAY });
    expect(heroTag(a, [a], NOW)).toEqual({ kind: 'new', label: 'NEW' });
    const old = it_({ itemId: 'b', createdAt: NOW - NEW_WINDOW_MS - DAY });
    expect(heroTag(old, [old], NOW)).toBeNull();
  });
  it('LIMITED from real stock or a future sale end', () => {
    const a = it_({ itemId: 'a', remaining: 2 });
    expect(heroTag(a, [a], NOW)?.label).toBe('LIMITED');
    const b = it_({ itemId: 'b', endsAt: NOW + DAY });
    expect(heroTag(b, [b], NOW)?.label).toBe('LIMITED');
  });
  it('TRENDING only for a top seller with real sales', () => {
    const all = Array.from({ length: 8 }, (_, n) => it_({ itemId: `i${n}`, soldCount: 10 - n }));
    expect(heroTag(all[0], all, NOW)?.label).toBe('TRENDING');
    expect(heroTag(all[7], all, NOW)).toBeNull();
    const unsold = it_({ itemId: 'z', soldCount: 0 });
    expect(heroTag(unsold, [unsold], NOW)).toBeNull();
  });
});

describe('bundlesWithItem', () => {
  const bs = [
    bundle('b1', ['a', 'b']),
    bundle('b2', ['c']),
    bundle('b3', ['a'], { endsAt: NOW - 1 }),
    bundle('b4', ['a'], { endsAt: NOW - 1, purchased: true }),
  ];
  it('finds bundles listing the item', () => {
    expect(bundlesWithItem(bs, 'a').map((b) => b.id)).toEqual(['b1', 'b3', 'b4']);
    expect(bundlesWithItem(bs, 'x')).toEqual([]);
    expect(bundlesWithItem(null, 'a')).toEqual([]);
  });
  it('with now, keeps only available or bought bundles', () => {
    expect(bundlesWithItem(bs, 'a', NOW).map((b) => b.id)).toEqual(['b1', 'b4']);
  });
});

describe('collectionsWithItem', () => {
  const cs: ShopCollectionDef[] = [
    { id: 'c1', name: 'One', subtitle: '', imageUrl: null, accent: 'violet', itemIds: ['a', 'b'] },
    { id: 'c2', name: 'Two', subtitle: '', imageUrl: null, accent: 'blue', itemIds: ['c'] },
  ];
  it('finds collections listing the item', () => {
    expect(collectionsWithItem(cs, 'a').map((c) => c.id)).toEqual(['c1']);
    expect(collectionsWithItem(cs, 'z')).toEqual([]);
    expect(collectionsWithItem(undefined, 'a')).toEqual([]);
  });
});

describe('similarItems', () => {
  const me = it_({ itemId: 'me', type: 'frame', rarity: 'epic', priceCoins: 300 });
  const all = [
    me,
    it_({ itemId: 'badgeEpic', type: 'badge', rarity: 'epic' }),
    it_({ itemId: 'frameRare', type: 'frame', rarity: 'rare', priceCoins: 300 }),
    it_({ itemId: 'frameEpicOwned', type: 'frame', rarity: 'epic', owned: true }),
    it_({ itemId: 'frameEpic', type: 'frame', rarity: 'epic', priceCoins: 900 }),
    it_({ itemId: 'frameEpicClose', type: 'frame', rarity: 'epic', priceCoins: 320 }),
    it_({ itemId: 'themeCommon', type: 'theme', rarity: 'common' }),
  ];
  it('excludes the item and unrelated items; same type first, then same rarity, owned last', () => {
    expect(similarItems(me, all).map((i) => i.itemId)).toEqual(['frameEpicClose', 'frameEpic', 'frameRare', 'badgeEpic', 'frameEpicOwned']);
  });
  it('caps at max', () => {
    expect(similarItems(me, all, 2).map((i) => i.itemId)).toEqual(['frameEpicClose', 'frameEpic']);
    const many = Array.from({ length: 20 }, (_, n) => it_({ itemId: `f${n}` }));
    expect(similarItems(me, many)).toHaveLength(8);
    expect(similarItems(me, null)).toEqual([]);
  });
});

describe('item share link', () => {
  it('builds the /shop/item link, or null without an origin', () => {
    expect(itemShareUrl('https://tophunt.in/', 'frame_gold')).toBe('https://tophunt.in/shop/item/frame_gold');
    expect(itemShareUrl('https://tophunt.in', 'a b')).toBe('https://tophunt.in/shop/item/a%20b');
    expect(itemShareUrl(null, 'x')).toBeNull();
    expect(itemShareCaption('Gold', 'https://t/x')).toContain('https://t/x');
  });
});
