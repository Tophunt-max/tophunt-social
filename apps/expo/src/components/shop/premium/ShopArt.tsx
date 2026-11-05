/**
 * Shop artwork. Every icon and illustration here is a bundled transparent
 * WebP (assets/icons/shop, from the SVG sources in design/shop) drawn by
 * `ShopIcon`, so an admin can replace it from Shop → Shop Assets without an
 * app update. These exports keep the names and props the screens already
 * use; each one only picks the artwork key and its box.
 *
 * SparkleField and HeroWaves stay vector: they are procedural overlays drawn
 * to the size of the banner they cover, not icons.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { ShopIcon } from '@/src/components/shop/ShopIcon';
import type { ShopIconKey } from '@/assets/icons/shop';
import { TH } from '@/src/theme/tophunt';
import type { TileKey } from '@/src/lib/shopModel';

type TileArtProps = { width: number; height: number };
type IconProps = { size: number; color?: string };

const box = (name: ShopIconKey) => {
  const C = ({ width, height }: TileArtProps) => <ShopIcon name={name} width={width} height={height} />;
  C.displayName = name;
  return C;
};
const square = (name: ShopIconKey) => {
  const C = ({ size }: IconProps) => <ShopIcon name={name} width={size} height={size} />;
  C.displayName = name;
  return C;
};

// ------------------------------------------------------------------ tile art (48×40)

export const FrameArt = box('tileFrame');
export const ThemeArt = box('tileTheme');
export const BadgeArt = box('tileBadge');
export const CrownArt = box('tileTitle');
export const VsArt = box('tileVs');
export const VictoryArt = box('tileVictory');
export const ProfileFxArt = box('tileEffect');
export const GiftArt = box('tileGifts');
export const EmoteArt = box('tileEmotes');
export const SoundArt = box('tileSound');
export const MoreArt = box('tileMore');

/** Small gift box for section headers ("Shop Bundles"), `size` tall. */
export function GiftIcon({ size }: IconProps) {
  return <ShopIcon name="tileGifts" width={size * 1.2} height={size} />;
}

const TILE_ART: Record<TileKey, ShopIconKey> = {
  frame: 'tileFrame',
  theme: 'tileTheme',
  badge: 'tileBadge',
  title: 'tileTitle',
  vs: 'tileVs',
  victory: 'tileVictory',
  effect: 'tileEffect',
  gifts: 'tileGifts',
  emotes: 'tileEmotes',
  sound: 'tileSound',
  more: 'tileMore',
};

/** The illustrated icon of a category / collection tile. */
export function TileArt({ tile, width, height }: { tile: TileKey } & TileArtProps) {
  return <ShopIcon name={TILE_ART[tile] ?? 'tileMore'} width={width} height={height} />;
}

// ------------------------------------------------------------------ brand (crown, coin, diamond)

/** Centered crown ornament with a faint gold glow (56×34). */
export const CrownOrnament = box('crownOrnament');
/** Wordmark crown (48×36). */
export const CrownLogo = box('crownGold');

/** DP coin (the app-wide coin artwork). */
export function CoinArt({ size }: IconProps) {
  return <CoinIcon size={size} />;
}

/** Cyan Diamond (the app-wide gem). */
export function DiamondArt({ size }: IconProps) {
  return <DiamondIcon size={size} />;
}

/** Treasure chest for the deals card (110×80). */
export const ChestArt = box('chest');

// ------------------------------------------------------------------ section / small icons (24×24)

export const StarIcon = square('star');
export const FlameIcon = square('flame');
export const BoxIcon = square('box');
export const GoldBoxIcon = square('box');
export const BoltIcon = square('bolt');
export const ShirtIcon = square('shirt');
export const HeartIcon = square('heart');
export const ClockIcon = square('clock');

/** Gold shopping bag (outline for the page title, filled for the section). */
export function BagIcon({ size, outline = false }: IconProps & { outline?: boolean }) {
  return <ShopIcon name={outline ? 'bagGoldOutline' : 'bagGold'} width={size} height={size} />;
}

/** Laurel branch in `color`; `flip` mirrors it for the right side (12×24). */
export function Laurel({ width, height, flip = false, color = '#F5B935' }: TileArtProps & { flip?: boolean; color?: string }) {
  return <ShopIcon name="laurel" width={width} height={height} color={color} flip={flip} />;
}

/** Line cube (placeholder product frames). The default neutral grey reads on light and dark cards. */
export function CubeLine({ size, color = TH.colors.sub }: IconProps) {
  return <ShopIcon name="cubeLine" width={size} height={size} color={color} />;
}

// ------------------------------------------------------------------ tab bar glyphs (line, tinted)

const TAB_GLYPH: Record<'bag' | 'layers' | 'cube' | 'grid', ShopIconKey> = { bag: 'tabBag', layers: 'tabLayers', cube: 'tabCube', grid: 'tabCrown' };

export function TabGlyph({ name, size, color }: { name: 'bag' | 'layers' | 'cube' | 'grid'; size: number; color: string }) {
  return <ShopIcon name={TAB_GLYPH[name]} width={size} height={size} color={color} />;
}

// ------------------------------------------------------------------ mobile home art

/** Gold crown section icon, `size` wide. */
export function CrownIcon({ size }: IconProps) {
  return <ShopIcon name="crownGold" width={size} height={(size * 36) / 48} />;
}

/** Red "UP TO / X% / OFF" ribbon of the deal card (44×48). The text is drawn by the caller on top. */
export const DealRibbon = box('dealRibbon');

/** Big gold winged crown, for the "Upgrade Your Profile" banner (110×70). */
export const WingedCrownArt = box('wingedCrown');

/** Pink shopping bag: outline (title block) or filled (section header). */
export function PinkBagIcon({ size, outline = false }: IconProps & { outline?: boolean }) {
  return <ShopIcon name={outline ? 'bagPinkOutline' : 'bagPink'} width={size} height={size} />;
}

/** 3D pink shopping bag with a small gold crown (title block). */
export const ShopBagArt = square('shopBag');

/** Violet laurel sprig after the phone tagline (12×24, leaning right). */
export function LaurelSprig({ width, height, color = '#8B5CF6' }: TileArtProps & { color?: string }) {
  return <Laurel width={width} height={height} flip color={color} />;
}

/** Orange 3D box ("My Collection" card), 48×40. */
export const CollectionBoxArt = box('collectionBox');
/** Clipboard with a checklist ("Orders" card), 48×40. */
export const ClipboardArt = box('clipboard');

// ------------------------------------------------------------------ procedural overlays (vector)

/** Four-point sparkle centred at (x, y) with radius r. */
const spark = (x: number, y: number, r: number) => {
  const k = r * 0.28;
  return `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
};

function Sparks({ pts, color = '#FFF7D6' }: { pts: [number, number, number][]; color?: string }) {
  return (
    <G>
      {pts.map(([x, y, r]) => (
        <Path key={`${x}-${y}`} d={spark(x, y, r)} fill={color} opacity={0.95} />
      ))}
    </G>
  );
}

/** Scattered white sparkles over a banner (viewBox = the banner size in px, drawn once, static). */
export const SparkleField = React.memo(function SparkleField({ width, height }: TileArtProps) {
  const pts: [number, number, number][] = [
    [0.06, 0.2, 2.2], [0.3, 0.12, 1.6], [0.44, 0.82, 1.8], [0.55, 0.18, 2.4], [0.62, 0.7, 1.4], [0.9, 0.12, 2], [0.96, 0.78, 1.6], [0.18, 0.88, 1.4],
  ];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} pointerEvents="none">
      <Sparks pts={pts.map(([x, y, r]) => [x * width, y * height, r * 1.4] as [number, number, number])} color="#FFFFFF" />
    </Svg>
  );
});

/** Soft light waves over the phone hero slide (static, scaled to W×H). */
export const HeroWaves = React.memo(function HeroWaves({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 316 144" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <RadialGradient id="sa-hw-glow" cx="0.75" cy="0.5" r="0.45">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d="M0 104 C60 80 120 132 190 104 C240 84 280 96 316 80 V144 H0 Z" fill="#FFFFFF" opacity={0.07} />
      <Path d="M0 122 C70 104 130 144 210 120 C260 106 290 116 316 108 V144 H0 Z" fill="#FFFFFF" opacity={0.07} />
      <Path d="M0 30 C70 10 140 52 220 22 C260 8 290 14 316 4" fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.14} />
      <Circle cx={237} cy={72} r={70} fill="url(#sa-hw-glow)" />
      <Sparks pts={[[170, 18, 2.4], [300, 20, 2.6], [186, 120, 1.8], [302, 126, 2]]} color="#FFFFFF" />
    </Svg>
  );
});

// ------------------------------------------------------------------ phone Digital tab art

/** Small diamond scattered around title / banner art (decorative): the app-wide Diamond artwork. */
export function DiamondSparkle({ size }: IconProps) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><DiamondIcon size={size} /></View>;
}

/** Gold shield with a violet inset and star ("Badges Collection" section icon). */
export const BadgeIcon = square('badge');
/** Gold trophy cup ("Titles Collection" section icon). */
export const TrophyIcon = square('trophy');

/** Small violet crown ("Special Collections" banner), `size` wide. */
export function VioletCrownIcon({ size }: IconProps) {
  return <ShopIcon name="crownViolet" width={size} height={(size * 36) / 48} />;
}
