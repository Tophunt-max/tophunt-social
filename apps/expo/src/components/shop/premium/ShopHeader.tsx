import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton } from '@/src/components/ui/BackButton';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Ionicons, MaterialCommunityIcons } from '@/src/lib/icons';
import { TH, type TophuntPalette } from '@/src/theme/tophunt';

/**
 * Shop top bar (reference layout): crown + "TopHunt" wordmark, then the live DP coin and Diamond pills (skeletons until the server answers,
 * never a fake 0), cart with its count and orders. Below: a compact back
 * (the screen is pushed), the bag icon, the
 * big "Shop" title and the gold tagline between laurels.
 */
export function ShopHeader({
  p, live, dpcoin, diamonds, cartCount, onOrders, onCart, pad, compact,
}: {
  p: TophuntPalette;
  live: boolean;
  dpcoin: number;
  diamonds: number;
  cartCount: number;
  onOrders: () => void;
  onCart: () => void;
  pad: number;
  /** Phone width: smaller wordmark and no "DP" suffix on the coin pill. */
  compact: boolean;
}) {
  const btn = [styles.iconBtn, { backgroundColor: p.card, borderColor: p.glowBorder }];
  const gold = p.gold;
  return (
    <View style={{ paddingHorizontal: pad }}>
      <View style={styles.bar}>
        <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="TopHunt">
          <LinearGradient colors={TH.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.crown}>
            <MaterialCommunityIcons name="crown" size={14} color="#2A1A00" />
          </LinearGradient>
          <Text style={[styles.wordmark, compact && { fontSize: 17 }, { color: p.text }]} numberOfLines={1}>Top<Text style={{ color: gold }}>Hunt</Text></Text>
        </View>
        <View style={{ flex: 1 }} />
        <View
          style={[styles.pill, { backgroundColor: p.card, borderColor: `${TH.colors.gold}88` }]}
          accessible
          accessibilityLabel={live ? `${dpcoin.toLocaleString()} DP coin` : 'DP coin balance load ho raha hai'}
        >
          <CoinIcon size={15} />
          {live ? (
            <Text style={[styles.pillText, { color: gold }]} numberOfLines={1}>
              {dpcoin.toLocaleString()}{compact ? '' : ' DP'}
            </Text>
          ) : (
            <Skeleton width={34} height={11} borderRadius={6} />
          )}
        </View>
        <View
          style={[styles.pill, { backgroundColor: p.card, borderColor: `${TH.colors.diamond}88` }]}
          accessible
          accessibilityLabel={live ? `${diamonds.toLocaleString()} Diamonds` : 'Diamond balance load ho raha hai'}
        >
          <DiamondIcon size={14} />
          {live ? (
            <Text style={[styles.pillText, { color: p.isDark ? TH.colors.diamond : '#0E7490' }]} numberOfLines={1}>{diamonds.toLocaleString()}</Text>
          ) : (
            <Skeleton width={26} height={11} borderRadius={6} />
          )}
        </View>
        <TouchableOpacity onPress={onCart} style={btn} accessibilityRole="button" accessibilityLabel={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}>
          <Ionicons name="cart-outline" size={18} color={p.text} />
          {cartCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={onOrders} style={btn} accessibilityRole="button" accessibilityLabel="My orders">
          <Ionicons name="receipt-outline" size={17} color={p.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.titleRow}>
        <BackButton size={18} color={p.text} style={[styles.back, { backgroundColor: p.card, borderColor: p.glowBorder }]} />
        <LinearGradient colors={[TH.colors.royal, TH.colors.neon]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bag}>
          <Ionicons name="bag-handle" size={compact ? 20 : 24} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, compact && { fontSize: 30, lineHeight: 34 }, { color: p.text }]} accessibilityRole="header">Shop</Text>
          <View style={styles.tagRow}>
            <MaterialCommunityIcons name="sprout" size={12} color={gold} style={styles.laurelL} />
            <Text style={[styles.tagline, { color: gold }, compact && { fontSize: 11 }]} numberOfLines={1}>
              Collect • Customize • Upgrade • Stand Out
            </Text>
            <MaterialCommunityIcons name="sprout" size={12} color={gold} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 6 },
  back: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 },
  crown: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: TH.fonts.bold, fontSize: 19, letterSpacing: 0.2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 9 },
  pillText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: TH.colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 9.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  bag: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: TH.fonts.bold, fontSize: 36, lineHeight: 40, letterSpacing: 0.3 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  laurelL: { transform: [{ scaleX: -1 }] },
  tagline: { fontFamily: TH.fonts.bold, fontSize: 12, letterSpacing: 0.4, flexShrink: 1 },
});
