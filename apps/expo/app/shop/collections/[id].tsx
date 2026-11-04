import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { BottomNav } from '@/src/components/home/BottomNav';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { ProductPreview } from '@/src/components/shop/premium/ProductPreview';
import { CrownIcon, SparkleField } from '@/src/components/shop/premium/ShopArt';
import { EmptyState, ErrorState, ShopSkeleton } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useAuthGate } from '@/src/hooks/useAuthGate';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { bestItem, collectionItems, isShort, typeLine } from '@/src/lib/shopModel';
import { useMonetizationConfig, useShopCollections, useStore, type StoreItemView } from '@/src/services/monetization';
import { BRAND, SHOP_ACCENT_GRADS, TH, gridCellWidth, gridColumns, useTophuntPalette } from '@/src/theme/tophunt';

const GAP = 12;

/**
 * One admin collection (`/shop/collections/:id`): a banner in the collection's
 * accent gradient (admin image, else its best item), then its items in the
 * admin's order as the premium item cards, with the usual buy sheet. Items are
 * the live store listings (getStore); ids not on sale are left out.
 */
export default function ShopCollectionScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const cfg = useMonetizationConfig();
  const enabled = !!user && cfg.store.enabled;
  const cols = useShopCollections(enabled);
  const store = useStore(enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, TH.maxContentWidth);
  const pad = contentW >= 700 ? 24 : 16;
  const columns = gridColumns(contentW);
  const cellW = gridCellWidth(contentW, columns, GAP, pad);

  const collection = cols.data?.collections.find((c) => c.id === String(id ?? ''));
  const items = useMemo(() => (collection ? collectionItems(collection, store.data ?? []) : []), [collection, store.data]);
  const art = bestItem(items);
  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const subtitle = collection?.subtitle || typeLine(items);
  const backToShop = () => router.replace('/shop' as any);

  let body: React.ReactNode;
  if (!user) {
    body = <EmptyState p={p} icon="sparkles" title="Sign in karo" text="Collections aur items dekhne ke liye sign in karo." action={{ label: 'Sign in', onPress: () => void requireAuth('wallet') }} />;
  } else if (!cfg.store.enabled) {
    body = <EmptyState p={p} icon="sparkles" title="Store abhi band hai" text="Digital items jaldi wapas aayenge." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (cols.isLoading || store.isLoading) {
    body = <View style={{ marginHorizontal: -pad }}><ShopSkeleton p={p} cellW={cellW} cols={columns} pad={pad} /></View>;
  } else if (cols.isError || store.isError) {
    body = <ErrorState p={p} text="Collection load nahi hui." onRetry={() => { void cols.refetch(); void store.refetch(); }} />;
  } else if (!collection) {
    body = <EmptyState p={p} icon="search" title="Collection nahi mili" text="Ye collection ab available nahi hai ya link galat hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (!items.length) {
    body = <EmptyState p={p} icon="sparkles" text="Is collection ka koi item abhi sale par nahi hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else {
    body = (
      <View style={styles.grid}>
        {items.map((i: StoreItemView) => (
          <DigitalItemCard
            key={i.itemId}
            item={i}
            width={cellW}
            p={p}
            viewer={viewer}
            busy={buying === i.itemId}
            short={isShort(bal.dpcoin, i.priceCoins, live)}
            onOpen={() => router.push(`/shop/item/${encodeURIComponent(i.itemId)}` as any)}
            onBuy={() => void onBuy(i)}
          />
        ))}
      </View>
    );
  }

  const bannerW = contentW - pad * 2;
  const artSize = Math.min(96, Math.round(bannerW * 0.26));
  const grad = SHOP_ACCENT_GRADS[collection?.accent ?? 'violet'] ?? SHOP_ACCENT_GRADS.violet;

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.bar, { width: contentW, paddingHorizontal: pad }]}>
          <BackButton size={22} color={p.text} style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
          <Text style={[styles.barTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>{collection?.name ?? 'Collection'}</Text>
        </View>
        <ScrollView
          contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: pad, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={cols.isRefetching || store.isRefetching} onRefresh={() => { void cols.refetch(); void store.refetch(); void refetchMe(); }} tintColor={BRAND} />}
        >
          {collection ? (
            <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.banner, { minHeight: artSize + 28 }]}>
              <View style={StyleSheet.absoluteFill} pointerEvents="none"><SparkleField width={bannerW} height={artSize + 28} /></View>
              <View style={{ width: artSize, height: artSize }} pointerEvents="none">
                {collection.imageUrl ? (
                  <AppImage source={{ uri: collection.imageUrl }} displayWidth={artSize} style={{ width: artSize, height: artSize, borderRadius: 12 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
                ) : art ? (
                  <ProductPreview item={art} viewer={viewer} width={artSize} height={artSize} radius={12} bare />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={styles.bannerTitle} numberOfLines={2}>{collection.name}</Text>
                {subtitle ? <Text style={styles.bannerSub} numberOfLines={3}>{subtitle}</Text> : null}
                {items.length ? <Text style={styles.bannerCount}>{`${items.length} ${items.length === 1 ? 'item' : 'items'}`}</Text> : null}
              </View>
              <View style={styles.crown} pointerEvents="none"><CrownIcon size={16} /></View>
            </LinearGradient>
          ) : null}
          <View style={{ marginTop: 16 }}>{body}</View>
        </ScrollView>
        <BottomNav backgroundColor={p.bg} isDark={p.isDark} />
        {dialog}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingTop: 6, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 18 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: TH.radii.xl, padding: 14, overflow: 'hidden', marginTop: 6 },
  bannerTitle: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 20 },
  bannerSub: { color: '#EBDDFF', fontFamily: TH.fonts.medium, fontSize: 13, lineHeight: 18 },
  bannerCount: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 12, opacity: 0.9 },
  crown: { position: 'absolute', top: 10, right: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
