/**
 * Related rails on the item detail screen, each hidden when empty:
 *  - bundles that include the item (the Shop's BundleCard → /shop/bundle/[id]);
 *  - admin collections that list it (gradient chips → /shop/collections/[id]);
 *  - similar store items (the premium DigitalItemCard → /shop/item/[id]).
 * All memoised: the parent passes stable callbacks.
 */
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { BundleCard } from '@/src/components/shop/premium/ShopBundles';
import { isShort } from '@/src/lib/shopModel';
import type { PublicShopBundle, PublicShopCollection, StoreItemView } from '@/src/services/monetization';
import { SHOP_ACCENT_GRADS, TH, type TophuntPalette } from '@/src/theme/tophunt';

const RAIL_GAP = 12;

export function SectionTitle({ p, title, sub }: { p: TophuntPalette; title: string; sub?: string }) {
  return (
    <View style={{ gap: 2, marginBottom: 10 }}>
      <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">{title}</Text>
      {sub ? <Text style={[styles.sub, { color: p.sub }]}>{sub}</Text> : null}
    </View>
  );
}

/** Horizontal rail that bleeds to the screen edge (negative side margin = page padding). */
function Rail({ pad, children }: { pad: number; children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -pad }}
      contentContainerStyle={{ paddingHorizontal: pad, gap: RAIL_GAP, alignItems: 'stretch' }}
    >
      {children}
    </ScrollView>
  );
}

export const BundlesRail = React.memo(function BundlesRail({
  p, bundles, u, pad, viewer, onOpen,
}: { p: TophuntPalette; bundles: PublicShopBundle[]; u: number; pad: number; viewer: Viewer; onOpen: (id: string) => void }) {
  if (!bundles.length) return null;
  const w = Math.round(132 * u);
  return (
    <View>
      <SectionTitle p={p} title="Ye item in bundles mein bhi hai" sub="Diamond se poora bundle ek saath" />
      <Rail pad={pad}>
        {bundles.map((b) => <BundleCard key={b.id} p={p} bundle={b} u={u} width={w} viewer={viewer} onOpen={onOpen} />)}
      </Rail>
    </View>
  );
});

const CollectionChip = React.memo(function CollectionChip({ c, onOpen }: { c: PublicShopCollection; onOpen: (id: string) => void }) {
  const grad = SHOP_ACCENT_GRADS[c.accent] ?? SHOP_ACCENT_GRADS.violet;
  const press = useCallback(() => onOpen(c.id), [c.id, onOpen]);
  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={`${c.name} collection kholo`}
      style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
    >
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coll}>
        {c.imageUrl ? (
          <AppImage source={{ uri: c.imageUrl }} displayWidth={40} style={styles.collImg} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : null}
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={styles.collName} numberOfLines={1}>{c.name}</Text>
          {c.subtitle ? <Text style={styles.collSub} numberOfLines={1}>{c.subtitle}</Text> : null}
        </View>
        <ArrowIcon size={14} color={TH.colors.white} direction="right" />
      </LinearGradient>
    </Pressable>
  );
});

export const CollectionsRail = React.memo(function CollectionsRail({
  p, collections, pad, onOpen,
}: { p: TophuntPalette; collections: PublicShopCollection[]; pad: number; onOpen: (id: string) => void }) {
  if (!collections.length) return null;
  return (
    <View>
      <SectionTitle p={p} title="Is collection ka hissa" />
      <Rail pad={pad}>
        {collections.map((c) => <CollectionChip key={c.id} c={c} onOpen={onOpen} />)}
      </Rail>
    </View>
  );
});

const SimilarCard = React.memo(function SimilarCard({
  item, p, viewer, width, busy, short, onOpen, onBuy,
}: { item: StoreItemView; p: TophuntPalette; viewer: Viewer; width: number; busy: boolean; short: boolean; onOpen: (id: string) => void; onBuy: (item: StoreItemView) => void }) {
  const open = useCallback(() => onOpen(item.itemId), [item.itemId, onOpen]);
  const buy = useCallback(() => (short ? onOpen(item.itemId) : onBuy(item)), [short, item, onOpen, onBuy]);
  return <DigitalItemCard item={item} width={width} p={p} viewer={viewer} busy={busy} short={short} onOpen={open} onBuy={buy} />;
});

export const SimilarRail = React.memo(function SimilarRail({
  p, items, pad, viewer, live, dpcoin, buying, onOpen, onBuy,
}: {
  p: TophuntPalette; items: StoreItemView[]; pad: number; viewer: Viewer; live: boolean; dpcoin: number; buying: string | null;
  onOpen: (id: string) => void; onBuy: (item: StoreItemView) => void;
}) {
  if (!items.length) return null;
  return (
    <View>
      <SectionTitle p={p} title="Similar items" />
      <Rail pad={pad}>
        {items.map((i) => (
          <SimilarCard
            key={i.itemId}
            item={i}
            p={p}
            viewer={viewer}
            width={156}
            busy={buying === i.itemId}
            short={!i.owned && isShort(dpcoin, i.priceCoins, live)}
            onOpen={onOpen}
            onBuy={onBuy}
          />
        ))}
      </Rail>
    </View>
  );
});

const styles = StyleSheet.create({
  title: { fontFamily: TH.fonts.bold, fontSize: 17 },
  sub: { fontFamily: TH.fonts.medium, fontSize: 12.5 },
  coll: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, maxWidth: 260, borderRadius: TH.radii.md, paddingHorizontal: 12, paddingVertical: 8 },
  collImg: { width: 40, height: 40, borderRadius: 10 },
  collName: { color: TH.colors.white, fontFamily: TH.fonts.bold, fontSize: 14 },
  collSub: { color: 'rgba(255,255,255,0.8)', fontFamily: TH.fonts.medium, fontSize: 11.5 },
});
