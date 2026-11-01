/**
 * The admin's featured drop (Monetization → Store → Featured drop). Shown only
 * when the server sent a live block and at least one of its items is on sale;
 * the countdown appears only for a real end time and the banner removes
 * itself when that time passes.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@/src/lib/icons';
import { useCountdown } from '@/src/hooks/useCountdown';
import type { FeaturedView } from '@/src/lib/shopModel';
import { TH } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { ProductPreview } from './ProductPreview';
import { RarityBadge } from './RarityBadge';

export function FeaturedCollectionBanner({
  feature, viewer, width, onExplore, onOpenHero,
}: { feature: FeaturedView<StoreItemView>; viewer: Viewer; width: number; onExplore: () => void; onOpenHero: () => void }) {
  const cd = useCountdown(feature.endsAt);
  if (cd.ended) return null;
  const wide = width >= 640;
  const stage = Math.round(Math.min(wide ? 260 : width * 0.4, 260));
  const count = feature.items.length;
  return (
    <LinearGradient colors={['#2A0F5C', '#3B1C8C', '#0E3A66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { width }]}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={[styles.row, !wide && { gap: 12 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <LinearGradient colors={TH.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
            <MaterialCommunityIcons name="crown" size={12} color="#2A1A00" />
            <Text style={styles.badgeText} numberOfLines={1}>{feature.badge.toUpperCase()}</Text>
          </LinearGradient>
          <Text style={[styles.title, wide && { fontSize: 30, lineHeight: 34 }]} numberOfLines={2} accessibilityRole="header">{feature.title}</Text>
          {feature.subtitle ? <Text style={styles.subtitle} numberOfLines={wide ? 3 : 2}>{feature.subtitle}</Text> : null}
          {cd.label ? (
            <View style={styles.timer} accessibilityLabel={`${cd.label} baaki`}>
              <Ionicons name="time" size={13} color={TH.colors.gold} />
              <Text style={styles.timerText}>{cd.label} baaki</Text>
            </View>
          ) : null}
          <TouchableOpacity onPress={onExplore} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${feature.ctaLabel}: ${count} featured items`} style={{ alignSelf: 'flex-start', marginTop: 14 }}>
            <LinearGradient colors={TH.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
              <Text style={styles.ctaText} numberOfLines={1}>{feature.ctaLabel}</Text>
              <View style={styles.ctaCount}><Text style={styles.ctaCountText}>{count}</Text></View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onOpenHero} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`${feature.hero.name} details`}>
          <ProductPreview item={feature.hero} viewer={viewer} width={stage} height={stage} radius={TH.radii.xl} />
          <View style={styles.heroBadge} pointerEvents="none"><RarityBadge rarity={feature.hero.rarity} /></View>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: TH.radii.xxl, padding: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,200,87,0.35)', alignSelf: 'center' },
  glowA: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(139,92,246,0.35)', top: -120, right: -60 },
  glowB: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(56,189,248,0.18)', bottom: -90, left: -40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: TH.radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 10.5, letterSpacing: 1 },
  title: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 22, lineHeight: 26, marginTop: 10 },
  subtitle: { color: '#D9D3F5', fontFamily: TH.fonts.medium, fontSize: 13, lineHeight: 18, marginTop: 6 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, borderRadius: TH.radii.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(8,8,23,0.55)', borderWidth: 1, borderColor: 'rgba(255,200,87,0.4)' },
  timerText: { color: TH.colors.gold, fontFamily: TH.fonts.bold, fontSize: 12 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingLeft: 18, paddingRight: 6, borderRadius: TH.radii.pill },
  ctaText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 14 },
  ctaCount: { minWidth: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(42,26,0,0.15)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  ctaCountText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 12 },
  heroBadge: { position: 'absolute', top: 10, left: 10 },
});
