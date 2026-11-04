import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { BottomNav } from '@/src/components/home/BottomNav';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { BundleGrid } from '@/src/components/shop/premium/ShopBundles';
import { EmptyState, ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { mobileScale } from '@/src/components/shop/premium/mock';
import { useAuth } from '@/src/hooks/useAuth';
import { useMinuteNow } from '@/src/hooks/useMinuteNow';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { visibleBundles } from '@/src/lib/shopModel';
import { useMonetizationConfig, useShopCollections } from '@/src/services/monetization';
import { BRAND, TH, useTophuntPalette } from '@/src/theme/tophunt';

const GAP = 10;

/** Every Diamond bundle on sale (plus the ones the user bought), as a grid of the Shop home cards. */
export default function ShopBundlesScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const enabled = !!user && cfg.store.enabled;
  const cols = useShopCollections(enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, TH.maxContentWidth);
  const pad = contentW >= 700 ? 24 : 16;
  const inner = contentW - pad * 2;
  const columns = contentW >= 900 ? 4 : contentW >= 600 ? 3 : 2;
  // Fonts follow the phone mock scale, capped so wide screens do not blow them up.
  const u = Math.min(mobileScale(Math.min(contentW, 520)), 1.5);
  const now = useMinuteNow();
  const bundles = useMemo(() => visibleBundles(cols.data?.bundles ?? [], now), [cols.data?.bundles, now]);
  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const backToShop = () => router.replace('/shop' as any);

  let body: React.ReactNode;
  if (!enabled) {
    body = <EmptyState p={p} icon="gift" title="Store abhi band hai" text="Bundles jaldi wapas aayenge." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (cols.isLoading) {
    body = (
      <View style={[styles.row, { gap: GAP }]} accessible accessibilityLabel="Bundles load ho rahe hain">
        {Array.from({ length: columns }, (_, k) => <View key={k} style={{ flex: 1, height: 190, borderRadius: TH.radii.lg, backgroundColor: p.skeleton }} />)}
      </View>
    );
  } else if (cols.isError) {
    body = <ErrorState p={p} text="Bundles load nahi hue." onRetry={() => void cols.refetch()} />;
  } else if (!bundles.length) {
    body = <EmptyState p={p} icon="gift" text="Abhi koi bundle sale par nahi hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else {
    body = <BundleGrid p={p} bundles={bundles} u={u} width={inner} cols={columns} gap={GAP} viewer={viewer} onOpen={(id) => router.push(`/shop/bundle/${encodeURIComponent(id)}` as any)} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.bar, { width: contentW, paddingHorizontal: pad }]}>
          <BackButton size={22} color={p.text} style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
          <Text style={[styles.barTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>Shop Bundles</Text>
          {user ? (
            <View style={[styles.pill, { backgroundColor: p.card, borderColor: p.border }]} accessible accessibilityLabel={live ? `${bal.diamonds} Diamond` : 'Diamond balance load ho raha hai'}>
              <DiamondIcon size={15} />
              {live ? <Text style={[styles.pillText, { color: p.text }]}>{bal.diamonds.toLocaleString()}</Text> : <Skeleton width={30} height={12} borderRadius={6} />}
            </View>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: pad, paddingTop: 8, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={cols.isRefetching} onRefresh={() => { void cols.refetch(); void refetchMe(); }} tintColor={BRAND} />}
        >
          {body}
        </ScrollView>
        <BottomNav backgroundColor={p.bg} isDark={p.isDark} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: 'row' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingTop: 6, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 10 },
  pillText: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
});
