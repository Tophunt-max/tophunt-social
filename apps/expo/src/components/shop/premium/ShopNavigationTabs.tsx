import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ShopTab } from '@/src/lib/shopModel';
import { TH, glowShadow } from '@/src/theme/tophunt';
import { FONT_FLOOR, MOCK, font, px } from './mock';
import { TabGlyph } from './ShopArt';

const TABS: { key: ShopTab | 'collection'; label: string; icon: 'bag' | 'layers' | 'cube' | 'grid' }[] = [
  { key: 'shop', label: 'Shop', icon: 'bag' },
  { key: 'digital', label: 'Digital', icon: 'layers' },
  { key: 'physical', label: 'Physical', icon: 'cube' },
  { key: 'collection', label: 'My Collection', icon: 'grid' },
];

const ON_INK = '#1E0B45';

/**
 * Segmented bar of the reference mock (696×34 scaled by u): one rounded,
 * glowing track with 4 equal segments split by thin dividers (none next to
 * the active one). The active segment is a light-purple gradient pill inset
 * 3 px. Shop | Digital | Physical switch the screen; "My Collection" opens
 * the inventory route (its own screen).
 */
export function ShopNavigationTabs({
  u, width, tab, onTab, onCollection,
}: { u: number; width: number; tab: ShopTab; onTab: (t: ShopTab) => void; onCollection: () => void }) {
  const T = MOCK.tabs;
  const fs = font(T.text, u, FONT_FLOOR.label);
  const h = Math.max(px(T.h, u), fs + 8);
  const inset = px(T.inset, u);
  const icon = Math.max(fs, px(T.icon, u));
  const activeIdx = TABS.findIndex((t) => t.key === tab);
  return (
    <View
      style={[styles.track, { width, height: h, borderRadius: h / 2 }, glowShadow('#A855F7', true)]}
      accessibilityRole="tablist"
    >
      {TABS.map((t, i) => {
        const on = i === activeIdx;
        const divider = i > 0 && i !== activeIdx && i - 1 !== activeIdx;
        const isLink = t.key === 'collection';
        const content = (
          <>
            <TabGlyph name={t.icon} size={icon} color={on ? ON_INK : '#FFFFFF'} />
            <Text style={[on ? styles.labelOn : styles.label, { fontSize: fs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t.label}</Text>
          </>
        );
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => (isLink ? onCollection() : onTab(t.key as ShopTab))}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.seg, divider && styles.divider]}
            accessibilityRole={isLink ? 'link' : 'tab'}
            accessibilityState={isLink ? undefined : { selected: on }}
            accessibilityLabel={isLink ? 'My Collection: aapke items kholo' : t.label}
          >
            {on ? (
              <LinearGradient
                colors={['#E9D5FF', '#C4B5FD', '#A78BFA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.inner, { margin: inset, borderRadius: (h - inset * 2) / 2, gap: px(5, u) }]}
              >
                {content}
              </LinearGradient>
            ) : (
              <View style={[styles.inner, { margin: inset, gap: px(5, u) }]}>{content}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', backgroundColor: '#140A2E', borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)' },
  seg: { flex: 1, minWidth: 0 },
  divider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)' },
  inner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  label: { color: '#FFFFFF', fontFamily: TH.fonts.semibold, flexShrink: 1 },
  labelOn: { color: ON_INK, fontFamily: TH.fonts.bold, flexShrink: 1 },
});
