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
} satisfies Record<string, ShopIconDef>;

export type ShopIconKey = keyof typeof SHOP_ICONS;
