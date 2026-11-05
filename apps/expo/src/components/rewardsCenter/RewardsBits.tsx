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
import { BRAND, BRAND_BUTTON, BRAND_GRAD } from '@/src/theme/tophuntTokens';
import { currencyIconSize } from '@/src/components/ui/CurrencyImage';

export interface RewardsPalette {
  isDark: boolean;
  bg: string;
  bg2: string;
  card: string;
  cardHi: string;
  /** Brand pink (kept as `border` for older callers: glow colour of a card). */
  border: string;
  /** Card / tile border. */
  borderSoft: string;
  /** Highlighted card border (a reward is ready): brand pink. */
  magenta: string;
  text: string;
  sub: string;
  muted: string;
  /** DP coin gold. Currency only, never a button. */
  gold: string;
  goldDeep: string;
  /** Diamond cyan. Currency only, never a button. */
  cyan: string;
  green: string;
  red: string;
  track: string;
  /** Neutral chip fill for tiles, day cells and secondary buttons. */
  tint: string;
  /** Recessed fill for inputs (code box, XP stepper). */
  inset: string;
  /** XP accent. */
  xp: string;
  /** Card shadow opacity (light mode only; dark cards are flat). */
  glow: number;
  /** The app brand pink: buttons, links, active and selected states. */
  brand: string;
  /** Translucent brand fill behind brand text (pills, today's cell). */
  brandSoft: string;
}

/**
 * Dark palette on the app's dark surfaces (constants/theme.ts, Explore):
 * neutral cards, brand pink for every action.
 */
export const RC_DARK: RewardsPalette = {
  isDark: true,
  bg: '#0F0F13',
  bg2: '#0F0F13',
  card: '#16171E',
  cardHi: '#16171E',
  border: BRAND,
  borderSoft: '#23262F',
  magenta: BRAND,
  text: '#FFFFFF',
  sub: '#8B8F9A',
  muted: '#6E727D',
  gold: '#FFC857',
  goldDeep: '#F59E0B',
  cyan: '#22D3EE',
  green: '#22C55E',
  red: '#F43F5E',
  track: 'rgba(255,255,255,0.08)',
  tint: '#1B1D26',
  inset: '#1B1D26',
  xp: '#A78BFA',
  glow: 0,
  brand: BRAND,
  brandSoft: 'rgba(255,77,103,0.14)',
};

/** Light palette on the app's light surfaces. */
export const RC_LIGHT: RewardsPalette = {
  isDark: false,
  bg: '#F9F9FB',
  bg2: '#F9F9FB',
  card: '#FFFFFF',
  cardHi: '#FFFFFF',
  border: BRAND,
  borderSoft: '#EEEEF2',
  magenta: BRAND,
  text: '#121212',
  sub: '#7A7A80',
  muted: '#9A9AA0',
  gold: '#B45309',
  goldDeep: '#F59E0B',
  cyan: '#0E7490',
  green: '#16A34A',
  red: '#E11D48',
  track: '#ECEDF1',
  tint: '#F1F2F6',
  inset: '#F1F2F6',
  xp: '#7C3AED',
  glow: 0.05,
  brand: BRAND,
  brandSoft: 'rgba(255,77,103,0.10)',
};

export const rewardsPalette = (isDark: boolean): RewardsPalette => (isDark ? RC_DARK : RC_LIGHT);

/** Dark palette, for screens that style themselves statically (history, events). */
export const RC = RC_DARK;

export const RewardsThemeContext = createContext<RewardsPalette>(RC_DARK);
export const useRC = () => useContext(RewardsThemeContext);

/** Primary button: the app brand pink (same as the Shop and Explore). */
export const GOLD_GRAD: [string, string] = BRAND_BUTTON;
export const PURPLE_GRAD: [string, string] = BRAND_GRAD;

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

/** `glow` is accepted for older callers and ignored (cards are flat now). */
export function NeonCard({ children, style, highlight }: { children: ReactNode; style?: StyleProp<ViewStyle>; glow?: string; highlight?: boolean }) {
  const RC = useRC();
  return (
    // Flat card like the rest of the app: 1 px border (brand pink when highlighted), soft shadow in light mode only.
    <View style={[styles.neonOuter, { backgroundColor: RC.card, shadowColor: '#000', shadowOpacity: RC.glow, borderColor: highlight ? RC.brand : RC.borderSoft, elevation: RC.isDark ? 0 : 1 }, style]}>
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
          <Text style={[styles.viewAllText, { color: RC.brand }]}>{action}</Text>
          <ArrowIcon direction="right" size={13} color={RC.brand} />
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

/**
 * The Rewards Center button, in the app's brand pink.
 * - primary (default): pink gradient, white text.
 * - secondary: neutral chip with pink text and border ("Go", "Open").
 * - onBrand: white pill with pink text, for a button sitting on a pink banner.
 * `grad` / `textColor` still override the primary look for older callers.
 */
export function GoldButton({ label, onPress, busy, disabled, icon, small, grad, textColor, variant = 'primary' }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: EarningArtKey; small?: boolean; grad?: [string, string]; textColor?: string; variant?: 'primary' | 'secondary' | 'onBrand';
}) {
  const RC = useRC();
  const flat = variant !== 'primary';
  const fill: [string, string] = variant === 'secondary' ? [RC.brandSoft, RC.brandSoft] : variant === 'onBrand' ? ['#FFFFFF', '#FFFFFF'] : grad ?? GOLD_GRAD;
  const ink = textColor ?? (flat ? RC.brand : '#FFFFFF');
  return (
    <PressScale onPress={onPress} disabled={disabled || busy} label={label}>
      <LinearGradient
        colors={fill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.gold, small && styles.goldSmall, variant === 'secondary' && { borderWidth: 1, borderColor: RC.brand }]}
      >
        {busy ? <ActivityIndicator color={ink} size="small" /> : (
          <>
            {icon ? <Art name={icon} size={small ? 16 : 22} /> : null}
            <Text style={[styles.goldText, small && styles.goldTextSmall, { color: ink }]} numberOfLines={1}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </PressScale>
  );
}

/** Progress bar. The fill eases to its value (instant under reduced motion). */
/** Progress bar: brand pink by default, `grad` for a two-colour fill, `color` for a solid one. */
export function NeonBar({ value, color, grad, height = 7 }: { value: number; color?: string; grad?: [string, string]; height?: number }) {
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
        <LinearGradient colors={grad ?? (color ? [color, color] : BRAND_BUTTON)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

export function DiamondAmount({ amount, size = 14, color, prefix = '+' }: { amount: number; size?: number; color?: string; prefix?: string }) {
  const RC = useRC();
  return (
    <View style={styles.amt} accessible accessibilityLabel={`${prefix}${amount} Diamonds`}>
      <Art name="diamond" size={currencyIconSize(size)} />
      <Text style={[styles.amtText, { fontSize: size, color: color ?? RC.text }]}>{prefix}{amount.toLocaleString()}</Text>
    </View>
  );
}

/** 🪙 DP coin amount with the app-wide coin icon (Shop currency, won in contests). */
export function CoinAmount({ amount, size = 14, color, prefix = '+', label }: { amount?: number; size?: number; color?: string; prefix?: string; label?: string }) {
  const RC = useRC();
  const text = label ?? `${prefix}${(amount ?? 0).toLocaleString()}`;
  return (
    <View style={styles.amt} accessible accessibilityLabel={label ?? `${text} DP coin`}>
      <Art name="dpCoin" size={currencyIconSize(size)} />
      <Text style={[styles.amtText, { fontSize: size, color: color ?? RC.text }]}>{text}</Text>
    </View>
  );
}

export function XpAmount({ amount, size = 13, label }: { amount?: number; size?: number; label?: string }) {
  const RC = useRC();
  const text = label ?? `+${(amount ?? 0).toLocaleString()} XP`;
  return (
    <View style={styles.amt} accessible accessibilityLabel={text}>
      <Art name="xp" size={currencyIconSize(size)} />
      <Text style={[styles.amtText, { fontSize: size, color: RC.text }]}>{text}</Text>
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
          <Text style={[styles.noteAction, { color: RC.brand }]}>{action}</Text>
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
    borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 14,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontFamily: 'Urbanist-Bold', fontSize: 18 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 1 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32 },
  viewAllText: { fontFamily: 'Urbanist-Bold', fontSize: 12.5 },
  gold: { minHeight: 46, borderRadius: 23, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
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
