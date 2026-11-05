/**
 * TopHunt premium design tokens (Shop + Earn redesign).
 *
 * Pure data and helpers only: no react-native import, so vitest can load this
 * file in plain Node. The hook that picks light/dark surfaces lives in
 * `src/theme/tophunt.ts`, which re-exports everything here.
 *
 * Fonts: only Urbanist Regular / Medium / SemiBold / Bold are loaded by
 * app/_layout.tsx, so Bold is the heaviest weight these tokens use. (Older
 * screens ask for 'Urbanist-Black', which is not loaded and falls back.)
 */

/**
 * The app brand (constants/theme.ts Colors.primary, Explore BRAND): the pink
 * every other screen uses for buttons, active tabs, links and the + button.
 * Shop and Earn use the same pink so they look like the rest of TopHunt.
 */
export const BRAND = '#FF4D67';
export const BRAND_DEEP = '#E8364F';
/** Primary button fill (light top → brand). */
export const BRAND_BUTTON: [string, string] = ['#FF6B81', '#FF4D67'];
/** The Explore brand gradient (pink → violet) for hero banners and highlights. */
export const BRAND_GRAD: [string, string] = ['#FF4D67', '#8B5CF6'];

/**
 * Phone Shop home accents (design mock): violet for the active tab, "View All"
 * links and the banners; brand pink stays the primary CTA and the cart badge;
 * the yellow button is used ONLY by the "Grab Now" and "Upgrade Now" banner
 * buttons.
 */
export const SHOP_VIOLET = '#7C3AED';
/** Active tab pill, collection / orders cards. */
export const SHOP_VIOLET_GRAD: [string, string] = ['#7C3AED', '#A855F7'];
/** "Grab Now" / "Upgrade Now" fill and the dark text on it. */
export const SHOP_YELLOW_BTN: [string, string] = ['#FFE066', '#FFC857'];
export const SHOP_YELLOW_INK = '#2A1A00';
/** Dark navy balance pills of the phone header (both modes). */
export const SHOP_NAVY = '#1E1B3A';
/** Soft lavender card border / shadow tint (light mode). */
export const SHOP_LAVENDER = '#E9E1FB';
/** Hero slide: deep purple → violet → magenta. */
export const SHOP_HERO_GRAD: [string, string, string] = ['#2E0A5E', '#6D28D9', '#C026D3'];
/** "Daily Shop Deals" banner: pink → magenta → violet. */
export const SHOP_DEALS_GRAD: [string, string, string] = ['#FF4D8D', '#D946EF', '#7C3AED'];
/** "Upgrade Your Profile" banner: violet → magenta. */
export const SHOP_UPGRADE_GRAD: [string, string, string] = ['#5B21B6', '#7C3AED', '#C026D3'];
/** Dark purple / navy stage of the Featured cards (and Trending tiles in dark mode). */
export const SHOP_DARK_CARD: [string, string, string] = ['#2B1259', '#1C1542', '#110E2A'];
/** Pink "NEW" tag. */
export const SHOP_TAG_NEW: [string, string] = ['#FF4D67', '#F43F5E'];
/** Per-card gradients of the "Popular Collection" grid, in order. */
export const SHOP_POPULAR_GRADS: [string, string][] = [
  ['#7C3AED', '#C026D3'],
  ['#4338CA', '#2563EB'],
  ['#6B2163', '#9D174D'],
  ['#DB2777', '#F472B6'],
  ['#3B0764', '#6D28D9'],
  ['#1E3A8A', '#7C3AED'],
];
/**
 * Admin collection card gradients by accent name (shopModel SHOP_ACCENTS).
 * The first five match SHOP_POPULAR_GRADS so admin cards keep the mock look.
 */
export const SHOP_ACCENT_GRADS: Record<'violet' | 'blue' | 'plum' | 'pink' | 'purple' | 'gold', [string, string]> = {
  violet: ['#7C3AED', '#C026D3'],
  blue: ['#4338CA', '#2563EB'],
  plum: ['#6B2163', '#9D174D'],
  pink: ['#DB2777', '#F472B6'],
  purple: ['#3B0764', '#6D28D9'],
  gold: ['#92400E', '#D97706'],
};
/** Phone Digital tab category cards (VS, Victory, Profile FX, Gifts): violet / magenta, in order. */
export const SHOP_DIGITAL_CAT_GRADS: [string, string][] = [
  ['#6D28D9', '#C026D3'],
  ['#9333EA', '#DB2777'],
  ['#4C1D95', '#8B5CF6'],
  ['#BE185D', '#A855F7'],
];
/** Phone Digital tab "Special Collections" banner: white → lavender → pink glow (light), deep violet (dark). */
export const SHOP_SPECIAL_GRAD_LIGHT: [string, string, string] = ['#FFFFFF', '#F1EAFF', '#FFE0EE'];
export const SHOP_SPECIAL_GRAD_DARK: [string, string, string] = ['#2B1259', '#4C1D95', '#7E22CE'];
/** Green "FREE" tag (price 0). */
export const SHOP_TAG_FREE: [string, string] = ['#22C55E', '#16A34A'];
/** "Shop Bundles" cards: rich violet → magenta. */
export const SHOP_BUNDLE_GRAD: [string, string, string] = ['#4C1D95', '#7E22CE', '#C026D3'];

export const TH = {
  colors: {
    /** Brand pink (buttons, active states, links). */
    primary: BRAND,
    /** Deeper brand pink (gradient ends, pressed / link on light). */
    royal: BRAND_DEEP,
    /** Page background (dark): the app's dark background. */
    deep: '#0F0F13',
    deep2: '#16171E',
    card: '#16171E',
    /** Card border (dark). */
    neonBorder: '#23262F',
    neon: BRAND,
    lilac: '#FFB3C0',
    /** DP coin / Legendary gold. Currency and rarity only, never a button. */
    gold: '#FFC857',
    goldDeep: '#F59E0B',
    electric: '#8B5CF6',
    /** Diamond currency cyan. Currency only, never a button. */
    diamond: '#22D3EE',
    success: '#22C55E',
    danger: '#F43F5E',
    pink: BRAND,
    sub: '#8B8F9A',
    white: '#FFFFFF',
  },
  gradients: {
    hero: ['#FF4D67', '#C2417F', '#8B5CF6'] as [string, string, string],
    gold: ['#FFC857', '#F59E0B'] as [string, string],
    diamond: ['#22D3EE', '#38BDF8'] as [string, string],
    pink: BRAND_GRAD,
    /** Page background (dark mode). */
    neonBg: ['#0F0F13', '#0F0F13'] as [string, string],
    /** Active tab pill: brand pink. */
    tabOn: BRAND_BUTTON,
    /** Primary call to action: brand pink. */
    cta: BRAND_BUTTON,
    /** Hero banner (dark, brand-tinted). */
    banner: ['#1B1D26', '#3A1A2A', '#4A1832'] as [string, string, string],
    /** Title text fill solid fallback. */
    goldText: ['#FFE8A3', '#FFC857', '#F59E0B'] as [string, string, string],
    /** Dark preview stage behind item artwork (both modes: items are designed on dark). */
    stage: ['#22232E', '#181920', '#101117'] as [string, string, string],
  },
  radii: { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 28, pill: 999 },
  spacing: { xxs: 4, xs: 6, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  fonts: {
    regular: 'Urbanist-Regular',
    medium: 'Urbanist-Medium',
    semibold: 'Urbanist-SemiBold',
    bold: 'Urbanist-Bold',
  },
  /** Content column on wide screens (web desktop, tablets). */
  maxContentWidth: 1200,
} as const;

export interface TophuntSurfaces {
  isDark: boolean;
  bg: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  sub: string;
  /** Translucent fill for chips/buttons laid over cards. */
  glass: string;
  skeleton: string;
  /** Page background gradient. */
  bgGradient: [string, string];
  /** Bordered "glow" cards of the reference layout. */
  glowBorder: string;
  /** Shadow colour for the glow (iOS / web); Android gets a small elevation. */
  glowShadow: string;
  /** Gold accent text that reads on `card`. */
  gold: string;
}

export const TH_DARK: TophuntSurfaces = {
  isDark: true,
  bg: TH.colors.deep,
  card: TH.colors.card,
  cardAlt: '#1B1D26',
  border: '#23262F',
  text: '#FFFFFF',
  sub: '#8B8F9A',
  glass: 'rgba(255,255,255,0.06)',
  skeleton: '#22252E',
  bgGradient: TH.gradients.neonBg,
  glowBorder: '#23262F',
  glowShadow: '#000000',
  gold: TH.colors.gold,
};

export const TH_LIGHT: TophuntSurfaces = {
  isDark: false,
  bg: '#F9F9FB',
  card: '#FFFFFF',
  cardAlt: '#F1F2F6',
  border: '#EEEEF2',
  text: '#121212',
  sub: '#7A7A80',
  glass: 'rgba(18,18,18,0.05)',
  skeleton: '#ECEDF1',
  bgGradient: ['#F9F9FB', '#F9F9FB'],
  glowBorder: '#EEEEF2',
  glowShadow: '#000000',
  gold: '#B45309',
};

export const surfacesFor = (isDark: boolean): TophuntSurfaces => (isDark ? TH_DARK : TH_LIGHT);

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface RarityToken {
  id: RarityId;
  label: string;
  color: string;
  gradient: [string, string];
  /** Glowing border + shimmer (epic and above). */
  glow: boolean;
  /** 1 (common) … 6 (mythic). */
  rank: number;
  /** Text colour that reads on `gradient`. */
  ink: string;
}

export const RARITY_TOKENS: Record<RarityId, RarityToken> = {
  common: { id: 'common', label: 'Common', color: '#9AA3AD', gradient: ['#9AA3AD', '#6B7280'], glow: false, rank: 1, ink: '#FFFFFF' },
  uncommon: { id: 'uncommon', label: 'Uncommon', color: '#22C55E', gradient: ['#4ADE80', '#16A34A'], glow: false, rank: 2, ink: '#FFFFFF' },
  rare: { id: 'rare', label: 'Rare', color: '#38BDF8', gradient: ['#38BDF8', '#2563EB'], glow: false, rank: 3, ink: '#FFFFFF' },
  epic: { id: 'epic', label: 'Epic', color: '#A78BFA', gradient: ['#8B5CF6', '#6D28D9'], glow: true, rank: 4, ink: '#FFFFFF' },
  legendary: { id: 'legendary', label: 'Legendary', color: '#FFC857', gradient: ['#FFC857', '#F59E0B'], glow: true, rank: 5, ink: '#2A1A00' },
  mythic: { id: 'mythic', label: 'Mythic', color: '#EC4899', gradient: ['#EC4899', '#8B5CF6'], glow: true, rank: 6, ink: '#FFFFFF' },
};

/** Token for any rarity string; unknown values read as common. */
export function rarityToken(r?: string | null): RarityToken {
  return (RARITY_TOKENS as Record<string, RarityToken>)[String(r ?? '')] ?? RARITY_TOKENS.common;
}

/** Rank for sorting (unknown = 0, so it sorts below common). */
export function rarityRankOf(r?: string | null): number {
  return (RARITY_TOKENS as Record<string, RarityToken>)[String(r ?? '')]?.rank ?? 0;
}

/** Grid columns for a content width: 2 phone, 3 tablet (≥700), 4 desktop (≥1100). */
export function gridColumns(width: number): 2 | 3 | 4 {
  if (width >= 1100) return 4;
  if (width >= 700) return 3;
  return 2;
}

/** Width of one grid cell given the content width, column count, gap and side padding. */
export function gridCellWidth(contentWidth: number, columns: number, gap: number, pad: number): number {
  const inner = Math.max(0, contentWidth - pad * 2 - gap * (columns - 1));
  return Math.floor(inner / Math.max(1, columns));
}

/**
 * Soft glow for bordered cards: a coloured shadow on iOS / web, a small
 * elevation on Android (an Android shadow cannot be coloured cheaply). Static:
 * no animation.
 */
export function glowShadow(color: string, isDark: boolean, strength: 'sm' | 'md' = 'sm') {
  const md = strength === 'md';
  return {
    shadowColor: color,
    shadowOpacity: isDark ? (md ? 0.55 : 0.35) : md ? 0.25 : 0.15,
    shadowRadius: md ? 18 : 10,
    shadowOffset: { width: 0, height: md ? 4 : 2 },
    elevation: md ? 6 : 2,
  };
}

/** Column count for a tile grid of the reference layout at a content width. */
export function tileColumns(width: number, wide: number, phone: number): number {
  if (width >= 1100) return wide;
  if (width >= 700) return Math.max(phone, Math.round((wide + phone) / 2));
  return phone;
}
