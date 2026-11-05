import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { CurrencyImage } from './CurrencyImage';

/**
 * XpIcon — the app-wide ⚡ XP symbol. Use it everywhere an XP amount is shown.
 * It draws the XP artwork (assets/images/currency/xp.webp). `color` is
 * accepted for older callers and ignored: the artwork has its own colours.
 */
export interface XpIconProps {
  size?: number;
  /** Ignored (the artwork is full colour). Kept so existing callers compile. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Greyed-out look (disabled / not affordable). */
  muted?: boolean;
  /** Spoken label; omit when nearby text already names the currency (the icon is then hidden from screen readers). */
  accessibilityLabel?: string;
}

export function XpIcon({ size = 16, style, muted, accessibilityLabel }: XpIconProps) {
  return <CurrencyImage kind="xp" size={size} style={style} muted={muted} accessibilityLabel={accessibilityLabel} />;
}

export default XpIcon;
