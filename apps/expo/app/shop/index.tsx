import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useMonetizationConfig } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { useDesignWindow } from '@/src/lib/layout';

/**
 * Shopping: spend 🪙 DP coin (won in contests) on real products and digital items.
 * Replaces withdrawals. Prices are set by TopHunt; delivery is included.
 */
export default function ShopScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const q = useShopProducts(!!user && cfg.shop.enabled);
  const { data: me } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const [category, setCategory] = useState<string | null>(null);
  const { width } = useDesignWindow();
  const cardW = (Math.min(width, 640) - PAD * 2 - 12) / 2;

  const categories = useMemo(() => [...new Set((q.data ?? []).map((x) => x.category))], [q.data]);
  const products = useMemo(() => (q.data ?? []).filter((x) => !category || x.category === category), [q.data, category]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Shop</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.push('/shop/orders' as any)} style={styles.iconBtn} accessibilityLabel="My orders">
          <Ionicons name="receipt-outline" size={22} color={p.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/shop/cart' as any)} style={styles.iconBtn} accessibilityLabel={`Cart, ${cartCount} items`}>
          <Ionicons name="cart-outline" size={24} color={p.text} />
          {cartCount > 0 && <View style={styles.dot}><Text style={styles.dotText}>{cartCount}</Text></View>}
        </TouchableOpacity>
      </View>

      <View style={[styles.balance, { backgroundColor: p.card, borderColor: p.border }]}>
        <CoinIcon size={18} />
        <Text style={[styles.balanceText, { color: p.text }]}>{hasLiveBalance(me) ? bal.dpcoin : '—'} DP coin</Text>
        <Text style={[styles.balanceSub, { color: p.sub }]}>Contest jeeto, DP coin pao</Text>
      </View>

      <TouchableOpacity style={[styles.digital, { backgroundColor: p.card, borderColor: p.border }]} onPress={() => router.push('/rewards/store' as any)} accessibilityRole="button">
        <Ionicons name="sparkles-outline" size={20} color={BRAND} />
        <Text style={[styles.digitalText, { color: p.text }]}>Digital items: frames, themes, badges</Text>
        <ArrowIcon variant="chevron" direction="right" size={16} color={p.sub} />
      </TouchableOpacity>

      {!cfg.shop.enabled ? (
        <Text style={[styles.empty, { color: p.sub }]}>Shop abhi band hai. Jaldi aa raha hai!</Text>
      ) : q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginTop: 40 }} />
      ) : q.isError ? (
        <SectionError palette={p} onRetry={() => q.refetch()} label="Products load nahi hue." />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(x) => x.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: PAD }}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={BRAND} />}
          ListHeaderComponent={
            categories.length > 1 ? (
              <FlatList
                horizontal
                data={[null, ...categories]}
                keyExtractor={(c) => c ?? 'all'}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: PAD, paddingBottom: 4 }}
                renderItem={({ item: c }) => (
                  <TouchableOpacity onPress={() => setCategory(c)} style={[styles.chip, { backgroundColor: category === c ? BRAND : p.chip }]}>
                    <Text style={[styles.chipText, { color: category === c ? '#fff' : p.text }]}>{c ?? 'All'}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : null
          }
          ListEmptyComponent={<Text style={[styles.empty, { color: p.sub }]}>Abhi koi product nahi hai.</Text>}
          renderItem={({ item }) => {
            const inStock = item.variants.some((v) => v.inStock);
            return (
              <TouchableOpacity
                style={[styles.card, { width: cardW, backgroundColor: p.card, borderColor: p.border }]}
                onPress={() => router.push(`/shop/${encodeURIComponent(item.id)}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.priceCoins} DP coin`}
              >
                {item.images[0] ? <AppImage source={{ uri: item.images[0] }} style={[styles.img, { width: cardW }]} contentFit="cover" /> : <View style={[styles.img, { width: cardW, backgroundColor: p.chip }]} />}
                <View style={{ padding: 10, gap: 4 }}>
                  <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{item.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <CoinIcon size={14} />
                    <Text style={[styles.price, { color: p.text }]}>{item.priceCoins}</Text>
                  </View>
                  {!inStock && <Text style={styles.oos}>Out of stock</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  iconBtn: { padding: 6, marginLeft: 6 },
  dot: { position: 'absolute', top: 0, right: 0, backgroundColor: BRAND, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotText: { color: '#fff', fontSize: 10, fontFamily: 'Urbanist-Bold' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: PAD, padding: 12, borderRadius: 14, borderWidth: 1 },
  balanceText: { fontFamily: 'Urbanist-Bold', fontSize: 16 },
  balanceSub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginLeft: 'auto' },
  digital: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: PAD, marginVertical: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  digitalText: { flex: 1, fontFamily: 'Urbanist-Bold', fontSize: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14 },
  chipText: { fontFamily: 'Urbanist-Bold', fontSize: 13, textTransform: 'capitalize' },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  img: { aspectRatio: 1 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  price: { fontFamily: 'Urbanist-Bold', fontSize: 15 },
  oos: { color: '#DC2626', fontFamily: 'Urbanist-Bold', fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: 'Urbanist-Medium' },
});
