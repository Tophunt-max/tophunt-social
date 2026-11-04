/**
 * Hero slider of the Shop home, drawn to the reference mock (mock.ts HERO,
 * every length scaled by u).
 *
 * Sliding: a Gesture.Pan (touch on native, mouse drag on web) moves one shared
 * position `pos` (in slides); each slide sits at slideOffset(i, pos, n), so
 * the loop has no seam. Release snaps one slide on a long drag or a flick
 * (snapTarget). A single interval autoplays (hero.autoplayMs: the admin's
 * autoplaySec, else 4 s); it stops while dragging, while the screen is not
 * focused and under reduced motion (swiping still works). Dots jump to a
 * slide; screen readers get an adjustable control ("Agla slide" / "Pichla slide").
 *
 * Admin slides (shopModel adminHeroSlides) may carry artwork: it is drawn as
 * the full slide background (phones prefer mobileImageUrl) under a dark
 * gradient on the text side, and the whole slide follows the slide's target.
 * Without artwork a slide draws its first live item, as before.
 *
 * Honesty: the countdown (one 1 s clock) exists only for the CURRENT slide's
 * real future end (a drop's end, or an admin slide with showCountdown). The
 * fallback slides carry no "drop" / "limited" wording. The mock's
 * illustrated character is not an asset we have: the slide shows the real
 * item's artwork on the viewer's avatar instead.
 *
 * Colours: the slide stays dark in both app themes (TH.gradients.banner; item
 * art is designed on dark) with white text; the CTA, active dot and
 * "LIMITED TIME" pill are brand pink. The badge pill is brand pink, or the
 * rarity colours when it names a rarity ("LEGENDARY DROP", "EPIC COLLECTION").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, type AccessibilityActionEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { countdownParts, slideImage, type HeroSlide, type HeroSlides, type ShopNav } from '@/src/lib/shopModel';
import { BRAND, BRAND_BUTTON, RARITY_TOKENS, TH, TH_DARK, type RarityToken } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { FONT_FLOOR, HERO, HERO_M, MOCK, MOCK_M, fitFont, font, loopDelta, mfont, px, slideOffset, snapTarget, wrapIndex } from './mock';
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

/**
 * Badge pill colours: a rarity named in the badge text keeps its rarity
 * gradient and ink (item semantics, e.g. gold for "LEGENDARY DROP");
 * anything else is a brand pink pill with white text.
 */
function badgeLook(badge: string): { colors: [string, string]; ink: string } {
  const up = badge.toUpperCase();
  const r = (Object.values(RARITY_TOKENS) as RarityToken[]).find((t) => up.includes(t.label.toUpperCase()) && t.rank >= 3);
  return r ? { colors: r.gradient, ink: r.ink } : { colors: BRAND_BUTTON, ink: TH.colors.white };
}

/** Text-side scrim over admin artwork: the dark app background, fading out. */
const SCRIM: [string, string, string] = ['rgba(15,15,19,0.88)', 'rgba(15,15,19,0.55)', 'rgba(15,15,19,0)'];

/** Centre x (hero px) of the artwork: further left when the timer takes the top-right. */
const artCenter = (timed: boolean) => (timed ? 430 : 500);

export function HeroBanner({
  hero, viewer, u, onNav, onOpenItem, variant = 'desktop',
}: {
  hero: HeroSlides<StoreItemView>;
  viewer: Viewer;
  u: number;
  /** CTA (every slide) and a tap on an admin slide: follow the slide's target. */
  onNav: (nav: ShopNav) => void;
  /** A tap on the item art of a drop / fallback slide. */
  onOpenItem: (id: string) => void;
  /** 'mobile' draws the 340 px phone mock (HERO_M, u = width / 340); 'desktop' the 748 mock (HERO). Same slider. */
  variant?: 'desktop' | 'mobile';
}) {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const mobile = variant === 'mobile';
  const n = hero.slides.length;
  const W = px(mobile ? HERO_M.w : HERO.w, u);
  const H = px(mobile ? HERO_M.h : HERO.h, u);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Last time a drag ended: a press right after a drag is the drag's mouse-up, not a tap. */
  const lastDrag = useRef(0);
  const pos = useSharedValue(0);
  const start = useSharedValue(0);
  const duration = reduce ? 0 : 380;

  const current = hero.slides[Math.min(index, n - 1)];
  const curEnd = current?.endsAt ?? null;
  const timed = curEnd !== null && curEnd > Date.now();
  const now = useSecondClock(timed && focused);
  const cd = timed ? countdownParts(curEnd, now) : null;

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
    const t = setInterval(() => go(1), hero.autoplayMs);
    return () => clearInterval(t);
    // `index` restarts the period after a swipe or a dot tap.
  }, [n, reduce, focused, dragging, go, index, hero.autoplayMs]);

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

  const radius = px(mobile ? MOCK_M.hero.radius : MOCK.hero.radius, u);
  const t = HERO.timer;
  const tm = HERO_M.timer;
  const dotSize = px(mobile ? HERO_M.dots.size : HERO.dots.size, u);
  const dotsTop = px(mobile ? HERO_M.dots.y : HERO.dots.y, u) - dotSize / 2;
  return (
    <View style={{ width: W, height: H, borderRadius: radius }}>
      <View style={[styles.clip, { width: W, height: H, borderRadius: radius }]}>
        <LinearGradient colors={TH.gradients.banner} start={{ x: 0, y: 0.1 }} end={{ x: 1, y: 0.9 }} style={StyleSheet.absoluteFill} />
        {mobile ? (
          <HeroBurst width={W} height={H} vw={HERO_M.w} vh={HERO_M.h} cx={HERO_M.w - HERO_M.art / 2 + 4} cy={HERO_M.h / 2} k={0.42} />
        ) : (
          <HeroBurst width={W} height={H} cx={artCenter(timed)} />
        )}
        <GestureDetector gesture={pan}>
          <Animated.View style={[StyleSheet.absoluteFill, Platform.OS === 'web' ? ({ userSelect: 'none', cursor: n > 1 ? 'grab' : undefined } as any) : null]}>
            {hero.slides.map((s, i) => {
              const explore = pressGuard(() => onNav(s.nav));
              // Admin slides lead to their target from anywhere; drop / fallback art opens the item.
              const open = hero.mode === 'admin' || !s.item ? explore : pressGuard(() => onOpenItem(s.item!.itemId));
              return mobile ? (
                <MobileSlideView key={s.key} i={i} n={n} pos={pos} slide={s} viewer={viewer} u={u} W={W} H={H} visible={i === index} onExplore={explore} onOpen={open} />
              ) : (
                <SlideView
                  key={s.key}
                  i={i}
                  n={n}
                  pos={pos}
                  slide={s}
                  viewer={viewer}
                  u={u}
                  W={W}
                  H={H}
                  timed={s.endsAt !== null && s.endsAt > Date.now()}
                  visible={i === index}
                  onExplore={explore}
                  onOpen={open}
                />
              );
            })}
          </Animated.View>
        </GestureDetector>

        {cd && !cd.ended && mobile ? (
          <View
            style={[styles.timer, { right: px(tm.right, u), top: px(tm.top, u), gap: px(3, u) }]}
            pointerEvents="none"
            accessible
            accessibilityLabel={`Limited time. ${cd.d} din ${cd.h} ghante ${cd.m} minute baaki`}
          >
            <View style={[styles.limited, { alignSelf: 'center', width: px(tm.pillW, u), height: px(tm.pillH, u), borderRadius: px(tm.pillH / 2, u), gap: px(3, u), paddingHorizontal: px(4, u) }]}>
              <Ionicons name="time" size={mfont(9, u)} color="#FFF" />
              <Text style={[styles.limitedText, { fontSize: mfont(tm.label, u), letterSpacing: 0.3 * u }]} numberOfLines={1}>LIMITED TIME</Text>
            </View>
            <View style={[styles.boxes, { gap: px(tm.gap, u) }]}>
              {([['D', cd.d], ['H', cd.h], ['M', cd.m], ['S', cd.s]] as const).map(([k, v]) => {
                const num = mfont(tm.num, u);
                const unit = mfont(tm.unit, u);
                return (
                  <View key={k} style={[styles.box, { width: px(tm.box, u), height: px(tm.boxH, u), borderRadius: px(4, u) }]}>
                    <Text style={[styles.boxNum, { fontSize: num, lineHeight: num * 1.1 }]}>{String(v).padStart(2, '0')}</Text>
                    <Text style={[styles.boxUnit, { fontSize: unit, lineHeight: unit * 1.1 }]}>{k}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : cd && !cd.ended ? (
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
            style={[styles.dots, { top: dotsTop, gap: px(mobile ? 4 : 5, u) }]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Slide ${index + 1} / ${n}: ${slideName(hero.slides[index])}`}
            accessibilityActions={[{ name: 'increment', label: 'Agla slide' }, { name: 'decrement', label: 'Pichla slide' }]}
            onAccessibilityAction={onA11y}
          >
            {hero.slides.map((s, i) => {
              const d = dotSize;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => go(loopDelta(index, i, n))}
                  hitSlop={8}
                  accessible={false}
                  style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: i === index ? BRAND : 'rgba(255,255,255,0.4)' }}
                />
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** What a slide is called for screen readers: the item, else the admin title. */
const slideName = (s: HeroSlide<StoreItemView> | undefined) => (s ? s.item?.name ?? [s.title, s.caps].filter(Boolean).join(' ') : '');

/**
 * Admin artwork as the full slide background (cover), a dark gradient on the
 * text side so the copy stays readable, and one button for the whole slide.
 */
function SlideArtwork({ uri, W, H, label, onOpen, textFrac }: { uri: string; W: number; H: number; label: string; onOpen: () => void; textFrac: number }) {
  return (
    <TouchableOpacity onPress={onOpen} activeOpacity={0.95} accessibilityRole="button" accessibilityLabel={label} style={StyleSheet.absoluteFill}>
      <AppImage source={{ uri }} displayWidth={W} style={{ width: W, height: H }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      <LinearGradient
        colors={SCRIM}
        locations={[0, Math.min(0.9, textFrac * 0.75), Math.min(1, textFrac + 0.2)]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </TouchableOpacity>
  );
}

/** Static light burst behind the art: rays, sparks and a soft brand pink glow (hero px, scaled to W×H). */
const HeroBurst = React.memo(function HeroBurst({
  width, height, cx, cy = 72, vw = HERO.w, vh = HERO.h, k = 1,
}: { width: number; height: number; cx: number; cy?: number; vw?: number; vh?: number; k?: number }) {
  // k scales every radius / offset (1 = the 748 mock); desktop output is unchanged at k = 1.
  const rays: string[] = [];
  for (let j = 0; j < 18; j++) {
    const a = (j / 18) * Math.PI * 2;
    const da = j % 2 === 0 ? 0.07 : 0.04;
    const r = 460 * k;
    rays.push(`M${cx} ${cy}L${(cx + r * Math.cos(a - da)).toFixed(1)} ${(cy + r * Math.sin(a - da)).toFixed(1)}L${(cx + r * Math.cos(a + da)).toFixed(1)} ${(cy + r * Math.sin(a + da)).toFixed(1)}Z`);
  }
  const at = (dx: number, y: number, r: number): [number, number, number] => [cx + dx * k, cy + (y - 72) * k, r];
  const sparks: [number, number, number][] = [at(-150, 26, 1.6), at(140, 30, 2), at(-110, 120, 1.4), at(170, 112, 1.8), at(-40, 14, 1.2), at(60, 132, 1.3), at(100, 60, 1.1)];
  const pinkX = vw - 108 * k;
  const pinkY = cy + (20 - 72) * k;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="hb-ray" cx={cx} cy={cy} r={360 * k} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE7FF" stopOpacity={0.5} />
          <Stop offset="1" stopColor="#FFE7FF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hb-gold" cx={cx} cy={cy} r={110 * k} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND} stopOpacity={0.45} />
          <Stop offset="0.5" stopColor={BRAND} stopOpacity={0.15} />
          <Stop offset="1" stopColor={BRAND} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hb-pink" cx={pinkX} cy={pinkY} r={180 * k} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND} stopOpacity={0.3} />
          <Stop offset="1" stopColor={BRAND} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={pinkX} cy={pinkY} r={180 * k} fill="url(#hb-pink)" />
      <G opacity={0.55}>
        {rays.map((d) => <Path key={d} d={d} fill="url(#hb-ray)" />)}
      </G>
      <Circle cx={cx} cy={cy} r={110 * k} fill="url(#hb-gold)" />
      {sparks.map(([x, y, r]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={TH.colors.white} opacity={0.9} />)}
    </Svg>
  );
});

/** White caps with a dark outline and drop shadow (react-native-svg text) on the dark slide, light pink laurels either side. */
function HeroTitle({ text, width, max }: { text: string; width: number; max: number }) {
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
        <SvgText {...common} y={y + fs * 0.07} fill="rgba(0,0,0,0.55)">{text}</SvgText>
        <SvgText {...common} fill="none" stroke={TH_DARK.bg} strokeWidth={stroke * 2} strokeLinejoin="round">{text}</SvgText>
        <SvgText {...common} fill={TH.colors.white}>{text}</SvgText>
      </Svg>
      <View style={[styles.laurel, { left: x - textW / 2 - lw - 2, width: lw, height: fs * 1.1, top: (height - fs * 1.1) / 2 }]} pointerEvents="none">
        <Laurel width={lw} height={fs * 1.1} color={TH.colors.lilac} />
      </View>
      <View style={[styles.laurel, { left: x + textW / 2 + 2, width: lw, height: fs * 1.1, top: (height - fs * 1.1) / 2 }]} pointerEvents="none">
        <Laurel width={lw} height={fs * 1.1} flip color={TH.colors.lilac} />
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
  const image = slideImage(slide, false);
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
      {image ? (
        <SlideArtwork uri={image} W={W} H={H} label={`${slideName(slide)}: ${slide.ctaLabel}`} onOpen={onOpen} textFrac={(HERO.textX + HERO.textW) / HERO.w} />
      ) : slide.item ? (
        <TouchableOpacity
          onPress={onOpen}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel={`${slide.item.name} details`}
          style={[styles.abs, { left: artLeft, top: (H - art) / 2, width: art, height: art }]}
        >
          <ProductPreview item={slide.item} viewer={viewer} width={art} height={art} radius={px(18, u)} bare />
        </TouchableOpacity>
      ) : null}

      {/* Text column: the mock positions, but flowed and centred so font floors never overlap on small screens. */}
      <View style={[styles.abs, styles.column, { left: px(HERO.textX, u), top: 0, width: textW, height: H - dotsRoom, gap }]} pointerEvents="box-none">
        {slide.badge ? (
          <View pointerEvents="none">
            <LinearGradient colors={badgeLook(slide.badge).colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.badge, { height: badgeBox, borderRadius: badgeBox / 2, paddingHorizontal: px(8, u), gap: px(4, u) }]}>
              <CrownLogo width={badgeFs * 1.2} height={badgeFs} />
              <Text style={[styles.badgeText, { fontSize: badgeFs, letterSpacing: Math.max(0.4, 1 * u), color: badgeLook(slide.badge).ink }]} numberOfLines={1}>{slide.badge}</Text>
            </LinearGradient>
          </View>
        ) : null}
        <View pointerEvents="none">
          <HeroTitle text={slide.title} width={textW} max={titleMax} />
        </View>
        {slide.caps ? (
          <Text style={[styles.caps, { width: textW, fontSize: capsFs, lineHeight: capsFs * 1.15, letterSpacing: 2 * u }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {slide.caps}
          </Text>
        ) : null}
        {showSub ? (
          <Text style={[styles.sub, { width: textW, fontSize: subFs, lineHeight: subFs * 1.2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {slide.subtitle}
          </Text>
        ) : null}
        <TouchableOpacity onPress={onExplore} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={slide.ctaLabel} style={{ marginTop: gap }}>
          <LinearGradient
            colors={BRAND_BUTTON}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.cta, { minWidth: px(HERO.cta.w, u), height: ctaH, borderRadius: ctaH / 2, paddingHorizontal: px(10, u), gap: px(5, u) }]}
          >
            <Text style={[styles.ctaText, { fontSize: ctaFs }]} numberOfLines={1}>{slide.ctaLabel}</Text>
            <ArrowIcon variant="arrow" direction="right" size={ctaFs} color={TH.colors.white} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

/** One line of white title text with a dark outline (react-native-svg), left-aligned, shrunk to fit `width`. */
function HeroLine({ text, width, size }: { text: string; width: number; size: number }) {
  const fs = fitFont(text, width, size, Math.min(size, 10));
  const height = Math.ceil(fs * 1.12);
  const y = height / 2 + fs * 0.35;
  const common = { x: 1, y, fontSize: fs, fontFamily: TH.fonts.bold, textAnchor: 'start' as const };
  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        <SvgText {...common} y={y + fs * 0.06} fill="rgba(0,0,0,0.55)">{text}</SvgText>
        <SvgText {...common} fill="none" stroke={TH_DARK.bg} strokeWidth={Math.max(1, fs * 0.08) * 2} strokeLinejoin="round">{text}</SvgText>
        <SvgText {...common} fill={TH.colors.white}>{text}</SvgText>
      </Svg>
    </View>
  );
}

/** "MYTHIC COLLECTION" caps → "Mythic Collection" for the second title line of the phone hero. */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp: string, c: string) => sp + c.toUpperCase());

/**
 * One slide of the phone hero (HERO_M, 316×124 mock px): text column left
 * (badge, two title lines, the type line, CTA), the item art large on the
 * right, bleeding past the edge.
 */
const MobileSlideView = React.memo(function MobileSlideView({
  i, n, pos, slide, viewer, u, W, H, visible, onExplore, onOpen,
}: {
  i: number; n: number; pos: SharedValue<number>; slide: HeroSlide<StoreItemView>; viewer: Viewer; u: number; W: number; H: number; visible: boolean;
  onExplore: () => void; onOpen: () => void;
}) {
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: slideOffset(i, pos.value, n) * W }] }));
  const image = slideImage(slide, true);
  const textW = px(HERO_M.textW, u);
  const art = px(HERO_M.art, u);
  const badgeFs = mfont(HERO_M.badge.text, u);
  const badgeH = px(HERO_M.badge.h, u);
  const ctaFs = mfont(HERO_M.cta.size, u);
  const ctaH = px(HERO_M.cta.h, u);
  const subFs = mfont(HERO_M.sub, u);
  const line2 = slide.caps ? titleCase(slide.caps) : '';
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, moving]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {image ? (
        <SlideArtwork uri={image} W={W} H={H} label={`${slideName(slide)}: ${slide.ctaLabel}`} onOpen={onOpen} textFrac={(HERO_M.textX + HERO_M.textW) / HERO_M.w} />
      ) : slide.item ? (
        <TouchableOpacity
          onPress={onOpen}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel={`${slide.item.name} details`}
          style={[styles.abs, { left: W - art + px(8, u), top: (H - art) / 2, width: art, height: art }]}
        >
          <ProductPreview item={slide.item} viewer={viewer} width={art} height={art} radius={px(14, u)} bare />
        </TouchableOpacity>
      ) : null}

      <View style={[styles.abs, styles.columnLeft, { left: px(HERO_M.textX, u), top: 0, width: textW, height: H - px(10, u), gap: px(2, u) }]} pointerEvents="box-none">
        {slide.badge ? (
          <View pointerEvents="none">
            <LinearGradient colors={badgeLook(slide.badge).colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.badge, { height: badgeH, borderRadius: badgeH / 2, paddingHorizontal: px(6, u), gap: px(3, u) }]}>
              <CrownLogo width={badgeFs * 1.2} height={badgeFs} />
              <Text style={[styles.badgeText, { fontSize: badgeFs, letterSpacing: 0.5 * u, color: badgeLook(slide.badge).ink }]} numberOfLines={1}>{slide.badge}</Text>
            </LinearGradient>
          </View>
        ) : null}
        <View accessible accessibilityRole="header" accessibilityLabel={`${slide.title} ${line2}`.trim()}>
          <HeroLine text={slide.title} width={textW} size={mfont(HERO_M.line1, u)} />
          {line2 ? <HeroLine text={line2} width={textW} size={mfont(HERO_M.line2, u)} /> : null}
        </View>
        {slide.subtitle ? (
          <Text style={[styles.sub, { textAlign: 'left', width: textW, fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {slide.subtitle}
          </Text>
        ) : null}
        <TouchableOpacity onPress={onExplore} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={slide.ctaLabel} style={{ marginTop: px(4, u) }}>
          <LinearGradient
            colors={BRAND_BUTTON}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.cta, { width: px(HERO_M.cta.w, u), height: ctaH, borderRadius: ctaH / 2, paddingHorizontal: px(8, u), gap: px(4, u) }]}
          >
            <Text style={[styles.ctaText, { fontSize: ctaFs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{slide.ctaLabel}</Text>
            <ArrowIcon variant="arrow" direction="right" size={ctaFs} color={TH.colors.white} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', borderWidth: 1, borderColor: TH_DARK.border, backgroundColor: TH_DARK.cardAlt },
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  column: { alignItems: 'center', justifyContent: 'center' },
  columnLeft: { alignItems: 'flex-start', justifyContent: 'center' },
  laurel: { position: 'absolute' },
  badge: { flexDirection: 'row', alignItems: 'center' },
  badgeText: { fontFamily: TH.fonts.bold },
  caps: { color: '#FFFFFF', fontFamily: TH.fonts.bold, textAlign: 'center' },
  sub: { color: '#FFFFFF', fontFamily: TH.fonts.medium, textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: TH.colors.white, fontFamily: TH.fonts.bold },
  timer: { position: 'absolute', alignItems: 'center' },
  limited: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', backgroundColor: BRAND },
  limitedText: { color: '#FFF', fontFamily: TH.fonts.bold },
  endsIn: { color: '#FFF', fontFamily: TH.fonts.semibold },
  boxes: { flexDirection: 'row', justifyContent: 'center' },
  box: { backgroundColor: TH_DARK.bg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  boxNum: { color: '#FFF', fontFamily: TH.fonts.bold },
  boxUnit: { color: TH.colors.lilac, fontFamily: TH.fonts.bold },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
