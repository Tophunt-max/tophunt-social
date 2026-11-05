/**
 * Shop artwork overrides. The app ships every decorative Shop icon and
 * illustration as a transparent WebP (apps/expo/assets/icons/shop, registry
 * `SHOP_ICONS`). An admin can upload a WebP or PNG for any key (Shop → Shop
 * Assets); the app then shows the upload instead of the bundled art, and
 * "Reset" brings the bundled art back.
 *
 * Stored in appConfig.shopAssets as { [key]: publicUrl } and delivered with
 * /read/app-config (lib/appControl.ts#publicAppConfig) and the realtime config
 * push. Only known keys and our own `shop-assets/` uploads are accepted, both
 * on save and again when the public config is built.
 */
import { SHOP_ASSET_PREFIX } from "./mediaCategories";
import type { ImageHeader } from "./earningAssets";

/**
 * [key, bundled WebP under apps/expo/assets/icons/shop, aspect width, aspect
 * height, single-colour glyph the app tints]. Must match the app registry;
 * apps/expo/test/shopIcons.test.ts checks it.
 */
export const SHOP_ICON_FILES: readonly (readonly [string, string, number, number, boolean])[] = [
  ["tileFrame", "tiles/frame.webp", 48, 40, false],
  ["tileTheme", "tiles/theme.webp", 48, 40, false],
  ["tileBadge", "tiles/badge.webp", 48, 40, false],
  ["tileTitle", "tiles/title.webp", 48, 40, false],
  ["tileVs", "tiles/vs.webp", 48, 40, false],
  ["tileVictory", "tiles/victory.webp", 48, 40, false],
  ["tileEffect", "tiles/effect.webp", 48, 40, false],
  ["tileGifts", "tiles/gifts.webp", 48, 40, false],
  ["tileEmotes", "tiles/emotes.webp", 48, 40, false],
  ["tileSound", "tiles/sound.webp", 48, 40, false],
  ["tileMore", "tiles/more.webp", 48, 40, false],
  ["crownOrnament", "art/crown-ornament.webp", 56, 34, false],
  ["crownGold", "art/crown-gold.webp", 48, 36, false],
  ["crownViolet", "art/crown-violet.webp", 48, 36, false],
  ["wingedCrown", "art/winged-crown.webp", 110, 70, false],
  ["shopBag", "art/shop-bag.webp", 110, 110, false],
  ["chest", "art/chest.webp", 110, 80, false],
  ["collectionBox", "art/collection-box.webp", 48, 40, false],
  ["clipboard", "art/clipboard.webp", 48, 40, false],
  ["dealRibbon", "art/deal-ribbon.webp", 44, 48, false],
  ["star", "icons/star.webp", 24, 24, false],
  ["flame", "icons/flame.webp", 24, 24, false],
  ["box", "icons/box.webp", 24, 24, false],
  ["bagGold", "icons/bag-gold.webp", 24, 24, false],
  ["bagGoldOutline", "icons/bag-gold-outline.webp", 24, 24, false],
  ["bagPink", "icons/bag-pink.webp", 24, 24, false],
  ["bagPinkOutline", "icons/bag-pink-outline.webp", 24, 24, false],
  ["bolt", "icons/bolt.webp", 24, 24, false],
  ["shirt", "icons/shirt.webp", 24, 24, false],
  ["heart", "icons/heart.webp", 24, 24, false],
  ["clock", "icons/clock.webp", 24, 24, false],
  ["badge", "icons/badge.webp", 24, 24, false],
  ["trophy", "icons/trophy.webp", 24, 24, false],
  ["laurel", "glyphs/laurel.webp", 12, 24, true],
  ["cubeLine", "glyphs/cube-line.webp", 24, 24, true],
  ["tabBag", "glyphs/tab-bag.webp", 24, 24, true],
  ["tabLayers", "glyphs/tab-layers.webp", 24, 24, true],
  ["tabCube", "glyphs/tab-cube.webp", 24, 24, true],
  ["tabCrown", "glyphs/tab-crown.webp", 24, 24, true],
];

const BY_KEY = new Map(SHOP_ICON_FILES.map((r) => [r[0], r]));
export const SHOP_ICON_KEYS: ReadonlySet<string> = new Set(BY_KEY.keys());
export const shopIconSpec = (key: string) => BY_KEY.get(key) ?? null;

/** Max bytes for one uploaded artwork (it is drawn at icon / banner size). */
export const SHOP_ASSET_MAX_BYTES = 1024 * 1024;
export const SHOP_ASSET_MIME_TYPES = ["image/webp", "image/png"];
/** Longest side, px. The shortest side may be smaller for narrow art (the 1:2 laurel). */
export const SHOP_ASSET_MIN_SIDE = 128;
export const SHOP_ASSET_MAX_SIDE = 2048;

const KEY_PATH = new RegExp(`^/${SHOP_ASSET_PREFIX}/[0-9]{4}/[0-9]{2}/[A-Za-z0-9-]{8,64}\\.(webp|png)$`);

/**
 * True for an https URL of an object uploadToR2 wrote under `shop-assets/`
 * (`<yyyy>/<mm>/<uuid>.webp|png`): no query, fragment, credentials or
 * traversal. With `publicBase` it must also be on our media origin.
 */
export function isShopAssetUrl(url: unknown, publicBase?: string | null): url is string {
  if (typeof url !== "string" || url.length > 500) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.search || u.hash || u.username || u.password) return false;
  if (u.href !== url) return false;
  const base = String(publicBase ?? "").trim().replace(/\/+$/, "");
  if (base) {
    if (!url.startsWith(`${base}/`)) return false;
    return KEY_PATH.test("/" + url.slice(base.length + 1));
  }
  const at = u.pathname.indexOf(`/${SHOP_ASSET_PREFIX}/`);
  return at >= 0 && KEY_PATH.test(u.pathname.slice(at));
}

/** Keeps only known keys with a valid upload URL. */
export function sanitizeShopAssets(raw: unknown, publicBase?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SHOP_ICON_KEYS.has(k) && isShopAssetUrl(v, publicBase)) out[k] = v;
  }
  return out;
}

/**
 * Why an upload can't replace `key`, or null when it fits: the same aspect
 * ratio as the bundled art (within 2%), 128-2048 px on the longest side,
 * with an alpha channel.
 */
export function shopAssetProblem(key: string, h: ImageHeader | null): string | null {
  const spec = shopIconSpec(key);
  if (!spec) return "Unknown artwork key.";
  if (!h) return "The file is not a readable WebP or PNG image.";
  const [, , aw, ah] = spec;
  const want = aw / ah;
  const got = h.width / h.height;
  if (Math.abs(got - want) > want * 0.02) {
    return `This artwork must be ${aw}:${ah} (for example ${Math.round((512 * aw) / Math.max(aw, ah))}x${Math.round((512 * ah) / Math.max(aw, ah))} px); got ${h.width}x${h.height}.`;
  }
  const long = Math.max(h.width, h.height);
  if (long < SHOP_ASSET_MIN_SIDE) return `Artwork must be at least ${SHOP_ASSET_MIN_SIDE} px on its longest side (got ${h.width}x${h.height}).`;
  if (long > SHOP_ASSET_MAX_SIDE) return `Artwork must be at most ${SHOP_ASSET_MAX_SIDE} px on its longest side (got ${h.width}x${h.height}).`;
  if (!h.alpha) return "Artwork needs a transparent background (export with an alpha channel).";
  return null;
}
