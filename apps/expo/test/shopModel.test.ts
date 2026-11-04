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
  categoryTiles,
  featuredCollection,
  trendingItems,
  heroSlides,
  countdownParts,
  cardTag,
  collectionTiles,
  physicalPicks,
  hotDeals,
  withWishlist,
  dealsBlock,
  heroFallbackItems,
  heroTitleLines,
  typeLine,
  popularCollections,
  POPULAR_COLLECTIONS_MAX,
  bundleAvailable,
  bundleDiscount,
  bundleErrorView,
  bundleItemsLine,
  bundleOwnedNote,
  bundleState,
  bundleStockLabel,
  bundleTypeLine,
  collectionCards,
  collectionItems,
  isUnknownActionError,
  normalizeShopCollections,
  visibleBundles,
  type ShopBundleDef,
  type ShopCollectionDef,
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

describe('reference home: category tiles', () => {
  const store = [item('f1'), item('f2'), item('t1', { type: 'theme' }), item('e1', { type: 'effect' })];

  it('draws every tile in reference order; only real, stocked ones navigate, the rest are "soon"', () => {
    const tiles = categoryTiles(store, { enabled: true, count: 3 });
    expect(tiles.map((t) => t.label)).toEqual(['Frames', 'Themes', 'Badges', 'Titles', 'VS Effects', 'Victory FX', 'Profile FX', 'Gifts', 'Emotes', 'Sound FX', 'More']);
    const by = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(by.frame).toMatchObject({ target: 'type', type: 'frame', count: 2 });
    expect(by.theme.target).toBe('type');
    expect(by.effect).toMatchObject({ target: 'type', type: 'effect', count: 1 });
    // Real types with no listings, and types that do not exist yet, are "soon" (full colour, toast on tap).
    for (const k of ['badge', 'title', 'vs', 'victory', 'emotes', 'sound']) expect(by[k]).toMatchObject({ target: null, soon: true });
    for (const k of ['frame', 'theme', 'effect', 'gifts', 'more']) expect(by[k].soon).toBe(false);
    expect(by.gifts.target).toBe('gifts');
    expect(by.more.target).toBe('all');
    // Mock accents.
    expect(by.frame.accent).toBe('#F59E0B');
    expect(by.theme.accent).toBe('#8B5CF6');
    expect(by.gifts.accent).toBe('#EC4899');
    expect(by.emotes.accent).toBe('#38BDF8');
    expect(by.sound.accent).toBe('#C026D3');
  });

  it('gifts need the feature on and a non-empty catalogue; More needs any item', () => {
    expect(categoryTiles(store, { enabled: false, count: 3 }).find((t) => t.key === 'gifts')).toMatchObject({ target: null, soon: true });
    expect(categoryTiles(store, { enabled: true, count: 0 }).find((t) => t.key === 'gifts')!.soon).toBe(true);
    // Profile FX is "soon" when the store has no effect items.
    expect(categoryTiles([item('f1')], { enabled: true, count: 1 }).find((t) => t.key === 'effect')!.soon).toBe(true);
    expect(categoryTiles([], { enabled: true, count: 1 }).find((t) => t.key === 'more')!.target).toBeNull();
  });
});

describe('reference home: featured collection, trending, hero', () => {
  const store = [
    item('c1'),
    item('e1', { rarity: 'epic', priceCoins: 100 }),
    item('l1', { rarity: 'legendary', priceCoins: 300 }),
    item('m1', { rarity: 'mythic', priceCoins: 200 }),
    item('e2', { rarity: 'epic', priceCoins: 200 }),
  ];

  it('featured collection = drop items, else legendary+ then epic, max 8', () => {
    expect(featuredCollection(store, null).map((i) => i.itemId)).toEqual(['m1', 'l1', 'e2', 'e1']);
    const f = featuredView({ title: 'Drop', itemIds: ['e1', 'c1'] }, store, NOW);
    expect(featuredCollection(store, f).map((i) => i.itemId)).toEqual(['e1', 'c1']);
    const many = Array.from({ length: 12 }, (_, n) => item(`x${n}`, { rarity: 'epic' }));
    expect(featuredCollection(many, null)).toHaveLength(8);
    expect(featuredCollection([item('c')], null)).toEqual([]);
  });

  it('trending only when something sold, else "Shop Items" in store order', () => {
    expect(trendingItems(store)).toMatchObject({ title: 'Shop Items', trending: false });
    expect(trendingItems(store).items.map((i) => i.itemId)).toEqual(['c1', 'e1', 'l1', 'm1', 'e2']);
    const sold = [...store, item('s1', { soldCount: 4 }), item('s2', { soldCount: 9 })];
    const t = trendingItems(sold, 6);
    expect(t).toMatchObject({ title: 'Trending Items', trending: true });
    expect(t.items.slice(0, 2).map((i) => i.itemId)).toEqual(['s2', 's1']);
    expect(t.items).toHaveLength(6);
  });

  it('hero: the drop (hero first, real end, its copy on every slide)', () => {
    const f = featuredView({ title: 'Mythic Week', badge: 'Legendary Drop', itemIds: ['e1', 'm1'], heroItemId: 'm1', endsAt: NOW + DAY }, store, NOW);
    const h = heroSlides(store, f)!;
    expect(h.mode).toBe('drop');
    expect(h.slides.map((s) => s.item?.itemId)).toEqual(['m1', 'e1']);
    expect(h.itemIds).toEqual(['e1', 'm1']);
    expect(h.endsAt).toBe(NOW + DAY);
    expect(h.slides[0]).toMatchObject({ badge: 'LEGENDARY DROP', title: 'MYTHIC', caps: 'WEEK', ctaLabel: 'Explore Now' });
    // No admin subtitle: a line from the real item types.
    expect(h.slides[0].subtitle).toBe('Frames');
    expect(heroSlides(store, featuredView({ title: 'X', subtitle: 'Admin line', itemIds: ['e1'] }, store, NOW))!.slides[0].subtitle).toBe('Admin line');
  });

  it('hero fallback: top items by rarity (mythic, legendary, epic, rare), max 4, honest copy, no timer', () => {
    const shop = [
      item('c1'),
      item('r1', { rarity: 'rare', priceCoins: 50 }),
      item('e1', { rarity: 'epic', priceCoins: 100, type: 'theme' }),
      item('l1', { rarity: 'legendary', priceCoins: 300, name: 'Golden Crown' }),
      item('m1', { rarity: 'mythic', priceCoins: 200, name: 'Nebula' }),
      item('e2', { rarity: 'epic', priceCoins: 200 }),
      item('u1', { rarity: 'uncommon' }),
    ];
    expect(heroFallbackItems(shop).map((i) => i.itemId)).toEqual(['m1', 'l1', 'e2', 'e1']);
    expect(heroFallbackItems([item('c'), item('u', { rarity: 'uncommon' })])).toEqual([]);
    const fb = heroSlides(shop, null)!;
    expect(fb).toMatchObject({ mode: 'collection', endsAt: null });
    expect(fb.slides).toHaveLength(4);
    expect(fb.itemIds).toEqual(['m1', 'l1', 'e2', 'e1']);
    expect(fb.slides[0]).toMatchObject({ badge: 'MYTHIC COLLECTION', title: 'NEBULA', caps: 'AVATAR FRAMES', ctaLabel: 'Explore Collection' });
    expect(fb.slides[1]).toMatchObject({ badge: 'LEGENDARY COLLECTION', title: 'GOLDEN', caps: 'CROWN' });
    for (const s of fb.slides) expect(`${s.badge} ${s.title} ${s.caps} ${s.subtitle} ${s.ctaLabel}`.toLowerCase()).not.toMatch(/drop|limited/);
    expect(fb.slides[0].subtitle).toBe('Frames • Themes');
    // Only rare items: still a slider.
    expect(heroSlides([item('r', { rarity: 'rare' })], null)!.slides[0].badge).toBe('RARE COLLECTION');
    expect(heroSlides([item('c')], null)).toBeNull();
    expect(heroSlides([], null)).toBeNull();
  });

  it('hero title lines split the words; one word takes the type as caps', () => {
    expect(heroTitleLines('Legendary Collection', 'x')).toEqual({ title: 'LEGENDARY', caps: 'COLLECTION' });
    expect(heroTitleLines('Neon Night Drop', 'x')).toEqual({ title: 'NEON NIGHT', caps: 'DROP' });
    expect(heroTitleLines('Nebula', 'Avatar Frames')).toEqual({ title: 'NEBULA', caps: 'AVATAR FRAMES' });
    expect(typeLine([item('a', { type: 'title' }), item('b'), item('c', { type: 'title' })])).toBe('Frames • Titles');
  });
});

describe('reference home: countdown parts and card tags', () => {
  it('splits time left into D/H/M/S; null without a real deadline; clamps at 0', () => {
    expect(countdownParts(NOW + 2 * DAY + 3 * 3600_000 + 4 * 60_000 + 5_000, NOW)).toEqual({ d: 2, h: 3, m: 4, s: 5, ended: false });
    expect(countdownParts(NOW - 1000, NOW)).toEqual({ d: 0, h: 0, m: 0, s: 0, ended: true });
    expect(countdownParts(null, NOW)).toBeNull();
    expect(countdownParts(0, NOW)).toBeNull();
    expect(countdownParts('soon', NOW)).toBeNull();
  });

  it('tags NEW, then LIMITED (real stock / sale end only), else rarity', () => {
    expect(cardTag(item('a', { createdAt: NOW - DAY, remaining: 3 }), NOW)).toEqual({ kind: 'new', label: 'NEW' });
    expect(cardTag(item('b', { createdAt: NOW - 40 * DAY, remaining: 3 }), NOW).kind).toBe('limited');
    expect(cardTag(item('c', { endsAt: NOW + DAY }), NOW).kind).toBe('limited');
    expect(cardTag(item('d', { endsAt: NOW - DAY, remaining: 0 }), NOW)).toEqual({ kind: 'rarity', label: 'COMMON', rarity: 'common' });
    expect(cardTag(item('e', { rarity: 'mythic' }), NOW).label).toBe('MYTHIC');
    // Owned items are not advertised as limited.
    expect(cardTag(item('f', { remaining: 2, owned: true, rarity: 'epic' }), NOW).label).toBe('EPIC');
  });
});

describe('reference home: collection, physical and wishlist helpers', () => {
  it('counts owned, non-revoked inventory by type; VS / Victory read 0; Gifts = received gifts', () => {
    const inv = [
      { type: 'frame', owned: true },
      { type: 'frame', owned: true },
      { type: 'frame', owned: false },
      { type: 'theme', owned: true, revokedAt: 5 },
      { type: 'effect', owned: true },
      { type: 'sticker', owned: true },
    ];
    const c = collectionTiles(inv, { enabled: true, firstPage: 5 });
    expect(c.tiles.map((t) => t.label)).toEqual(['Frames', 'Themes', 'Badges', 'Titles', 'VS Effects', 'Victory FX', 'Profile FX', 'Gifts']);
    const by = Object.fromEntries(c.tiles.map((t) => [t.key, t.count]));
    expect(by).toEqual({ frame: 2, theme: 0, badge: 0, title: 0, vs: 0, victory: 0, effect: 1, gifts: 5 });
    // N = sum of the tiles (stickers have no tile).
    expect(c.total).toBe(8);
    expect(c.more).toBe(false);
    // Gifts off: 0 whatever the history says.
    expect(collectionTiles(inv, { enabled: false, firstPage: 9 }).tiles.find((t) => t.key === 'gifts')!.count).toBe(0);
    // A full first page with more pages is a lower bound.
    const more = collectionTiles([], { enabled: true, firstPage: 30, more: true });
    expect(more).toMatchObject({ total: 30, more: true });
    expect(more.tiles.find((t) => t.key === 'gifts')).toMatchObject({ count: 30, more: true });
    expect(collectionTiles(undefined)).toMatchObject({ total: 0 });
    expect(collectionTiles([], { enabled: true, firstPage: null })).toMatchObject({ total: 0 });
  });

  it('deals row: real products and a featured in-stock deal, else honest placeholders', () => {
    const p = (id: string, featured: boolean, stock: boolean) => ({ id, featured, variants: [{ inStock: stock }] });
    const list = [p('a', false, false), p('b', true, true), p('c', false, true), p('d', false, true)];
    const live = dealsBlock(true, list);
    expect(live.products!.map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(live.deal!.id).toBe('b');
    // Products but nothing featured in stock: products shown, deal is the placeholder.
    expect(dealsBlock(true, [p('a', true, false), p('c', false, true)])).toMatchObject({ deal: null });
    // Shop off or empty: both placeholders.
    expect(dealsBlock(false, list)).toEqual({ products: null, deal: null });
    expect(dealsBlock(true, [])).toEqual({ products: null, deal: null });
    expect(dealsBlock(true, undefined)).toEqual({ products: null, deal: null });
  });

  it('physical picks put in-stock first; hot deals are featured and in stock only', () => {
    const p = (id: string, featured: boolean, stock: boolean) => ({ id, featured, variants: [{ inStock: stock }] });
    const list = [p('a', false, false), p('b', true, true), p('c', true, false), p('d', false, true)];
    expect(physicalPicks(list).map((x) => x.id)).toEqual(['b', 'd', 'a']);
    expect(hotDeals(list).map((x) => x.id)).toEqual(['b']);
  });

  it('wishlist filter reads the live ids, and a rarity set filters', () => {
    const store = [item('a'), item('b', { rarity: 'legendary' }), item('c', { rarity: 'mythic' })];
    const f = withWishlist({ ...NO_FILTER, wishlist: true }, ['c', 'a']);
    expect(filterDigital(store, f).map((i) => i.itemId)).toEqual(['c', 'a']);
    expect(filterDigital(store, withWishlist({ ...NO_FILTER, wishlist: true }, [])).length).toBe(0);
    expect(withWishlist(NO_FILTER, ['a'])).toBe(NO_FILTER);
    expect(filterDigital(store, { ...NO_FILTER, rarities: ['legendary', 'mythic'] }).map((i) => i.itemId)).toEqual(['b', 'c']);
  });
});

describe('popularCollections', () => {
  it('is empty without items', () => {
    expect(popularCollections([])).toEqual([]);
    expect(popularCollections(null as unknown as ShopItem[])).toEqual([]);
  });

  it('one card per rarity with listings, highest rarity first, real types as subtitle', () => {
    const store = [
      item('f1', { rarity: 'legendary', type: 'frame', priceCoins: 100 }),
      item('b1', { rarity: 'legendary', type: 'badge', priceCoins: 900 }),
      item('t1', { rarity: 'legendary', type: 'title' }),
      item('m1', { rarity: 'mythic', type: 'theme' }),
      item('e1', { rarity: 'epic', type: 'frame' }),
      item('r1', { rarity: 'rare', type: 'badge' }),
    ];
    const cards = popularCollections(store);
    expect(cards.map((c) => c.key)).toEqual(['rarity:mythic', 'rarity:legendary', 'rarity:epic', 'rarity:rare']);
    const leg = cards[1];
    expect(leg).toMatchObject({ kind: 'rarity', value: 'legendary', title: 'Legendary Collection', subtitle: 'Frames, Badges & Titles', count: 3 });
    // Best item: rarest, then priciest.
    expect(leg.art.itemId).toBe('b1');
    // 4 rarity cards: no per-type cards.
    expect(cards.every((c) => c.kind === 'rarity')).toBe(true);
  });

  it('adds per-type cards when fewer than 4 rarities exist, without duplicating a rarity card', () => {
    const store = [
      item('f1', { rarity: 'legendary', type: 'frame' }),
      item('f2', { rarity: 'epic', type: 'frame' }),
      item('f3', { rarity: 'epic', type: 'frame' }),
      item('b1', { rarity: 'epic', type: 'badge' }),
    ];
    const cards = popularCollections(store);
    expect(cards.map((c) => c.key)).toEqual(['rarity:legendary', 'rarity:epic', 'type:frame', 'type:badge']);
    expect(cards[2]).toMatchObject({ kind: 'type', value: 'frame', title: 'Frame Collection', subtitle: '3 items • Legendary & Epic', count: 3 });
    // A type whose listings equal one rarity card is skipped.
    const solo = popularCollections([item('a', { rarity: 'rare', type: 'title' }), item('b', { rarity: 'rare', type: 'title' })]);
    expect(solo.map((c) => c.key)).toEqual(['rarity:rare']);
  });

  it('never returns more than max and invents nothing', () => {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    const types = ['frame', 'theme', 'badge', 'title'];
    const store = rarities.flatMap((r, k) => types.map((t) => item(`${r}-${t}`, { rarity: r, type: t, priceCoins: 10 + k })));
    expect(POPULAR_COLLECTIONS_MAX).toBe(6);
    expect(popularCollections(store)).toHaveLength(6);
    expect(popularCollections(store, 2).map((c) => c.value)).toEqual(['mythic', 'legendary']);
    expect(popularCollections(store, 0)).toEqual([]);
    for (const c of popularCollections(store)) {
      expect(store.filter((i) => (c.kind === 'rarity' ? i.rarity : i.type) === c.value)).toHaveLength(c.count);
      expect(store).toContain(c.art);
    }
    // Unknown rarities get no rarity card (no made-up label).
    expect(popularCollections([item('x', { rarity: 'cosmic', type: 'frame' })]).map((c) => c.key)).toEqual(['type:frame']);
  });
});

// ------------------------------------------------------------------ admin collections + bundles

const bitem = (id: string, type: string, owned = false) => ({ itemId: id, type, name: id, rarity: 'rare', asset: {}, owned });
const bundle = (over: Partial<ShopBundleDef> = {}): ShopBundleDef => ({
  id: 'b1',
  name: 'Starter Pack',
  description: '',
  imageUrl: null,
  badge: null,
  priceDiamonds: 120,
  compareAtDiamonds: null,
  startsAt: null,
  endsAt: null,
  remaining: null,
  items: [bitem('f', 'frame'), bitem('b', 'badge'), bitem('t', 'title')],
  ownedCount: 0,
  purchased: false,
  ...over,
});
const col = (over: Partial<ShopCollectionDef> = {}): ShopCollectionDef => ({ id: 'c1', name: 'Royal', subtitle: '', imageUrl: null, accent: 'violet', itemIds: [], ...over });

describe('bundleTypeLine / bundleItemsLine', () => {
  it('lists the distinct types in display order', () => {
    expect(bundleTypeLine([bitem('t', 'title'), bitem('f', 'frame'), bitem('b', 'badge'), bitem('f2', 'frame')])).toBe('Frame, Badge & Title');
    expect(bundleTypeLine([bitem('f', 'frame')])).toBe('Frame');
    expect(bundleTypeLine([bitem('f', 'frame'), bitem('t', 'theme')])).toBe('Frame & Theme');
    expect(bundleTypeLine([])).toBe('');
  });
  it('capitalises unknown types after the known ones', () => {
    expect(bundleTypeLine([bitem('x', 'aura'), bitem('f', 'frame')])).toBe('Frame & Aura');
  });
  it('counts the items', () => {
    expect(bundleItemsLine(bundle().items)).toBe('3 items • Frame, Badge & Title');
    expect(bundleItemsLine([bitem('f', 'frame')])).toBe('1 item • Frame');
  });
});

describe('bundleState', () => {
  const opts = { live: true, diamonds: 500, signedIn: true };
  it('buy when signed in, on sale and affordable', () => {
    expect(bundleState(bundle(), opts)).toBe('buy');
  });
  it('owned once bought, before anything else', () => {
    expect(bundleState(bundle({ purchased: true }), { ...opts, signedIn: false, diamonds: 0 })).toBe('owned');
  });
  it('signin for guests', () => {
    expect(bundleState(bundle(), { ...opts, signedIn: false })).toBe('signin');
  });
  it('all_owned when every item is in the collection', () => {
    expect(bundleState(bundle({ ownedCount: 3 }), opts)).toBe('all_owned');
    const items = [bitem('f', 'frame', true), bitem('b', 'badge', true)];
    expect(bundleState(bundle({ items, ownedCount: 0 }), opts)).toBe('all_owned');
    expect(bundleState(bundle({ ownedCount: 1 }), opts)).toBe('buy');
  });
  it('short only with a known balance below the price', () => {
    expect(bundleState(bundle(), { ...opts, diamonds: 119 })).toBe('short');
    expect(bundleState(bundle(), { ...opts, diamonds: 120 })).toBe('buy');
    expect(bundleState(bundle(), { ...opts, live: false, diamonds: 0 })).toBe('buy');
  });
  it('unavailable outside the schedule or sold out (with now)', () => {
    expect(bundleState(bundle({ endsAt: NOW - 1 }), { ...opts, now: NOW })).toBe('unavailable');
    expect(bundleState(bundle({ startsAt: NOW + DAY }), { ...opts, now: NOW })).toBe('unavailable');
    expect(bundleState(bundle({ remaining: 0 }), { ...opts, now: NOW })).toBe('unavailable');
    expect(bundleState(bundle({ endsAt: NOW + DAY, remaining: 4 }), { ...opts, now: NOW })).toBe('buy');
  });
});

describe('bundle helpers', () => {
  it('bundleAvailable / visibleBundles keep purchased ones', () => {
    expect(bundleAvailable(bundle(), NOW)).toBe(true);
    const list = [bundle({ id: 'a' }), bundle({ id: 'b', endsAt: NOW - 1 }), bundle({ id: 'c', endsAt: NOW - 1, purchased: true }), bundle({ id: 'd', remaining: 0 })];
    expect(visibleBundles(list, NOW).map((b) => b.id)).toEqual(['a', 'c']);
  });
  it('bundleDiscount only for a real compare-at', () => {
    expect(bundleDiscount({ priceDiamonds: 75, compareAtDiamonds: 100 })).toBe(25);
    expect(bundleDiscount({ priceDiamonds: 100, compareAtDiamonds: 100 })).toBe(0);
    expect(bundleDiscount({ priceDiamonds: 100, compareAtDiamonds: null })).toBe(0);
  });
  it('bundleOwnedNote', () => {
    expect(bundleOwnedNote(bundle())).toBeNull();
    expect(bundleOwnedNote(bundle({ ownedCount: 1 }))).toBe('1 of 3 already owned — sirf baaki 2 items milenge');
    expect(bundleOwnedNote(bundle({ ownedCount: 2 }))).toBe('2 of 3 already owned — sirf baaki 1 item milega');
  });
  it('bundleStockLabel only for a real positive number', () => {
    expect(bundleStockLabel(5)).toBe('Sirf 5 bache');
    expect(bundleStockLabel(null)).toBeNull();
    expect(bundleStockLabel(0)).toBeNull();
    expect(bundleStockLabel('5')).toBeNull();
  });
});

describe('collectionItems / collectionCards', () => {
  const store = [item('a', { rarity: 'rare' }), item('b', { rarity: 'legendary', type: 'badge' }), item('c', { type: 'title' })];
  it('keeps the admin order and drops missing / repeated ids', () => {
    expect(collectionItems(col({ itemIds: ['c', 'zz', 'a', 'c'] }), store).map((i) => i.itemId)).toEqual(['c', 'a']);
    expect(collectionItems(col({ itemIds: [] }), store)).toEqual([]);
  });
  it('builds cards only for collections with live items; art = best item; subtitle falls back to types', () => {
    const cards = collectionCards([col({ id: 'x', itemIds: ['a', 'b', 'c'] }), col({ id: 'empty', itemIds: ['zz'] }), col({ id: 'y', subtitle: 'Admin line', itemIds: ['c'] })], store);
    expect(cards.map((c) => c.collection.id)).toEqual(['x', 'y']);
    expect(cards[0].art.itemId).toBe('b');
    expect(cards[0].subtitle).toBe('Frames, Badges & Titles');
    expect(cards[1].subtitle).toBe('Admin line');
  });
});

describe('normalizeShopCollections', () => {
  it('parses the contract and drops invalid entries', () => {
    const out = normalizeShopCollections({
      collections: [
        { id: 'c1', name: 'Royal', subtitle: ' Kings ', imageUrl: '', accent: 'teal', itemIds: ['a', 3, ''] },
        { id: '', name: 'No id' },
      ],
      bundles: [
        { id: 'b1', name: 'Pack', description: 'x', imageUrl: 'https://x/y.png', badge: 'Best Value', priceDiamonds: 100, compareAtDiamonds: 90, startsAt: null, endsAt: 5, remaining: null, items: [{ itemId: 'a', type: 'frame', name: 'A', rarity: 'epic', asset: {}, owned: true }, { nope: 1 }], ownedCount: 1, purchased: false },
        { id: 'b2', name: 'Bad price', priceDiamonds: 'x' },
      ],
    });
    expect(out.collections).toEqual([{ id: 'c1', name: 'Royal', subtitle: 'Kings', imageUrl: null, accent: 'violet', itemIds: ['a'] }]);
    expect(out.bundles).toHaveLength(1);
    expect(out.bundles[0]).toMatchObject({ id: 'b1', badge: 'Best Value', compareAtDiamonds: null, endsAt: 5, ownedCount: 1, imageUrl: 'https://x/y.png' });
    expect(out.bundles[0].items).toHaveLength(1);
  });
  it('is empty for nothing', () => {
    expect(normalizeShopCollections(null)).toEqual({ collections: [], bundles: [] });
    expect(normalizeShopCollections({ collections: 'x' })).toEqual({ collections: [], bundles: [] });
  });
});

describe('isUnknownActionError', () => {
  it('recognises an older server that lacks the action', () => {
    expect(isUnknownActionError({ status: 404 })).toBe(true);
    expect(isUnknownActionError({ status: 400, message: "Action 'getShopCollections' nahi mila." })).toBe(true);
    expect(isUnknownActionError({ status: 400, message: 'Unknown action getShopCollections.' })).toBe(true);
    expect(isUnknownActionError({ status: 400, reason: 'unknown_action' })).toBe(true);
  });
  it('does not hide real failures', () => {
    expect(isUnknownActionError({ status: 500, message: 'boom' })).toBe(false);
    expect(isUnknownActionError({ message: 'Network request failed' })).toBe(false);
    expect(isUnknownActionError({ status: 400, reason: 'invalid_request', message: 'Unknown action' })).toBe(false);
    expect(isUnknownActionError(null)).toBe(false);
    expect(isUnknownActionError({ status: 404, reason: 'bundle_unavailable' })).toBe(false);
  });
});

describe('bundleErrorView', () => {
  it('maps every server reason', () => {
    const k = (reason: string) => bundleErrorView({ status: 400, reason }).kind;
    expect(k('not_enough_diamonds')).toBe('insufficient');
    expect(k('already_purchased')).toBe('owned');
    expect(k('already_owned')).toBe('all_owned');
    expect(k('price_changed')).toBe('price_changed');
    expect(k('bundle_unavailable')).toBe('unavailable');
    expect(k('store_disabled')).toBe('store_closed');
    expect(k('invalid_request')).toBe('invalid');
    expect(k('something_else')).toBe('other');
  });
  it('refreshes on price / availability changes', () => {
    expect(bundleErrorView({ status: 409, reason: 'price_changed' }).refresh).toBe(true);
    expect(bundleErrorView({ status: 409, reason: 'bundle_unavailable' }).refresh).toBe(true);
    expect(bundleErrorView({ status: 402, reason: 'not_enough_diamonds' }).refresh).toBe(false);
  });
  it('a network failure retries the same request', () => {
    const v = bundleErrorView(new Error('offline'));
    expect(v.kind).toBe('network');
    expect(v.retrySameRequest).toBe(true);
  });
});
