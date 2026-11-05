/**
 * Phone "Physical" tab home (design mock): which products the Featured
 * Rewards shelf shows, the corner tag of each card, and the Categories row.
 * Pure (no react-native import) so it runs in vitest.
 *
 * Same honesty rules as digitalHomeModel.ts: every tag comes from a field
 * the server sent — LIMITED from real stock, HOT from a real compare-at
 * discount, NEW from the real listing time (ProductView.createdAt), POPULAR
 * from the admin's featured flag. A card with no signal shows no tag, and an
 * empty shelf is hidden by the screen.
 */
import { hotDeals, type PhysicalLike } from './shopModel';

/** Cards on the Featured Rewards row, and tiles on the Categories row (one row each in the mock). */
export const PHYS_FEATURED_MAX = 4;
export const PHYS_CATEGORY_MAX = 6;

/** A listing this many days old still reads NEW. */
export const NEW_PRODUCT_DAYS = 14;
/** Total stock at or below this reads LIMITED (real scarcity). */
export const LOW_STOCK = 5;

export type ProductTagKind = 'hot' | 'new' | 'popular' | 'limited';
export interface ProductTag {
  kind: ProductTagKind;
  label: 'HOT' | 'NEW' | 'POPULAR' | 'LIMITED';
}

/** The physical product fields the Physical home reads (services/shop ShopProduct). */
export interface PhysicalProduct extends PhysicalLike {
  category: string;
  priceCoins: number;
  compareAtCoins?: number | null;
  createdAt?: number;
  variants: { inStock: boolean; stock?: number }[];
}

/** Units left across all variants (a variant without a stock number counts 1 when in stock). */
export function totalStock(p: PhysicalProduct): number {
  return p.variants.reduce((n, v) => n + Math.max(0, Number(v.stock ?? (v.inStock ? 1 : 0))), 0);
}

const validPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Corner pill of a Featured Rewards card, one per card, highest signal first:
 *  - LIMITED: in stock but only a few units left (real stock);
 *  - HOT: a real discount (compare-at above the price);
 *  - NEW: listed within NEW_PRODUCT_DAYS (real createdAt; older servers send none → never NEW);
 *  - POPULAR: the admin's featured pick;
 *  - else no pill.
 */
export function productTag(p: PhysicalProduct, now: number): ProductTag | null {
  const stock = totalStock(p);
  if (stock > 0 && stock <= LOW_STOCK) return { kind: 'limited', label: 'LIMITED' };
  if (validPrice(p.compareAtCoins) && validPrice(p.priceCoins) && p.compareAtCoins > p.priceCoins) return { kind: 'hot', label: 'HOT' };
  if (typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) && p.createdAt > 0 && now - p.createdAt <= NEW_PRODUCT_DAYS * 86_400_000) return { kind: 'new', label: 'NEW' };
  if (p.featured) return { kind: 'popular', label: 'POPULAR' };
  return null;
}

/** Featured Rewards shelf: in-stock featured products (hotDeals), at most `max`. */
export function featuredProducts<T extends PhysicalLike>(products: T[], max = PHYS_FEATURED_MAX): T[] {
  return hotDeals(products, max);
}

/** Icon key of a category tile, from the category name the admin typed. */
export type PhysCatIcon = 'shirt' | 'cap' | 'headphones' | 'watch' | 'mug' | 'gift' | 'box';

export function physicalCategoryIcon(category: string): PhysCatIcon {
  const c = category.toLowerCase();
  if (/shirt|tee|apparel|cloth/.test(c)) return 'shirt';
  if (/cap|hat/.test(c)) return 'cap';
  if (/accessor|headphone|headset|audio|earbud/.test(c)) return 'headphones';
  if (/gadget|watch|tech|electronic|smart/.test(c)) return 'watch';
  if (/home|lifestyle|mug|bottle|kitchen/.test(c)) return 'mug';
  if (/merch|gift|combo|bundle/.test(c)) return 'gift';
  return 'box';
}

export interface PhysicalCategory {
  key: string;
  /** Prettified category name ("t-shirts" → "T-Shirts"), or the admin's label. */
  label: string;
  icon: PhysCatIcon;
  /** Admin-uploaded tile image; null → the outline icon is drawn. */
  imageUrl: string | null;
  /** Live products in it. */
  count: number;
}

/** "t-shirts" / "home_lifestyle" → "T-Shirts" / "Home Lifestyle". */
export function prettyCategory(category: string): string {
  return category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Categories row derived from live products (fallback when the admin manages none). */
export function physicalCategories<T extends PhysicalProduct>(products: T[], max = PHYS_CATEGORY_MAX): PhysicalCategory[] {
  const seen = new Map<string, PhysicalCategory>();
  for (const p of products) {
    const key = String(p?.category ?? '').trim();
    if (!key) continue;
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { key, label: prettyCategory(key), icon: physicalCategoryIcon(key), imageUrl: null, count: 1 });
  }
  return [...seen.values()].slice(0, Math.max(0, max));
}

/** Admin-managed category tile (appConfig.monetization.shop.physical.categories). */
export interface AdminCategory {
  key: string;
  label: string;
  imageUrl: string | null;
  sort: number;
}

/**
 * The Categories row: the admin's tiles (their label, image and order) when
 * they manage some, each with its live product count — a tile with nothing on
 * sale is left out. Without admin tiles, the derived icon categories above.
 */
export function resolveCategories<T extends PhysicalProduct>(admin: AdminCategory[] | null | undefined, products: T[], max = PHYS_CATEGORY_MAX): PhysicalCategory[] {
  if (!admin?.length) return physicalCategories(products, max);
  const counts = new Map<string, number>();
  for (const p of products) {
    const key = String(p?.category ?? '').trim();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...admin]
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({ key: c.key, label: c.label, icon: physicalCategoryIcon(c.key), imageUrl: c.imageUrl ?? null, count: counts.get(c.key) ?? 0 }))
    .filter((c) => c.count > 0)
    .slice(0, Math.max(0, max));
}

const inStock = (p: PhysicalLike) => p.variants.some((v) => v.inStock);

/** Products for a list of ids, in the list's order, in stock only (Exclusive Collection, Trending Products). */
function resolveIds<T extends PhysicalLike>(products: T[], ids: string[] | null | undefined, max: number): T[] {
  if (!ids?.length) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: T[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p && inStock(p) && !out.includes(p)) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/** Exclusive Collection shelf: the admin's picked products, their order, at most `max`. */
export function exclusiveProducts<T extends PhysicalLike>(products: T[], ids: string[] | null | undefined, max = PHYS_FEATURED_MAX): T[] {
  return resolveIds(products, ids, max);
}

/** Trending Products shelf: the server's most-ordered ids, that order, at most `max`. */
export function trendingProducts<T extends PhysicalLike>(products: T[], ids: string[] | null | undefined, max = PHYS_FEATURED_MAX): T[] {
  return resolveIds(products, ids, max);
}
