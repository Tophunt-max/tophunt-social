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

export const TH = {
  colors: {
    primary: '#8B5CF6',
    royal: '#6D28D9',
    /** Neon store background (reference layout): #0B0620 → #120A2E. */
    deep: '#0B0620',
    deep2: '#120A2E',
    card: '#1A0F3D',
    /** Purple glow border on dark cards. */
    neonBorder: 'rgba(168,85,247,0.45)',
    neon: '#A855F7',
    lilac: '#C4B5FD',
    gold: '#FFC857',
    goldDeep: '#F59E0B',
    electric: '#38BDF8',
    diamond: '#22D3EE',
    success: '#22C55E',
    danger: '#F43F5E',
    pink: '#EC4899',
    sub: '#A5A5C5',
    white: '#FFFFFF',
  },
  gradients: {
    hero: ['#6D28D9', '#8B5CF6', '#38BDF8'] as [string, string, string],
    gold: ['#FFC857', '#F59E0B'] as [string, string],
    diamond: ['#22D3EE', '#38BDF8'] as [string, string],
    pink: ['#EC4899', '#8B5CF6'] as [string, string],
    /** Page background (dark mode). */
    neonBg: ['#0B0620', '#120A2E'] as [string, string],
    /** Active tab pill: light purple. */
    tabOn: ['#C4B5FD', '#A855F7'] as [string, string],
    /** Yellow CTA. */
    cta: ['#FFE066', '#FFC857'] as [string, string],
    /** Hero banner (purple / magenta). */
    banner: ['#2A0B5E', '#4C1D95', '#831843'] as [string, string, string],
    /** Gold title text fill (used as a solid fallback where gradients are not drawn on text). */
    goldText: ['#FFE8A3', '#FFC857', '#F59E0B'] as [string, string, string],
    /** Dark preview stage behind item artwork (both modes: items are designed on dark). */
    stage: ['#1A1440', '#14142B', '#0D0D22'] as [string, string, string],
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
  cardAlt: '#241452',
  border: '#2E1D5E',
  text: '#FFFFFF',
  sub: '#B9AEDC',
  glass: 'rgba(255,255,255,0.08)',
  skeleton: '#251653',
  bgGradient: TH.gradients.neonBg,
  glowBorder: TH.colors.neonBorder,
  glowShadow: TH.colors.neon,
  gold: TH.colors.gold,
};

export const TH_LIGHT: TophuntSurfaces = {
  isDark: false,
  bg: '#F6F5FF',
  card: '#FFFFFF',
  cardAlt: '#EFEDFF',
  border: '#E4E1F7',
  text: '#1B1530',
  sub: '#6B6890',
  glass: 'rgba(109,40,217,0.07)',
  skeleton: '#E9E6FA',
  bgGradient: ['#F6F5FF', '#EEE8FF'],
  glowBorder: 'rgba(139,92,246,0.35)',
  glowShadow: '#8B5CF6',
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
