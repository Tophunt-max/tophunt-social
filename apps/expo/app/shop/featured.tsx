import React, { useCallback, useMemo, useState } from 'react';
import { BannerTimer, ItemCell, ListBanner } from '@/src/components/shop/list/ListCells';
import { ShopListScreen, type ListChip } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { ProductPreview } from '@/src/components/shop/premium/ProductPreview';
import { useMinuteNow } from '@/src/hooks/useMinuteNow';
import { FEATURED_SORTS, countLabel, filterItems, isFiltered, sortItems, sortOr, type SortKey } from '@/src/lib/shopListModel';
import { featuredCollection, featuredView, presentRarities, typeLine } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { SHOP_UPGRADE_GRAD, rarityToken, useTophuntPalette } from '@/src/theme/tophunt';

const keyOf = (i: StoreItemView) => i.itemId;

/**
 * Featured (`/shop/featured`): the admin's featured drop (cfg.store.featured,
 * via featuredView) with its badge, title, subtitle and a countdown only when
 * the drop has a real end, then its live items in the admin's order. Without
 * a live drop: the Featured Collection fallback (Legendary, then Epic items)
 * under a plain "Featured Collection" banner. Sort + rarity chips.
 */
export default function ShopFeaturedScreen() {
  const p = useTophuntPalette();
  const d = useShopListData();
  const { viewer, short, openItem, buyItem } = d;
  const buying = d.purchase.buying;
  const { refetchMe } = d;
  const refetchStore = d.store.refetch;
  const now = useMinuteNow();

  const [rarity, setRarity] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('default');

  const feature = useMemo(() => featuredView(d.cfg.store.featured, d.items, now), [d.cfg.store.featured, d.items, now]);
  const base = useMemo(() => (feature ? feature.items : featuredCollection(d.items, null, d.items.length)), [feature, d.items]);
  const rarities = useMemo(() => presentRarities(base), [base]);
  const filter = useMemo(() => ({ rarity }), [rarity]);
  const shown = useMemo(() => sortItems(filterItems(base, filter), sortKey), [base, filter, sortKey]);

  const chips: ListChip[] = rarities.length > 1
    ? [
        { key: 'all', label: 'Har rarity', on: !rarity, onPress: () => setRarity(null) },
        ...rarities.map((r) => ({ key: r, label: rarityToken(r).label, on: rarity === r, onPress: () => setRarity(rarity === r ? null : r) })),
      ]
    : [];

  const hero = feature?.hero ?? base[0];
  const art = hero ? <ProductPreview item={hero} viewer={viewer} width={84} height={84} radius={14} bare /> : null;
  const banner = !base.length ? null : feature ? (
    <ListBanner
      art={art}
      badge={feature.badge}
      title={feature.title}
      sub={feature.subtitle || undefined}
      count={countLabel(feature.items.length)}
      right={feature.endsAt ? <BannerTimer endsAt={feature.endsAt} /> : null}
    />
  ) : (
    <ListBanner art={art} title="Featured Collection" sub={typeLine(base) || 'Legendary aur Epic items'} count={countLabel(base.length)} colors={SHOP_UPGRADE_GRAD} />
  );

  const renderItem = useCallback(
    (item: StoreItemView, width: number) => (
      <ItemCell item={item} width={width} p={p} viewer={viewer} busy={buying === item.itemId} short={short(item)} onOpen={openItem} onBuy={buyItem} />
    ),
    [p, viewer, buying, short, openItem, buyItem],
  );
  const refresh = useCallback(() => {
    void refetchStore();
    void refetchMe();
  }, [refetchStore, refetchMe]);

  return (
    <ShopListScreen
      title={feature ? feature.title : 'Featured Collection'}
      subtitle={feature ? 'Featured drop' : 'Sabse rare items'}
      banner={banner}
      chips={chips}
      sort={base.length ? { options: FEATURED_SORTS, value: sortKey, onChange: (k) => setSortKey(sortOr(k, FEATURED_SORTS)) } : undefined}
      count={base.length ? shown.length : null}
      data={shown}
      keyOf={keyOf}
      renderItem={renderItem}
      gate={d.gate}
      loading={d.store.isLoading}
      error={d.store.isError ? 'Featured items load nahi hue.' : null}
      onRetry={refresh}
      refreshing={d.store.isRefetching}
      onRefresh={refresh}
      empty={
        !base.length
          ? { icon: 'star', title: 'Abhi koi featured item nahi', text: 'Naye featured items jaldi aayenge.' }
          : isFiltered(filter)
            ? { icon: 'search', text: 'Is rarity mein koi featured item nahi.', onClearFilters: () => setRarity(null) }
            : { icon: 'star', text: 'Koi item nahi mila.' }
      }
      overlay={d.purchase.dialog}
    />
  );
}
