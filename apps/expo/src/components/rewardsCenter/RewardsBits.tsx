/**
 * Building blocks of the Rewards Center (app/earn/index.tsx): the dark neon
 * palette, glowing cards, section headers, gold buttons, progress bars and
 * the claim burst. Presentational only: no data fetching here.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import { EARNING_ANIMATIONS, EARNING_ART, type EarningArtKey } from '@/assets/earning';
import { SparkleBurst } from '@/src/components/gamification/SparkleBurst';
import { Image } from 'expo-image';
import { AppImage } from '@/src/components/ui/AppImage';
import { useEarningAssets } from '@/src/services/appSettings';
import { safeArtUrl } from '@/src/lib/rewardsCenter';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';

export const RC = {
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
} as const;

export const GOLD_GRAD: [string, string] = ['#FFE680', '#F5B300'];
export const PURPLE_GRAD: [string, string] = ['#A855F7', '#6D28D9'];

/**
 * One Rewards Center artwork slot. Draws the admin's uploaded WebP / PNG for
 * this key when there is one (appConfig.earningAssets), else the bundled
 * WebP. While an upload loads, the bundled art is the placeholder, and if it
 * fails to load the slot stays on the bundled art. Uploads are fetched as a
 * resized variant for the slot (AppImage `displayWidth`), never full size.
 */
export function Art({ name, size, style }: { name: EarningArtKey; size: number; style?: StyleProp<ViewStyle> }) {
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

export function NeonCard({ children, style, glow = RC.border, highlight }: { children: ReactNode; style?: StyleProp<ViewStyle>; glow?: string; highlight?: boolean }) {
  return (
    <View style={[styles.neonOuter, { shadowColor: glow, borderColor: highlight ? RC.magenta : RC.borderSoft }, style]}>
      <LinearGradient colors={[RC.cardHi, RC.card]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function SectionTitle({ art, title, sub, action, onAction }: { art: EarningArtKey; title: string; sub?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.titleRow}>
      <Art name={art} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} style={styles.viewAll}>
          <Text style={styles.viewAllText}>{action}</Text>
          <ArrowIcon direction="right" size={13} color={RC.cyan} />
        </Pressable>
      ) : null}
    </View>
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

export function NeonBar({ value, color = RC.green, height = 7 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <LinearGradient colors={[color, '#A3E635']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct * 100)}%`, height, borderRadius: height / 2 }} />
    </View>
  );
}

export function DiamondAmount({ amount, size = 14, color = RC.cyan, prefix = '+' }: { amount: number; size?: number; color?: string; prefix?: string }) {
  return (
    <View style={styles.amt}>
      <Art name="diamond" size={size + 4} />
      <Text style={[styles.amtText, { fontSize: size, color }]}>{prefix}{amount.toLocaleString()}</Text>
    </View>
  );
}

export function XpAmount({ amount, size = 13 }: { amount: number; size?: number }) {
  return (
    <View style={styles.amt}>
      <Art name="xp" size={size + 4} />
      <Text style={[styles.amtText, { fontSize: size, color: '#D8B4FE' }]}>+{amount.toLocaleString()} XP</Text>
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
  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>{text}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={styles.noteAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  neonOuter: {
    borderRadius: 20, borderWidth: 1.5, overflow: 'hidden', padding: 14,
    shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 18 },
  sub: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 1 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewAllText: { color: RC.cyan, fontFamily: 'Urbanist-Bold', fontSize: 12.5 },
  gold: { minHeight: 46, borderRadius: 23, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#FFF2B3' },
  goldSmall: { minHeight: 32, borderRadius: 16, paddingHorizontal: 14 },
  goldText: { fontFamily: 'Urbanist-Black', fontSize: 16 },
  goldTextSmall: { fontSize: 13 },
  track: { backgroundColor: RC.track, overflow: 'hidden', width: '100%' },
  amt: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  amtText: { fontFamily: 'Urbanist-Black' },
  burst: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  note: { borderRadius: 14, borderWidth: 1, borderColor: RC.borderSoft, borderStyle: 'dashed', padding: 14, alignItems: 'center', gap: 6 },
  noteText: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 13, textAlign: 'center' },
  noteAction: { color: RC.gold, fontFamily: 'Urbanist-Bold', fontSize: 13 },
});
