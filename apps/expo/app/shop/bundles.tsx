import React, { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ShopListScreen, type ListChip } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { BundleCard } from '@/src/components/shop/premium/ShopBundles';
import { mobileScale } from '@/src/components/shop/premium/mock';
import { useMinuteNow } from '@/src/hooks/useMinuteNow';
import { useDesignWindow } from '@/src/lib/layout';
import { BUNDLE_SORTS, filterBundles, sortBundles, type BundleFilter, type BundleSortKey } from '@/src/lib/shopListModel';
import { visibleBundles } from '@/src/lib/shopModel';
import { useShopCollections, type PublicShopBundle } from '@/src/services/monetization';
import { useTophuntPalette } from '@/src/theme/tophunt';

const keyOf = (b: PublicShopBundle) => b.id;

/**
 * Every Diamond bundle on sale, plus the ones the user bought (`/shop/bundles`),
 * as the Shop home cards. Sort: Recommended (admin order) / Price ↑ / Price ↓;
 * filter: Available (can still be bought) / Owned (bought, or every item owned).
 * Tapping a card opens the bundle detail (buying goes through its sheet).
 */
export default function ShopBundlesScreen() {
  const p = useTophuntPalette();
  const router = useRouter();
  const d = useShopListData();
  const cols = useShopCollections(d.enabled);
  const now = useMinuteNow();
  const { width } = useDesignWindow();
  // Fonts follow the phone mock scale, capped so wide screens do not blow them up.
  const u = Math.min(mobileScale(Math.min(width, 520)), 1.5);
  const { viewer, refetchMe } = d;

  const [filter, setFilter] = useState<BundleFilter>('all');
  const [sortKey, setSortKey] = useState<BundleSortKey>('recommended');
  const bundles = useMemo(() => visibleBundles(cols.data?.bundles ?? [], now), [cols.data?.bundles, now]);
  const shown = useMemo(() => sortBundles(filterBundles(bundles, filter), sortKey), [bundles, filter, sortKey]);
  const owned = useMemo(() => filterBundles(bundles, 'owned').length, [bundles]);

  const chips: ListChip[] = owned > 0 && owned < bundles.length
    ? [
        { key: 'all', label: 'Sab', on: filter === 'all', onPress: () => setFilter('all') },
        { key: 'available', label: 'Available', count: bundles.length - owned, on: filter === 'available', onPress: () => setFilter(filter === 'available' ? 'all' : 'available') },
        { key: 'owned', label: 'Owned', icon: 'checkmark-circle', count: owned, on: filter === 'owned', onPress: () => setFilter(filter === 'owned' ? 'all' : 'owned') },
      ]
    : [];

  const open = useCallback((id: string) => router.push(`/shop/bundle/${encodeURIComponent(id)}` as any), [router]);
  const renderItem = useCallback((b: PublicShopBundle, w: number) => <BundleCard p={p} bundle={b} u={u} width={w} viewer={viewer} onOpen={open} />, [p, u, viewer, open]);
  const refresh = useCallback(() => {
    void cols.refetch();
    void refetchMe();
  }, [cols, refetchMe]);

  return (
    <ShopListScreen
      title="Shop Bundles"
      subtitle="Diamond se kharido, kai items ek saath"
      currency="diamond"
      chips={chips}
      sort={bundles.length > 1 ? { options: BUNDLE_SORTS, value: sortKey, onChange: (k) => setSortKey((BUNDLE_SORTS.find((s) => s.key === k)?.key ?? 'recommended')) } : undefined}
      count={bundles.length ? shown.length : null}
      countNoun={['bundle', 'bundles']}
      data={shown}
      keyOf={keyOf}
      renderItem={renderItem}
      gate={d.gate}
      offText="Bundles jaldi wapas aayenge."
      loading={cols.isLoading}
      error={cols.isError ? 'Bundles load nahi hue.' : null}
      onRetry={refresh}
      refreshing={cols.isRefetching}
      onRefresh={refresh}
      empty={
        bundles.length
          ? { icon: 'gift', text: filter === 'owned' ? 'Aapne abhi koi bundle nahi liya.' : 'Is filter mein koi bundle nahi.', onClearFilters: () => setFilter('all') }
          : { icon: 'gift', title: 'Abhi koi bundle nahi', text: 'Abhi koi bundle sale par nahi hai.' }
      }
    />
  );
}
