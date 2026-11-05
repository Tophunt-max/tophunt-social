import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { EmptyState, ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { WishlistHeart } from '@/src/components/shop/premium/WishlistHeart';
import { mobileScale } from '@/src/components/shop/premium/mock';
import { ItemBuyBar, type BuyBarActions } from '@/src/components/shop/item/ItemBuyBar';
import { ItemDetailsAccordion } from '@/src/components/shop/item/ItemDetailsAccordion';
import { ItemHero } from '@/src/components/shop/item/ItemHero';
import { ItemAvailability, ItemPriceCard, ItemTitleBlock } from '@/src/components/shop/item/ItemInfo';
import { BundlesRail, CollectionsRail, SimilarRail } from '@/src/components/shop/item/ItemRails';
import { ItemSkeleton } from '@/src/components/shop/item/ItemSkeleton';
import { useAuth } from '@/src/hooks/useAuth';
import { useAuthGate } from '@/src/hooks/useAuthGate';
import { useCountdown } from '@/src/hooks/useCountdown';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { Ionicons } from '@/src/lib/icons';
import { appShareOrigin, shareBattleLink } from '@/src/lib/share';
import {
  bundlesWithItem,
  buyBarState,
  collectionsWithItem,
  equipSlotFor,
  heroTag,
  isEquipped,
  itemShareCaption,
  itemShareUrl,
  similarItems,
} from '@/src/lib/shopItemModel';
import { emitToast } from '@/src/lib/toastBridge';
import { useEquipCosmetic, useInventory } from '@/src/services/gamification';
import { useMonetizationConfig, useShopCollections, useStore, type StoreItemView } from '@/src/services/monetization';
import { BRAND, TH, useTophuntPalette } from '@/src/theme/tophunt';

/** Phone column; wider screens centre it. */
const MAX_W = 640;
const PAD = 16;

/**
 * One digital item (`/shop/item/[id]`): a large live preview on the viewer's
 * own avatar / name in each place the item shows (profile, post, comment,
 * battle), name / type / rarity, the price card with the real DP coin
 * balance, real availability, bundles and collections that include it,
 * similar items, collapsible details, and a sticky buy / equip bar.
 *
 * Data: getStore (the listing), getShopCollections (bundles + collections),
 * getInventory (equipped state), the profile (balance, avatar, name). Nothing
 * is invented: no ratings, reviews, views or sold counts.
 */
export default function ShopItemScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = String(rawId ?? '');
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const cfg = useMonetizationConfig();
  const signedIn = !!user;
  const enabled = signedIn && cfg.store.enabled;
  const store = useStore(enabled);
  const shopCols = useShopCollections(enabled);
  const inventory = useInventory(enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });
  const equip = useEquipCosmetic();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, MAX_W);
  const inner = contentW - PAD * 2;
  const u = Math.min(mobileScale(contentW), 1.3);

  const item = store.data?.find((i) => i.itemId === id);
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const avatarUri: string | null = (me as any)?.profileImageUrl ?? user?.photoURL ?? null;
  const viewerName: string | null = (me as any)?.fullName ?? user?.displayName ?? null;
  const viewer: Viewer = useMemo(() => ({ avatarUri, name: viewerName }), [avatarUri, viewerName]);

  // `now` for sale windows; re-read when the sale ends / starts so the bar flips on time.
  const [now, setNow] = useState(() => Date.now());
  const endCd = useCountdown(item?.endsAt ?? null);
  const startCd = useCountdown(item?.startsAt ?? null);
  useEffect(() => setNow(Date.now()), [endCd.ended, startCd.ended, id]);

  const storeItems = store.data;
  const bundles = useMemo(() => bundlesWithItem(shopCols.data?.bundles, id, now), [shopCols.data?.bundles, id, now]);
  const collections = useMemo(() => collectionsWithItem(shopCols.data?.collections, id), [shopCols.data?.collections, id]);
  const similar = useMemo(() => (item ? similarItems(item, storeItems ?? []) : []), [item, storeItems]);
  const tag = useMemo(() => (item ? heroTag(item, storeItems ?? [], now) : null), [item, storeItems, now]);
  const equipped = item ? isEquipped(inventory.data as any, item) : false;
  const barState = item ? buyBarState(item, { signedIn, live, dpcoin: bal.dpcoin, now, equipped }) : null;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setNow(Date.now());
    try {
      await Promise.allSettled([store.refetch(), refetchMe(), shopCols.refetch(), inventory.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [store, refetchMe, shopCols, inventory]);

  const [barH, setBarH] = useState(84);
  const backToShop = useCallback(() => router.replace('/shop' as any), [router]);
  const openBundle = useCallback((bid: string) => router.push(`/shop/bundle/${encodeURIComponent(bid)}` as any), [router]);
  const openCollection = useCallback((cid: string) => router.push(`/shop/collections/${encodeURIComponent(cid)}` as any), [router]);
  const openItem = useCallback((iid: string) => router.push(`/shop/item/${encodeURIComponent(iid)}` as any), [router]);
  const buyOther = useCallback((i: StoreItemView) => void onBuy(i), [onBuy]);

  const shareUrl = item ? itemShareUrl(appShareOrigin(), item.itemId) : null;
  const onShare = useCallback(async () => {
    if (!item || !shareUrl) return;
    const outcome = await shareBattleLink({ caption: itemShareCaption(item.name, shareUrl), url: shareUrl });
    if (outcome === 'copied_link') emitToast('Link copy ho gaya', 'success');
    else if (outcome === 'failed') emitToast('Share nahi hua. Dobara try karo.', 'error');
  }, [item, shareUrl]);

  const setEquipped = useCallback(
    (on: boolean) => {
      if (!item || equip.isPending) return;
      const slot = equipSlotFor(item.type);
      if (!slot) return;
      equip.mutate(
        { slot, itemId: on ? item.itemId : null },
        {
          onSuccess: () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            emitToast(on ? 'Equip ho gaya!' : 'Hata diya', 'success');
          },
          onError: (e: any) => emitToast(typeof e?.message === 'string' && e.message ? e.message : 'Abhi nahi hua. Dobara try karo.', 'error'),
        },
      );
    },
    [item, equip],
  );

  const actions: BuyBarActions = useMemo(
    () => ({
      onBuy: () => item && void onBuy(item),
      onEarn: () => router.push('/explore/battles' as any),
      onEquip: () => setEquipped(true),
      onUnequip: () => setEquipped(false),
      onCollection: () => router.push('/shop/collection' as any),
      onSignIn: () => void requireAuth('wallet'),
    }),
    [item, onBuy, router, setEquipped, requireAuth],
  );

  let body: React.ReactNode;
  if (!cfg.store.enabled) {
    body = <EmptyState p={p} icon="sparkles" title="Store abhi band hai" text="Digital items jaldi wapas aayenge." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (!signedIn && !item) {
    body = <EmptyState p={p} icon="lock-closed" title="Sign in karo" text="Item dekhne aur kharidne ke liye sign in karo." action={{ label: 'Sign in karo', onPress: () => void requireAuth('wallet') }} />;
  } else if (store.isLoading) {
    body = <ItemSkeleton width={inner} />;
  } else if (store.isError && !item) {
    body = <ErrorState p={p} text="Item load nahi hua." onRetry={() => void store.refetch()} />;
  } else if (!item) {
    body = <EmptyState p={p} icon="search" title="Item available nahi hai" text="Ye item ab sale par nahi hai ya link galat hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else {
    body = (
      <View style={styles.sections}>
        <ItemHero item={item} viewer={viewer} width={inner} p={p} tag={tag} />
        <View style={{ gap: 14 }}>
          <ItemTitleBlock item={item} p={p} />
          <ItemPriceCard item={item} p={p} live={live} dpcoin={bal.dpcoin} />
          <ItemAvailability item={item} p={p} now={now} />
        </View>
        <BundlesRail p={p} bundles={bundles} u={u} pad={PAD} viewer={viewer} onOpen={openBundle} />
        <CollectionsRail p={p} collections={collections} pad={PAD} onOpen={openCollection} />
        <SimilarRail p={p} items={similar} pad={PAD} viewer={viewer} live={live} dpcoin={bal.dpcoin} buying={buying} onOpen={openItem} onBuy={buyOther} />
        <ItemDetailsAccordion item={item} p={p} />
      </View>
    );
  }

  const iconBtn = [styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }];
  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.bar, { width: contentW, paddingHorizontal: PAD }]}>
          <BackButton size={22} color={p.text} style={iconBtn} />
          <Text style={[styles.barTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>{item?.name ?? 'Item details'}</Text>
          {item ? <WishlistHeart itemId={item.itemId} name={item.name} size={18} color={p.text} bubble={false} style={iconBtn} /> : null}
          {item && shareUrl ? (
            <TouchableOpacity onPress={() => void onShare()} style={iconBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${item.name} share karo`}>
              <Ionicons name="share-social-outline" size={18} color={p.text} />
            </TouchableOpacity>
          ) : null}
          {signedIn ? (
            <View style={[styles.coinPill, { backgroundColor: p.card, borderColor: p.border }]} accessible accessibilityLabel={live ? `${bal.dpcoin} DP coin` : 'DP coin balance load ho raha hai'}>
              <CoinIcon size={15} />
              {live ? <Text style={[styles.coinText, { color: p.text }]}>{bal.dpcoin.toLocaleString()}</Text> : <Skeleton width={30} height={12} borderRadius={6} />}
            </View>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: PAD, paddingTop: 8, paddingBottom: (item && barState ? barH : insets.bottom) + 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND} colors={[BRAND]} />}
        >
          {body}
        </ScrollView>
      </SafeAreaView>
      {item && barState && cfg.store.enabled ? (
        <ItemBuyBar
          state={barState}
          item={item}
          p={p}
          live={live}
          dpcoin={bal.dpcoin}
          buying={buying === item.itemId}
          equipping={equip.isPending || (item.owned && inventory.isLoading)}
          bottomInset={insets.bottom}
          onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))}
          actions={actions}
        />
      ) : null}
      {dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingTop: 6, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 17 },
  coinPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 10 },
  coinText: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  sections: { gap: 26 },
});
