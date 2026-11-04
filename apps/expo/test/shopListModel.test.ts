import { describe, expect, it } from 'vitest';
import {
  BUNDLE_SORTS,
  CATEGORY_SORTS,
  DEAL_SORTS,
  FEATURED_SORTS,
  SORTS,
  bundleOwned,
  categorySummary,
  countLabel,
  dealItems,
  extraCategories,
  filterBundles,
  filterItems,
  physicalDeals,
  isFiltered,
  presentTypes,
  rankMedal,
  rankTrending,
  sortBundles,
  sortItems,
  sortOr,
  tileKeyForType,
  typeTitle,
} from '@/src/lib/shopListModel';
import { categoryTiles, type ShopBundleDef, type ShopItem } from '@/src/lib/shopModel';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function item(over: Partial<ShopItem> & { itemId: string }): ShopItem {
  return { type: 'frame', name: over.itemId, rarity: 'common', priceCoins: 100, remaining: null, endsAt: null, owned: false, ...over };
}

function bundle(over: Partial<ShopBundleDef> & { id: string }): ShopBundleDef {
  return {
    name: over.id, description: '', imageUrl: null, badge: null, priceDiamonds: 100, compareAtDiamonds: null,
    startsAt: null, endsAt: null, remaining: null, items: [{ itemId: 'x', type: 'frame', name: 'X', rarity: 'rare', asset: {}, owned: false }],
    ownedCount: 0, purchased: false, ...over,
  };
}

const ids = (xs: { itemId: string }[]) => xs.map((x) => x.itemId);

describe('SORTS', () => {
  it('every page list uses defined sorts with unique keys', () => {
    for (const list of [CATEGORY_SORTS, FEATURED_SORTS, DEAL_SORTS]) {
      expect(new Set(list.map((s) => s.key)).size).toBe(list.length);
      for (const s of list) expect(SORTS[s.key]).toBe(s);
    }
    expect(CATEGORY_SORTS[0].key).toBe('popular');
    expect(FEATURED_SORTS[0].key).toBe('default');
    expect(DEAL_SORTS[0].key).toBe('discount');
  });

  it('sortOr falls back to the first option for an unknown key', () => {
    expect(sortOr('price_asc', CATEGORY_SORTS)).toBe('price_asc');
    expect(sortOr('discount', CATEGORY_SORTS)).toBe('popular');
    expect(sortOr(null, DEAL_SORTS)).toBe('discount');
  });
});

describe('sortItems', () => {
  const a = item({ itemId: 'a', priceCoins: 300, rarity: 'rare', soldCount: 5, createdAt: NOW - 3 * DAY });
  const b = item({ itemId: 'b', priceCoins: 100, rarity: 'mythic', soldCount: 0, startsAt: NOW - DAY });
  const c = item({ itemId: 'c', priceCoins: 200, rarity: 'epic', soldCount: 9 });
  const d = item({ itemId: 'd', priceCoins: 100, rarity: 'rare', soldCount: 5, compareAtCoins: 200 });
  const list = [a, b, c, d];

  it('popular: soldCount desc, ties keep input order', () => {
    expect(ids(sortItems(list, 'popular'))).toEqual(['c', 'a', 'd', 'b']);
  });
  it('new: startsAt / createdAt desc, items without a time last in input order', () => {
    expect(ids(sortItems(list, 'new'))).toEqual(['b', 'a', 'c', 'd']);
  });
  it('price asc / desc, stable on ties', () => {
    expect(ids(sortItems(list, 'price_asc'))).toEqual(['b', 'd', 'c', 'a']);
    expect(ids(sortItems(list, 'price_desc'))).toEqual(['a', 'c', 'b', 'd']);
  });
  it('rarity: rarest first', () => {
    expect(ids(sortItems(list, 'rarity'))).toEqual(['b', 'c', 'a', 'd']);
  });
  it('discount: biggest real discount first', () => {
    expect(ids(sortItems(list, 'discount'))[0]).toBe('d');
  });
  it('default keeps the order and never mutates the input', () => {
    const copy = [...list];
    expect(ids(sortItems(list, 'default'))).toEqual(['a', 'b', 'c', 'd']);
    sortItems(list, 'price_asc');
    expect(list).toEqual(copy);
  });
});

describe('filterItems', () => {
  const list = [
    item({ itemId: 'f1', name: 'Neon Ring', type: 'frame', rarity: 'epic' }),
    item({ itemId: 'f2', name: 'Gold Ring', type: 'frame', rarity: 'legendary', owned: true }),
    item({ itemId: 't1', name: 'Sunset', type: 'theme', rarity: 'epic', description: 'warm ring of light' }),
  ];
  it('query matches name, description, type label and rarity (case-insensitive)', () => {
    expect(ids(filterItems(list, { query: 'RING' }))).toEqual(['f1', 'f2', 't1']);
    expect(ids(filterItems(list, { query: 'profile themes' }))).toEqual(['t1']);
    expect(ids(filterItems(list, { query: 'legendary' }))).toEqual(['f2']);
  });
  it('rarity, type and hideOwned combine', () => {
    expect(ids(filterItems(list, { rarity: 'epic' }))).toEqual(['f1', 't1']);
    expect(ids(filterItems(list, { type: 'frame', hideOwned: true }))).toEqual(['f1']);
    expect(ids(filterItems(list, {}))).toEqual(['f1', 'f2', 't1']);
  });
  it('isFiltered', () => {
    expect(isFiltered({ query: '  ' })).toBe(false);
    expect(isFiltered({ hideOwned: true })).toBe(true);
    expect(isFiltered({ rarity: 'rare' })).toBe(true);
  });
  it('presentTypes: tile labels and live counts', () => {
    expect(presentTypes(list)).toEqual([
      { type: 'frame', label: 'Frames', count: 2 },
      { type: 'theme', label: 'Themes', count: 1 },
    ]);
  });
});

describe('rankTrending', () => {
  it('only sold items, desc, ties by rarity then name; ranks are 1-based', () => {
    const r = rankTrending([
      item({ itemId: 'z', name: 'Zed', soldCount: 3, rarity: 'rare' }),
      item({ itemId: 'none', soldCount: 0 }),
      item({ itemId: 'nul' }),
      item({ itemId: 'm', name: 'Mid', soldCount: 3, rarity: 'mythic' }),
      item({ itemId: 'a', name: 'Alpha', soldCount: 3, rarity: 'rare' }),
      item({ itemId: 'top', soldCount: 40 }),
    ]);
    expect(r.map((x) => [x.item.itemId, x.rank])).toEqual([['top', 1], ['m', 2], ['a', 3], ['z', 4]]);
  });
  it('empty when nothing has sold', () => {
    expect(rankTrending([item({ itemId: 'a' }), item({ itemId: 'b', soldCount: 0 })])).toEqual([]);
  });
  it('rankMedal', () => {
    expect([1, 2, 3, 4].map(rankMedal)).toEqual(['gold', 'silver', 'bronze', null]);
  });
});

describe('dealItems', () => {
  it('real discounts only, not owned, not ended; biggest % first, then soonest end', () => {
    const list = [
      item({ itemId: 'none', priceCoins: 100 }),
      item({ itemId: 'fake', priceCoins: 100, compareAtCoins: 90 }),
      item({ itemId: 'owned', priceCoins: 50, compareAtCoins: 100, owned: true }),
      item({ itemId: 'ended', priceCoins: 50, compareAtCoins: 100, endsAt: NOW - 1 }),
      item({ itemId: 'half_late', priceCoins: 50, compareAtCoins: 100, endsAt: NOW + 5 * DAY }),
      item({ itemId: 'half_soon', priceCoins: 50, compareAtCoins: 100, endsAt: NOW + DAY }),
      item({ itemId: 'half_open', priceCoins: 50, compareAtCoins: 100 }),
      item({ itemId: 'quarter', priceCoins: 75, compareAtCoins: 100 }),
    ];
    const d = dealItems(list, NOW);
    expect(d.map((x) => x.item.itemId)).toEqual(['half_soon', 'half_late', 'half_open', 'quarter']);
    expect(d[0]).toMatchObject({ percent: 50, endsAt: NOW + DAY });
    expect(d[2].endsAt).toBeNull();
    expect(d[3].percent).toBe(25);
  });
});

describe('physicalDeals', () => {
  const prod = (id: string, o: { featured?: boolean; price?: number; was?: number | null; inStock?: boolean }) => ({
    id, featured: !!o.featured, priceCoins: o.price ?? 100, compareAtCoins: o.was ?? null, variants: [{ inStock: o.inStock ?? true }],
  });
  it('in stock only; discounted (biggest first) then featured; plain products left out', () => {
    const out = physicalDeals([
      prod('plain', {}),
      prod('feat', { featured: true }),
      prod('small', { price: 90, was: 100 }),
      prod('big', { price: 50, was: 100, featured: true }),
      prod('oos', { price: 10, was: 100, inStock: false }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['big', 'small', 'feat']);
  });
  it('null / empty', () => {
    expect(physicalDeals(null)).toEqual([]);
  });
});

describe('categories', () => {
  const store = [
    item({ itemId: 'f1', type: 'frame' }),
    item({ itemId: 't1', type: 'theme' }),
    item({ itemId: 't2', type: 'theme' }),
    item({ itemId: 's1', type: 'sticker' }),
  ];
  it('categorySummary: listings first (most first), soon separate, More dropped', () => {
    const s = categorySummary(categoryTiles(store, { enabled: true, count: 4 }));
    expect(s.available.map((t) => t.key)).toEqual(['theme', 'frame', 'gifts']);
    expect(s.soon.map((t) => t.key)).toEqual(['badge', 'title', 'vs', 'victory', 'effect', 'emotes', 'sound']);
    expect(s.total).toBe(3);
    expect([...s.available, ...s.soon].some((t) => t.key === 'more')).toBe(false);
  });
  it('categorySummary: gifts off → gifts is soon', () => {
    const s = categorySummary(categoryTiles(store, { enabled: false, count: 4 }));
    expect(s.available.map((t) => t.key)).toEqual(['theme', 'frame']);
    expect(s.soon.map((t) => t.key)).toContain('gifts');
  });
  it('extraCategories: live types without a tile', () => {
    const tiles = categoryTiles(store, { enabled: false, count: 0 });
    expect(extraCategories(store, tiles).map((c) => [c.type, c.count])).toEqual([['sticker', 1]]);
  });
  it('tileKeyForType / typeTitle', () => {
    expect(tileKeyForType('frame')).toBe('frame');
    expect(tileKeyForType('sticker')).toBe('more');
    expect(tileKeyForType(undefined)).toBe('more');
    expect(typeTitle('theme')).toBe('Profile Themes');
    expect(typeTitle('gizmo')).toBe('Gizmo');
    expect(typeTitle('')).toBe('Items');
  });
});

describe('bundles', () => {
  const b1 = bundle({ id: 'b1', priceDiamonds: 300 });
  const b2 = bundle({ id: 'b2', priceDiamonds: 100, purchased: true });
  const b3 = bundle({ id: 'b3', priceDiamonds: 300, ownedCount: 1 });
  const b4 = bundle({ id: 'b4', priceDiamonds: 50 });
  const list = [b1, b2, b3, b4];
  const bids = (xs: ShopBundleDef[]) => xs.map((b) => b.id);

  it('sortBundles: admin order, price asc / desc stable on ties', () => {
    expect(BUNDLE_SORTS.map((s) => s.key)).toEqual(['recommended', 'price_asc', 'price_desc']);
    expect(bids(sortBundles(list, 'recommended'))).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(bids(sortBundles(list, 'price_asc'))).toEqual(['b4', 'b2', 'b1', 'b3']);
    expect(bids(sortBundles(list, 'price_desc'))).toEqual(['b1', 'b3', 'b2', 'b4']);
  });
  it('filterBundles: owned = bought or every item owned', () => {
    expect(bundleOwned(b3)).toBe(true);
    expect(bids(filterBundles(list, 'all'))).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(bids(filterBundles(list, 'owned'))).toEqual(['b2', 'b3']);
    expect(bids(filterBundles(list, 'available'))).toEqual(['b1', 'b4']);
  });
});

describe('countLabel', () => {
  it('singular / plural', () => {
    expect(countLabel(1)).toBe('1 item');
    expect(countLabel(24)).toBe('24 items');
    expect(countLabel(2, 'bundle', 'bundles')).toBe('2 bundles');
  });
});
