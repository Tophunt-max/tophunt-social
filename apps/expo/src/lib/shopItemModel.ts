/**
 * Pure logic of the Shop item detail screen (app/shop/item/[id].tsx): which
 * preview contexts an item type has, what the sticky buy bar offers, the
 * "also in bundles / collections" lookups, similar items and the hero tag.
 *
 * No react-native import: tested in plain Node (test/shopItemModel.test.ts).
 * Every signal comes from the server listing; nothing is invented.
 */
import {
  bundleAvailable,
  cardTag,
  hasRealStock,
  isShort,
  trendingGrid,
  type ShopBundleDef,
  type ShopCollectionDef,
  type ShopItem,
} from '@/src/lib/shopModel';
import { rarityRankOf } from '@/src/theme/tophuntTokens';

// ------------------------------------------------------------------ equip

/** Worker EQUIP_SLOTS (apps/worker/src/lib/cosmetics.ts): the slot is the item type. */
export const EQUIP_SLOTS = ['frame', 'theme', 'title', 'badge', 'accessory', 'effect'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** The equip slot for an item type, or null when the type cannot be equipped (sticker, collectible). */
export function equipSlotFor(type: string | null | undefined): EquipSlot | null {
  const t = String(type ?? '');
  return (EQUIP_SLOTS as readonly string[]).includes(t) ? (t as EquipSlot) : null;
}

/**
 * Whether the item is the one equipped in its slot, from getInventory:
 * the per-item `equipped` flag when the item is listed, else the `equipped`
 * map (slot → item id, or an object with an `id`). Unknown → false.
 */
export function isEquipped(
  inventory: { equipped?: Record<string, unknown> | null; items?: { id: string; equipped?: boolean }[] | null } | null | undefined,
  item: Pick<ShopItem, 'itemId' | 'type'>,
): boolean {
  if (!inventory) return false;
  const row = inventory.items?.find((i) => i.id === item.itemId);
  if (row && typeof row.equipped === 'boolean') return row.equipped;
  const slot = equipSlotFor(item.type);
  if (!slot) return false;
  const v = inventory.equipped?.[slot];
  if (typeof v === 'string') return v === item.itemId;
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: unknown }).id === item.itemId;
  return false;
}

// ------------------------------------------------------------------ preview contexts

export type PreviewContext = 'profile' | 'post' | 'comment' | 'battle';
export const PREVIEW_CONTEXT_LABEL: Record<PreviewContext, string> = {
  profile: 'Profile',
  post: 'Post',
  comment: 'Comment',
  battle: 'Battle',
};

/**
 * Where an item type actually shows once equipped (EQUIP_WHERE), in tab
 * order. Frames ring the avatar everywhere; badges sit next to the name on
 * profile, posts, comments and battle cards; titles show under the name on
 * profile, posts and comments; themes and effects are profile only; stickers
 * are sent in comments. Unknown types get the profile preview only.
 */
export function previewContexts(type: string | null | undefined): PreviewContext[] {
  switch (type) {
    case 'frame':
    case 'badge':
      return ['profile', 'post', 'comment', 'battle'];
    case 'title':
      return ['profile', 'post', 'comment'];
    case 'sticker':
      return ['comment'];
    default:
      return ['profile'];
  }
}

// ------------------------------------------------------------------ buy bar

export type BuyBarState = 'buy' | 'short' | 'ended' | 'soon' | 'equip' | 'equipped' | 'owned' | 'signin';

/**
 * What the sticky bottom bar offers:
 *  - signed out → 'signin';
 *  - owned → 'equipped' / 'equip' for equippable types, else 'owned' (it lives in the collection);
 *  - sale not started → 'soon'; ended or sold out → 'ended';
 *  - a known balance below the price → 'short' (earn CTA; an unknown balance never blocks);
 *  - else 'buy'.
 */
export function buyBarState(
  item: Pick<ShopItem, 'type' | 'owned' | 'priceCoins' | 'startsAt' | 'endsAt' | 'remaining'>,
  opts: { signedIn: boolean; live: boolean; dpcoin: number; now: number; equipped: boolean },
): BuyBarState {
  if (!opts.signedIn) return 'signin';
  if (item.owned) {
    if (!equipSlotFor(item.type)) return 'owned';
    return opts.equipped ? 'equipped' : 'equip';
  }
  if (typeof item.startsAt === 'number' && Number.isFinite(item.startsAt) && item.startsAt > opts.now) return 'soon';
  if (typeof item.endsAt === 'number' && Number.isFinite(item.endsAt) && item.endsAt > 0 && item.endsAt <= opts.now) return 'ended';
  if (typeof item.remaining === 'number' && item.remaining <= 0) return 'ended';
  if (isShort(opts.dpcoin, item.priceCoins, opts.live)) return 'short';
  return 'buy';
}

/** DP coin still needed, or null when the balance is unknown or enough. */
export function coinsShort(dpcoin: number, price: number, live: boolean): number | null {
  return isShort(dpcoin, price, live) ? Math.max(0, price - dpcoin) : null;
}

// ------------------------------------------------------------------ availability

export interface Availability {
  /** Real units left (a limit was set and units remain). */
  stockLeft: number | null;
  /** A real future sale end (drives the countdown chip). */
  saleEndsAt: number | null;
  /** A real future sale start ("Coming soon"). */
  startsAt: number | null;
}

/** Availability chips, only from real listing fields; nothing for an owned item. */
export function availability(item: Pick<ShopItem, 'owned' | 'remaining' | 'endsAt' | 'startsAt'>, now: number): Availability {
  if (item.owned) return { stockLeft: null, saleEndsAt: null, startsAt: null };
  const future = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > now ? v : null);
  return {
    stockLeft: hasRealStock(item as ShopItem) ? (item.remaining as number) : null,
    saleEndsAt: future(item.endsAt),
    startsAt: future(item.startsAt),
  };
}

// ------------------------------------------------------------------ hero tag

export type HeroTag = { kind: 'new' | 'limited' | 'trending'; label: 'NEW' | 'LIMITED' | 'TRENDING' };

/**
 * The hero's top-right pill: NEW / LIMITED from cardTag (listing date, real
 * stock or sale end), else TRENDING when the item is among the top sellers by
 * real units sold (the count itself is never shown). Null otherwise: rarity
 * already has its own badge.
 */
export function heroTag<T extends ShopItem>(item: T, all: T[], now: number, trendingMax = 6): HeroTag | null {
  const tag = cardTag(item, now);
  if (tag.kind === 'new') return { kind: 'new', label: 'NEW' };
  if (tag.kind === 'limited') return { kind: 'limited', label: 'LIMITED' };
  if ((Number(item.soldCount) || 0) <= 0) return null;
  const g = trendingGrid(all, trendingMax);
  if (g.title === 'Trending' && g.items.some((i) => i.itemId === item.itemId)) return { kind: 'trending', label: 'TRENDING' };
  return null;
}

// ------------------------------------------------------------------ related

/** Bundles that include the item; with `now`, only ones on sale or already bought (visibleBundles rule). */
export function bundlesWithItem<B extends ShopBundleDef>(bundles: B[] | null | undefined, itemId: string, now?: number): B[] {
  return (bundles ?? []).filter(
    (b) => b.items.some((i) => i.itemId === itemId) && (typeof now !== 'number' || b.purchased || bundleAvailable(b, now)),
  );
}

/** Admin collections that list the item. */
export function collectionsWithItem<C extends Pick<ShopCollectionDef, 'itemIds'>>(collections: C[] | null | undefined, itemId: string): C[] {
  return (collections ?? []).filter((c) => c.itemIds.includes(itemId));
}

export const SIMILAR_MAX = 8;

/**
 * Up to `max` other store items like this one: same type first, then same
 * rarity; within a group the closest rarity and price first. Owned items go
 * last. Items sharing neither type nor rarity are not "similar" and are left out.
 */
export function similarItems<T extends ShopItem>(item: T, all: T[] | null | undefined, max = SIMILAR_MAX): T[] {
  const rank = rarityRankOf(item.rarity);
  return (all ?? [])
    .filter((i) => i.itemId !== item.itemId && (i.type === item.type || i.rarity === item.rarity))
    .map((i, n) => ({
      i,
      n,
      type: i.type === item.type ? 1 : 0,
      rarity: i.rarity === item.rarity ? 1 : 0,
      dr: Math.abs(rarityRankOf(i.rarity) - rank),
      dp: Math.abs((Number(i.priceCoins) || 0) - (Number(item.priceCoins) || 0)),
    }))
    .sort(
      (a, b) =>
        Number(a.i.owned) - Number(b.i.owned) ||
        b.type - a.type ||
        b.rarity - a.rarity ||
        a.dr - b.dr ||
        a.dp - b.dp ||
        a.n - b.n,
    )
    .slice(0, Math.max(0, max))
    .map((x) => x.i);
}

// ------------------------------------------------------------------ share

/** The app link of an item, or null without an app origin (no dead links). */
export function itemShareUrl(origin: string | null | undefined, itemId: string): string | null {
  if (!origin || !itemId) return null;
  return `${origin.replace(/\/+$/, '')}/shop/item/${encodeURIComponent(itemId)}`;
}

/** Share caption (the link is inside it, so the OS sheet does not print it twice). */
export function itemShareCaption(name: string, url: string): string {
  return `TopHunt Shop par "${name}" dekho: ${url}`;
}
