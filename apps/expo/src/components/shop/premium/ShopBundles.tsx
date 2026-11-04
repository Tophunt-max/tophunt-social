/**
 * "Shop Bundles": Diamond-priced groups of digital items the admin puts
 * together (worker getShopCollections). The phone home section (header with
 * the gift icon, an optional badge pill, up to 3 equal cards), the same card
 * in the all-bundles grid, and the bundle artwork shared with the detail
 * screen.
 *
 * Every number on a card is the server's: price, compare-at (only when above
 * the price), how many items, which types, how many the user already owns.
 * Tapping a card opens the bundle detail; buying always goes through its
 * confirmation sheet.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Ionicons } from '@/src/lib/icons';
import { bundleAllOwned, bundleItemsLine } from '@/src/lib/shopModel';
import { SHOP_BUNDLE_GRAD, SHOP_TAG_NEW, SHOP_YELLOW_BTN, SHOP_YELLOW_INK, TH, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { PublicShopBundle, PublicShopBundleItem, StoreItemView } from '@/src/services/monetization';
import { MOCK_M, cellWidth, mfont, px } from './mock';
import { ProductPreview } from './ProductPreview';
import { GiftArt, GiftIcon } from './ShopArt';
import { SectionHeaderM } from './ShopHomeMobile';
import { lavenderShadow } from './surface';

const WHITE = TH.colors.white;
/** Cards on the phone home. */
export const HOME_BUNDLES_MAX = 3;

/** A bundle item in the shape ProductPreview draws (it is not a store listing: no price). */
export function bundlePreviewItem(i: PublicShopBundleItem): StoreItemView {
  return {
    itemId: i.itemId,
    type: i.type,
    name: i.name,
    description: '',
    rarity: i.rarity,
    asset: i.asset ?? {},
    priceCoins: 0,
    ownership: 'permanent',
    refundable: false,
    remaining: null,
    endsAt: null,
    owned: i.owned,
  };
}

/** Pink pill with the admin's badge text ("Best Value"). */
export function BundleBadge({ label, u, style }: { label: string; u: number; style?: any }) {
  const h = px(14, u);
  return (
    <LinearGradient colors={SHOP_TAG_NEW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.badge, { height: h, borderRadius: h / 2, paddingHorizontal: px(6, u) }, style]} pointerEvents="none">
      <Text style={[styles.badgeText, { fontSize: mfont(7.5, u) }]} numberOfLines={1}>{label}</Text>
    </LinearGradient>
  );
}

/**
 * The bundle artwork: the admin image, else a gift box over small previews of
 * the first 2–3 items. Sized by the caller; transparent so the card gradient shows.
 */
export function BundleArt({ bundle, viewer, width, height, radius }: { bundle: PublicShopBundle; viewer: Viewer; width: number; height: number; radius: number }) {
  if (bundle.imageUrl) {
    return (
      <AppImage
        source={{ uri: bundle.imageUrl }}
        displayWidth={width}
        style={{ width, height, borderRadius: radius }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }
  const thumbs = bundle.items.slice(0, bundle.items.length > 2 ? 3 : 2);
  const gap = Math.max(2, Math.round(width * 0.03));
  const thumb = Math.floor(Math.min(height * 0.44, (width - gap * 2 - 4) / Math.max(1, thumbs.length)));
  const giftH = Math.max(16, height - thumb * 0.55);
  const giftW = Math.min(width * 0.8, giftH * 1.2);
  return (
    <View style={{ width, height, alignItems: 'center' }} pointerEvents="none">
      <View style={{ position: 'absolute', top: 0 }}>
        <GiftArt width={giftW} height={giftH * 0.9} />
      </View>
      {thumbs.length ? (
        <View style={[styles.thumbs, { gap, bottom: 0 }]}>
          {thumbs.map((i) => (
            <View key={i.itemId} style={[styles.thumb, { width: thumb, height: thumb, borderRadius: Math.round(thumb * 0.22) }]}>
              <ProductPreview item={bundlePreviewItem(i)} viewer={viewer} width={thumb - 2} height={thumb - 2} radius={Math.round(thumb * 0.2)} bare />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The yellow price button look (decorative: the whole card opens the bundle). */
function PricePill({ price, u }: { price: number; u: number }) {
  const h = px(20, u);
  const fs = mfont(10, u);
  return (
    <LinearGradient colors={SHOP_YELLOW_BTN} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.pill, { height: h, borderRadius: h / 2, gap: px(3, u), paddingHorizontal: px(6, u) }]}>
      <DiamondIcon size={fs + 1} />
      <Text style={[styles.pillText, { fontSize: fs, color: SHOP_YELLOW_INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{price.toLocaleString()}</Text>
    </LinearGradient>
  );
}

function OwnedPill({ u }: { u: number }) {
  const h = px(20, u);
  const fs = mfont(9.5, u);
  return (
    <View style={[styles.pill, styles.ownedPill, { height: h, borderRadius: h / 2, gap: px(3, u), paddingHorizontal: px(6, u) }]}>
      <Ionicons name="checkmark-circle" size={fs + 1} color={TH.colors.success} />
      <Text style={[styles.pillText, { fontSize: fs, color: WHITE }]} numberOfLines={1}>Owned</Text>
    </View>
  );
}

/** One bundle card: violet → magenta, art on top, name, "N items • types", the yellow Diamond price or Owned. */
export const BundleCard = React.memo(function BundleCard({
  p, bundle, u, width, viewer, onOpen,
}: { p: TophuntPalette; bundle: PublicShopBundle; u: number; width: number; viewer: Viewer; onOpen: (id: string) => void }) {
  const r = px(12, u);
  const pad = px(5, u);
  const artW = width - pad * 2;
  const artH = Math.round(artW * 0.66);
  const nameFs = mfont(10, u);
  const lineFs = mfont(7.5, u);
  const line = bundleItemsLine(bundle.items);
  const total = bundle.items.length;
  const owned = bundle.purchased;
  const showOwnedChip = !owned && bundle.ownedCount > 0 && total > 0;
  const allOwned = !owned && bundleAllOwned(bundle);
  return (
    <Pressable
      onPress={() => onOpen(bundle.id)}
      accessibilityRole="button"
      accessibilityLabel={`${bundle.name}${bundle.badge ? `, ${bundle.badge}` : ''}, ${line}, ${owned ? 'owned' : `${bundle.priceDiamonds} Diamond`}${showOwnedChip ? `, ${bundle.ownedCount} of ${total} owned` : ''}. Details kholo`}
      style={({ pressed }) => [{ width, borderRadius: r, opacity: pressed ? 0.9 : 1 }, lavenderShadow(p)]}
    >
      <LinearGradient colors={SHOP_BUNDLE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { flex: 1, borderRadius: r, padding: pad }]}>
        <View style={{ width: artW, height: artH, borderRadius: px(8, u), overflow: 'hidden' }}>
          <BundleArt bundle={bundle} viewer={viewer} width={artW} height={artH} radius={px(8, u)} />
        </View>
        {bundle.badge ? <BundleBadge label={bundle.badge} u={u} style={{ position: 'absolute', top: pad + px(2, u), left: pad + px(2, u), maxWidth: artW - px(4, u) }} /> : null}
        {showOwnedChip ? (
          <View style={[styles.chip, { top: pad + px(2, u), right: pad + px(2, u), borderRadius: px(6, u), paddingHorizontal: px(4, u), height: px(13, u) }]} pointerEvents="none">
            <Text style={[styles.chipText, { fontSize: mfont(7, u) }]} numberOfLines={1}>{`${Math.min(bundle.ownedCount, total)}/${total} owned`}</Text>
          </View>
        ) : null}
        <Text style={[styles.name, { fontSize: nameFs, lineHeight: nameFs * 1.2, marginTop: px(5, u) }]} numberOfLines={2}>{bundle.name}</Text>
        <Text style={[styles.line, { fontSize: lineFs, lineHeight: lineFs * 1.3, marginTop: px(1, u) }]} numberOfLines={2}>{line}</Text>
        <View style={{ flex: 1 }} />
        <View style={{ marginTop: px(5, u), alignItems: 'center', gap: px(1, u) }}>
          {!owned && bundle.compareAtDiamonds ? (
            <Text style={[styles.was, { fontSize: mfont(7.5, u) }]} numberOfLines={1}>{bundle.compareAtDiamonds.toLocaleString()}</Text>
          ) : null}
          {owned ? <OwnedPill u={u} /> : allOwned ? (
            <View style={[styles.pill, styles.ownedPill, { height: px(20, u), borderRadius: px(10, u), paddingHorizontal: px(6, u) }]}>
              <Text style={[styles.pillText, { fontSize: mfont(8.5, u), color: WHITE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Sab owned</Text>
            </View>
          ) : <PricePill price={bundle.priceDiamonds} u={u} />}
        </View>
      </LinearGradient>
    </Pressable>
  );
});

/** Cards in rows of `cols`; each row's cards share its height. */
export function BundleGrid({
  p, bundles, u, width, cols, gap, viewer, onOpen,
}: { p: TophuntPalette; bundles: PublicShopBundle[]; u: number; width: number; cols: number; gap: number; viewer: Viewer; onOpen: (id: string) => void }) {
  const w = cellWidth(width, cols, gap);
  const rows: PublicShopBundle[][] = [];
  for (let k = 0; k < bundles.length; k += cols) rows.push(bundles.slice(k, k + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, k) => (
        <View key={k} style={[styles.row, { gap, alignItems: 'stretch' }]}>
          {row.map((b) => <BundleCard key={b.id} p={p} bundle={b} u={u} width={w} viewer={viewer} onOpen={onOpen} />)}
        </View>
      ))}
    </View>
  );
}

/**
 * The phone home "Shop Bundles" section: gift icon, title, the first bundle's
 * badge as a pill (only when it has one), "View All" with more than 3, then up
 * to 3 cards. Render only when there are bundles.
 */
export function ShopBundlesM({
  p, bundles, u, inner, viewer, onOpen, onAll, style,
}: { p: TophuntPalette; bundles: PublicShopBundle[]; u: number; inner: number; viewer: Viewer; onOpen: (id: string) => void; onAll: () => void; style?: any }) {
  if (!bundles.length) return null;
  const first = bundles[0];
  const gap = px(MOCK_M.popular.gap, u);
  return (
    <View style={style}>
      <SectionHeaderM
        p={p}
        u={u}
        icon={<GiftIcon size={px(MOCK_M.section.icon, u)} />}
        title="Shop Bundles"
        titleAccessory={first.badge ? <BundleBadge label={first.badge} u={u} style={{ marginLeft: px(2, u) }} /> : undefined}
        action={bundles.length > HOME_BUNDLES_MAX ? { label: 'View All', onPress: onAll } : undefined}
      />
      <View style={{ marginTop: px(MOCK_M.head, u) }}>
        <BundleGrid p={p} bundles={bundles.slice(0, HOME_BUNDLES_MAX)} u={u} width={inner} cols={HOME_BUNDLES_MAX} gap={gap} viewer={viewer} onOpen={onOpen} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  badge: { justifyContent: 'center', alignSelf: 'flex-start' },
  badgeText: { color: WHITE, fontFamily: TH.fonts.bold, letterSpacing: 0.3 },
  chip: { position: 'absolute', justifyContent: 'center', backgroundColor: 'rgba(8,8,23,0.62)' },
  chipText: { color: WHITE, fontFamily: TH.fonts.bold },
  thumbs: { position: 'absolute', flexDirection: 'row', justifyContent: 'center' },
  thumb: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(8,8,23,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  name: { color: WHITE, fontFamily: TH.fonts.bold },
  line: { color: '#EBDDFF', fontFamily: TH.fonts.medium },
  was: { color: 'rgba(255,255,255,0.7)', fontFamily: TH.fonts.medium, textDecorationLine: 'line-through' },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  ownedPill: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  pillText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
});
