import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { BRAND, BRAND_GRAD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { DealCard, DigitalTile, ProductTile, SpotlightCard } from '@/src/components/shop/ShopTiles';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { useDesignWindow } from '@/src/lib/layout';

type Palette = ReturnType<typeof useExplorePalette>;
type Mode = 'digital' | 'physical';

const DIGITAL_TABS: { id: string | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'frame', label: 'Frames' },
  { id: 'theme', label: 'Themes' },
  { id: 'badge', label: 'Badges' },
  { id: 'title', label: 'Titles' },
];

const RARITY_RANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
const RAIL_MAX = 5;

/**
 * Shopping: spend 🪙 DP coin (won in contests) on digital items (frames,
 * themes, badges, titles, shown to everyone on your profile, posts and
 * comments) and on real products. Prices are set by TopHunt and re-checked by
 * the server when buying; delivery is included for products.
 *
 * Both catalogues live on this one screen behind the Digital | Physical switch
 * in the header card. `/shop?tab=physical` opens straight on products.
 */
export default function ShopScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const store = useStore(!!user && cfg.store.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const [mode, setMode] = useState<Mode>(() =>
    params.tab === 'physical' || (!cfg.store.enabled && cfg.shop.enabled) ? 'physical' : 'digital',
  );
  const [category, setCategory] = useState<string | null>(null);
  const [digitalTab, setDigitalTab] = useState<string | null>(null);
  const { width } = useDesignWindow();
  const contentW = Math.min(width, 640);
  const cardW = (contentW - PAD * 2 - 12) / 2;
  const railW = Math.min(contentW - PAD * 2 - 28, 360);
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });

  const viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const affordable = (i: StoreItemView) => !live || bal.dpcoin >= i.priceCoins;
  const canAfford = (coins: number) => !live || bal.dpcoin >= coins;

  const digital = useMemo(() => store.data ?? [], [store.data]);
  const digitalShown = useMemo(() => digital.filter((i) => !digitalTab || i.type === digitalTab), [digital, digitalTab]);
  // Spotlight rail: the rarest items the viewer does not own yet (ties: the dearest).
  const spotlight = useMemo(
    () =>
      [...digital]
        .filter((i) => !i.owned)
        .sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || b.priceCoins - a.priceCoins)
        .slice(0, RAIL_MAX),
    [digital],
  );
  const tabs = useMemo(() => DIGITAL_TABS.filter((t) => !t.id || digital.some((i) => i.type === t.id)), [digital]);

  const allProducts = useMemo(() => products.data ?? [], [products.data]);
  const categories = useMemo(() => [...new Set(allProducts.map((x) => x.category))], [allProducts]);
  const productList = useMemo(() => allProducts.filter((x) => !category || x.category === category), [allProducts, category]);
  // Hot deals rail: featured products that are in stock.
  const deals = useMemo(() => allProducts.filter((x) => x.featured && x.variants.some((v) => v.inStock)).slice(0, RAIL_MAX), [allProducts]);

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
  };
  const openProduct = (id: string) => router.push(`/shop/${encodeURIComponent(id)}` as any);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48, width: contentW, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Header card: nav, balance, Digital | Physical switch */}
        <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroBlobA} />
          <View style={styles.heroBlobB} />
          <View style={styles.heroBlobC} />

          <View style={styles.nav}>
            <BackButton size={22} color="#FFF" style={styles.glassBtn} />
            <Text style={styles.navTitle} accessibilityRole="header">Shop</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => router.push('/shop/orders' as any)} style={styles.glassBtn} accessibilityLabel="My orders">
              <Ionicons name="receipt-outline" size={19} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/shop/cart' as any)} style={styles.glassBtn} accessibilityLabel={`Cart, ${cartCount} items`}>
              <Ionicons name="cart-outline" size={20} color="#FFF" />
              {cartCount > 0 && (
                <View style={styles.cartDot}>
                  <Text style={styles.cartDotText}>{cartCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.balanceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>Aapke DP coin</Text>
              <View style={styles.balanceValueRow}>
                <CoinIcon size={26} />
                <Text style={styles.balanceValue} accessibilityLabel={`${live ? bal.dpcoin : 'unknown'} DP coin`}>
                  {live ? bal.dpcoin.toLocaleString() : '—'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/explore/battles' as any)} style={styles.earnBtn} accessibilityRole="button" accessibilityLabel="Win contests to earn DP coin">
              <Ionicons name="trophy" size={14} color={BRAND} />
              <Text style={styles.earnText}>Kamao</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.switch} accessibilityRole="tablist">
            <SwitchButton on={mode === 'digital'} icon="sparkles" label="Digital" count={cfg.store.enabled ? digital.length : undefined} onPress={() => setMode('digital')} />
            <SwitchButton on={mode === 'physical'} icon="gift" label="Physical" count={cfg.shop.enabled ? allProducts.length : undefined} onPress={() => setMode('physical')} />
          </View>
        </LinearGradient>

        {mode === 'digital' ? (
          !cfg.store.enabled ? (
            <ComingSoon p={p} icon="sparkles" text="Digital items jaldi aa rahe hain." />
          ) : store.isLoading ? (
            <ActivityIndicator color={BRAND} style={{ marginVertical: 40 }} />
          ) : store.isError ? (
            <View style={{ marginTop: 20 }}><SectionError palette={p} onRetry={() => store.refetch()} label="Digital items load nahi hue." /></View>
          ) : !digital.length ? (
            <ComingSoon p={p} icon="sparkles" text="Abhi koi digital item sale par nahi hai." />
          ) : (
            <>
              {spotlight.length ? (
                <>
                  <RailHead p={p} title="Spotlight" sub="Sabse rare items, jo aapke paas nahi hain" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={railW + 12} decelerationRate="fast" contentContainerStyle={styles.rail}>
                    {spotlight.map((item) => (
                      <SpotlightCard key={item.itemId} item={item} width={railW} p={p} viewer={viewer} busy={buying === item.itemId} affordable={affordable(item)} onBuy={() => void onBuy(item)} />
                    ))}
                  </ScrollView>
                </>
              ) : null}
              <RailHead
                p={p}
                title="Sab items"
                sub="Profile, posts, comments aur leaderboard par sab ko dikhega"
                action={{ label: 'My items', onPress: () => router.push('/rewards/inventory' as any) }}
              />
              <UnderlineTabs p={p} items={tabs.map((t) => ({ key: t.id ?? 'all', label: t.label, on: digitalTab === t.id, onPress: () => setDigitalTab(t.id) }))} />
              <View style={styles.grid}>
                {digitalShown.map((item) => (
                  <DigitalTile
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
          )
        ) : !cfg.shop.enabled ? (
          <ComingSoon p={p} icon="bag-handle" text="Shop abhi band hai. Jaldi aa raha hai!" />
        ) : products.isLoading ? (
          <ActivityIndicator color={BRAND} style={{ marginVertical: 40 }} />
        ) : products.isError ? (
          <View style={{ marginTop: 20 }}><SectionError palette={p} onRetry={() => products.refetch()} label="Products load nahi hue." /></View>
        ) : !allProducts.length ? (
          <ComingSoon p={p} icon="gift" text="Products jaldi aa rahe hain. Tab tak digital items try karo!" />
        ) : (
          <>
            {deals.length ? (
              <>
                <RailHead p={p} title="Hot deals" sub="Abhi sabse zyada demand mein" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={railW + 12} decelerationRate="fast" contentContainerStyle={styles.rail}>
                  {deals.map((item) => (
                    <DealCard key={item.id} item={item} width={railW} p={p} canAfford={canAfford(item.priceCoins)} onPress={() => openProduct(item.id)} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            <RailHead
              p={p}
              title="Sab products"
              sub="Ghar par delivery, price mein shipping included"
              action={{ label: 'My orders', onPress: () => router.push('/shop/orders' as any) }}
            />
            {categories.length > 1 ? (
              <UnderlineTabs
                p={p}
                capitalize
                items={[null, ...categories].map((c) => ({ key: c ?? 'all', label: c ?? 'All', on: category === c, onPress: () => setCategory(c) }))}
              />
            ) : null}
            <View style={styles.grid}>
              {productList.map((item) => (
                <ProductTile key={item.id} item={item} width={cardW} p={p} canAfford={canAfford(item.priceCoins)} onPress={() => openProduct(item.id)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

/** One half of the white-pill switch on the header card. */
function SwitchButton({ on, icon, label, count, onPress }: { on: boolean; icon: string; label: string; count?: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.switchBtn, on && styles.switchBtnOn]}
      activeOpacity={0.85}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${count !== undefined ? `, ${count} items` : ''}`}
    >
      <Ionicons name={icon} size={16} color={on ? BRAND : '#FFF'} />
      <Text style={[styles.switchText, { color: on ? '#1A1033' : '#FFF' }]}>{label}</Text>
      {count !== undefined ? (
        <View style={[styles.switchCount, { backgroundColor: on ? `${BRAND}1F` : 'rgba(255,255,255,0.22)' }]}>
          <Text style={[styles.switchCountText, { color: on ? BRAND : '#FFF' }]}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function RailHead({ p, title, sub, action }: { p: Palette; title: string; sub: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.railHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.railTitle, { color: p.text }]} accessibilityRole="header">{title}</Text>
        <Text style={[styles.railSub, { color: p.sub }]} numberOfLines={1}>{sub}</Text>
      </View>
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={styles.railAction} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.railActionText, { color: BRAND }]}>{action.label}</Text>
          <ArrowIcon variant="chevron" direction="right" size={11} color={BRAND} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Text tabs with a gradient underline on the selected one. */
function UnderlineTabs({ p, items, capitalize }: { p: Palette; items: { key: string; label: string; on: boolean; onPress: () => void }[]; capitalize?: boolean }) {
  return (
    <View style={[styles.utabsWrap, { borderColor: p.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.utabs}>
        {items.map((t) => (
          <TouchableOpacity key={t.key} onPress={t.onPress} style={styles.utab} accessibilityRole="tab" accessibilityState={{ selected: t.on }}>
            <Text style={[styles.utabText, { color: t.on ? p.text : p.sub, fontFamily: t.on ? 'Urbanist-Black' : 'Urbanist-SemiBold' }, capitalize && { textTransform: 'capitalize' }]}>
              {t.label}
            </Text>
            {t.on ? <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.utabLine} /> : <View style={styles.utabLineOff} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function ComingSoon({ p, icon, text }: { p: Palette; icon: string; text: string }) {
  return (
    <View style={[styles.soon, { backgroundColor: p.card, borderColor: p.border }]}>
      <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.soonIcon}>
        <Ionicons name={icon} size={24} color="#FFF" />
      </LinearGradient>
      <Text style={[styles.soonText, { color: p.sub }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  hero: { marginHorizontal: 12, marginTop: 6, borderRadius: 30, padding: 14, paddingBottom: 14, overflow: 'hidden' },
  heroBlobA: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.10)', top: -110, right: -60 },
  heroBlobB: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.07)', bottom: -50, left: -40 },
  heroBlobC: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)', top: 70, right: 110 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glassBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 20, marginLeft: 4 },
  cartDot: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cartDotText: { color: BRAND, fontFamily: 'Urbanist-Black', fontSize: 10 },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18, paddingHorizontal: 4 },
  balanceLabel: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Urbanist-SemiBold', fontSize: 13 },
  balanceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  balanceValue: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 36, lineHeight: 42 },
  earnBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFF', borderRadius: 100, paddingHorizontal: 14, height: 36, marginBottom: 4 },
  earnText: { color: BRAND, fontFamily: 'Urbanist-Black', fontSize: 13 },
  switch: { flexDirection: 'row', gap: 4, marginTop: 16, padding: 4, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.18)' },
  switchBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 100 },
  switchBtnOn: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  switchText: { fontFamily: 'Urbanist-Black', fontSize: 14.5 },
  switchCount: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  switchCountText: { fontFamily: 'Urbanist-Black', fontSize: 10 },

  railHead: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: PAD, marginTop: 24, marginBottom: 12, gap: 10 },
  railTitle: { fontFamily: 'Urbanist-Black', fontSize: 20 },
  railSub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 1 },
  railAction: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingBottom: 2 },
  railActionText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  rail: { gap: 12, paddingHorizontal: PAD },

  utabsWrap: { borderBottomWidth: 1, marginHorizontal: PAD, marginBottom: 14 },
  utabs: { gap: 20 },
  utab: { paddingTop: 4, alignItems: 'center' },
  utabText: { fontSize: 14, paddingBottom: 8 },
  utabLine: { height: 3, borderRadius: 2, alignSelf: 'stretch', marginBottom: -1 },
  utabLineOff: { height: 3, marginBottom: -1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: PAD },

  soon: { marginHorizontal: PAD, marginTop: 24, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 12 },
  soonIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  soonText: { fontFamily: 'Urbanist-SemiBold', fontSize: 14, textAlign: 'center' },
});
