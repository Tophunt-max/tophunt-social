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
import { BRAND, SHOP_NAVY, TH, type TophuntPalette } from '@/src/theme/tophunt';
import images from '@/assets/images';
import { FONT_FLOOR, MOCK, MOCK_M, font, mfont, px } from './mock';
import { DiamondSparkle, Laurel, LaurelSprig, PinkBagIcon, ShopBagArt } from './ShopArt';

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
  /** App light / dark surfaces (useTophuntPalette). */
  p: TophuntPalette;
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
 * DiamondIcon, the same symbols as the wallet and the rest of the app. The
 * pill is a neutral card; only the amount carries the currency colour (gold
 * DP, cyan Diamond in dark mode, plain text for Diamond on light where cyan
 * does not read).
 */
function BalancePill({
  p, kind, value, live, height, fontSize, icon, padX, gap, minWidth, border, skeletonW, onPress,
}: {
  p: TophuntPalette;
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
        { height, borderRadius: height / 2, paddingHorizontal: padX, gap, minWidth, borderWidth: border, backgroundColor: p.card, borderColor: p.border },
      ]}
    >
      {dp ? <CoinIcon size={icon} /> : <DiamondIcon size={icon} />}
      {live ? (
        <Text style={[styles.pillText, { fontSize, color: dp ? p.gold : p.isDark ? TH.colors.diamond : p.text }]} numberOfLines={1}>
          {dp ? `${value.toLocaleString()} DP` : value.toLocaleString()}
        </Text>
      ) : (
        <Skeleton width={skeletonW} height={fontSize * 0.8} borderRadius={4} />
      )}
    </TouchableOpacity>
  );
}

function CartButton({ p, count, size, badge, onPress }: { p: TophuntPalette; count: number; size: number; badge: number; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={count ? `Cart, ${count} items` : 'Cart, empty'}>
      <Ionicons name="cart-outline" size={size} color={p.text} />
      {count > 0 ? (
        <View style={[styles.badge, { minWidth: badge, height: badge, borderRadius: badge / 2, top: -badge * 0.4, right: -badge * 0.45 }]}>
          <Text style={[styles.badgeText, { fontSize: Math.max(7.5, badge * 0.62) }]}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function Tagline({ p, fontSize, laurelW, laurelH, gap }: { p: TophuntPalette; fontSize: number; laurelW: number; laurelH: number; gap: number }) {
  return (
    <View style={[styles.row, { justifyContent: 'center', gap }]}>
      <Laurel width={laurelW} height={laurelH} color={BRAND} />
      <Text style={[styles.tagline, { fontSize, color: p.sub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        Collect • Customize • Upgrade • Stand Out
      </Text>
      <Laurel width={laurelW} height={laurelH} flip color={BRAND} />
    </View>
  );
}

/**
 * Top of the Shop on wide screens (desktop mock, scaled by u): the app's own
 * logo (same as Home), the DP coin and Diamond pills (tap → wallet), cart
 * with its count and orders; under it the tagline between laurels.
 */
export function ShopHeader({ p, u, inner, live, dpcoin, diamonds, cartCount, onOrders, onCart, onWallet }: HeaderProps) {
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
        <BalancePill p={p} kind="dp" value={dpcoin} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(8, u)} gap={px(5, u)} minWidth={px(H.dpW, u)} border={border} skeletonW={px(60, u)} onPress={onWallet} />
        <BalancePill p={p} kind="diamond" value={diamonds} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(8, u)} gap={px(5, u)} minWidth={px(H.diaW, u)} border={border} skeletonW={px(44, u)} onPress={onWallet} />
        <CartButton p={p} count={cartCount} size={Math.max(16, px(H.cart, u))} badge={Math.max(px(H.badge, u), 11)} onPress={onCart} />
        <TouchableOpacity
          onPress={onOrders}
          hitSlop={10}
          style={[styles.orders, { width: Math.max(18, px(H.orders, u)), height: Math.max(18, px(H.orders, u)), borderRadius: px(8, u), backgroundColor: p.card, borderColor: p.border }]}
          accessibilityRole="button"
          accessibilityLabel="My orders"
        >
          <Ionicons name="receipt-outline" size={Math.max(12, px(17, u))} color={p.text} />
        </TouchableOpacity>
      </View>
      <View style={{ marginTop: px(T.y - H.y - H.h, u), height: px(T.h, u), justifyContent: 'center' }}>
        <Tagline p={p} fontSize={font(T.tagline, u)} laurelW={px(9, u)} laurelH={px(18, u)} gap={px(4, u)} />
      </View>
    </View>
  );
}

/** Dark navy balance pill of the phone header (both modes): currency icon, white bold amount, "—" until the server answers. */
function NavyPill({ kind, value, live, height, fontSize, icon, padX, gap, onPress }: { kind: 'dp' | 'diamond'; value: number; live: boolean; height: number; fontSize: number; icon: number; padX: number; gap: number; onPress: () => void }) {
  const dp = kind === 'dp';
  const label = dp ? 'DP coin' : 'Diamonds';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
      accessibilityRole="button"
      accessibilityLabel={live ? `${value.toLocaleString()} ${label}. Wallet kholo` : `${label} balance load ho raha hai. Wallet kholo`}
      style={[styles.pill, styles.navy, { height, borderRadius: height / 2, paddingHorizontal: padX, gap }]}
    >
      {dp ? <CoinIcon size={icon} /> : <DiamondIcon size={icon} />}
      <Text style={[styles.pillText, { fontSize, color: TH.colors.white }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {live ? `${value.toLocaleString()}${dp ? ' DP' : ''}` : '—'}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Phone header (design mock, scaled by u = width / 340): the app's own logo
 * (same as Home), the dark navy DP coin and Diamond pills (tap → wallet) and
 * the cart with its pink count badge; under it the title block: pink bag icon,
 * the title ("Shop" by default), the tagline with a violet laurel sprig, and
 * the decorative 3D bag (with cyan diamond sparkles for accent 'digital') on
 * the right (not touchable, drawn under the header row). Orders are reached
 * from the Orders card further down the page.
 */
export function ShopHeaderMobile({
  p, u, inner, live, dpcoin, diamonds, cartCount, onCart, onWallet,
  title = 'Shop', subtitle = 'Collect • Customize • Upgrade', accent = 'shop',
}: HeaderProps & {
  /** Title block text (the Digital tab shows "Digital Shop / Exclusive • Premium • Upgrade"). */
  title?: string;
  subtitle?: string;
  /** Art on the right: the 3D bag ('shop'), or the bag with cyan diamond sparkles ('digital'). */
  accent?: 'shop' | 'digital';
}) {
  const H = MOCK_M.header;
  const T = MOCK_M.title;
  const pillH = px(H.pillH, u);
  const pillFs = mfont(H.pillText, u);
  const pillIcon = px(H.pillIcon, u);
  const rowH = px(H.h - H.rowTop, u);
  const art = px(T.art, u);
  const titleFs = mfont(T.size, u);
  const tagFs = mfont(T.tagline, u);
  return (
    <View style={{ width: inner }}>
      <View style={[styles.abs, { right: -px(6, u), top: px(T.artTop, u), width: art, height: art }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShopBagArt size={art} />
        {accent === 'digital' ? (
          <>
            <View style={[styles.abs, { left: art * 0.02, top: art * 0.5 }]}><DiamondSparkle size={art * 0.17} /></View>
            <View style={[styles.abs, { right: art * 0.0, top: art * 0.02 }]}><DiamondSparkle size={art * 0.14} /></View>
            <View style={[styles.abs, { right: art * 0.04, top: art * 0.78 }]}><DiamondSparkle size={art * 0.12} /></View>
          </>
        ) : null}
      </View>
      <View style={[styles.row, { marginTop: px(H.rowTop, u), height: rowH, gap: px(H.gap, u) }]}>
        <BrandLogo maxWidth={inner * 0.3} maxHeight={rowH + px(6, u)} />
        <View style={{ flex: 1 }} />
        <NavyPill kind="dp" value={dpcoin} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(7, u)} gap={px(4, u)} onPress={onWallet} />
        <NavyPill kind="diamond" value={diamonds} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(7, u)} gap={px(4, u)} onPress={onWallet} />
        <View style={{ marginLeft: px(2, u) }}>
          <CartButton p={p} count={cartCount} size={px(H.cart, u)} badge={px(H.badge, u)} onPress={onCart} />
        </View>
      </View>
      <View style={[styles.row, { marginTop: px(T.y - H.h, u), height: px(T.h, u), gap: px(8, u), paddingRight: art * 0.8 }]}>
        <PinkBagIcon size={px(T.bag, u)} outline />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { fontSize: titleFs, lineHeight: titleFs * 1.15, color: p.text }]} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
          <View style={[styles.row, { gap: px(3, u) }]}>
            <Text style={[styles.tagline, { fontSize: tagFs, color: p.sub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {subtitle}
            </Text>
            <LaurelSprig width={px(T.laurel * 0.5, u)} height={px(T.laurel, u)} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  badge: { position: 'absolute', backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  badgeText: { color: '#FFF', fontFamily: TH.fonts.bold },
  orders: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tagline: { fontFamily: TH.fonts.semibold, flexShrink: 1 },
  abs: { position: 'absolute' },
  navy: { backgroundColor: SHOP_NAVY, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { fontFamily: TH.fonts.bold },
});
