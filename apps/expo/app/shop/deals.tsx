import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DealItemCell, ItemCell, ListSectionTitle } from '@/src/components/shop/list/ListCells';
import { LIST_GAP, ShopListScreen, listColumns, listMetrics, type ListChip } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { ProductTile } from '@/src/components/shop/ShopTiles';
import { DealPager } from '@/src/components/shop/premium/DealPager';
import { DealCardM } from '@/src/components/shop/premium/ShopHomeMobile';
import { mobileScale } from '@/src/components/shop/premium/mock';
import { useMinuteNow } from '@/src/hooks/useMinuteNow';
import { useDesignWindow } from '@/src/lib/layout';
import { DEAL_SORTS, dealItems, filterItems, isFiltered, physicalDeals, sortItems, sortOr, type DealItem, type SortKey } from '@/src/lib/shopListModel';
import { dealsTitle, discountOf, isFutureDeadline, presentRarities, resolveDealCards, type ShopNav } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { useShopProducts } from '@/src/services/shop';
import { asExplorePalette, gridCellWidth, rarityToken, useTophuntPalette } from '@/src/theme/tophunt';

type Row = DealItem<StoreItemView>;
const keyOf = (r: Row) => r.item.itemId;

/**
 * Deals (`/shop/deals`):
 *  1. the admin deal cards (cfg.store.deals via resolveDealCards: ribbon
 *     percent from real compare-at prices, timer only for a real end) as a
 *     pager at the top;
 *  2. every live, not-owned digital item with a real compare-at discount,
 *     biggest % first, each with its -X% and the real sale countdown when the
 *     listing has an end;
 *  3. physical products that are discounted or admin-featured and in stock
 *     (shop enabled only), tap → /shop/[id].
 * Nothing real → an honest "Abhi koi deal nahi".
 */
export default function ShopDealsScreen() {
  const p = useTophuntPalette();
  const ep = useMemo(() => asExplorePalette(p), [p]);
  const d = useShopListData();
  const { router, viewer, short, openItem, buyItem, cfg, user, live, bal } = d;
  const buying = d.purchase.buying;
  const { refetchMe } = d;
  const refetchStore = d.store.refetch;
  const now = useMinuteNow();
  const { width } = useDesignWindow();
  const { contentW, pad, inner } = listMetrics(width);
  const cols = listColumns(contentW);
  const cellW = gridCellWidth(contentW, cols, LIST_GAP, pad);
  const u = mobileScale(contentW);

  const products = useShopProducts(!!user && cfg.shop.enabled);
  const allProducts = useMemo(() => (cfg.shop.enabled ? products.data ?? [] : []), [cfg.shop.enabled, products.data]);
  const physical = useMemo(() => physicalDeals(allProducts), [allProducts]);
  const cards = useMemo(
    () => resolveDealCards(cfg.store.deals, cfg.store.enabled ? d.items : [], cfg.shop.enabled ? products.data ?? null : null, now),
    [cfg.store.deals, cfg.store.enabled, d.items, cfg.shop.enabled, products.data, now],
  );

  const [rarity, setRarity] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('discount');
  /** An admin card's own items (its "Grab Now"), shown instead of all discounts until cleared. */
  const [cardPick, setCardPick] = useState<{ title: string; ids: string[] } | null>(null);

  const deals = useMemo(() => dealItems(d.items, now), [d.items, now]);
  const base: Row[] = useMemo(() => {
    if (!cardPick) return deals;
    const byId = new Map(d.items.map((i) => [i.itemId, i]));
    return cardPick.ids
      .map((id) => byId.get(id))
      .filter((i): i is StoreItemView => !!i)
      .map((item) => ({ item, percent: item.owned ? 0 : discountOf(item), endsAt: isFutureDeadline(item.endsAt, now) ? (item.endsAt as number) : null }));
  }, [cardPick, deals, d.items, now]);
  const rarities = useMemo(() => presentRarities(base.map((r) => r.item)), [base]);
  const filter = useMemo(() => ({ rarity }), [rarity]);
  const rows = useMemo(() => {
    const byId = new Map(base.map((r) => [r.item.itemId, r]));
    const items = filterItems(base.map((r) => r.item), filter);
    // "Sabse zyada discount" keeps dealItems' order (soonest end breaks ties); other sorts reorder the items.
    const ordered = sortKey === 'discount' && !cardPick ? items : sortItems(items, sortKey);
    return ordered.map((i) => byId.get(i.itemId)!);
  }, [base, filter, sortKey, cardPick]);

  const onNav = useCallback((nav: ShopNav) => {
    if (nav.kind === 'route') router.push(nav.path as any);
    else if (nav.kind === 'physical') router.push('/shop?tab=physical' as any);
    else if (nav.filter.ids?.length === 1) openItem(nav.filter.ids[0]);
    else if (nav.filter.ids?.length) {
      const card = cards.find((c) => c.nav === nav);
      setCardPick({ title: card?.title ?? 'Deal items', ids: [...nav.filter.ids] });
      setRarity(null);
    } else if (nav.filter.type) router.push(`/shop/category/${encodeURIComponent(nav.filter.type)}` as any);
    else setCardPick(null);
  }, [router, openItem, cards]);

  const heading = dealsTitle(cfg.store.deals);
  const pager = cards.length ? (
    <DealPager
      p={p}
      count={cards.length}
      width={inner}
      u={u}
      labelOf={(i) => cards[i]?.title ?? ''}
      renderPage={(i) => (
        <DealCardM
          p={p}
          content={{ kind: 'admin', card: cards[i] }}
          heading={heading}
          u={u}
          width={inner}
          onDeals={() => setCardPick(null)}
          onProduct={(id) => router.push(`/shop/${encodeURIComponent(id)}` as any)}
          onContest={() => router.push('/explore/battles' as any)}
          onNav={onNav}
        />
      )}
    />
  ) : null;

  const chips: ListChip[] = [
    ...(cardPick ? [{ key: 'card', label: `${cardPick.title} · hatao`, icon: 'pricetag-outline', on: true, onPress: () => setCardPick(null) }] : []),
    ...(rarities.length > 1
      ? [
          { key: 'all', label: 'Har rarity', on: !rarity, onPress: () => setRarity(null) },
          ...rarities.map((r) => ({ key: r, label: rarityToken(r).label, on: rarity === r, onPress: () => setRarity(rarity === r ? null : r) })),
        ]
      : []),
  ];

  const renderItem = useCallback(
    (r: Row, w: number) =>
      r.percent > 0 ? (
        <DealItemCell item={r.item} percent={r.percent} endsAt={r.endsAt} width={w} p={p} viewer={viewer} busy={buying === r.item.itemId} short={short(r.item)} onOpen={openItem} onBuy={buyItem} />
      ) : (
        <ItemCell item={r.item} width={w} p={p} viewer={viewer} busy={buying === r.item.itemId} short={short(r.item)} onOpen={openItem} onBuy={buyItem} />
      ),
    [p, viewer, buying, short, openItem, buyItem],
  );

  const refresh = useCallback(() => {
    void refetchStore();
    void refetchMe();
    if (cfg.shop.enabled) void products.refetch();
  }, [refetchStore, refetchMe, cfg.shop.enabled, products]);

  const nothing = !cards.length && !deals.length && !physical.length && !cardPick;
  const banner = (
    <View>
      {pager}
      {base.length ? (
        <ListSectionTitle p={p} title={cardPick ? cardPick.title : 'Digital items par discount'} sub={cardPick ? 'Is deal ke items' : 'Sabse bada discount pehle'} />
      ) : null}
    </View>
  );
  const footer = physical.length ? (
    <View>
      <ListSectionTitle p={p} title="Products par deals" sub="Stock mein, ghar par delivery included" />
      <View style={[styles.grid, { gap: LIST_GAP }]}>
        {physical.map((item) => (
          <ProductTile
            key={item.id}
            item={item}
            width={cellW}
            p={ep}
            canAfford={!live || bal.dpcoin >= item.priceCoins}
            onPress={() => router.push(`/shop/${encodeURIComponent(item.id)}` as any)}
          />
        ))}
      </View>
    </View>
  ) : null;

  const gate = !user ? 'signedOut' : !cfg.store.enabled && !cfg.shop.enabled ? 'off' : null;
  const storeLoading = cfg.store.enabled && d.store.isLoading;
  const productsLoading = cfg.shop.enabled && products.isLoading;
  const storeError = cfg.store.enabled && d.store.isError;
  const productsOnlyError = !cfg.store.enabled && cfg.shop.enabled && products.isError;

  return (
    <ShopListScreen
      title="Deals"
      subtitle={heading}
      banner={nothing ? null : banner}
      chips={base.length ? chips : undefined}
      sort={base.length ? { options: DEAL_SORTS, value: sortKey, onChange: (k) => setSortKey(sortOr(k, DEAL_SORTS)) } : undefined}
      count={base.length ? rows.length : null}
      data={rows}
      keyOf={keyOf}
      renderItem={renderItem}
      gate={gate}
      offText="Deals jaldi wapas aayenge."
      loading={storeLoading || productsLoading}
      error={storeError || productsOnlyError ? 'Deals load nahi hue.' : null}
      onRetry={refresh}
      refreshing={d.store.isRefetching || products.isRefetching}
      onRefresh={refresh}
      empty={
        nothing
          ? { icon: 'pricetag-outline', title: 'Abhi koi deal nahi', text: 'Naye deals aate hi yahan dikhenge. Tab tak contest jeet kar DP coin jama karo.' }
          : base.length && isFiltered(filter)
            ? { icon: 'search', text: 'Is rarity mein koi deal nahi.', onClearFilters: () => setRarity(null) }
            : null
      }
      footer={footer}
      overlay={d.purchase.dialog}
    />
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
