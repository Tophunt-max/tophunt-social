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
  /** Prettified category name ("t-shirts" → "T-Shirts"). */
  label: string;
  icon: PhysCatIcon;
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

/** Categories row: the categories of live products, store order, at most `max`. */
export function physicalCategories<T extends PhysicalProduct>(products: T[], max = PHYS_CATEGORY_MAX): PhysicalCategory[] {
  const seen = new Map<string, PhysicalCategory>();
  for (const p of products) {
    const key = String(p?.category ?? '').trim();
    if (!key) continue;
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { key, label: prettyCategory(key), icon: physicalCategoryIcon(key), count: 1 });
  }
  return [...seen.values()].slice(0, Math.max(0, max));
}
