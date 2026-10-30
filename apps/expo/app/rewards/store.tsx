import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { emitToast } from '@/src/lib/toastBridge';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { BRAND, PAD, useExplorePalette, type ExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { RarityPill } from '@/src/components/gamification/RarityPill';
import { CosmeticPreview, GamificationEmpty } from '@/src/components/gamification/RewardBits';
import { useConfirm } from '@/src/components/modals/ConfirmDialog';
import { newRequestId, useBuyStoreItem, useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';

const TYPE_LABEL: Record<string, string> = {
  frame: 'Profile frame', title: 'Title', theme: 'Theme', badge: 'Badge', effect: 'Effect',
  accessory: 'Accessory', sticker: 'Sticker', collectible: 'Collectible',
};

/**
 * Digital store: cosmetic items for coins. Prices come from the server and are
 * re-checked when buying; nothing here changes votes, fees, prizes or ranking.
 */
export default function StoreScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const q = useStore(!!user && cfg.store.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const buy = useBuyStoreItem();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [buying, setBuying] = useState<string | null>(null);
  // One request id per item the user confirmed, reused if that purchase is retried.
  const pendingIds = useRef(new Map<string, string>());

  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const items = useMemo(() => q.data ?? [], [q.data]);

  const onBuy = async (item: StoreItemView) => {
    const ok = await confirm({
      title: `Buy ${item.name}?`,
      message:
        `${item.priceCoins} DP coin. ` +
        `Yours permanently. ${item.refundable ? 'Refunds on request through support.' : 'Not refundable.'}`,
      confirmLabel: 'Buy',
    });
    if (!ok) return;
    let rid = pendingIds.current.get(item.itemId);
    if (!rid) {
      rid = newRequestId();
      pendingIds.current.set(item.itemId, rid);
    }
    setBuying(item.itemId);
    buy.mutate(
      { item, requestId: rid },
      {
        onSuccess: () => {
          pendingIds.current.delete(item.itemId);
          emitToast(`${item.name} is yours. Equip it from your inventory.`, 'success');
          void refetchMe();
        },
        onError: (e: any) => {
          // The server answered (refused): the next tap is a new purchase attempt.
          // A network failure keeps the id, so retrying cannot charge twice.
          if (e?.status) pendingIds.current.delete(item.itemId);
          if (e?.reason === 'price_changed' || e?.reason === 'item_unavailable') void q.refetch();
          emitToast(e?.message || 'Purchase failed. You were not charged.', 'error');
        },
        onSettled: () => setBuying(null),
      },
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.headerTitle, { color: p.text }]} accessibilityRole="header">Store</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.push('/rewards/inventory' as any)} accessibilityRole="button">
          <Text style={[styles.link, { color: BRAND }]}>My items</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.balance, { color: p.sub }]}>
        {live ? `Balance: ${bal.dpcoin} DP coin. Items are paid in DP coin.` : 'Balance: —'}
      </Text>
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
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={BRAND} />}
          ListEmptyComponent={<View style={{ margin: PAD }}><GamificationEmpty p={p} text="Nothing for sale right now. Check back soon." /></View>}
          renderItem={({ item }) => (
            <Row item={item} p={p} avatarUri={user?.photoURL ?? null} name={user?.displayName ?? null} busy={buying === item.itemId} affordable={!live || bal.dpcoin >= item.priceCoins} onBuy={() => void onBuy(item)} />
          )}
        />
      )}
      {confirmDialog}
    </SafeAreaView>
  );
}

const Row = React.memo(function Row({
  item, p, avatarUri, name, busy, affordable, onBuy,
}: { item: StoreItemView; p: ExplorePalette; avatarUri: string | null; name: string | null; busy: boolean; affordable: boolean; onBuy: () => void }) {
  return (
    <View style={[styles.row, { backgroundColor: p.card, borderColor: p.border }]}>
      <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset, owned: true }} size={52} avatarUri={avatarUri} name={name} />
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
          <RarityPill rarity={item.rarity} />
        </View>
        <Text style={[styles.desc, { color: p.sub }]} numberOfLines={2}>{TYPE_LABEL[item.type] ?? item.type} · Permanent{item.refundable ? '' : ' · Non-refundable'}</Text>
        {item.remaining !== null ? <Text style={[styles.desc, { color: p.sub }]}>{item.remaining} left</Text> : null}
        {item.endsAt ? <Text style={[styles.desc, { color: p.sub }]}>On sale until {new Date(item.endsAt).toLocaleDateString()}</Text> : null}
      </View>
      {item.owned ? (
        <View style={[styles.btn, { backgroundColor: p.chip }]}><Text style={[styles.btnText, { color: p.text }]}>Owned</Text></View>
      ) : (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: BRAND, opacity: affordable && !busy ? 1 : 0.5 }]}
          disabled={!affordable || busy}
          onPress={onBuy}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${item.name} for ${item.priceCoins} coins`}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.btnText, { color: '#FFF' }]}>{item.priceCoins} DP coin</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  headerTitle: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  link: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  balance: { fontFamily: 'Urbanist-Medium', fontSize: 12, paddingHorizontal: PAD, marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: PAD, marginBottom: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontFamily: 'Urbanist-Bold', flexShrink: 1 },
  desc: { fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, minWidth: 84, alignItems: 'center' },
  btnText: { fontSize: 12, fontFamily: 'Urbanist-Bold' },
});
