/**
 * Admin-managed blocks of the Shop home: the hero slider and the
 * "Special Offers & Daily Deals" cards.
 *
 * Stored under `appConfig.monetization.store.slider` / `.deals` and saved
 * through `POST /admin/app-settings` like the featured drop
 * (lib/monetizationConfig.ts), so they reuse its validation entry point,
 * version bump, cache purge, realtime push and audit line.
 *
 * Honesty rules:
 *  - a slide or a deal card only POINTS at real things (catalog items, a
 *    product, a filter of the Digital tab, an in-app path). Price, stock and
 *    the sale window still come from the listing / product;
 *  - a deal card has no admin-typed discount. Its "UP TO X% OFF" ribbon is
 *    computed by the app from the compare-at prices of the source's live
 *    items (store_listings.compare_at_coins, shop_products.compare_at_inr_paise),
 *    and is hidden when that is 0;
 *  - a countdown / timer is shown only for a real end time the admin set
 *    (deals may also use the soonest real listing end of their items).
 *
 * The public projection contains only what is live now (server time), and
 * only while the store (digital sources) / shop (product sources) is open.
 */
import { httpsError } from "./http";
import { ITEM_TYPES, RARITIES } from "./cosmetics";

/** Same id format as reward_catalog / store_listings (lib/store.ts). */
export const ITEM_ID_RE = /^[a-z0-9_-]{2,40}$/;
/** Slide / deal-card ids: same format as item ids. */
export const BLOCK_ID_RE = /^[a-z0-9_-]{2,40}$/;
/** Physical product ids (routes/adminMonetization.ts PUT /monetization/shop/products/:id). */
export const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;
const MAX_URL = 1000;
const MAX_PATH = 120;

export const SLIDER_LIMITS = {
  maxSlides: 8,
  autoplaySec: [2, 15] as const,
  badge: 24,
  title: 60,
  subtitle: 140,
  ctaLabel: 24,
  maxItems: 12,
} as const;

export const DEALS_LIMITS = {
  maxCards: 6,
  sectionTitle: 40,
  title: 40,
  subtitle: 90,
  ctaLabel: 20,
  minItems: 1,
  maxItems: 24,
} as const;

export const SLIDE_TARGET_KINDS = ["items", "item", "digital", "physical", "product", "url"] as const;
export type SlideTargetKind = (typeof SLIDE_TARGET_KINDS)[number];
export const DEAL_SOURCE_KINDS = ["digital_items", "product", "all_discounts"] as const;
export type DealSourceKind = (typeof DEAL_SOURCE_KINDS)[number];

export type SlideTarget =
  /** Digital tab filtered to the slide's itemIds. */
  | { kind: "items" }
  /** /shop/item/<itemId>. */
  | { kind: "item"; itemId: string }
  /** Digital tab, optionally filtered by one item type and/or a set of rarities. */
  | { kind: "digital"; type: string | null; rarities: string[] }
  /** Physical tab. */
  | { kind: "physical" }
  /** /shop/<productId>. */
  | { kind: "product"; productId: string }
  /** An in-app path ("/explore/battles"). Never an external URL. */
  | { kind: "url"; path: string };

export interface ShopSlide {
  id: string;
  enabled: boolean;
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  /** Desktop / wide artwork (https). null = draw the item art. */
  imageUrl: string | null;
  /** Phone artwork (https). null = imageUrl, else the item art. */
  mobileImageUrl: string | null;
  /** reward_catalog ids drawn as the art when there is no image (first live one). */
  itemIds: string[];
  target: SlideTarget;
  startsAt: number | null;
  endsAt: number | null;
  /** Countdown to endsAt; rendered only when endsAt is set. */
  showCountdown: boolean;
}

export interface ShopSliderConfig {
  enabled: boolean;
  autoplaySec: number;
  slides: ShopSlide[];
}

export type DealSource =
  | { kind: "digital_items"; itemIds: string[] }
  | { kind: "product"; productId: string }
  | { kind: "all_discounts" };

export interface ShopDealCard {
  id: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  ctaLabel: string;
  imageUrl: string | null;
  source: DealSource;
  /** 'auto' = "UP TO X% OFF" computed from real compare-at prices; 'none' = no ribbon. */
  ribbon: "auto" | "none";
  startsAt: number | null;
  endsAt: number | null;
  showTimer: boolean;
}

export interface ShopDealsConfig {
  enabled: boolean;
  title: string;
  cards: ShopDealCard[];
}

export const SLIDER_DEFAULTS: ShopSliderConfig = { enabled: false, autoplaySec: 4, slides: [] };
export const DEALS_DEFAULTS: ShopDealsConfig = { enabled: false, title: "Special Offers & Daily Deals", cards: [] };
const SLIDE_CTA_DEFAULT = "Explore Collection";
const DEAL_CTA_DEFAULT = "Grab Now";

type Bad = (m: string) => never;
const mkBad = (): Bad => (m: string): never => {
  throw httpsError("invalid-argument", `monetization: ${m}`);
};

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** https only, parseable, no credentials, no whitespace. The same rule as Explore banner images. */
export function isSafeImageUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > MAX_URL || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** An in-app path: starts with one "/", no scheme, no "//", no backslash, ≤120 chars. */
export function isSafeAppPath(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length >= 1 &&
    v.length <= MAX_PATH &&
    v.startsWith("/") &&
    !v.includes("//") &&
    !v.includes("\\") &&
    /^\/[A-Za-z0-9\-._~/?=&%#+]*$/.test(v)
  );
}

// ------------------------------------------------------------------ shared checks

function only(v: Record<string, unknown>, keys: readonly string[], path: string, bad: Bad) {
  for (const k of Object.keys(v)) if (!keys.includes(k)) bad(`unknown setting ${path}.${k}.`);
}

function text(v: unknown, path: string, max: number, opts: { required: boolean; fallback: string }, bad: Bad): string {
  if (v === undefined) {
    if (opts.required && !opts.fallback) bad(`${path} is required.`);
    return opts.fallback;
  }
  if (typeof v !== "string") return bad(`${path} must be text.`);
  const t = v.trim();
  if (opts.required && !t) bad(`${path} cannot be empty.`);
  if (t.length > max) bad(`${path} must be at most ${max} characters.`);
  return t;
}

function boolOf(v: unknown, path: string, fallback: boolean, bad: Bad): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") bad(`${path} must be true or false.`);
  return v as boolean;
}

function timeOf(v: unknown, path: string, bad: Bad): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) bad(`${path} must be a time (ms) or null.`);
  return v as number;
}

function imageOf(v: unknown, path: string, bad: Bad): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (!isSafeImageUrl(v)) bad(`${path} must be an https image URL (upload it from the panel).`);
  return v as string;
}

function itemIdsOf(v: unknown, path: string, [min, max]: readonly [number, number], bad: Bad): string[] {
  if (v === undefined) {
    if (min > 0) bad(`${path} is required.`);
    return [];
  }
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !ITEM_ID_RE.test(x))) {
    bad(`${path} must be a list of item ids (2-40 lowercase letters, digits, _ or -).`);
  }
  const ids = v as string[];
  if (new Set(ids).size !== ids.length) bad(`${path} has the same item twice.`);
  if (ids.length < min || ids.length > max) bad(`${path} must have ${min} to ${max} items.`);
  return [...ids];
}

function windowOf(raw: Record<string, unknown>, path: string, bad: Bad): { startsAt: number | null; endsAt: number | null } {
  const startsAt = timeOf(raw.startsAt, `${path}.startsAt`, bad);
  const endsAt = timeOf(raw.endsAt, `${path}.endsAt`, bad);
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) bad(`${path}.endsAt must be after startsAt.`);
  return { startsAt, endsAt };
}

function uniqueIds(list: { id: string }[], path: string, bad: Bad) {
  const seen = new Set<string>();
  for (const x of list) {
    if (seen.has(x.id)) bad(`${path} has the id "${x.id}" twice.`);
    seen.add(x.id);
  }
}

// ------------------------------------------------------------------ slider

function slideTargetOf(v: unknown, path: string, itemIds: string[], bad: Bad): SlideTarget {
  if (!isObj(v)) return bad(`${path} must be an object with a kind.`);
  const kind = v.kind;
  if (!(SLIDE_TARGET_KINDS as readonly string[]).includes(kind)) bad(`${path}.kind must be one of ${SLIDE_TARGET_KINDS.join(", ")}.`);
  switch (kind as SlideTargetKind) {
    case "items":
      only(v, ["kind"], path, bad);
      if (!itemIds.length) bad(`${path}: kind "items" needs at least one item in itemIds.`);
      return { kind: "items" };
    case "item":
      only(v, ["kind", "itemId"], path, bad);
      if (typeof v.itemId !== "string" || !ITEM_ID_RE.test(v.itemId)) bad(`${path}.itemId must be an item id.`);
      return { kind: "item", itemId: v.itemId };
    case "digital": {
      only(v, ["kind", "type", "rarities"], path, bad);
      const type = v.type === undefined || v.type === null || v.type === "" ? null : v.type;
      if (type !== null && !(ITEM_TYPES as readonly string[]).includes(type)) bad(`${path}.type must be one of ${ITEM_TYPES.join(", ")}.`);
      const r = v.rarities === undefined || v.rarities === null ? [] : v.rarities;
      if (!Array.isArray(r) || r.some((x) => !(RARITIES as readonly string[]).includes(x))) bad(`${path}.rarities must be a list of ${RARITIES.join(", ")}.`);
      if (new Set(r).size !== r.length) bad(`${path}.rarities has the same rarity twice.`);
      return { kind: "digital", type, rarities: [...r] };
    }
    case "physical":
      only(v, ["kind"], path, bad);
      return { kind: "physical" };
    case "product":
      only(v, ["kind", "productId"], path, bad);
      if (typeof v.productId !== "string" || !PRODUCT_ID_RE.test(v.productId)) bad(`${path}.productId must be a product id.`);
      return { kind: "product", productId: v.productId };
    case "url":
      only(v, ["kind", "path"], path, bad);
      if (!isSafeAppPath(v.path)) bad(`${path}.path must be an app path starting with "/" (max ${MAX_PATH} characters, no "//", no external links).`);
      return { kind: "url", path: v.path };
  }
  return bad(`${path}.kind is not supported.`);
}

const SLIDE_KEYS = ["id", "enabled", "badge", "title", "subtitle", "ctaLabel", "imageUrl", "mobileImageUrl", "itemIds", "target", "startsAt", "endsAt", "showCountdown"] as const;

/** One slide, strictly checked and normalised (trimmed, defaults filled). Throws on anything wrong. */
export function checkSlide(raw: unknown, path: string, bad: Bad = mkBad()): ShopSlide {
  if (!isObj(raw)) return bad(`${path} must be an object.`);
  only(raw, SLIDE_KEYS, path, bad);
  if (typeof raw.id !== "string" || !BLOCK_ID_RE.test(raw.id)) bad(`${path}.id must be 2-40 lowercase letters, digits, _ or -.`);
  const L = SLIDER_LIMITS;
  const itemIds = itemIdsOf(raw.itemIds, `${path}.itemIds`, [0, L.maxItems], bad);
  const imageUrl = imageOf(raw.imageUrl, `${path}.imageUrl`, bad);
  const mobileImageUrl = imageOf(raw.mobileImageUrl, `${path}.mobileImageUrl`, bad);
  if (!imageUrl && !mobileImageUrl && !itemIds.length) bad(`${path} needs an image or at least one item to draw.`);
  const { startsAt, endsAt } = windowOf(raw, path, bad);
  return {
    id: raw.id,
    enabled: boolOf(raw.enabled, `${path}.enabled`, false, bad),
    badge: text(raw.badge, `${path}.badge`, L.badge, { required: false, fallback: "" }, bad),
    title: text(raw.title, `${path}.title`, L.title, { required: true, fallback: "" }, bad),
    subtitle: text(raw.subtitle, `${path}.subtitle`, L.subtitle, { required: false, fallback: "" }, bad),
    ctaLabel: text(raw.ctaLabel, `${path}.ctaLabel`, L.ctaLabel, { required: true, fallback: SLIDE_CTA_DEFAULT }, bad),
    imageUrl,
    mobileImageUrl,
    itemIds,
    target: slideTargetOf(raw.target, `${path}.target`, itemIds, bad),
    startsAt,
    endsAt,
    showCountdown: boolOf(raw.showCountdown, `${path}.showCountdown`, false, bad),
  };
}

/** Validate `store.slider` of an admin patch, normalising its slides in place. */
export function validateSliderPatch(s: unknown): void {
  const bad = mkBad();
  if (s === undefined) return;
  if (!isObj(s)) return bad("store.slider must be an object.");
  only(s, ["enabled", "autoplaySec", "slides"], "store.slider", bad);
  boolOf(s.enabled, "store.slider.enabled", false, bad);
  if (s.autoplaySec !== undefined) {
    const [min, max] = SLIDER_LIMITS.autoplaySec;
    if (typeof s.autoplaySec !== "number" || !Number.isInteger(s.autoplaySec) || s.autoplaySec < min || s.autoplaySec > max) {
      bad(`store.slider.autoplaySec must be a whole number from ${min} to ${max}.`);
    }
  }
  if (s.slides !== undefined) {
    if (!Array.isArray(s.slides)) return bad("store.slider.slides must be a list.");
    if (s.slides.length > SLIDER_LIMITS.maxSlides) bad(`store.slider.slides: at most ${SLIDER_LIMITS.maxSlides} slides.`);
    const slides = s.slides.map((x: unknown, i: number) => checkSlide(x, `store.slider.slides[${i}]`, bad));
    uniqueIds(slides, "store.slider.slides", bad);
    s.slides = slides;
  }
}

/** The stored slider with defaults; never throws. A malformed slide is dropped, not the slider. */
export function parseSlider(raw: unknown): ShopSliderConfig {
  const d = SLIDER_DEFAULTS;
  const s = isObj(raw) ? raw : {};
  const [min, max] = SLIDER_LIMITS.autoplaySec;
  const sec = typeof s.autoplaySec === "number" && Number.isInteger(s.autoplaySec) && s.autoplaySec >= min && s.autoplaySec <= max ? s.autoplaySec : d.autoplaySec;
  const slides: ShopSlide[] = [];
  const seen = new Set<string>();
  for (const [i, x] of (Array.isArray(s.slides) ? s.slides : []).entries()) {
    if (slides.length >= SLIDER_LIMITS.maxSlides) break;
    try {
      const slide = checkSlide(x, `slides[${i}]`);
      if (seen.has(slide.id)) continue;
      seen.add(slide.id);
      slides.push(slide);
    } catch {
      /* dropped */
    }
  }
  return { enabled: s.enabled === true, autoplaySec: sec, slides };
}

const live = (x: { enabled: boolean; startsAt: number | null; endsAt: number | null }, nowMs: number) =>
  x.enabled && (x.startsAt === null || x.startsAt <= nowMs) && (x.endsAt === null || x.endsAt > nowMs);

export interface PublicSlide {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  imageUrl: string | null;
  mobileImageUrl: string | null;
  itemIds: string[];
  target: SlideTarget;
  endsAt: number | null;
  showCountdown: boolean;
}

/**
 * The slider as the app may see it, or null: only while the store is open,
 * the slider is on and at least one slide is live (enabled, started, not
 * ended, by server time). The app then falls back to the featured drop.
 */
export function publicSlider(storeEnabled: boolean, s: ShopSliderConfig, nowMs: number): { autoplaySec: number; slides: PublicSlide[] } | null {
  if (!storeEnabled || !s.enabled) return null;
  const slides = s.slides.filter((x) => live(x, nowMs)).map((x) => ({
    id: x.id,
    badge: x.badge,
    title: x.title,
    subtitle: x.subtitle,
    ctaLabel: x.ctaLabel,
    imageUrl: x.imageUrl,
    mobileImageUrl: x.mobileImageUrl,
    itemIds: x.itemIds,
    target: x.target,
    endsAt: x.endsAt,
    showCountdown: x.showCountdown && x.endsAt !== null,
  }));
  return slides.length ? { autoplaySec: s.autoplaySec, slides } : null;
}

// ------------------------------------------------------------------ deals

function dealSourceOf(v: unknown, path: string, bad: Bad): DealSource {
  if (!isObj(v)) return bad(`${path} must be an object with a kind.`);
  if (!(DEAL_SOURCE_KINDS as readonly string[]).includes(v.kind)) bad(`${path}.kind must be one of ${DEAL_SOURCE_KINDS.join(", ")}.`);
  switch (v.kind as DealSourceKind) {
    case "digital_items":
      only(v, ["kind", "itemIds"], path, bad);
      return { kind: "digital_items", itemIds: itemIdsOf(v.itemIds, `${path}.itemIds`, [DEALS_LIMITS.minItems, DEALS_LIMITS.maxItems], bad) };
    case "product":
      only(v, ["kind", "productId"], path, bad);
      if (typeof v.productId !== "string" || !PRODUCT_ID_RE.test(v.productId)) bad(`${path}.productId must be a product id.`);
      return { kind: "product", productId: v.productId };
    case "all_discounts":
      only(v, ["kind"], path, bad);
      return { kind: "all_discounts" };
  }
  return bad(`${path}.kind is not supported.`);
}

const DEAL_KEYS = ["id", "enabled", "title", "subtitle", "ctaLabel", "imageUrl", "source", "ribbon", "startsAt", "endsAt", "showTimer"] as const;

/** One deal card, strictly checked and normalised. There is no discount field: the app computes it. */
export function checkDealCard(raw: unknown, path: string, bad: Bad = mkBad()): ShopDealCard {
  if (!isObj(raw)) return bad(`${path} must be an object.`);
  only(raw, DEAL_KEYS, path, bad);
  if (typeof raw.id !== "string" || !BLOCK_ID_RE.test(raw.id)) bad(`${path}.id must be 2-40 lowercase letters, digits, _ or -.`);
  const L = DEALS_LIMITS;
  const ribbon = raw.ribbon === undefined ? "auto" : raw.ribbon;
  if (ribbon !== "auto" && ribbon !== "none") bad(`${path}.ribbon must be "auto" or "none".`);
  const { startsAt, endsAt } = windowOf(raw, path, bad);
  return {
    id: raw.id,
    enabled: boolOf(raw.enabled, `${path}.enabled`, false, bad),
    title: text(raw.title, `${path}.title`, L.title, { required: true, fallback: "" }, bad),
    subtitle: text(raw.subtitle, `${path}.subtitle`, L.subtitle, { required: false, fallback: "" }, bad),
    ctaLabel: text(raw.ctaLabel, `${path}.ctaLabel`, L.ctaLabel, { required: true, fallback: DEAL_CTA_DEFAULT }, bad),
    imageUrl: imageOf(raw.imageUrl, `${path}.imageUrl`, bad),
    source: dealSourceOf(raw.source, `${path}.source`, bad),
    ribbon: ribbon as "auto" | "none",
    startsAt,
    endsAt,
    showTimer: boolOf(raw.showTimer, `${path}.showTimer`, false, bad),
  };
}

/** Validate `store.deals` of an admin patch, normalising its cards in place. */
export function validateDealsPatch(d: unknown): void {
  const bad = mkBad();
  if (d === undefined) return;
  if (!isObj(d)) return bad("store.deals must be an object.");
  only(d, ["enabled", "title", "cards"], "store.deals", bad);
  boolOf(d.enabled, "store.deals.enabled", false, bad);
  if (d.title !== undefined) d.title = text(d.title, "store.deals.title", DEALS_LIMITS.sectionTitle, { required: true, fallback: "" }, bad);
  if (d.cards !== undefined) {
    if (!Array.isArray(d.cards)) return bad("store.deals.cards must be a list.");
    if (d.cards.length > DEALS_LIMITS.maxCards) bad(`store.deals.cards: at most ${DEALS_LIMITS.maxCards} cards.`);
    const cards = d.cards.map((x: unknown, i: number) => checkDealCard(x, `store.deals.cards[${i}]`, bad));
    uniqueIds(cards, "store.deals.cards", bad);
    d.cards = cards;
  }
}

/** The stored deals block with defaults; never throws. A malformed card is dropped. */
export function parseDeals(raw: unknown): ShopDealsConfig {
  const d = DEALS_DEFAULTS;
  const s = isObj(raw) ? raw : {};
  const title = typeof s.title === "string" && s.title.trim() && s.title.trim().length <= DEALS_LIMITS.sectionTitle ? s.title.trim() : d.title;
  const cards: ShopDealCard[] = [];
  const seen = new Set<string>();
  for (const [i, x] of (Array.isArray(s.cards) ? s.cards : []).entries()) {
    if (cards.length >= DEALS_LIMITS.maxCards) break;
    try {
      const card = checkDealCard(x, `cards[${i}]`);
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    } catch {
      /* dropped */
    }
  }
  return { enabled: s.enabled === true, title, cards };
}

export interface PublicDealCard {
  id: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  imageUrl: string | null;
  source: DealSource;
  ribbon: "auto" | "none";
  endsAt: number | null;
  showTimer: boolean;
}

/**
 * The deal cards as the app may see them, or null: only while the deals block
 * is on and at least one card is live by server time AND its source's side is
 * open (digital sources need the store, a product the physical shop).
 */
export function publicDeals(
  open: { store: boolean; shop: boolean },
  d: ShopDealsConfig,
  nowMs: number,
): { title: string; cards: PublicDealCard[] } | null {
  if (!d.enabled) return null;
  const cards = d.cards
    .filter((c) => live(c, nowMs) && (c.source.kind === "product" ? open.shop : open.store))
    .map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      ctaLabel: c.ctaLabel,
      imageUrl: c.imageUrl,
      source: c.source,
      ribbon: c.ribbon,
      endsAt: c.endsAt,
      showTimer: c.showTimer,
    }));
  return cards.length ? { title: d.title, cards } : null;
}
