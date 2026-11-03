import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useImageAspect } from '@/src/components/home/Header';
import { Ionicons } from '@/src/lib/icons';
import { fitArt } from '@/src/lib/layout';
import { useAppConfig } from '@/src/services/appSettings';
import { TH } from '@/src/theme/tophunt';
import images from '@/assets/images';
import { FONT_FLOOR, MOCK, MOCK_M, font, mfont, px } from './mock';
import { Laurel } from './ShopArt';

/**
 * The app's own header logo, exactly as the Home header draws it: the admin
 * `headerLogoUrl` (App Settings) when set, else the bundled TopHunt wordmark,
 * at its real aspect ratio inside `maxWidth` × `maxHeight`.
 */
function BrandLogo({ maxWidth, maxHeight }: { maxWidth: number; maxHeight: number }) {
  const { config } = useAppConfig();
  const customUrl = config?.headerLogoUrl || null;
  const aspect = useImageAspect(customUrl) ?? 3;
  const box = fitArt({ aspect, maxWidth, maxHeight });
  return (
    <AppImage
      source={customUrl ? { uri: customUrl } : images.tophuntLogo}
      displayWidth={box.width}
      style={box}
      contentFit="contain"
      transition={0}
      accessibilityLabel="TopHunt"
    />
  );
}

interface HeaderProps {
  u: number;
  inner: number;
  live: boolean;
  dpcoin: number;
  diamonds: number;
  cartCount: number;
  onOrders: () => void;
  onCart: () => void;
  /** DP coin and Diamond pills open the wallet. */
  onWallet: () => void;
}

/**
 * DP coin / Diamond balance pill. Tapping opens the wallet. Shows a skeleton
 * until the server answers (never a fake 0). Uses the app-wide CoinIcon /
 * DiamondIcon, the same symbols as the wallet and the rest of the app.
 */
function BalancePill({
  kind, value, live, height, fontSize, icon, padX, gap, minWidth, border, skeletonW, onPress,
}: {
  kind: 'dp' | 'diamond';
  value: number;
  live: boolean;
  height: number;
  fontSize: number;
  icon: number;
  padX: number;
  gap: number;
  minWidth: number;
  border: number;
  skeletonW: number;
  onPress: () => void;
}) {
  const dp = kind === 'dp';
  const label = dp ? 'DP coin' : 'Diamonds';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={live ? `${value.toLocaleString()} ${label}. Wallet kholo` : `${label} balance load ho raha hai. Wallet kholo`}
      style={[
        styles.pill,
        { height, borderRadius: height / 2, paddingHorizontal: padX, gap, minWidth, borderWidth: border, borderColor: dp ? '#F5B935' : '#22D3EE' },
      ]}
    >
      {dp ? <CoinIcon size={icon} /> : <DiamondIcon size={icon} />}
      {live ? (
        <Text style={[styles.pillText, { fontSize }]} numberOfLines={1}>
          {dp ? `${value.toLocaleString()} DP` : value.toLocaleString()}
        </Text>
      ) : (
        <Skeleton width={skeletonW} height={fontSize * 0.8} borderRadius={4} />
      )}
    </TouchableOpacity>
  );
}

function CartButton({ count, size, badge, onPress }: { count: number; size: number; badge: number; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={count ? `Cart, ${count} items` : 'Cart, empty'}>
      <Ionicons name="cart-outline" size={size} color="#FFFFFF" />
      {count > 0 ? (
        <View style={[styles.badge, { minWidth: badge, height: badge, borderRadius: badge / 2, top: -badge * 0.4, right: -badge * 0.45 }]}>
          <Text style={[styles.badgeText, { fontSize: Math.max(7.5, badge * 0.62) }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Tagline({ fontSize, laurelW, laurelH, gap }: { fontSize: number; laurelW: number; laurelH: number; gap: number }) {
  return (
    <View style={[styles.row, { justifyContent: 'center', gap }]}>
      <Laurel width={laurelW} height={laurelH} />
      <Text style={[styles.tagline, { fontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        Collect • Customize • Upgrade • Stand Out
      </Text>
      <Laurel width={laurelW} height={laurelH} flip />
    </View>
  );
}

/**
 * Top of the Shop on wide screens (desktop mock, scaled by u): the app's own
 * logo (same as Home), the DP coin and Diamond pills (tap → wallet), cart
 * with its count and orders; under it the tagline between laurels.
 */
export function ShopHeader({ u, inner, live, dpcoin, diamonds, cartCount, onOrders, onCart, onWallet }: HeaderProps) {
  const H = MOCK.header;
  const T = MOCK.title;
  const pillH = px(H.pillH, u);
  const pillFs = font(H.pillText, u, FONT_FLOOR.label);
  const pillIcon = Math.max(pillFs, px(H.pillIcon, u));
  const border = Math.max(1, 1.5 * u);
  return (
    <View style={{ width: inner }}>
      <View style={[styles.row, { marginTop: px(H.y, u), height: px(H.h, u), gap: px(H.gap, u) }]}>
        <BrandLogo maxWidth={inner * 0.3} maxHeight={Math.max(28, px(H.h + 6, u))} />
        <View style={{ flex: 1 }} />
        <BalancePill kind="dp" value={dpcoin} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(8, u)} gap={px(5, u)} minWidth={px(H.dpW, u)} border={border} skeletonW={px(60, u)} onPress={onWallet} />
        <BalancePill kind="diamond" value={diamonds} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(8, u)} gap={px(5, u)} minWidth={px(H.diaW, u)} border={border} skeletonW={px(44, u)} onPress={onWallet} />
        <CartButton count={cartCount} size={Math.max(16, px(H.cart, u))} badge={Math.max(px(H.badge, u), 11)} onPress={onCart} />
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
      <View style={{ marginTop: px(T.y - H.y - H.h, u), height: px(T.h, u), justifyContent: 'center' }}>
        <Tagline fontSize={font(T.tagline, u)} laurelW={px(9, u)} laurelH={px(18, u)} gap={px(4, u)} />
      </View>
    </View>
  );
}

/**
 * Phone header (mobile mock, scaled by u = width / 340): the app's own logo
 * (same as Home), DP coin and Diamond pills (tap → wallet), cart and orders;
 * under it the tagline between laurels.
 */
export function ShopHeaderMobile({ u, inner, live, dpcoin, diamonds, cartCount, onOrders, onCart, onWallet }: HeaderProps) {
  const H = MOCK_M.header;
  const T = MOCK_M.title;
  const pillH = px(H.pillH, u);
  const pillFs = mfont(H.pillText, u);
  const pillIcon = px(H.pillIcon, u);
  const border = Math.max(1, 1.2 * u);
  const rowH = px(H.h - H.rowTop, u);
  return (
    <View style={{ width: inner }}>
      <View style={[styles.row, { marginTop: px(H.rowTop, u), height: rowH, gap: px(H.gap, u) }]}>
        <BrandLogo maxWidth={inner * 0.3} maxHeight={rowH + px(6, u)} />
        <View style={{ flex: 1 }} />
        <BalancePill kind="dp" value={dpcoin} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(6, u)} gap={px(4, u)} minWidth={px(H.dpW, u)} border={border} skeletonW={px(40, u)} onPress={onWallet} />
        <BalancePill kind="diamond" value={diamonds} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(6, u)} gap={px(4, u)} minWidth={px(H.diaW, u)} border={border} skeletonW={px(30, u)} onPress={onWallet} />
        <CartButton count={cartCount} size={px(H.cart, u)} badge={px(H.badge, u)} onPress={onCart} />
        <TouchableOpacity onPress={onOrders} hitSlop={8} accessibilityRole="button" accessibilityLabel="My orders">
          <Ionicons name="receipt-outline" size={px(H.orders, u)} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={{ marginTop: px(T.y - H.h, u), height: px(T.h, u), justifyContent: 'center' }}>
        <Tagline fontSize={mfont(T.tagline + 1, u)} laurelW={px(T.laurel * 0.5, u)} laurelH={px(T.laurel, u)} gap={px(3, u)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#160A33' },
  pillText: { color: '#FFFFFF', fontFamily: TH.fonts.bold, flexShrink: 1 },
  badge: { position: 'absolute', backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  badgeText: { color: '#FFF', fontFamily: TH.fonts.bold },
  orders: { borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)', backgroundColor: '#160A33', alignItems: 'center', justifyContent: 'center' },
  tagline: { color: '#F5D58A', fontFamily: TH.fonts.semibold, flexShrink: 1 },
});
