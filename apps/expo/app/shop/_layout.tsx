import React from 'react';
import { Stack } from 'expo-router';
import { ShopIconScope } from '@/src/components/shop/ShopGlyphs';

/**
 * Every Shop route draws its icons from assets/icons/shop (WebP), including
 * the shared components it renders (back button, arrows, close, error and
 * rarity pills). See src/components/shop/ShopGlyphs.tsx.
 */
export default function ShopLayout() {
  return (
    <ShopIconScope>
      <Stack screenOptions={{ headerShown: false }} />
    </ShopIconScope>
  );
}
