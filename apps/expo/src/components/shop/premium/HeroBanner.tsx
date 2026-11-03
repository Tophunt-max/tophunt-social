/**
 * Hero banner of the Shop home (reference layout). One slide per featured
 * item (hero first), swipeable, auto-advancing every 5 s while the screen is
 * focused and reduced motion is off. A single interval drives the autoplay and
 * a single 1 s clock drives the countdown, which only exists for a real,
 * future `endsAt` of an admin-configured drop. The honest fallback (top
 * Legendary / Mythic item) carries no "drop" or "limited" wording.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons, MaterialCommunityIcons } from '@/src/lib/icons';
import { countdownParts, type HeroSlides } from '@/src/lib/shopModel';
import { TH, glowShadow } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { ProductPreview } from './ProductPreview';
import { RarityBadge } from './RarityBadge';

const AUTOPLAY_MS = 5000;

/** Wall clock ticking once a second, only while `on`. */
function useSecondClock(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function HeroBanner({
  hero, viewer, width, onExplore, onOpenItem,
}: { hero: HeroSlides<StoreItemView>; viewer: Viewer; width: number; onExplore: () => void; onOpenItem: (id: string) => void }) {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const dragging = useRef(false);
  const scroller = useRef<ScrollView>(null);
  const n = hero.slides.length;

  const timed = hero.mode === 'drop' && hero.endsAt !== null && hero.endsAt > Date.now();
  const now = useSecondClock(timed && focused);
  const cd = timed ? countdownParts(hero.endsAt, now) : null;

  useEffect(() => {
    if (n < 2 || reduce || !focused) return;
    const t = setInterval(() => {
      if (dragging.current) return;
      const next = (indexRef.current + 1) % n;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [n, reduce, focused, width]);

  useEffect(() => {
    if (index >= n) setIndex(0);
  }, [index, n]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== index && i >= 0 && i < n) setIndex(i);
  };

  const wide = width >= 640;
  const height = wide ? 240 : 200;
  const art = wide ? 200 : Math.round(Math.min(150, width * 0.38));

  return (
    <View style={[styles.wrap, { width, height }, glowShadow('#D946EF', true, 'md')]}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={n > 1}
        onScrollBeginDrag={() => { dragging.current = true; }}
        onMomentumScrollEnd={onScrollEnd}
        style={{ width, height }}
      >
        {hero.slides.map((item) => (
          <Slide key={item.itemId} hero={hero} item={item} viewer={viewer} width={width} height={height} art={timed && !wide ? Math.min(art, 112) : art} wide={wide} timed={timed} onExplore={onExplore} onOpenItem={onOpenItem} />
        ))}
      </ScrollView>

      {cd && !cd.ended ? (
        <View style={styles.timerBox} pointerEvents="none" accessible accessibilityLabel={`Limited time. ${cd.d} din ${cd.h} ghante ${cd.m} minute baaki`}>
          <View style={styles.limited}>
            <Ionicons name="time" size={10} color="#FFF" />
            <Text style={styles.limitedText}>LIMITED TIME</Text>
          </View>
          <Text style={styles.endsIn}>Ends In</Text>
          <View style={styles.boxes}>
            {([['D', cd.d], ['H', cd.h], ['M', cd.m], ['S', cd.s]] as const).map(([k, v]) => (
              <View key={k} style={[styles.box, !wide && styles.boxSm]}>
                <Text style={[styles.boxNum, !wide && { fontSize: 12 }]}>{String(v).padStart(2, '0')}</Text>
                <Text style={styles.boxUnit}>{k}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {n > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {hero.slides.map((s, i) => (
            <View key={s.itemId} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Slide({
  hero, item, viewer, width, height, art, wide, timed, onExplore, onOpenItem,
}: {
  hero: HeroSlides<StoreItemView>; item: StoreItemView; viewer: Viewer; width: number; height: number; art: number; wide: boolean; timed: boolean;
  onExplore: () => void; onOpenItem: (id: string) => void;
}) {
  const drop = hero.mode === 'drop';
  return (
    <LinearGradient colors={TH.gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.slide, { width, height }]}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <LinearGradient colors={TH.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
          <MaterialCommunityIcons name="crown" size={11} color="#2A1A00" />
          <Text style={styles.badgeText} numberOfLines={1}>{hero.badge.toUpperCase()}</Text>
        </LinearGradient>
        <Text style={[styles.title, wide && { fontSize: 34, lineHeight: 38 }]} numberOfLines={2} accessibilityRole="header">{hero.title}</Text>
        <Text style={styles.caps} numberOfLines={1}>{drop ? item.name.toUpperCase() : 'LEGENDARY • MYTHIC'}</Text>
        {hero.subtitle ? <Text style={styles.subtitle} numberOfLines={wide ? 2 : 1}>{hero.subtitle}</Text> : null}
        <TouchableOpacity onPress={onExplore} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={hero.ctaLabel} style={{ alignSelf: 'flex-start', marginTop: wide ? 14 : 10 }}>
          <LinearGradient colors={TH.gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cta, !wide && { height: 34, paddingHorizontal: 12 }]}>
            <Text style={[styles.ctaText, !wide && { fontSize: 12.5 }]} numberOfLines={1}>{hero.ctaLabel}</Text>
            <ArrowIcon variant="arrow" direction="right" size={12} color="#2A1A00" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => onOpenItem(item.itemId)} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel={`${item.name} details`} style={[styles.art, timed && { alignSelf: wide ? 'center' : 'flex-end', marginTop: wide ? 40 : 0, marginBottom: wide ? 0 : 6 }]}>
        <View style={[styles.artGlow, { width: art + 30, height: art + 30, borderRadius: (art + 30) / 2 }]} />
        <ProductPreview item={item} viewer={viewer} width={art} height={art} radius={TH.radii.xl} />
        <View style={styles.artBadge} pointerEvents="none"><RarityBadge rarity={item.rarity} /></View>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: TH.radii.xxl, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(217,70,239,0.55)', alignSelf: 'center', backgroundColor: '#2A0B5E' },
  slide: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10, overflow: 'hidden' },
  glowA: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(217,70,239,0.28)', top: -110, right: -50 },
  glowB: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(139,92,246,0.3)', bottom: -90, left: -40 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: TH.radii.pill, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 9.5, letterSpacing: 1 },
  title: { color: TH.colors.gold, fontFamily: TH.fonts.bold, fontSize: 24, lineHeight: 28, marginTop: 8, textShadowColor: 'rgba(245,158,11,0.55)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  caps: { color: '#F5D0FE', fontFamily: TH.fonts.bold, fontSize: 10.5, letterSpacing: 1.6, marginTop: 4 },
  subtitle: { color: '#DDD6FE', fontFamily: TH.fonts.medium, fontSize: 12, lineHeight: 16, marginTop: 3 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: TH.radii.pill },
  ctaText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 14 },
  art: { alignItems: 'center', justifyContent: 'center' },
  artGlow: { position: 'absolute', backgroundColor: 'rgba(255,200,87,0.16)' },
  artBadge: { position: 'absolute', top: 8, left: 8 },
  timerBox: { position: 'absolute', top: 10, right: 12, alignItems: 'flex-end', gap: 3 },
  limited: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: TH.colors.pink, borderRadius: TH.radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  limitedText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  endsIn: { color: '#F5D0FE', fontFamily: TH.fonts.semibold, fontSize: 10 },
  boxes: { flexDirection: 'row', gap: 4 },
  box: { minWidth: 34, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(11,6,32,0.7)', borderWidth: 1, borderColor: 'rgba(236,72,153,0.6)', alignItems: 'center' },
  boxSm: { minWidth: 26, paddingVertical: 2 },
  boxNum: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 15 },
  boxUnit: { color: '#F9A8D4', fontFamily: TH.fonts.bold, fontSize: 8 },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { width: 18, backgroundColor: TH.colors.gold },
});
