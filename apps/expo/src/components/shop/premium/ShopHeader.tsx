import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackButton } from '@/src/components/ui/BackButton';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Ionicons } from '@/src/lib/icons';
import { TH, type TophuntPalette } from '@/src/theme/tophunt';

/**
 * Shop top bar: back, the TOPHUNT wordmark over "DP Arena Shop", the live DP
 * coin pill (a skeleton until the server answers, never a fake 0), orders and
 * the cart with its item count.
 */
export function ShopHeader({
  p, live, dpcoin, cartCount, onOrders, onCart, pad,
}: { p: TophuntPalette; live: boolean; dpcoin: number; cartCount: number; onOrders: () => void; onCart: () => void; pad: number }) {
  const btn = [styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }];
  return (
    <View style={[styles.bar, { paddingHorizontal: pad }]}>
      <BackButton size={22} color={p.text} style={btn} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.kicker, { color: p.isDark ? TH.colors.gold : TH.colors.royal }]}>TOPHUNT</Text>
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>DP Arena Shop</Text>
      </View>
      <View
        style={[styles.coinPill, { backgroundColor: p.card, borderColor: p.isDark ? `${TH.colors.gold}55` : p.border }]}
        accessible
        accessibilityLabel={live ? `${dpcoin} DP coin` : 'DP coin balance load ho raha hai'}
      >
        <CoinIcon size={16} />
        {live ? (
          <Text style={[styles.coinText, { color: p.text }]}>{dpcoin.toLocaleString()}</Text>
        ) : (
          <Skeleton width={34} height={12} borderRadius={6} />
        )}
      </View>
      <TouchableOpacity onPress={onOrders} style={btn} accessibilityRole="button" accessibilityLabel="My orders">
        <Ionicons name="receipt-outline" size={18} color={p.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onCart} style={btn} accessibilityRole="button" accessibilityLabel={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}>
        <Ionicons name="cart-outline" size={19} color={p.text} />
        {cartCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: TH.fonts.bold, fontSize: 10, letterSpacing: 2.4 },
  title: { fontFamily: TH.fonts.bold, fontSize: 19, marginTop: -1 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 11 },
  coinText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: TH.colors.pink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 10 },
});
