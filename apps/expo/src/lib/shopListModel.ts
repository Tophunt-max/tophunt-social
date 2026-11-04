/**
 * Logic of the Shop "View All" pages (/shop/categories, /shop/category/[type],
 * /shop/featured, /shop/trending, /shop/deals, /shop/bundles): sorting,
 * filtering, the trending ranking and the deals list. Pure (no react-native
 * import) so it runs in vitest.
 *
 * Same honesty rules as shopModel.ts: every order comes from a real server
 * signal (units sold, listing time, price, rarity, compare-at price); a
 * missing signal sorts last, nothing is invented.
 */
import { rarityRankOf } from '@/src/theme/tophuntTokens';
import {
  TYPE_LABEL,
  arrivedAt,
  bundleAllOwned,
  deriveCategories,
  discountOf,
  isFutureDeadline,
  type CategoryCard,
  type CategoryTile,
  type ShopBundleDef,
  type ShopItem,
  type TileKey,
} from './shopModel';

// ------------------------------------------------------------------ sorting

export type SortKey = 'default' | 'popular' | 'new' | 'price_asc' | 'price_desc' | 'rarity' | 'discount';

export interface SortDef {
  key: SortKey;
  label: string;
}

/** Every sort a list page can offer. `default` keeps the order the data came in (admin / store order). */
export const SORTS: Record<SortKey, SortDef> = {
  default: { key: 'default', label: 'Recommended' },
  popular: { key: 'popular', label: 'Popular' },
  new: { key: 'new', label: 'Naye pehle' },
  price_asc: { key: 'price_asc', label: 'Price: kam se zyada' },
  price_desc: { key: 'price_desc', label: 'Price: zyada se kam' },
  rarity: { key: 'rarity', label: 'Rarity: sabse rare pehle' },
  discount: { key: 'discount', label: 'Sabse zyada discount' },
};

/** The category page: Popular first (units sold), no "Recommended" (the store has no order of its own there). */
export const CATEGORY_SORTS: SortDef[] = [SORTS.popular, SORTS.new, SORTS.price_asc, SORTS.price_desc, SORTS.rarity];
/** The featured page: the admin's order first. */
export const FEATURED_SORTS: SortDef[] = [SORTS.default, SORTS.popular, SORTS.new, SORTS.price_asc, SORTS.price_desc, SORTS.rarity];
/** The deals page: biggest real discount first. */
export const DEAL_SORTS: SortDef[] = [SORTS.discount, SORTS.price_asc, SORTS.price_desc, SORTS.rarity];

const sold = (i: ShopItem) => Number(i.soldCount) || 0;

/**
 * A sorted copy (the input is not touched). Ties, and items missing the
 * signal (no listing time for "new"), keep their input order, so the result
 * is stable and a missing signal sorts last instead of inventing a place.
 */
export function sortItems<T extends ShopItem>(items: readonly T[], key: SortKey): T[] {
  const indexed = items.map((item, n) => ({ item, n }));
  const by = (cmp: (a: T, b: T) => number) => indexed.sort((a, b) => cmp(a.item, b.item) || a.n - b.n).map((x) => x.item);
  switch (key) {
    case 'popular':
      return by((a, b) => sold(b) - sold(a));
    case 'new':
      return by((a, b) => (arrivedAt(b) ?? -Infinity) - (arrivedAt(a) ?? -Infinity) || 0);
    case 'price_asc':
      return by((a, b) => a.priceCoins - b.priceCoins);
    case 'price_desc':
      return by((a, b) => b.priceCoins - a.priceCoins);
    case 'rarity':
      return by((a, b) => rarityRankOf(b.rarity) - rarityRankOf(a.rarity));
    case 'discount':
      return by((a, b) => discountOf(b) - discountOf(a));
    default:
      return indexed.map((x) => x.item);
  }
}

/** `key` when the page offers it, else the page's first sort (a stale / unknown key never breaks the list). */
export function sortOr(key: string | null | undefined, options: readonly SortDef[]): SortKey {
  return options.find((o) => o.key === key)?.key ?? options[0]?.key ?? 'default';
}

// ------------------------------------------------------------------ filtering

export interface ListFilter {
  query?: string;
  rarity?: string | null;
  hideOwned?: boolean;
  type?: string | null;
}

export const NO_LIST_FILTER: Required<ListFilter> = { query: '', rarity: null, hideOwned: false, type: null };

/** True when any filter is set (the empty state then offers "Filters hatao"). */
export function isFiltered(f: ListFilter): boolean {
  return !!(f.query?.trim() || f.rarity || f.hideOwned || f.type);
}

/** Search (name, description, type label, rarity), rarity, type and "Owned chhupao". Order kept. */
export function filterItems<T extends ShopItem>(items: readonly T[], f: ListFilter): T[] {
  const q = (f.query ?? '').trim().toLowerCase();
  return items.filter(
    (i) =>
      (!f.type || i.type === f.type) &&
      (!f.rarity || i.rarity === f.rarity) &&
      (!f.hideOwned || !i.owned) &&
      (!q || `${i.name} ${i.description ?? ''} ${TYPE_LABEL[i.type] ?? i.type} ${i.rarity}`.toLowerCase().includes(q)),
  );
}

/** Item types present in `items`, in the category display order, with live counts (the type chips). */
export function presentTypes<T extends ShopItem>(items: readonly T[]): { type: string; label: string; count: number }[] {
  return deriveCategories([...items]).map((c) => ({ type: c.type, label: TILE_LABEL[c.type] ?? c.label, count: c.count }));
}

// ------------------------------------------------------------------ trending

export interface RankedItem<T extends ShopItem = ShopItem> {
  item: T;
  /** 1-based position. */
  rank: number;
}

/**
 * Items that have really sold (soldCount > 0), most sold first; ties by
 * rarity (rarest first), then name. Items without sales are left out: they
 * are not "trending". The counts themselves are never shown.
 */
export function rankTrending<T extends ShopItem>(items: readonly T[]): RankedItem<T>[] {
  return items
    .filter((i) => sold(i) > 0)
    .sort((a, b) => sold(b) - sold(a) || rarityRankOf(b.rarity) - rarityRankOf(a.rarity) || a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId))
    .map((item, n) => ({ item, rank: n + 1 }));
}

/** Medal tone of a rank: gold / silver / bronze for the top 3, null after. */
export function rankMedal(rank: number): 'gold' | 'silver' | 'bronze' | null {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
}

// ------------------------------------------------------------------ deals

export interface DealItem<T extends ShopItem = ShopItem> {
  item: T;
  /** Real whole-percent discount from the compare-at price (> 0). */
  percent: number;
  /** Real future sale end, or null (no countdown). */
  endsAt: number | null;
}

/**
 * Every live, not-owned listing with a real compare-at discount, biggest
 * discount first, then the soonest real sale end, then name. Listings whose
 * sale already ended (client clock) are left out.
 */
export function dealItems<T extends ShopItem>(items: readonly T[], now: number): DealItem<T>[] {
  return items
    .filter((i) => !i.owned && discountOf(i) > 0 && !(typeof i.endsAt === 'number' && i.endsAt > 0 && i.endsAt <= now))
    .map((item) => ({ item, percent: discountOf(item), endsAt: isFutureDeadline(item.endsAt, now) ? (item.endsAt as number) : null }))
    .sort(
      (a, b) =>
        b.percent - a.percent ||
        (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity) ||
        a.item.name.localeCompare(b.item.name) ||
        a.item.itemId.localeCompare(b.item.itemId),
    );
}

/** The product fields the deals page reads (services/shop ShopProduct). */
export interface DealProduct {
  id: string;
  featured: boolean;
  priceCoins: number;
  compareAtCoins?: number | null;
  variants: { inStock: boolean }[];
}

/**
 * Physical products for the deals page: in stock AND either a real
 * compare-at discount or marked featured by the admin. Discounted ones come
 * first (biggest % first), then featured ones in store order.
 */
export function physicalDeals<P extends DealProduct>(products: readonly P[] | null | undefined): P[] {
  const live = (products ?? []).filter((p) => p.variants.some((v) => v.inStock));
  const disc = live
    .map((p, n) => ({ p, n, pct: discountOf(p) }))
    .filter((x) => x.pct > 0)
    .sort((a, b) => b.pct - a.pct || a.n - b.n)
    .map((x) => x.p);
  const featured = live.filter((p) => p.featured && discountOf(p) === 0);
  return [...disc, ...featured];
}

// ------------------------------------------------------------------ categories

/** Short tile labels by item type (the Shop Categories grid: "Frames", "Themes"…). */
export const TILE_LABEL: Record<string, string> = {
  frame: 'Frames',
  theme: 'Themes',
  badge: 'Badges',
  title: 'Titles',
  effect: 'Profile FX',
};

/** Tile artwork for an item type; types without their own art use the generic one. */
export function tileKeyForType(type: string | null | undefined): TileKey {
  switch (type) {
    case 'frame':
    case 'theme':
    case 'badge':
    case 'title':
    case 'effect':
      return type;
    default:
      return 'more';
  }
}

/** Page title for an item type ("Avatar Frames"), or a capitalised fallback for an unknown one. */
export function typeTitle(type: string): string {
  if (TYPE_LABEL[type]) return TYPE_LABEL[type];
  const t = type.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Items';
}

export interface CategorySummary<T extends CategoryTile = CategoryTile> {
  /** Tiles that lead somewhere real (live listings / gifts on), most listings first, display order on ties. */
  available: T[];
  /** Tiles with nothing behind them yet ("Jaldi aa raha hai"). */
  soon: T[];
  /** Live listings across the available type tiles. */
  total: number;
}

/**
 * Splits the Shop Categories tiles for the All Categories page. The "More"
 * tile (a shortcut to everything) is not a category and is left out.
 */
export function categorySummary<T extends CategoryTile>(tiles: readonly T[]): CategorySummary<T> {
  const real = tiles.filter((t) => t.key !== 'more');
  const order = new Map(real.map((t, n) => [t.key, n]));
  const available = real.filter((t) => !t.soon).sort((a, b) => b.count - a.count || order.get(a.key)! - order.get(b.key)!);
  return {
    available,
    soon: real.filter((t) => t.soon),
    total: available.reduce((n, t) => n + (t.type ? t.count : 0), 0),
  };
}

/** Item types with live listings that have no Shop Categories tile (stickers, collectibles…), with counts. */
export function extraCategories<T extends ShopItem>(items: readonly T[], tiles: readonly Pick<CategoryTile, 'type'>[]): CategoryCard<T>[] {
  const covered = new Set(tiles.map((t) => t.type).filter(Boolean));
  return deriveCategories([...items]).filter((c) => !covered.has(c.type));
}

// ------------------------------------------------------------------ bundles

export type BundleSortKey = 'recommended' | 'price_asc' | 'price_desc';
export type BundleFilter = 'all' | 'available' | 'owned';

export const BUNDLE_SORTS: { key: BundleSortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'price_asc', label: 'Price: kam se zyada' },
  { key: 'price_desc', label: 'Price: zyada se kam' },
];

/** A sorted copy: `recommended` is the admin's order; price sorts keep admin order on ties. */
export function sortBundles<T extends Pick<ShopBundleDef, 'priceDiamonds'>>(bundles: readonly T[], key: BundleSortKey): T[] {
  const indexed = bundles.map((b, n) => ({ b, n }));
  if (key === 'price_asc') indexed.sort((x, y) => x.b.priceDiamonds - y.b.priceDiamonds || x.n - y.n);
  else if (key === 'price_desc') indexed.sort((x, y) => y.b.priceDiamonds - x.b.priceDiamonds || x.n - y.n);
  return indexed.map((x) => x.b);
}

/** Owned = bought, or every item already in the collection; Available = the rest (can still be bought). */
export function bundleOwned(b: Pick<ShopBundleDef, 'purchased' | 'items' | 'ownedCount'>): boolean {
  return b.purchased || bundleAllOwned(b);
}

export function filterBundles<T extends Pick<ShopBundleDef, 'purchased' | 'items' | 'ownedCount'>>(bundles: readonly T[], f: BundleFilter): T[] {
  if (f === 'owned') return bundles.filter(bundleOwned);
  if (f === 'available') return bundles.filter((b) => !bundleOwned(b));
  return [...bundles];
}

// ------------------------------------------------------------------ copy

/** "1 item" / "24 items". */
export function countLabel(n: number, one = 'item', many = 'items'): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
