import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@/src/lib/icons';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { DealCard, ProductTile } from '@/src/components/shop/ShopTiles';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { HeroBanner } from '@/src/components/shop/premium/HeroBanner';
import {
  CategoryTileGrid,
  CollectionTileView,
  FeatureCard,
  HotDealsCard,
  PhysicalCard,
  QuickActionsBar,
  SectionTitle,
  TrendCard,
  type QuickAction,
} from '@/src/components/shop/premium/ShopHomeSections';
import { ShopHeader } from '@/src/components/shop/premium/ShopHeader';
import { ShopNavigationTabs } from '@/src/components/shop/premium/ShopNavigationTabs';
import { Chip, EmptyState, ErrorState, SectionHeader, ShopSkeleton } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import {
  NO_FILTER,
  cardTag,
  categoryTiles,
  collectionTiles,
  deriveCategories,
  featuredCollection,
  featuredView,
  filterDigital,
  heroSlides,
  hotDeals,
  isShort,
  parseShopTab,
  physicalPicks,
  presentRarities,
  trendingItems,
  withWishlist,
  type CategoryTile,
  type DigitalFilter,
  type ShopTab,
} from '@/src/lib/shopModel';
import { useInventory } from '@/src/services/gamification';
import { useGiftCatalog, useMonetizationConfig, useStore, useWishlist, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { TH, asExplorePalette, gridCellWidth, gridColumns, rarityToken, tileColumns, useTophuntPalette, type TophuntPalette } from '@/src/theme/tophunt';

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
 * Tabs: Shop (the home, reference layout), Digital (full catalogue with
 * filters), Physical (products), and My Collection (a link to
 * /rewards/inventory). `/shop?tab=digital` and `/shop?tab=physical` open on
 * that tab.
 *
 * Every block and tag here comes from real server data (src/lib/shopModel.ts):
 * nothing is shown as new, trending, limited or featured without a signal for
 * it, and a block with no data is left out instead of being padded.
 */
export default function ShopScreen() {
  const p = useTophuntPalette();
  const ep = useMemo(() => asExplorePalette(p), [p]);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const store = useStore(!!user && cfg.store.enabled);
  const gifts = useGiftCatalog(!!user && cfg.gifts.enabled);
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
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, TH.maxContentWidth);
  const pad = contentW >= 700 ? 24 : 16;
  const inner = contentW - pad * 2;
  const mid = contentW >= 700;
  const cols = gridColumns(contentW);
  const cellW = gridCellWidth(contentW, cols, GAP, pad);
  const dealW = Math.min(inner - 28, 380);
  // Reference-layout grids.
  const TILE_GAP = mid ? 10 : 6;
  const catW = gridCellWidth(contentW, 6, TILE_GAP, pad);
  const featW = mid ? gridCellWidth(contentW, cols, GAP, pad) : 150;
  const trendCols = tileColumns(contentW, 6, 3);
  const trendW = mid ? gridCellWidth(contentW, trendCols, GAP, pad) : 118;
  const sideBySide = contentW >= 900;
  const physBlockW = sideBySide ? Math.round((inner - GAP) * 0.62) : inner;
  const physW = Math.floor((physBlockW - 10 * 2) / 3);
  const colW = mid ? gridCellWidth(contentW, 7, 10, pad) : 86;

  const viewer: Viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const now = useMinuteClock();
  const digital = useMemo(() => store.data ?? [], [store.data]);
  const feature = useMemo(() => featuredView(cfg.store.featured, digital, now), [cfg.store.featured, digital, now]);
  const hero = useMemo(() => heroSlides(digital, feature), [digital, feature]);
  const categories = useMemo(() => deriveCategories(digital), [digital]);
  const tiles = useMemo(() => categoryTiles(digital, { enabled: cfg.gifts.enabled, count: gifts.data?.length }), [digital, cfg.gifts.enabled, gifts.data?.length]);
  const featured = useMemo(() => featuredCollection(digital, feature), [digital, feature]);
  const trending = useMemo(() => trendingItems(digital, 6), [digital]);
  const collection = useMemo(() => collectionTiles(inventory.data?.items), [inventory.data?.items]);
  const rarities = useMemo(() => presentRarities(digital), [digital]);
  const wishIds = wishlist.data;
  const effective = useMemo(() => withWishlist(filter, wishIds), [filter, wishIds]);
  const shown = useMemo(() => filterDigital(digital, effective), [digital, effective]);

  const allProducts = useMemo(() => products.data ?? [], [products.data]);
  const productCats = useMemo(() => [...new Set(allProducts.map((x) => x.category))], [allProducts]);
  const productList = useMemo(() => allProducts.filter((x) => !category || x.category === category), [allProducts, category]);
  // Hot deals: products the admin marked featured that are in stock.
  const deals = useMemo(() => hotDeals(allProducts), [allProducts]);
  const physical = useMemo(() => physicalPicks(allProducts, 3), [allProducts]);

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
  const openCollection = () => router.push('/rewards/inventory' as any);
  const canAfford = (coins: number) => !live || bal.dpcoin >= coins;
  const short = (i: StoreItemView) => isShort(bal.dpcoin, i.priceCoins, live);

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
    if (user) void inventory.refetch();
    if (user && cfg.store.enabled) void wishlist.refetch();
    if (cfg.gifts.enabled) void gifts.refetch();
  };

  const onTile = (t: CategoryTile) => {
    if (t.target === 'type' && t.type) openDigital({ type: t.type });
    else if (t.target === 'gifts') router.push('/wallet/gifts' as any);
    else if (t.target === 'all') openDigital({});
  };

  const quickActions: QuickAction[] = [
    { key: 'equip', icon: 'sparkles', title: 'Equip Items', sub: 'Customize Profile', accent: TH.colors.neon, onPress: openCollection },
    ...(cfg.store.enabled && user
      ? [{ key: 'wish', icon: 'heart', title: 'Wishlist', sub: wishIds?.length ? `${wishIds.length} saved` : 'Save for Later', accent: TH.colors.pink, onPress: () => openDigital({ wishlist: true }) }]
      : []),
    { key: 'orders', icon: 'receipt-outline', title: 'Orders', sub: 'Track & Manage', accent: TH.colors.diamond, onPress: () => router.push('/shop/orders' as any) },
    { key: 'activity', icon: 'time', title: 'Activity', sub: 'Purchase History', accent: TH.colors.gold, onPress: () => router.push('/wallet' as any) },
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

  const showPhysical = cfg.shop.enabled && physical.length > 0;
  const deal = cfg.shop.enabled ? deals[0] : undefined;

  const home = (
    <>
      {hero && cfg.store.enabled ? (
        <View style={{ paddingHorizontal: pad, marginTop: 12 }}>
          <HeroBanner
            hero={hero}
            viewer={viewer}
            width={inner}
            onExplore={() => (hero.mode === 'drop' && feature ? openDigital({ ids: feature.itemIds }) : openDigital({ rarities: ['legendary', 'mythic'] }))}
            onOpenItem={openItem}
          />
        </View>
      ) : null}
      {digitalState ?? (
        <>
          <SectionTitle p={p} pad={pad} icon="bag-handle" title="Shop Categories" action={{ label: 'View All', onPress: () => openDigital({}) }} />
          <CategoryTileGrid p={p} tiles={tiles} tileW={catW} gap={TILE_GAP} pad={pad} onPick={onTile} />

          {featured.length ? (
            <>
              <SectionTitle p={p} pad={pad} icon="star" title="Featured Collection" action={{ label: 'View All', onPress: () => openDigital({ ids: featured.map((i) => i.itemId) }) }} />
              {mid ? (
                <View style={[styles.grid, { paddingHorizontal: pad }]}>
                  {featured.slice(0, cols * 2).map((i) => <FeatureCard key={i.itemId} p={p} item={i} tag={cardTag(i, now)} width={featW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={featW + RAIL_GAP} decelerationRate="fast" contentContainerStyle={[styles.rail, { paddingHorizontal: pad }]}>
                  {featured.map((i) => <FeatureCard key={i.itemId} p={p} item={i} tag={cardTag(i, now)} width={featW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
                </ScrollView>
              )}
            </>
          ) : null}

          <SectionTitle p={p} pad={pad} icon="flame" iconColor={TH.colors.pink} title={trending.title} action={{ label: 'View All', onPress: () => openDigital({}) }} />
          {mid ? (
            <View style={[styles.grid, { paddingHorizontal: pad }]}>
              {trending.items.slice(0, trendCols).map((i) => <TrendCard key={i.itemId} p={p} item={i} width={trendW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={trendW + RAIL_GAP} decelerationRate="fast" contentContainerStyle={[styles.rail, { paddingHorizontal: pad }]}>
              {trending.items.map((i) => <TrendCard key={i.itemId} p={p} item={i} width={trendW} viewer={viewer} onOpen={() => openItem(i.itemId)} />)}
            </ScrollView>
          )}
        </>
      )}

      {showPhysical || deal ? (
        <View style={[sideBySide ? styles.split : null, { paddingHorizontal: sideBySide ? pad : 0 }]}>
          {showPhysical ? (
            <View style={{ width: sideBySide ? physBlockW : undefined }}>
              <SectionTitle p={p} pad={sideBySide ? 0 : pad} icon="cube" iconColor={TH.colors.diamond} title="Physical Products" action={{ label: 'View All', onPress: () => setTab('physical') }} />
              <View style={[styles.row3, { paddingHorizontal: sideBySide ? 0 : pad }]}>
                {physical.map((x) => <PhysicalCard key={x.id} p={p} product={x} width={physW} onPress={() => openProduct(x.id)} />)}
              </View>
            </View>
          ) : null}
          {deal ? (
            <View style={[{ paddingHorizontal: sideBySide ? 0 : pad }, sideBySide ? { flex: 1, marginTop: 24 + 12 + 22 } : { marginTop: 20 }]}>
              <HotDealsCard p={p} product={deal} onGrab={() => openProduct(deal.id)} />
            </View>
          ) : null}
        </View>
      ) : null}

      {user ? (
        <>
          <SectionTitle p={p} pad={pad} icon="bag-handle" title={inventory.data ? `My Collection (${collection.total} Items)` : 'My Collection'} action={{ label: 'Manage', onPress: openCollection }} />
          {inventory.data ? (
            mid ? (
              <View style={[styles.grid, { paddingHorizontal: pad, gap: 10 }]}>
                {collection.tiles.map((t) => <CollectionTileView key={t.key} p={p} tile={t} width={colW} onPress={openCollection} />)}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.rail, { paddingHorizontal: pad, gap: 8 }]}>
                {collection.tiles.map((t) => <CollectionTileView key={t.key} p={p} tile={t} width={colW} onPress={openCollection} />)}
              </ScrollView>
            )
          ) : inventory.isError ? (
            <View style={{ paddingHorizontal: pad }}><ErrorState p={p} text="Collection load nahi hui." onRetry={() => void inventory.refetch()} /></View>
          ) : (
            <View style={[styles.rail, { paddingHorizontal: pad, flexDirection: 'row' }]} accessible accessibilityLabel="Collection load ho rahi hai">
              {Array.from({ length: mid ? 7 : 4 }, (_, i) => <View key={i} style={{ width: colW, height: 74, borderRadius: TH.radii.md, backgroundColor: p.skeleton }} />)}
            </View>
          )}
        </>
      ) : null}

      <QuickActionsBar p={p} actions={quickActions} pad={pad} wide={mid} />
    </>
  );

  return (
    <LinearGradient colors={p.bgGradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ width: contentW, alignSelf: 'center' }}>
          <ShopHeader
            p={p}
            pad={pad}
            live={live}
            dpcoin={bal.dpcoin}
            diamonds={bal.diamonds}
            cartCount={cartCount}
            compact={contentW < 420}
            onOrders={() => router.push('/shop/orders' as any)}
            onCart={() => router.push('/shop/cart' as any)}
          />
          <View style={{ marginTop: 10 }}>
            <ShopNavigationTabs p={p} pad={pad} tab={tab} onTab={setTab} onCollection={openCollection} wide={mid} />
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: 56, width: contentW, alignSelf: 'center' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TH.colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
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
    </LinearGradient>
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
      <SectionHeader p={p} pad={pad} title={filtered ? `${shown.length} items mile` : 'Sab digital items'} sub="Profile, posts, comments aur leaderboard par sab ko dikhega" />
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
  row3: { flexDirection: 'row', gap: 10 },
  split: { flexDirection: 'row', gap: GAP, alignItems: 'flex-start' },
  chips: { gap: 8, alignItems: 'center', flexDirection: 'row' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 14, marginTop: 14 },
  search: { flex: 1, fontFamily: TH.fonts.medium, fontSize: 14, paddingVertical: 0 },
});
