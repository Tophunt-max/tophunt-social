import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@/src/lib/icons';
import { emitToast } from '@/src/lib/toastBridge';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { DealCard, ProductTile } from '@/src/components/shop/ShopTiles';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { HeroBanner } from '@/src/components/shop/premium/HeroBanner';
import {
  AdminDealsCard,
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
import { BagIcon, BoltIcon, BoxIcon, ClockIcon, CrownIcon, FlameIcon, GoldBoxIcon, HeartIcon, ShirtIcon, StarIcon } from '@/src/components/shop/premium/ShopArt';
import { MOCK, MOCK_M, MOCK_MARGIN, MOCK_M_MARGIN, cellWidth, isMobileShop, mobileScale, mockScale, px } from '@/src/components/shop/premium/mock';
import { ShopHeader, ShopHeaderMobile } from '@/src/components/shop/premium/ShopHeader';
import { DealPager } from '@/src/components/shop/premium/DealPager';
import { ShopNavigationTabs, ShopNavigationTabsMobile } from '@/src/components/shop/premium/ShopNavigationTabs';
import {
  CategoryGridM,
  CollectionRowM,
  DealCardM,
  DealTimerPill,
  FeatureCardM,
  PhysicalRowM,
  QuickCardsM,
  SectionHeaderM,
  TrendCardM,
  UpgradeBannerM,
  type DealCardContent,
  type QuickCard,
} from '@/src/components/shop/premium/ShopHomeMobile';
import { CategoryRail, Chip, EmptyState, ErrorState, SectionHeader as BlockHeader, ShopSkeleton, type RailEntry } from '@/src/components/shop/premium/ShopBlocks';
import { BottomNav } from '@/src/components/home/BottomNav';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import {
  NO_FILTER,
  cardTag,
  categoryTiles,
  collectionTiles,
  UPGRADE_RARITIES,
  dealsBlock,
  dealsSummary,
  dealsTitle,
  deriveCategories,
  featuredCollection,
  giftsCategory,
  featuredView,
  filterDigital,
  heroSlides,
  hotDeals,
  isShort,
  mobileCategoryTiles,
  mobileCollectionTiles,
  parseShopTab,
  physicalPicks,
  presentRarities,
  resolveDealCards,
  showUpgradeBanner,
  trendingItems,
  withWishlist,
  type CategoryTile,
  type DigitalFilter,
  type ShopNav,
  type ShopTab,
} from '@/src/lib/shopModel';
import { useInventory } from '@/src/services/gamification';
import { useGiftCatalog, useGiftHistory, useMonetizationConfig, useStore, useWishlist, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { BRAND, TH, asExplorePalette, gridCellWidth, gridColumns, rarityToken, useTophuntPalette, type TophuntPalette } from '@/src/theme/tophunt';

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

/** Vertical gap (scaled) between the bottom of one mock element and the top of the next. */
const gapY = (prevBottom: number, nextTop: number, u: number) => px(Math.max(0, nextTop - prevBottom), u);

/** A very faint brand pink glow behind the page in dark mode only (static, does not scroll). */
const PageGlow = React.memo(function PageGlow({ width, height, heroBottom }: { width: number; height: number; heroBottom: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="pg-a" cx={width * 0.08} cy={height * 0.05} r={Math.max(width, 400) * 0.7} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND} stopOpacity={0.08} />
          <Stop offset="1" stopColor={BRAND} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="pg-b" cx={width * 0.92} cy={heroBottom + 40} r={Math.max(width, 400) * 0.55} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={BRAND} stopOpacity={0.06} />
          <Stop offset="1" stopColor={BRAND} stopOpacity={0} />
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
 * length is `mock px * u`. Phones (content < 700 px) follow the 340 px mobile
 * mock, u = width / 340 (MOCK_M, premium/ShopHomeMobile.tsx); wider screens
 * the 748 px desktop mock, u = contentW / 748 (MOCK, ShopHomeSections.tsx).
 * See premium/mock.ts), Digital
 * (full catalogue with filters), Physical (products), and My Collection (a
 * link to /shop/collection). `/shop?tab=digital` and `/shop?tab=physical`
 * open on that tab.
 *
 * Every block and tag here comes from real server data (src/lib/shopModel.ts):
 * nothing is shown as new, trending, limited or featured without a signal for
 * it. Blocks the mock has but the data cannot fill yet are drawn as honest
 * "jaldi aa raha hai" placeholders (no prices, timers or discounts).
 *
 * Colours follow the app's Dark Mode setting (useTophuntPalette): app
 * neutrals for page and cards, brand pink for buttons, tabs and links. Item
 * artwork and the hero slides stay on their dark stage in both modes.
 */
export default function ShopScreen() {
  const p = useTophuntPalette();
  const ep = useMemo(() => asExplorePalette(p), [p]);
  const router = useRouter();
  const focused = useIsFocused();
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
  const mobile = isMobileShop(contentW);
  const u = mockScale(width);
  const uM = mobileScale(contentW);
  const margin = mobile ? px(MOCK_M_MARGIN, uM) : px(MOCK_MARGIN, u);
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
  // Admin slider first (product targets are kept while products load), else the featured drop / fallback.
  const productsOrNull = useMemo(() => (cfg.shop.enabled ? products.data ?? null : []), [cfg.shop.enabled, products.data]);
  const hero = useMemo(
    () => heroSlides(digital, feature, { slider: cfg.store.slider, products: productsOrNull, shopEnabled: cfg.shop.enabled, now }),
    [digital, feature, cfg.store.slider, productsOrNull, cfg.shop.enabled, now],
  );
  const categories = useMemo(() => deriveCategories(digital), [digital]);
  const tiles = useMemo(() => categoryTiles(digital, { enabled: cfg.gifts.enabled, count: gifts.data?.length }), [digital, cfg.gifts.enabled, gifts.data?.length]);
  const featured = useMemo(() => featuredCollection(digital, feature, MOCK.feat.cols), [digital, feature]);
  const trending = useMemo(() => trendingItems(digital, MOCK.trend.cols), [digital]);
  const featuredM = useMemo(() => featuredCollection(digital, feature, MOCK_M.feat.cols), [digital, feature]);
  const trendingM = useMemo(() => trendingItems(digital, MOCK_M.trend.cols), [digital]);
  const tilesM = useMemo(() => mobileCategoryTiles(tiles), [tiles]);
  const deals0 = useMemo(() => dealsSummary(digital, now), [digital, now]);
  const upgrade = showUpgradeBanner(cfg.store.enabled, digital);
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
  const physM = useMemo(() => (cfg.shop.enabled && allProducts.length ? physicalPicks(allProducts, MOCK_M.phys.cols) : null), [cfg.shop.enabled, allProducts]);
  // Admin deal cards (their discount computed from real compare-at prices); none live → the automatic card below.
  const dealCards = useMemo(
    () => resolveDealCards(cfg.store.deals, cfg.store.enabled ? digital : [], cfg.shop.enabled ? allProducts : null, now),
    [cfg.store.deals, cfg.store.enabled, digital, cfg.shop.enabled, allProducts, now],
  );
  const dealsHeading = dealCards.length ? dealsTitle(cfg.store.deals) : 'Special Offers & Daily Deals';
  const [dealIdx, setDealIdx] = useState(0);
  const dealCur = dealCards[Math.min(dealIdx, Math.max(0, dealCards.length - 1))];
  // Phone deal card: a real store discount first, else an admin-featured product, else the honest placeholder.
  const dealContent: DealCardContent = cfg.store.enabled && deals0.items.length
    ? { kind: 'discount', summary: deals0 }
    : homeDeals.deal
      ? { kind: 'product', product: homeDeals.deal }
      : { kind: 'soon' };

  const setTab = useCallback((t: ShopTab) => {
    setTabState(t);
    router.setParams({ tab: t === 'shop' ? undefined : t });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [router]);
  // Digital / Physical are tabs INSIDE this one screen (setParams replaces the
  // url, it adds no history). So a category tile opened the Digital tab, and
  // Back (Android back button, iOS swipe, in-app back) left the whole Shop for
  // the screen before it. Back now first returns to the Shop home tab; from
  // there it leaves the Shop as before. Other navigations are not touched.
  const navigation = useNavigation();
  useEffect(() => {
    if (tab === 'shop') return;
    // A native-stack swipe cannot be cancelled once it starts, so it is off
    // while a sub-tab is open; the back button / gesture works again on Shop home.
    navigation.setOptions({ gestureEnabled: false });
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      const type = e?.data?.action?.type;
      if (type !== 'GO_BACK' && type !== 'POP') return;
      e.preventDefault();
      setFilter(NO_FILTER);
      setCategory(null);
      setTab('shop');
    });
    return () => {
      sub();
      navigation.setOptions({ gestureEnabled: true });
    };
  }, [navigation, tab, setTab]);
  const openDigital = useCallback((f: Partial<DigitalFilter>) => {
    setFilter({ ...NO_FILTER, ...f });
    setTab('digital');
  }, [setTab]);
  const openItem = useCallback((id: string) => router.push(`/shop/item/${encodeURIComponent(id)}` as any), [router]);
  const openProduct = useCallback((id: string) => router.push(`/shop/${encodeURIComponent(id)}` as any), [router]);
  const openCollection = useCallback(() => router.push('/shop/collection' as any), [router]);
  /** Admin slide / deal card target → Digital tab filter, Physical tab or an in-app route. */
  const followNav = useCallback((nav: ShopNav) => {
    if (nav.kind === 'digital') openDigital(nav.filter);
    else if (nav.kind === 'physical') setTab('physical');
    else router.push(nav.path as any);
  }, [openDigital, setTab, router]);
  const canAfford = (coins: number) => !live || bal.dpcoin >= coins;
  const short = (i: StoreItemView) => isShort(bal.dpcoin, i.priceCoins, live);
  // Back only when there is somewhere to go: native always (BackButton falls back to /home), web only with history.
  // The phone mock shows it only with real history.

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

  // Category rail under the tabs: Featured, every item type with live listings
  // (frames, themes, badges, titles, effects…), and Gifts when the catalogue has
  // some. Types with nothing on sale (VS / victory effects today) are left out
  // here; the Shop Categories grid below shows them as "jaldi aa raha hai".
  const gift = giftsCategory(cfg.gifts.enabled, gifts.data?.length);
  const rail: RailEntry[] = useMemo(() => {
    if (!cfg.store.enabled || !digital.length) return [];
    const out: RailEntry[] = [];
    if (featured.length) out.push({ key: 'featured', label: 'Featured', icon: 'star', onPress: () => openDigital({ ids: featured.map((i) => i.itemId) }) });
    for (const c of categories) out.push({ key: c.type, label: c.label, icon: c.icon, count: c.count, onPress: () => openDigital({ type: c.type }) });
    if (gift) out.push({ key: 'gifts', label: 'Virtual Gifts', icon: 'gift', count: gift.count, onPress: () => router.push('/wallet/gifts' as any) });
    return out;
  }, [cfg.store.enabled, digital.length, featured, categories, gift, openDigital, router]);

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
          <HeroBanner hero={hero} viewer={viewer} u={u} onNav={followNav} onOpenItem={openItem} />
        </View>
      ) : null}
      {digitalState ? (
        <View style={{ marginHorizontal: -margin, marginTop: px(10, u) }}>{digitalState}</View>
      ) : (
        <>
          <SectionHeader
            p={p}
            u={u}
            style={{ marginTop: gapY(heroBottom, MOCK.catHead.y, u) }}
            icon={<BagIcon size={icon} />}
            title="Shop Categories"
            action={{ label: 'View All', onPress: () => openDigital({}) }}
          />
          <View style={{ marginTop: gapY(MOCK.catHead.y + MOCK.catHead.h, MOCK.catRow1.y, u) }}>
            <CategoryGrid p={p} tiles={tiles} u={u} inner={inner} onPick={onTile} />
          </View>

          {featured.length ? (
            <>
              <SectionHeader
                p={p}
                u={u}
                style={{ marginTop: gapY(MOCK.catRow2.y + MOCK.catRow2.h, MOCK.featHead.y, u) }}
                icon={<StarIcon size={icon} />}
                title="Featured Collection"
                action={{ label: 'View All', onPress: () => openDigital({ ids: featured.map((i) => i.itemId) }) }}
              />
              <View style={[styles.row, { gap: featGap, marginTop: gapY(MOCK.featHead.y + MOCK.featHead.h, MOCK.feat.y, u) }]}>
                {featured.map((i) => <FeatureCard key={i.itemId} p={p} item={i} tag={cardTag(i, now)} u={u} width={featW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
              </View>
            </>
          ) : null}

          {trending.items.length ? (
            <>
              <SectionHeader
                p={p}
                u={u}
                style={{ marginTop: gapY(MOCK.feat.y + MOCK.feat.h, MOCK.trendHead.y, u) }}
                icon={<FlameIcon size={icon} />}
                title={trending.title}
                action={{ label: 'View All', onPress: () => openDigital({}) }}
              />
              <View style={[styles.row, { gap: trendGap, marginTop: gapY(MOCK.trendHead.y + MOCK.trendHead.h, MOCK.trend.y, u) }]}>
                {trending.items.map((i) => <TrendCard key={i.itemId} p={p} item={i} u={u} width={trendW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
              </View>
            </>
          ) : null}
        </>
      )}

      <View style={[styles.row, { marginTop: gapY(MOCK.trend.y + MOCK.trend.h, MOCK.physHead.y, u), gap: px(MOCK.deals.x - MOCK.physHead.blockW - 26, u), alignItems: 'flex-start' }]}>
        <PhysicalBlock p={p} products={homeDeals.products} u={u} onAll={() => setTab('physical')} onOpen={openProduct} />
        {dealCards.length ? (
          <AdminDealsCard p={p} title={dealsHeading} cards={dealCards} u={u} onNav={followNav} />
        ) : (
          <DealsCard p={p} product={homeDeals.deal} u={u} onGrab={openProduct} onContest={() => router.push('/explore/battles' as any)} />
        )}
      </View>

      {user ? (
        <>
          <SectionHeader
            p={p}
            u={u}
            style={{ marginTop: gapY(physBottom, MOCK.colHead.y, u) }}
            icon={<BagIcon size={icon} />}
            title={inventory.data ? `My Collection (${collection.total}${collection.more ? '+' : ''} Items)` : 'My Collection'}
            action={{ label: 'Manage', onPress: openCollection }}
          />
          <View style={{ marginTop: gapY(MOCK.colHead.y + MOCK.colHead.h, MOCK.col.y, u) }}>
            {inventory.data ? (
              <CollectionRow p={p} tiles={collection.tiles} u={u} inner={inner} onPress={openCollection} />
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
        <QuickActionsBar p={p} actions={quickActions} u={u} width={inner} />
      </View>
    </View>
  );

  const mIcon = px(MOCK_M.section.icon, uM);
  const mGap = px(MOCK_M.gap, uM);
  const mHead = px(MOCK_M.head, uM);
  const mQaIcon = px(MOCK_M.quick.icon, uM);
  const featGapM = px(MOCK_M.feat.gap, uM);
  const trendGapM = px(MOCK_M.trend.gap, uM);
  const quickCards: QuickCard[] = [
    ...(cfg.store.enabled && user
      ? [{ key: 'wish', icon: <HeartIcon size={mQaIcon} />, title: 'Wishlist', sub: 'Save Items', accent: BRAND, onPress: () => openDigital({ wishlist: true }) }]
      : []),
    { key: 'orders', icon: <GoldBoxIcon size={mQaIcon} />, title: 'Orders', sub: 'Track & Manage', accent: BRAND, onPress: () => router.push('/shop/orders' as any) },
    { key: 'history', icon: <ClockIcon size={mQaIcon} />, title: 'History', sub: 'Purchase Records', accent: BRAND, onPress: () => router.push('/wallet' as any) },
  ];
  const collectionM = mobileCollectionTiles(collection.tiles);

  const homeMobile = (
    <View style={{ paddingHorizontal: margin }}>
      {hero && cfg.store.enabled ? (
        <View style={{ marginTop: px(MOCK_M.hero.y - MOCK_M.tabs.y - MOCK_M.tabs.h, uM) }}>
          <HeroBanner hero={hero} viewer={viewer} u={uM} variant="mobile" onNav={followNav} onOpenItem={openItem} />
        </View>
      ) : null}
      {digitalState ? (
        <View style={{ marginHorizontal: -margin, marginTop: mGap }}>{digitalState}</View>
      ) : (
        <>
          <SectionHeaderM p={p} u={uM} style={{ marginTop: mGap }} icon={<CrownIcon size={mIcon} />} title="Shop Categories" action={{ label: 'View All', onPress: () => openDigital({}) }} />
          <View style={{ marginTop: mHead }}>
            <CategoryGridM p={p} tiles={tilesM} u={uM} inner={inner} onPick={onTile} />
          </View>

          {featuredM.length ? (
            <>
              <SectionHeaderM p={p} u={uM} style={{ marginTop: mGap }} icon={<StarIcon size={mIcon} />} title="Featured Collection" action={{ label: 'View All', onPress: () => openDigital({ ids: featured.map((i) => i.itemId) }) }} />
              <View style={[styles.row, { gap: featGapM, marginTop: mHead }]}>
                {featuredM.map((i) => (
                  <FeatureCardM key={i.itemId} p={p} item={i} tag={cardTag(i, now)} u={uM} width={cellWidth(inner, MOCK_M.feat.cols, featGapM)} viewer={viewer} onOpen={() => openItem(i.itemId)} />
                ))}
              </View>
            </>
          ) : null}

          {trendingM.items.length ? (
            <>
              <SectionHeaderM p={p} u={uM} style={{ marginTop: mGap }} icon={<FlameIcon size={mIcon} />} title={trendingM.title} action={{ label: 'View All', onPress: () => openDigital({}) }} />
              <View style={[styles.row, { gap: trendGapM, marginTop: mHead }]}>
                {trendingM.items.map((i) => (
                  <TrendCardM key={i.itemId} p={p} item={i} u={uM} width={cellWidth(inner, MOCK_M.trend.cols, trendGapM)} viewer={viewer} onOpen={() => openItem(i.itemId)} />
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      <SectionHeaderM
        p={p}
        u={uM}
        style={{ marginTop: mGap }}
        icon={<BoltIcon size={mIcon} />}
        title={dealsHeading}
        right={
          dealCards.length
            ? dealCur?.endsAt ? <DealTimerPill endsAt={dealCur.endsAt} u={uM} /> : null
            : dealContent.kind === 'discount' && dealContent.summary.endsAt ? <DealTimerPill endsAt={dealContent.summary.endsAt} u={uM} /> : null
        }
      />
      <View style={{ marginTop: mHead }}>
        {dealCards.length ? (
          <DealPager
            p={p}
            count={dealCards.length}
            width={inner}
            u={uM}
            onIndex={setDealIdx}
            labelOf={(i) => dealCards[i]?.title ?? ''}
            renderPage={(i) => (
              <DealCardM
                p={p}
                content={{ kind: 'admin', card: dealCards[i] }}
                u={uM}
                width={inner}
                onDeals={() => openDigital({ discounted: true })}
                onProduct={openProduct}
                onContest={() => router.push('/explore/battles' as any)}
                onNav={followNav}
              />
            )}
          />
        ) : (
          <DealCardM
            p={p}
            content={dealContent}
            u={uM}
            width={inner}
            onDeals={() => openDigital({ discounted: true })}
            onProduct={openProduct}
            onContest={() => router.push('/explore/battles' as any)}
          />
        )}
      </View>

      <SectionHeaderM
        p={p}
        u={uM}
        style={{ marginTop: mGap }}
        icon={<BoxIcon size={mIcon} />}
        title="Physical Products"
        action={physM ? { label: 'View All', onPress: () => setTab('physical') } : undefined}
      />
      <View style={{ marginTop: mHead }}>
        <PhysicalRowM p={p} products={physM} u={uM} inner={inner} onOpen={openProduct} />
      </View>

      {user ? (
        <>
          <SectionHeaderM
            p={p}
            u={uM}
            style={{ marginTop: mGap }}
            icon={<CrownIcon size={mIcon} />}
            title={inventory.data ? `My Collection (${collection.total}${collection.more ? '+' : ''} Items)` : 'My Collection'}
            action={{ label: 'Manage', onPress: openCollection }}
          />
          <View style={{ marginTop: mHead }}>
            {inventory.data ? (
              <CollectionRowM p={p} tiles={collectionM} u={uM} inner={inner} onPress={openCollection} />
            ) : inventory.isError ? (
              <View style={{ marginHorizontal: -margin, paddingHorizontal: pad }}>
                <ErrorState p={p} text="Collection load nahi hui." onRetry={() => void inventory.refetch()} />
              </View>
            ) : (
              <View style={[styles.row, { gap: px(MOCK_M.col.gap, uM) }]} accessible accessibilityLabel="Collection load ho rahi hai">
                {Array.from({ length: MOCK_M.col.cols }, (_, i) => (
                  <View key={i} style={{ width: cellWidth(inner, MOCK_M.col.cols, px(MOCK_M.col.gap, uM)), height: px(MOCK_M.col.h, uM), borderRadius: px(MOCK_M.col.radius, uM), backgroundColor: p.skeleton }} />
                ))}
              </View>
            )}
          </View>
        </>
      ) : null}

      {upgrade ? (
        <View style={{ marginTop: mGap }}>
          <UpgradeBannerM p={p} u={uM} width={inner} onPress={() => openDigital({ rarities: [...UPGRADE_RARITIES] })} />
        </View>
      ) : null}

      <View style={{ marginTop: mGap }}>
        <QuickCardsM p={p} cards={quickCards} u={uM} width={inner} />
      </View>
    </View>
  );

  const bottomPad = mobile ? px(MOCK_M.bottom, uM) : px(MOCK.bottom, u);
  const heroBottomY = mobile ? px(MOCK_M.hero.y + MOCK_M.hero.h, uM) : px(MOCK.hero.y + MOCK.hero.h, u);

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      {focused ? <StatusBar style={p.isDark ? 'light' : 'dark'} /> : null}
      {p.isDark ? <PageGlow width={width} height={height} heroBottom={heroBottomY} /> : null}
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: bottomPad + (tab === 'shop' ? 0 : 32), width: contentW, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
          keyboardShouldPersistTaps="handled"
        >
          {mobile ? (
            <View style={{ paddingHorizontal: margin }}>
              <ShopHeaderMobile
                p={p}
                u={uM}
                inner={inner}
                live={live}
                dpcoin={bal.dpcoin}
                diamonds={bal.diamonds}
                cartCount={cartCount}
                onWallet={() => router.push('/wallet' as any)}
                onOrders={() => router.push('/shop/orders' as any)}
                onCart={() => router.push('/shop/cart' as any)}
              />
              <View style={{ marginTop: px(MOCK_M.tabs.y - MOCK_M.title.y - MOCK_M.title.h, uM) }}>
                <ShopNavigationTabsMobile p={p} u={uM} width={inner} tab={tab} onTab={setTab} onCollection={openCollection} />
              </View>
              {tab === 'shop' && rail.length ? (
                <View style={{ marginTop: px(10, uM), marginHorizontal: -margin }}>
                  <CategoryRail p={p} entries={rail} pad={margin} />
                </View>
              ) : null}
            </View>
          ) : (
          <View style={{ paddingHorizontal: margin }}>
            <ShopHeader
              p={p}
              u={u}
              inner={inner}
              live={live}
              dpcoin={bal.dpcoin}
              diamonds={bal.diamonds}
              cartCount={cartCount}
              onWallet={() => router.push('/wallet' as any)}
              onOrders={() => router.push('/shop/orders' as any)}
              onCart={() => router.push('/shop/cart' as any)}
            />
            <View style={{ marginTop: gapY(MOCK.title.y + MOCK.title.h, MOCK.tabs.y, u) }}>
              <ShopNavigationTabs p={p} u={u} width={inner} tab={tab} onTab={setTab} onCollection={openCollection} />
            </View>
            {tab === 'shop' && rail.length ? (
              <View style={{ marginTop: px(12, u), marginHorizontal: -margin }}>
                <CategoryRail p={p} entries={rail} pad={margin} />
              </View>
            ) : null}
          </View>
          )}
          {tab === 'shop' ? (
            mobile ? homeMobile : home
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
        {/* The app-wide bottom bar on the page background (the safe-area bottom inset is applied inside it). */}
        <BottomNav backgroundColor={p.bg} isDark={p.isDark} />
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
  const filtered = !!(filter.type || filter.rarity || filter.query.trim() || filter.ids || filter.wishlist || filter.rarities?.length || filter.discounted);
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
      {filter.wishlist || filter.ids || filter.rarities?.length || filter.discounted ? (
        <View style={[styles.chips, { paddingHorizontal: pad, marginTop: 12, flexWrap: 'wrap' }]}>
          {filter.wishlist ? (
            <Chip p={p} icon="heart" label={`Wishlist · ${wishlistCount} · hatao`} on onPress={() => setFilter({ ...filter, wishlist: false, ids: null })} />
          ) : filter.ids ? (
            <Chip p={p} icon="star" label={`Chune hue items · ${filter.ids.length} · hatao`} on onPress={() => setFilter({ ...filter, ids: null })} />
          ) : null}
          {filter.rarities?.length ? (
            <Chip p={p} icon="sparkles" label={`${filter.rarities.map((r) => rarityToken(r).label).join(' + ')} · hatao`} on onPress={() => setFilter({ ...filter, rarities: null })} />
          ) : null}
          {filter.discounted ? (
            <Chip p={p} icon="pricetag-outline" label="Discount wale items · hatao" on onPress={() => setFilter({ ...filter, discounted: false })} />
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
