import React, { useState } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { AppImage } from '@/src/components/ui/AppImage';
import { SHOP_ICONS, type ShopIconDef, type ShopIconKey } from '@/assets/icons/shop';
import { useShopAssets } from '@/src/services/appSettings';
import { safeArtUrl } from '@/src/lib/rewardsCenter';

/**
 * One Shop artwork slot (assets/icons/shop). Draws the admin's upload for
 * this key when there is one (appConfig.shopAssets), else the bundled WebP.
 * While an upload loads the bundled art is the placeholder, and if it fails
 * the slot stays on the bundled art.
 *
 * Size: pass `width` + `height` (the box; the art is fitted inside), or
 * `size` for the art's height, the width following its aspect ratio.
 * `color` tints the single-colour glyphs (laurel, tab glyphs, cube line);
 * other artwork is full colour and ignores it. `flip` mirrors horizontally.
 * Decorative: hidden from screen readers.
 */
export function ShopIcon({
  name,
  size,
  width,
  height,
  color,
  flip = false,
  style,
}: {
  name: ShopIconKey;
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  flip?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  const def: ShopIconDef = SHOP_ICONS[name];
  const h = height ?? size ?? 24;
  const w = width ?? (size != null ? (size * def.w) / def.h : h);
  const url = safeArtUrl(useShopAssets()?.[name]);
  const [failed, setFailed] = useState<string | null>(null);
  const tintColor = def.tint && color ? color : undefined;
  const box: StyleProp<ImageStyle> = [{ width: w, height: h }, flip && { transform: [{ scaleX: -1 }] }, style];
  const common = {
    contentFit: 'contain' as const,
    tintColor,
    accessible: false,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
    pointerEvents: 'none' as const,
  };
  if (url && failed !== url) {
    return (
      <AppImage
        {...common}
        source={{ uri: url }}
        displayWidth={Math.ceil(w)}
        placeholder={def.source}
        placeholderContentFit="contain"
        style={box}
        transition={120}
        onError={() => setFailed(url)}
      />
    );
  }
  return <Image {...common} source={def.source} style={box} transition={0} cachePolicy="memory" />;
}

export default ShopIcon;
