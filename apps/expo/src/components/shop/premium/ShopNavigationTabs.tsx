import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@/src/lib/icons';
import type { ShopTab } from '@/src/lib/shopModel';
import { TH, type TophuntPalette } from '@/src/theme/tophunt';

const TABS: { key: ShopTab; label: string; icon: string }[] = [
  { key: 'shop', label: 'Shop', icon: 'home' },
  { key: 'digital', label: 'Digital', icon: 'diamond' },
  { key: 'physical', label: 'Physical', icon: 'bag-handle' },
];

/**
 * Shop | Digital | Physical switch the screen; "My Collection" is a link to
 * the inventory screen (it is its own route, not a tab of this screen).
 */
export function ShopNavigationTabs({
  p, tab, onTab, onCollection, counts, pad,
}: { p: TophuntPalette; tab: ShopTab; onTab: (t: ShopTab) => void; onCollection: () => void; counts: Partial<Record<ShopTab, number>>; pad: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { paddingHorizontal: pad }]}>
      <View style={[styles.track, { backgroundColor: p.card, borderColor: p.border }]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.key === tab;
          const count = counts[t.key];
          const content = (
            <>
              <Ionicons name={t.icon} size={15} color={on ? '#FFF' : p.sub} />
              <Text style={[styles.label, { color: on ? '#FFF' : p.text }]}>{t.label}</Text>
              {count !== undefined ? <Text style={[styles.count, { color: on ? 'rgba(255,255,255,0.8)' : p.sub }]}>{count}</Text> : null}
            </>
          );
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => onTab(t.key)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.label}${count !== undefined ? `, ${count} items` : ''}`}
            >
              {on ? (
                <LinearGradient colors={[TH.colors.royal, TH.colors.primary, TH.colors.electric]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tab, styles.tabOn]}>
                  {content}
                </LinearGradient>
              ) : (
                <View style={styles.tab}>{content}</View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        onPress={onCollection}
        style={[styles.link, { borderColor: p.border, backgroundColor: p.card }]}
        accessibilityRole="link"
        accessibilityLabel="My Collection: aapke items kholo"
      >
        <Ionicons name="grid" size={15} color={p.isDark ? TH.colors.gold : TH.colors.royal} />
        <Text style={[styles.label, { color: p.text }]}>My Collection</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, alignItems: 'center', paddingVertical: 4 },
  track: { flexDirection: 'row', borderRadius: TH.radii.pill, borderWidth: 1, padding: 4, gap: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: TH.radii.pill },
  tabOn: { shadowColor: TH.colors.primary, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  label: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  count: { fontFamily: TH.fonts.semibold, fontSize: 11 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 14, borderRadius: TH.radii.pill, borderWidth: 1 },
});
