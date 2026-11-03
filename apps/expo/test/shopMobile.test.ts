import { describe, expect, it } from 'vitest';
import {
  HERO_M,
  MOBILE_BREAKPOINT,
  MOCK_M,
  MOCK_M_INNER,
  cellWidth,
  isMobileShop,
  mfont,
  mobileScale,
  px,
} from '@/src/components/shop/premium/mock';
import {
  NO_FILTER,
  UPGRADE_RARITIES,
  categoryTiles,
  collectionTiles,
  dealTimerLabel,
  dealsSummary,
  discountOf,
  featuredCollection,
  filterDigital,
  mobileCategoryTiles,
  mobileCollectionTiles,
  physicalPicks,
  showUpgradeBanner,
  trendingItems,
  type ShopItem,
} from '@/src/lib/shopModel';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const item = (id: string, over: Partial<ShopItem> = {}): ShopItem => ({
  itemId: id,
  type: 'frame',
  name: id,
  description: '',
  rarity: 'common',
  priceCoins: 50,
  remaining: null,
  endsAt: null,
  owned: false,
  ...over,
});

describe('mobile shop scale', () => {
  it('u = width / 340 (390 px phone ≈ 1.15)', () => {
    expect(mobileScale(340)).toBe(1);
    expect(mobileScale(390)).toBeCloseTo(1.147, 3);
    expect(mobileScale(360)).toBeCloseTo(360 / 340);
    expect(mobileScale(0)).toBe(1);
    expect(mobileScale(Number.NaN)).toBe(1);
  });

  it('phones use the mobile mock below 700, the desktop mock from 700', () => {
    expect(isMobileShop(390)).toBe(true);
    expect(isMobileShop(699)).toBe(true);
    expect(isMobileShop(MOBILE_BREAKPOINT)).toBe(false);
    expect(isMobileShop(1024)).toBe(false);
    expect(isMobileShop(0)).toBe(false);
  });

  it('fonts are ref * u with no floor', () => {
    expect(mfont(8.5, 1)).toBe(8.5);
    expect(mfont(8.5, 390 / 340)).toBe(9.8);
    expect(mfont(14, 0.9)).toBe(12.6);
  });

  it('grid rows span the inner width (12 px margins)', () => {
    expect(MOCK_M_INNER).toBe(316);
    expect(HERO_M.w).toBe(316);
    const u = mobileScale(390);
    const inner = 390 - px(12, u) * 2;
    for (const g of [MOCK_M.cat, MOCK_M.feat, MOCK_M.trend, MOCK_M.phys, MOCK_M.col]) {
      const gap = px(g.gap, u);
      const w = cellWidth(inner, g.cols, gap);
      expect(w * g.cols + gap * (g.cols - 1)).toBeLessThanOrEqual(inner);
      expect(w * g.cols + gap * (g.cols - 1)).toBeGreaterThan(inner - g.cols);
    }
  });
});

describe('discounts (compare-at price)', () => {
  it('discountOf: floor percent, 0 without a real compare-at price', () => {
    expect(discountOf({ priceCoins: 30, compareAtCoins: 40 })).toBe(25);
    expect(discountOf({ priceCoins: 2, compareAtCoins: 3 })).toBe(33);
    expect(discountOf({ priceCoins: 999, compareAtCoins: 1000 })).toBe(0);
    expect(discountOf({ priceCoins: 30, compareAtCoins: 30 })).toBe(0);
    expect(discountOf({ priceCoins: 30, compareAtCoins: 20 })).toBe(0);
    expect(discountOf({ priceCoins: 30, compareAtCoins: null })).toBe(0);
    expect(discountOf({ priceCoins: 30 })).toBe(0);
  });

  it('dealsSummary: nothing discounted → no items, 0 %, no timer', () => {
    const s = dealsSummary([item('a'), item('b', { compareAtCoins: 50 })], NOW);
    expect(s).toEqual({ items: [], maxPercent: 0, endsAt: null });
  });

  it('dealsSummary: max percent (rounded down), biggest discount first, owned left out', () => {
    const s = dealsSummary([
      item('a', { priceCoins: 30, compareAtCoins: 40 }), // 25
      item('b', { priceCoins: 67, compareAtCoins: 100 }), // 33
      item('c', { priceCoins: 10, compareAtCoins: 100, owned: true }), // owned: ignored
      item('d'),
    ], NOW);
    expect(s.items.map((i) => i.itemId)).toEqual(['b', 'a']);
    expect(s.maxPercent).toBe(33);
    expect(s.endsAt).toBeNull();
  });

  it('dealsSummary: soonest real end; past ends are ignored', () => {
    const s = dealsSummary([
      item('a', { priceCoins: 30, compareAtCoins: 40, endsAt: NOW + 5 * HOUR }),
      item('b', { priceCoins: 30, compareAtCoins: 40, endsAt: NOW + 2 * HOUR }),
      item('c', { priceCoins: 10, compareAtCoins: 100, endsAt: NOW - HOUR }), // sale over
      item('d', { priceCoins: 30, compareAtCoins: 60 }),
    ], NOW);
    expect(s.items.map((i) => i.itemId)).toEqual(['d', 'a', 'b']);
    expect(s.maxPercent).toBe(50);
    expect(s.endsAt).toBe(NOW + 2 * HOUR);
  });

  it('the deals filter shows only discounted items', () => {
    const items = [item('a', { priceCoins: 30, compareAtCoins: 40 }), item('b')];
    expect(filterDigital(items, { ...NO_FILTER, discounted: true }).map((i) => i.itemId)).toEqual(['a']);
    expect(filterDigital(items, NO_FILTER)).toHaveLength(2);
  });
});

describe('deal timer', () => {
  it('HH:MM:SS within 7 days (hours past 24 allowed)', () => {
    expect(dealTimerLabel(NOW + 12 * HOUR + 36 * 60_000 + 59_000, NOW)).toBe('12:36:59');
    expect(dealTimerLabel(NOW + 5_000, NOW)).toBe('00:00:05');
    expect(dealTimerLabel(NOW + 3 * DAY + HOUR, NOW)).toBe('73:00:00');
    expect(dealTimerLabel(NOW + 7 * DAY, NOW)).toBe('168:00:00');
  });

  it('"Xd Yh" beyond 7 days; nothing without a real future end', () => {
    expect(dealTimerLabel(NOW + 9 * DAY + 5 * HOUR + 10_000, NOW)).toBe('9d 5h');
    expect(dealTimerLabel(NOW, NOW)).toBeNull();
    expect(dealTimerLabel(NOW - 1, NOW)).toBeNull();
    expect(dealTimerLabel(null, NOW)).toBeNull();
    expect(dealTimerLabel('soon', NOW)).toBeNull();
  });
});

describe('mobile layout pickers', () => {
  const store = [
    ...Array.from({ length: 6 }, (_, k) => item(`leg${k}`, { rarity: 'legendary', soldCount: k })),
    ...Array.from({ length: 6 }, (_, k) => item(`epic${k}`, { rarity: 'epic', type: 'theme' })),
  ];

  it('3 featured, 5 trending', () => {
    expect(featuredCollection(store, null, MOCK_M.feat.cols)).toHaveLength(3);
    expect(trendingItems(store, MOCK_M.trend.cols).items).toHaveLength(5);
  });

  it('4 physical products, in-stock first', () => {
    const p = (id: string, inStock: boolean) => ({ id, featured: false, variants: [{ inStock }] });
    const list = [p('a', false), p('b', true), p('c', true), p('d', true), p('e', true)];
    expect(physicalPicks(list, MOCK_M.phys.cols).map((x) => x.id)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('5 collection tiles: Frames, Themes, Badges, Titles, VS Effects, counts as today', () => {
    const all = collectionTiles([{ type: 'frame', owned: true }, { type: 'frame', owned: true }, { type: 'theme', owned: true }]);
    const tiles = mobileCollectionTiles(all.tiles);
    expect(tiles.map((t) => t.key)).toEqual(['frame', 'theme', 'badge', 'title', 'vs']);
    expect(tiles.map((t) => t.count)).toEqual([2, 1, 0, 0, 0]);
    expect(tiles).toHaveLength(MOCK_M.col.cols);
  });

  it('category grid: 2 rows of 5, Sound FX dropped', () => {
    const tiles = mobileCategoryTiles(categoryTiles(store, { enabled: false, count: 0 }));
    expect(tiles).toHaveLength(10);
    expect(tiles.map((t) => t.key)).toEqual(['frame', 'theme', 'badge', 'title', 'vs', 'victory', 'effect', 'gifts', 'emotes', 'more']);
  });
});

describe('upgrade banner', () => {
  it('shows only when the store is on and has an Epic+ item', () => {
    expect(UPGRADE_RARITIES).toEqual(['epic', 'legendary', 'mythic']);
    expect(showUpgradeBanner(true, [item('a', { rarity: 'epic' })])).toBe(true);
    expect(showUpgradeBanner(true, [item('a', { rarity: 'mythic' })])).toBe(true);
    expect(showUpgradeBanner(true, [item('a', { rarity: 'rare' }), item('b')])).toBe(false);
    expect(showUpgradeBanner(false, [item('a', { rarity: 'legendary' })])).toBe(false);
    expect(showUpgradeBanner(true, [])).toBe(false);
  });
});
