/**
 * Cosmetic artwork for admin previews. The files are the app's own, so the
 * admin preview is the exact artwork users see, with no second copy:
 *
 *   - Premium (Shop) items: apps/expo/assets/shop/digital, key `shop.<kind>_<file>`,
 *     plus an animated overlay in `<kind>/fx/<file>.svg`;
 *   - XP legacy items: apps/expo/assets/xp/<category>/<file>.svg;
 *   - XP40 free items: apps/expo/assets/xp/<category>/<item>/source.svg.
 */
// Vite reads the glob options statically, so they must be written inline.
const shopFiles = import.meta.glob("../../../expo/assets/shop/digital/*/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const shopFx = import.meta.glob("../../../expo/assets/shop/digital/*/fx/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const xpFiles = import.meta.glob("../../../expo/assets/xp/*/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
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
    const m = path.match(/\/([a-z]+)\/([a-z0-9_]+)\.svg$/);
    if (!m || !SINGULAR[m[1]]) continue;
    const kind = SINGULAR[m[1]];
    const fx = tier === "premium" ? Object.entries(shopFx).find(([p]) => p.endsWith(`/${m[1]}/fx/${m[2]}.svg`))?.[1] ?? null : null;
    SHOP_ART[`${prefix}.${kind}_${m[2]}`] = { kind, url, fxUrl: fx, tier };
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

export function shopArtFor(asset: Record<string, unknown> | null | undefined): Art | null {
  const key = asset?.key;
  return typeof key === "string" ? SHOP_ART[key] ?? null : null;
}

/** XP (earned) or Premium (bought): `asset.tier`, then the key prefix; earned by default. */
export function tierOf(asset: Record<string, unknown> | null | undefined): Tier {
  if (asset?.tier === "premium" || asset?.tier === "xp") return asset.tier;
  return typeof asset?.key === "string" && asset.key.startsWith("shop.") ? "premium" : "xp";
}

export const RARITY_COLOR: Record<string, string> = {
  common: "#9AA3AD",
  uncommon: "#22C55E",
  rare: "#3B82F6",
  epic: "#A855F7",
  legendary: "#F59E0B",
};

/** Two hex colours from `asset.colors`, for items without artwork. */
export function assetColors(asset: Record<string, unknown> | null | undefined): [string, string] {
  const c = Array.isArray(asset?.colors) ? (asset!.colors as unknown[]).filter((x): x is string => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)) : [];
  if (c.length >= 2) return [c[0], c[1]];
  if (c.length === 1) return [c[0], c[0]];
  return ["#FF4D67", "#8B5CF6"];
}
