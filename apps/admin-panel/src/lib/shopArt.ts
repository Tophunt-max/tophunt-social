/**
 * Shop artwork for admin previews. The files are the app's own
 * (apps/expo/assets/shop/digital), so the admin preview is the exact artwork
 * users see, with no second copy to keep in sync. A catalog item points at
 * one through `asset.key` = `shop.<kind>_<file>`, e.g. `shop.frame_royal_crown`
 * for frames/royal_crown.svg.
 */
const files = import.meta.glob("../../../expo/assets/shop/digital/*/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const SINGULAR: Record<string, string> = { frames: "frame", themes: "theme", badges: "badge", titles: "title" };

export const SHOP_ART: Record<string, { kind: string; url: string }> = {};
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/\/([a-z]+)\/([a-z0-9_]+)\.svg$/);
  if (!m || !SINGULAR[m[1]]) continue;
  const kind = SINGULAR[m[1]];
  SHOP_ART[`shop.${kind}_${m[2]}`] = { kind, url };
}

export function shopArtFor(asset: Record<string, unknown> | null | undefined) {
  const key = asset?.key;
  return typeof key === "string" ? SHOP_ART[key] ?? null : null;
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
