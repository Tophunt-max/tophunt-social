/**
 * Categories derived from the item types actually on sale (src/lib/shopModel
 * deriveCategories), each with its live count. Virtual Gifts appears only when
 * gifts are switched on and the catalogue has gifts.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@/src/lib/icons';
import type { CategoryCard } from '@/src/lib/shopModel';
import { TH, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import { ItemStage, type Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';

export function CategoryGrid({
  p, categories, gifts, cellW, pad, viewer, onPick, onGifts,
}: {
  p: TophuntPalette;
  categories: CategoryCard<StoreItemView>[];
  gifts: { label: string; count: number } | null;
  cellW: number;
  pad: number;
  viewer: Viewer;
  onPick: (type: string) => void;
  onGifts: () => void;
}) {
  const thumb = Math.min(64, Math.round(cellW * 0.36));
  return (
    <View style={[styles.grid, { paddingHorizontal: pad }]}>
      {categories.map((c) => {
        const t = rarityToken(c.sample.rarity);
        return (
          <TouchableOpacity
            key={c.type}
            onPress={() => onPick(c.type)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${c.label}, ${c.count} items`}
            style={[styles.card, { width: cellW, backgroundColor: p.card, borderColor: p.border }]}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <LinearGradient colors={t.glow ? t.gradient : [TH.colors.royal, TH.colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
                <Ionicons name={c.icon} size={16} color="#FFF" />
              </LinearGradient>
              <Text style={[styles.label, { color: p.text }]} numberOfLines={2}>{c.label}</Text>
              <Text style={[styles.count, { color: p.sub }]}>{c.count} {c.count === 1 ? 'item' : 'items'}</Text>
            </View>
            <View style={[styles.thumb, { width: thumb, height: thumb }]} pointerEvents="none">
              <LinearGradient colors={TH.gradients.stage} style={StyleSheet.absoluteFill} />
              <ItemStage item={c.sample} w={thumb} h={thumb} viewer={viewer} />
            </View>
          </TouchableOpacity>
        );
      })}
      {gifts ? (
        <TouchableOpacity
          onPress={onGifts}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${gifts.label}, ${gifts.count} gifts. Gift history kholo`}
          style={[styles.card, { width: cellW, backgroundColor: p.card, borderColor: p.border }]}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <LinearGradient colors={TH.gradients.pink} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
              <Ionicons name="gift" size={16} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.label, { color: p.text }]} numberOfLines={2}>{gifts.label}</Text>
            <Text style={[styles.count, { color: p.sub }]}>{gifts.count} gifts · profile se bhejo</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: TH.radii.lg, borderWidth: 1, padding: 12, minHeight: 104 },
  icon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: TH.fonts.bold, fontSize: 14 },
  count: { fontFamily: TH.fonts.medium, fontSize: 11.5 },
  thumb: { borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
