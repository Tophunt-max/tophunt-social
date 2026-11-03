/**
 * Hero slider of the Shop home, drawn to the reference mock (mock.ts HERO,
 * every length scaled by u).
 *
 * Sliding: a Gesture.Pan (touch on native, mouse drag on web) moves one shared
 * position `pos` (in slides); each slide sits at slideOffset(i, pos, n), so
 * the loop has no seam. Release snaps one slide on a long drag or a flick
 * (snapTarget). A single 4 s interval autoplays; it stops while dragging,
 * while the screen is not focused and under reduced motion (swiping still
 * works). Dots jump to a slide; screen readers get an adjustable control
 * ("Agla slide" / "Pichla slide").
 *
 * Honesty: the countdown (one 1 s clock) exists only for an admin drop with a
 * real future end. The fallback slides carry no "drop" / "limited" wording.
 * The mock's illustrated character is not an asset we have: the slide shows
 * the real item's artwork on the viewer's avatar instead.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, type AccessibilityActionEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { countdownParts, type HeroSlide, type HeroSlides } from '@/src/lib/shopModel';
import { TH, glowShadow } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { AUTOPLAY_MS, FONT_FLOOR, HERO, MOCK, fitFont, font, loopDelta, px, slideOffset, snapTarget, wrapIndex } from './mock';
import { ProductPreview } from './ProductPreview';
import { CrownLogo, Laurel } from './ShopArt';

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

/** Centre x (hero px) of the artwork: further left when the timer takes the top-right. */
const artCenter = (timed: boolean) => (timed ? 430 : 500);

export function HeroBanner({
  hero, viewer, u, onExplore, onOpenItem,
}: { hero: HeroSlides<StoreItemView>; viewer: Viewer; u: number; onExplore: () => void; onOpenItem: (id: string) => void }) {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const n = hero.slides.length;
  const W = px(HERO.w, u);
  const H = px(HERO.h, u);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Last time a drag ended: a press right after a drag is the drag's mouse-up, not a tap. */
  const lastDrag = useRef(0);
  const pos = useSharedValue(0);
  const start = useSharedValue(0);
  const duration = reduce ? 0 : 380;

  const timed = hero.mode === 'drop' && hero.endsAt !== null && hero.endsAt > Date.now();
  const now = useSecondClock(timed && focused);
  const cd = timed ? countdownParts(hero.endsAt, now) : null;

  // The store refreshed with fewer slides.
  useEffect(() => {
    if (index >= n) {
      pos.value = 0;
      setIndex(0);
    }
  }, [index, n, pos]);

  const go = useCallback(
    (step: number) => {
      if (n < 2 || step === 0) return;
      const target = Math.round(pos.value) + step;
      pos.value = withTiming(target, { duration }, (done) => {
        if (done) pos.value = wrapIndex(target, n);
      });
      setIndex(wrapIndex(target, n));
    },
    [n, pos, duration],
  );

  useEffect(() => {
    if (n < 2 || reduce || !focused || dragging) return;
    const t = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(t);
    // `index` restarts the period after a swipe or a dot tap.
  }, [n, reduce, focused, dragging, go, index]);

  const onDragStart = useCallback(() => setDragging(true), []);
  const onDragEnd = useCallback((i: number) => {
    lastDrag.current = Date.now();
    setDragging(false);
    setIndex(i);
  }, []);
  const onDragCancel = useCallback(() => setDragging(false), []);

  const pan = Gesture.Pan()
    .enabled(n > 1)
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onStart(() => {
      cancelAnimation(pos);
      start.value = Math.round(pos.value);
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      pos.value = start.value - e.translationX / W;
    })
    .onEnd((e) => {
      const target = snapTarget(start.value, e.translationX, e.velocityX, W);
      pos.value = withTiming(target, { duration }, (done) => {
        if (done) pos.value = wrapIndex(target, n);
      });
      runOnJS(onDragEnd)(wrapIndex(target, n));
    })
    .onFinalize((_e, success) => {
      if (!success) runOnJS(onDragCancel)();
    });

  const pressGuard = (fn: () => void) => () => {
    if (dragging || Date.now() - lastDrag.current < 300) return;
    fn();
  };
  const onA11y = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') go(1);
    else if (e.nativeEvent.actionName === 'decrement') go(-1);
  };

  const radius = px(MOCK.hero.radius, u);
  const t = HERO.timer;
  return (
    <View style={[{ width: W, height: H, borderRadius: radius }, glowShadow('#EC4899', true, 'md')]}>
      <View style={[styles.clip, { width: W, height: H, borderRadius: radius }]}>
        <LinearGradient colors={['#2A0A5E', '#4C0F86', '#7E1A9E']} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 0.9 }} style={StyleSheet.absoluteFill} />
        <HeroBurst width={W} height={H} cx={artCenter(timed)} />
        <GestureDetector gesture={pan}>
          <Animated.View style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({ userSelect: 'none', cursor: n > 1 ? 'grab' : undefined } as any) : null]}>
            {hero.slides.map((s, i) => (
              <SlideView
                key={s.item.itemId}
                i={i}
                n={n}
                pos={pos}
                slide={s}
                viewer={viewer}
                u={u}
                W={W}
                H={H}
                timed={timed}
                visible={i === index}
                onExplore={pressGuard(onExplore)}
                onOpen={pressGuard(() => onOpenItem(s.item.itemId))}
              />
            ))}
          </Animated.View>
        </GestureDetector>

        {cd && !cd.ended ? (
          <View
            style={[styles.timer, { left: px(t.x, u), top: px(t.y, u), width: px(t.w, u), gap: px(3, u) }]}
            pointerEvents="none"
            accessible
            accessibilityLabel={`Limited time. ${cd.d} din ${cd.h} ghante ${cd.m} minute baaki`}
          >
            <View style={[styles.limited, { height: px(t.h, u), borderRadius: px(t.h / 2, u), gap: px(4, u), paddingHorizontal: px(6, u) }]}>
              <Ionicons name="time" size={font(11, u, FONT_FLOOR.label)} color="#FFF" />
              <Text style={[styles.limitedText, { fontSize: font(11, u, FONT_FLOOR.label), letterSpacing: 0.6 * u }]} numberOfLines={1} adjustsFontSizeToFit>LIMITED TIME</Text>
            </View>
            <Text style={[styles.endsIn, { fontSize: font(12, u) }]}>Ends In</Text>
            <View style={[styles.boxes, { gap: px(2, u) }]}>
              {([['D', cd.d], ['H', cd.h], ['M', cd.m], ['S', cd.s]] as const).map(([k, v]) => {
                const num = font(t.num, u, FONT_FLOOR.label);
                const unit = font(t.unit, u, 6.5);
                return (
                  <View key={k} style={[styles.box, { width: px(t.box, u), minHeight: Math.max(px(t.boxH, u), num + unit + 2), borderRadius: px(6, u) }]}>
                    <Text style={[styles.boxNum, { fontSize: num, lineHeight: num * 1.1 }]}>{String(v).padStart(2, '0')}</Text>
                    <Text style={[styles.boxUnit, { fontSize: unit, lineHeight: unit * 1.1 }]}>{k}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {n > 1 ? (
          <View
            style={[styles.dots, { top: px(HERO.dots.y, u) - px(HERO.dots.size / 2, u), gap: px(5, u) }]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Slide ${index + 1} / ${n}: ${hero.slides[index]?.item.name ?? ''}`}
            accessibilityActions={[{ name: 'increment', label: 'Agla slide' }, { name: 'decrement', label: 'Pichla slide' }]}
            onAccessibilityAction={onA11y}
          >
            {hero.slides.map((s, i) => {
              const d = px(HERO.dots.size, u);
              return (
                <TouchableOpacity
                  key={s.item.itemId}
                  onPress={() => go(loopDelta(index, i, n))}
                  hitSlop={8}
                  accessible={false}
                  style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: i === index ? '#F472B6' : 'rgba(255,255,255,0.4)' }}
                />
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Static light burst behind the art: rays, sparks and a gold glow (hero px, scaled to W×H). */
const HeroBurst = React.memo(function HeroBurst({ width, height, cx }: { width: number; height: number; cx: number }) {
  const cy = 72;
  const rays: string[] = [];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const da = k % 2 === 0 ? 0.07 : 0.04;
    const r = 460;
    rays.push(`M${cx} ${cy}L${(cx + r * Math.cos(a - da)).toFixed(1)} ${(cy + r * Math.sin(a - da)).toFixed(1)}L${(cx + r * Math.cos(a + da)).toFixed(1)} ${(cy + r * Math.sin(a + da)).toFixed(1)}Z`);
  }
  const sparks: [number, number, number][] = [[cx - 150, 26, 1.6], [cx + 140, 30, 2], [cx - 110, 120, 1.4], [cx + 170, 112, 1.8], [cx - 40, 14, 1.2], [cx + 60, 132, 1.3], [cx + 100, 60, 1.1]];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${HERO.w} ${HERO.h}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="hb-ray" cx={cx} cy={cy} r={360} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE7FF" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#FFE7FF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hb-gold" cx={cx} cy={cy} r={110} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFD24A" stopOpacity={0.55} />
          <Stop offset="0.5" stopColor="#F59E0B" stopOpacity={0.2} />
          <Stop offset="1" stopColor="#F59E0B" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hb-pink" cx={640} cy={20} r={180} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F472B6" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#F472B6" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={640} cy={20} r={180} fill="url(#hb-pink)" />
      <G opacity={0.55}>
        {rays.map((d) => <Path key={d} d={d} fill="url(#hb-ray)" />)}
      </G>
      <Circle cx={cx} cy={cy} r={110} fill="url(#hb-gold)" />
      {sparks.map(([x, y, r]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#FFF7D6" opacity={0.9} />)}
    </Svg>
  );
});

/** Gold gradient caps with a dark outline and drop shadow (react-native-svg text), laurels either side. */
function GoldTitle({ text, width, max }: { text: string; width: number; max: number }) {
  const lw = Math.max(6, max * 0.42);
  const fs = fitFont(text, width - lw * 2 - 6, max, FONT_FLOOR.title);
  const height = Math.ceil(fs * 1.2);
  const textW = Math.min(width - lw * 2 - 4, text.length * fs * 0.64);
  const x = width / 2;
  const y = height / 2 + fs * 0.36;
  const stroke = Math.max(1.2, fs * 0.09);
  const common = { x, y, fontSize: fs, fontFamily: TH.fonts.bold, textAnchor: 'middle' as const };
  return (
    <View style={{ width, height }} accessible accessibilityRole="header" accessibilityLabel={text}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="hero-gold" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF6C2" />
            <Stop offset="0.45" stopColor="#FFD24A" />
            <Stop offset="1" stopColor="#E08A00" />
          </SvgLinearGradient>
        </Defs>
        <SvgText {...common} y={y + fs * 0.07} fill="rgba(20,0,40,0.55)">{text}</SvgText>
        <SvgText {...common} fill="none" stroke="#3A0D12" strokeWidth={stroke * 2} strokeLinejoin="round">{text}</SvgText>
        <SvgText {...common} fill="url(#hero-gold)" stroke="#FFE9A8" strokeWidth={0.4}>{text}</SvgText>
      </Svg>
      <View style={[styles.laurel, { left: x - textW / 2 - lw - 2, width: lw, height: fs * 1.1, top: (height - fs * 1.1) / 2 }]} pointerEvents="none">
        <Laurel width={lw} height={fs * 1.1} />
      </View>
      <View style={[styles.laurel, { left: x + textW / 2 + 2, width: lw, height: fs * 1.1, top: (height - fs * 1.1) / 2 }]} pointerEvents="none">
        <Laurel width={lw} height={fs * 1.1} flip />
      </View>
    </View>
  );
}

const SlideView = React.memo(function SlideView({
  i, n, pos, slide, viewer, u, W, H, timed, visible, onExplore, onOpen,
}: {
  i: number; n: number; pos: SharedValue<number>; slide: HeroSlide<StoreItemView>; viewer: Viewer; u: number; W: number; H: number; timed: boolean; visible: boolean;
  onExplore: () => void; onOpen: () => void;
}) {
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: slideOffset(i, pos.value, n) * W }] }));
  const textW = px(HERO.textW, u);
  const art = px(HERO.art, u);
  const artLeft = px(artCenter(timed), u) - art / 2;
  const badgeFs = font(HERO.badge.text, u, FONT_FLOOR.label);
  const badgeBox = Math.max(px(HERO.badge.h, u), badgeFs + 4);
  const ctaFs = font(HERO.cta.size, u);
  const ctaH = Math.max(px(HERO.cta.h, u), ctaFs + 6);
  const capsFs = font(HERO.caps.size, u, FONT_FLOOR.label);
  const subFs = font(HERO.sub.size, u);
  const gap = px(2, u);
  // Room kept for the pager dots under the column.
  const dotsRoom = px(HERO.h - HERO.dots.y + 2, u);
  const room = H - dotsRoom;
  const fixed = badgeBox + capsFs * 1.15 + ctaH + gap * 5;
  // Small screens: the floors make the column taller than the mock; drop the subtitle first, then shrink the title.
  const showSub = !!slide.subtitle && fixed + subFs * 1.2 + px(HERO.title.size, u) * 1.2 <= room;
  const titleMax = Math.max(FONT_FLOOR.title, Math.min(px(HERO.title.size, u), (room - fixed - (showSub ? subFs * 1.2 + gap : 0)) / 1.2));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, moving]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={`${slide.item.name} details`}
        style={[styles.abs, { left: artLeft, top: (H - art) / 2, width: art, height: art }]}
      >
        <ProductPreview item={slide.item} viewer={viewer} width={art} height={art} radius={px(18, u)} bare />
      </TouchableOpacity>

      {/* Text column: the mock positions, but flowed and centred so font floors never overlap on small screens. */}
      <View style={[styles.abs, styles.column, { left: px(HERO.textX, u), top: 0, width: textW, height: H - dotsRoom, gap }]} pointerEvents="box-none">
        <View pointerEvents="none">
          <LinearGradient colors={['#FFD24A', '#F5A524']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.badge, { height: badgeBox, borderRadius: badgeBox / 2, paddingHorizontal: px(8, u), gap: px(4, u) }]}>
            <CrownLogo width={badgeFs * 1.2} height={badgeFs} />
            <Text style={[styles.badgeText, { fontSize: badgeFs, letterSpacing: Math.max(0.4, 1 * u) }]} numberOfLines={1}>{slide.badge}</Text>
          </LinearGradient>
        </View>
        <View pointerEvents="none">
          <GoldTitle text={slide.title} width={textW} max={titleMax} />
        </View>
        <Text style={[styles.caps, { width: textW, fontSize: capsFs, lineHeight: capsFs * 1.15, letterSpacing: 2 * u }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {slide.caps}
        </Text>
        {showSub ? (
          <Text style={[styles.sub, { width: textW, fontSize: subFs, lineHeight: subFs * 1.2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {slide.subtitle}
          </Text>
        ) : null}
        <TouchableOpacity onPress={onExplore} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={slide.ctaLabel} style={{ marginTop: gap }}>
          <LinearGradient
            colors={['#FFE45C', '#FFC41A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.cta, { minWidth: px(HERO.cta.w, u), height: ctaH, borderRadius: ctaH / 2, paddingHorizontal: px(10, u), gap: px(5, u) }]}
          >
            <Text style={[styles.ctaText, { fontSize: ctaFs }]} numberOfLines={1}>{slide.ctaLabel}</Text>
            <ArrowIcon variant="arrow" direction="right" size={ctaFs} color="#1A1033" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(236,72,153,0.6)', backgroundColor: '#2A0A5E' },
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  column: { alignItems: 'center', justifyContent: 'center' },
  laurel: { position: 'absolute' },
  badge: { flexDirection: 'row', alignItems: 'center' },
  badgeText: { color: '#2A1300', fontFamily: TH.fonts.bold },
  caps: { color: '#FFFFFF', fontFamily: TH.fonts.bold, textAlign: 'center' },
  sub: { color: '#FFFFFF', fontFamily: TH.fonts.medium, textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#1A1033', fontFamily: TH.fonts.bold },
  timer: { position: 'absolute', alignItems: 'center' },
  limited: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', backgroundColor: '#F43F8E' },
  limitedText: { color: '#FFF', fontFamily: TH.fonts.bold },
  endsIn: { color: '#FFF', fontFamily: TH.fonts.semibold },
  boxes: { flexDirection: 'row', justifyContent: 'center' },
  box: { backgroundColor: '#12072B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  boxNum: { color: '#FFF', fontFamily: TH.fonts.bold },
  boxUnit: { color: '#E9D5FF', fontFamily: TH.fonts.bold },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
