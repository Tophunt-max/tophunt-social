/**
 * Phone "Digital" tab home (design mock): which items each shelf shows, the
 * tag on each card, the "from" price of the category cards and when the
 * filtered catalogue is shown instead. Pure (no react-native import) so it
 * runs in vitest.
 *
 * Same honesty rules as shopModel.ts: every tag, price and target comes from
 * a field the server sent; a category with nothing on sale is "soon" (no
 * price), never an invented one.
 */
import { rarityRankOf, rarityToken } from '@/src/theme/tophuntTokens';
import { byRarityThenPrice, cardTag, type CardTag, type DigitalFilter, type ShopItem, type TileKey } from './shopModel';

/** Cards per shelf (one row each in the mock). */
export const DIGITAL_SHELF_MAX = { theme: 4, frame: 4, badge: 5, title: 4 } as const;
export type ShelfType = keyof typeof DIGITAL_SHELF_MAX;

/** True when no real filter is set: the Digital tab shows its home instead of the filtered catalogue. */
export function isDefaultDigitalFilter(f: DigitalFilter | null | undefined): boolean {
  if (!f) return true;
  return !f.type && !f.rarity && !f.query.trim() && !f.ids && !f.wishlist && !f.rarities?.length && !f.discounted;
}

/** Live items of `type`, rarest then most expensive first, at most `max`. */
export function digitalShelf<T extends ShopItem>(items: T[], type: string, max: number): T[] {
  return items.filter((i) => i?.type === type).sort(byRarityThenPrice).slice(0, Math.max(0, max));
}

/** The four shelves of the Digital home (themes, frames, badges, titles). An empty shelf is hidden by the screen. */
export function digitalShelves<T extends ShopItem>(items: T[], max: Record<ShelfType, number> = DIGITAL_SHELF_MAX): Record<ShelfType, T[]> {
  return {
    theme: digitalShelf(items, 'theme', max.theme),
    frame: digitalShelf(items, 'frame', max.frame),
    badge: digitalShelf(items, 'badge', max.badge),
    title: digitalShelf(items, 'title', max.title),
  };
}

const validPrice = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Lowest real DP coin price of the live items of `type`, or null when there are none. */
export function fromPrice(items: Pick<ShopItem, 'type' | 'priceCoins'>[], type: string): number | null {
  let min: number | null = null;
  for (const i of items) if (i?.type === type && validPrice(i.priceCoins) && (min === null || i.priceCoins < min)) min = i.priceCoins;
  return min;
}

/** Gift catalogue entries are priced in DP coin (services/monetization GiftView.priceCoins, "DP coin" in GiftSheet). */
export interface GiftPriceLike {
  priceCoins: number;
}

/** Lowest real DP coin price in the gift catalogue (gifts on only), or null. A free gift (0) is not a price. */
export function giftFromPrice(gifts: GiftPriceLike[] | null | undefined, enabled = true): number | null {
  if (!enabled || !gifts?.length) return null;
  let min: number | null = null;
  for (const g of gifts) if (validPrice(g?.priceCoins) && g.priceCoins > 0 && (min === null || g.priceCoins < min)) min = g.priceCoins;
  return min;
}

export type DigitalTagKind = CardTag['kind'] | 'premium' | 'free';
export interface DigitalTag {
  kind: DigitalTagKind;
  label: string;
  /** Rarity id when the label is a rarity (colour from the rarity token). */
  rarity?: string;
}

/**
 * Corner pill of a Digital home card, each backed by a real field:
 *  - FREE when the price is 0;
 *  - the rarity name for Legendary and Mythic (gold / mythic pill);
 *  - NEW / LIMITED from cardTag (real listing time, stock or sale end);
 *  - PREMIUM for a paid item with premium artwork (`premiumArt`, cosmeticTier);
 *  - else the rarity name.
 */
export function digitalTag(i: ShopItem, now: number, premiumArt: boolean): DigitalTag {
  if (i.priceCoins === 0) return { kind: 'free', label: 'FREE' };
  if (rarityRankOf(i.rarity) >= rarityRankOf('legendary')) return { kind: 'rarity', label: rarityToken(i.rarity).label.toUpperCase(), rarity: i.rarity };
  const t = cardTag(i, now);
  if (t.kind !== 'rarity') return t;
  if (premiumArt && i.priceCoins > 0) return { kind: 'premium', label: 'PREMIUM' };
  return t;
}

/** The small pill of a Titles card: FREE for a 0 price, else the rarity name. */
export function rarityPill(i: Pick<ShopItem, 'priceCoins' | 'rarity'>): DigitalTag {
  if (i.priceCoins === 0) return { kind: 'free', label: 'FREE' };
  return { kind: 'rarity', label: rarityToken(i.rarity).label.toUpperCase(), rarity: i.rarity };
}

export type SpecialKey = 'vs' | 'victory' | 'effect' | 'gifts';

export interface SpecialCard {
  key: SpecialKey;
  /** TileArt key of the art on the left. */
  tile: TileKey;
  title: string;
  sub: string;
  /**
   * 'price': a real lowest price (`price`); 'soon': nothing on sale (the
   * "Jaldi aa raha hai" chip, tap → toast); 'none': no price line and no
   * chip (the gift catalogue is still loading, or has only free gifts).
   */
  state: 'price' | 'soon' | 'none';
  price: number | null;
  /** Where a tap goes: a store type, the gift catalogue, or nowhere (toast). */
  target: { kind: 'type'; type: string } | { kind: 'gifts' } | null;
}

const SPECIAL_DEFS: { key: SpecialKey; title: string; sub: string; type: string | null }[] = [
  { key: 'vs', title: 'VS Effects', sub: 'Battle & Voting Effects', type: null },
  { key: 'victory', title: 'Victory Animations', sub: 'Winner Celebration Effects', type: null },
  { key: 'effect', title: 'Profile Effects', sub: 'Profile Glow & Special FX', type: 'effect' },
  { key: 'gifts', title: 'Virtual Gifts', sub: 'Send & Receive Gifts', type: null },
];

/**
 * The 2×2 category cards. VS Effects and Victory Animations have no store
 * item type yet, so they are always "soon". Profile Effects is the 'effect'
 * type. Virtual Gifts is the gift catalogue (`gifts` null = still loading).
 */
export function specialCards(
  items: Pick<ShopItem, 'type' | 'priceCoins'>[],
  gifts: { enabled: boolean; list: GiftPriceLike[] | null | undefined },
): SpecialCard[] {
  return SPECIAL_DEFS.map((d) => {
    const base = { key: d.key, tile: d.key as TileKey, title: d.title, sub: d.sub };
    if (d.key === 'gifts') {
      if (!gifts.enabled) return { ...base, state: 'soon', price: null, target: null };
      if (gifts.list == null) return { ...base, state: 'none', price: null, target: null };
      if (!gifts.list.length) return { ...base, state: 'soon', price: null, target: null };
      const price = giftFromPrice(gifts.list);
      // Gifts exist: the card opens them; a price line only when one is real.
      return { ...base, state: price === null ? 'none' : 'price', price, target: { kind: 'gifts' } };
    }
    const price = d.type ? fromPrice(items, d.type) : null;
    if (d.type && price !== null) return { ...base, state: 'price', price, target: { kind: 'type', type: d.type } };
    return { ...base, state: 'soon', price: null, target: null };
  });
}
