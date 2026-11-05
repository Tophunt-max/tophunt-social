import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ItemStage, type Viewer } from '@/src/components/shop/DigitalItemCard';
import { CosmeticFx, ShimmerSweep } from '@/src/components/gamification/CosmeticFx';
import { CosmeticArtGraphic } from '@/src/components/gamification/CosmeticGraphic';
import { ThemeBackdrop } from '@/src/components/gamification/CosmeticBits';
import { CosmeticPreview } from '@/src/components/gamification/RewardBits';
import { Ionicons } from '@/src/lib/icons';
import { cosmeticArt } from '@/src/lib/cosmeticArt';
import { assetColors } from '@/src/lib/progression';
import { TH, rarityToken } from '@/src/theme/tophunt';
import type { StoreItemView } from '@/src/services/monetization';

/** Premium title plates are 512 × 160. */
const PLATE_RATIO = 160 / 512;

/**
 * The item's OWN artwork only: no profile photo, no name demo. Frames are the
 * ring artwork (its centre stays empty), badges the badge, titles the plate,
 * themes the banner (cover). Animated FX play on the shared fx clock and go
 * static under reduced motion.
 */
export function ItemArt({ item, width, height }: { item: StoreItemView; width: number; height: number }) {
  const s = Math.min(width, height);
  if (item.type === 'theme') {
    return <View style={{ width, height }} pointerEvents="none"><ThemeBackdrop theme={item as any} /></View>;
  }
  const art = cosmeticArt(item);
  const center = { width, height, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (art && (art.kind === 'title' || item.type === 'title')) {
    const w = Math.min(width * 0.96, (height * 0.9) / PLATE_RATIO);
    const h = w * PLATE_RATIO;
    return (
      <View style={center} pointerEvents="none">
        <View style={{ width: w, height: h }}>
          <CosmeticArtGraphic art={art} width={w} height={h} fit="contain" />
          {art.Fx ? <CosmeticFx Fx={art.Fx} fx={art.fx} width={w} height={h} /> : null}
        </View>
      </View>
    );
  }
  if (art) {
    const d = s * (art.kind === 'frame' ? 0.9 : 0.82);
    return (
      <View style={center} pointerEvents="none">
        <View style={{ width: d, height: d }}>
          <CosmeticArtGraphic art={art} width={d} height={d} />
          {art.Fx ? <CosmeticFx Fx={art.Fx} fx={art.fx} width={d} height={d} /> : null}
        </View>
      </View>
    );
  }
  // No bundled / uploaded artwork: a frame would need an avatar to read, so show a neutral glyph instead.
  if (item.type === 'frame') {
    return <View style={center} pointerEvents="none"><Ionicons name="sparkles" size={s * 0.6} color={rarityToken(item.rarity).color} /></View>;
  }
  return (
    <View style={center} pointerEvents="none">
      <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset }} size={s * 0.8} />
    </View>
  );
}

/**
 * The item on a dark
 * stage tinted with the item's colours. Epic and above get a rarity gradient
 * border, a glow and a light shimmer on the shared fx clock (static under
 * reduced motion or while the screen is not focused).
 *
 * `bare`: just the item on a transparent stage (no border, tint or shimmer),
 * so the card it sits on shows through (Shop home cards and hero).
 */
export function ProductPreview({
  item, viewer, width, height, radius = TH.radii.xl, shimmer = true, bare = false, withViewer = false,
}: { item: StoreItemView; viewer: Viewer; width: number; height: number; radius?: number; shimmer?: boolean; bare?: boolean; withViewer?: boolean }) {
  const t = rarityToken(item.rarity);
  // Shop cards show the item's own artwork; only an explicit live preview draws it on the viewer.
  const stageOf = (w: number, h: number) =>
    withViewer ? <ItemStage item={item} w={w} h={h} viewer={viewer} /> : <ItemArt item={item} width={w} height={h} />;
  if (bare) {
    return (
      <View style={{ width, height, borderRadius: radius, overflow: 'hidden' }} pointerEvents="none">
        {stageOf(width, height)}
      </View>
    );
  }
  const [c0, c1] = assetColors(item.asset, [TH.colors.royal, TH.colors.electric]);
  const border = t.glow ? 2 : 1;
  const innerW = width - border * 2;
  const innerH = height - border * 2;
  const stage = (
    <View style={{ width: innerW, height: innerH, borderRadius: radius - border, overflow: 'hidden' }}>
      <LinearGradient colors={TH.gradients.stage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[`${c0}40`, `${c1}66`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {stageOf(innerW, innerH)}
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
