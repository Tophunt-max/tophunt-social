/**
 * Illustrated "3D" art of the Shop home (reference mock): glossy SVG icons
 * built from gradients, a highlight and a few sparkles. react-native-svg only,
 * no image assets, so they stay sharp at every scale `u`.
 *
 * Tile art draws on a 48×40 canvas (category / collection tiles), section and
 * small icons on 24×24. Gradient ids are namespaced per icon ("sa-…"); every
 * instance of an icon defines identical gradients, so a duplicate id on web
 * resolves to the same paint.
 */
import React from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { TH } from '@/src/theme/tophunt';
import type { TileKey } from '@/src/lib/shopModel';

type TileArtProps = { width: number; height: number };
type IconProps = { size: number; color?: string };

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

/** Gold metal: light top, deep amber bottom. */
const goldStops = () => [
  <Stop key="0" offset="0" stopColor="#FFF6C2" />,
  <Stop key="1" offset="0.4" stopColor="#FFD24A" />,
  <Stop key="2" offset="0.75" stopColor="#F59E0B" />,
  <Stop key="3" offset="1" stopColor="#B45309" />,
];

const purpleStops = ({ light = '#E9D5FF', mid = '#A855F7', dark = '#5B21B6' }: { light?: string; mid?: string; dark?: string } = {}) => [
  <Stop key="0" offset="0" stopColor={light} />,
  <Stop key="1" offset="0.5" stopColor={mid} />,
  <Stop key="2" offset="1" stopColor={dark} />,
];

const CROWN = 'M8 31 L5 12 L16 20 L24 6 L32 20 L43 12 L40 31 Z';

// ------------------------------------------------------------------ tile art (48×40)

export function FrameArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-ring" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
        <LinearGradient id="sa-ring-gem" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FBCFE8" />
          <Stop offset="1" stopColor="#DB2777" />
        </LinearGradient>
      </Defs>
      <Circle cx={24} cy={21} r={13} fill="none" stroke="#7C2D12" strokeWidth={6.5} opacity={0.5} />
      <Circle cx={24} cy={21} r={13} fill="none" stroke="url(#sa-ring)" strokeWidth={5} />
      <Path d="M14 14 A13 13 0 0 1 30 9" fill="none" stroke="#FFFBEB" strokeWidth={1.4} strokeLinecap="round" opacity={0.9} />
      <Path d="M24 3 L28 8 L24 12 L20 8 Z" fill="url(#sa-ring-gem)" stroke="#FFF" strokeWidth={0.6} />
      <Sparks pts={[[41, 8, 3], [7, 33, 2.4], [40, 34, 1.8]]} />
    </Svg>
  );
}

export function ThemeArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-l1" x1="0" y1="0" x2="1" y2="1">{purpleStops()}</LinearGradient>
        <LinearGradient id="sa-l2" x1="0" y1="0" x2="1" y2="1">{purpleStops({ light: '#C4B5FD', mid: '#7C3AED', dark: '#4C1D95' })}</LinearGradient>
        <LinearGradient id="sa-l3" x1="0" y1="0" x2="1" y2="1">{purpleStops({ light: '#A78BFA', mid: '#6D28D9', dark: '#2E1065' })}</LinearGradient>
      </Defs>
      <Path d="M24 18 L42 26 L24 34 L6 26 Z" fill="url(#sa-l3)" />
      <Path d="M24 12 L42 20 L24 28 L6 20 Z" fill="url(#sa-l2)" />
      <Path d="M24 6 L42 14 L24 22 L6 14 Z" fill="url(#sa-l1)" stroke="#F5F3FF" strokeWidth={0.7} />
      <Path d="M12 13 L24 8 L30 10.5" fill="none" stroke="#FFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
      <Sparks pts={[[41, 6, 2.6], [8, 33, 2]]} />
    </Svg>
  );
}

function Star5({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return <Path d={`M${pts.join('L')}Z`} fill={fill} />;
}

const WING_L = 'M15 13 C9 10 4 11 1 15 C4 15 6 16 7 17 C4 17 3 19 2 21 C6 20 9 21 15 22 Z';

export function BadgeArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-shield" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
        <LinearGradient id="sa-shield-in" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7C3AED" />
          <Stop offset="1" stopColor="#3B0764" />
        </LinearGradient>
      </Defs>
      <Path d={WING_L} fill="url(#sa-shield)" />
      <G transform="translate(48 0) scale(-1 1)"><Path d={WING_L} fill="url(#sa-shield)" /></G>
      <Path d="M24 4 L35 8 V19 C35 27 30 33 24 36 C18 33 13 27 13 19 V8 Z" fill="url(#sa-shield)" stroke="#92400E" strokeWidth={0.8} />
      <Path d="M24 8 L31.5 10.8 V19 C31.5 25 28 29.5 24 31.8 C20 29.5 16.5 25 16.5 19 V10.8 Z" fill="url(#sa-shield-in)" />
      <Star5 cx={24} cy={19.5} r={6} fill="#FFD24A" />
      <Path d="M17 11 L24 8.4" stroke="#FFF" strokeWidth={1} strokeLinecap="round" opacity={0.7} />
      <Sparks pts={[[42, 30, 2.2], [6, 6, 2]]} />
    </Svg>
  );
}

export function CrownArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-crown" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Path d={CROWN} fill="url(#sa-crown)" stroke="#92400E" strokeWidth={0.8} strokeLinejoin="round" />
      <Rect x={8} y={30} width={32} height={5} rx={1.5} fill="#D97706" />
      <Circle cx={24} cy={24} r={2.6} fill="#EC4899" stroke="#FFF" strokeWidth={0.5} />
      <Circle cx={15} cy={26} r={1.8} fill="#38BDF8" />
      <Circle cx={33} cy={26} r={1.8} fill="#38BDF8" />
      <Circle cx={24} cy={6} r={2} fill="#FFF6C2" />
      <Path d="M9 14 L11 27" stroke="#FFFBEB" strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
      <Sparks pts={[[42, 6, 2.6], [5, 34, 1.8]]} />
    </Svg>
  );
}

export function VsArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-vs" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F472B6" />
          <Stop offset="0.5" stopColor="#A855F7" />
          <Stop offset="1" stopColor="#38BDF8" />
        </LinearGradient>
      </Defs>
      <Path d="M30 2 L20 19 H27 L18 38 L36 15 H28 L35 2 Z" fill="#FDE047" opacity={0.35} />
      <SvgText x={24} y={30} fontSize={24} fontStyle="italic" fontFamily={TH.fonts.bold} textAnchor="middle" fill="none" stroke="#1E0B45" strokeWidth={3}>VS</SvgText>
      <SvgText x={24} y={30} fontSize={24} fontStyle="italic" fontFamily={TH.fonts.bold} textAnchor="middle" fill="url(#sa-vs)" stroke="#FFF" strokeWidth={0.6}>VS</SvgText>
      <Sparks pts={[[42, 8, 2.4], [6, 10, 2]]} />
    </Svg>
  );
}

const BIG_WING = 'M21 24 C14 24 6 20 2 12 C6 13 8 13 10 12 C7 11 5 9 4 6 C9 8 13 9 16 11 C15 9 15 7 15 5 C19 9 21 15 22 21 Z';

export function VictoryArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-wing" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Path d={BIG_WING} fill="url(#sa-wing)" stroke="#92400E" strokeWidth={0.6} />
      <G transform="translate(48 0) scale(-1 1)"><Path d={BIG_WING} fill="url(#sa-wing)" stroke="#92400E" strokeWidth={0.6} /></G>
      <Circle cx={24} cy={22} r={9} fill="#FDE68A" opacity={0.25} />
      <Star5 cx={24} cy={22} r={8.5} fill="url(#sa-wing)" />
      <Path d="M24 15 L26 20" stroke="#FFF" strokeWidth={1} strokeLinecap="round" opacity={0.8} />
      <Sparks pts={[[24, 4, 2.4], [8, 32, 2], [40, 32, 2]]} />
    </Svg>
  );
}

export function ProfileFxArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-bust" x1="0" y1="0" x2="0" y2="1">{purpleStops()}</LinearGradient>
        <LinearGradient id="sa-bust-ring" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F0ABFC" />
          <Stop offset="1" stopColor="#7C3AED" />
        </LinearGradient>
      </Defs>
      <Circle cx={24} cy={20} r={15} fill="#2E1065" stroke="url(#sa-bust-ring)" strokeWidth={2.6} />
      <Circle cx={24} cy={15.5} r={5.5} fill="url(#sa-bust)" />
      <Path d="M13.5 29 C14.5 23 18.5 21.5 24 21.5 C29.5 21.5 33.5 23 34.5 29 C31.5 32.5 28 34 24 34 C20 34 16.5 32.5 13.5 29 Z" fill="url(#sa-bust)" />
      <Path d="M12 11 A15 15 0 0 1 22 5.2" fill="none" stroke="#FFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.75} />
      <Sparks pts={[[42, 7, 2.6], [6, 32, 2], [41, 33, 1.6]]} color="#F5D0FE" />
    </Svg>
  );
}

export function GiftArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-box" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FB7185" />
          <Stop offset="1" stopColor="#9F1239" />
        </LinearGradient>
        <LinearGradient id="sa-rib" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Rect x={11} y={18} width={26} height={19} rx={2} fill="url(#sa-box)" />
      <Rect x={9} y={13} width={30} height={7} rx={2} fill="url(#sa-box)" stroke="#FECDD3" strokeWidth={0.5} />
      <Rect x={21.5} y={13} width={5} height={24} fill="url(#sa-rib)" />
      <Path d="M24 13 C20 6 13 7 15 11 C16 13 20 13 24 13 Z" fill="url(#sa-rib)" />
      <Path d="M24 13 C28 6 35 7 33 11 C32 13 28 13 24 13 Z" fill="url(#sa-rib)" />
      <Path d="M12 15 H20" stroke="#FFF" strokeWidth={1} strokeLinecap="round" opacity={0.7} />
      <Sparks pts={[[42, 9, 2.4], [6, 30, 2]]} />
    </Svg>
  );
}

/** Small gift box for section headers ("Shop Bundles"), `size` tall. */
export function GiftIcon({ size }: IconProps) {
  return <GiftArt width={size * 1.2} height={size} />;
}

export function EmoteArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <RadialGradient id="sa-smile" cx="0.38" cy="0.32" r="0.75">
          <Stop offset="0" stopColor="#FEF9C3" />
          <Stop offset="0.45" stopColor="#FACC15" />
          <Stop offset="1" stopColor="#CA8A04" />
        </RadialGradient>
      </Defs>
      <Circle cx={24} cy={20} r={15} fill="url(#sa-smile)" />
      <Ellipse cx={19} cy={16.5} rx={2} ry={3} fill="#422006" />
      <Ellipse cx={29} cy={16.5} rx={2} ry={3} fill="#422006" />
      <Path d="M16 23 C19 29.5 29 29.5 32 23 C28 25 20 25 16 23 Z" fill="#422006" />
      <Ellipse cx={18} cy={10} rx={4} ry={2} fill="#FFF" opacity={0.6} />
      <Sparks pts={[[42, 6, 2.4], [6, 33, 1.8]]} />
    </Svg>
  );
}

export function SoundArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-note" x1="0" y1="0" x2="1" y2="1">{purpleStops({ light: '#F0ABFC', mid: '#C026D3', dark: '#6B21A8' })}</LinearGradient>
      </Defs>
      <Path d="M18 9 L36 5 V27" fill="none" stroke="url(#sa-note)" strokeWidth={3.2} strokeLinejoin="round" />
      <Path d="M18 9 V31" fill="none" stroke="url(#sa-note)" strokeWidth={3.2} />
      <Path d="M18 9 L36 5 V10 L18 14 Z" fill="url(#sa-note)" />
      <Ellipse cx={14} cy={31} rx={5.5} ry={4.2} fill="url(#sa-note)" />
      <Ellipse cx={32} cy={27} rx={5.5} ry={4.2} fill="url(#sa-note)" />
      <Ellipse cx={12.5} cy={29.5} rx={2} ry={1} fill="#FFF" opacity={0.6} />
      <Ellipse cx={30.5} cy={25.5} rx={2} ry={1} fill="#FFF" opacity={0.6} />
      <Sparks pts={[[42, 18, 2.2], [7, 10, 2]]} color="#F5D0FE" />
    </Svg>
  );
}

export function MoreArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <RadialGradient id="sa-dot" cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#E9D5FF" />
          <Stop offset="0.5" stopColor="#8B5CF6" />
          <Stop offset="1" stopColor="#4C1D95" />
        </RadialGradient>
      </Defs>
      {[[17, 13], [31, 13], [17, 27], [31, 27]].map(([x, y]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r={5.6} fill="url(#sa-dot)" />
      ))}
    </Svg>
  );
}

const TILE_ART: Record<TileKey, (p: TileArtProps) => React.ReactElement> = {
  frame: FrameArt,
  theme: ThemeArt,
  badge: BadgeArt,
  title: CrownArt,
  vs: VsArt,
  victory: VictoryArt,
  effect: ProfileFxArt,
  gifts: GiftArt,
  emotes: EmoteArt,
  sound: SoundArt,
  more: MoreArt,
};

/** The illustrated icon of a category / collection tile. */
export function TileArt({ tile, width, height }: { tile: TileKey } & TileArtProps) {
  const Art = TILE_ART[tile] ?? MoreArt;
  return <Art width={width} height={height} />;
}

// ------------------------------------------------------------------ brand (crown, coin, diamond)

/** Centered crown ornament at the top of the page, with a faint gold glow. viewBox 56×34. */
export function CrownOrnament({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 56 34">
      <Defs>
        <RadialGradient id="sa-orn-glow" cx="0.5" cy="0.55" r="0.5">
          <Stop offset="0" stopColor="#FFD24A" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#FFD24A" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="sa-orn" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Ellipse cx={28} cy={19} rx={28} ry={15} fill="url(#sa-orn-glow)" />
      <G transform="translate(8 0) scale(0.84)">
        <Path d={CROWN} fill="url(#sa-orn)" stroke="#92400E" strokeWidth={0.9} strokeLinejoin="round" />
        <Rect x={8} y={30} width={32} height={5} rx={1.5} fill="#D97706" />
        <Path d="M24 19 L27 23 L24 27 L21 23 Z" fill="#EC4899" stroke="#FFF" strokeWidth={0.6} />
        <Circle cx={5} cy={12} r={2} fill="#FFF6C2" />
        <Circle cx={24} cy={6} r={2.2} fill="#FFF6C2" />
        <Circle cx={43} cy={12} r={2} fill="#FFF6C2" />
        <Path d="M10 15 L12 27" stroke="#FFFBEB" strokeWidth={1.3} strokeLinecap="round" opacity={0.85} />
      </G>
    </Svg>
  );
}

/** Wordmark crown (26×22 in the mock). */
export function CrownLogo({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 2 48 36">
      <Defs>
        <LinearGradient id="sa-logo" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Path d={CROWN} fill="url(#sa-logo)" stroke="#92400E" strokeWidth={1} strokeLinejoin="round" />
      <Rect x={8} y={30} width={32} height={5} rx={1.5} fill="#D97706" />
      <Circle cx={24} cy={24} r={3} fill="#EC4899" />
    </Svg>
  );
}

/** Glossy gold DP coin. */
export function CoinArt({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="DP coin">
      <Defs>
        <RadialGradient id="sa-coin" cx="0.38" cy="0.32" r="0.8">
          <Stop offset="0" stopColor="#FFF6C2" />
          <Stop offset="0.45" stopColor="#FFC41A" />
          <Stop offset="1" stopColor="#B45309" />
        </RadialGradient>
      </Defs>
      <Circle cx={12} cy={12} r={11} fill="url(#sa-coin)" stroke="#92400E" strokeWidth={0.8} />
      <Circle cx={12} cy={12} r={7.6} fill="none" stroke="#FDE68A" strokeWidth={1.1} opacity={0.9} />
      <SvgText x={12} y={15.6} fontSize={9.5} fontFamily={TH.fonts.bold} textAnchor="middle" fill="#92400E">D</SvgText>
    </Svg>
  );
}

/** Cyan Diamond (the app-wide gem). */
export function DiamondArt({ size }: IconProps) {
  return <DiamondIcon size={size} />;
}

/** Treasure chest for the deals card (viewBox 110×80). */
export function ChestArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 110 80">
      <Defs>
        <RadialGradient id="sa-chest-glow" cx="0.5" cy="0.45" r="0.55">
          <Stop offset="0" stopColor="#FFD24A" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFD24A" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="sa-wood" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#B45309" />
          <Stop offset="1" stopColor="#5B2307" />
        </LinearGradient>
        <LinearGradient id="sa-chest-gold" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
        <LinearGradient id="sa-lid" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7C3AED" />
          <Stop offset="1" stopColor="#3B0764" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={55} cy={36} rx={52} ry={34} fill="url(#sa-chest-glow)" />
      {/* coins spilling out */}
      <Ellipse cx={42} cy={30} rx={9} ry={4} fill="url(#sa-chest-gold)" />
      <Ellipse cx={58} cy={27} rx={10} ry={4.5} fill="url(#sa-chest-gold)" />
      <Ellipse cx={70} cy={31} rx={8} ry={3.6} fill="url(#sa-chest-gold)" />
      <Path d="M48 18 L52 24 L48 30 L44 24 Z" fill="#22D3EE" stroke="#FFF" strokeWidth={0.7} />
      <Path d="M24 22 C24 10 86 10 86 22 L86 30 L24 30 Z" fill="url(#sa-lid)" stroke="#FFD24A" strokeWidth={2} />
      <Rect x={22} y={32} width={66} height={36} rx={4} fill="url(#sa-wood)" stroke="#FFD24A" strokeWidth={2} />
      <Rect x={22} y={30} width={66} height={7} rx={2} fill="url(#sa-chest-gold)" />
      <Rect x={50} y={34} width={10} height={14} rx={2} fill="url(#sa-chest-gold)" stroke="#92400E" strokeWidth={0.8} />
      <Circle cx={55} cy={41} r={1.8} fill="#422006" />
      <Path d="M30 44 V62 M80 44 V62" stroke="#FFD24A" strokeWidth={2} opacity={0.8} />
      <Sparks pts={[[14, 14, 4], [96, 12, 3.4], [100, 58, 2.6], [10, 60, 2.2]]} />
    </Svg>
  );
}

// ------------------------------------------------------------------ section / small icons (24×24)

export function StarIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-star" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Star5 cx={12} cy={12.6} r={10.5} fill="url(#sa-star)" />
      <Path d="M9 8 L11.5 4.5" stroke="#FFF" strokeWidth={1.1} strokeLinecap="round" opacity={0.8} />
    </Svg>
  );
}

export function FlameIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-flame" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FDE047" />
          <Stop offset="0.5" stopColor="#FB923C" />
          <Stop offset="1" stopColor="#DC2626" />
        </LinearGradient>
      </Defs>
      <Path d="M12 2 C13 6 18 8 18 14 C18 18.5 15.3 22 12 22 C8.7 22 6 18.5 6 14.5 C6 11 8 9.5 9 7.5 C9.6 9.5 10.6 10.5 11.4 10.8 C11 7.5 11.2 4.5 12 2 Z" fill="url(#sa-flame)" />
      <Path d="M12 13 C13.5 15 14.5 16 14.5 18 C14.5 19.6 13.4 20.8 12 20.8 C10.6 20.8 9.5 19.6 9.5 18 C9.5 16.2 11 15 12 13 Z" fill="#FEF08A" />
    </Svg>
  );
}

export function BoxIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-pkg" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Path d="M12 2 L21 6.5 L12 11 L3 6.5 Z" fill="#FDE68A" />
      <Path d="M3 6.5 L12 11 V22 L3 17.5 Z" fill="url(#sa-pkg)" />
      <Path d="M21 6.5 L12 11 V22 L21 17.5 Z" fill="#B45309" />
      <Path d="M7.5 4.2 L16.5 8.8 V12" fill="none" stroke="#92400E" strokeWidth={1.4} />
    </Svg>
  );
}

/** Gold shopping bag (outline for the page title, filled for the section). */
export function BagIcon({ size, outline = false }: IconProps & { outline?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-bag" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Path d="M8.5 8 V6.5 C8.5 4.3 10 2.8 12 2.8 C14 2.8 15.5 4.3 15.5 6.5 V8" fill="none" stroke="url(#sa-bag)" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4.5 8 H19.5 L18.5 21 H5.5 Z" fill={outline ? 'none' : 'url(#sa-bag)'} stroke="url(#sa-bag)" strokeWidth={outline ? 1.8 : 0.8} strokeLinejoin="round" />
      {outline ? null : <Path d="M7 10.5 L7.5 18" stroke="#FFFBEB" strokeWidth={1.1} strokeLinecap="round" opacity={0.8} />}
    </Svg>
  );
}

/** Gold laurel branch; `flip` mirrors it for the right side. viewBox 12×24. */
export function Laurel({ width, height, flip = false, color = '#F5B935' }: TileArtProps & { flip?: boolean; color?: string }) {
  const leaves = [[6, 4], [4.4, 8.5], [3.6, 13], [4, 17.5]];
  return (
    <Svg width={width} height={height} viewBox="0 0 12 24">
      <G transform={flip ? 'translate(12 0) scale(-1 1)' : undefined}>
        <Path d="M9 22 C4 19 2.5 12 6.5 2" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
        {leaves.map(([x, y], k) => (
          <G key={k}>
            <Ellipse cx={x + 2.2} cy={y + 0.6} rx={2.4} ry={1.05} fill={color} transform={`rotate(-35 ${x + 2.2} ${y + 0.6})`} />
            <Ellipse cx={x - 1.6} cy={y + 1.6} rx={2.2} ry={1} fill={color} transform={`rotate(35 ${x - 1.6} ${y + 1.6})`} />
          </G>
        ))}
      </G>
    </Svg>
  );
}

export function BoltIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M14 2 L5 13.5 H11 L9.5 22 L19 9.8 H13 Z" fill="#FACC15" stroke="#CA8A04" strokeWidth={0.8} strokeLinejoin="round" />
    </Svg>
  );
}

export function ShirtIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-shirt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FDBA74" />
          <Stop offset="1" stopColor="#EA580C" />
        </LinearGradient>
      </Defs>
      <Path d="M8.5 3 C9.5 4.6 10.6 5.2 12 5.2 C13.4 5.2 14.5 4.6 15.5 3 L21.5 6.5 L19 11 L17 10 V21 H7 V10 L5 11 L2.5 6.5 Z" fill="url(#sa-shirt)" stroke="#9A3412" strokeWidth={0.7} strokeLinejoin="round" />
      <Path d="M9 9 V17" stroke="#FFF" strokeWidth={1} strokeLinecap="round" opacity={0.6} />
    </Svg>
  );
}

export function HeartIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-heart" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F9A8D4" />
          <Stop offset="1" stopColor="#DB2777" />
        </LinearGradient>
      </Defs>
      <Path d="M12 21 C5 16 2 12.5 2 8.6 C2 5.5 4.4 3.2 7.2 3.2 C9.2 3.2 10.9 4.3 12 6 C13.1 4.3 14.8 3.2 16.8 3.2 C19.6 3.2 22 5.5 22 8.6 C22 12.5 19 16 12 21 Z" fill="url(#sa-heart)" />
      <Ellipse cx={7} cy={7.5} rx={2.2} ry={1.3} fill="#FFF" opacity={0.6} />
    </Svg>
  );
}

export function GoldBoxIcon({ size }: IconProps) {
  return <BoxIcon size={size} />;
}

export function ClockIcon({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-clock" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Circle cx={12} cy={12} r={10} fill="url(#sa-clock)" />
      <Circle cx={12} cy={12} r={7.4} fill="#1E0B45" />
      <Path d="M12 7.5 V12 L15 14" fill="none" stroke="#FFD24A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Line cube (placeholder product frames). The default neutral grey reads on light and dark cards. */
export function CubeLine({ size, color = TH.colors.sub }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.5 L20.5 7 V17 L12 21.5 L3.5 17 V7 Z M3.5 7 L12 11.5 L20.5 7 M12 11.5 V21.5" fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

// ------------------------------------------------------------------ tab bar glyphs (line, tinted)

export function TabGlyph({ name, size, color }: { name: 'bag' | 'layers' | 'cube' | 'grid'; size: number; color: string }) {
  const s = { fill: 'none', stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'bag' ? (
        <>
          <Path d="M8.5 8 V6.5 C8.5 4.3 10 2.8 12 2.8 C14 2.8 15.5 4.3 15.5 6.5 V8" {...s} />
          <Path d="M4.5 8 H19.5 L18.5 21 H5.5 Z" {...s} />
        </>
      ) : name === 'layers' ? (
        <>
          <Path d="M12 3 L21 8 L12 13 L3 8 Z" {...s} />
          <Path d="M3 12.5 L12 17.5 L21 12.5" {...s} />
          <Path d="M3 16.5 L12 21.5 L21 16.5" {...s} />
        </>
      ) : name === 'cube' ? (
        <Path d="M12 2.5 L20.5 7 V17 L12 21.5 L3.5 17 V7 Z M3.5 7 L12 11.5 L20.5 7 M12 11.5 V21.5" {...s} />
      ) : (
        <>
          <Path d="M4 17 L3 7 L8 11 L12 4 L16 11 L21 7 L20 17 Z" {...s} />
          <Path d="M4 20.5 H20" {...s} />
        </>
      )}
    </Svg>
  );
}

// ------------------------------------------------------------------ mobile home art

/** Gold crown section icon (24×24). */
export function CrownIcon({ size }: IconProps) {
  return <CrownLogo width={size} height={(size * 36) / 48} />;
}

/**
 * Red "UP TO / X% / OFF" ribbon of the deal card: a badge with a notched
 * bottom (viewBox 44×48). The text is drawn by the caller on top.
 */
export function DealRibbon({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 44 48">
      <Defs>
        <LinearGradient id="sa-ribbon" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EF4444" />
          <Stop offset="1" stopColor="#B91C1C" />
        </LinearGradient>
      </Defs>
      <Path d="M3 1 H41 Q43 1 43 3 V47 L22 39 L1 47 V3 Q1 1 3 1 Z" fill="url(#sa-ribbon)" stroke="#FCA5A5" strokeWidth={0.8} strokeLinejoin="round" />
      <Path d="M5 4 H39" stroke="#FFF" strokeWidth={1} strokeLinecap="round" opacity={0.35} />
    </Svg>
  );
}

/**
 * Big gold winged crown with purple up-chevrons, for the "Upgrade Your
 * Profile" banner (viewBox 110×70).
 */
export function WingedCrownArt({ width, height }: TileArtProps) {
  const feathers = [0, 1, 2, 3];
  return (
    <Svg width={width} height={height} viewBox="0 0 110 70">
      <Defs>
        <RadialGradient id="sa-wc-glow" cx="0.5" cy="0.55" r="0.5">
          <Stop offset="0" stopColor="#FFD24A" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#FFD24A" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="sa-wc-gold" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
        <LinearGradient id="sa-wc-chev" x1="0" y1="0" x2="0" y2="1">{purpleStops({ light: '#F5D0FE', mid: '#C084FC', dark: '#7C3AED' })}</LinearGradient>
      </Defs>
      <Ellipse cx={55} cy={40} rx={54} ry={30} fill="url(#sa-wc-glow)" />
      {/* up chevrons behind */}
      {[[14, 30], [14, 42], [96, 30], [96, 42]].map(([x, y]) => (
        <Path key={`${x}-${y}`} d={`M${x - 7} ${y + 5} L${x} ${y - 2} L${x + 7} ${y + 5}`} fill="none" stroke="url(#sa-wc-chev)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {/* wings */}
      {feathers.map((k) => (
        <G key={`l${k}`}>
          <Path d={`M38 ${44 - k * 2} C${30 - k * 4} ${40 - k * 6} ${24 - k * 3} ${34 - k * 7} ${20 - k * 2} ${26 - k * 6} C${28 - k * 2} ${30 - k * 4} ${34} ${36 - k * 2} 40 ${40 - k * 2} Z`} fill="url(#sa-wc-gold)" stroke="#92400E" strokeWidth={0.6} />
          <Path d={`M72 ${44 - k * 2} C${80 + k * 4} ${40 - k * 6} ${86 + k * 3} ${34 - k * 7} ${90 + k * 2} ${26 - k * 6} C${82 + k * 2} ${30 - k * 4} ${76} ${36 - k * 2} 70 ${40 - k * 2} Z`} fill="url(#sa-wc-gold)" stroke="#92400E" strokeWidth={0.6} />
        </G>
      ))}
      {/* crown */}
      <G transform="translate(31 12)">
        <Path d={CROWN} fill="url(#sa-wc-gold)" stroke="#92400E" strokeWidth={1} strokeLinejoin="round" />
        <Rect x={8} y={30} width={32} height={6} rx={2} fill="#D97706" stroke="#92400E" strokeWidth={0.6} />
        <Path d="M24 18 L28 23 L24 28 L20 23 Z" fill="#A855F7" stroke="#FFF" strokeWidth={0.7} />
        <Circle cx={5} cy={12} r={2.2} fill="#FFF6C2" />
        <Circle cx={24} cy={6} r={2.4} fill="#FFF6C2" />
        <Circle cx={43} cy={12} r={2.2} fill="#FFF6C2" />
        <Circle cx={13} cy={33} r={1.4} fill="#EC4899" />
        <Circle cx={35} cy={33} r={1.4} fill="#22D3EE" />
      </G>
      <Sparks pts={[[8, 12, 3], [102, 10, 3.4], [55, 6, 2.4], [100, 62, 2.2], [10, 60, 2]]} />
    </Svg>
  );
}

// ------------------------------------------------------------------ phone home (design mock) art

const pinkStops = () => [
  <Stop key="0" offset="0" stopColor="#FF9EB8" />,
  <Stop key="1" offset="0.5" stopColor="#FF4D8D" />,
  <Stop key="2" offset="1" stopColor="#D61F69" />,
];

/** Pink shopping bag: outline (title block) or filled (section header). 24×24. */
export function PinkBagIcon({ size, outline = false }: IconProps & { outline?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="sa-pbag" x1="0" y1="0" x2="1" y2="1">{pinkStops()}</LinearGradient>
      </Defs>
      <Path d="M8.5 8 V6.5 C8.5 4.3 10 2.8 12 2.8 C14 2.8 15.5 4.3 15.5 6.5 V8" fill="none" stroke="url(#sa-pbag)" strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M4.5 8 H19.5 L18.5 21 H5.5 Z" fill={outline ? 'none' : 'url(#sa-pbag)'} stroke="url(#sa-pbag)" strokeWidth={outline ? 1.9 : 0.8} strokeLinejoin="round" />
      {outline ? <Circle cx={12} cy={14} r={1.6} fill="url(#sa-pbag)" /> : <Path d="M7 10.5 L7.5 18" stroke="#FFF" strokeWidth={1.1} strokeLinecap="round" opacity={0.7} />}
    </Svg>
  );
}

/**
 * Decorative 3D pink shopping bag with a small gold crown for the phone title
 * block (viewBox 110×110): pink gradient front, darker side panel, handle.
 */
export function ShopBagArt({ size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 110 110">
      <Defs>
        <RadialGradient id="sa-sb-glow" cx="0.5" cy="0.6" r="0.5">
          <Stop offset="0" stopColor="#FF4D8D" stopOpacity={0.28} />
          <Stop offset="1" stopColor="#FF4D8D" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="sa-sb-front" x1="0" y1="0" x2="1" y2="1">{pinkStops()}</LinearGradient>
        <LinearGradient id="sa-sb-side" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C2185B" />
          <Stop offset="1" stopColor="#880E4F" />
        </LinearGradient>
        <LinearGradient id="sa-sb-handle" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFD1DF" />
          <Stop offset="1" stopColor="#E0457B" />
        </LinearGradient>
        <LinearGradient id="sa-sb-crown" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Ellipse cx={58} cy={66} rx={52} ry={42} fill="url(#sa-sb-glow)" />
      <Ellipse cx={58} cy={102} rx={34} ry={4} fill="#7C3AED" opacity={0.18} />
      {/* handle */}
      <Path d="M38 42 V32 C38 20 46 13 55 13 C64 13 72 20 72 32 V42" fill="none" stroke="url(#sa-sb-handle)" strokeWidth={5} strokeLinecap="round" />
      {/* side panel */}
      <Path d="M80 38 L94 46 L90 98 L78 100 Z" fill="url(#sa-sb-side)" />
      {/* front */}
      <Path d="M24 38 H80 L78 100 H22 Z" fill="url(#sa-sb-front)" />
      <Path d="M24 38 H80 L94 46 H38 Z" fill="#FFB3C9" opacity={0.85} />
      <Path d="M30 46 L28 92" stroke="#FFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.45} />
      {/* crown on the bag */}
      <G transform="translate(33 52) scale(0.8)">
        <Path d={CROWN} fill="url(#sa-sb-crown)" stroke="#92400E" strokeWidth={1} strokeLinejoin="round" />
        <Rect x={8} y={30} width={32} height={5} rx={1.5} fill="#D97706" />
        <Circle cx={24} cy={24} r={2.6} fill="#EC4899" stroke="#FFF" strokeWidth={0.6} />
        <Circle cx={24} cy={6} r={2.2} fill="#FFF6C2" />
      </G>
      <Sparks pts={[[100, 22, 4], [12, 30, 3], [104, 78, 2.6]]} />
    </Svg>
  );
}

/** Violet laurel sprig after the phone tagline (viewBox 12×24, leaning right). */
export function LaurelSprig({ width, height, color = '#8B5CF6' }: TileArtProps & { color?: string }) {
  return <Laurel width={width} height={height} flip color={color} />;
}

/** Orange 3D box ("My Collection" card), viewBox 48×40. */
export function CollectionBoxArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-cb-top" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE0A3" />
          <Stop offset="1" stopColor="#FDBA74" />
        </LinearGradient>
        <LinearGradient id="sa-cb-left" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FB923C" />
          <Stop offset="1" stopColor="#EA580C" />
        </LinearGradient>
        <LinearGradient id="sa-cb-right" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EA580C" />
          <Stop offset="1" stopColor="#9A3412" />
        </LinearGradient>
      </Defs>
      <Path d="M24 4 L42 12 L24 20 L6 12 Z" fill="url(#sa-cb-top)" />
      <Path d="M6 12 L24 20 V37 L6 29 Z" fill="url(#sa-cb-left)" />
      <Path d="M42 12 L24 20 V37 L42 29 Z" fill="url(#sa-cb-right)" />
      <Path d="M15 8 L33 16 V22" fill="none" stroke="#9A3412" strokeWidth={2} opacity={0.7} />
      <Path d="M9 15 L9 27" stroke="#FFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
      <Sparks pts={[[43, 5, 2.6], [5, 35, 1.8]]} />
    </Svg>
  );
}

/** Clipboard with a checklist ("Orders" card), viewBox 48×40. */
export function ClipboardArt({ width, height }: TileArtProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 48 40">
      <Defs>
        <LinearGradient id="sa-cl-board" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#C4B5FD" />
          <Stop offset="1" stopColor="#6D28D9" />
        </LinearGradient>
        <LinearGradient id="sa-cl-clip" x1="0" y1="0" x2="0" y2="1">{goldStops()}</LinearGradient>
      </Defs>
      <Rect x={11} y={6} width={26} height={32} rx={4} fill="url(#sa-cl-board)" />
      <Rect x={14} y={10} width={20} height={25} rx={2} fill="#FFFFFF" />
      <Rect x={18} y={3} width={12} height={6} rx={2} fill="url(#sa-cl-clip)" stroke="#92400E" strokeWidth={0.6} />
      {[15, 22, 29].map((y) => (
        <G key={y}>
          <Path d={`M16.5 ${y} L18 ${y + 1.5} L20.5 ${y - 1.2}`} fill="none" stroke="#22C55E" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          <Rect x={22.5} y={y - 0.8} width={9} height={1.8} rx={0.9} fill="#C4B5FD" />
        </G>
      ))}
      <Sparks pts={[[42, 8, 2.4], [6, 32, 1.8]]} />
    </Svg>
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
