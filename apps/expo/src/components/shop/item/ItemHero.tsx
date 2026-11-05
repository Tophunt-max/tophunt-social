/**
 * Item detail hero: a dark stage with a soft radial glow in the rarity
 * colour, the item drawn large on the viewer's own avatar / name in the
 * selected context, the rarity badge (top-left), a real NEW / LIMITED /
 * TRENDING tag (top-right, heroTag), and a segmented control that switches
 * between the contexts the item type actually shows in.
 *
 * Motion: the cosmetic renderers animate their own FX on the shared fx clock
 * and go static under reduced motion / off-screen; the shimmer does the same.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ShimmerSweep } from '@/src/components/gamification/CosmeticFx';
import { RarityBadge } from '@/src/components/shop/premium/RarityBadge';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { PREVIEW_CONTEXT_LABEL, previewContexts, type HeroTag, type PreviewContext } from '@/src/lib/shopItemModel';
import type { StoreItemView } from '@/src/services/monetization';
import { SHOP_TAG_NEW, SHOP_VIOLET_GRAD, TH, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import { ItemPreviewContext } from './ItemPreviewContexts';

const TAG_GRAD: Record<HeroTag['kind'], [string, string]> = {
  new: SHOP_TAG_NEW,
  limited: SHOP_VIOLET_GRAD,
  trending: ['#FF8A4D', '#FF4D67'],
};

/** Stage height for a column width (phone: ~0.95 × width, capped). */
export function heroStageHeight(width: number): number {
  return Math.round(Math.min(width * 0.95, 400));
}

function Glow({ color, width, height }: { color: string; width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="itemHeroGlow" cx="50%" cy="46%" rx="58%" ry="52%">
          <Stop offset="0" stopColor={color} stopOpacity="0.42" />
          <Stop offset="0.55" stopColor={color} stopOpacity="0.12" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#itemHeroGlow)" />
    </Svg>
  );
}

export const ItemHero = React.memo(function ItemHero({
  item, viewer, width, p, tag,
}: { item: StoreItemView; viewer: Viewer; width: number; p: TophuntPalette; tag: HeroTag | null }) {
  const t = rarityToken(item.rarity);
  const contexts = useMemo(() => previewContexts(item.type), [item.type]);
  const [ctx, setCtx] = useState<PreviewContext>(contexts[0]);
  // A new item (Similar items navigates in place) may not have the current tab.
  useEffect(() => {
    if (!contexts.includes(ctx)) setCtx(contexts[0]);
  }, [contexts, ctx]);
  const active = contexts.includes(ctx) ? ctx : contexts[0];
  const border = t.glow ? 2 : 1;
  const stageW = width - border * 2;
  const stageH = heroStageHeight(width) - border * 2;
  const r = TH.radii.xxl;

  const stage = (
    <View style={{ width: stageW, height: stageH, borderRadius: r - border, overflow: 'hidden' }}>
      <LinearGradient colors={TH.gradients.stage} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Glow color={t.color} width={stageW} height={stageH} />
      <View style={StyleSheet.absoluteFill} accessible accessibilityLabel={`${item.name} ka preview: ${PREVIEW_CONTEXT_LABEL[active]}`}>
        <ItemPreviewContext ctx={active} item={item} viewer={viewer} width={stageW} height={stageH} />
      </View>
      {t.glow ? <ShimmerSweep width={stageW} /> : null}
      <View style={styles.topLeft} pointerEvents="none"><RarityBadge rarity={item.rarity} size="md" /></View>
      {tag ? (
        <LinearGradient colors={TAG_GRAD[tag.kind]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tag} pointerEvents="none">
          <Text style={styles.tagText}>{tag.label}</Text>
        </LinearGradient>
      ) : null}
    </View>
  );

  return (
    <View style={{ width }}>
      {t.glow ? (
        <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: r, padding: border }}>
          {stage}
        </LinearGradient>
      ) : (
        <View style={{ borderRadius: r, borderWidth: 1, borderColor: `${t.color}55`, overflow: 'hidden' }}>{stage}</View>
      )}

      {contexts.length > 1 ? (
        <View style={[styles.segment, { backgroundColor: p.cardAlt, borderColor: p.border }]} accessibilityRole="tablist">
          {contexts.map((c) => {
            const on = c === active;
            return (
              <Pressable
                key={c}
                onPress={() => setCtx(c)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${PREVIEW_CONTEXT_LABEL[c]} preview`}
                style={[styles.segBtn, on && { backgroundColor: p.card }, on && !p.isDark && styles.segShadow]}
              >
                <Text style={[styles.segText, { color: on ? p.text : p.sub }]} numberOfLines={1}>{PREVIEW_CONTEXT_LABEL[c]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={[styles.caption, { color: p.sub }]}>Live preview: aapki DP aur naam par</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  topLeft: { position: 'absolute', top: 12, left: 12 },
  tag: { position: 'absolute', top: 12, right: 12, borderRadius: TH.radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: TH.colors.white, fontFamily: TH.fonts.bold, fontSize: 11, letterSpacing: 0.7 },
  segment: { flexDirection: 'row', marginTop: 12, padding: 3, borderRadius: TH.radii.md, borderWidth: 1, gap: 2 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: TH.radii.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segShadow: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  caption: { fontFamily: TH.fonts.medium, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
