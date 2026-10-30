/**
 * Animated overlay for cosmetics: lightweight glow/particles on FREE XP items,
 * richer sparkles/flames/aurora on Premium items, and title-chip shimmer.
 * Driven by the shared clock in src/lib/fxClock.ts, so any number on screen
 * costs one looping animation.
 *
 * Off (drawn static) under reduced motion, while the screen is not focused,
 * while the app is backgrounded, or with `motion="none"`.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useScreenActive } from '@/src/hooks/useScreenActive';
import { fxClock, useFxClock } from '@/src/lib/fxClock';
import type { FxMotion } from '@/src/lib/cosmeticArt';

export type MotionLevel = 'full' | 'none';

function useMotionOn(motion: MotionLevel) {
  const reduce = useReducedMotion();
  const active = useScreenActive();
  const on = motion !== 'none' && !reduce && active;
  useFxClock(on);
  return on;
}

const TAU = Math.PI * 2;

/** `Fx` drawn over its base at `width` × `height`, moving with `fx`. */
export function CosmeticFx({
  Fx,
  fx,
  width,
  height,
  motion = 'full',
  style,
  preserveAspectRatio,
}: {
  Fx: FC<SvgProps>;
  fx?: FxMotion;
  width: number | string;
  height: number | string;
  motion?: MotionLevel;
  style?: StyleProp<ViewStyle>;
  preserveAspectRatio?: string;
}) {
  const on = useMotionOn(motion);
  const kind = fx ?? 'pulse';
  const anim = useAnimatedStyle(() => {
    if (!on) return { opacity: 1, transform: [{ rotate: '0deg' }, { scale: 1 }, { translateX: 0 }] };
    const c = fxClock.value;
    switch (kind) {
      case 'spin':
        return { opacity: 1, transform: [{ rotate: `${c * 360}deg` }, { scale: 1 }, { translateX: 0 }] };
      case 'twinkle': {
        const t = Math.abs(Math.sin(TAU * 2 * c));
        return { opacity: 0.25 + 0.75 * t, transform: [{ rotate: '0deg' }, { scale: 0.92 + 0.08 * t }, { translateX: 0 }] };
      }
      case 'flicker':
        return {
          opacity: 0.82 + 0.18 * Math.sin(TAU * 7 * c),
          transform: [{ rotate: '0deg' }, { scale: 1 + 0.035 * Math.sin(TAU * 5 * c) }, { translateX: 0 }],
        };
      case 'drift':
        return {
          opacity: 0.85 + 0.15 * Math.sin(TAU * 2 * c),
          transform: [{ rotate: '0deg' }, { scale: 1.06 }, { translateX: 9 * Math.sin(TAU * c) }],
        };
      case 'pulse':
      default:
        return { opacity: 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(TAU * 3 * c)), transform: [{ rotate: '0deg' }, { scale: 1 }, { translateX: 0 }] };
    }
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, style, anim]}>
      <Fx width={width as any} height={height as any} {...(preserveAspectRatio ? { preserveAspectRatio } : {})} />
    </Animated.View>
  );
}

/**
 * A light band sweeping across its parent (premium title chips). The parent
 * must clip (`overflow: 'hidden'`) and pass its width.
 */
export function ShimmerSweep({ width, motion = 'full' }: { width: number; motion?: MotionLevel }) {
  const on = useMotionOn(motion);
  const band = Math.max(18, width * 0.35);
  const anim = useAnimatedStyle(() => {
    if (!on) return { opacity: 0, transform: [{ translateX: -band }] };
    // Two sweeps per lap, each followed by a rest: (c*2) % 1 in [0, 0.5) sweeps.
    const p = (fxClock.value * 2) % 1;
    const k = Math.min(1, p / 0.5);
    return { opacity: p < 0.5 ? 1 : 0, transform: [{ translateX: -band + (width + band * 2) * k }] };
  });
  if (!width) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.sweep, { width: band }, anim]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** A tiny diamond hallmark for premium items where artwork has no room for one. */
export function PremiumGem({ size = 10 }: { size?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Premium"
      style={{ width: size, height: size, transform: [{ rotate: '45deg' }], backgroundColor: '#C026D3', borderWidth: 1, borderColor: '#F5D0FE', borderRadius: size * 0.18 }}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
