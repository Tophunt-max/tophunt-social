/**
 * Shop artwork registry. Every decorative Shop icon and illustration is a
 * transparent WebP in this folder, rendered from the SVG sources in
 * apps/expo/design/shop by scripts/gen-shop-icons.mjs. Screens draw them
 * through `ShopIcon` (src/components/shop/ShopIcon.tsx), never by path.
 *
 * Admins can replace any piece without an app update: Shop → Shop Assets
 * uploads a WebP / PNG for a key (appConfig.shopAssets), and `ShopIcon` draws
 * it instead, falling back to the bundled WebP if it fails to load.
 * Keys, files and sizes here must match the Worker list in
 * apps/worker/src/lib/shopAssets.ts; test/shopIcons.test.ts checks both, that
 * every file exists, and that every file is a valid transparent WebP.
 *
 * `w` / `h` are the artwork's aspect ratio (its SVG viewBox). `tint` marks
 * white single-colour glyphs the app colours at runtime.
 */
import type { ImageSourcePropType } from 'react-native';

export interface ShopIconDef {
  source: ImageSourcePropType;
  w: number;
  h: number;
  tint?: boolean;
}

const tile = (source: ImageSourcePropType): ShopIconDef => ({ source, w: 48, h: 40 });
const icon = (source: ImageSourcePropType): ShopIconDef => ({ source, w: 24, h: 24 });
const glyph = (source: ImageSourcePropType, w = 24, h = 24): ShopIconDef => ({ source, w, h, tint: true });

export const SHOP_ICONS = {
  tileFrame: tile(require('./tiles/frame.webp')),
  tileTheme: tile(require('./tiles/theme.webp')),
  tileBadge: tile(require('./tiles/badge.webp')),
  tileTitle: tile(require('./tiles/title.webp')),
  tileVs: tile(require('./tiles/vs.webp')),
  tileVictory: tile(require('./tiles/victory.webp')),
  tileEffect: tile(require('./tiles/effect.webp')),
  tileGifts: tile(require('./tiles/gifts.webp')),
  tileEmotes: tile(require('./tiles/emotes.webp')),
  tileSound: tile(require('./tiles/sound.webp')),
  tileMore: tile(require('./tiles/more.webp')),
  crownOrnament: { source: require('./art/crown-ornament.webp'), w: 56, h: 34 },
  crownGold: { source: require('./art/crown-gold.webp'), w: 48, h: 36 },
  crownViolet: { source: require('./art/crown-violet.webp'), w: 48, h: 36 },
  wingedCrown: { source: require('./art/winged-crown.webp'), w: 110, h: 70 },
  shopBag: { source: require('./art/shop-bag.webp'), w: 110, h: 110 },
  chest: { source: require('./art/chest.webp'), w: 110, h: 80 },
  collectionBox: tile(require('./art/collection-box.webp')),
  clipboard: tile(require('./art/clipboard.webp')),
  dealRibbon: { source: require('./art/deal-ribbon.webp'), w: 44, h: 48 },
  star: icon(require('./icons/star.webp')),
  flame: icon(require('./icons/flame.webp')),
  box: icon(require('./icons/box.webp')),
  bagGold: icon(require('./icons/bag-gold.webp')),
  bagGoldOutline: icon(require('./icons/bag-gold-outline.webp')),
  bagPink: icon(require('./icons/bag-pink.webp')),
  bagPinkOutline: icon(require('./icons/bag-pink-outline.webp')),
  bolt: icon(require('./icons/bolt.webp')),
  shirt: icon(require('./icons/shirt.webp')),
  heart: icon(require('./icons/heart.webp')),
  clock: icon(require('./icons/clock.webp')),
  badge: icon(require('./icons/badge.webp')),
  trophy: icon(require('./icons/trophy.webp')),
  laurel: glyph(require('./glyphs/laurel.webp'), 12, 24),
  cubeLine: glyph(require('./glyphs/cube-line.webp')),
  tabBag: glyph(require('./glyphs/tab-bag.webp')),
  tabLayers: glyph(require('./glyphs/tab-layers.webp')),
  tabCube: glyph(require('./glyphs/tab-cube.webp')),
  tabCrown: glyph(require('./glyphs/tab-crown.webp')),
  // Functional UI icons (cart, search, lock, time…), white and tinted: drawn by ShopGlyphs.
  uiChevron: glyph(require('./ui/chevron-left.webp'), 10, 16),
  uiArrow: glyph(require('./ui/arrow-right.webp')),
  uiClose: glyph(require('./ui/x.webp')),
  uiCloseCircle: glyph(require('./ui/circle-x.webp')),
  uiAward: glyph(require('./ui/award.webp')),
  uiBrush: glyph(require('./ui/brush.webp')),
  uiChartColumn: glyph(require('./ui/chart-column.webp')),
  uiFlag: glyph(require('./ui/flag.webp')),
  uiLeaf: glyph(require('./ui/leaf.webp')),
  uiLightbulb: glyph(require('./ui/lightbulb.webp')),
  uiUsers: glyph(require('./ui/users.webp')),
  uiVideo: glyph(require('./ui/video.webp')),
  uiXCircle: glyph(require('./ui/x-circle.webp')),
  uiAlertCircle: glyph(require('./ui/alert-circle.webp')),
  uiArrowLeftRight: glyph(require('./ui/arrow-left-right.webp')),
  uiBan: glyph(require('./ui/ban.webp')),
  uiBell: glyph(require('./ui/bell.webp')),
  uiCalendar: glyph(require('./ui/calendar.webp')),
  uiCap: glyph(require('./ui/cap.webp')),
  uiCheck: glyph(require('./ui/check.webp')),
  uiCheckCircle2: glyph(require('./ui/check-circle-2.webp')),
  uiChevronDown: glyph(require('./ui/chevron-down.webp')),
  uiCircle: glyph(require('./ui/circle.webp')),
  uiCircleUser: glyph(require('./ui/circle-user.webp')),
  uiClock: glyph(require('./ui/clock.webp')),
  uiCloudOff: glyph(require('./ui/cloud-off.webp')),
  uiCoffee: glyph(require('./ui/coffee.webp')),
  uiCreditCard: glyph(require('./ui/credit-card.webp')),
  uiCrown: glyph(require('./ui/crown.webp')),
  uiEyeOff: glyph(require('./ui/eye-off.webp')),
  uiFlame: glyph(require('./ui/flame.webp')),
  uiGem: glyph(require('./ui/gem.webp')),
  uiGift: glyph(require('./ui/gift.webp')),
  uiHeadphones: glyph(require('./ui/headphones.webp')),
  uiHeart: glyph(require('./ui/heart.webp')),
  uiHeartFilled: glyph(require('./ui/heart-filled.webp')),
  uiImage: glyph(require('./ui/image.webp')),
  uiInfinity: glyph(require('./ui/infinity.webp')),
  uiInfo: glyph(require('./ui/info.webp')),
  uiLayers: glyph(require('./ui/layers.webp')),
  uiLayoutGrid: glyph(require('./ui/layout-grid.webp')),
  uiLink: glyph(require('./ui/link.webp')),
  uiList: glyph(require('./ui/list.webp')),
  uiLock: glyph(require('./ui/lock.webp')),
  uiLockOpen: glyph(require('./ui/lock-open.webp')),
  uiLogIn: glyph(require('./ui/log-in.webp')),
  uiMapPin: glyph(require('./ui/map-pin.webp')),
  uiMedal: glyph(require('./ui/medal.webp')),
  uiMusic: glyph(require('./ui/music.webp')),
  uiPackage: glyph(require('./ui/package.webp')),
  uiPalette: glyph(require('./ui/palette.webp')),
  uiReceipt: glyph(require('./ui/receipt.webp')),
  uiRefreshCw: glyph(require('./ui/refresh-cw.webp')),
  uiRibbon: glyph(require('./ui/ribbon.webp')),
  uiSearch: glyph(require('./ui/search.webp')),
  uiSend: glyph(require('./ui/send.webp')),
  uiSettings: glyph(require('./ui/settings.webp')),
  uiShare2: glyph(require('./ui/share-2.webp')),
  uiShieldCheck: glyph(require('./ui/shield-check.webp')),
  uiShirt: glyph(require('./ui/shirt.webp')),
  uiShoppingBag: glyph(require('./ui/shopping-bag.webp')),
  uiShoppingCart: glyph(require('./ui/shopping-cart.webp')),
  uiSlidersHorizontal: glyph(require('./ui/sliders-horizontal.webp')),
  uiSmile: glyph(require('./ui/smile.webp')),
  uiSparkles: glyph(require('./ui/sparkles.webp')),
  uiStar: glyph(require('./ui/star.webp')),
  uiSticker: glyph(require('./ui/sticker.webp')),
  uiTag: glyph(require('./ui/tag.webp')),
  uiTrash2: glyph(require('./ui/trash-2.webp')),
  uiTrendingUp: glyph(require('./ui/trending-up.webp')),
  uiTrophy: glyph(require('./ui/trophy.webp')),
  uiTruck: glyph(require('./ui/truck.webp')),
  uiWallet: glyph(require('./ui/wallet.webp')),
  uiWatch: glyph(require('./ui/watch.webp')),
  uiZap: glyph(require('./ui/zap.webp')),
} satisfies Record<string, ShopIconDef>;

export type ShopIconKey = keyof typeof SHOP_ICONS;
