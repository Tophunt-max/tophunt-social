import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@/src/lib/icons';
import { TH, rarityToken } from '@/src/theme/tophunt';

/**
 * Rarity as a small gradient pill. Legendary and Mythic carry a crown.
 * Rarity is visual only: it never means voting power or a paid advantage.
 */
export function RarityBadge({ rarity, size = 'sm' }: { rarity?: string | null; size?: 'sm' | 'md' }) {
  const t = rarityToken(rarity);
  const md = size === 'md';
  return (
    <LinearGradient
      colors={t.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.pill, md && styles.pillMd]}
      accessible
      accessibilityLabel={`${t.label} rarity`}
    >
      {t.rank >= 5 ? (
        <MaterialCommunityIcons name="crown" size={md ? 12 : 10} color={t.ink} />
      ) : (
        <View style={[styles.dot, { backgroundColor: t.ink }]} />
      )}
      <Text style={[styles.text, md && styles.textMd, { color: t.ink }]}>{t.label.toUpperCase()}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: TH.radii.pill, paddingHorizontal: 7, paddingVertical: 3 },
  pillMd: { paddingHorizontal: 10, paddingVertical: 4, gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, opacity: 0.9 },
  text: { fontFamily: TH.fonts.bold, fontSize: 9.5, letterSpacing: 0.7 },
  textMd: { fontSize: 11 },
});
