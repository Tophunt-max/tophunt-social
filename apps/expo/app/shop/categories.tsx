import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CategoryCell, ListSectionTitle } from '@/src/components/shop/list/ListCells';
import { LIST_GAP, ShopListScreen, listColumns, listMetrics } from '@/src/components/shop/list/ShopListScreen';
import { useShopListData } from '@/src/components/shop/list/useShopListData';
import { useDesignWindow } from '@/src/lib/layout';
import { categorySummary, extraCategories, tileKeyForType } from '@/src/lib/shopListModel';
import { categoryTiles, giftsCategory, type TileKey } from '@/src/lib/shopModel';
import { emitToast } from '@/src/lib/toastBridge';
import { useGiftCatalog } from '@/src/services/monetization';
import { gridCellWidth, useTophuntPalette } from '@/src/theme/tophunt';

interface Row {
  key: string;
  tileKey: TileKey;
  label: string;
  /** Real live count; null for tiles without one. */
  count: number | null;
  /** Where the tile goes. */
  to: { kind: 'type'; type: string } | { kind: 'gifts' };
}
const keyOf = (r: Row) => r.key;

/**
 * All Categories (`/shop/categories`): every Shop category as a tile with its
 * real count. Categories with live listings first (most listings first), then
 * item types the store sells that have no home tile (stickers…), and Virtual
 * Gifts when gifts are on. Tiles with nothing behind them are listed under
 * "Jaldi aa raha hai" and only show a toast. A type opens
 * /shop/category/[type]; Gifts opens /wallet/gifts. Data: getStore + the gift catalogue.
 */
export default function ShopCategoriesScreen() {
  const p = useTophuntPalette();
  const d = useShopListData();
  const { router, cfg, user } = d;
  const gifts = useGiftCatalog(!!user && cfg.gifts.enabled);
  const { width } = useDesignWindow();
  const { contentW, pad } = listMetrics(width);
  const cellW = gridCellWidth(contentW, listColumns(contentW), LIST_GAP, pad);

  const tiles = useMemo(() => categoryTiles(d.items, { enabled: cfg.gifts.enabled, count: gifts.data?.length }), [d.items, cfg.gifts.enabled, gifts.data?.length]);
  const summary = useMemo(() => categorySummary(tiles), [tiles]);
  const extras = useMemo(() => extraCategories(d.items, tiles), [d.items, tiles]);
  const gift = giftsCategory(cfg.gifts.enabled, gifts.data?.length);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const t of summary.available) {
      if (t.target === 'type' && t.type) out.push({ key: t.key, tileKey: t.key, label: t.label, count: t.count, to: { kind: 'type', type: t.type } });
      else if (t.target === 'gifts') out.push({ key: t.key, tileKey: t.key, label: t.label, count: gift?.count ?? null, to: { kind: 'gifts' } });
    }
    // Types the home grid has no tile for go before Gifts (which is not a store item type).
    const giftAt = out.findIndex((r) => r.to.kind === 'gifts');
    const extraRows: Row[] = extras.map((c) => ({ key: `x-${c.type}`, tileKey: tileKeyForType(c.type), label: c.label, count: c.count, to: { kind: 'type', type: c.type } }));
    if (giftAt < 0) out.push(...extraRows);
    else out.splice(giftAt, 0, ...extraRows);
    return out;
  }, [summary.available, extras, gift?.count]);

  const open = useCallback((r: Row) => {
    if (r.to.kind === 'gifts') router.push('/wallet/gifts' as any);
    else router.push(`/shop/category/${encodeURIComponent(r.to.type)}` as any);
  }, [router]);

  const renderItem = useCallback(
    (r: Row, w: number) => <CategoryCell tileKey={r.tileKey} label={r.label} count={r.count} soon={false} width={w} p={p} onPress={() => open(r)} />,
    [p, open],
  );

  const refresh = useCallback(() => {
    void d.store.refetch();
    if (cfg.gifts.enabled) void gifts.refetch();
  }, [d.store, cfg.gifts.enabled, gifts]);

  const footer = summary.soon.length ? (
    <View>
      <ListSectionTitle p={p} title="Jaldi aa raha hai" sub="Ye categories abhi taiyaar ho rahi hain" />
      <View style={[styles.grid, { gap: LIST_GAP }]}>
        {summary.soon.map((t) => (
          <CategoryCell key={t.key} tileKey={t.key} label={t.label} count={null} soon width={cellW} p={p} onPress={() => emitToast(`${t.label} jaldi aa raha hai`, 'info')} />
        ))}
      </View>
    </View>
  ) : null;

  return (
    <ShopListScreen
      title="All Categories"
      subtitle="Frames, themes, badges aur bahut kuch"
      count={rows.length ? rows.length : null}
      countNoun={['category', 'categories']}
      data={rows}
      keyOf={keyOf}
      renderItem={renderItem}
      gate={!user ? 'signedOut' : null}
      loading={(cfg.store.enabled && d.store.isLoading) || (cfg.gifts.enabled && gifts.isLoading)}
      error={cfg.store.enabled && d.store.isError ? 'Categories load nahi hui.' : null}
      onRetry={refresh}
      refreshing={d.store.isRefetching}
      onRefresh={refresh}
      empty={rows.length ? null : { icon: 'sparkles', title: 'Abhi koi category live nahi', text: cfg.store.enabled ? 'Items jaldi aa rahe hain.' : 'Store abhi band hai. Items jaldi wapas aayenge.' }}
      footer={footer}
    />
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
