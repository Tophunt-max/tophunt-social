import { describe, expect, it } from 'vitest';
import {
  NEW_WINDOW_MS,
  NO_FILTER,
  balanceAfter,
  buildRails,
  deriveCategories,
  featuredView,
  filterDigital,
  giftsCategory,
  isFutureDeadline,
  isShort,
  legendaryCollection,
  limitedEdition,
  newArrivals,
  parseShopTab,
  popular,
  presentRarities,
  purchaseErrorView,
  trendingGrid,
  type ShopItem,
} from '@/src/lib/shopModel';
import { isCrownRarity, rarityColor, rarityRank } from '@/src/lib/progression';
import { RARITY_TOKENS, gridCellWidth, gridColumns, rarityRankOf, rarityToken } from '@/src/theme/tophuntTokens';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

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

describe('rarity tokens', () => {
  it('include mythic above legendary, in rank order', () => {
    const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    expect(Object.keys(RARITY_TOKENS)).toEqual(order);
    expect(order.map((r) => RARITY_TOKENS[r as keyof typeof RARITY_TOKENS].rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rarityToken('mythic')).toMatchObject({ label: 'Mythic', glow: true });
    expect(rarityToken('rare').glow).toBe(false);
    expect(rarityToken('epic').glow).toBe(true);
  });

  it('treat unknown rarities as common for display and rank them lowest', () => {
    expect(rarityToken('ultra').id).toBe('common');
    expect(rarityRankOf('ultra')).toBe(0);
    expect(rarityRankOf(null)).toBe(0);
  });
});

describe('progression rarity helpers', () => {
  it('know mythic: its own colour, rank above legendary, crown treatment', () => {
    expect(rarityColor('mythic')).not.toBe(rarityColor('common'));
    expect(rarityRank('mythic')).toBeGreaterThan(rarityRank('legendary'));
    expect(isCrownRarity('mythic')).toBe(true);
    expect(isCrownRarity('legendary')).toBe(true);
    expect(isCrownRarity('epic')).toBe(false);
    expect(rarityRank('ultra')).toBe(0);
  });
});

describe('gridColumns', () => {
  it('is 2 on phones, 3 on tablets (>=700), 4 on desktop (>=1100)', () => {
    expect(gridColumns(320)).toBe(2);
    expect(gridColumns(699)).toBe(2);
    expect(gridColumns(700)).toBe(3);
    expect(gridColumns(1099)).toBe(3);
    expect(gridColumns(1100)).toBe(4);
    expect(gridColumns(1920)).toBe(4);
  });

  it('cell width fills the row exactly (never overflows)', () => {
    for (const w of [360, 412, 768, 1200]) {
      const cols = gridColumns(w);
      const cell = gridCellWidth(w, cols, 12, 16);
      expect(cell * cols + 12 * (cols - 1) + 32).toBeLessThanOrEqual(w);
    }
  });
});

describe('parseShopTab', () => {
  it('honours ?tab=physical|digital and defaults to the overview', () => {
    expect(parseShopTab('physical', true, true)).toBe('physical');
    expect(parseShopTab('digital', true, true)).toBe('digital');
    expect(parseShopTab(['physical'], true, true)).toBe('physical');
    expect(parseShopTab(undefined, true, true)).toBe('shop');
    expect(parseShopTab('bogus', true, false)).toBe('shop');
    expect(parseShopTab(undefined, false, true)).toBe('physical');
  });
});

describe('categories', () => {
  it('only lists types present in the store, in display order, with live counts', () => {
    const cats = deriveCategories([
      item('t1', { type: 'title' }),
      item('f1'),
      item('f2', { rarity: 'mythic' }),
      item('b1', { type: 'badge' }),
      item('x1', { type: 'hologram' }),
    ]);
    expect(cats.map((c) => [c.type, c.label, c.count])).toEqual([
      ['frame', 'Avatar Frames', 2],
      ['badge', 'Badges', 1],
      ['title', 'Titles', 1],
      ['hologram', 'Hologram', 1],
    ]);
    // Artwork sample is the rarest item of the type.
    expect(cats[0].sample.itemId).toBe('f2');
    expect(deriveCategories([])).toEqual([]);
  });

  it('shows Virtual Gifts only when gifts are on and the catalogue has gifts', () => {
    expect(giftsCategory(true, 6)).toEqual({ label: 'Virtual Gifts', count: 6 });
    expect(giftsCategory(true, 0)).toBeNull();
    expect(giftsCategory(false, 6)).toBeNull();
    expect(giftsCategory(true, undefined)).toBeNull();
  });
});

describe('rails', () => {
  it('New arrivals uses startsAt, else createdAt, within 30 days, newest first; omits items with no signal', () => {
    const items = [
      item('old', { createdAt: NOW - NEW_WINDOW_MS - DAY }),
      item('a', { createdAt: NOW - 2 * DAY }),
      item('b', { startsAt: NOW - DAY, createdAt: NOW - 90 * DAY }),
      item('future', { startsAt: NOW + DAY }),
      item('none'),
    ];
    expect(newArrivals(items, NOW).map((i) => i.itemId)).toEqual(['b', 'a']);
    expect(newArrivals([item('none')], NOW)).toEqual([]);
  });

  it('Popular is soldCount > 0 only, most sold first', () => {
    const items = [item('a', { soldCount: 3 }), item('b', { soldCount: 0 }), item('c', { soldCount: 9 }), item('d')];
    expect(popular(items).map((i) => i.itemId)).toEqual(['c', 'a']);
  });

  it('Limited edition needs real stock left or a future sale end', () => {
    const items = [
      item('stock', { remaining: 4 }),
      item('soldout', { remaining: 0 }),
      item('ends', { endsAt: NOW + DAY }),
      item('ended', { endsAt: NOW - 1 }),
      item('plain'),
    ];
    expect(limitedEdition(items, NOW).map((i) => i.itemId)).toEqual(['ends', 'stock']);
    expect(isFutureDeadline(NOW + 1, NOW)).toBe(true);
    expect(isFutureDeadline(NOW, NOW)).toBe(false);
    expect(isFutureDeadline('soon', NOW)).toBe(false);
  });

  it('Legendary collection is legendary + mythic, mythic first', () => {
    const items = [item('l', { rarity: 'legendary' }), item('e', { rarity: 'epic' }), item('m', { rarity: 'mythic' })];
    expect(legendaryCollection(items).map((i) => i.itemId)).toEqual(['m', 'l']);
  });

  it('buildRails omits empty rails and adds "Sabse rare items" only without a banner or a Legendary rail', () => {
    const plain = [item('a', { rarity: 'rare' }), item('b', { rarity: 'epic' })];
    expect(buildRails(plain, NOW, { hasFeatured: true })).toEqual([]);
    const fallback = buildRails(plain, NOW, { hasFeatured: false });
    expect(fallback.map((r) => r.id)).toEqual(['rarest']);
    expect(fallback[0].items.map((i) => i.itemId)).toEqual(['b', 'a']);
    const rich = buildRails([item('m', { rarity: 'mythic', soldCount: 2, createdAt: NOW - DAY })], NOW, { hasFeatured: false });
    expect(rich.map((r) => r.id)).toEqual(['new', 'popular', 'legendary']);
  });

  it('calls the grid "Trending" only when something has sold', () => {
    expect(trendingGrid([item('a'), item('b')]).title).toBe('Shop ke items');
    const t = trendingGrid([item('a', { soldCount: 1 }), item('b', { soldCount: 5 })]);
    expect(t.title).toBe('Trending');
    expect(t.items.map((i) => i.itemId)).toEqual(['b', 'a']);
  });
});

describe('featured banner', () => {
  const store = [item('a'), item('b', { rarity: 'mythic' }), item('c')];
  const cfg = { badge: 'Mythic Drop', title: 'Mythic Week', subtitle: '', itemIds: ['b', 'zz', 'a'], heroItemId: 'b', endsAt: NOW + DAY, ctaLabel: 'Explore Now' };

  it('shows only live featured items, keeps the admin order, and the hero', () => {
    const v = featuredView(cfg, store, NOW)!;
    expect(v.itemIds).toEqual(['b', 'a']);
    expect(v.hero.itemId).toBe('b');
    expect(v.endsAt).toBe(NOW + DAY);
  });

  it('is null without a config, after the end, without a title, or with no live item', () => {
    expect(featuredView(undefined, store, NOW)).toBeNull();
    expect(featuredView({ ...cfg, endsAt: NOW }, store, NOW)).toBeNull();
    expect(featuredView({ ...cfg, title: ' ' }, store, NOW)).toBeNull();
    expect(featuredView({ ...cfg, itemIds: ['zz'] }, store, NOW)).toBeNull();
    expect(featuredView({ ...cfg, itemIds: 'a' }, store, NOW)).toBeNull();
  });

  it('has no countdown without a valid end, and falls back to the first live item as hero', () => {
    const v = featuredView({ ...cfg, endsAt: null, heroItemId: 'zz' }, store, NOW)!;
    expect(v.endsAt).toBeNull();
    expect(v.hero.itemId).toBe('b');
    expect(featuredView({ ...cfg, endsAt: 'tomorrow' }, store, NOW)!.endsAt).toBeNull();
    expect(featuredView({ ...cfg, badge: '', ctaLabel: '' }, store, NOW)).toMatchObject({ badge: 'Legendary Drop', ctaLabel: 'Explore Now' });
  });
});

describe('digital filters', () => {
  const items = [
    item('f1', { name: 'Neon Frame', rarity: 'epic' }),
    item('t1', { type: 'theme', name: 'Galaxy', rarity: 'rare' }),
    item('b1', { type: 'badge', name: 'Crown Badge', rarity: 'mythic' }),
  ];
  it('filters by type, rarity, search and featured ids (in featured order)', () => {
    expect(filterDigital(items, { ...NO_FILTER, type: 'theme' }).map((i) => i.itemId)).toEqual(['t1']);
    expect(filterDigital(items, { ...NO_FILTER, rarity: 'mythic' }).map((i) => i.itemId)).toEqual(['b1']);
    expect(filterDigital(items, { ...NO_FILTER, query: 'neon' }).map((i) => i.itemId)).toEqual(['f1']);
    expect(filterDigital(items, { ...NO_FILTER, query: 'profile themes' }).map((i) => i.itemId)).toEqual(['t1']);
    expect(filterDigital(items, { ...NO_FILTER, ids: ['b1', 'f1'] }).map((i) => i.itemId)).toEqual(['b1', 'f1']);
    expect(presentRarities(items)).toEqual(['rare', 'epic', 'mythic']);
  });
});

describe('purchase', () => {
  it('never shows a fake balance or blocks on an unknown one', () => {
    expect(balanceAfter(100, 30, true)).toBe(70);
    expect(balanceAfter(0, 30, false)).toBeNull();
    expect(isShort(10, 30, true)).toBe(true);
    expect(isShort(0, 30, false)).toBe(false);
  });

  it('maps server reasons; only a network failure retries with the same request id', () => {
    expect(purchaseErrorView({ status: 412, reason: 'insufficient_coins' }).kind).toBe('insufficient');
    expect(purchaseErrorView({ status: 409, reason: 'already_owned' }).kind).toBe('owned');
    expect(purchaseErrorView({ status: 412, reason: 'price_changed' })).toMatchObject({ kind: 'price_changed', refresh: true, retrySameRequest: false });
    expect(purchaseErrorView({ status: 404, reason: 'item_unavailable' })).toMatchObject({ kind: 'unavailable', refresh: true });
    expect(purchaseErrorView({ status: 412, reason: 'store_disabled' }).kind).toBe('store_closed');
    expect(purchaseErrorView({ status: 403, reason: 'item_revoked' }).kind).toBe('revoked');
    expect(purchaseErrorView({ message: 'Network request failed' })).toMatchObject({ kind: 'network', retrySameRequest: true });
    expect(purchaseErrorView({ status: 500, message: 'boom' })).toMatchObject({ kind: 'other', message: 'boom', retrySameRequest: false });
  });
});
