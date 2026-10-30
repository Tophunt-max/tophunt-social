import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons, MaterialCommunityIcons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { BRAND, BRAND_GRAD, GOLD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { ScaleTouchable } from '@/src/components/explore/ScaleTouchable';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { DigitalItemCard, FeaturedDigitalCard, VOTE_GRAD } from '@/src/components/shop/DigitalItemCard';
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

  // Battle-meter style progress toward the spotlight item.
  const goal = featured && live ? featured.priceCoins : 0;
  const goalPct = goal > 0 ? Math.min(1, bal.dpcoin / goal) : 0;
  const countIn = (id: string | null) => (id ? digital.filter((i) => i.type === id).length : digital.length);

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: BRAND }]}>DP ARENA</Text>
          <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Shop</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/shop/orders' as any)} style={[styles.iconBtn, { backgroundColor: p.chip }]} accessibilityLabel="My orders">
          <Ionicons name="receipt-outline" size={20} color={p.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/shop/cart' as any)} style={[styles.iconBtn, { backgroundColor: p.chip }]} accessibilityLabel={`Cart, ${cartCount} items`}>
          <Ionicons name="cart-outline" size={21} color={p.text} />
          {cartCount > 0 && (
            <LinearGradient colors={VOTE_GRAD} style={[styles.dot, { borderColor: p.bg }]}>
              <Text style={styles.dotText}>{cartCount}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48, width: contentW, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Wallet HUD */}
        <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBorder}>
          <LinearGradient colors={['#1A1033', '#2D1B4E', '#14102A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroGlowA} />
            <View style={styles.heroGlowB} />
            <View style={styles.heroTop}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.livePillText}>WALLET</Text>
              </View>
              <View style={{ flex: 1 }} />
              <MaterialCommunityIcons name="sword-cross" size={16} color="rgba(255,255,255,0.5)" />
            </View>
            <View style={styles.heroRow}>
              <View style={styles.heroCoin}><CoinIcon size={28} /></View>
              <View>
                <Text style={styles.heroValue} accessibilityLabel={`${live ? bal.dpcoin : 'unknown'} DP coin`}>{live ? bal.dpcoin.toLocaleString() : '—'}</Text>
                <Text style={styles.heroUnit}>DP COIN BALANCE</Text>
              </View>
            </View>

            {goal > 0 && featured ? (
              <View style={styles.meter} accessible accessibilityLabel={goalPct >= 1 ? `You can unlock ${featured.name}` : `${bal.dpcoin} of ${goal} DP coin for ${featured.name}`}>
                <View style={styles.meterLabels}>
                  <Text style={styles.meterLabel} numberOfLines={1}>
                    {goalPct >= 1 ? 'Spotlight unlock ready!' : `Spotlight tak: ${featured.name}`}
                  </Text>
                  <Text style={styles.meterPct}>{Math.round(goalPct * 100)}%</Text>
                </View>
                <View style={styles.meterTrack}>
                  <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.max(4, goalPct * 100)}%`, height: '100%', borderRadius: 5 }} />
                </View>
              </View>
            ) : (
              <Text style={styles.heroSub}>Contest jeeto, DP coin pao. Phir yahan kharcho.</Text>
            )}

            <View style={styles.heroActions}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push('/explore/battles' as any)} accessibilityRole="button" activeOpacity={0.85}>
                <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.heroBtn}>
                  <Ionicons name="trophy" size={15} color="#FFF" />
                  <Text style={styles.heroBtnText}>Contest jeeto</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.heroBtn, styles.heroBtnGhost]} onPress={() => router.push('/rewards/inventory' as any)} accessibilityRole="button">
                <Ionicons name="bag-handle" size={15} color="#FFF" />
                <Text style={styles.heroBtnText}>My items</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </LinearGradient>

        {/* Digital items */}
        <SectionHead
          p={p}
          icon="sparkles"
          kicker="LOOT"
          title="Digital items"
          sub="Sab ko dikhega: profile, posts, comments aur leaderboard par"
          right={
            digital.length ? (
              <TouchableOpacity onPress={() => router.push('/rewards/store' as any)} style={[styles.seeAll, { backgroundColor: `${BRAND}14` }]} accessibilityRole="button" accessibilityLabel="See all digital items">
                <Text style={[styles.seeAllText, { color: BRAND }]}>See all</Text>
                <ArrowIcon variant="chevron" direction="right" size={11} color={BRAND} />
              </TouchableOpacity>
            ) : null
          }
        />

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
              <View style={{ paddingHorizontal: PAD, marginBottom: 16 }}>
                <FeaturedDigitalCard item={featured} p={p} viewer={viewer} width={contentW - PAD * 2} busy={buying === featured.itemId} affordable={affordable(featured)} onBuy={() => void onBuy(featured)} />
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {tabs.map((t) => (
                <Chip key={t.id ?? 'all'} p={p} on={digitalTab === t.id} icon={t.icon} label={t.label} count={countIn(t.id)} onPress={() => setDigitalTab(t.id)} />
              ))}
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
        <SectionHead p={p} icon="gift" kicker="REAL PRIZES" title="Products" sub="Ghar par delivery, price mein shipping included" />
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
                  <Chip key={c ?? 'all'} p={p} on={category === c} label={c ?? 'All'} capitalize onPress={() => setCategory(c)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.grid}>
              {productList.map((item) => {
                const inStock = item.variants.some((v) => v.inStock);
                const canAfford = !live || bal.dpcoin >= item.priceCoins;
                return (
                  <ScaleTouchable
                    key={item.id}
                    style={[styles.card, { width: cardW, backgroundColor: p.card, borderColor: item.featured ? `${GOLD}AA` : p.border }]}
                    onPress={() => router.push(`/shop/${encodeURIComponent(item.id)}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${item.priceCoins} DP coin${inStock ? '' : ', out of stock'}`}
                  >
                    <View style={[styles.img, { width: cardW }]}>
                      {item.images[0] ? (
                        <AppImage source={{ uri: item.images[0] }} displayWidth={cardW} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                      ) : (
                        <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.imgEmpty]}>
                          <Ionicons name="gift" size={30} color="rgba(255,255,255,0.9)" />
                        </LinearGradient>
                      )}
                      <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
                      {item.featured ? (
                        <View style={[styles.pill, styles.pillTL, { backgroundColor: 'rgba(240,65,62,0.92)' }]}>
                          <Ionicons name="flame" size={10} color="#FFF" />
                          <Text style={styles.pillText}>HOT</Text>
                        </View>
                      ) : null}
                      <View style={styles.pricePill}>
                        <CoinIcon size={13} color={GOLD} />
                        <Text style={styles.pricePillText}>{item.priceCoins.toLocaleString()}</Text>
                      </View>
                      {!inStock ? (
                        <View style={[StyleSheet.absoluteFill, styles.soldOut]}>
                          <Text style={styles.soldOutText}>SOLD OUT</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingTop: 9, paddingBottom: 10, gap: 6 }}>
                      <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{item.title}</Text>
                      <View style={styles.productMeta}>
                        <Ionicons name="car" size={12} color={p.sub} />
                        <Text style={[styles.metaText, { color: p.sub }]}>Delivery included</Text>
                        <View style={{ flex: 1 }} />
                        {inStock && !canAfford ? <Ionicons name="lock-closed" size={12} color={p.sub} /> : null}
                      </View>
                    </View>
                  </ScaleTouchable>
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

type Palette = ReturnType<typeof useExplorePalette>;

function SectionHead({ p, icon, kicker, title, sub, right }: { p: Palette; icon: string; kicker: string; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHead}>
      <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sectionIcon}>
        <Ionicons name={icon} size={17} color="#FFF" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionKicker, { color: p.sub }]}>{kicker}</Text>
        <Text style={[styles.sectionTitle, { color: p.text }]} accessibilityRole="header">{title}</Text>
        <Text style={[styles.sectionSub, { color: p.sub }]} numberOfLines={2}>{sub}</Text>
      </View>
      {right}
    </View>
  );
}

function Chip({ p, on, icon, label, count, capitalize, onPress }: { p: Palette; on: boolean; icon?: string; label: string; count?: number; capitalize?: boolean; onPress: () => void }) {
  const inner = (
    <>
      {icon ? <Ionicons name={icon} size={14} color={on ? '#FFF' : p.sub} /> : null}
      <Text style={[styles.tabText, { color: on ? '#FFF' : p.text }, capitalize && { textTransform: 'capitalize' }]}>{label}</Text>
      {count !== undefined ? (
        <View style={[styles.tabCount, { backgroundColor: on ? 'rgba(255,255,255,0.25)' : p.border }]}>
          <Text style={[styles.tabCountText, { color: on ? '#FFF' : p.sub }]}>{count}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} activeOpacity={0.85}>
      {on ? (
        <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tab}>{inner}</LinearGradient>
      ) : (
        <View style={[styles.tab, { backgroundColor: p.chip, borderColor: p.border, borderWidth: 1 }]}>{inner}</View>
      )}
    </TouchableOpacity>
  );
}

function ComingSoon({ p, icon, text }: { p: Palette; icon: string; text: string }) {
  return (
    <View style={[styles.soon, { backgroundColor: p.card, borderColor: p.border }]}>
      <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.soonIcon}>
        <Ionicons name={icon} size={20} color="#FFF" />
      </LinearGradient>
      <Text style={[styles.soonText, { color: p.sub }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 16, gap: 8 },
  kicker: { fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 1.6 },
  title: { fontSize: 24, fontFamily: 'Urbanist-Black', fontStyle: 'italic', marginTop: -2 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -4, right: -4, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2 },
  dotText: { color: '#fff', fontSize: 10, fontFamily: 'Urbanist-Black' },

  heroBorder: { marginHorizontal: PAD, marginTop: 6, borderRadius: 26, padding: 1.5 },
  hero: { borderRadius: 24.5, padding: 16, overflow: 'hidden' },
  heroGlowA: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,77,103,0.22)', top: -80, right: -50 },
  heroGlowB: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(139,92,246,0.25)', bottom: -60, left: -30 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22A559' },
  livePillText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 0.8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  heroCoin: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(245,158,11,0.16)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.45)', alignItems: 'center', justifyContent: 'center' },
  heroValue: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 34, lineHeight: 38 },
  heroUnit: { color: GOLD, fontFamily: 'Urbanist-Black', fontSize: 10.5, letterSpacing: 1.2 },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Urbanist-Medium', fontSize: 12.5, marginTop: 12 },
  meter: { marginTop: 14 },
  meterLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  meterLabel: { flex: 1, color: 'rgba(255,255,255,0.85)', fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
  meterPct: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 12 },
  meterTrack: { height: 9, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, height: 44, paddingHorizontal: 14 },
  heroBtnGhost: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroBtnText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 14 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: PAD, marginTop: 26, marginBottom: 14 },
  sectionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sectionKicker: { fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 1.4 },
  sectionTitle: { fontFamily: 'Urbanist-Black', fontSize: 19, marginTop: -1 },
  sectionSub: { fontFamily: 'Urbanist-Medium', fontSize: 11.5, marginTop: 1 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100 },
  seeAllText: { fontFamily: 'Urbanist-Bold', fontSize: 12.5 },

  tabs: { gap: 8, paddingHorizontal: PAD, paddingBottom: 14 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18 },
  tabText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  tabCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { fontFamily: 'Urbanist-Black', fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: PAD },

  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  img: { aspectRatio: 1, overflow: 'hidden' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 100 },
  pillTL: { position: 'absolute', top: 8, left: 8 },
  pillText: { color: '#FFF', fontSize: 10, fontFamily: 'Urbanist-Black', letterSpacing: 0.5 },
  pricePill: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  pricePillText: { color: GOLD, fontFamily: 'Urbanist-Black', fontSize: 13 },
  soldOut: { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  soldOutText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 14, letterSpacing: 1.5, borderWidth: 2, borderColor: '#FFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, transform: [{ rotate: '-8deg' }] },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: 'Urbanist-SemiBold', fontSize: 11 },

  soon: { marginHorizontal: PAD, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  soonIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  soonText: { flex: 1, fontFamily: 'Urbanist-SemiBold', fontSize: 13.5 },
});
