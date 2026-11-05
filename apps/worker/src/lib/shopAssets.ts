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
  ["uiChevron", "ui/chevron-left.webp", 10, 16, true],
  ["uiArrow", "ui/arrow-right.webp", 24, 24, true],
  ["uiClose", "ui/x.webp", 24, 24, true],
  ["uiCloseCircle", "ui/circle-x.webp", 24, 24, true],
  ["uiAward", "ui/award.webp", 24, 24, true],
  ["uiBrush", "ui/brush.webp", 24, 24, true],
  ["uiChartColumn", "ui/chart-column.webp", 24, 24, true],
  ["uiFlag", "ui/flag.webp", 24, 24, true],
  ["uiLeaf", "ui/leaf.webp", 24, 24, true],
  ["uiLightbulb", "ui/lightbulb.webp", 24, 24, true],
  ["uiUsers", "ui/users.webp", 24, 24, true],
  ["uiVideo", "ui/video.webp", 24, 24, true],
  ["uiXCircle", "ui/x-circle.webp", 24, 24, true],
  ["uiAlertCircle", "ui/alert-circle.webp", 24, 24, true],
  ["uiArrowLeftRight", "ui/arrow-left-right.webp", 24, 24, true],
  ["uiBan", "ui/ban.webp", 24, 24, true],
  ["uiBell", "ui/bell.webp", 24, 24, true],
  ["uiCalendar", "ui/calendar.webp", 24, 24, true],
  ["uiCap", "ui/cap.webp", 24, 24, true],
  ["uiCheck", "ui/check.webp", 24, 24, true],
  ["uiCheckCircle2", "ui/check-circle-2.webp", 24, 24, true],
  ["uiChevronDown", "ui/chevron-down.webp", 24, 24, true],
  ["uiCircle", "ui/circle.webp", 24, 24, true],
  ["uiCircleUser", "ui/circle-user.webp", 24, 24, true],
  ["uiClock", "ui/clock.webp", 24, 24, true],
  ["uiCloudOff", "ui/cloud-off.webp", 24, 24, true],
  ["uiCoffee", "ui/coffee.webp", 24, 24, true],
  ["uiCreditCard", "ui/credit-card.webp", 24, 24, true],
  ["uiCrown", "ui/crown.webp", 24, 24, true],
  ["uiEyeOff", "ui/eye-off.webp", 24, 24, true],
  ["uiFlame", "ui/flame.webp", 24, 24, true],
  ["uiGem", "ui/gem.webp", 24, 24, true],
  ["uiGift", "ui/gift.webp", 24, 24, true],
  ["uiHeadphones", "ui/headphones.webp", 24, 24, true],
  ["uiHeart", "ui/heart.webp", 24, 24, true],
  ["uiHeartFilled", "ui/heart-filled.webp", 24, 24, true],
  ["uiImage", "ui/image.webp", 24, 24, true],
  ["uiInfinity", "ui/infinity.webp", 24, 24, true],
  ["uiInfo", "ui/info.webp", 24, 24, true],
  ["uiLayers", "ui/layers.webp", 24, 24, true],
  ["uiLayoutGrid", "ui/layout-grid.webp", 24, 24, true],
  ["uiLink", "ui/link.webp", 24, 24, true],
  ["uiList", "ui/list.webp", 24, 24, true],
  ["uiLock", "ui/lock.webp", 24, 24, true],
  ["uiLockOpen", "ui/lock-open.webp", 24, 24, true],
  ["uiLogIn", "ui/log-in.webp", 24, 24, true],
  ["uiMapPin", "ui/map-pin.webp", 24, 24, true],
  ["uiMedal", "ui/medal.webp", 24, 24, true],
  ["uiMusic", "ui/music.webp", 24, 24, true],
  ["uiPackage", "ui/package.webp", 24, 24, true],
  ["uiPalette", "ui/palette.webp", 24, 24, true],
  ["uiReceipt", "ui/receipt.webp", 24, 24, true],
  ["uiRefreshCw", "ui/refresh-cw.webp", 24, 24, true],
  ["uiRibbon", "ui/ribbon.webp", 24, 24, true],
  ["uiSearch", "ui/search.webp", 24, 24, true],
  ["uiSend", "ui/send.webp", 24, 24, true],
  ["uiSettings", "ui/settings.webp", 24, 24, true],
  ["uiShare2", "ui/share-2.webp", 24, 24, true],
  ["uiShieldCheck", "ui/shield-check.webp", 24, 24, true],
  ["uiShirt", "ui/shirt.webp", 24, 24, true],
  ["uiShoppingBag", "ui/shopping-bag.webp", 24, 24, true],
  ["uiShoppingCart", "ui/shopping-cart.webp", 24, 24, true],
  ["uiSlidersHorizontal", "ui/sliders-horizontal.webp", 24, 24, true],
  ["uiSmile", "ui/smile.webp", 24, 24, true],
  ["uiSparkles", "ui/sparkles.webp", 24, 24, true],
  ["uiStar", "ui/star.webp", 24, 24, true],
  ["uiSticker", "ui/sticker.webp", 24, 24, true],
  ["uiTag", "ui/tag.webp", 24, 24, true],
  ["uiTrash2", "ui/trash-2.webp", 24, 24, true],
  ["uiTrendingUp", "ui/trending-up.webp", 24, 24, true],
  ["uiTrophy", "ui/trophy.webp", 24, 24, true],
  ["uiTruck", "ui/truck.webp", 24, 24, true],
  ["uiWallet", "ui/wallet.webp", 24, 24, true],
  ["uiWatch", "ui/watch.webp", 24, 24, true],
  ["uiZap", "ui/zap.webp", 24, 24, true],
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
