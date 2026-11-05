import React from 'react';
import type { StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image } from 'expo-image';

/**
 * The app-wide currency artwork: 💎 Diamond, 🪙 DP coin and ⚡ XP. One
 * transparent 192 px WebP each (assets/images/currency, lossy q82 with
 * full-quality alpha). DiamondIcon, CoinIcon and XpIcon draw these, so every
 * screen shows the same three icons. To change one, replace its WebP with a
 * square transparent WebP of the same size.
 *
 * 192 px covers the largest slot (64 pt, the result-screen medallion) at 3x.
 * Sources are static `require`s, so Metro bundles them and expo-image decodes
 * them from the app bundle on native (no network) and from hashed, immutable
 * URLs on web.
 */
export const CURRENCY_IMAGES = {
  diamond: require('@/assets/images/currency/diamond.webp'),
  dpCoin: require('@/assets/images/currency/dp-coin.webp'),
  xp: require('@/assets/images/currency/xp.webp'),
} as const;

export type CurrencyImageKind = keyof typeof CURRENCY_IMAGES;

/** Opacity for a greyed-out icon (disabled / not affordable). The artwork is full colour, so it can't be tinted. */
export const MUTED_OPACITY = 0.45;

export interface CurrencyImageProps {
  kind: CurrencyImageKind;
  size: number;
  style?: StyleProp<ViewStyle>;
  /** Greyed-out look for disabled or unaffordable states. */
  muted?: boolean;
  /**
   * Spoken label. Omit it (the default) when the icon sits next to text that
   * already names the currency, or inside an element with its own label: the
   * icon is then hidden from screen readers so it isn't read twice.
   */
  accessibilityLabel?: string;
}

export function CurrencyImage({ kind, size, style, muted = false, accessibilityLabel }: CurrencyImageProps) {
  const labelled = !!accessibilityLabel;
  return (
    <Image
      source={CURRENCY_IMAGES[kind]}
      style={[{ width: size, height: size }, muted && { opacity: MUTED_OPACITY }, style as StyleProp<ImageStyle>]}
      contentFit="contain"
      transition={0}
      cachePolicy="memory"
      priority="high"
      accessible={labelled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
      alt={accessibilityLabel ?? ''}
    />
  );
}
