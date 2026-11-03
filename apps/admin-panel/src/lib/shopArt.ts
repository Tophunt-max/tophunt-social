/**
 * Cosmetic artwork for admin previews. The files are the app's own, so the
 * admin preview is the exact artwork users see, with no second copy:
 *
 *   - Premium (Shop) items: apps/expo/assets/shop/digital, key `shop.<kind>_<file>`, transparent WebP,
 *     plus an animated overlay in `<kind>/fx/<file>.webp`;
 *   - XP legacy items: apps/expo/assets/xp/<category>/<file>.webp, key `xp.<kind>_<file>`;
 *   - XP40 free items: apps/expo/assets/xp/<category>/<item>/source.svg, key `xp40.<kind>_<item>`.
 */
// Vite reads the glob options statically, so they must be written inline.
const shopFiles = import.meta.glob("../../../expo/assets/shop/digital/*/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const shopFx = import.meta.glob("../../../expo/assets/shop/digital/*/fx/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const xpFiles = import.meta.glob("../../../expo/assets/xp/*/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const xp40Files = import.meta.glob("../../../expo/assets/xp/*/*/source.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const SINGULAR: Record<string, string> = {
  frames: "frame", themes: "theme", badges: "badge", titles: "title",
  stickers: "sticker", collectibles: "collectible", effects: "effect",
};

export type Tier = "xp" | "premium";
export interface Art { kind: string; url: string; fxUrl: string | null; tier: Tier }

export const SHOP_ART: Record<string, Art> = {};

function index(files: Record<string, string>, prefix: "shop" | "xp", tier: Tier) {
  for (const [path, url] of Object.entries(files)) {
    const m = path.match(/\/([a-z]+)\/([a-z0-9_]+)\.webp$/);
    if (!m || !SINGULAR[m[1]]) continue;
    const kind = SINGULAR[m[1]];
    const fxUrl = tier === "premium"
      ? Object.entries(shopFx).find(([fxPath]) => fxPath.endsWith(`/${m[1]}/fx/${m[2]}.webp`))?.[1] ?? null
      : null;
    SHOP_ART[`${prefix}.${kind}_${m[2]}`] = { kind, url, fxUrl, tier };
  }
}
index(shopFiles, "shop", "premium");
index(xpFiles, "xp", "xp");
for (const [path, url] of Object.entries(xp40Files)) {
  const match = path.match(/\/([a-z]+)\/([a-z0-9-]+)\/source\.svg$/);
  if (!match || !SINGULAR[match[1]]) continue;
  const kind = SINGULAR[match[1]];
  SHOP_ART[`xp40.${kind}_${match[2].replace(/-/g, "_")}`] = { kind, url, fxUrl: null, tier: "xp" };
}

/** https only, no credentials, no whitespace: the only urls that reach an <img src>. */
export function safeArtUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500 || !/^https:\/\/[^\s/@]+\/\S+$/i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * The artwork users see: an uploaded WebP (asset.imageUrl / fxUrl) first, as
 * in the app (apps/expo/src/lib/cosmeticArt.ts), else the bundled file for asset.key.
 */
export function shopArtFor(asset: Record<string, unknown> | null | undefined, type?: string): Art | null {
  const url = safeArtUrl(asset?.imageUrl);
  if (url) {
    const kind = typeof asset?.artKind === "string" ? asset.artKind : type ?? "sticker";
    return { kind, url, fxUrl: safeArtUrl(asset?.fxUrl), tier: asset?.tier === "xp" ? "xp" : "premium" };
  }
  const key = asset?.key;
  return typeof key === "string" ? SHOP_ART[key] ?? null : null;
}

/** "uploaded" / "bundled" / "none": where an item's artwork comes from. */
export function artSource(asset: Record<string, unknown> | null | undefined): "uploaded" | "bundled" | "none" {
  if (safeArtUrl(asset?.imageUrl)) return "uploaded";
  return typeof asset?.key === "string" && SHOP_ART[asset.key] ? "bundled" : "none";
}

/** XP (earned) or Premium (bought): `asset.tier`, then the key prefix; earned by default. */
export function tierOf(asset: Record<string, unknown> | null | undefined): Tier {
  if (asset?.tier === "premium" || asset?.tier === "xp") return asset.tier;
  if (safeArtUrl(asset?.imageUrl)) return "premium";
  return typeof asset?.key === "string" && asset.key.startsWith("shop.") ? "premium" : "xp";
}

export const RARITY_COLOR: Record<string, string> = {
  common: "#9AA3AD",
  uncommon: "#22C55E",
  rare: "#3B82F6",
  epic: "#A855F7",
  legendary: "#F59E0B",
  mythic: "#EC4899",
};

/** Every rarity the Worker accepts, lowest to highest (worker lib/cosmetics.ts RARITIES). */
export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;

/** Two hex colours from `asset.colors`, for items without artwork. */
export function assetColors(asset: Record<string, unknown> | null | undefined): [string, string] {
  const c = Array.isArray(asset?.colors) ? (asset!.colors as unknown[]).filter((x): x is string => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)) : [];
  if (c.length >= 2) return [c[0], c[1]];
  if (c.length === 1) return [c[0], c[0]];
  return ["#FF4D67", "#8B5CF6"];
}
