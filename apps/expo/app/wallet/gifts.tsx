import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { useAuth } from '@/src/hooks/useAuth';
import { useGiftHistory } from '@/src/services/monetization';

/** Gifts I sent and gifts I received. Private to the signed-in user. */
export default function GiftHistoryScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<'sent' | 'received'>('received');
  const q = useGiftHistory(tab, !!user);
  const items = q.data?.pages.flatMap((pg) => pg.items) ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Gifts</Text>
      </View>
      <View style={styles.tabs}>
        {(['received', 'sent'] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, { backgroundColor: tab === t ? BRAND : p.chip }]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Text style={[styles.tabText, { color: tab === t ? '#fff' : p.text }]}>{t === 'received' ? 'Received' : 'Sent'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.note, { color: p.sub }]}>
        {tab === 'received' ? 'Gifts are a sign of support. They are not coins and cannot be withdrawn.' : 'Coins you spent on gifts. Gifts cannot be undone.'}
      </Text>
      {q.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={BRAND} /></View>
      ) : q.isError ? (
        <SectionError palette={p} onRetry={() => q.refetch()} label="Gift history load nahi hui." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={BRAND} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          ListEmptyComponent={<Text style={[styles.empty, { color: p.sub }]}>{tab === 'received' ? 'No gifts received yet.' : 'You have not sent any gifts yet.'}</Text>}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={BRAND} style={{ margin: 16 }} /> : null}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: p.card, borderColor: p.border }]}
              onPress={() => router.push(`/profile?userId=${encodeURIComponent(item.counterpartUid)}` as any)}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: p.text }]}>{item.quantity > 1 ? `${item.quantity} × ` : ''}{item.giftName}</Text>
                <Text style={[styles.sub, { color: p.sub }]}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              {tab === 'sent' ? <Text style={[styles.amount, { color: p.text }]}>−{item.totalCoins} coins</Text> : null}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: PAD, marginBottom: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14 },
  tabText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  note: { fontFamily: 'Urbanist-Medium', fontSize: 12, paddingHorizontal: PAD, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: 'Urbanist-Medium' },
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: PAD, marginBottom: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 15 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 2 },
  amount: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
});
