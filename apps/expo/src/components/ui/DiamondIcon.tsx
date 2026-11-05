import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { CurrencyImage } from './CurrencyImage';

/**
 * DiamondIcon — the app-wide 💎 symbol for Diamonds, the play-only balance.
 *
 *   Diamond  (this icon)  contest entry fees; earned free (XP, rewards)
 *   DP coin  (CoinIcon)   contest prizes; spent in the Shop and on gifts
 *
 * Use it everywhere a Diamond amount is shown so the two balances can be told
 * apart at a glance. It draws the Diamond artwork
 * (assets/images/currency/diamond.webp). `color` is accepted for older callers
 * and ignored: the artwork has its own colours.
 */
export const DIAMOND_COLOR = '#22D3EE';

export interface DiamondIconProps {
  size?: number;
  /** Ignored (the artwork is full colour). Kept so existing callers compile. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Greyed-out look (disabled / not affordable). */
  muted?: boolean;
  /** Spoken label; omit when nearby text already names the currency (the icon is then hidden from screen readers). */
  accessibilityLabel?: string;
}

export function DiamondIcon({ size = 16, style, muted, accessibilityLabel }: DiamondIconProps) {
  return <CurrencyImage kind="diamond" size={size} style={style} muted={muted} accessibilityLabel={accessibilityLabel} />;
}

export default DiamondIcon;
