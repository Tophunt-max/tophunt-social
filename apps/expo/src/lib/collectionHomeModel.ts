/**
 * Shop → My Collection (design mock): which items each type section shows,
 * the bottom pill of each cell and the two collection modes. Pure (no
 * react-native import) so it runs in vitest.
 *
 * Data rules (same honesty as the Shop tabs): a cell is Equipped only from
 * the real inventory flag, Free only for items the viewer really owns for
 * free (XP / admin grant) or that really cost 0 DP coin, and a DP price only
 * from the live store listing. Counts are the full section length.
 */
import type { InventoryItemView } from '@/src/services/gamification';
import type { StoreItemView } from '@/src/services/monetization';

/** The two collections of the mock's toggle. */
export type CollectionMode = 'free' | 'dp';

/** Section types of the mock, in order, with the filter chip label. */
export const COLLECTION_SECTIONS = [
  { type: 'frame', title: 'Avatar Frames', chip: 'Frames' },
  { type: 'theme', title: 'Profile Themes', chip: 'Themes' },
  { type: 'badge', title: 'Badges', chip: 'Badges' },
  { type: 'title', title: 'Titles', chip: 'Titles' },
  { type: 'effect', title: 'Effects', chip: 'Effects' },
] as const;
export type CollectionType = (typeof COLLECTION_SECTIONS)[number]['type'];

/** Cells of a section's first row; "View All" expands to the full grid. */
export const COLLECTION_ROW_MAX = 6;

/**
 * Bottom pill of a cell:
 *  - equipped: the green Equipped pill + check;
 *  - owned-free: "Free" with the cyan diamond (XP reward, admin grant, or a 0-price store item already owned);
 *  - owned-dp: "Owned" with the coin (bought with DP coin);
 *  - buy-free: "Free" with the diamond — a live 0-price store item, ready to claim;
 *  - buy: "DP3,000" with the coin — the live store price.
 */
export type CellState = 'equipped' | 'owned-free' | 'owned-dp' | 'buy-free' | 'buy';

export interface CollectionCell {
  id: string;
  type: string;
  name: string;
  rarity: string;
  asset: Record<string, any>;
  state: CellState;
  /** Live store price for buy / buy-free cells, else null. */
  priceCoins: number | null;
  /** Real acquisition time for sorting owned cells (newest first). */
  acquiredAt: number | null;
}

/** XP / free artwork, mirrored from cosmeticArt.ts (kept import-free so this file stays pure). */
const isXpArt = (asset: Record<string, any> | null | undefined): boolean => {
  if (asset?.tier === 'xp' || asset?.collection === 'xp40') return true;
  if (asset?.tier === 'premium' || typeof asset?.imageUrl === 'string') return false;
  return !String(asset?.key ?? '').startsWith('shop.');
};

/** A DP coin item: bought in the Shop, or a Premium item granted by an admin (PremiumCollection.isPremiumOwned). */
export const isDpOwned = (i: Pick<InventoryItemView, 'owned' | 'asset' | 'source'>): boolean => {
  if (!i.owned || i.asset?.collection === 'xp40') return false;
  if (i.source === 'store') return true;
  return !isXpArt(i.asset); // premium artwork: tier 'premium', an uploaded image or a shop.* key
};

const isFreeOwned = (i: InventoryItemView): boolean => !isDpOwned(i);

/** The item both sides know: inventory rows win (they carry equipped / acquiredAt); store rows add live prices. */
export function collectionCells({
  inventory,
  store,
  mode,
  type,
}: {
  inventory: InventoryItemView[];
  store: StoreItemView[];
  mode: CollectionMode;
  type: string;
}): CollectionCell[] {
  const cells: CollectionCell[] = [];
  const seen = new Set<string>();

  for (const i of inventory) {
    if (i?.type !== type || !i.owned) continue;
    seen.add(i.id);
    const state: CellState = i.equipped ? 'equipped' : isDpOwned(i) ? 'owned-dp' : 'owned-free';
    cells.push({ id: i.id, type: i.type, name: i.name, rarity: i.rarity, asset: i.asset ?? {}, state, priceCoins: null, acquiredAt: i.acquiredAt ?? null });
  }
  for (const s of store) {
    if (s?.type !== type || seen.has(s.itemId)) continue;
    // A store row the inventory already has is covered above; store.owned without an inventory row still reads owned.
    if (s.owned) {
      cells.push({ id: s.itemId, type: s.type, name: s.name, rarity: s.rarity, asset: s.asset ?? {}, state: isXpArt(s.asset) ? 'owned-free' : 'owned-dp', priceCoins: null, acquiredAt: null });
      continue;
    }
    const state: CellState = s.priceCoins === 0 ? 'buy-free' : 'buy';
    cells.push({ id: s.itemId, type: s.type, name: s.name, rarity: s.rarity, asset: s.asset ?? {}, state, priceCoins: s.priceCoins, acquiredAt: null });
  }

  const filtered = mode === 'dp' ? cells.filter((c) => c.state === 'equipped' || c.state === 'owned-dp' || c.state === 'buy') : cells;
  const rank = (c: CollectionCell) => (c.state === 'equipped' ? 0 : c.state === 'owned-free' || c.state === 'owned-dp' ? 1 : 2);
  return filtered.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (rank(a) === 1) return (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0);
    if (rank(a) === 2) return (a.priceCoins ?? 0) - (b.priceCoins ?? 0);
    return 0;
  });
}

/** Section of the page: the type's cells in the current mode and the first row. */
export interface CollectionSection {
  type: string;
  title: string;
  /** Full count of the section (the "(24)" of the mock header). */
  count: number;
  row: CollectionCell[];
  all: CollectionCell[];
}

export function collectionSections(args: { inventory: InventoryItemView[]; store: StoreItemView[]; mode: CollectionMode; only?: string | null }): CollectionSection[] {
  const out: CollectionSection[] = [];
  for (const s of COLLECTION_SECTIONS) {
    if (args.only && args.only !== s.type) continue;
    const all = collectionCells({ inventory: args.inventory, store: args.store, mode: args.mode, type: s.type });
    if (!all.length) continue;
    out.push({ type: s.type, title: s.title, count: all.length, row: all.slice(0, COLLECTION_ROW_MAX), all });
  }
  return out;
}

/** Free items the viewer can still claim (0-price live store items): the Earn strip of the page. */
export function claimableFree(store: StoreItemView[]): StoreItemView[] {
  return store.filter((s) => !s.owned && s.priceCoins === 0);
}

/** True for an owned item the viewer never paid DP coin for (the mock's "Earned / Unlocked (Free)"). */
export const isEarned = (i: InventoryItemView): boolean => !!i.owned && isFreeOwned(i);
