import React from 'react';
import { CoinIcon } from '@/src/components/ui/CoinIcon';

/**
 * The DP coin medallion on the result screen and the shareable winner card.
 * The app-wide DP coin artwork (CoinIcon) is already a minted gold coin, so it
 * is drawn as is at the medallion size. It is a bundled same-origin image, so
 * it captures on native (view-shot) and web (html-to-image).
 */
export function CoinMedallion({ size }: { size: number }) {
  return <CoinIcon size={size} />;
}

export default CoinMedallion;
