import React from 'react';
import type { StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image } from 'expo-image';

/**
 * The app-wide currency artwork: 💎 Diamond, 🪙 DP coin and ⚡ XP. One
 * transparent 192 px WebP each (assets/images/currency, built from the PNGs
 * in assets/images by scripts/gen-currency-webp.mjs). DiamondIcon, CoinIcon
 * and XpIcon draw these, so every screen shows the same three icons.
 */
export const CURRENCY_IMAGES = {
  diamond: require('@/assets/images/currency/diamond.webp'),
  dpCoin: require('@/assets/images/currency/dp-coin.webp'),
  xp: require('@/assets/images/currency/xp.webp'),
} as const;

export type CurrencyImageKind = keyof typeof CURRENCY_IMAGES;

const LABEL: Record<CurrencyImageKind, string> = { diamond: 'Diamond', dpCoin: 'DP coin', xp: 'XP' };

export function CurrencyImage({ kind, size, style }: { kind: CurrencyImageKind; size: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Image
      source={CURRENCY_IMAGES[kind]}
      style={[{ width: size, height: size }, style as StyleProp<ImageStyle>]}
      contentFit="contain"
      transition={0}
      cachePolicy="memory"
      accessibilityLabel={LABEL[kind]}
    />
  );
}
