import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@/src/lib/icons';
import { emitToast } from '@/src/lib/toastBridge';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { DealCard, ProductTile } from '@/src/components/shop/ShopTiles';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { HeroBanner } from '@/src/components/shop/premium/HeroBanner';
import {
  CollectionRow,
  CategoryGrid,
  DealsCard,
  FeatureCard,
  PhysicalBlock,
  QuickActionsBar,
  SectionHeader,
  TrendCard,
  type QuickAction,
} from '@/src/components/shop/premium/ShopHomeSections';
import { BagIcon, ClockIcon, FlameIcon, GoldBoxIcon, HeartIcon, ShirtIcon, StarIcon } from '@/src/components/shop/premium/ShopArt';
import { MOCK, MOCK_MARGIN, cellWidth, mockScale, px } from '@/src/components/shop/premium/mock';
import { ShopHeader } from '@/src/components/shop/premium/ShopHeader';
import { ShopNavigationTabs } from '@/src/components/shop/premium/ShopNavigationTabs';
import { Chip, EmptyState, ErrorState, SectionHeader as BlockHeader, ShopSkeleton } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import {
  NO_FILTER,
  cardTag,
  categoryTiles,
  collectionTiles,
  dealsBlock,
  deriveCategories,
  featuredCollection,
  featuredView,
  filterDigital,
  heroSlides,
  hotDeals,
  isShort,
  parseShopTab,
  presentRarities,
  trendingItems,
  withWishlist,
  type CategoryTile,
  type DigitalFilter,
  type ShopTab,
} from '@/src/lib/shopModel';
import { useInventory } from '@/src/services/gamification';
import { useGiftCatalog, useGiftHistory, useMonetizationConfig, useStore, useWishlist, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { TH, asExplorePalette, gridCellWidth, gridColumns, rarityToken, surfacesFor, type TophuntPalette } from '@/src/theme/tophunt';

const GAP = 12;
/** Page base colour of the reference mock. */
const PAGE_BG = '#0A0418';
/**
 * The Shop is a branded store surface drawn on the dark neon reference mock
 * (gold on deep purple), so the whole /shop screen uses the dark palette
 * whatever the system theme. Its artwork and gold text do not read on light.
 */
const P_SHOP = surfacesFor(true);

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

/** Vertical gap (scaled) between the bottom of one mock element and the top of the next. */
const gapY = (prevBottom: number, nextTop: number, u: number) => px(Math.max(0, nextTop - prevBottom), u);

/** Soft radial purple glows behind the page (static, does not scroll). */
const PageGlow = React.memo(function PageGlow({ width, height, u }: { width: number; height: number; u: number }) {
  const heroBottom = px(MOCK.hero.y + MOCK.hero.h, u);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="pg-a" cx={width * 0.08} cy={height * 0.05} r={Math.max(width, 400) * 0.7} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6D28D9" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#6D28D9" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="pg-b" cx={width * 0.92} cy={heroBottom + 40} r={Math.max(width, 400) * 0.55} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#A21CAF" stopOpacity={0.2} />
          <Stop offset="1" stopColor="#A21CAF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={width * 0.08} cy={height * 0.05} r={Math.max(width, 400) * 0.7} fill="url(#pg-a)" />
      <Circle cx={width * 0.92} cy={heroBottom + 40} r={Math.max(width, 400) * 0.55} fill="url(#pg-b)" />
    </Svg>
  );
});

/**
 * DP Arena Shop: spend 🪙 DP coin (won in contests) on digital items (frames,
 * themes, badges, titles, shown to everyone on your profile, posts and
 * comments) and on real products. Prices are set by TopHunt and re-checked by
 * the server when buying; delivery is included for products.
 *
 * Tabs: Shop (the home, a proportional replica of the reference mock: every
 * length is `mock px * u`, u = contentW / 748, see premium/mock.ts), Digital
 * (full catalogue with filters), Physical (products), and My Collection (a
 * link to /rewards/inventory). `/shop?tab=digital` and `/shop?tab=physical`
 * open on that tab.
 *
 * Every block and tag here comes from real server data (src/lib/shopModel.ts):
 * nothing is shown as new, trending, limited or featured without a signal for
 * it. Blocks the mock has but the data cannot fill yet are drawn as honest
 * "jaldi aa raha hai" placeholders (no prices, timers or discounts).
 */
export default function ShopScreen() {
  const p = P_SHOP;
  const ep = useMemo(() => asExplorePalette(p), [p]);
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const store = useStore(!!user && cfg.store.enabled);
  const gifts = useGiftCatalog(!!user && cfg.gifts.enabled);
  const giftsIn = useGiftHistory('received', !!user && cfg.gifts.enabled);
  const wishlist = useWishlist(!!user && cfg.store.enabled);
  const inventory = useInventory(!!user);
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
  const { width, height } = useWindowDimensions();
  const contentW = Math.min(width, TH.maxContentWidth);
  const u = mockScale(width);
  const margin = px(MOCK_MARGIN, u);
  const inner = contentW - margin * 2;
  // Digital / Physical tabs keep their responsive grid, on the same margins.
  const pad = Math.max(12, margin);
  const cols = gridColumns(contentW);
  const cellW = gridCellWidth(contentW, cols, GAP, pad);
  const dealW = Math.min(contentW - pad * 2 - 28, 380);
  const featGap = px(MOCK.feat.gap, u);
  const featW = cellWidth(inner, MOCK.feat.cols, featGap);
  const trendGap = px(MOCK.trend.gap, u);
  const trendW = cellWidth(inner, MOCK.trend.cols, trendGap);

  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const now = useMinuteClock();
  const digital = useMemo(() => store.data ?? [], [store.data]);
  const feature = useMemo(() => featuredView(cfg.store.featured, digital, now), [cfg.store.featured, digital, now]);
  const hero = useMemo(() => heroSlides(digital, feature), [digital, feature]);
  const categories = useMemo(() => deriveCategories(digital), [digital]);
  const tiles = useMemo(() => categoryTiles(digital, { enabled: cfg.gifts.enabled, count: gifts.data?.length }), [digital, cfg.gifts.enabled, gifts.data?.length]);
  const featured = useMemo(() => featuredCollection(digital, feature, MOCK.feat.cols), [digital, feature]);
  const trending = useMemo(() => trendingItems(digital, MOCK.trend.cols), [digital]);
  const giftPage = giftsIn.data?.pages?.[0];
  const collection = useMemo(
    () => collectionTiles(inventory.data?.items, { enabled: cfg.gifts.enabled, firstPage: giftPage?.items?.length ?? 0, more: giftPage?.nextCursor != null }),
    [inventory.data?.items, cfg.gifts.enabled, giftPage],
  );
  const rarities = useMemo(() => presentRarities(digital), [digital]);
  const wishIds = wishlist.data;
  const effective = useMemo(() => withWishlist(filter, wishIds), [filter, wishIds]);
  const shown = useMemo(() => filterDigital(digital, effective), [digital, effective]);

  const allProducts = useMemo(() => products.data ?? [], [products.data]);
  const productCats = useMemo(() => [...new Set(allProducts.map((x) => x.category))], [allProducts]);
  const productList = useMemo(() => allProducts.filter((x) => !category || x.category === category), [allProducts, category]);
  // Hot deals: products the admin marked featured that are in stock.
  const deals = useMemo(() => hotDeals(allProducts), [allProducts]);
  const homeDeals = useMemo(() => dealsBlock(cfg.shop.enabled, allProducts), [cfg.shop.enabled, allProducts]);

  const setTab = useCallback((t: ShopTab) => {
    setTabState(t);
    router.setParams({ tab: t === 'shop' ? undefined : t });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [router]);
  const openDigital = useCallback((f: Partial<DigitalFilter>) => {
    setFilter({ ...NO_FILTER, ...f });
    setTab('digital');
  }, [setTab]);
  const openItem = useCallback((id: string) => router.push(`/shop/item/${encodeURIComponent(id)}` as any), [router]);
  const openProduct = useCallback((id: string) => router.push(`/shop/${encodeURIComponent(id)}` as any), [router]);
  const openCollection = useCallback(() => router.push('/rewards/inventory' as any), [router]);
  const canAfford = (coins: number) => !live || bal.dpcoin >= coins;
  const short = (i: StoreItemView) => isShort(bal.dpcoin, i.priceCoins, live);
  // Back only when there is somewhere to go: native always (BackButton falls back to /home), web only with history.
  const showBack = Platform.OS !== 'web' || router.canGoBack();

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
    if (user) void inventory.refetch();
    if (user && cfg.store.enabled) void wishlist.refetch();
    if (user && cfg.gifts.enabled) {
      void gifts.refetch();
      void giftsIn.refetch();
    }
  };

  const onTile = useCallback((t: CategoryTile) => {
    if (t.soon) emitToast(`${t.label} jaldi aa raha hai`, 'info');
    else if (t.target === 'type' && t.type) openDigital({ type: t.type });
    else if (t.target === 'gifts') router.push('/wallet/gifts' as any);
    else if (t.target === 'all') openDigital({});
  }, [openDigital, router]);

  const qaIcon = Math.max(14, px(26, u));
  const quickActions: QuickAction[] = [
    { key: 'equip', icon: <ShirtIcon size={qaIcon} />, title: 'Equip Items', sub: 'Customize Profile', onPress: openCollection },
    ...(cfg.store.enabled && user
      ? [{ key: 'wish', icon: <HeartIcon size={qaIcon} />, title: 'Wishlist', sub: wishIds?.length ? `${wishIds.length} saved` : 'Save for Later', onPress: () => openDigital({ wishlist: true }) }]
      : []),
    { key: 'orders', icon: <GoldBoxIcon size={qaIcon} />, title: 'Orders', sub: 'Track & Manage', onPress: () => router.push('/shop/orders' as any) },
    { key: 'activity', icon: <ClockIcon size={qaIcon} />, title: 'Activity', sub: 'Purchase History', onPress: () => router.push('/wallet' as any) },
  ];

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

  const icon = px(MOCK.sectionIcon, u);
  const heroBottom = MOCK.hero.y + MOCK.hero.h;
  const physBottom = MOCK.deals.y + MOCK.deals.h;
  const colBottom = MOCK.col.y + MOCK.col.h;

  const home = (
    <View style={{ paddingHorizontal: margin }}>
      {hero && cfg.store.enabled ? (
        <View style={{ marginTop: gapY(MOCK.tabs.y + MOCK.tabs.h, MOCK.hero.y, u) }}>
          <HeroBanner
            hero={hero}
            viewer={viewer}
            u={u}
            onExplore={() => openDigital({ ids: hero.itemIds })}
            onOpenItem={openItem}
          />
        </View>
      ) : null}
      {digitalState ? (
        <View style={{ marginHorizontal: -margin, marginTop: px(10, u) }}>{digitalState}</View>
      ) : (
        <>
          <SectionHeader
            u={u}
            style={{ marginTop: gapY(heroBottom, MOCK.catHead.y, u) }}
            icon={<BagIcon size={icon} />}
            title="Shop Categories"
            action={{ label: 'View All', onPress: () => openDigital({}) }}
          />
          <View style={{ marginTop: gapY(MOCK.catHead.y + MOCK.catHead.h, MOCK.catRow1.y, u) }}>
            <CategoryGrid tiles={tiles} u={u} inner={inner} onPick={onTile} />
          </View>

          {featured.length ? (
            <>
              <SectionHeader
                u={u}
                style={{ marginTop: gapY(MOCK.catRow2.y + MOCK.catRow2.h, MOCK.featHead.y, u) }}
                icon={<StarIcon size={icon} />}
                title="Featured Collection"
                action={{ label: 'View All', onPress: () => openDigital({ ids: featured.map((i) => i.itemId) }) }}
              />
              <View style={[styles.row, { gap: featGap, marginTop: gapY(MOCK.featHead.y + MOCK.featHead.h, MOCK.feat.y, u) }]}>
                {featured.map((i) => <FeatureCard key={i.itemId} item={i} tag={cardTag(i, now)} u={u} width={featW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
              </View>
            </>
          ) : null}

          {trending.items.length ? (
            <>
              <SectionHeader
                u={u}
                style={{ marginTop: gapY(MOCK.feat.y + MOCK.feat.h, MOCK.trendHead.y, u) }}
                icon={<FlameIcon size={icon} />}
                title={trending.title}
                action={{ label: 'View All', onPress: () => openDigital({}) }}
              />
              <View style={[styles.row, { gap: trendGap, marginTop: gapY(MOCK.trendHead.y + MOCK.trendHead.h, MOCK.trend.y, u) }]}>
                {trending.items.map((i) => <TrendCard key={i.itemId} item={i} u={u} width={trendW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
              </View>
            </>
          ) : null}
        </>
      )}

      <View style={[styles.row, { marginTop: gapY(MOCK.trend.y + MOCK.trend.h, MOCK.physHead.y, u), gap: px(MOCK.deals.x - MOCK.physHead.blockW - 26, u), alignItems: 'flex-start' }]}>
        <PhysicalBlock products={homeDeals.products} u={u} onAll={() => setTab('physical')} onOpen={openProduct} />
        <DealsCard product={homeDeals.deal} u={u} onGrab={openProduct} onContest={() => router.push('/explore/battles' as any)} />
      </View>

      {user ? (
        <>
          <SectionHeader
            u={u}
            style={{ marginTop: gapY(physBottom, MOCK.colHead.y, u) }}
            icon={<BagIcon size={icon} />}
            title={inventory.data ? `My Collection (${collection.total}${collection.more ? '+' : ''} Items)` : 'My Collection'}
            action={{ label: 'Manage', onPress: openCollection }}
          />
          <View style={{ marginTop: gapY(MOCK.colHead.y + MOCK.colHead.h, MOCK.col.y, u) }}>
            {inventory.data ? (
              <CollectionRow tiles={collection.tiles} u={u} inner={inner} onPress={openCollection} />
            ) : inventory.isError ? (
              <View style={{ marginHorizontal: -margin }}>
                <View style={{ paddingHorizontal: pad }}><ErrorState p={p} text="Collection load nahi hui." onRetry={() => void inventory.refetch()} /></View>
              </View>
            ) : (
              <View style={[styles.row, { gap: px(MOCK.col.gap, u) }]} accessible accessibilityLabel="Collection load ho rahi hai">
                {Array.from({ length: MOCK.col.cols }, (_, i) => (
                  <View key={i} style={{ width: cellWidth(inner, MOCK.col.cols, px(MOCK.col.gap, u)), height: px(MOCK.col.h, u), borderRadius: px(MOCK.col.radius, u), backgroundColor: p.skeleton }} />
                ))}
              </View>
            )}
          </View>
        </>
      ) : null}

      <View style={{ marginTop: gapY(user ? colBottom : physBottom, MOCK.quick.y, u) }}>
        <QuickActionsBar actions={quickActions} u={u} width={inner} />
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: PAGE_BG }]}>
      {focused ? <StatusBar style="light" /> : null}
      <PageGlow width={width} height={height} u={u} />
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: px(MOCK.bottom, u) + insets.bottom + (tab === 'shop' ? 0 : 32), width: contentW, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TH.colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ paddingHorizontal: margin }}>
            <ShopHeader
              u={u}
              inner={inner}
              live={live}
              dpcoin={bal.dpcoin}
              diamonds={bal.diamonds}
              cartCount={cartCount}
              showBack={showBack}
              onOrders={() => router.push('/shop/orders' as any)}
              onCart={() => router.push('/shop/cart' as any)}
            />
            <View style={{ marginTop: gapY(MOCK.title.y + MOCK.title.h, MOCK.tabs.y, u) }}>
              <ShopNavigationTabs u={u} width={inner} tab={tab} onTab={setTab} onCollection={openCollection} />
            </View>
          </View>
          {tab === 'shop' ? (
            home
          ) : tab === 'digital' ? (
            digitalState ?? (
              <DigitalCatalogue
                p={p}
                pad={pad}
                filter={filter}
                setFilter={setFilter}
                wishlistCount={wishIds?.length ?? 0}
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
                  <BlockHeader p={p} pad={pad} title="Hot deals" sub="Featured products, stock mein" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={dealW + RAIL_GAP} decelerationRate="fast" contentContainerStyle={[styles.rail, { paddingHorizontal: pad }]}>
                    {deals.map((item) => (
                      <DealCard key={item.id} item={item} width={dealW} p={ep} canAfford={canAfford(item.priceCoins)} onPress={() => openProduct(item.id)} />
                    ))}
                  </ScrollView>
                </>
              ) : null}
              <BlockHeader p={p} pad={pad} title="Sab products" sub="Ghar par delivery, price mein shipping included" action={{ label: 'My orders', onPress: () => router.push('/shop/orders' as any) }} />
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
    </View>
  );
}

/** The Digital tab: search, category and rarity chips over the getStore result (client-side). */
function DigitalCatalogue({
  p, pad, filter, setFilter, wishlistCount, categories, rarities, total, shown, render,
}: {
  p: TophuntPalette;
  pad: number;
  filter: DigitalFilter;
  setFilter: (f: DigitalFilter) => void;
  wishlistCount: number;
  categories: { type: string; label: string; count: number; icon: string }[];
  rarities: string[];
  total: number;
  shown: StoreItemView[];
  render: (i: StoreItemView) => React.ReactNode;
}) {
  const filtered = !!(filter.type || filter.rarity || filter.query.trim() || filter.ids || filter.wishlist || filter.rarities?.length);
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
      {filter.wishlist || filter.ids || filter.rarities?.length ? (
        <View style={[styles.chips, { paddingHorizontal: pad, marginTop: 12, flexWrap: 'wrap' }]}>
          {filter.wishlist ? (
            <Chip p={p} icon="heart" label={`Wishlist · ${wishlistCount} · hatao`} on onPress={() => setFilter({ ...filter, wishlist: false, ids: null })} />
          ) : filter.ids ? (
            <Chip p={p} icon="star" label={`Chune hue items · ${filter.ids.length} · hatao`} on onPress={() => setFilter({ ...filter, ids: null })} />
          ) : null}
          {filter.rarities?.length ? (
            <Chip p={p} icon="sparkles" label={`${filter.rarities.map((r) => rarityToken(r).label).join(' + ')} · hatao`} on onPress={() => setFilter({ ...filter, rarities: null })} />
          ) : null}
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
      <BlockHeader p={p} pad={pad} title={filtered ? `${shown.length} items mile` : 'Sab digital items'} sub="Profile, posts, comments aur leaderboard par sab ko dikhega" />
      {shown.length ? (
        <View style={[styles.grid, { paddingHorizontal: pad }]}>{shown.map(render)}</View>
      ) : (
        <View style={{ paddingHorizontal: pad, width: '100%' }}>
          <EmptyState
            p={p}
            icon={filter.wishlist ? 'heart' : 'search'}
            text={filter.wishlist && !filter.type && !filter.rarity && !filter.query.trim() ? 'Wishlist khaali hai. Kisi item par dil dabao, wo yahan dikhega.' : 'Is filter mein koi item nahi mila.'}
            action={{ label: 'Filters hatao', onPress: () => setFilter(NO_FILTER) }}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  rail: { gap: RAIL_GAP },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  row: { flexDirection: 'row' },
  chips: { gap: 8, alignItems: 'center', flexDirection: 'row' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 14, marginTop: 14 },
  search: { flex: 1, fontFamily: TH.fonts.medium, fontSize: 14, paddingVertical: 0 },
});
