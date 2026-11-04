import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ShopTab } from '@/src/lib/shopModel';
import { BRAND_BUTTON, TH, type TophuntPalette } from '@/src/theme/tophunt';
import { FONT_FLOOR, MOCK, MOCK_M, font, mfont, px } from './mock';
import { TabGlyph } from './ShopArt';
import { cardShadow } from './surface';

const TABS: { key: ShopTab | 'collection'; label: string; icon: 'bag' | 'layers' | 'cube' | 'grid' }[] = [
  { key: 'shop', label: 'Shop', icon: 'bag' },
  { key: 'digital', label: 'Digital', icon: 'layers' },
  { key: 'physical', label: 'Physical', icon: 'cube' },
  { key: 'collection', label: 'My Collection', icon: 'grid' },
];

/** Text and icon on the active (brand pink) segment. */
const ON_INK = TH.colors.white;

/**
 * Segmented bar of the reference mock (696×34 scaled by u): one rounded
 * track (card surface, 1 px border) with 4 equal segments split by thin
 * dividers (none next to the active one). The active segment is a brand pink
 * pill (BRAND_BUTTON) inset 3 px with white text. Shop | Digital | Physical switch the screen; "My Collection" opens
 * the inventory route (its own screen).
 */
export function ShopNavigationTabs({
  p, u, width, tab, onTab, onCollection,
}: { p: TophuntPalette; u: number; width: number; tab: ShopTab; onTab: (t: ShopTab) => void; onCollection: () => void }) {
  const T = MOCK.tabs;
  const fs = font(T.text, u, FONT_FLOOR.label);
  const h = Math.max(px(T.h, u), fs + 8);
  const inset = px(T.inset, u);
  const icon = Math.max(fs, px(T.icon, u));
  const activeIdx = TABS.findIndex((t) => t.key === tab);
  return (
    <View
      style={[styles.track, { width, height: h, borderRadius: h / 2, backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
      accessibilityRole="tablist"
    >
      {TABS.map((t, i) => {
        const on = i === activeIdx;
        const divider = i > 0 && i !== activeIdx && i - 1 !== activeIdx;
        const isLink = t.key === 'collection';
        const content = (
          <>
            <TabGlyph name={t.icon} size={icon} color={on ? ON_INK : p.sub} />
            <Text style={[on ? styles.labelOn : styles.label, { fontSize: fs }, !on && { color: p.sub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t.label}</Text>
          </>
        );
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => (isLink ? onCollection() : onTab(t.key as ShopTab))}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.seg, divider && [styles.divider, { borderLeftColor: p.border }]]}
            accessibilityRole={isLink ? 'link' : 'tab'}
            accessibilityState={isLink ? undefined : { selected: on }}
            accessibilityLabel={isLink ? 'My Collection: aapke items kholo' : t.label}
          >
            {on ? (
              <LinearGradient
                colors={BRAND_BUTTON}
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

/**
 * Phone tab bar (mobile mock: h 26, radius 13): segments sized to their
 * content and sharing the spare width, no dividers; the active one is a
 * brand pink pill at least 64 wide.
 */
export function ShopNavigationTabsMobile({
  p, u, width, tab, onTab, onCollection,
}: { p: TophuntPalette; u: number; width: number; tab: ShopTab; onTab: (t: ShopTab) => void; onCollection: () => void }) {
  const T = MOCK_M.tabs;
  const fs = mfont(T.text, u);
  const h = px(T.h, u);
  const inset = px(T.inset, u);
  const icon = px(T.icon, u);
  return (
    <View style={[styles.track, { width, height: h, borderRadius: h / 2, backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.key === tab;
        const isLink = t.key === 'collection';
        const content = (
          <>
            <TabGlyph name={t.icon} size={icon} color={on ? ON_INK : p.sub} />
            <Text style={[on ? styles.labelOn : styles.label, { fontSize: fs }, !on && { color: p.sub }]} numberOfLines={1}>{t.label}</Text>
          </>
        );
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => (isLink ? onCollection() : onTab(t.key as ShopTab))}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8 }}
            style={[styles.segM, on && { minWidth: px(T.activeW, u) }]}
            accessibilityRole={isLink ? 'link' : 'tab'}
            accessibilityState={isLink ? undefined : { selected: on }}
            accessibilityLabel={isLink ? 'My Collection: aapke items kholo' : t.label}
          >
            {on ? (
              <LinearGradient
                colors={BRAND_BUTTON}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.inner, { margin: inset, borderRadius: (h - inset * 2) / 2, gap: px(4, u), paddingHorizontal: px(6, u) }]}
              >
                {content}
              </LinearGradient>
            ) : (
              <View style={[styles.inner, { margin: inset, gap: px(4, u), paddingHorizontal: px(4, u) }]}>{content}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderWidth: 1 },
  seg: { flex: 1, minWidth: 0 },
  segM: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  divider: { borderLeftWidth: 1 },
  inner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  label: { fontFamily: TH.fonts.semibold, flexShrink: 1 },
  labelOn: { color: ON_INK, fontFamily: TH.fonts.bold, flexShrink: 1 },
});
