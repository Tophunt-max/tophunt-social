import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@/src/lib/icons';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { DealCard, ProductTile } from '@/src/components/shop/ShopTiles';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { CategoryGrid } from '@/src/components/shop/premium/CategoryGrid';
import { CoinBalanceCard } from '@/src/components/shop/premium/CoinBalanceCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { FeaturedCollectionBanner } from '@/src/components/shop/premium/FeaturedCollectionBanner';
import { ShopHeader } from '@/src/components/shop/premium/ShopHeader';
import { ShopNavigationTabs } from '@/src/components/shop/premium/ShopNavigationTabs';
import { Chip, EmptyState, ErrorState, SectionHeader, ShopSkeleton } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useCoinRate } from '@/src/hooks/useCoinRate';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import {
  NO_FILTER,
  buildRails,
  deriveCategories,
  featuredView,
  filterDigital,
  giftsCategory,
  isShort,
  parseShopTab,
  presentRarities,
  trendingGrid,
  type DigitalFilter,
  type ShopTab,
} from '@/src/lib/shopModel';
import { useGiftCatalog, useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { TH, asExplorePalette, gridCellWidth, gridColumns, rarityToken, useTophuntPalette, type TophuntPalette } from '@/src/theme/tophunt';

const GAP = 12;

/** Wall clock that updates once a minute: enough for "new" windows and sale ends on the overview. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
const RAIL_GAP = 12;

/**
 * DP Arena Shop: spend 🪙 DP coin (won in contests) on digital items (frames,
 * themes, badges, titles, shown to everyone on your profile, posts and
 * comments) and on real products. Prices are set by TopHunt and re-checked by
 * the server when buying; delivery is included for products.
 *
 * Tabs: Shop (overview), Digital (full catalogue with filters), Physical
 * (products), and My Collection (a link to /rewards/inventory).
 * `/shop?tab=digital` and `/shop?tab=physical` open on that tab.
 *
 * Every rail and badge here comes from real server data (src/lib/shopModel.ts):
 * nothing is shown as new, popular, limited or featured without a signal for it.
 */
export default function ShopScreen() {
  const p = useTophuntPalette();
  const ep = useMemo(() => asExplorePalette(p), [p]);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const rate = useCoinRate();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const store = useStore(!!user && cfg.store.enabled);
  const gifts = useGiftCatalog(!!user && cfg.gifts.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });

  const [tab, setTabState] = useState<ShopTab>(() => parseShopTab(params.tab, cfg.store.enabled, cfg.shop.enabled));
  useEffect(() => {
    if (params.tab) setTabState(parseShopTab(params.tab, cfg.store.enabled, cfg.shop.enabled));
  }, [params.tab, cfg.store.enabled, cfg.shop.enabled]);
  const [filter, setFilter] = useState<DigitalFilter>(NO_FILTER);
  const [category, setCategory] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // The shop is not drawn in the phone column on web (app/_layout.tsx), so it
  // lays out for the real window, capped at the content width.
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, TH.maxContentWidth);
  const pad = contentW >= 700 ? 24 : 16;
  const cols = gridColumns(contentW);
  const cellW = gridCellWidth(contentW, cols, GAP, pad);
  const railW = cols === 2 ? Math.round((contentW - pad) / 2.25) : Math.min(cellW, 240);
  const dealW = Math.min(contentW - pad * 2 - 28, 380);

  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const now = useMinuteClock();
  const digital = useMemo(() => store.data ?? [], [store.data]);
  const feature = useMemo(() => featuredView(cfg.store.featured, digital, now), [cfg.store.featured, digital, now]);
  const categories = useMemo(() => deriveCategories(digital), [digital]);
  const giftCard = giftsCategory(cfg.gifts.enabled, gifts.data?.length);
  const rails = useMemo(() => buildRails(digital, now, { hasFeatured: !!feature }), [digital, now, feature]);
  const trending = useMemo(() => trendingGrid(digital, cols * 2), [digital, cols]);
  const rarities = useMemo(() => presentRarities(digital), [digital]);
  const shown = useMemo(() => filterDigital(digital, filter), [digital, filter]);

  const allProducts = useMemo(() => products.data ?? [], [products.data]);
  const productCats = useMemo(() => [...new Set(allProducts.map((x) => x.category))], [allProducts]);
  const productList = useMemo(() => allProducts.filter((x) => !category || x.category === category), [allProducts, category]);
  // Hot deals: products the admin marked featured that are in stock.
  const deals = useMemo(() => allProducts.filter((x) => x.featured && x.variants.some((v) => v.inStock)).slice(0, 8), [allProducts]);

  const setTab = (t: ShopTab) => {
    setTabState(t);
    router.setParams({ tab: t === 'shop' ? undefined : t });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  const openDigital = (f: Partial<DigitalFilter>) => {
    setFilter({ ...NO_FILTER, ...f });
    setTab('digital');
  };
  const openItem = (id: string) => router.push(`/shop/item/${encodeURIComponent(id)}` as any);
  const openProduct = (id: string) => router.push(`/shop/${encodeURIComponent(id)}` as any);
  const canAfford = (coins: number) => !live || bal.dpcoin >= coins;
  const short = (i: StoreItemView) => isShort(bal.dpcoin, i.priceCoins, live);

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
    if (cfg.gifts.enabled) void gifts.refetch();
  };

  const card = (item: StoreItemView, w: number) => (
    <DigitalItemCard
      key={item.itemId}
      item={item}
      width={w}
      p={p}
      viewer={viewer}
      busy={buying === item.itemId}
      short={short(item)}
      onOpen={() => openItem(item.itemId)}
      onBuy={() => void onBuy(item)}
    />
  );

  const digitalState = !cfg.store.enabled ? (
    <View style={{ paddingHorizontal: pad }}>
      <EmptyState p={p} icon="sparkles" title="Digital items jaldi aa rahe hain" text="Store abhi band hai. Tab tak contest jeet kar DP coin jama karo." action={cfg.shop.enabled ? { label: 'Physical products dekho', onPress: () => setTab('physical') } : undefined} />
    </View>
  ) : store.isLoading ? (
    <ShopSkeleton p={p} cellW={cellW} cols={cols} pad={pad} />
  ) : store.isError ? (
    <View style={{ paddingHorizontal: pad }}><ErrorState p={p} text="Digital items load nahi hue." onRetry={() => void store.refetch()} /></View>
  ) : !digital.length ? (
    <View style={{ paddingHorizontal: pad }}><EmptyState p={p} icon="sparkles" text="Abhi koi digital item sale par nahi hai." /></View>
  ) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={{ width: contentW, alignSelf: 'center' }}>
        <ShopHeader
          p={p}
          pad={pad}
          live={live}
          dpcoin={bal.dpcoin}
          cartCount={cartCount}
          onOrders={() => router.push('/shop/orders' as any)}
          onCart={() => router.push('/shop/cart' as any)}
        />
        <View style={{ marginTop: 8 }}>
          <ShopNavigationTabs
            p={p}
            pad={pad}
            tab={tab}
            onTab={setTab}
            onCollection={() => router.push('/rewards/inventory' as any)}
            counts={{ digital: cfg.store.enabled && store.data ? digital.length : undefined, physical: cfg.shop.enabled && products.data ? allProducts.length : undefined }}
          />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 56, width: contentW, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TH.colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'shop' ? (
          <>
            {feature ? (
              <View style={{ paddingHorizontal: pad, marginTop: 14 }}>
                <FeaturedCollectionBanner
                  feature={feature}
                  viewer={viewer}
                  width={contentW - pad * 2}
                  onExplore={() => openDigital({ ids: feature.itemIds })}
                  onOpenHero={() => openItem(feature.hero.itemId)}
                />
              </View>
            ) : null}
            <View style={{ paddingHorizontal: pad, marginTop: 14 }}>
              <CoinBalanceCard live={live} dpcoin={bal.dpcoin} rate={rate} onEarn={() => router.push('/explore/battles' as any)} />
            </View>
            {digitalState ?? (
              <>
                <SectionHeader p={p} pad={pad} title="Categories" sub="Jo shop mein abhi hai" />
                <CategoryGrid
                  p={p}
                  pad={pad}
                  cellW={cellW}
                  viewer={viewer}
                  categories={categories}
                  gifts={giftCard}
                  onPick={(type) => openDigital({ type })}
                  onGifts={() => router.push('/wallet/gifts' as any)}
                />
                {rails.map((r) => (
                  <View key={r.id}>
                    <SectionHeader
                      p={p}
                      pad={pad}
                      title={r.title}
                      sub={r.sub}
                      action={{ label: 'Sab dekho', onPress: () => openDigital({ ids: r.items.map((i) => i.itemId) }) }}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={railW + RAIL_GAP} decelerationRate="fast" contentContainerStyle={[styles.rail, { paddingHorizontal: pad }]}>
                      {r.items.map((i) => card(i, railW))}
                    </ScrollView>
                  </View>
                ))}
                <SectionHeader p={p} pad={pad} title={trending.title} sub={trending.sub} action={{ label: 'Sab dekho', onPress: () => openDigital({}) }} />
                <View style={[styles.grid, { paddingHorizontal: pad }]}>{trending.items.map((i) => card(i, cellW))}</View>
              </>
            )}
            {cfg.shop.enabled && deals.length ? (
              <>
                <SectionHeader p={p} pad={pad} title="Hot deals" sub="Ghar par delivery, price mein shipping included" action={{ label: 'Physical', onPress: () => setTab('physical') }} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={dealW + RAIL_GAP} decelerationRate="fast" contentContainerStyle={[styles.rail, { paddingHorizontal: pad }]}>
                  {deals.map((item) => (
                    <DealCard key={item.id} item={item} width={dealW} p={ep} canAfford={canAfford(item.priceCoins)} onPress={() => openProduct(item.id)} />
                  ))}
                </ScrollView>
              </>
            ) : null}
          </>
        ) : tab === 'digital' ? (
          digitalState ?? (
            <DigitalCatalogue
              p={p}
              pad={pad}
              filter={filter}
              setFilter={setFilter}
              categories={categories}
              rarities={rarities}
              total={digital.length}
              shown={shown}
              render={(i) => card(i, cellW)}
            />
          )
        ) : !cfg.shop.enabled ? (
          <View style={{ paddingHorizontal: pad }}><EmptyState p={p} icon="bag-handle" title="Shop abhi band hai" text="Physical products jaldi aa rahe hain!" /></View>
        ) : products.isLoading ? (
          <ShopSkeleton p={p} cellW={cellW} cols={cols} pad={pad} />
        ) : products.isError ? (
          <View style={{ paddingHorizontal: pad }}><ErrorState p={p} text="Products load nahi hue." onRetry={() => void products.refetch()} /></View>
        ) : !allProducts.length ? (
          <View style={{ paddingHorizontal: pad }}>
            <EmptyState p={p} icon="gift" text="Products jaldi aa rahe hain. Tab tak digital items try karo!" action={cfg.store.enabled ? { label: 'Digital items dekho', onPress: () => setTab('digital') } : undefined} />
          </View>
        ) : (
          <>
            {deals.length ? (
              <>
                <SectionHeader p={p} pad={pad} title="Hot deals" sub="Featured products, stock mein" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={dealW + RAIL_GAP} decelerationRate="fast" contentContainerStyle={[styles.rail, { paddingHorizontal: pad }]}>
                  {deals.map((item) => (
                    <DealCard key={item.id} item={item} width={dealW} p={ep} canAfford={canAfford(item.priceCoins)} onPress={() => openProduct(item.id)} />
                  ))}
                </ScrollView>
              </>
            ) : null}
            <SectionHeader p={p} pad={pad} title="Sab products" sub="Ghar par delivery, price mein shipping included" action={{ label: 'My orders', onPress: () => router.push('/shop/orders' as any) }} />
            {productCats.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingHorizontal: pad }]}>
                {[null, ...productCats].map((c) => (
                  <Chip key={c ?? 'all'} p={p} label={c ? c.charAt(0).toUpperCase() + c.slice(1) : 'All'} on={category === c} onPress={() => setCategory(c)} />
                ))}
              </ScrollView>
            ) : null}
            <View style={[styles.grid, { paddingHorizontal: pad }]}>
              {productList.map((item) => (
                <ProductTile key={item.id} item={item} width={cellW} p={ep} canAfford={canAfford(item.priceCoins)} onPress={() => openProduct(item.id)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

/** The Digital tab: search, category and rarity chips over the getStore result (client-side). */
function DigitalCatalogue({
  p, pad, filter, setFilter, categories, rarities, total, shown, render,
}: {
  p: TophuntPalette;
  pad: number;
  filter: DigitalFilter;
  setFilter: (f: DigitalFilter) => void;
  categories: { type: string; label: string; count: number; icon: string }[];
  rarities: string[];
  total: number;
  shown: StoreItemView[];
  render: (i: StoreItemView) => React.ReactNode;
}) {
  const filtered = !!(filter.type || filter.rarity || filter.query.trim() || filter.ids);
  return (
    <>
      <View style={[styles.searchWrap, { marginHorizontal: pad, backgroundColor: p.card, borderColor: p.border }]}>
        <Ionicons name="search" size={16} color={p.sub} />
        <TextInput
          value={filter.query}
          onChangeText={(q) => setFilter({ ...filter, query: q })}
          placeholder="Frames, themes, badges dhoondo"
          placeholderTextColor={p.sub}
          style={[styles.search, { color: p.text }]}
          accessibilityLabel="Digital items search"
          returnKeyType="search"
          autoCorrect={false}
        />
        {filter.query ? (
          <TouchableOpacity onPress={() => setFilter({ ...filter, query: '' })} accessibilityRole="button" accessibilityLabel="Search clear karo" hitSlop={8}>
            <CloseIcon variant="circle" size={18} color={p.sub} />
          </TouchableOpacity>
        ) : null}
      </View>
      {filter.ids ? (
        <View style={[styles.chips, { paddingHorizontal: pad, marginTop: 12 }]}>
          <Chip p={p} icon="star" label={`Chune hue items · ${filter.ids.length} · hatao`} on onPress={() => setFilter({ ...filter, ids: null })} />
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingHorizontal: pad, marginTop: 12 }]}>
        <Chip p={p} label="All" count={total} on={!filter.type} onPress={() => setFilter({ ...filter, type: null })} />
        {categories.map((c) => (
          <Chip key={c.type} p={p} icon={c.icon} label={c.label} count={c.count} on={filter.type === c.type} onPress={() => setFilter({ ...filter, type: filter.type === c.type ? null : c.type })} />
        ))}
      </ScrollView>
      {rarities.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingHorizontal: pad, marginTop: 8 }]}>
          <Chip p={p} label="Har rarity" on={!filter.rarity} onPress={() => setFilter({ ...filter, rarity: null })} />
          {rarities.map((r) => (
            <Chip key={r} p={p} label={rarityToken(r).label} on={filter.rarity === r} onPress={() => setFilter({ ...filter, rarity: filter.rarity === r ? null : r })} />
          ))}
        </ScrollView>
      ) : null}
      <SectionHeader p={p} pad={pad} title={filtered ? `${shown.length} items mile` : 'Sab digital items'} sub="Profile, posts, comments aur leaderboard par sab ko dikhega" />
      {shown.length ? (
        <View style={[styles.grid, { paddingHorizontal: pad }]}>{shown.map(render)}</View>
      ) : (
        <View style={{ paddingHorizontal: pad, width: '100%' }}>
          <EmptyState p={p} icon="search" text="Is filter mein koi item nahi mila." action={{ label: 'Filters hatao', onPress: () => setFilter(NO_FILTER) }} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  rail: { gap: RAIL_GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  chips: { gap: 8, alignItems: 'center', flexDirection: 'row' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 14, marginTop: 14 },
  search: { flex: 1, fontFamily: TH.fonts.medium, fontSize: 14, paddingVertical: 0 },
});
