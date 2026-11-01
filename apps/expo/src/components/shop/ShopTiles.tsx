/**
 * Tiles for the Shop screen (store layout v3): soft rounded stages, the price
 * on its own row and a round gradient action button, plus wide carousel cards
 * for the Hot deals rail (physical products). Digital items use
 * src/components/shop/premium/.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { ScaleTouchable } from '@/src/components/explore/ScaleTouchable';
import { BRAND_GRAD, GOLD, type ExplorePalette } from '@/src/components/explore/theme';
import { VOTE_GRAD } from './DigitalItemCard';

export interface ShopProduct {
  id: string;
  title: string;
  images: string[];
  priceCoins: number;
  featured: boolean;
  category: string;
  variants: { inStock: boolean }[];
}

/** Round action button: gradient when it can act, muted with a lock when not. */
function RoundAction({ icon, onPress, busy, locked, owned, p, label, size = 36 }: {
  icon: string; onPress?: () => void; busy?: boolean; locked?: boolean; owned?: boolean; p: ExplorePalette; label: string; size?: number;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (owned) {
    return (
      <View style={[styles.round, box, { backgroundColor: 'rgba(34,165,89,0.15)' }]} accessible accessibilityLabel={label}>
        <Ionicons name="checkmark" size={size * 0.46} color="#22A559" />
      </View>
    );
  }
  if (locked) {
    return (
      <View style={[styles.round, box, { backgroundColor: p.chip }]} accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={label}>
        <Ionicons name="lock-closed" size={size * 0.4} color={p.sub} />
      </View>
    );
  }
  const inner = busy ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name={icon} size={size * 0.46} color="#FFF" />;
  if (!onPress) {
    return <LinearGradient colors={VOTE_GRAD} style={[styles.round, box, styles.roundGlow]}>{inner}</LinearGradient>;
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} activeOpacity={0.85}>
      <LinearGradient colors={VOTE_GRAD} style={[styles.round, box, styles.roundGlow]}>{inner}</LinearGradient>
    </TouchableOpacity>
  );
}

function Price({ coins, p, size = 15 }: { coins: number; p: ExplorePalette; size?: number }) {
  return (
    <View style={styles.price}>
      <CoinIcon size={size} />
      <Text style={[styles.priceText, { color: p.text, fontSize: size + 1 }]}>{coins.toLocaleString()}</Text>
    </View>
  );
}

/** Grid tile for a physical product. */
export const ProductTile = React.memo(function ProductTile({
  item, width, p, canAfford, onPress,
}: { item: ShopProduct; width: number; p: ExplorePalette; canAfford: boolean; onPress: () => void }) {
  const inStock = item.variants.some((v) => v.inStock);
  const imgW = width - 12;
  return (
    <ScaleTouchable
      style={[styles.tile, { width, backgroundColor: p.card, borderColor: p.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.priceCoins} DP coin${inStock ? '' : ', out of stock'}`}
    >
      <View style={[styles.stage, { width: imgW, height: imgW, backgroundColor: p.chip }]}>
        {item.images[0] ? (
          <AppImage source={{ uri: item.images[0] }} displayWidth={imgW} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
            <Ionicons name="gift" size={30} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        )}
        {item.featured ? (
          <View style={[styles.urgent, { left: 8, right: undefined, top: 8, bottom: undefined }]}>
            <Ionicons name="flame" size={10} color="#FFF" />
            <Text style={styles.urgentText}>HOT</Text>
          </View>
        ) : null}
        {!inStock ? (
          <View style={[StyleSheet.absoluteFill, styles.soldOut]}>
            <Text style={styles.soldOutText}>Sold out</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text style={[styles.tileName, { color: p.text }]} numberOfLines={1}>{item.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="car" size={11} color={p.sub} />
          <Text style={[styles.tileType, { color: p.sub }]} numberOfLines={1}>Delivery included</Text>
        </View>
        <View style={styles.tileFoot}>
          <Price coins={item.priceCoins} p={p} />
          <View style={{ flex: 1 }} />
          {inStock ? <RoundAction p={p} icon="bag-handle" locked={!canAfford} label={canAfford ? 'Open product' : 'Not enough DP coin'} /> : null}
        </View>
      </View>
    </ScaleTouchable>
  );
});

/** Wide carousel card for a featured product. */
export function DealCard({ item, width, p, canAfford, onPress }: { item: ShopProduct; width: number; p: ExplorePalette; canAfford: boolean; onPress: () => void }) {
  const h = Math.round(width * 0.56);
  return (
    <ScaleTouchable style={[styles.deal, { width, height: h }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Hot deal: ${item.title}, ${item.priceCoins} DP coin`}>
      {item.images[0] ? (
        <AppImage source={{ uri: item.images[0] }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="gift" size={48} color="rgba(255,255,255,0.9)" />
        </LinearGradient>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.urgent, { left: 12, top: 12, right: undefined, bottom: undefined }]}>
        <Ionicons name="flame" size={10} color="#FFF" />
        <Text style={styles.urgentText}>HOT DEAL</Text>
      </View>
      <View style={styles.dealFoot}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.dealTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.price}>
            <CoinIcon size={15} color={GOLD} />
            <Text style={[styles.priceText, { color: GOLD, fontSize: 17 }]}>{item.priceCoins.toLocaleString()}</Text>
          </View>
        </View>
        <RoundAction p={{ ...p, chip: 'rgba(255,255,255,0.2)', sub: '#FFF' }} icon="bag-handle" size={42} locked={!canAfford} label={canAfford ? 'Open product' : 'Not enough DP coin'} />
      </View>
    </ScaleTouchable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  round: { alignItems: 'center', justifyContent: 'center' },
  roundGlow: { shadowColor: '#FF4D67', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 3 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { fontFamily: 'Urbanist-Black' },

  tile: { borderRadius: 24, borderWidth: 1, padding: 6 },
  stage: { borderRadius: 19, overflow: 'hidden' },
  urgent: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(240,65,62,0.95)', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  urgentText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 0.4 },
  soldOut: { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  soldOutText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, overflow: 'hidden' },
  tileBody: { paddingHorizontal: 6, paddingTop: 9, paddingBottom: 4, gap: 2 },
  tileName: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  tileType: { fontFamily: 'Urbanist-Medium', fontSize: 11.5 },
  tileFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },


  deal: { borderRadius: 26, overflow: 'hidden' },
  dealFoot: { position: 'absolute', left: 14, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dealTitle: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 18 },
});
