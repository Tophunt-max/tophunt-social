import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { CurrencyImage } from './CurrencyImage';

/**
 * CoinIcon — the SINGLE, app-wide 🪙 DP coin symbol.
 *
 * Use this EVERYWHERE a DP coin amount/balance is shown so the coin looks
 * identical across the app. It draws the DP coin artwork
 * (assets/images/currency/dp-coin.webp). `color` is accepted for older
 * callers and ignored: the artwork has its own colours.
 */
export const COIN_COLOR = '#FFB300';

export interface CoinIconProps {
  size?: number;
  /** Ignored (the artwork is full colour). Kept so existing callers compile. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Greyed-out look (disabled / not affordable). */
  muted?: boolean;
  /** Spoken label; omit when nearby text already names the currency (the icon is then hidden from screen readers). */
  accessibilityLabel?: string;
}

export function CoinIcon({ size = 16, style, muted, accessibilityLabel }: CoinIconProps) {
  return <CurrencyImage kind="dpCoin" size={size} style={style} muted={muted} accessibilityLabel={accessibilityLabel} />;
}

export default CoinIcon;
