import React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { Ionicons as IonShim, MaterialCommunityIcons as MciShim, lucideNameOf } from '@/src/lib/icons';
import { IconOverrideContext, type IconOverride } from '@/src/lib/iconOverride';
import { SHOP_ICONS, type ShopIconKey } from '@/assets/icons/shop';
import { ShopIcon } from './ShopIcon';

/**
 * The Shop's functional icons. Every glyph is a white WebP in
 * assets/icons/shop/ui, tinted with `color`, so the Shop draws no vector icons
 * and an admin can replace any of them (Shop → Shop Assets).
 *
 * - `Ionicons` / `MaterialCommunityIcons`: drop-ins with the shim's names and
 *   props (src/lib/icons.tsx). A name resolves exactly as the shim resolves it
 *   (Ionicons name → lucide glyph → `ui<Glyph>` key).
 * - `ShopIconScope`: wraps every Shop route (app/shop/_layout.tsx) so shared
 *   components drawn inside the Shop (ArrowIcon, CloseIcon, BackButton,
 *   SectionError, RarityPill, TierPill, …) use these WebPs too.
 *
 * test/shopIcons.test.ts checks every icon name the Shop uses has its WebP.
 * An unknown name falls back to the neutral circle, as the shim does, and
 * warns in development.
 */
export const shopGlyphKey = (set: 'ionicons' | 'mci', name: string | undefined): ShopIconKey => {
  const lucide = lucideNameOf(set, name);
  const key = lucide === 'X' ? 'uiClose' : `ui${lucide}`;
  if (key in SHOP_ICONS) return key as ShopIconKey;
  if (__DEV__) console.warn(`[ShopGlyphs] no Shop WebP for ${set} "${name}" (${key}); add it to assets/icons/shop/ui.`);
  return 'uiCircle';
};

const glyph = (key: ShopIconKey, size: number, color: string | undefined, style: unknown, flip = false) => (
  // Box is size x size, like the vectors it replaces; the art is fitted inside.
  <ShopIcon name={key} width={size} height={size} color={color} flip={flip} style={style as StyleProp<ImageStyle>} />
);

/** Everything the shared icon components can ask for, drawn from assets/icons/shop. */
export const shopIconOverride: IconOverride = (req, size, color, style) => {
  switch (req.kind) {
    case 'ionicons':
    case 'mci':
      return glyph(shopGlyphKey(req.kind, req.name), size, color ?? '#000000', style);
    case 'chevron':
      return glyph('uiChevron', size, color, style, req.flip);
    case 'arrow':
      return glyph('uiArrow', size, color, style, req.flip);
    case 'close':
      return glyph('uiClose', size, color, style);
    case 'close-circle':
      return glyph('uiCloseCircle', size, color, style);
  }
};

export function ShopIconScope({ children }: { children: React.ReactNode }) {
  return <IconOverrideContext.Provider value={shopIconOverride}>{children}</IconOverrideContext.Provider>;
}

interface Props {
  name?: string;
  size?: number;
  color?: string;
  style?: unknown;
  [key: string]: unknown;
}

function makeSet(set: 'ionicons' | 'mci', glyphMap: Record<string, unknown>) {
  const Comp = ({ name, size = 24, color = '#000000', style }: Props) => glyph(shopGlyphKey(set, name), size, color, style);
  (Comp as any).glyphMap = glyphMap;
  return Comp as React.FC<Props> & { glyphMap: typeof glyphMap };
}

export const Ionicons = makeSet('ionicons', IonShim.glyphMap);
export const MaterialCommunityIcons = makeSet('mci', MciShim.glyphMap);
