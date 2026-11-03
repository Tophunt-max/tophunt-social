import { describe, expect, it } from 'vitest';
import {
  HERO_AUTOPLAY_MS,
  adminHeroSlides,
  dealsTitle,
  featuredView,
  heroSlides,
  isSafeAppPath,
  resolveDealCards,
  slideImage,
  targetNav,
  type DealProductLike,
  type PublicSlide,
  type ShopItem,
} from '@/src/lib/shopModel';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const IMG = 'https://cdn.test/shop-banners/a.webp';
const IMG_M = 'https://cdn.test/shop-banners/m.webp';

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
const product = (id: string, over: Partial<DealProductLike> = {}): DealProductLike => ({
  id,
  title: id,
  featured: false,
  priceCoins: 300,
  compareAtCoins: null,
  variants: [{ inStock: true }],
  ...over,
});
const slide = (over: Partial<PublicSlide> = {}): PublicSlide => ({
  id: 's1',
  badge: 'Hot Drop',
  title: 'Mythic Week',
  subtitle: '',
  ctaLabel: 'Explore Collection',
  imageUrl: null,
  mobileImageUrl: null,
  itemIds: ['a', 'b'],
  target: { kind: 'items' },
  endsAt: null,
  showCountdown: false,
  ...over,
});

const store = [
  item('a', { rarity: 'legendary', type: 'frame', name: 'Gold Frame' }),
  item('b', { rarity: 'epic', type: 'theme' }),
  item('m', { rarity: 'mythic', type: 'badge' }),
];
const opts: { products: DealProductLike[] | null; shopEnabled: boolean; now: number } = { products: [product('tee')], shopEnabled: true, now: NOW };

// ===========================================================================
describe('admin hero slider', () => {
  it('builds slides from the config: copy, autoplay, first live item as art, per-slide countdown', () => {
    const h = adminHeroSlides({ autoplaySec: 7, slides: [slide({ itemIds: ['gone', 'b', 'a'], endsAt: NOW + DAY, showCountdown: true }), slide({ id: 's2', title: 'Plain', showCountdown: true, endsAt: NOW + DAY, itemIds: ['m'] })] }, store, opts)!;
    expect(h.mode).toBe('admin');
    expect(h.autoplayMs).toBe(7000);
    expect(h.endsAt).toBeNull();
    expect(h.slides).toHaveLength(2);
    expect(h.slides[0]).toMatchObject({ key: 's1', badge: 'HOT DROP', title: 'MYTHIC', caps: 'WEEK', ctaLabel: 'Explore Collection', endsAt: NOW + DAY, subtitle: 'Frames • Themes' });
    expect(h.slides[0].item?.itemId).toBe('b');
    // CTA of kind 'items': only the live ids, in the admin's order.
    expect(h.slides[0].nav).toEqual({ kind: 'digital', filter: { ids: ['b', 'a'] } });
    // One word: caps = the art's type.
    expect(h.slides[1]).toMatchObject({ title: 'PLAIN', caps: 'BADGES', endsAt: NOW + DAY });
  });

  it('countdown only with showCountdown AND a real end; ended slides are dropped (client clock)', () => {
    const h = adminHeroSlides({ autoplaySec: 4, slides: [slide({ endsAt: NOW + DAY }), slide({ id: 'x', showCountdown: true }), slide({ id: 'old', endsAt: NOW, showCountdown: true })] }, store, opts)!;
    expect(h.slides.map((s) => [s.key, s.endsAt])).toEqual([['s1', null], ['x', null]]);
  });

  it('bad autoplay falls back to 4 s', () => {
    expect(adminHeroSlides({ autoplaySec: 99, slides: [slide()] }, store, opts)!.autoplayMs).toBe(HERO_AUTOPLAY_MS);
    expect(adminHeroSlides({ slides: [slide()] }, store, opts)!.autoplayMs).toBe(HERO_AUTOPLAY_MS);
  });

  it('image slides need no live item; phones prefer the mobile image, desktop the wide one', () => {
    const h = adminHeroSlides({ autoplaySec: 4, slides: [slide({ itemIds: [], imageUrl: IMG, target: { kind: 'physical' } }), slide({ id: 'm', itemIds: [], mobileImageUrl: IMG_M, target: { kind: 'product', productId: 'tee' } })] }, store, opts)!;
    expect(h.slides.map((s) => s.key)).toEqual(['s1', 'm']);
    expect(h.slides[0].item).toBeNull();
    expect(h.slides[0].caps).toBe('WEEK');
    expect(slideImage(h.slides[0], true)).toBe(IMG);
    expect(slideImage(h.slides[0], false)).toBe(IMG);
    expect(slideImage(h.slides[1], false)).toBe(IMG_M);
    expect(slideImage({ imageUrl: IMG, mobileImageUrl: IMG_M }, true)).toBe(IMG_M);
    expect(slideImage({ imageUrl: IMG, mobileImageUrl: IMG_M }, false)).toBe(IMG);
    expect(slideImage({ imageUrl: null, mobileImageUrl: null }, true)).toBeNull();
  });

  it('drops slides with nothing to draw or nowhere real to go', () => {
    const one = (s: Partial<PublicSlide>, o = opts) => adminHeroSlides({ autoplaySec: 4, slides: [slide(s)] }, store, o);
    // No image and none of the items is live.
    expect(one({ itemIds: ['gone'] })).toBeNull();
    // Image, but 'items' with nothing live: the CTA would open an empty list.
    expect(one({ itemIds: ['gone'], imageUrl: IMG })).toBeNull();
    expect(one({ target: { kind: 'item', itemId: 'gone' } })).toBeNull();
    expect(one({ target: { kind: 'item', itemId: 'm' } })!.slides[0].nav).toEqual({ kind: 'route', path: '/shop/item/m' });
    expect(one({ target: { kind: 'digital', type: 'sticker', rarities: [] } })).toBeNull();
    expect(one({ target: { kind: 'digital', type: 'frame', rarities: ['legendary'] } })!.slides[0].nav).toEqual({ kind: 'digital', filter: { type: 'frame', rarities: ['legendary'] } });
    expect(one({ target: { kind: 'physical' } }, { ...opts, shopEnabled: false })).toBeNull();
    expect(one({ target: { kind: 'product', productId: 'tee' } }, { ...opts, shopEnabled: false })).toBeNull();
    expect(one({ target: { kind: 'product', productId: 'gone' } })).toBeNull();
    // Products still loading: kept (the product page handles a missing one).
    expect(one({ target: { kind: 'product', productId: 'gone' } }, { ...opts, products: null })).not.toBeNull();
    expect(one({ target: { kind: 'url', path: 'https://evil.test' } })).toBeNull();
    expect(one({ target: { kind: 'url', path: '//evil.test' } })).toBeNull();
    expect(one({ target: { kind: 'url', path: '/explore/battles' } })!.slides[0].nav).toEqual({ kind: 'route', path: '/explore/battles' });
    expect(one({ imageUrl: 'http://insecure.test/a.png', itemIds: ['gone'] })).toBeNull();
    expect(one({ title: '  ' })).toBeNull();
  });

  it('ignores garbage and duplicate ids; caps at 8 slides', () => {
    expect(adminHeroSlides(null, store, opts)).toBeNull();
    expect(adminHeroSlides({ slides: 'x' }, store, opts)).toBeNull();
    const many = Array.from({ length: 10 }, (_, i) => slide({ id: `s${i}` }));
    expect(adminHeroSlides({ autoplaySec: 4, slides: [...many, slide({ id: 's0' })] }, store, opts)!.slides).toHaveLength(8);
    expect(adminHeroSlides({ autoplaySec: 4, slides: [slide(), slide()] }, store, opts)!.slides).toHaveLength(1);
  });

  it('heroSlides: admin slides win; otherwise the featured drop, then the fallback (back-compat)', () => {
    const f = featuredView({ title: 'Drop Week', itemIds: ['b'], endsAt: NOW + DAY }, store, NOW);
    expect(heroSlides(store, f, { slider: { autoplaySec: 5, slides: [slide()] }, ...opts })!.mode).toBe('admin');
    const drop = heroSlides(store, f, { slider: { autoplaySec: 5, slides: [slide({ itemIds: ['gone'] })] }, ...opts })!;
    expect(drop.mode).toBe('drop');
    expect(drop.autoplayMs).toBe(HERO_AUTOPLAY_MS);
    expect(drop.slides[0]).toMatchObject({ key: 'b', endsAt: NOW + DAY, nav: { kind: 'digital', filter: { ids: ['b'] } } });
    const fb = heroSlides(store, null, { ...opts })!;
    expect(fb.mode).toBe('collection');
    expect(fb.slides.every((s) => s.endsAt === null && s.imageUrl === null)).toBe(true);
    expect(heroSlides(store, null)!.mode).toBe('collection');
  });
});

// ===========================================================================
describe('slide target → navigation', () => {
  it('maps each kind to a tab filter or a route, and refuses unsafe ones', () => {
    expect(targetNav({ kind: 'items' }, ['a', 'b'])).toEqual({ kind: 'digital', filter: { ids: ['a', 'b'] } });
    expect(targetNav({ kind: 'items' }, [])).toBeNull();
    expect(targetNav({ kind: 'item', itemId: 'a b' }, [])).toEqual({ kind: 'route', path: '/shop/item/a%20b' });
    expect(targetNav({ kind: 'digital', type: null, rarities: [] }, [])).toEqual({ kind: 'digital', filter: { type: null, rarities: null } });
    expect(targetNav({ kind: 'physical' }, [])).toEqual({ kind: 'physical' });
    expect(targetNav({ kind: 'product', productId: 'tee' }, [])).toEqual({ kind: 'route', path: '/shop/tee' });
    expect(targetNav({ kind: 'url', path: '/shop?tab=physical' }, [])).toEqual({ kind: 'route', path: '/shop?tab=physical' });
    for (const path of ['https://x.test', '//x.test', 'x', '/a//b', '/\\x', 'javascript:alert(1)', `/${'a'.repeat(120)}`]) {
      expect(targetNav({ kind: 'url', path }, [])).toBeNull();
      expect(isSafeAppPath(path)).toBe(false);
    }
    expect(targetNav({ kind: 'weird' }, [])).toBeNull();
    expect(targetNav(null, [])).toBeNull();
  });
});

// ===========================================================================
describe('admin deal cards', () => {
  const deals = (cards: any[], title?: string) => ({ title, cards });
  const card = (over: any = {}) => ({ id: 'c1', title: 'Mega Shop Deal', subtitle: '', ctaLabel: 'Grab Now', imageUrl: null, source: { kind: 'all_discounts' }, ribbon: 'auto', endsAt: null, showTimer: false, ...over });
  const shop = [
    item('a', { priceCoins: 60, compareAtCoins: 100, endsAt: NOW + 2 * DAY }), // 40%
    item('b', { priceCoins: 90, compareAtCoins: 100, endsAt: NOW + DAY }), // 10%
    item('c', { priceCoins: 50 }), // no discount
    item('o', { priceCoins: 10, compareAtCoins: 100, owned: true }), // owned: never counts
    item('x', { priceCoins: 10, compareAtCoins: 100, endsAt: NOW - 1 }), // sale ended
  ];

  it('all_discounts: computed max percent, count, Digital discounted filter', () => {
    const [v] = resolveDealCards(deals([card()]), shop, null, NOW);
    expect(v).toMatchObject({ kind: 'all_discounts', percent: 40, discounted: 2, endsAt: null, nav: { kind: 'digital', filter: { discounted: true } }, ctaLabel: 'Grab Now' });
    expect(resolveDealCards(deals([card()]), [item('c')], null, NOW)).toEqual([]);
  });

  it('digital_items: live items only, percent over the discounted ones; hidden when nothing is live', () => {
    const [v] = resolveDealCards(deals([card({ source: { kind: 'digital_items', itemIds: ['b', 'c', 'gone', 'x'] } })]), shop, null, NOW);
    expect(v.items.map((i) => i.itemId)).toEqual(['b', 'c']);
    expect(v).toMatchObject({ percent: 10, discounted: 1, nav: { kind: 'digital', filter: { ids: ['b', 'c'] } } });
    // Live but nothing discounted: the card shows, the ribbon does not.
    expect(resolveDealCards(deals([card({ source: { kind: 'digital_items', itemIds: ['c'] } })]), shop, null, NOW)[0].percent).toBe(0);
    expect(resolveDealCards(deals([card({ source: { kind: 'digital_items', itemIds: ['gone', 'x'] } })]), shop, null, NOW)).toEqual([]);
  });

  it('product: live and in stock only; percent from its compare-at price; route to the product', () => {
    const products = [product('tee', { priceCoins: 300, compareAtCoins: 500 }), product('cap', { variants: [{ inStock: false }] }), product('mug')];
    const v = resolveDealCards(deals([card({ source: { kind: 'product', productId: 'tee' } })]), [], products, NOW)[0];
    expect(v).toMatchObject({ kind: 'product', percent: 40, discounted: 1, nav: { kind: 'route', path: '/shop/tee' } });
    expect(v.product?.id).toBe('tee');
    expect(resolveDealCards(deals([card({ source: { kind: 'product', productId: 'mug' } })]), [], products, NOW)[0].percent).toBe(0);
    expect(resolveDealCards(deals([card({ source: { kind: 'product', productId: 'cap' } })]), [], products, NOW)).toEqual([]);
    expect(resolveDealCards(deals([card({ source: { kind: 'product', productId: 'gone' } })]), [], products, NOW)).toEqual([]);
    expect(resolveDealCards(deals([card({ source: { kind: 'product', productId: 'tee' } })]), [], null, NOW)).toEqual([]);
  });

  it("ribbon 'none' hides the percent; it is never taken from the config", () => {
    expect(resolveDealCards(deals([card({ ribbon: 'none' })]), shop, null, NOW)[0].percent).toBe(0);
    expect(resolveDealCards(deals([card({ percent: 90, discountPercent: 90 })]), shop, null, NOW)[0].percent).toBe(40);
  });

  it('timer source: the card end when set; else the soonest real listing end (digital sources); never without showTimer', () => {
    expect(resolveDealCards(deals([card({ showTimer: true })]), shop, null, NOW)[0].endsAt).toBe(NOW + DAY);
    expect(resolveDealCards(deals([card({ showTimer: true, endsAt: NOW + 3 * DAY })]), shop, null, NOW)[0].endsAt).toBe(NOW + 3 * DAY);
    expect(resolveDealCards(deals([card({ showTimer: false, endsAt: NOW + 3 * DAY })]), shop, null, NOW)[0].endsAt).toBeNull();
    expect(resolveDealCards(deals([card({ showTimer: true, source: { kind: 'digital_items', itemIds: ['a', 'c'] } })]), shop, null, NOW)[0].endsAt).toBe(NOW + 2 * DAY);
    expect(resolveDealCards(deals([card({ showTimer: true, source: { kind: 'digital_items', itemIds: ['c'] } })]), shop, null, NOW)[0].endsAt).toBeNull();
    // A product card has only its own end.
    expect(resolveDealCards(deals([card({ showTimer: true, source: { kind: 'product', productId: 'tee' } })]), [], [product('tee')], NOW)[0].endsAt).toBeNull();
    expect(resolveDealCards(deals([card({ showTimer: true, endsAt: NOW + DAY, source: { kind: 'product', productId: 'tee' } })]), [], [product('tee')], NOW)[0].endsAt).toBe(NOW + DAY);
  });

  it('ended cards, bad images, garbage and duplicates are dropped; order is kept; title falls back', () => {
    expect(resolveDealCards(deals([card({ endsAt: NOW })]), shop, null, NOW)).toEqual([]);
    expect(resolveDealCards(deals([card({ imageUrl: 'http://x.test/a.png' })]), shop, null, NOW)[0].imageUrl).toBeNull();
    expect(resolveDealCards(deals([card({ imageUrl: IMG })]), shop, null, NOW)[0].imageUrl).toBe(IMG);
    expect(resolveDealCards(null, shop, null, NOW)).toEqual([]);
    expect(resolveDealCards({ cards: 'x' }, shop, null, NOW)).toEqual([]);
    const list = resolveDealCards(deals([card({ id: 'z' }), card({ id: 'y', source: { kind: 'digital_items', itemIds: ['a'] } }), card({ id: 'z' })]), shop, null, NOW);
    expect(list.map((c) => c.id)).toEqual(['z', 'y']);
    expect(dealsTitle(deals([], 'Diwali Deals'))).toBe('Diwali Deals');
    expect(dealsTitle(deals([], '  '))).toBe('Special Offers & Daily Deals');
    expect(dealsTitle(undefined)).toBe('Special Offers & Daily Deals');
  });
});
