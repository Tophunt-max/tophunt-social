/**
 * TopHunt premium theme: tokens (src/theme/tophuntTokens.ts) plus the hook
 * that picks light or dark surfaces for the current colour scheme.
 */
import { useMemo } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { surfacesFor, type TophuntSurfaces } from './tophuntTokens';

export * from './tophuntTokens';

export type TophuntPalette = TophuntSurfaces;

export function useTophuntPalette(): TophuntPalette {
  const isDark = useColorScheme() === 'dark';
  return useMemo(() => surfacesFor(isDark), [isDark]);
}

/**
 * The same surfaces in the shape older shop tiles take (ExplorePalette), so
 * the physical-product tiles can be drawn on the premium surfaces unchanged.
 */
export function asExplorePalette(p: TophuntPalette) {
  return { isDark: p.isDark, bg: p.bg, card: p.card, chip: p.cardAlt, text: p.text, sub: p.sub, border: p.border, skeleton: p.skeleton };
}
