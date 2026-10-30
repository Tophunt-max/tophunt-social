import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { ORDER_STATUS_LABEL, useMyOrders } from '@/src/services/shop';

export default function OrdersScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const q = useMyOrders();
  const orders = q.data?.pages.flatMap((pg) => pg.orders) ?? [];
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">My orders</Text>
      </View>
      {q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginTop: 40 }} />
      ) : q.isError ? (
        <SectionError palette={p} onRetry={() => q.refetch()} label="Orders load nahi hue." />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: PAD, gap: 10, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={BRAND} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<Text style={[styles.empty, { color: p.sub }]}>Abhi tak koi order nahi.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: p.card, borderColor: p.border }]}
              onPress={() => router.push(`/shop/order/${encodeURIComponent(item.id)}` as any)}
              accessibilityRole="button"
            >
              {item.image ? <AppImage source={{ uri: item.image }} style={styles.img} contentFit="cover" /> : <View style={[styles.img, { backgroundColor: p.chip }]} />}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>{item.title}{item.units > 1 ? ` + ${item.units - 1} more` : ''}</Text>
                <Text style={[styles.sub, { color: p.sub }]}>{new Date(item.createdAt).toLocaleDateString()} · {item.totalCoins} DP coin</Text>
                <Text style={[styles.status, { color: BRAND }]}>{ORDER_STATUS_LABEL[item.status]}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  img: { width: 56, height: 56, borderRadius: 10 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12 },
  status: { fontFamily: 'Urbanist-Bold', fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: 'Urbanist-Medium' },
});
