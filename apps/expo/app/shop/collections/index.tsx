import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { BottomNav } from '@/src/components/home/BottomNav';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { AdminCollectionsM } from '@/src/components/shop/premium/ShopHomeMobile';
import { EmptyState, ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { mobileScale } from '@/src/components/shop/premium/mock';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { collectionCards } from '@/src/lib/shopModel';
import { useMonetizationConfig, useShopCollections, useStore } from '@/src/services/monetization';
import { BRAND, TH, useTophuntPalette } from '@/src/theme/tophunt';

/** Every admin collection with items on sale (`/shop/collections`), the same cards as the Shop home. */
export default function ShopCollectionsScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const enabled = !!user && cfg.store.enabled;
  const cols = useShopCollections(enabled);
  const store = useStore(enabled);
  const { data: me } = useProfile(user?.uid || '');
  const { width } = useWindowDimensions();
  // Phone column width at most, like the phone Shop home the cards come from.
  const contentW = Math.min(width, 520);
  const pad = 16;
  const inner = contentW - pad * 2;
  const u = mobileScale(contentW);
  const cards = useMemo(() => collectionCards(cols.data?.collections ?? [], store.data ?? []), [cols.data?.collections, store.data]);
  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const backToShop = () => router.replace('/shop' as any);

  let body: React.ReactNode;
  if (!enabled) {
    body = <EmptyState p={p} icon="sparkles" title="Store abhi band hai" text="Collections jaldi wapas aayengi." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (cols.isLoading || store.isLoading) {
    body = (
      <View style={{ gap: 8 }} accessible accessibilityLabel="Collections load ho rahi hain">
        {[0, 1, 2].map((k) => <View key={k} style={{ height: 68, borderRadius: TH.radii.lg, backgroundColor: p.skeleton }} />)}
      </View>
    );
  } else if (cols.isError || store.isError) {
    body = <ErrorState p={p} text="Collections load nahi hui." onRetry={() => { void cols.refetch(); void store.refetch(); }} />;
  } else if (!cards.length) {
    body = <EmptyState p={p} icon="sparkles" text="Abhi koi collection nahi hai." action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else {
    body = <AdminCollectionsM cards={cards} u={u} inner={inner} viewer={viewer} onPress={(id) => router.push(`/shop/collections/${encodeURIComponent(id)}` as any)} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.bar, { width: contentW, paddingHorizontal: pad }]}>
          <BackButton size={22} color={p.text} style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
          <Text style={[styles.barTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>Popular Collections</Text>
        </View>
        <ScrollView
          contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: pad, paddingTop: 8, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={cols.isRefetching} onRefresh={() => { void cols.refetch(); void store.refetch(); }} tintColor={BRAND} />}
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
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingTop: 6, paddingBottom: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 18 },
});
