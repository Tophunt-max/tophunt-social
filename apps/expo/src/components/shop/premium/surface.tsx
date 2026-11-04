/**
 * Card surface helpers for the Shop home, on the app's neutral surfaces
 * (TophuntPalette): flat cards with a 1 px border, no coloured glow, and the
 * dark stage item artwork is designed on.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SHOP_LAVENDER, SHOP_VIOLET, TH, type TophuntPalette } from '@/src/theme/tophunt';

/** Dark mode: none. Light mode: a very soft neutral shadow under a flat card. */
export function cardShadow(p: TophuntPalette) {
  if (p.isDark) return null;
  return { shadowColor: p.glowShadow, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 };
}

/**
 * Dark stage (TH.gradients.stage) behind item artwork on a card, in both
 * modes: frames, titles and badges are designed on dark. Same box as its
 * child, so it does not change the layout.
 */
export function ArtStage({ width, height, radius, children }: { width: number; height: number; radius: number; children: React.ReactNode }) {
  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden' }} pointerEvents="none">
      <LinearGradient colors={TH.gradients.stage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** Phone home card border: soft lavender in light mode, the app border in dark. */
export function shopBorder(p: TophuntPalette): string {
  return p.isDark ? p.border : SHOP_LAVENDER;
}

/** Phone home card shadow: a soft violet-tinted shadow in light mode, none in dark. */
export function lavenderShadow(p: TophuntPalette) {
  if (p.isDark) return null;
  return { shadowColor: SHOP_VIOLET, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 };
}
