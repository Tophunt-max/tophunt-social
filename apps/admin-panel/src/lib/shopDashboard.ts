/**
 * Shop → Dashboard numbers, computed from the admin product and store lists
 * (GET /admin/monetization/shop/products, GET /admin/monetization/store).
 * Pure, so the rules are easy to check.
 */

/** A variant at or below this many units is "low stock" (the app's LIMITED tag uses the same 5). */
export const LOW_STOCK = 5;

export interface AdminVariant {
  id: string;
  label: string;
  stock: number;
  active: boolean;
}
export interface AdminProduct {
  id: string;
  title: string;
  active: boolean;
  unitsSold?: number;
  images?: string[];
  variants: AdminVariant[];
}
export interface AdminStoreItem {
  itemId: string;
  name: string;
  type: string;
  purchases?: number;
  revenueCoins?: number;
  listing: { active: boolean; stockLimit: number | null; soldCount: number } | null;
}

export interface StockRow {
  productId: string;
  title: string;
  variant: string;
  stock: number;
}

/**
 * Variants of products that are ON SALE and running out: stock 0 first (the
 * app already shows them as sold out), then fewest units. Hidden products and
 * inactive variants are left out: nobody can buy them, so they need no restock.
 */
export function lowStock(products: AdminProduct[], threshold = LOW_STOCK): StockRow[] {
  const rows: StockRow[] = [];
  for (const p of products) {
    if (!p.active) continue;
    for (const v of p.variants) {
      if (!v.active || v.stock > threshold) continue;
      rows.push({ productId: p.id, title: p.title, variant: v.label, stock: Math.max(0, v.stock) });
    }
  }
  return rows.sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title));
}

/** Products ranked by units sold (cancelled / returned orders are not counted by the Worker), best first; unsold ones are left out. */
export function topProducts(products: AdminProduct[], max = 5): AdminProduct[] {
  return products
    .filter((p) => (p.unitsSold ?? 0) > 0)
    .sort((a, b) => (b.unitsSold ?? 0) - (a.unitsSold ?? 0) || a.title.localeCompare(b.title))
    .slice(0, max);
}

/** Digital items ranked by completed purchases, best first; never-bought ones are left out. */
export function topItems(items: AdminStoreItem[], max = 5): AdminStoreItem[] {
  return items
    .filter((i) => (i.purchases ?? 0) > 0)
    .sort((a, b) => (b.purchases ?? 0) - (a.purchases ?? 0) || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** Listed digital items with a stock limit and LOW_STOCK or fewer left. */
export function lowStockItems(items: AdminStoreItem[], threshold = LOW_STOCK): { itemId: string; name: string; left: number }[] {
  return items
    .filter((i) => i.listing?.active && i.listing.stockLimit !== null)
    .map((i) => ({ itemId: i.itemId, name: i.name, left: Math.max(0, (i.listing!.stockLimit ?? 0) - i.listing!.soldCount) }))
    .filter((r) => r.left <= threshold)
    .sort((a, b) => a.left - b.left || a.name.localeCompare(b.name));
}
