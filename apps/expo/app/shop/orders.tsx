import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { BRAND, BRAND_GRAD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { ScaleTouchable } from '@/src/components/explore/ScaleTouchable';
import { GradientButton, ProductThumb, ShopHeader, StatusPill, statusColor } from '@/src/components/shop/ShopBits';
import { ORDER_STATUS_LABEL, useMyOrders } from '@/src/services/shop';

export default function OrdersScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const q = useMyOrders();
  const orders = q.data?.pages.flatMap((pg) => pg.orders) ?? [];
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <ShopHeader p={p} kicker="DP ARENA SHOP" title="My orders" />
      {q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginTop: 40 }} />
      ) : q.isError ? (
        <SectionError palette={p} onRetry={() => q.refetch()} label="Orders load nahi hue." />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: PAD, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={BRAND} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={BRAND} style={{ marginVertical: 12 }} /> : null}
          ListEmptyComponent={
            <View style={[styles.empty, { backgroundColor: p.card, borderColor: p.border }]}>
              <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyIcon}>
                <Ionicons name="trophy" size={28} color="#FFF" />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: p.text }]}>Abhi tak koi order nahi</Text>
              <Text style={[styles.sub, { color: p.sub, textAlign: 'center' }]}>Contest jeeto, DP coin pao aur asli prizes ghar mangwao.</Text>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 }}>
                <GradientButton p={p} icon="trophy" label="Contest jeeto" onPress={() => router.push('/explore/battles' as any)} style={{ flex: 1 }} />
                <GradientButton p={p} icon="bag-handle" label="Shop" onPress={() => router.replace('/shop' as any)} style={{ flex: 1 }} />
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const color = statusColor(item.status);
            return (
              <ScaleTouchable
                style={[styles.row, { backgroundColor: p.card, borderColor: p.border }]}
                onPress={() => router.push(`/shop/order/${encodeURIComponent(item.id)}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${item.units > 1 ? ` and ${item.units - 1} more` : ''}, ${item.totalCoins} DP coin, ${ORDER_STATUS_LABEL[item.status]}`}
              >
                <View style={styles.rowWrap}>
                <View style={[styles.accent, { backgroundColor: color }]} />
                <View style={styles.rowInner}>
                  <View>
                    <ProductThumb uri={item.image} size={64} radius={14} />
                    {item.units > 1 ? (
                      <View style={[styles.units, { borderColor: p.card }]}>
                        <Text style={styles.unitsText}>+{item.units - 1}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>{item.title}</Text>
                    <StatusPill status={item.status} />
                    <View style={styles.meta}>
                      <Ionicons name="calendar" size={11} color={p.sub} />
                      <Text style={[styles.sub, { color: p.sub }]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                      <Text style={[styles.sub, { color: p.sub }]}>·</Text>
                      <CoinIcon size={11} />
                      <Text style={[styles.coins, { color: p.text }]}>{item.totalCoins.toLocaleString()}</Text>
                    </View>
                  </View>
                  <ArrowIcon direction="right" size={14} color={p.sub} />
                </View>
                </View>
              </ScaleTouchable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  rowWrap: { flexDirection: 'row' },
  accent: { width: 4 },
  rowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  units: { position: 'absolute', right: -6, bottom: -6, backgroundColor: '#8B5CF6', borderRadius: 10, minWidth: 22, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  unitsText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 10 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14.5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12 },
  coins: { fontFamily: 'Urbanist-Black', fontSize: 12 },
  empty: { borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', padding: 22, alignItems: 'center', gap: 8, marginTop: 20 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: 'Urbanist-Black', fontSize: 18 },
});
