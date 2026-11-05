/**
 * Shop → My Collection (phone design mock): the TopHunt header (logo, DP
 * coin and Diamond pills, the notification bell with its real unread count,
 * settings), the title block (back, crown, "My Collection", gift art), and
 * the collection body of src/components/shop/collection/
 * CollectionHomeMobile.tsx — the Free / DP Coin toggle, the filter chips and
 * a section per item type with Equipped / Free / Owned / DP price pills.
 *
 * Two collections, switched by the toggle (collectionHomeModel.ts):
 *  - Free Collection: the whole collection — earned items (Free pill) and
 *    live store items with their real price (DP pill), so every row also
 *    shows what is left to get.
 *  - DP Coin Collection: only the DP coin side — purchased items (Owned /
 *    Equipped) and paid store items.
 *
 * `?tab=xp` opens Free, `?tab=dp` (or the legacy `premium`) opens DP Coin.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { BottomNav } from '@/src/components/home/BottomNav';
import { BrandLogo, NavyPill } from '@/src/components/shop/premium/ShopHeader';
import { CollectionHomeMobile } from '@/src/components/shop/collection/CollectionHomeMobile';
import { GiftArt, LaurelSprig, VioletCrownIcon, DiamondSparkle } from '@/src/components/shop/premium/ShopArt';
import { MOCK_M_MARGIN, mobileScale, px } from '@/src/components/shop/premium/mock';
import { ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { Ionicons } from '@/src/lib/icons';
import { notificationService } from '@/src/services/notifications/notificationService';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { collectionSections, type CollectionMode } from '@/src/lib/collectionHomeModel';
import { useInventory } from '@/src/services/gamification';
import { useMonetizationConfig, useStore } from '@/src/services/monetization';
import { BRAND, TH, useTophuntPalette } from '@/src/theme/tophunt';

type CollectionTab = CollectionMode;

/** ?tab=xp → Free (legacy XP tab), ?tab=dp / premium → DP Coin; default Free (the mock's active side). */
export const parseCollectionTab = (v: unknown): CollectionTab => {
  const t = Array.isArray(v) ? v[0] : v;
  return t === 'dp' || t === 'premium' ? 'dp' : 'free';
};

export default function MyCollectionScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const cfg = useMonetizationConfig();
  const inventory = useInventory(!!user);
  const store = useStore(!!user && cfg.store.enabled);
  const { data: me } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);

  const [mode, setModeState] = useState<CollectionTab>(() => parseCollectionTab(params.tab));
  useEffect(() => {
    if (params.tab) setModeState(parseCollectionTab(params.tab));
  }, [params.tab]);
  const setMode = useCallback((m: CollectionTab) => {
    setModeState(m);
    router.setParams({ tab: m === 'free' ? undefined : 'dp' });
  }, [router]);
  const [chip, setChip] = useState<string>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const onToggleExpand = useCallback((type: string) => setExpanded((e) => ({ ...e, [type]: !e[type] })), []);
  const openItem = useCallback((id: string) => router.push(`/shop/item/${encodeURIComponent(id)}` as any), [router]);

  // The notification bell's real unread count (WebSocket + a slow poll, like the Home header).
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    setUnread(0);
    if (!user?.uid) return;
    return notificationService.subscribeToUnreadCount(user.uid, setUnread);
  }, [user?.uid]);

  const { width } = useWindowDimensions();
  const contentW = Math.min(width, TH.maxContentWidth);
  const column = Math.min(contentW, 520);
  const u = mobileScale(column);
  const margin = px(MOCK_M_MARGIN, u);
  const inner = column - margin * 2;

  const sections = useMemo(
    () => collectionSections({ inventory: inventory.data?.items ?? [], store: store.data ?? [], mode, only: chip === 'all' ? null : chip }),
    [inventory.data, store.data, mode, chip],
  );

  const loading = !!user && (inventory.isLoading || (cfg.store.enabled && store.isLoading));
  const failed = inventory.isError || store.isError;
  const onRefresh = () => {
    void inventory.refetch();
    if (cfg.store.enabled) void store.refetch();
  };

  const H = 40; // header row height (pt), like the phone shop header
  const pillH = px(25, u);
  const pillFs = Math.round(11.5 * u * 10) / 10;
  const pillIcon = px(14, u);
  const titleFs = Math.round(19 * u * 10) / 10;
  const subFs = Math.round(10.5 * u * 10) / 10;
  const artW = px(64, u);
  const artH = px(52, u);

  return (
    <View style={[styles.screen, { backgroundColor: p.bg }]}>
      <StatusBar style={p.isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: px(20, u) + 32, width: column, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={inventory.isRefetching || store.isRefetching} onRefresh={onRefresh} tintColor={BRAND} />}
        >
          {/* Header: logo, DP coin / Diamond pills (tap → wallet), bell (real unread), settings. */}
          <View style={[styles.rowCenter, { marginTop: px(14, u), height: H, gap: px(6, u), paddingHorizontal: margin }]}>
            <BrandLogo maxWidth={inner * 0.3} maxHeight={H} />
            <View style={{ flex: 1 }} />
            <NavyPill kind="dp" value={bal.dpcoin} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(7, u)} gap={px(4, u)} onPress={() => router.push('/wallet' as any)} />
            <NavyPill kind="diamond" value={bal.diamonds} live={live} height={pillH} fontSize={pillFs} icon={pillIcon} padX={px(7, u)} gap={px(4, u)} onPress={() => router.push('/wallet' as any)} />
            <TouchableOpacity onPress={() => router.push('/notifications' as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
              <View>
                <Ionicons name="notifications-outline" size={px(19, u)} color={p.text} />
                {unread > 0 ? (
                  <View style={[styles.badge, { borderColor: p.bg }]}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/setting' as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Settings kholo">
              <Ionicons name="settings-outline" size={px(19, u)} color={p.text} />
            </TouchableOpacity>
          </View>

          {/* Title block: back, crown, "My Collection", subtitle, gift art on the right. */}
          <View style={[styles.row, { marginTop: px(8, u), paddingHorizontal: margin, paddingRight: margin + artW * 0.72 }]}>
            <View style={[styles.backCircle, { width: px(26, u), height: px(26, u), borderRadius: px(13, u), backgroundColor: p.card, borderColor: p.border }]}>
              <BackButton size={px(15, u)} color={p.text} />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: px(7, u) }}>
              <View style={styles.rowCenter}>
                <VioletCrownIcon size={px(19, u)} />
                <Text style={[styles.title, { fontSize: titleFs, lineHeight: titleFs * 1.2, color: p.text, marginLeft: px(5, u) }]} numberOfLines={1} accessibilityRole="header">My Collection</Text>
                <LaurelSprig width={px(7, u)} height={px(13, u)} />
              </View>
              <Text style={[styles.subtitle, { fontSize: subFs, color: p.sub, marginTop: px(1, u) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                All Your Rewards, Frames, Themes, Badges &amp; Titles
              </Text>
            </View>
          </View>
          <View style={[styles.artWrap, { top: px(20, u), right: margin - px(4, u), width: artW, height: artH }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GiftArt width={artW} height={artH} />
            <View style={[styles.abs, { left: -px(2, u), bottom: px(2, u) }]}><DiamondSparkle size={px(11, u)} /></View>
            <View style={[styles.abs, { right: 0, top: -px(2, u) }]}><DiamondSparkle size={px(9, u)} /></View>
          </View>

          {/* Body */}
          <View style={{ marginTop: px(12, u), paddingHorizontal: margin }}>
            {!user ? (
              <View style={styles.center}>
                <Ionicons name="lock-closed-outline" size={36} color={p.sub} />
                <Text style={[styles.muted, { color: p.sub }]}>Apna collection dekhne ke liye sign in karein.</Text>
              </View>
            ) : failed ? (
              <ErrorState p={p} text="Collection load nahi hua." onRetry={onRefresh} />
            ) : loading ? (
              <View accessible accessibilityLabel="Collection load ho raha hai">
                {[46, 26, 62, 62].map((h, k) => (
                  <View key={k} style={{ marginTop: px(12, u), height: px(h, u), borderRadius: px(12, u), backgroundColor: p.skeleton }} />
                ))}
              </View>
            ) : (
              <CollectionHomeMobile
                p={p}
                u={u}
                inner={inner}
                mode={mode}
                sections={sections}
                chip={chip}
                expanded={expanded}
                onMode={setMode}
                onChip={setChip}
                onToggleExpand={onToggleExpand}
                onOpenItem={openItem}
              />
            )}
          </View>
        </ScrollView>
        <BottomNav backgroundColor={p.bg} isDark={p.isDark} collectionActive />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  abs: { position: 'absolute' },
  badge: { position: 'absolute', top: -5, right: -6, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5 },
  badgeText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 8 },
  backCircle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  subtitle: { fontFamily: TH.fonts.medium, flexShrink: 1 },
  artWrap: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 60 },
  muted: { fontFamily: TH.fonts.medium, fontSize: 14, textAlign: 'center' },
});
