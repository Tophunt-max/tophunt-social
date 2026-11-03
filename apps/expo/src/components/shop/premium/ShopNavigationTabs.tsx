import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@/src/lib/icons';
import type { ShopTab } from '@/src/lib/shopModel';
import { TH, glowShadow, type TophuntPalette } from '@/src/theme/tophunt';

const TABS: { key: ShopTab | 'collection'; label: string; icon: string }[] = [
  { key: 'shop', label: 'Shop', icon: 'bag-handle' },
  { key: 'digital', label: 'Digital', icon: 'diamond' },
  { key: 'physical', label: 'Physical', icon: 'cube' },
  { key: 'collection', label: 'My Collection', icon: 'grid' },
];

/**
 * Segmented bar in one rounded, glowing container (reference layout). Shop |
 * Digital | Physical switch the screen; "My Collection" opens the inventory
 * route (it is its own screen, not a tab here). The active tab is a filled
 * light-purple pill. On wide screens the four segments share the width; on a
 * phone the bar scrolls if it does not fit.
 */
export function ShopNavigationTabs({
  p, tab, onTab, onCollection, pad, wide,
}: { p: TophuntPalette; tab: ShopTab; onTab: (t: ShopTab) => void; onCollection: () => void; pad: number; wide: boolean }) {
  const track = (
    <View
      style={[styles.track, { backgroundColor: p.card, borderColor: p.glowBorder }, glowShadow(p.glowShadow, p.isDark), wide && { flex: 1 }]}
      accessibilityRole="tablist"
    >
      {TABS.map((t) => {
        const on = t.key === tab;
        const content = (
          <>
            <Ionicons name={t.icon} size={15} color={on ? '#1B0B3A' : p.sub} />
            <Text style={[styles.label, { color: on ? '#1B0B3A' : p.text }]} numberOfLines={1}>{t.label}</Text>
          </>
        );
        const isLink = t.key === 'collection';
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => (isLink ? onCollection() : onTab(t.key as ShopTab))}
            activeOpacity={0.85}
            style={wide ? { flex: 1 } : undefined}
            accessibilityRole={isLink ? 'link' : 'tab'}
            accessibilityState={isLink ? undefined : { selected: on }}
            accessibilityLabel={isLink ? 'My Collection: aapke items kholo' : t.label}
          >
            {on ? (
              <LinearGradient colors={TH.gradients.tabOn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tab, glowShadow(TH.colors.neon, p.isDark, 'md')]}>
                {content}
              </LinearGradient>
            ) : (
              <View style={styles.tab}>{content}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
  if (wide) return <View style={[styles.row, { paddingHorizontal: pad }]}>{track}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { paddingHorizontal: pad, flexGrow: 1 }]}>
      {track}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 6 },
  track: { flexDirection: 'row', borderRadius: TH.radii.lg, borderWidth: 1, padding: 4, gap: 2, flexGrow: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 38, paddingHorizontal: 11, borderRadius: TH.radii.md },
  label: { fontFamily: TH.fonts.bold, fontSize: 13 },
});
