import React, { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ShopListScreen } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { AdminCollectionCardM } from '@/src/components/shop/premium/ShopHomeMobile';
import { mobileScale } from '@/src/components/shop/premium/mock';
import { useDesignWindow } from '@/src/lib/layout';
import { collectionCards, type CollectionCard } from '@/src/lib/shopModel';
import { useShopCollections, type StoreItemView } from '@/src/services/monetization';

type Card = CollectionCard<StoreItemView>;
const keyOf = (c: Card) => c.collection.id;

/** Every admin collection with items on sale (`/shop/collections`), the same cards as the Shop home, in the admin's order. */
export default function ShopCollectionsScreen() {
  const router = useRouter();
  const d = useShopListData();
  const cols = useShopCollections(d.enabled);
  const { width } = useDesignWindow();
  // Card fonts follow the phone mock scale, capped so tablets do not blow them up.
  const u = Math.min(mobileScale(Math.min(width, 520)), 1.4);
  const cards = useMemo(() => collectionCards(cols.data?.collections ?? [], d.items), [cols.data?.collections, d.items]);
  const { viewer } = d;

  const open = useCallback((id: string) => router.push(`/shop/collections/${encodeURIComponent(id)}` as any), [router]);
  const renderItem = useCallback((c: Card, w: number) => <AdminCollectionCardM card={c} u={u} width={w} viewer={viewer} onPress={open} />, [u, viewer, open]);
  const refresh = useCallback(() => {
    void cols.refetch();
    void d.store.refetch();
  }, [cols, d.store]);

  return (
    <ShopListScreen
      title="Popular Collections"
      subtitle="TopHunt ki chuni hui collections"
      count={cards.length ? cards.length : null}
      countNoun={['collection', 'collections']}
      data={cards}
      keyOf={keyOf}
      renderItem={renderItem}
      gate={d.gate}
      offText="Collections jaldi wapas aayengi."
      loading={cols.isLoading || d.store.isLoading}
      error={cols.isError || d.store.isError ? 'Collections load nahi hui.' : null}
      onRetry={refresh}
      refreshing={cols.isRefetching || d.store.isRefetching}
      onRefresh={refresh}
      empty={{ icon: 'sparkles', title: 'Abhi koi collection nahi', text: 'Nayi collections jaldi aayengi.', action: { label: 'Sab categories', onPress: () => router.push('/shop/categories' as any) } }}
    />
  );
}
