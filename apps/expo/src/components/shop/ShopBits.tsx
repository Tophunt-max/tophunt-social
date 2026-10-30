/**
 * Shared pieces for the physical-product flow (product, cart, orders, order),
 * in the same DP battle look as the Shop screen: gradient VS-orb colours for
 * CTAs, LIVE-style pills, a battle-meter for coin progress and order tracking.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { BRAND, BRAND_GRAD, GOLD, type ExplorePalette } from '@/src/components/explore/theme';
import { VOTE_GRAD } from './DigitalItemCard';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/src/services/shop';

export const DANGER = '#F0413E';
export const SUCCESS = '#22A559';

/** Screen header: back, small brand kicker over a bold italic title. */
export function ShopHeader({ p, kicker, title, right }: { p: ExplorePalette; kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <BackButton size={24} color={p.text} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.kicker, { color: BRAND }]}>{kicker}</Text>
        <Text style={[styles.title, { color: p.text }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Primary CTA in the vote-button gradient, optionally with a coin amount. */
export function GradientButton({
  label, icon = 'flash', coins, onPress, disabled, busy, lockedLabel, p, style,
}: {
  label: string;
  icon?: string;
  coins?: number;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** When set, the button renders as a locked chip with this text. */
  lockedLabel?: string | null;
  p: ExplorePalette;
  style?: StyleProp<ViewStyle>;
}) {
  if (lockedLabel) {
    return (
      <View style={[styles.btn, { backgroundColor: p.chip }, style]} accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={lockedLabel}>
        <Ionicons name="lock-closed" size={14} color={p.sub} />
        <Text style={[styles.btnText, { color: p.sub }]} numberOfLines={1}>{lockedLabel}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      style={[{ opacity: disabled ? 0.5 : busy ? 0.7 : 1 }, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      accessibilityLabel={coins !== undefined ? `${label}, ${coins} DP coin` : label}
    >
      <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.btn, styles.btnGlow]}>
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name={icon} size={15} color="#FFF" />
            <Text style={[styles.btnText, { color: '#FFF' }]} numberOfLines={1}>{label}</Text>
            {coins !== undefined ? (
              <>
                <View style={styles.btnSep} />
                <CoinIcon size={14} />
                <Text style={[styles.btnText, { color: '#FFF' }]}>{coins.toLocaleString()}</Text>
              </>
            ) : null}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** Secondary outline CTA. */
export function GhostButton({ label, icon, onPress, disabled, color = BRAND, p, style }: { label: string; icon?: string; onPress: () => void; disabled?: boolean; color?: string; p: ExplorePalette; style?: StyleProp<ViewStyle> }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.btn, styles.ghost, { borderColor: disabled ? p.border : color, opacity: disabled ? 0.5 : 1 }, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      {icon ? <Ionicons name={icon} size={15} color={disabled ? p.sub : color} /> : null}
      <Text style={[styles.btnText, { color: disabled ? p.sub : color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** − qty + stepper that follows the light/dark palette. */
export function Stepper({ p, value, onMinus, onPlus, minusDisabled, plusDisabled, label = 'Quantity' }: {
  p: ExplorePalette; value: number; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean; label?: string;
}) {
  return (
    <View style={[styles.stepper, { backgroundColor: p.chip, borderColor: p.border }]}>
      <TouchableOpacity onPress={onMinus} disabled={minusDisabled} style={[styles.stepBtn, { opacity: minusDisabled ? 0.35 : 1 }]} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} hitSlop={6}>
        <Text style={[styles.stepText, { color: p.text }]}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.stepValue, { color: p.text }]} accessibilityLabel={`${label} ${value}`}>{value}</Text>
      <TouchableOpacity onPress={onPlus} disabled={plusDisabled} style={{ opacity: plusDisabled ? 0.35 : 1 }} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} hitSlop={6}>
        <LinearGradient colors={VOTE_GRAD} style={styles.stepBtn}>
          <Text style={[styles.stepText, { color: '#FFF' }]}>+</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Battle-meter style bar: how much of `need` the viewer already has.
 * Renders nothing while the balance is unknown.
 */
export function CoinMeter({ p, have, need, live }: { p: ExplorePalette; have: number; need: number; live: boolean }) {
  if (!live || need <= 0) return null;
  const pct = Math.min(1, have / need);
  const short = Math.max(0, need - have);
  return (
    <View
      style={[styles.meterBox, { backgroundColor: p.card, borderColor: short ? `${DANGER}55` : `${SUCCESS}55` }]}
      accessible
      accessibilityLabel={short ? `${short} DP coin short. You have ${have} of ${need}.` : `You have enough DP coin: ${have} of ${need}.`}
    >
      <View style={styles.meterRow}>
        <CoinIcon size={14} />
        <Text style={[styles.meterText, { color: p.text }]}>
          {have.toLocaleString()} <Text style={{ color: p.sub }}>/ {need.toLocaleString()} DP coin</Text>
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.meterTag, { color: short ? DANGER : SUCCESS }]}>{short ? `${short.toLocaleString()} KAM` : 'READY'}</Text>
      </View>
      <View style={[styles.meterTrack, { backgroundColor: p.chip }]}>
        <LinearGradient
          colors={short ? VOTE_GRAD : [SUCCESS, '#4ADE80']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: `${Math.max(4, pct * 100)}%`, height: '100%', borderRadius: 5 }}
        />
      </View>
    </View>
  );
}

/** Product photo, or a brand-gradient gift tile when there is none. */
export function ProductThumb({ uri, size, radius = 14, displayWidth }: { uri: string | null | undefined; size: number; radius?: number; displayWidth?: number }) {
  return uri ? (
    <AppImage source={{ uri }} displayWidth={displayWidth ?? size} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" />
  ) : (
    <LinearGradient colors={BRAND_GRAD} style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="gift" size={Math.round(size * 0.38)} color="rgba(255,255,255,0.9)" />
    </LinearGradient>
  );
}

/** Gold coin price pill (as on the shop cards). */
export function PricePill({ coins, size = 'md', dark = false }: { coins: number; size?: 'sm' | 'md' | 'lg'; dark?: boolean }) {
  const fs = size === 'lg' ? 20 : size === 'sm' ? 12 : 14;
  return (
    <View style={[styles.pricePill, dark && { backgroundColor: 'rgba(0,0,0,0.6)' }, size === 'lg' && { paddingHorizontal: 12, paddingVertical: 5 }]}>
      <CoinIcon size={fs} color={GOLD} />
      <Text style={[styles.pricePillText, { fontSize: fs }]}>{coins.toLocaleString()}</Text>
    </View>
  );
}

const STATUS_STYLE: Record<OrderStatus, { color: string; icon: string }> = {
  placed: { color: '#8B5CF6', icon: 'receipt-outline' },
  packed: { color: '#F59E0B', icon: 'cube' },
  shipped: { color: '#3B82F6', icon: 'car' },
  delivered: { color: SUCCESS, icon: 'checkmark-circle' },
  cancelled: { color: '#7A7A80', icon: 'ban-outline' },
  return_requested: { color: '#F59E0B', icon: 'refresh' },
  returned: { color: '#7A7A80', icon: 'refresh' },
  return_rejected: { color: DANGER, icon: 'alert-circle' },
};

export const statusColor = (s: OrderStatus) => STATUS_STYLE[s]?.color ?? BRAND;

/** Coloured status pill for an order. */
export function StatusPill({ status, big = false }: { status: OrderStatus; big?: boolean }) {
  const st = STATUS_STYLE[status] ?? { color: BRAND, icon: 'receipt-outline' };
  return (
    <View style={[styles.statusPill, { backgroundColor: `${st.color}1F`, borderColor: `${st.color}55` }, big && { paddingHorizontal: 10, paddingVertical: 5 }]}>
      <Ionicons name={st.icon} size={big ? 13 : 11} color={st.color} />
      <Text style={[styles.statusText, { color: st.color, fontSize: big ? 12 : 10.5 }]} numberOfLines={1}>
        {(ORDER_STATUS_LABEL[status] ?? status).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Numbered progress track: done steps and the current one are filled with the
 * brand gradient, the line between them fills like the battle meter.
 */
export function StepTrack({ p, steps, index }: { p: ExplorePalette; steps: { key: string; label: string; icon?: string }[]; index: number }) {
  return (
    <View style={styles.track} accessible accessibilityLabel={`Step ${index + 1} of ${steps.length}: ${steps[index]?.label ?? ''}`}>
      {steps.map((s, i) => {
        const done = i <= index;
        return (
          <React.Fragment key={s.key}>
            {i > 0 ? (
              <View style={[styles.trackLine, { backgroundColor: p.chip }]}>
                {i <= index ? <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /> : null}
              </View>
            ) : null}
            <View style={styles.trackStep}>
              {done ? (
                <LinearGradient colors={VOTE_GRAD} style={[styles.trackDot, i === index && styles.trackDotNow]}>
                  {s.icon ? <Ionicons name={s.icon} size={13} color="#FFF" /> : <Text style={styles.trackNum}>{i + 1}</Text>}
                </LinearGradient>
              ) : (
                <View style={[styles.trackDot, { backgroundColor: p.chip, borderWidth: 1, borderColor: p.border }]}>
                  {s.icon ? <Ionicons name={s.icon} size={13} color={p.sub} /> : <Text style={[styles.trackNum, { color: p.sub }]}>{i + 1}</Text>}
                </View>
              )}
              <Text style={[styles.trackLabel, { color: done ? p.text : p.sub }]} numberOfLines={1}>{s.label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Card with an optional small uppercase kicker heading. */
export function ShopCard({ p, kicker, children, style }: { p: ExplorePalette; kicker?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, style]}>
      {kicker ? <Text style={[styles.cardKicker, { color: p.sub }]}>{kicker}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 16, gap: 8 },
  kicker: { fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 1.6 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Black', fontStyle: 'italic', marginTop: -2 },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 50, borderRadius: 16, paddingHorizontal: 14 },
  btnGlow: { shadowColor: '#FF4D67', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  btnSep: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.45)', marginHorizontal: 3 },
  btnText: { fontFamily: 'Urbanist-Bold', fontSize: 14.5, flexShrink: 1 },
  ghost: { borderWidth: 1.5 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 100, borderWidth: 1, padding: 3, alignSelf: 'flex-start' },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 17, fontFamily: 'Urbanist-Bold', lineHeight: 20 },
  stepValue: { minWidth: 26, textAlign: 'center', fontFamily: 'Urbanist-Black', fontSize: 15 },

  meterBox: { borderRadius: 16, borderWidth: 1, padding: 12, gap: 8 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meterText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  meterTag: { fontFamily: 'Urbanist-Black', fontSize: 11, letterSpacing: 0.6 },
  meterTrack: { height: 9, borderRadius: 5, overflow: 'hidden' },

  pricePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.55)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, alignSelf: 'flex-start' },
  pricePillText: { color: GOLD, fontFamily: 'Urbanist-Black' },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', maxWidth: '100%' },
  statusText: { fontFamily: 'Urbanist-Black', letterSpacing: 0.5, flexShrink: 1 },

  track: { flexDirection: 'row', alignItems: 'flex-start' },
  trackStep: { alignItems: 'center', gap: 5, width: 62 },
  trackLine: { flex: 1, height: 4, borderRadius: 2, marginTop: 13, marginHorizontal: -16, overflow: 'hidden' },
  trackDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  trackDotNow: { borderWidth: 2, borderColor: '#FFF', shadowColor: '#FF4D67', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  trackNum: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 12 },
  trackLabel: { fontFamily: 'Urbanist-Bold', fontSize: 10.5, textAlign: 'center' },

  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
  cardKicker: { fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 1.4 },
});
