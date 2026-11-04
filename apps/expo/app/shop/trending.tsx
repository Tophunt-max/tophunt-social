import React, { useCallback, useMemo, useState } from 'react';
import { ListBanner, TrendRow } from '@/src/components/shop/list/ListCells';
import { ShopListScreen, type ListChip } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { FlameIcon } from '@/src/components/shop/premium/ShopArt';
import { filterItems, presentTypes, rankTrending, type RankedItem } from '@/src/lib/shopListModel';
import { trendingItems } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { SHOP_DEALS_GRAD, useTophuntPalette } from '@/src/theme/tophunt';

/** A row: the item and its rank, or rank null in the no-sales fallback. */
type Row = { item: StoreItemView; rank: number | null };
const keyOf = (r: Row) => r.item.itemId;

/**
 * Trending (`/shop/trending`): a ranked list of the items that have really
 * sold (soldCount > 0), most sold first, with gold / silver / bronze badges
 * for #1–#3. Sold counts are used for the order only, never shown. Type
 * chips narrow the list (ranks are then within that type). When nothing has
 * sold yet: the store's items in store order without ranks, and the page
 * says so ("Abhi trending data nahi hai"). Data: getStore.
 */
export default function ShopTrendingScreen() {
  const p = useTophuntPalette();
  const d = useShopListData();
  const { viewer, short, openItem, buyItem } = d;
  const buying = d.purchase.buying;
  const { refetchMe } = d;
  const refetchStore = d.store.refetch;
  const [type, setType] = useState<string | null>(null);

  const sold = useMemo(() => d.items.filter((i) => (Number(i.soldCount) || 0) > 0), [d.items]);
  const trending = sold.length > 0;
  const base = useMemo(() => (trending ? sold : trendingItems(d.items, d.items.length).items), [trending, sold, d.items]);
  const types = useMemo(() => presentTypes(base), [base]);
  const rows: Row[] = useMemo(() => {
    const ofType = filterItems(base, { type });
    return trending ? rankTrending(ofType).map((r: RankedItem<StoreItemView>) => ({ item: r.item, rank: r.rank })) : ofType.map((item) => ({ item, rank: null }));
  }, [base, type, trending]);

  const chips: ListChip[] = types.length > 1
    ? [
        { key: 'all', label: 'Sab', on: !type, onPress: () => setType(null) },
        ...types.map((t) => ({ key: t.type, label: t.label, on: type === t.type, onPress: () => setType(type === t.type ? null : t.type) })),
      ]
    : [];

  const renderItem = useCallback(
    (r: Row, width: number) => (
      <TrendRow item={r.item} rank={r.rank} width={width} p={p} viewer={viewer} busy={buying === r.item.itemId} short={short(r.item)} onOpen={openItem} onBuy={buyItem} />
    ),
    [p, viewer, buying, short, openItem, buyItem],
  );
  const refresh = useCallback(() => {
    void refetchStore();
    void refetchMe();
  }, [refetchStore, refetchMe]);

  const banner = !base.length ? null : trending ? (
    <ListBanner art={<FlameIcon size={64} />} title="Trending Items" sub="Abhi sabse zyada kharide ja rahe items, rank ke saath" colors={SHOP_DEALS_GRAD} />
  ) : (
    <ListBanner art={<FlameIcon size={64} />} title="Abhi trending data nahi hai" sub="Jaise hi items bikenge, ranking yahan dikhegi. Tab tak shop ke items dekho." />
  );

  return (
    <ShopListScreen
      title={trending ? 'Trending Items' : 'Shop Items'}
      subtitle={trending ? 'Sabse zyada kharide gaye' : 'Abhi trending data nahi hai'}
      banner={banner}
      chips={chips}
      count={base.length ? rows.length : null}
      data={rows}
      keyOf={keyOf}
      renderItem={renderItem}
      layout="list"
      rowHeight={86}
      gate={d.gate}
      loading={d.store.isLoading}
      error={d.store.isError ? 'Trending items load nahi hue.' : null}
      onRetry={refresh}
      refreshing={d.store.isRefetching}
      onRefresh={refresh}
      empty={
        !base.length
          ? { icon: 'flame', title: 'Abhi koi item sale par nahi', text: 'Naye items jaldi aayenge.' }
          : { icon: 'search', text: 'Is type mein koi item nahi mila.', onClearFilters: () => setType(null) }
      }
      overlay={d.purchase.dialog}
    />
  );
}
