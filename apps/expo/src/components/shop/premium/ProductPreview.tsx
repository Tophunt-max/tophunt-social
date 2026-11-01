import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ItemStage, type Viewer } from '@/src/components/shop/DigitalItemCard';
import { ShimmerSweep } from '@/src/components/gamification/CosmeticFx';
import { assetColors } from '@/src/lib/progression';
import { TH, rarityToken } from '@/src/theme/tophunt';
import type { StoreItemView } from '@/src/services/monetization';

/**
 * The item drawn on the viewer's own avatar / name (ItemStage) on a dark
 * stage tinted with the item's colours. Epic and above get a rarity gradient
 * border, a glow and a light shimmer on the shared fx clock (static under
 * reduced motion or while the screen is not focused).
 */
export function ProductPreview({
  item, viewer, width, height, radius = TH.radii.xl, shimmer = true,
}: { item: StoreItemView; viewer: Viewer; width: number; height: number; radius?: number; shimmer?: boolean }) {
  const t = rarityToken(item.rarity);
  const [c0, c1] = assetColors(item.asset, [TH.colors.royal, TH.colors.electric]);
  const border = t.glow ? 2 : 1;
  const innerW = width - border * 2;
  const innerH = height - border * 2;
  const stage = (
    <View style={{ width: innerW, height: innerH, borderRadius: radius - border, overflow: 'hidden' }}>
      <LinearGradient colors={TH.gradients.stage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[`${c0}40`, `${c1}66`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <ItemStage item={item} w={innerW} h={innerH} viewer={viewer} />
      {t.glow && shimmer ? <ShimmerSweep width={innerW} /> : null}
    </View>
  );
  if (!t.glow) {
    return <View style={{ width, height, borderRadius: radius, borderWidth: 1, borderColor: `${t.color}55`, overflow: 'hidden' }}>{stage}</View>;
  }
  return (
    <LinearGradient
      colors={t.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ width, height, borderRadius: radius, padding: border }, styles.glow, { shadowColor: t.color }]}
    >
      {stage}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  glow: { shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
});
