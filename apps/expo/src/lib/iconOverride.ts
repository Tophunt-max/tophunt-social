import React from 'react';
import type { StyleProp, ViewStyle, TextStyle } from 'react-native';

/**
 * Lets a part of the app draw the shared icons from its own artwork. The Shop
 * (app/shop/_layout.tsx) draws every icon from WebP files in
 * assets/icons/shop; everywhere else nothing is provided and the shared
 * vectors draw as before.
 *
 * Consulted by the Ionicons / MaterialCommunityIcons shim (src/lib/icons.tsx),
 * ArrowIcon and CloseIcon. The override returns null for anything it has no
 * art for, and the vector is used.
 */
export type IconRequest =
  | { kind: 'ionicons' | 'mci'; name: string | undefined }
  | { kind: 'chevron' | 'arrow'; flip: boolean }
  | { kind: 'close' | 'close-circle' };

export type IconOverride = (req: IconRequest, size: number, color: string | undefined, style: StyleProp<ViewStyle | TextStyle> | undefined) => React.ReactElement | null;

export const IconOverrideContext = React.createContext<IconOverride | null>(null);
