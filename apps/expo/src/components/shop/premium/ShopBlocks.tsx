/**
 * Small building blocks shared by the premium Shop screens: section headers,
 * chips, skeletons, empty and error states.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { TH, type TophuntPalette } from '@/src/theme/tophunt';

export function SectionHeader({
  p, title, sub, action, pad,
}: { p: TophuntPalette; title: string; sub?: string; action?: { label: string; onPress: () => void }; pad: number }) {
  return (
    <View style={[styles.head, { paddingHorizontal: pad }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">{title}</Text>
        {sub ? <Text style={[styles.sub, { color: p.sub }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={styles.action} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`} hitSlop={8}>
          <Text style={[styles.actionText, { color: p.isDark ? TH.colors.diamond : TH.colors.royal }]}>{action.label}</Text>
          <ArrowIcon variant="chevron" direction="right" size={11} color={p.isDark ? TH.colors.diamond : TH.colors.royal} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Selectable filter chip. */
export function Chip({ p, label, on, onPress, count, icon }: { p: TophuntPalette; label: string; on: boolean; onPress: () => void; count?: number; icon?: string }) {
  const inner = (
    <>
      {icon ? <Ionicons name={icon} size={13} color={on ? '#FFF' : p.sub} /> : null}
      <Text style={[styles.chipText, { color: on ? '#FFF' : p.text }]}>{label}</Text>
      {count !== undefined ? <Text style={[styles.chipCount, { color: on ? 'rgba(255,255,255,0.8)' : p.sub }]}>{count}</Text> : null}
    </>
  );
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${count !== undefined ? `, ${count} items` : ''}`}
    >
      {on ? (
        <LinearGradient colors={[TH.colors.royal, TH.colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chip}>{inner}</LinearGradient>
      ) : (
        <View style={[styles.chip, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>{inner}</View>
      )}
    </TouchableOpacity>
  );
}

export function CardSkeleton({ width, p }: { width: number; p: TophuntPalette }) {
  return (
    <View style={[styles.skelCard, { width, backgroundColor: p.card, borderColor: p.border }]}>
      <Skeleton width={width - 2} height={Math.round(width * 0.9)} borderRadius={TH.radii.lg} />
      <View style={{ padding: 10, gap: 6 }}>
        <Skeleton width="70%" height={13} />
        <Skeleton width="45%" height={11} />
      </View>
    </View>
  );
}

export function ShopSkeleton({ p, cellW, cols, pad }: { p: TophuntPalette; cellW: number; cols: number; pad: number }) {
  return (
    <View accessibilityLabel="Shop load ho raha hai" accessible>
      <View style={{ paddingHorizontal: pad, marginTop: 18 }}>
        <Skeleton width="100%" height={190} borderRadius={TH.radii.xxl} />
      </View>
      <View style={[styles.grid, { paddingHorizontal: pad, marginTop: 20 }]}>
        {Array.from({ length: cols * 2 }, (_, i) => <CardSkeleton key={i} width={cellW} p={p} />)}
      </View>
    </View>
  );
}

export function EmptyState({ p, icon, title, text, action }: { p: TophuntPalette; icon: string; title?: string; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={[styles.empty, { backgroundColor: p.card, borderColor: p.border }]}>
      <LinearGradient colors={TH.gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color="#FFF" />
      </LinearGradient>
      {title ? <Text style={[styles.emptyTitle, { color: p.text }]}>{title}</Text> : null}
      <Text style={[styles.emptyText, { color: p.sub }]}>{text}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={[styles.emptyBtn, { borderColor: p.border }]} accessibilityRole="button">
          <Text style={[styles.emptyBtnText, { color: p.text }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ErrorState({ p, text, onRetry }: { p: TophuntPalette; text: string; onRetry: () => void }) {
  return (
    <View style={[styles.empty, { backgroundColor: p.card, borderColor: p.border }]} accessibilityRole="alert">
      <View style={[styles.emptyIcon, { backgroundColor: `${TH.colors.danger}22` }]}>
        <Ionicons name="cloud-offline-outline" size={24} color={TH.colors.danger} />
      </View>
      <Text style={[styles.emptyText, { color: p.sub }]}>{text}</Text>
      <TouchableOpacity onPress={onRetry} accessibilityRole="button" accessibilityLabel="Dobara try karo">
        <LinearGradient colors={[TH.colors.royal, TH.colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.retry}>
          <Ionicons name="refresh" size={14} color="#FFF" />
          <Text style={styles.retryText}>Dobara try karo</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 26, marginBottom: 12, gap: 10 },
  title: { fontFamily: TH.fonts.bold, fontSize: 20, letterSpacing: 0.1 },
  sub: { fontFamily: TH.fonts.medium, fontSize: 12, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: 2 },
  actionText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: TH.radii.pill },
  chipText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  chipCount: { fontFamily: TH.fonts.semibold, fontSize: 11 },
  skelCard: { borderRadius: TH.radii.xl, borderWidth: 1, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  empty: { marginTop: 24, borderRadius: TH.radii.xl, borderWidth: 1, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: TH.fonts.bold, fontSize: 16, textAlign: 'center' },
  emptyText: { fontFamily: TH.fonts.semibold, fontSize: 14, textAlign: 'center' },
  emptyBtn: { borderWidth: 1, borderRadius: TH.radii.pill, paddingHorizontal: 16, height: 38, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: TH.radii.pill, paddingHorizontal: 16, height: 38 },
  retryText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 13 },
});
