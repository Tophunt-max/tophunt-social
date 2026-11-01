/**
 * Shop home logic: categories, rails, the featured drop, filters and the
 * purchase error mapping. Pure (no react-native import) so it runs in vitest.
 *
 * Honesty rules every builder follows:
 *  - a rail is built only from a real signal the server sent (sale start /
 *    listing time, units sold, a stock limit or a sale end), and is omitted
 *    when that signal is missing or empty;
 *  - nothing here invents a countdown, a stock number or a "drop": the
 *    featured banner exists only when the admin configured one and it is live.
 */
import { rarityRankOf } from '@/src/theme/tophuntTokens';

/** The fields of a store listing (services/monetization StoreItemView) the model reads. */
export interface ShopItem {
  itemId: string;
  type: string;
  name: string;
  description?: string;
  rarity: string;
  priceCoins: number;
  remaining: number | null;
  endsAt: number | null;
  owned: boolean;
  /** Older servers do not send these three; every builder treats missing as "no signal". */
  startsAt?: number | null;
  createdAt?: number | null;
  soldCount?: number | null;
}

// ------------------------------------------------------------------ tabs

export type ShopTab = 'shop' | 'digital' | 'physical';

/** `?tab=` deep link → tab. Unknown / missing → the overview, or Physical when only products are on. */
export function parseShopTab(param: unknown, storeOn: boolean, shopOn: boolean): ShopTab {
  const v = Array.isArray(param) ? param[0] : param;
  if (v === 'physical') return 'physical';
  if (v === 'digital') return 'digital';
  if (!storeOn && shopOn) return 'physical';
  return 'shop';
}

// ------------------------------------------------------------------ categories

export interface CategoryDef {
  type: string;
  label: string;
  /** Icon name from src/lib/icons.tsx (Ionicons set). */
  icon: string;
}

/** Display order. Only types the store actually has are shown. */
export const CATEGORY_DEFS: CategoryDef[] = [
  { type: 'frame', label: 'Avatar Frames', icon: 'person-circle' },
  { type: 'theme', label: 'Profile Themes', icon: 'color-palette' },
  { type: 'badge', label: 'Badges', icon: 'ribbon' },
  { type: 'title', label: 'Titles', icon: 'pricetag-outline' },
  { type: 'effect', label: 'Profile Effects', icon: 'sparkles' },
  { type: 'sticker', label: 'Stickers', icon: 'sticker-outline' },
  { type: 'collectible', label: 'Collectibles', icon: 'diamond' },
  { type: 'accessory', label: 'Accessories', icon: 'cube' },
];

export const TYPE_LABEL: Record<string, string> = Object.fromEntries(CATEGORY_DEFS.map((c) => [c.type, c.label]));

/** Singular label for one item ("Avatar frame"). */
export const TYPE_SINGULAR: Record<string, string> = {
  frame: 'Avatar frame',
  theme: 'Profile theme',
  badge: 'Name badge',
  title: 'Title',
  effect: 'Profile effect',
  sticker: 'Sticker',
  collectible: 'Collectible',
  accessory: 'Accessory',
};

/** Where an item shows once equipped ("Equip kahan hoga"). */
export const EQUIP_WHERE: Record<string, string> = {
  frame: 'Aapki DP ke around: profile, posts, comments, battles aur leaderboard par.',
  theme: 'Aapke profile ka background banega.',
  badge: 'Aapke naam ke saath: profile, posts aur comments mein.',
  title: 'Aapke naam ke neeche title chip ke roop mein.',
  effect: 'Aapke profile par animated effect.',
  accessory: 'Aapki DP par accessory.',
  sticker: 'Aapke profile showcase mein dikhega.',
  collectible: 'Aapke profile showcase mein dikhega.',
};

export interface CategoryCard<T extends ShopItem = ShopItem> extends CategoryDef {
  count: number;
  /** The rarest item of the type, for the card artwork. */
  sample: T;
}

const byRarityThenPrice = (a: ShopItem, b: ShopItem) =>
  rarityRankOf(b.rarity) - rarityRankOf(a.rarity) || b.priceCoins - a.priceCoins || a.itemId.localeCompare(b.itemId);

/** One card per item type present in the store, with its live count. Unknown types follow, with a generic label. */
export function deriveCategories<T extends ShopItem>(items: T[]): CategoryCard<T>[] {
  const groups = new Map<string, T[]>();
  for (const i of items) {
    if (!i?.type) continue;
    const g = groups.get(i.type);
    if (g) g.push(i);
    else groups.set(i.type, [i]);
  }
  const known = CATEGORY_DEFS.filter((d) => groups.has(d.type));
  const extra: CategoryDef[] = [...groups.keys()]
    .filter((t) => !TYPE_LABEL[t])
    .sort()
    .map((t) => ({ type: t, label: t.charAt(0).toUpperCase() + t.slice(1), icon: 'sparkles' }));
  return [...known, ...extra].map((d) => {
    const g = groups.get(d.type)!;
    return { ...d, count: g.length, sample: [...g].sort(byRarityThenPrice)[0] };
  });
}

/** The Virtual Gifts card: only when gifts are switched on AND the catalogue has gifts. */
export function giftsCategory(giftsEnabled: boolean, giftCount: number | null | undefined): { label: string; count: number } | null {
  const n = Number(giftCount) || 0;
  return giftsEnabled && n > 0 ? { label: 'Virtual Gifts', count: n } : null;
}

// ------------------------------------------------------------------ rails

export const RAIL_MAX = 10;
/** "New arrivals" means listed (or opened for sale) in the last 30 days. */
export const NEW_WINDOW_MS = 30 * 86_400_000;

const validTs = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** When the item arrived in the store: its sale start, else its listing time. */
export function arrivedAt(i: ShopItem): number | null {
  return validTs(i.startsAt) ?? validTs(i.createdAt);
}

export function newArrivals<T extends ShopItem>(items: T[], now: number, max = RAIL_MAX): T[] {
  return items
    .map((i) => ({ i, at: arrivedAt(i) }))
    .filter((x): x is { i: T; at: number } => x.at !== null && x.at <= now && now - x.at <= NEW_WINDOW_MS)
    .sort((a, b) => b.at - a.at || a.i.itemId.localeCompare(b.i.itemId))
    .slice(0, max)
    .map((x) => x.i);
}

export function popular<T extends ShopItem>(items: T[], max = RAIL_MAX): T[] {
  return items
    .filter((i) => (Number(i.soldCount) || 0) > 0)
    .sort((a, b) => (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0) || byRarityThenPrice(a, b))
    .slice(0, max);
}

/** Real stock left (a limit was set and units remain). */
export const hasRealStock = (i: ShopItem) => typeof i.remaining === 'number' && i.remaining > 0;
/** A real, future sale end. */
export function isFutureDeadline(ts: unknown, now: number): boolean {
  const v = validTs(ts);
  return v !== null && v > now;
}

/** Items with a real stock limit or a real sale end, soonest end / fewest left first. */
export function limitedEdition<T extends ShopItem>(items: T[], now: number, max = RAIL_MAX): T[] {
  return items
    .filter((i) => hasRealStock(i) || isFutureDeadline(i.endsAt, now))
    .sort((a, b) => {
      const ea = isFutureDeadline(a.endsAt, now) ? (a.endsAt as number) : Infinity;
      const eb = isFutureDeadline(b.endsAt, now) ? (b.endsAt as number) : Infinity;
      if (ea !== eb) return ea - eb;
      const ra = hasRealStock(a) ? (a.remaining as number) : Infinity;
      const rb = hasRealStock(b) ? (b.remaining as number) : Infinity;
      return ra - rb || byRarityThenPrice(a, b);
    })
    .slice(0, max);
}

export const isLegendaryPlus = (i: ShopItem) => rarityRankOf(i.rarity) >= rarityRankOf('legendary');

export function legendaryCollection<T extends ShopItem>(items: T[], max = RAIL_MAX): T[] {
  return items.filter(isLegendaryPlus).sort(byRarityThenPrice).slice(0, max);
}

/** The rarest items the viewer does not own yet ("Sabse rare items"). */
export function rarestUnowned<T extends ShopItem>(items: T[], max = RAIL_MAX): T[] {
  return items.filter((i) => !i.owned).sort(byRarityThenPrice).slice(0, max);
}

export type RailId = 'new' | 'popular' | 'limited' | 'legendary' | 'rarest';
export interface Rail<T extends ShopItem = ShopItem> {
  id: RailId;
  title: string;
  sub: string;
  items: T[];
}

/**
 * The overview rails, in order, without empty ones. "Sabse rare items" is the
 * fallback only when there is no featured banner and no Legendary rail.
 */
export function buildRails<T extends ShopItem>(items: T[], now: number, opts: { hasFeatured: boolean }): Rail<T>[] {
  const rails: Rail<T>[] = [
    { id: 'new', title: 'New arrivals', sub: 'Pichhle 30 din mein shop mein aaye', items: newArrivals(items, now) },
    { id: 'popular', title: 'Popular', sub: 'Sabse zyada kharide gaye', items: popular(items) },
    { id: 'limited', title: 'Limited edition', sub: 'Limited stock ya sale khatam hone wali', items: limitedEdition(items, now) },
    { id: 'legendary', title: 'Legendary collection', sub: 'Legendary aur Mythic items', items: legendaryCollection(items) },
  ];
  const out = rails.filter((r) => r.items.length > 0);
  if (!opts.hasFeatured && !out.some((r) => r.id === 'legendary')) {
    const rare = rarestUnowned(items);
    if (rare.length) out.push({ id: 'rarest', title: 'Sabse rare items', sub: 'Jo abhi aapke paas nahi hain', items: rare });
  }
  return out;
}

/** The overview grid: "Trending" only when something has actually sold; otherwise plain store order. */
export function trendingGrid<T extends ShopItem>(items: T[], max = 8): { title: string; sub: string; items: T[] } {
  const sold = items.some((i) => (Number(i.soldCount) || 0) > 0);
  if (!sold) return { title: 'Shop ke items', sub: 'Profile par sab ko dikhega', items: items.slice(0, max) };
  const order = new Map(items.map((i, n) => [i.itemId, n]));
  const sorted = [...items].sort((a, b) => (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0) || order.get(a.itemId)! - order.get(b.itemId)!);
  return { title: 'Trending', sub: 'Abhi sabse zyada kharide ja rahe', items: sorted.slice(0, max) };
}

// ------------------------------------------------------------------ featured drop

/** The public `monetization.store.featured` block (worker lib/monetizationConfig.ts publicFeatured). */
export interface PublicFeaturedDrop {
  badge: string;
  title: string;
  subtitle: string;
  itemIds: string[];
  heroItemId: string;
  endsAt: number | null;
  ctaLabel: string;
}

export interface FeaturedView<T extends ShopItem = ShopItem> {
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  hero: T;
  /** Featured items that are live in the store, in the admin's order. */
  items: T[];
  itemIds: string[];
  /** Set only for a real, future end: the countdown shows only then. */
  endsAt: number | null;
}

/**
 * The banner, or null. Null when the config is missing or malformed, has
 * ended (client clock, as a second check after the server's), or none of its
 * items is live in the store right now.
 */
export function featuredView<T extends ShopItem>(cfg: unknown, items: T[], now: number): FeaturedView<T> | null {
  const f = cfg as Partial<PublicFeaturedDrop> | null | undefined;
  if (!f || typeof f !== 'object' || typeof f.title !== 'string' || !f.title.trim() || !Array.isArray(f.itemIds)) return null;
  const end = validTs(f.endsAt);
  if (end !== null && end <= now) return null;
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const live = f.itemIds.filter((id): id is string => typeof id === 'string').map((id) => byId.get(id)).filter((i): i is T => !!i);
  if (!live.length) return null;
  const hero = (typeof f.heroItemId === 'string' && byId.get(f.heroItemId) && live.find((i) => i.itemId === f.heroItemId)) || live[0];
  return {
    badge: typeof f.badge === 'string' && f.badge.trim() ? f.badge.trim() : 'Legendary Drop',
    title: f.title.trim(),
    subtitle: typeof f.subtitle === 'string' ? f.subtitle.trim() : '',
    ctaLabel: typeof f.ctaLabel === 'string' && f.ctaLabel.trim() ? f.ctaLabel.trim() : 'Explore Now',
    hero,
    items: live,
    itemIds: live.map((i) => i.itemId),
    endsAt: end,
  };
}

// ------------------------------------------------------------------ digital filters

export interface DigitalFilter {
  type: string | null;
  rarity: string | null;
  query: string;
  /** Restrict to these ids (the featured drop's "Explore"). */
  ids: string[] | null;
}

export const NO_FILTER: DigitalFilter = { type: null, rarity: null, query: '', ids: null };

export function filterDigital<T extends ShopItem>(items: T[], f: DigitalFilter): T[] {
  const q = f.query.trim().toLowerCase();
  const ids = f.ids ? new Set(f.ids) : null;
  const out = items.filter(
    (i) =>
      (!ids || ids.has(i.itemId)) &&
      (!f.type || i.type === f.type) &&
      (!f.rarity || i.rarity === f.rarity) &&
      (!q || `${i.name} ${i.description ?? ''} ${TYPE_LABEL[i.type] ?? i.type} ${i.rarity}`.toLowerCase().includes(q)),
  );
  if (!f.ids) return out;
  // Featured order, not store order.
  const pos = new Map(f.ids.map((id, n) => [id, n]));
  return out.sort((a, b) => (pos.get(a.itemId) ?? 0) - (pos.get(b.itemId) ?? 0));
}

/** Rarities present in the store, lowest to highest. */
export function presentRarities(items: ShopItem[]): string[] {
  return [...new Set(items.map((i) => i.rarity))].sort((a, b) => rarityRankOf(a) - rarityRankOf(b));
}

// ------------------------------------------------------------------ purchase

/** Balance after paying `price`, or null when the balance is not known yet (never a fake 0). */
export function balanceAfter(balance: number, price: number, live: boolean): number | null {
  if (!live) return null;
  return balance - price;
}

/** True only when the balance is known and short: an unknown balance never blocks (the server decides). */
export function isShort(balance: number, price: number, live: boolean): boolean {
  return live && balance < price;
}

export type PurchaseErrorKind =
  | 'insufficient'
  | 'owned'
  | 'price_changed'
  | 'unavailable'
  | 'store_closed'
  | 'revoked'
  | 'network'
  | 'other';

export interface PurchaseErrorView {
  kind: PurchaseErrorKind;
  title: string;
  message: string;
  /** Retry with the SAME request id (the server may already have the purchase). */
  retrySameRequest: boolean;
  /** Reload the store (price / stock changed). */
  refresh: boolean;
}

/**
 * Map a buyStoreItem failure to what the sheet shows. A failure with no HTTP
 * status never reached a server answer, so it is retried with the same request
 * id: if the first attempt did go through, the server replays it instead of
 * charging again.
 */
export function purchaseErrorView(e: unknown): PurchaseErrorView {
  const err = (e ?? {}) as { status?: number; reason?: string; message?: string };
  const view = (kind: PurchaseErrorKind, title: string, message: string, extra: Partial<PurchaseErrorView> = {}): PurchaseErrorView => ({
    kind, title, message, retrySameRequest: false, refresh: false, ...extra,
  });
  switch (err.reason) {
    case 'insufficient_coins':
      return view('insufficient', 'DP coin kam hai', 'Is item ke liye aapke paas DP coin kaafi nahi hain. Contest jeeto aur DP coin kamao.');
    case 'already_owned':
      return view('owned', 'Ye pehle se aapka hai', 'Ye item aapke collection mein already hai. Equip karke use karo.');
    case 'price_changed':
      return view('price_changed', 'Price badal gaya', 'Is item ka price abhi update hua hai. Naya price dekh kar dobara confirm karo.', { refresh: true });
    case 'item_unavailable':
      return view('unavailable', 'Item available nahi hai', 'Ye item ab sale par nahi hai ya stock khatam ho gaya.', { refresh: true });
    case 'store_disabled':
      return view('store_closed', 'Store abhi band hai', 'Digital store thodi der ke liye band hai. Baad mein try karo.');
    case 'item_revoked':
      return view('revoked', 'Ye item nahi mil sakta', err.message || 'Ye item aapke account se hataya gaya tha, isliye dobara nahi kharida ja sakta.');
  }
  if (!err.status) {
    return view('network', 'Connection nahi hua', 'Network issue. Dobara try karo: ye wahi request hai, isliye double charge nahi hoga.', { retrySameRequest: true });
  }
  return view('other', 'Purchase nahi hua', err.message || 'Kuch galat ho gaya. Thodi der baad try karo.');
}
