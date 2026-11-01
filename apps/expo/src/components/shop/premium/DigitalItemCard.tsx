/**
 * Premium card for one digital item: live preview on the viewer, rarity
 * badge, real stock / sale-end chips (only when the listing has them), price
 * or Owned, and a small Buy button that opens the purchase sheet. Tapping the
 * card opens the item detail screen.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { timeLeftLabel } from '@/src/lib/shareCaptions';
import { TYPE_SINGULAR } from '@/src/lib/shopModel';
import { TH, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { ProductPreview } from './ProductPreview';
import { RarityBadge } from './RarityBadge';

export const DigitalItemCard = React.memo(function DigitalItemCard({
  item, width, p, viewer, busy, short, onOpen, onBuy,
}: {
  item: StoreItemView;
  width: number;
  p: TophuntPalette;
  viewer: Viewer;
  busy: boolean;
  /** Known balance is below the price (an unknown balance is never "short"). */
  short: boolean;
  onOpen: () => void;
  onBuy: () => void;
}) {
  const t = rarityToken(item.rarity);
  const stageW = width - 12;
  const stageH = Math.round(stageW * 0.9);
  // Computed at render (no timer per card); the detail screen has the live countdown.
  const left = item.owned ? null : timeLeftLabel(item.endsAt);
  const stock = !item.owned && typeof item.remaining === 'number' && item.remaining > 0 ? item.remaining : null;
  const typeLabel = TYPE_SINGULAR[item.type] ?? item.type;
  return (
    <View
      style={[
        styles.card,
        { width, backgroundColor: p.card, borderColor: t.glow ? `${t.color}${p.isDark ? '66' : '55'}` : p.border },
        t.glow && { shadowColor: t.color, shadowOpacity: p.isDark ? 0.35 : 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
      ]}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${t.label} ${typeLabel}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin`}. Details kholo`}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
      >
        <View>
          <ProductPreview item={item} viewer={viewer} width={stageW} height={stageH} radius={TH.radii.lg} />
          <View style={styles.topLeft} pointerEvents="none"><RarityBadge rarity={item.rarity} /></View>
          {item.owned ? (
            <View style={styles.ownedCorner} pointerEvents="none">
              <Ionicons name="checkmark" size={12} color="#FFF" />
            </View>
          ) : stock !== null ? (
            <View style={[styles.chip, styles.topRight]} pointerEvents="none">
              <Text style={styles.chipText}>{stock} left</Text>
            </View>
          ) : null}
          {left ? (
            <View style={[styles.chip, styles.bottomLeft, { backgroundColor: 'rgba(236,72,153,0.92)' }]} pointerEvents="none">
              <Ionicons name="time" size={10} color="#FFF" />
              <Text style={styles.chipText}>{left}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.type, { color: p.sub }]} numberOfLines={1}>{typeLabel}</Text>
        </View>
      </Pressable>
      <View style={styles.foot}>
        {item.owned ? (
          <View style={styles.owned}>
            <Ionicons name="checkmark-circle" size={14} color={TH.colors.success} />
            <Text style={[styles.ownedText]}>Owned</Text>
          </View>
        ) : (
          <View style={styles.price}>
            <CoinIcon size={15} />
            <Text style={[styles.priceText, { color: p.text }]}>{item.priceCoins.toLocaleString()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {item.owned ? null : (
          <TouchableOpacity
            onPress={onBuy}
            disabled={busy}
            activeOpacity={0.85}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            accessibilityLabel={short ? `${item.name}: DP coin kam hai. Details dekho` : `${item.name} kharido, ${item.priceCoins} DP coin`}
          >
            <LinearGradient
              colors={short ? [p.cardAlt, p.cardAlt] : [TH.colors.royal, TH.colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.buy, busy && { opacity: 0.6 }]}
            >
              <Ionicons name={short ? 'lock-closed' : 'flash'} size={12} color={short ? p.sub : '#FFF'} />
              <Text style={[styles.buyText, { color: short ? p.sub : '#FFF' }]}>Buy</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: TH.radii.xl, borderWidth: 1, padding: 6 },
  topLeft: { position: 'absolute', top: 8, left: 8 },
  topRight: { top: 8, right: 8 },
  bottomLeft: { bottom: 8, left: 8 },
  chip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: TH.radii.pill, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(8,8,23,0.72)' },
  chipText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 9.5, letterSpacing: 0.3 },
  ownedCorner: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: TH.colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  body: { paddingHorizontal: 6, paddingTop: 9, gap: 1 },
  name: { fontFamily: TH.fonts.bold, fontSize: 14 },
  type: { fontFamily: TH.fonts.medium, fontSize: 11.5 },
  foot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { fontFamily: TH.fonts.bold, fontSize: 15 },
  owned: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ownedText: { color: TH.colors.success, fontFamily: TH.fonts.bold, fontSize: 13 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: TH.radii.pill },
  buyText: { fontFamily: TH.fonts.bold, fontSize: 12.5 },
});
