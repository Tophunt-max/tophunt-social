import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Ionicons } from '@/src/lib/icons';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { ProductPreview } from '@/src/components/shop/premium/ProductPreview';
import { RarityBadge } from '@/src/components/shop/premium/RarityBadge';
import { WishlistHeart } from '@/src/components/shop/premium/WishlistHeart';
import { EmptyState, ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useCoinRate } from '@/src/hooks/useCoinRate';
import { useCountdown } from '@/src/hooks/useCountdown';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { coinsInInr } from '@/src/lib/coinValue';
import { EQUIP_WHERE, TYPE_SINGULAR, hasRealStock, isShort } from '@/src/lib/shopModel';
import { useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';
import { TH, rarityToken, useTophuntPalette, type TophuntPalette } from '@/src/theme/tophunt';

/**
 * One digital item: a large live preview on the viewer's own avatar / name,
 * what it is, its price, whether they own it, and real availability (stock
 * left / sale end, only when the listing has them). Data comes from the
 * getStore cache; an item that is not on sale shows "Item available nahi hai".
 */
export default function ShopItemScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const store = useStore(!!user && cfg.store.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 1100);
  const pad = contentW >= 700 ? 24 : 16;
  const wide = contentW >= 900;

  const item = store.data?.find((i) => i.itemId === String(id ?? ''));
  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const backToShop = () => router.replace('/shop' as any);

  let body: React.ReactNode;
  if (!cfg.store.enabled) {
    body = <EmptyState p={p} icon="sparkles" title="Store abhi band hai" text="Digital items jaldi wapas aayenge." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (store.isLoading) {
    body = <DetailSkeleton wide={wide} contentW={contentW - pad * 2} />;
  } else if (store.isError) {
    body = <ErrorState p={p} text="Item load nahi hua." onRetry={() => void store.refetch()} />;
  } else if (!item) {
    body = <EmptyState p={p} icon="search" title="Item available nahi hai" text="Ye item ab sale par nahi hai ya link galat hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else {
    body = (
      <ItemDetail
        item={item}
        p={p}
        viewer={viewer}
        wide={wide}
        contentW={contentW - pad * 2}
        live={live}
        dpcoin={bal.dpcoin}
        busy={buying === item.itemId}
        onBuy={() => void onBuy(item)}
        onEquip={() => router.push('/rewards/inventory' as any)}
        onEarn={() => router.push('/explore/battles' as any)}
      />
    );
  }

  return (
    <LinearGradient colors={p.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.container}>
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.bar, { width: contentW, paddingHorizontal: pad }]}>
        <BackButton size={22} color={p.text} style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
        <Text style={[styles.barTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>{item?.name ?? 'Item details'}</Text>
        {item ? (
          <WishlistHeart itemId={item.itemId} name={item.name} size={18} color={p.text} bubble={false} style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
        ) : null}
        <View style={[styles.coinPill, { backgroundColor: p.card, borderColor: p.border }]} accessible accessibilityLabel={live ? `${bal.dpcoin} DP coin` : 'DP coin balance load ho raha hai'}>
          <CoinIcon size={15} />
          {live ? <Text style={[styles.coinText, { color: p.text }]}>{bal.dpcoin.toLocaleString()}</Text> : <Skeleton width={30} height={12} borderRadius={6} />}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: pad, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={store.isRefetching} onRefresh={() => { void store.refetch(); void refetchMe(); }} tintColor={TH.colors.primary} />}
      >
        {body}
      </ScrollView>
      {dialog}
    </SafeAreaView>
    </LinearGradient>
  );
}

function ItemDetail({
  item, p, viewer, wide, contentW, live, dpcoin, busy, onBuy, onEquip, onEarn,
}: {
  item: StoreItemView; p: TophuntPalette; viewer: Viewer; wide: boolean; contentW: number; live: boolean; dpcoin: number; busy: boolean;
  onBuy: () => void; onEquip: () => void; onEarn: () => void;
}) {
  const rate = useCoinRate();
  const t = rarityToken(item.rarity);
  const sale = useCountdown(item.endsAt);
  const short = isShort(dpcoin, item.priceCoins, live);
  const saleOver = sale.ended;
  const previewW = wide ? Math.min(460, Math.round(contentW * 0.48)) : contentW;
  const previewH = wide ? previewW : Math.round(Math.min(contentW * 0.9, 380));
  const inr = coinsInInr(item.priceCoins, rate);

  const info = (
    <View style={{ flex: 1, minWidth: 0, gap: 14 }}>
      <View style={styles.badges}>
        <RarityBadge rarity={item.rarity} size="md" />
        <View style={[styles.typePill, { backgroundColor: p.cardAlt }]}>
          <Text style={[styles.typeText, { color: p.sub }]}>{TYPE_SINGULAR[item.type] ?? item.type}</Text>
        </View>
      </View>
      <Text style={[styles.name, { color: p.text }]}>{item.name}</Text>
      {item.description ? <Text style={[styles.desc, { color: p.sub }]}>{item.description}</Text> : null}

      <View style={[styles.priceCard, { backgroundColor: p.card, borderColor: t.glow ? `${t.color}66` : p.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: p.sub }]}>{item.owned ? 'Aapke collection mein' : 'Price'}</Text>
          {item.owned ? (
            <View style={styles.row}>
              <Ionicons name="checkmark-circle" size={20} color={TH.colors.success} />
              <Text style={[styles.price, { color: TH.colors.success, fontSize: 20 }]}>Owned</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <CoinIcon size={22} />
              <Text style={[styles.price, { color: p.text }]}>{item.priceCoins.toLocaleString()}</Text>
              <Text style={[styles.unit, { color: p.sub }]}>DP coin</Text>
            </View>
          )}
          {!item.owned && inr ? <Text style={[styles.inr, { color: p.sub }]}>{inr}</Text> : null}
        </View>
      </View>

      {!item.owned && (hasRealStock(item) || (sale.label && !saleOver)) ? (
        <View style={styles.availability}>
          {hasRealStock(item) ? (
            <View style={[styles.availChip, { backgroundColor: p.cardAlt }]}>
              <Ionicons name="cube-outline" size={13} color={p.text} />
              <Text style={[styles.availText, { color: p.text }]}>{item.remaining} stock baaki</Text>
            </View>
          ) : null}
          {sale.label && !saleOver ? (
            <View style={[styles.availChip, { backgroundColor: `${TH.colors.pink}22` }]} accessibilityLabel={`Sale ${sale.label} mein khatam`}>
              <Ionicons name="time" size={13} color={TH.colors.pink} />
              <Text style={[styles.availText, { color: TH.colors.pink }]}>Sale {sale.label} mein khatam</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.facts, { backgroundColor: p.card, borderColor: p.border }]}>
        <Fact p={p} icon="sparkles" title="Equip kahan hoga" text={EQUIP_WHERE[item.type] ?? 'Aapke profile par.'} />
        <Fact p={p} icon="infinite" title="Ownership" text="Hamesha ke liye aapka. Kabhi bhi equip ya hata sakte ho." />
        <Fact p={p} icon="shield-checkmark-outline" title="Refund" text={item.refundable ? 'Refund support se request kar sakte ho.' : 'Ye item refundable nahi hai.'} />
        <Fact p={p} icon="information-circle-outline" title="Sirf look" text="Cosmetic hai: votes, fees, prizes ya ranking par koi asar nahi." last />
      </View>

      <View style={{ gap: 10 }}>
        {item.owned ? (
          <PrimaryButton label="Equip karo" icon="sparkles" onPress={onEquip} />
        ) : saleOver ? (
          <PrimaryButton label="Sale khatam ho gayi" icon="time" disabled />
        ) : short ? (
          <>
            <PrimaryButton label="DP coin kam hai" icon="lock-closed" disabled hint={`${(item.priceCoins - dpcoin).toLocaleString()} DP coin aur chahiye`} />
            <TouchableOpacity onPress={onEarn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Kamao: contest jeet kar DP coin kamao">
              <LinearGradient colors={TH.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                <Ionicons name="trophy" size={16} color="#2A1A00" />
                <Text style={[styles.btnText, { color: '#2A1A00' }]}>Kamao</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <PrimaryButton label={`Abhi kharido · ${item.priceCoins.toLocaleString()}`} icon="flash" onPress={onBuy} busy={busy} />
        )}
      </View>
    </View>
  );

  return (
    <View style={[wide ? styles.wide : styles.narrow, { marginTop: 12 }]}>
      <View>
        <ProductPreview item={item} viewer={viewer} width={previewW} height={previewH} radius={TH.radii.xxl} />
        <Text style={[styles.previewNote, { color: p.sub, width: previewW }]}>Live preview: aapki DP aur naam par aise dikhega</Text>
      </View>
      {info}
    </View>
  );
}

function Fact({ p, icon, title, text, last }: { p: TophuntPalette; icon: string; title: string; text: string; last?: boolean }) {
  return (
    <View style={[styles.fact, !last && { borderBottomWidth: 1, borderBottomColor: p.border }]}>
      <View style={[styles.factIcon, { backgroundColor: p.cardAlt }]}>
        <Ionicons name={icon} size={15} color={p.isDark ? TH.colors.diamond : TH.colors.royal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.factTitle, { color: p.text }]}>{title}</Text>
        <Text style={[styles.factText, { color: p.sub }]}>{text}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, disabled, busy, hint }: { label: string; icon: string; onPress?: () => void; disabled?: boolean; busy?: boolean; hint?: string }) {
  const off = disabled || busy;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
    >
      <LinearGradient
        colors={disabled ? ['#4B4B6B', '#4B4B6B'] : [TH.colors.royal, TH.colors.primary, TH.colors.electric]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.btn, busy && { opacity: 0.7 }]}
      >
        <Ionicons name={icon} size={16} color="#FFF" />
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.btnText}>{label}</Text>
          {hint ? <Text style={styles.btnHint}>{hint}</Text> : null}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function DetailSkeleton({ wide, contentW }: { wide: boolean; contentW: number }) {
  const w = wide ? Math.min(460, Math.round(contentW * 0.48)) : contentW;
  return (
    <View style={[wide ? styles.wide : styles.narrow, { marginTop: 12 }]} accessible accessibilityLabel="Item load ho raha hai">
      <Skeleton width={w} height={wide ? w : Math.round(Math.min(contentW * 0.9, 380))} borderRadius={TH.radii.xxl} />
      <View style={{ flex: 1, gap: 12 }}>
        <Skeleton width={120} height={22} borderRadius={11} />
        <Skeleton width="70%" height={28} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="100%" height={84} borderRadius={TH.radii.lg} />
        <Skeleton width="100%" height={52} borderRadius={TH.radii.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingTop: 6, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 18 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 10 },
  coinText: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  wide: { flexDirection: 'row', gap: 28, alignItems: 'flex-start' },
  narrow: { gap: 18 },
  previewNote: { fontFamily: TH.fonts.medium, fontSize: 11.5, textAlign: 'center', marginTop: 8 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typePill: { borderRadius: TH.radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  typeText: { fontFamily: TH.fonts.bold, fontSize: 11 },
  name: { fontFamily: TH.fonts.bold, fontSize: 28, lineHeight: 32 },
  desc: { fontFamily: TH.fonts.medium, fontSize: 14, lineHeight: 20 },
  priceCard: { flexDirection: 'row', alignItems: 'center', borderRadius: TH.radii.lg, borderWidth: 1, padding: 14 },
  label: { fontFamily: TH.fonts.semibold, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  price: { fontFamily: TH.fonts.bold, fontSize: 28 },
  unit: { fontFamily: TH.fonts.semibold, fontSize: 13, marginTop: 6 },
  inr: { fontFamily: TH.fonts.medium, fontSize: 12, marginTop: 2 },
  availability: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  availChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: TH.radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
  availText: { fontFamily: TH.fonts.bold, fontSize: 12 },
  facts: { borderRadius: TH.radii.lg, borderWidth: 1, paddingHorizontal: 12 },
  fact: { flexDirection: 'row', gap: 10, paddingVertical: 11, alignItems: 'flex-start' },
  factIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  factTitle: { fontFamily: TH.fonts.bold, fontSize: 13 },
  factText: { fontFamily: TH.fonts.medium, fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: TH.radii.md, paddingVertical: 8 },
  btnText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 15 },
  btnHint: { color: 'rgba(255,255,255,0.75)', fontFamily: TH.fonts.medium, fontSize: 11 },
});
