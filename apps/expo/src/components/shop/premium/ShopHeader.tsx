import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackButton } from '@/src/components/ui/BackButton';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Ionicons } from '@/src/lib/icons';
import { TH } from '@/src/theme/tophunt';
import { FONT_FLOOR, MOCK, MOCK_M, font, mfont, px } from './mock';
import { BagIcon, CoinArt, CrownLogo, CrownOrnament, DiamondArt, Laurel } from './ShopArt';

/**
 * Top of the Shop (reference mock, y 14..104, scaled by u): the centred crown
 * ornament; the crown + "TopHunt" wordmark with the live DP coin and Diamond
 * pills (skeletons until the server answers, never a fake 0), cart with its
 * count and orders; then the title row: back (only when there is somewhere
 * to go back to), the gold bag, "Shop" and the tagline between laurels.
 */
export function ShopHeader({
  u, inner, live, dpcoin, diamonds, cartCount, onOrders, onCart, showBack,
}: {
  u: number;
  inner: number;
  live: boolean;
  dpcoin: number;
  diamonds: number;
  cartCount: number;
  onOrders: () => void;
  onCart: () => void;
  showBack: boolean;
}) {
  const H = MOCK.header;
  const T = MOCK.title;
  const pillH = px(H.pillH, u);
  const pillFs = font(H.pillText, u, FONT_FLOOR.label);
  const pillIcon = Math.max(pillFs, px(H.pillIcon, u));
  const pill = { height: pillH, borderRadius: pillH / 2, paddingHorizontal: px(8, u), gap: px(5, u) };
  const badge = Math.max(px(H.badge, u), 11);
  const ornW = px(MOCK.crown.w, u);
  const lw = px(9, u);
  return (
    <View style={{ width: inner }}>
      <View style={[styles.ornament, { top: px(MOCK.crown.y, u), left: (inner - ornW) / 2 }]} pointerEvents="none">
        <CrownOrnament width={ornW} height={px(MOCK.crown.h, u)} />
      </View>

      <View style={[styles.row, { marginTop: px(H.y, u), height: px(H.h, u), gap: px(H.gap, u) }]}>
        <View style={[styles.row, { gap: px(5, u), flexShrink: 1, minWidth: 0 }]} accessible accessibilityRole="header" accessibilityLabel="TopHunt">
          <CrownLogo width={px(H.logoW, u)} height={px(H.logoH, u)} />
          <Text style={[styles.word, { fontSize: font(H.word, u, FONT_FLOOR.title) }]} numberOfLines={1}>TopHunt</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View
          style={[styles.pill, pill, { minWidth: px(H.dpW, u), borderColor: '#F5B935', borderWidth: Math.max(1, 1.5 * u) }]}
          accessible
          accessibilityLabel={live ? `${dpcoin.toLocaleString()} DP coin` : 'DP coin balance load ho raha hai'}
        >
          <CoinArt size={pillIcon} />
          {live ? (
            <Text style={[styles.pillText, { fontSize: pillFs }]} numberOfLines={1}>{dpcoin.toLocaleString()} DP</Text>
          ) : (
            <Skeleton width={px(60, u)} height={pillFs * 0.8} borderRadius={4} />
          )}
        </View>
        <View
          style={[styles.pill, pill, { minWidth: px(H.diaW, u), borderColor: '#22D3EE', borderWidth: Math.max(1, 1.5 * u) }]}
          accessible
          accessibilityLabel={live ? `${diamonds.toLocaleString()} Diamonds` : 'Diamond balance load ho raha hai'}
        >
          <DiamondArt size={pillIcon} />
          {live ? (
            <Text style={[styles.pillText, { fontSize: pillFs }]} numberOfLines={1}>{diamonds.toLocaleString()}</Text>
          ) : (
            <Skeleton width={px(44, u)} height={pillFs * 0.8} borderRadius={4} />
          )}
        </View>
        <TouchableOpacity onPress={onCart} hitSlop={10} accessibilityRole="button" accessibilityLabel={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}>
          <Ionicons name="cart-outline" size={Math.max(16, px(H.cart, u))} color="#FFFFFF" />
          {cartCount > 0 ? (
            <View style={[styles.badge, { minWidth: badge, height: badge, borderRadius: badge / 2, top: -badge * 0.4, right: -badge * 0.45 }]}>
              <Text style={[styles.badgeText, { fontSize: Math.max(7.5, badge * 0.6) }]}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOrders}
          hitSlop={10}
          style={[styles.orders, { width: Math.max(18, px(H.orders, u)), height: Math.max(18, px(H.orders, u)), borderRadius: px(8, u) }]}
          accessibilityRole="button"
          accessibilityLabel="My orders"
        >
          <Ionicons name="receipt-outline" size={Math.max(12, px(17, u))} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.row, { marginTop: px(T.y - H.y - H.h, u), height: px(T.h, u), gap: px(8, u) }]}>
        {showBack ? (
          <BackButton size={Math.max(14, px(18, u))} color="#FFFFFF" style={[styles.back, { width: Math.max(22, px(30, u)), height: Math.max(22, px(30, u)), borderRadius: px(15, u) }]} />
        ) : null}
        <View style={[styles.bagGlow, { width: px(T.bag, u), height: px(T.bag, u), borderRadius: px(9, u) }]}>
          <BagIcon size={px(T.bag * 0.7, u)} outline />
        </View>
        <Text style={[styles.title, { fontSize: font(T.size, u, FONT_FLOOR.title + 4) }]} accessibilityRole="header">Shop</Text>
        <View style={[styles.row, { flex: 1, minWidth: 0, gap: px(4, u) }]}>
          <Laurel width={lw} height={px(18, u)} />
          <Text style={[styles.tagline, { fontSize: font(T.tagline, u) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            Collect • Customize • Upgrade • Stand Out
          </Text>
          <Laurel width={lw} height={px(18, u)} flip />
        </View>
      </View>
    </View>
  );
}

/**
 * Phone header (mobile mock, 340 px wide, scaled by u = width / 340): the
 * small crown ornament at the top centre; crown + "TopHunt", the live DP coin
 * and Diamond pills (skeletons until the server answers), cart with its
 * count and the orders icon; then the title row: back (only when there is
 * history to go back to), gold bag, "Shop" and the tagline between laurels.
 */
export function ShopHeaderMobile({
  u, inner, live, dpcoin, diamonds, cartCount, onOrders, onCart, showBack,
}: {
  u: number;
  inner: number;
  live: boolean;
  dpcoin: number;
  diamonds: number;
  cartCount: number;
  onOrders: () => void;
  onCart: () => void;
  showBack: boolean;
}) {
  const H = MOCK_M.header;
  const T = MOCK_M.title;
  const pillH = px(H.pillH, u);
  const pillFs = mfont(H.pillText, u);
  const pillIcon = px(H.pillIcon, u);
  const pill = { height: pillH, borderRadius: pillH / 2, paddingHorizontal: px(6, u), gap: px(4, u) };
  const badge = px(H.badge, u);
  const ornW = px(MOCK_M.crown.w, u);
  const lw = px(T.laurel * 0.5, u);
  const rowH = px(H.h - H.rowTop, u);
  return (
    <View style={{ width: inner }}>
      <View style={[styles.ornament, { top: 0, left: (inner - ornW) / 2 }]} pointerEvents="none">
        <CrownOrnament width={ornW} height={px(MOCK_M.crown.h, u)} />
      </View>

      <View style={[styles.row, { marginTop: px(H.rowTop, u), height: rowH, gap: px(H.gap, u) }]}>
        <View style={[styles.row, { gap: px(4, u), flexShrink: 1, minWidth: 0 }]} accessible accessibilityRole="header" accessibilityLabel="TopHunt">
          <CrownLogo width={px(H.logo, u)} height={px(H.logo * 0.82, u)} />
          <Text style={[styles.word, { fontSize: mfont(H.word, u) }]} numberOfLines={1}>TopHunt</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View
          style={[styles.pill, pill, { minWidth: px(H.dpW, u), borderColor: '#F5B935', borderWidth: Math.max(1, 1.2 * u) }]}
          accessible
          accessibilityLabel={live ? `${dpcoin.toLocaleString()} DP coin` : 'DP coin balance load ho raha hai'}
        >
          <CoinArt size={pillIcon} />
          {live ? (
            <Text style={[styles.pillText, { fontSize: pillFs }]} numberOfLines={1}>{dpcoin.toLocaleString()} DP</Text>
          ) : (
            <Skeleton width={px(40, u)} height={pillFs * 0.8} borderRadius={4} />
          )}
        </View>
        <View
          style={[styles.pill, pill, { minWidth: px(H.diaW, u), borderColor: '#22D3EE', borderWidth: Math.max(1, 1.2 * u) }]}
          accessible
          accessibilityLabel={live ? `${diamonds.toLocaleString()} Diamonds` : 'Diamond balance load ho raha hai'}
        >
          <DiamondArt size={pillIcon} />
          {live ? (
            <Text style={[styles.pillText, { fontSize: pillFs }]} numberOfLines={1}>{diamonds.toLocaleString()}</Text>
          ) : (
            <Skeleton width={px(30, u)} height={pillFs * 0.8} borderRadius={4} />
          )}
        </View>
        <TouchableOpacity onPress={onCart} hitSlop={8} accessibilityRole="button" accessibilityLabel={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}>
          <Ionicons name="cart-outline" size={px(H.cart, u)} color="#FFFFFF" />
          {cartCount > 0 ? (
            <View style={[styles.badge, { minWidth: badge, height: badge, borderRadius: badge / 2, top: -badge * 0.4, right: -badge * 0.45 }]}>
              <Text style={[styles.badgeText, { fontSize: badge * 0.62 }]}>{cartCount > 99 ? '99+' : cartCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={onOrders} hitSlop={8} accessibilityRole="button" accessibilityLabel="My orders">
          <Ionicons name="receipt-outline" size={px(H.orders, u)} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={[styles.row, { marginTop: px(T.y - H.h, u), height: px(T.h, u), gap: px(6, u) }]}>
        {showBack ? <BackButton size={px(T.back, u)} color="#FFFFFF" /> : null}
        <BagIcon size={px(T.bag, u)} outline />
        <Text style={[styles.title, { fontSize: mfont(T.size, u) }]} accessibilityRole="header">Shop</Text>
        <View style={[styles.row, { flex: 1, minWidth: 0, gap: px(3, u), justifyContent: 'center' }]}>
          <Laurel width={lw} height={px(T.laurel, u)} />
          <Text style={[styles.tagline, { fontSize: mfont(T.tagline, u) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Collect • Customize • Upgrade • Stand Out
          </Text>
          <Laurel width={lw} height={px(T.laurel, u)} flip />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No View shadow: on web it is a rectangular box-shadow; the SVG draws its own soft glow.
  ornament: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'center' },
  word: { color: '#FFFFFF', fontFamily: TH.fonts.bold, letterSpacing: 0.2 },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#160A33' },
  pillText: { color: '#FFFFFF', fontFamily: TH.fonts.bold, flexShrink: 1 },
  badge: { position: 'absolute', backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  badgeText: { color: '#FFF', fontFamily: TH.fonts.bold },
  orders: { borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)', backgroundColor: '#160A33', alignItems: 'center', justifyContent: 'center' },
  back: { borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)', backgroundColor: '#160A33', alignItems: 'center', justifyContent: 'center' },
  bagGlow: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,185,53,0.14)', borderWidth: 1, borderColor: 'rgba(245,185,53,0.45)', shadowColor: '#F5B935', shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  title: { color: '#FFFFFF', fontFamily: TH.fonts.bold, letterSpacing: 0.3 },
  tagline: { color: '#F5D58A', fontFamily: TH.fonts.semibold, flexShrink: 1 },
});
