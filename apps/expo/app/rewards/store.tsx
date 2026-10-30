import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useDesignWindow } from '@/src/lib/layout';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { GamificationEmpty } from '@/src/components/gamification/RewardBits';
import { DIGITAL_TYPE_LABEL, DigitalItemCard } from '@/src/components/shop/DigitalItemCard';
import { useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';

/**
 * Digital store: cosmetic items for DP coin. Prices come from the server and
 * are re-checked when buying; nothing here changes votes, fees, prizes or
 * ranking.
 */
export default function StoreScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const q = useStore(!!user && cfg.store.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void q.refetch() });
  const [type, setType] = useState<string | null>(null);
  const { width } = useDesignWindow();
  const contentW = Math.min(width, 640);
  const cardW = (contentW - PAD * 2 - 12) / 2;

  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const all = useMemo(() => q.data ?? [], [q.data]);
  const types = useMemo(() => [...new Set(all.map((i) => i.type))], [all]);
  const items = useMemo(() => all.filter((i) => !type || i.type === type), [all, type]);
  const viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const affordable = (i: StoreItemView) => !live || bal.dpcoin >= i.priceCoins;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.headerTitle, { color: p.text }]} accessibilityRole="header">Digital items</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.push('/rewards/inventory' as any)} accessibilityRole="button">
          <Text style={[styles.link, { color: BRAND }]}>My items</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.balance, { backgroundColor: p.card, borderColor: p.border }]}>
        <CoinIcon size={16} />
        <Text style={[styles.balanceText, { color: p.text }]}>{live ? bal.dpcoin.toLocaleString() : '—'} DP coin</Text>
        <Text style={[styles.balanceSub, { color: p.sub }]}>Items DP coin se milte hain</Text>
      </View>
      {!cfg.store.enabled ? (
        <View style={{ margin: PAD }}><GamificationEmpty p={p} text="The store is closed right now." /></View>
      ) : q.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={BRAND} /></View>
      ) : q.isError ? (
        <View style={{ marginTop: 30 }}><SectionError palette={p} onRetry={() => q.refetch()} label="Store load nahi ho paya." /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.itemId}
          numColumns={2}
          style={{ width: contentW, alignSelf: 'center' }}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: PAD }}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={BRAND} />}
          ListHeaderComponent={
            types.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {[null, ...types].map((t) => (
                  <TouchableOpacity key={t ?? 'all'} onPress={() => setType(t)} style={[styles.tab, { backgroundColor: type === t ? BRAND : p.chip }]} accessibilityRole="button" accessibilityState={{ selected: type === t }}>
                    <Text style={[styles.tabText, { color: type === t ? '#FFF' : p.text }]}>{t ? DIGITAL_TYPE_LABEL[t] ?? t : 'All'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null
          }
          ListEmptyComponent={<View style={{ margin: PAD }}><GamificationEmpty p={p} text="Nothing for sale right now. Check back soon." /></View>}
          renderItem={({ item }) => (
            <DigitalItemCard item={item} width={cardW} p={p} viewer={viewer} busy={buying === item.itemId} affordable={affordable(item)} onBuy={() => void onBuy(item)} />
          )}
        />
      )}
      {dialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  headerTitle: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  link: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: PAD, marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  balanceText: { fontFamily: 'Urbanist-Bold', fontSize: 15 },
  balanceSub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginLeft: 'auto' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { gap: 8, paddingHorizontal: PAD, paddingBottom: 4 },
  tab: { paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center' },
  tabText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
});
