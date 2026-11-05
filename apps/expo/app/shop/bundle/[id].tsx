import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { BottomNav } from '@/src/components/home/BottomNav';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { ProductPreview } from '@/src/components/shop/premium/ProductPreview';
import { BundleArt, BundleBadge, bundlePreviewItem } from '@/src/components/shop/premium/ShopBundles';
import { SparkleField } from '@/src/components/shop/premium/ShopArt';
import { EmptyState, ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useAuthGate } from '@/src/hooks/useAuthGate';
import { useBundlePurchase } from '@/src/hooks/useBundlePurchase';
import { useCountdown } from '@/src/hooks/useCountdown';
import { useMinuteNow } from '@/src/hooks/useMinuteNow';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { ENDED } from '@/src/lib/countdown';
import {
  TYPE_SINGULAR,
  bundleDiscount,
  bundleItemsLine,
  bundleOwnedNote,
  bundleState,
  bundleStockLabel,
  type BundleState,
} from '@/src/lib/shopModel';
import { useMonetizationConfig, useShopCollections, type PublicShopBundle } from '@/src/services/monetization';
import { BRAND, BRAND_BUTTON, SHOP_BUNDLE_GRAD, TH, rarityToken, useTophuntPalette, type TophuntPalette } from '@/src/theme/tophunt';

/**
 * One Diamond bundle (`/shop/bundle/:id`): art, name, badge, description, the
 * items inside (owned ones marked), the real schedule / stock (only when the
 * server sent them), the Diamond price (and compare-at), the user's Diamond
 * balance and the buy button. Buying goes through BundleConfirmSheet
 * (useBundlePurchase); the server stays authoritative for price, stock,
 * ownership and balance.
 */
export default function ShopBundleScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const cfg = useMonetizationConfig();
  const enabled = !!user && cfg.store.enabled;
  const cols = useShopCollections(enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { onBuy, buying, dialog } = useBundlePurchase({
    onBought: () => {
      void refetchMe();
      void cols.refetch();
    },
    onStale: () => void cols.refetch(),
  });
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 720);
  const pad = contentW >= 600 ? 24 : 16;
  const now = useMinuteNow();

  const bundle = cols.data?.bundles.find((b) => b.id === String(id ?? ''));
  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const backToShop = () => router.replace('/shop' as any);

  let body: React.ReactNode;
  if (!user) {
    body = <EmptyState p={p} icon="gift" title="Sign in karo" text="Bundles dekhne aur kharidne ke liye sign in karo." action={{ label: 'Sign in', onPress: () => void requireAuth('wallet') }} />;
  } else if (!cfg.store.enabled) {
    body = <EmptyState p={p} icon="gift" title="Store abhi band hai" text="Bundles jaldi wapas aayenge." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (cols.isLoading) {
    body = (
      <View style={{ gap: 12 }} accessible accessibilityLabel="Bundle load ho raha hai">
        <View style={{ height: 200, borderRadius: TH.radii.xl, backgroundColor: p.skeleton }} />
        <Skeleton width="60%" height={22} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="100%" height={64} borderRadius={TH.radii.md} />
      </View>
    );
  } else if (cols.isError) {
    body = <ErrorState p={p} text="Bundle load nahi hua." onRetry={() => void cols.refetch()} />;
  } else if (!bundle) {
    body = <EmptyState p={p} icon="search" title="Bundle available nahi hai" text="Ye bundle ab sale par nahi hai ya link galat hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else {
    const state = bundleState(bundle, { live, diamonds: bal.diamonds, signedIn: !!user, now });
    body = (
      <BundleDetail
        bundle={bundle}
        p={p}
        viewer={viewer}
        width={contentW - pad * 2}
        live={live}
        diamonds={bal.diamonds}
        state={state}
        busy={buying === bundle.id}
        onBuy={() => onBuy(bundle)}
        onEarn={() => router.push('/earn' as any)}
        onEquip={() => router.push('/shop/collection' as any)}
        onSignIn={() => void requireAuth('wallet')}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.bar, { width: contentW, paddingHorizontal: pad }]}>
          <BackButton size={22} color={p.text} style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
          <Text style={[styles.barTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>{bundle?.name ?? 'Bundle'}</Text>
          {user ? (
            <View style={[styles.balPill, { backgroundColor: p.card, borderColor: p.border }]} accessible accessibilityLabel={live ? `${bal.diamonds} Diamond` : 'Diamond balance load ho raha hai'}>
              <DiamondIcon size={20} />
              {live ? <Text style={[styles.balText, { color: p.text }]}>{bal.diamonds.toLocaleString()}</Text> : <Skeleton width={30} height={12} borderRadius={6} />}
            </View>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: pad, paddingTop: 6, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={cols.isRefetching} onRefresh={() => { void cols.refetch(); void refetchMe(); }} tintColor={BRAND} />}
        >
          {body}
        </ScrollView>
        <BottomNav backgroundColor={p.bg} isDark={p.isDark} />
        {dialog}
      </SafeAreaView>
    </View>
  );
}

function BundleDetail({
  bundle, p, viewer, width, live, diamonds, state, busy, onBuy, onEarn, onEquip, onSignIn,
}: {
  bundle: PublicShopBundle; p: TophuntPalette; viewer: Viewer; width: number; live: boolean; diamonds: number; state: BundleState; busy: boolean;
  onBuy: () => void; onEarn: () => void; onEquip: () => void; onSignIn: () => void;
}) {
  const ends = useCountdown(bundle.endsAt);
  const endsLabel = ends.label && ends.label !== ENDED ? `Ends in ${ends.label}` : null;
  const stock = bundleStockLabel(bundle.remaining);
  const pct = bundleDiscount(bundle);
  const note = bundleOwnedNote(bundle);
  const artH = Math.min(220, Math.round(width * 0.5));
  const artW = Math.min(width - 32, Math.round(artH * 1.5));
  const owned = bundle.purchased;

  return (
    <View style={{ gap: 16 }}>
      <LinearGradient colors={SHOP_BUNDLE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { height: artH + 24 }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><SparkleField width={width} height={artH + 24} /></View>
        <View style={{ width: artW, height: artH, borderRadius: 14, overflow: 'hidden' }}>
          <BundleArt bundle={bundle} viewer={viewer} width={artW} height={artH} radius={14} />
        </View>
        {bundle.badge ? <BundleBadge label={bundle.badge} u={1.4} style={{ position: 'absolute', top: 12, left: 12 }} /> : null}
      </LinearGradient>

      <View style={{ gap: 6 }}>
        <Text style={[styles.name, { color: p.text }]} accessibilityRole="header">{bundle.name}</Text>
        <Text style={[styles.sub, { color: p.sub }]}>{bundleItemsLine(bundle.items)}</Text>
        {bundle.description ? <Text style={[styles.desc, { color: p.text }]}>{bundle.description}</Text> : null}
      </View>

      {!owned && (endsLabel || stock) ? (
        <View style={styles.chips}>
          {endsLabel ? (
            <View style={[styles.chip, { backgroundColor: `${BRAND}1A`, borderColor: `${BRAND}55` }]} accessible accessibilityLabel={endsLabel}>
              <Text style={[styles.chipText, { color: ends.urgent ? TH.colors.danger : BRAND }]}>{endsLabel}</Text>
            </View>
          ) : null}
          {stock ? (
            <View style={[styles.chip, { backgroundColor: p.cardAlt, borderColor: p.border }]}>
              <Text style={[styles.chipText, { color: p.text }]}>{stock}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.priceCard, { backgroundColor: p.card, borderColor: p.border }]}>
        <View style={styles.priceRow} accessible accessibilityLabel={`Price ${bundle.priceDiamonds} Diamond${bundle.compareAtDiamonds ? `, pehle ${bundle.compareAtDiamonds}` : ''}${pct ? `, ${pct}% off` : ''}`}>
          <DiamondIcon size={34} />
          <Text style={[styles.price, { color: p.text }]}>{bundle.priceDiamonds.toLocaleString()}</Text>
          {bundle.compareAtDiamonds ? <Text style={[styles.was, { color: p.sub }]}>{bundle.compareAtDiamonds.toLocaleString()}</Text> : null}
          {pct ? (
            <View style={[styles.off, { backgroundColor: BRAND }]}><Text style={styles.offText}>-{pct}%</Text></View>
          ) : null}
        </View>
        <View style={styles.balRow}>
          <Text style={[styles.balLabel, { color: p.sub }]}>Aapke Diamonds</Text>
          <View style={styles.balValue}>
            <DiamondIcon size={19} />
            {live ? <Text style={[styles.balText, { color: p.text }]}>{diamonds.toLocaleString()}</Text> : <Skeleton width={36} height={12} borderRadius={6} />}
          </View>
        </View>
        {note && !owned ? <Text style={[styles.note, { color: p.sub }]}>{note}</Text> : null}
        {state === 'short' ? (
          <Text style={[styles.note, { color: TH.colors.danger }]}>{`${(bundle.priceDiamonds - diamonds).toLocaleString()} Diamond aur chahiye.`}</Text>
        ) : null}
        <BuyButton p={p} state={state} price={bundle.priceDiamonds} busy={busy} onBuy={onBuy} onEarn={onEarn} onEquip={onEquip} onSignIn={onSignIn} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={[styles.section, { color: p.text }]}>Bundle mein kya hai</Text>
        {bundle.items.map((i) => {
          const t = rarityToken(i.rarity);
          const type = TYPE_SINGULAR[i.type] ?? i.type;
          return (
            <View key={i.itemId} style={[styles.itemRow, { backgroundColor: p.card, borderColor: p.border }]} accessible accessibilityLabel={`${i.name}, ${t.label} ${type}${i.owned ? ', owned' : ''}`}>
              <ProductPreview item={bundlePreviewItem(i)} viewer={viewer} width={56} height={56} radius={TH.radii.md} shimmer={false} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.itemName, { color: p.text }]} numberOfLines={1}>{i.name}</Text>
                <Text style={[styles.itemType, { color: p.sub }]} numberOfLines={1}>
                  {type} · <Text style={{ color: t.color, fontFamily: TH.fonts.bold }}>{t.label}</Text>
                </Text>
              </View>
              {i.owned ? (
                <View style={[styles.ownedTag, { backgroundColor: `${TH.colors.success}1F` }]}>
                  <Text style={[styles.ownedText, { color: TH.colors.success }]}>Owned</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Brand pink "Buy for ◆ N", or the disabled / redirect state the bundle is in. */
function BuyButton({
  p, state, price, busy, onBuy, onEarn, onEquip, onSignIn,
}: { p: TophuntPalette; state: BundleState; price: number; busy: boolean; onBuy: () => void; onEarn: () => void; onEquip: () => void; onSignIn: () => void }) {
  if (state === 'owned' || state === 'all_owned' || state === 'unavailable') {
    const label = state === 'owned' ? 'Owned' : state === 'all_owned' ? 'Sab items aapke paas hain' : 'Abhi available nahi';
    return (
      <View style={{ gap: 8 }}>
        <View style={[styles.buy, styles.disabled, { backgroundColor: p.cardAlt, borderColor: p.border }]} accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={label}>
          <Text style={[styles.buyText, { color: state === 'unavailable' ? p.sub : TH.colors.success }]}>{label}</Text>
        </View>
        {state !== 'unavailable' ? (
          <TouchableOpacity onPress={onEquip} style={[styles.secondary, { borderColor: p.border }]} accessibilityRole="button" accessibilityLabel="Equip karo: My Collection kholo">
            <Text style={[styles.secondaryText, { color: p.text }]}>Equip karo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  const action = state === 'short' ? onEarn : state === 'signin' ? onSignIn : onBuy;
  const a11y = state === 'short' ? 'Diamond kamao' : state === 'signin' ? 'Sign in karke kharido' : `Buy for ${price} Diamond`;
  return (
    <TouchableOpacity onPress={action} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} accessibilityLabel={busy ? 'Purchase ho raha hai' : a11y}>
      <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.buy, busy && { opacity: 0.75 }]}>
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : state === 'buy' ? (
          <>
            <Text style={styles.buyTextLight}>Buy for</Text>
            <DiamondIcon size={22} />
            <Text style={styles.buyTextLight}>{price.toLocaleString()}</Text>
          </>
        ) : (
          <Text style={styles.buyTextLight}>{state === 'short' ? 'Diamond kamao' : 'Sign in karke kharido'}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingTop: 6, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 18 },
  balPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 10 },
  balText: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  hero: { borderRadius: TH.radii.xl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontFamily: TH.fonts.bold, fontSize: 22 },
  sub: { fontFamily: TH.fonts.medium, fontSize: 13 },
  desc: { fontFamily: TH.fonts.medium, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: TH.fonts.bold, fontSize: 12 },
  priceCard: { borderRadius: TH.radii.lg, borderWidth: 1, padding: 14, gap: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontFamily: TH.fonts.bold, fontSize: 26 },
  was: { fontFamily: TH.fonts.medium, fontSize: 15, textDecorationLine: 'line-through' },
  off: { borderRadius: TH.radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  offText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 11.5 },
  balRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balLabel: { fontFamily: TH.fonts.medium, fontSize: 13 },
  balValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  note: { fontFamily: TH.fonts.medium, fontSize: 12.5, lineHeight: 17 },
  buy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: TH.radii.md },
  disabled: { borderWidth: 1 },
  buyText: { fontFamily: TH.fonts.bold, fontSize: 15 },
  buyTextLight: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 15 },
  secondary: { height: 46, borderRadius: TH.radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  section: { fontFamily: TH.fonts.bold, fontSize: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: TH.radii.lg, borderWidth: 1, padding: 8 },
  itemName: { fontFamily: TH.fonts.bold, fontSize: 14 },
  itemType: { fontFamily: TH.fonts.medium, fontSize: 12 },
  ownedTag: { borderRadius: TH.radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  ownedText: { fontFamily: TH.fonts.bold, fontSize: 11.5 },
});
