import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { BRAND, BRAND_GRAD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { DigitalItemCard, FeaturedDigitalCard } from '@/src/components/shop/DigitalItemCard';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { useDesignWindow } from '@/src/lib/layout';

const DIGITAL_TABS: { id: string | null; label: string; icon: string }[] = [
  { id: null, label: 'All', icon: 'sparkles' },
  { id: 'frame', label: 'Frames', icon: 'person-circle' },
  { id: 'theme', label: 'Themes', icon: 'color-palette' },
  { id: 'badge', label: 'Badges', icon: 'medal' },
  { id: 'title', label: 'Titles', icon: 'ribbon' },
];

const RARITY_RANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

/**
 * Shopping: spend 🪙 DP coin (won in contests) on digital items (frames,
 * themes, badges, titles, shown to everyone on your profile, posts and
 * comments) and on real products. Prices are set by TopHunt and re-checked by
 * the server when buying; delivery is included for products.
 */
export default function ShopScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const store = useStore(!!user && cfg.store.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const [category, setCategory] = useState<string | null>(null);
  const [digitalTab, setDigitalTab] = useState<string | null>(null);
  const { width } = useDesignWindow();
  const contentW = Math.min(width, 640);
  const cardW = (contentW - PAD * 2 - 12) / 2;
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });

  const viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const affordable = (i: StoreItemView) => !live || bal.dpcoin >= i.priceCoins;

  const digital = useMemo(() => store.data ?? [], [store.data]);
  const digitalShown = useMemo(() => digital.filter((i) => !digitalTab || i.type === digitalTab), [digital, digitalTab]);
  // Spotlight: the rarest item the viewer does not own yet (ties: the dearest).
  const featured = useMemo(
    () =>
      [...digital]
        .filter((i) => !i.owned)
        .sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || b.priceCoins - a.priceCoins)[0] ?? null,
    [digital],
  );
  const tabs = useMemo(() => DIGITAL_TABS.filter((t) => !t.id || digital.some((i) => i.type === t.id)), [digital]);

  const categories = useMemo(() => [...new Set((products.data ?? []).map((x) => x.category))], [products.data]);
  const productList = useMemo(() => (products.data ?? []).filter((x) => !category || x.category === category), [products.data, category]);

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
  };

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

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48, width: contentW, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Balance */}
        <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroBubbleA} />
          <View style={styles.heroBubbleB} />
          <Text style={styles.heroLabel}>Your balance</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroCoin}><CoinIcon size={26} /></View>
            <Text style={styles.heroValue} accessibilityLabel={`${live ? bal.dpcoin : 'unknown'} DP coin`}>{live ? bal.dpcoin.toLocaleString() : '—'}</Text>
            <Text style={styles.heroUnit}>DP coin</Text>
          </View>
          <Text style={styles.heroSub}>Contest jeeto, DP coin pao. Phir yahan kharcho.</Text>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroBtnSolid} onPress={() => router.push('/explore/battles' as any)} accessibilityRole="button">
              <Ionicons name="trophy" size={15} color={BRAND} />
              <Text style={styles.heroBtnSolidText}>Contest jeeto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtnGhost} onPress={() => router.push('/rewards/inventory' as any)} accessibilityRole="button">
              <Ionicons name="bag-handle" size={15} color="#FFF" />
              <Text style={styles.heroBtnGhostText}>My items</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Digital items */}
        <View style={styles.sectionHead}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: p.text }]}>Digital items</Text>
            <Text style={[styles.sectionSub, { color: p.sub }]}>Sab ko dikhega: profile, posts, comments aur leaderboard par</Text>
          </View>
          {digital.length ? (
            <TouchableOpacity onPress={() => router.push('/rewards/store' as any)} style={styles.seeAll} accessibilityRole="button" accessibilityLabel="See all digital items">
              <Text style={[styles.seeAllText, { color: BRAND }]}>See all</Text>
              <ArrowIcon variant="chevron" direction="right" size={12} color={BRAND} />
            </TouchableOpacity>
          ) : null}
        </View>

        {!cfg.store.enabled ? (
          <ComingSoon p={p} icon="sparkles" text="Digital items jaldi aa rahe hain." />
        ) : store.isLoading ? (
          <ActivityIndicator color={BRAND} style={{ marginVertical: 30 }} />
        ) : store.isError ? (
          <SectionError palette={p} onRetry={() => store.refetch()} label="Digital items load nahi hue." />
        ) : !digital.length ? (
          <ComingSoon p={p} icon="sparkles" text="Abhi koi digital item sale par nahi hai." />
        ) : (
          <>
            {featured ? (
              <View style={{ paddingHorizontal: PAD, marginBottom: 14 }}>
                <FeaturedDigitalCard item={featured} p={p} viewer={viewer} busy={buying === featured.itemId} affordable={affordable(featured)} onBuy={() => void onBuy(featured)} />
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {tabs.map((t) => {
                const on = digitalTab === t.id;
                return (
                  <TouchableOpacity
                    key={t.id ?? 'all'}
                    onPress={() => setDigitalTab(t.id)}
                    style={[styles.tab, { backgroundColor: on ? BRAND : p.chip }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons name={t.icon} size={14} color={on ? '#FFF' : p.sub} />
                    <Text style={[styles.tabText, { color: on ? '#FFF' : p.text }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.grid}>
              {digitalShown.map((item) => (
                <DigitalItemCard
                  key={item.itemId}
                  item={item}
                  width={cardW}
                  p={p}
                  viewer={viewer}
                  busy={buying === item.itemId}
                  affordable={affordable(item)}
                  onBuy={() => void onBuy(item)}
                />
              ))}
            </View>
          </>
        )}

        {/* Physical products */}
        <View style={[styles.sectionHead, { marginTop: 22 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: p.text }]}>Products</Text>
            <Text style={[styles.sectionSub, { color: p.sub }]}>Ghar par delivery, price mein shipping included</Text>
          </View>
        </View>
        {!cfg.shop.enabled ? (
          <ComingSoon p={p} icon="bag-handle" text="Shop abhi band hai. Jaldi aa raha hai!" />
        ) : products.isLoading ? (
          <ActivityIndicator color={BRAND} style={{ marginVertical: 30 }} />
        ) : products.isError ? (
          <SectionError palette={p} onRetry={() => products.refetch()} label="Products load nahi hue." />
        ) : !productList.length ? (
          <ComingSoon p={p} icon="gift" text="Products jaldi aa rahe hain. Tab tak digital items try karo!" />
        ) : (
          <>
            {categories.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {[null, ...categories].map((c) => (
                  <TouchableOpacity key={c ?? 'all'} onPress={() => setCategory(c)} style={[styles.tab, { backgroundColor: category === c ? BRAND : p.chip }]}>
                    <Text style={[styles.tabText, { color: category === c ? '#fff' : p.text, textTransform: 'capitalize' }]}>{c ?? 'All'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.grid}>
              {productList.map((item) => {
                const inStock = item.variants.some((v) => v.inStock);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.card, { width: cardW, backgroundColor: p.card, borderColor: p.border }]}
                    onPress={() => router.push(`/shop/${encodeURIComponent(item.id)}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${item.priceCoins} DP coin`}
                  >
                    {item.images[0] ? (
                      <AppImage source={{ uri: item.images[0] }} style={[styles.img, { width: cardW }]} contentFit="cover" />
                    ) : (
                      <View style={[styles.img, styles.imgEmpty, { width: cardW, backgroundColor: p.chip }]}><Ionicons name="image" size={28} color={p.sub} /></View>
                    )}
                    {item.featured ? <View style={styles.hot}><Text style={styles.hotText}>HOT</Text></View> : null}
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
              })}
            </View>
          </>
        )}
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

function ComingSoon({ p, icon, text }: { p: ReturnType<typeof useExplorePalette>; icon: string; text: string }) {
  return (
    <View style={[styles.soon, { backgroundColor: p.card, borderColor: p.border }]}>
      <View style={[styles.soonIcon, { backgroundColor: `${BRAND}1A` }]}><Ionicons name={icon} size={22} color={BRAND} /></View>
      <Text style={[styles.soonText, { color: p.sub }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  iconBtn: { padding: 6, marginLeft: 6 },
  dot: { position: 'absolute', top: 0, right: 0, backgroundColor: BRAND, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotText: { color: '#fff', fontSize: 10, fontFamily: 'Urbanist-Bold' },

  hero: { marginHorizontal: PAD, marginTop: 4, borderRadius: 24, padding: 18, overflow: 'hidden' },
  heroBubbleA: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.12)', top: -60, right: -40 },
  heroBubbleB: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -30, right: 70 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Urbanist-SemiBold', fontSize: 13 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  heroCoin: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroValue: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 34 },
  heroUnit: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Urbanist-Bold', fontSize: 15, marginTop: 10 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Urbanist-Medium', fontSize: 12.5, marginTop: 4 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroBtnSolid: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 14, height: 36 },
  heroBtnSolidText: { color: BRAND, fontFamily: 'Urbanist-Bold', fontSize: 13 },
  heroBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, paddingHorizontal: 14, height: 36 },
  heroBtnGhostText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 13 },

  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: PAD, marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Urbanist-Bold', fontSize: 19 },
  sectionSub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 2 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4 },
  seeAllText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },

  tabs: { gap: 8, paddingHorizontal: PAD, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 34, borderRadius: 17 },
  tabText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: PAD },

  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  img: { aspectRatio: 1 },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
  hot: { position: 'absolute', top: 8, left: 8, backgroundColor: BRAND, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  hotText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 10, letterSpacing: 0.6 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  price: { fontFamily: 'Urbanist-Bold', fontSize: 15 },
  oos: { color: '#DC2626', fontFamily: 'Urbanist-Bold', fontSize: 12 },

  soon: { marginHorizontal: PAD, borderRadius: 18, borderWidth: 1, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  soonIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  soonText: { flex: 1, fontFamily: 'Urbanist-SemiBold', fontSize: 13.5 },
});
