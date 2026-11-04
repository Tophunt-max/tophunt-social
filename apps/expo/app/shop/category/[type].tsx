import React, { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ItemCell, ListBanner } from '@/src/components/shop/list/ListCells';
import { ShopListScreen, type ListChip } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { TileArt } from '@/src/components/shop/premium/ShopArt';
import { CATEGORY_SORTS, TILE_LABEL, countLabel, filterItems, isFiltered, sortItems, sortOr, tileKeyForType, typeTitle, type SortKey } from '@/src/lib/shopListModel';
import { presentRarities } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { rarityToken, useTophuntPalette } from '@/src/theme/tophunt';

const keyOf = (i: StoreItemView) => i.itemId;

/**
 * One item type (`/shop/category/frame`, `theme`, `badge`, `title`, `effect`…):
 * a banner with the tile art and the real count, search, rarity chips (only
 * rarities on sale), "Owned chhupao", sort (Popular / New / Price / Rarity),
 * then the premium item cards with the usual buy sheet. Data: getStore.
 */
export default function ShopCategoryScreen() {
  const p = useTophuntPalette();
  const params = useLocalSearchParams<{ type?: string | string[] }>();
  const type = String((Array.isArray(params.type) ? params.type[0] : params.type) ?? '').trim();
  const d = useShopListData();
  const { router, viewer, short, openItem, buyItem } = d;
  const buying = d.purchase.buying;
  const { refetchMe } = d;
  const refetchStore = d.store.refetch;

  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<string | null>(null);
  const [hideOwned, setHideOwned] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('popular');

  const ofType = useMemo(() => d.items.filter((i) => i.type === type), [d.items, type]);
  const rarities = useMemo(() => presentRarities(ofType), [ofType]);
  const anyOwned = useMemo(() => ofType.some((i) => i.owned), [ofType]);
  const filter = useMemo(() => ({ query, rarity, hideOwned }), [query, rarity, hideOwned]);
  const shown = useMemo(() => sortItems(filterItems(ofType, filter), sortKey), [ofType, filter, sortKey]);
  const clear = useCallback(() => {
    setQuery('');
    setRarity(null);
    setHideOwned(false);
  }, []);

  const label = TILE_LABEL[type] ?? typeTitle(type);
  const chips: ListChip[] = [
    ...(rarities.length > 1
      ? [
          { key: 'all', label: 'Har rarity', on: !rarity, onPress: () => setRarity(null) },
          ...rarities.map((r) => ({ key: r, label: rarityToken(r).label, on: rarity === r, onPress: () => setRarity(rarity === r ? null : r) })),
        ]
      : []),
    ...(anyOwned ? [{ key: 'owned', label: 'Owned chhupao', icon: 'eye-off-outline', on: hideOwned, onPress: () => setHideOwned(!hideOwned) }] : []),
  ];

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
      title={label}
      subtitle={ofType.length ? 'Profile, posts aur comments par sab ko dikhega' : undefined}
      banner={ofType.length ? (
        <ListBanner art={<TileArt tile={tileKeyForType(type)} width={80} height={80} />} title={label} count={countLabel(ofType.length)} />
      ) : null}
      search={ofType.length ? { value: query, onChange: setQuery, placeholder: `${label} mein dhoondo` } : undefined}
      chips={chips}
      sort={ofType.length ? { options: CATEGORY_SORTS, value: sortKey, onChange: (k) => setSortKey(sortOr(k, CATEGORY_SORTS)) } : undefined}
      count={ofType.length ? shown.length : null}
      data={shown}
      keyOf={keyOf}
      renderItem={renderItem}
      gate={d.gate}
      loading={d.store.isLoading}
      error={d.store.isError ? 'Items load nahi hue.' : null}
      onRetry={refresh}
      refreshing={d.store.isRefetching}
      onRefresh={refresh}
      empty={
        !ofType.length
          ? { icon: 'sparkles', title: 'Is category mein abhi kuch nahi', text: 'Is category ke items jaldi aayenge. Tab tak baaki categories dekho.', action: { label: 'Sab categories', onPress: () => router.replace('/shop/categories' as any) } }
          : isFiltered(filter)
            ? { icon: 'search', text: 'Is filter mein koi item nahi mila.', onClearFilters: clear }
            : { icon: 'sparkles', text: 'Koi item nahi mila.' }
      }
      overlay={d.purchase.dialog}
    />
  );
}
