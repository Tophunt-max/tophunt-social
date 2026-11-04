/**
 * Building blocks of the Rewards Center (app/earn/index.tsx): the neon
 * palette (dark and light), glowing cards, section headers, gold buttons,
 * progress bars and the claim burst. Presentational only: no data fetching here.
 *
 * Theme: every piece reads its colours from `useRC()`. The Rewards Center
 * wraps itself in `<RewardsThemeContext.Provider value={rewardsPalette(isDark)}>`;
 * screens that do not (Reward History, Events) get the dark palette, as before.
 */
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import { CURRENCY_ART, EARNING_ANIMATIONS, EARNING_ART, type CurrencyArtKey, type EarningArtKey } from '@/assets/earning';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { GamificationIcon } from '@/src/components/gamification/GamificationIcon';
import { SparkleBurst } from '@/src/components/gamification/SparkleBurst';
import { Image } from 'expo-image';
import { AppImage } from '@/src/components/ui/AppImage';
import { useEarningAssets } from '@/src/services/appSettings';
import { safeArtUrl } from '@/src/lib/rewardsCenter';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';

export interface RewardsPalette {
  isDark: boolean;
  bg: string;
  bg2: string;
  card: string;
  cardHi: string;
  border: string;
  borderSoft: string;
  magenta: string;
  text: string;
  sub: string;
  muted: string;
  /** Gold accent text (amber on light so it reads on white). */
  gold: string;
  goldDeep: string;
  cyan: string;
  green: string;
  red: string;
  track: string;
  /** Translucent purple fill for tiles, day cells and chips on a card. */
  tint: string;
  /** Recessed fill for inputs (code box, XP stepper). */
  inset: string;
  /** XP accent (bars, amounts). */
  xp: string;
  /** Strength of the coloured card glow (iOS / web shadow opacity). */
  glow: number;
}

/** Dark neon palette of the design reference (unchanged values). */
export const RC_DARK: RewardsPalette = {
  isDark: true,
  bg: '#0E0420',
  bg2: '#1A0838',
  card: '#1C0B3A',
  cardHi: '#2A1056',
  border: '#7C3AED',
  borderSoft: 'rgba(168,85,247,0.45)',
  magenta: '#E040FB',
  text: '#FFFFFF',
  sub: '#C4B5FD',
  muted: '#9A8CC2',
  gold: '#FFD54A',
  goldDeep: '#F59E0B',
  cyan: '#38E1FF',
  green: '#34D399',
  red: '#FF5C7A',
  track: 'rgba(255,255,255,0.12)',
  tint: 'rgba(124,58,237,0.18)',
  inset: 'rgba(0,0,0,0.25)',
  xp: '#D8B4FE',
  glow: 0.55,
};

/** Light palette on the TopHunt light surfaces (src/theme/tophuntTokens.ts TH_LIGHT). */
export const RC_LIGHT: RewardsPalette = {
  isDark: false,
  bg: '#F6F5FF',
  bg2: '#EEE8FF',
  card: '#FFFFFF',
  cardHi: '#FBF9FF',
  border: '#8B5CF6',
  borderSoft: 'rgba(139,92,246,0.28)',
  magenta: '#C026D3',
  text: '#1B1530',
  sub: '#6B6890',
  muted: '#8A86A8',
  gold: '#B45309',
  goldDeep: '#F59E0B',
  cyan: '#0E7490',
  green: '#059669',
  red: '#E11D48',
  track: 'rgba(109,40,217,0.12)',
  tint: 'rgba(139,92,246,0.08)',
  inset: 'rgba(109,40,217,0.06)',
  xp: '#7C3AED',
  glow: 0.16,
};

export const rewardsPalette = (isDark: boolean): RewardsPalette => (isDark ? RC_DARK : RC_LIGHT);

/** Dark palette, for screens that style themselves statically (history, events). */
export const RC = RC_DARK;

export const RewardsThemeContext = createContext<RewardsPalette>(RC_DARK);
export const useRC = () => useContext(RewardsThemeContext);

export const GOLD_GRAD: [string, string] = ['#FFE680', '#F5B300'];
export const PURPLE_GRAD: [string, string] = ['#A855F7', '#6D28D9'];

/**
 * One Rewards Center artwork slot. Draws the admin's uploaded WebP / PNG for
 * this key when there is one (appConfig.earningAssets), else the bundled
 * WebP. While an upload loads, the bundled art is the placeholder, and if it
 * fails to load the slot stays on the bundled art. Uploads are fetched as a
 * resized variant for the slot (AppImage `displayWidth`), never full size.
 */
const isCurrency = (k: EarningArtKey): k is CurrencyArtKey => (CURRENCY_ART as readonly string[]).includes(k);

/** The app-wide currency icons, so 💎 / XP / 🪙 look the same here as in the wallet, contests and shop. */
function CurrencyArt({ name, size }: { name: CurrencyArtKey; size: number }) {
  if (name === 'dpCoin') return <CoinIcon size={size} />;
  if (name === 'xp') return <GamificationIcon assetKey="xp.star" size={size} />;
  const icon = <DiamondIcon size={name === 'diamondGlow' ? size * 0.86 : size} />;
  return name === 'diamondGlow' ? <View style={styles.diamondGlow}>{icon}</View> : icon;
}

export function Art({ name, size, style }: { name: EarningArtKey; size: number; style?: StyleProp<ViewStyle> }) {
  if (isCurrency(name)) {
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="none">
        <CurrencyArt name={name} size={size} />
      </View>
    );
  }
  return <BundledArt name={name} size={size} style={style} />;
}

function BundledArt({ name, size, style }: { name: Exclude<EarningArtKey, CurrencyArtKey>; size: number; style?: StyleProp<ViewStyle> }) {
  const url = safeArtUrl(useEarningAssets()?.[name]);
  const [failed, setFailed] = useState<string | null>(null);
  const bundled = EARNING_ART[name];
  const box = { width: size, height: size };
  return (
    <View style={[box, style]} pointerEvents="none">
      {url && failed !== url ? (
        <AppImage
          source={{ uri: url }}
          displayWidth={size}
          placeholder={bundled}
          placeholderContentFit="contain"
          style={box}
          contentFit="contain"
          transition={120}
          onError={() => setFailed(url)}
          accessible={false}
        />
      ) : (
        <Image source={bundled} style={box} contentFit="contain" transition={0} cachePolicy="memory" accessible={false} />
      )}
    </View>
  );
}

export function NeonCard({ children, style, glow, highlight }: { children: ReactNode; style?: StyleProp<ViewStyle>; glow?: string; highlight?: boolean }) {
  const RC = useRC();
  return (
    <View style={[styles.neonOuter, { shadowColor: glow ?? RC.border, shadowOpacity: RC.glow, borderColor: highlight ? RC.magenta : RC.borderSoft, elevation: RC.isDark ? 6 : 2 }, style]}>
      <LinearGradient colors={[RC.cardHi, RC.card]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function SectionTitle({ art, title, sub, action, onAction }: { art: EarningArtKey; title: string; sub?: string; action?: string; onAction?: () => void }) {
  const RC = useRC();
  return (
    <View style={styles.titleRow}>
      <Art name={art} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: RC.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.sub, { color: RC.sub }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} style={styles.viewAll}>
          <Text style={[styles.viewAllText, { color: RC.cyan }]}>{action}</Text>
          <ArrowIcon direction="right" size={13} color={RC.cyan} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A section that fades and rises in once when the screen mounts (staggered by
 * `index`). Static under reduced motion. Also forwards `onLayout`, so the
 * shortcut row can still scroll to the section.
 */
export function Reveal({ index = 0, children, style, onLayout }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      entering={reduce ? undefined : FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}
      style={style}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}

/** Scales down on press; never animates under reduced motion. */
export function PressScale({ children, onPress, disabled, style, label }: { children: ReactNode; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; label?: string }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => { if (!reduce) s.value = withTiming(0.95, { duration: 90 }); }}
      onPressOut={() => { if (!reduce) s.value = withSpring(1, { damping: 14 }); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Animated.View style={[style, anim, disabled && { opacity: 0.55 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function GoldButton({ label, onPress, busy, disabled, icon, small, grad = GOLD_GRAD, textColor = '#3B1A00' }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: EarningArtKey; small?: boolean; grad?: [string, string]; textColor?: string;
}) {
  return (
    <PressScale onPress={onPress} disabled={disabled || busy} label={label}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.gold, small && styles.goldSmall]}>
        {busy ? <ActivityIndicator color={textColor} size="small" /> : (
          <>
            {icon ? <Art name={icon} size={small ? 16 : 22} /> : null}
            <Text style={[styles.goldText, small && styles.goldTextSmall, { color: textColor }]} numberOfLines={1}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </PressScale>
  );
}

/** Progress bar. The fill eases to its value (instant under reduced motion). */
export function NeonBar({ value, color, height = 7 }: { value: number; color?: string; height?: number }) {
  const RC = useRC();
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const target = Math.max(pct > 0 ? 4 : 0, pct * 100);
  const w = useSharedValue(reduce ? target : 0);
  useEffect(() => {
    w.value = reduce ? target : withTiming(target, { duration: 600 });
  }, [target, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={[styles.track, { backgroundColor: RC.track, height, borderRadius: height / 2 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <Animated.View style={[{ height, borderRadius: height / 2, overflow: 'hidden' }, fill]}>
        <LinearGradient colors={[color ?? RC.green, '#A3E635']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

export function DiamondAmount({ amount, size = 14, color, prefix = '+' }: { amount: number; size?: number; color?: string; prefix?: string }) {
  const RC = useRC();
  return (
    <View style={styles.amt} accessible accessibilityLabel={`${prefix}${amount} Diamonds`}>
      <Art name="diamond" size={size + 4} />
      <Text style={[styles.amtText, { fontSize: size, color: color ?? RC.cyan }]}>{prefix}{amount.toLocaleString()}</Text>
    </View>
  );
}

/** 🪙 DP coin amount with the app-wide coin icon (Shop currency, won in contests). */
export function CoinAmount({ amount, size = 14, color, prefix = '+', label }: { amount?: number; size?: number; color?: string; prefix?: string; label?: string }) {
  const RC = useRC();
  const text = label ?? `${prefix}${(amount ?? 0).toLocaleString()}`;
  return (
    <View style={styles.amt} accessible accessibilityLabel={label ?? `${text} DP coin`}>
      <Art name="dpCoin" size={size + 4} />
      <Text style={[styles.amtText, { fontSize: size, color: color ?? RC.gold }]}>{text}</Text>
    </View>
  );
}

export function XpAmount({ amount, size = 13, label }: { amount?: number; size?: number; label?: string }) {
  const RC = useRC();
  const text = label ?? `+${(amount ?? 0).toLocaleString()} XP`;
  return (
    <View style={styles.amt} accessible accessibilityLabel={text}>
      <Art name="xp" size={size + 4} />
      <Text style={[styles.amtText, { fontSize: size, color: RC.xp }]}>{text}</Text>
    </View>
  );
}

/**
 * The reward burst shown after a successful claim. Lottie on native, the
 * local sparkle burst on web. Nothing under reduced motion.
 */
export function ClaimBurst({ playKey }: { playKey: number }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!playKey || reduce) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, [playKey, reduce]);
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.burst}>
      {Platform.OS === 'web' ? (
        <SparkleBurst playKey={playKey} size={220} />
      ) : (
        <LottieView source={EARNING_ANIMATIONS.diamondClaim} autoPlay loop={false} style={{ width: 260, height: 260 }} />
      )}
    </View>
  );
}

export function StateNote({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const RC = useRC();
  return (
    <View style={[styles.note, { borderColor: RC.borderSoft }]}>
      <Text style={[styles.noteText, { color: RC.sub }]}>{text}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.noteAction, { color: RC.gold }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Placeholder rows while a section loads (no spinner jump, same height as the content). */
export function SkeletonRows({ rows = 3, height = 44 }: { rows?: number; height?: number }) {
  const RC = useRC();
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel="Load ho raha hai">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: RC.tint }} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: '62%', height: 11, borderRadius: 6, backgroundColor: RC.tint }} />
            <View style={{ width: '100%', height: Math.max(6, height - 38), borderRadius: 4, backgroundColor: RC.track }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  diamondGlow: { shadowColor: '#22D3EE', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  neonOuter: {
    borderRadius: 20, borderWidth: 1.5, overflow: 'hidden', padding: 14,
    shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontFamily: 'Urbanist-Bold', fontSize: 18 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 1 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32 },
  viewAllText: { fontFamily: 'Urbanist-Bold', fontSize: 12.5 },
  gold: { minHeight: 46, borderRadius: 23, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#FFF2B3' },
  goldSmall: { minHeight: 34, borderRadius: 17, paddingHorizontal: 14 },
  goldText: { fontFamily: 'Urbanist-Bold', fontSize: 16 },
  goldTextSmall: { fontSize: 13 },
  track: { overflow: 'hidden', width: '100%' },
  amt: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  amtText: { fontFamily: 'Urbanist-Bold' },
  burst: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  note: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 14, alignItems: 'center', gap: 6 },
  noteText: { fontFamily: 'Urbanist-Medium', fontSize: 13, textAlign: 'center' },
  noteAction: { fontFamily: 'Urbanist-Bold', fontSize: 13, paddingVertical: 6 },
});
