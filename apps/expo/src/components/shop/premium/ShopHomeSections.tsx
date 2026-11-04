/**
 * Sections of the Shop home, drawn to the reference mock (mock.ts MOCK, every
 * length `ref * u`): section headers, the two-row category grid, Featured /
 * Trending cards, the Physical Products + Hot Deals row, My Collection tiles
 * and the quick-actions bar. All static (no per-tile animation), and every
 * card is memoized. Surfaces follow the app theme (TophuntPalette `p`): flat
 * cards with a 1 px border, brand pink links and buttons; item artwork sits
 * on the dark stage in both modes (ArtStage).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { discountOf, type CardTag, type CategoryTile, type CollectionTile, type DealCardView, type ShopNav } from '@/src/lib/shopModel';
import { BRAND, BRAND_BUTTON, BRAND_GRAD, TH, TH_DARK, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import type { ShopProduct } from '@/src/services/shop';
import { FONT_FLOOR, MOCK, cellWidth, font, px, rowWidths } from './mock';
import { DealPager, DealTimerPill } from './DealPager';
import { DiscountTag } from './DiscountTag';
import { ProductPreview } from './ProductPreview';
import { BoltIcon, BoxIcon, ChestArt, CoinArt, CubeLine, TileArt } from './ShopArt';
import { WishlistHeart } from './WishlistHeart';
import { ArtStage, cardShadow } from './surface';

/** "View All" / "Manage" links. */
const LINK = BRAND;

/** Compact price: "2,500 DP", or just the number on very small cards (the coin icon says DP). */
const priceText = (coins: number, w: number) => (w < 70 ? coins.toLocaleString() : `${coins.toLocaleString()} DP`);

export function SectionHeader({
  p, u, icon, title, action, width, style,
}: { p: TophuntPalette; u: number; icon: React.ReactNode; title: string; action?: { label: string; onPress: () => void }; width?: number; style?: any }) {
  const link = font(MOCK.sectionLink, u, FONT_FLOOR.label);
  return (
    <View style={[styles.head, { height: px(20, u), gap: px(6, u), width }, style]}>
      {icon}
      <Text style={[styles.headTitle, { fontSize: font(MOCK.sectionTitle, u, FONT_FLOOR.title), color: p.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={[styles.headAction, { gap: px(3, u) }]} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`}>
          <Text style={[styles.headActionText, { fontSize: link }]}>{action.label}</Text>
          <ArrowIcon variant="arrow" direction="right" size={link} color={LINK} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Small brand pink "SOON" ribbon at a tile's top-right. */
function Soon({ u }: { u: number }) {
  return (
    <View style={[styles.soon, { top: px(3, u), right: px(3, u), borderRadius: px(4, u), paddingHorizontal: px(3, u) }]} pointerEvents="none">
      <Text style={[styles.soonText, { fontSize: font(7.5, u, 6.5) }]}>SOON</Text>
    </View>
  );
}

const CategoryTileView = React.memo(function CategoryTileView({
  p, tile, u, width, height, onPick,
}: { p: TophuntPalette; tile: CategoryTile; u: number; width: number; height: number; onPick: (t: CategoryTile) => void }) {
  const r = px(10, u);
  const labelFs = font(11.5, u, FONT_FLOOR.label);
  // Art 34×28 at y+6 in the mock; it gives way when the label floor needs the room.
  const artH = Math.max(10, Math.min(px(28, u), height - px(6, u) - px(4, u) - labelFs * 1.2 - 1));
  return (
    <TouchableOpacity
      onPress={() => onPick(tile)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={tile.soon ? `${tile.label}: jaldi aa raha hai` : `${tile.label} dekho`}
      style={[styles.tile, { width, height, borderRadius: r, borderWidth: Math.max(1, 1.2 * u), backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
    >
      <View style={{ marginTop: px(6, u) }}>
        <TileArt tile={tile.key} width={(artH * 34) / 28} height={artH} />
      </View>
      <Text style={[styles.tileLabel, { fontSize: labelFs, lineHeight: labelFs * 1.2, bottom: px(4, u), color: p.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {tile.label}
      </Text>
      {tile.soon ? <Soon u={u} /> : null}
    </TouchableOpacity>
  );
});

/** "Shop Categories": 5 tiles, then 6 (widths from the mock, scaled to the row). */
export function CategoryGrid({ p, tiles, u, inner, onPick }: { p: TophuntPalette; tiles: CategoryTile[]; u: number; inner: number; onPick: (t: CategoryTile) => void }) {
  const gap = px(MOCK.catRow1.gap, u);
  const w1 = rowWidths(MOCK.catRow1.widths, inner, gap);
  const w2 = rowWidths(MOCK.catRow2.widths, inner, gap);
  const h = px(MOCK.catRow1.h, u);
  const row1 = tiles.slice(0, 5);
  const row2 = tiles.slice(5, 11);
  return (
    <View>
      <View style={[styles.row, { gap }]}>
        {row1.map((t, k) => <CategoryTileView key={t.key} p={p} tile={t} u={u} width={w1[k]} height={h} onPick={onPick} />)}
      </View>
      <View style={[styles.row, { gap, marginTop: px(MOCK.catRow2.y - MOCK.catRow1.y - MOCK.catRow1.h, u) }]}>
        {row2.map((t, k) => <CategoryTileView key={t.key} p={p} tile={t} u={u} width={w2[k]} height={h} onPick={onPick} />)}
      </View>
    </View>
  );
}

/**
 * Card border and tag pill for a tag. NEW / LIMITED are brand badges on a
 * neutral card border (`neutral`, the palette border); rarity tags keep their
 * rarity colour (item semantics) as the 1 px border.
 */
export function tagColors(tag: CardTag, neutral: string = TH_DARK.border): { border: string; pill: [string, string] } {
  if (tag.kind === 'new') return { border: neutral, pill: [BRAND, BRAND] };
  if (tag.kind === 'limited') return { border: neutral, pill: BRAND_GRAD };
  switch (tag.rarity) {
    case 'legendary': return { border: rarityToken('legendary').color, pill: ['#EA580C', '#F59E0B'] };
    case 'mythic': return { border: rarityToken('mythic').color, pill: ['#DB2777', '#EC4899'] };
    case 'epic': return { border: rarityToken('epic').color, pill: ['#9333EA', '#9333EA'] };
    case 'rare': return { border: rarityToken('rare').color, pill: ['#2563EB', rarityToken('rare').color] };
    default: return { border: neutral, pill: ['#6B7280', '#6B7280'] };
  }
}

function Price({ p, item, u, size, width }: { p: TophuntPalette; item: StoreItemView; u: number; size: number; width: number }) {
  const fs = font(size, u, FONT_FLOOR.label);
  if (item.owned) {
    return (
      <View style={[styles.price, { gap: px(3, u) }]}>
        <Ionicons name="checkmark-circle" size={fs} color={TH.colors.success} />
        <Text style={[styles.priceText, { fontSize: fs, color: TH.colors.success }]} numberOfLines={1}>Owned</Text>
      </View>
    );
  }
  return (
    <View style={[styles.price, { gap: px(3, u) }]}>
      <CoinArt size={Math.max(fs, px(size + 1, u))} />
      <Text style={[styles.priceText, { fontSize: fs, color: p.text }]} numberOfLines={1}>{priceText(item.priceCoins, width)}</Text>
      <DiscountTag item={item} size={fs * 0.82} showWas={width >= 120} color={p.sub} />
    </View>
  );
}

/** "Featured Collection" card (168×116): tag pill, item art, name, price, heart. */
export const FeatureCard = React.memo(function FeatureCard({
  p, item, tag, u, width, viewer, onOpen,
}: { p: TophuntPalette; item: StoreItemView; tag: CardTag; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const c = tagColors(tag, p.border);
  const h = px(MOCK.feat.h, u);
  const legendary = tag.kind === 'rarity' && tag.rarity === 'legendary';
  const tagH = Math.max(px(16, u), font(9.5, u, 7.5) + 3);
  const nameFs = font(12.5, u);
  const priceFs = font(13, u, FONT_FLOOR.label);
  // Mock: art y+14 (62 high), name y+80, price row y+98. With font floors the
  // text rows can be taller than the mock: the art gives way, never the text.
  const footTop = h - px(8, u) - priceFs * 1.25;
  const nameTop = footTop - px(3, u) - nameFs * 1.25;
  const artH = Math.max(14, Math.min(px(62, u), nameTop - px(14, u) - px(2, u)));
  const artW = Math.min(px(96, u), width - px(12, u));
  return (
    <View
      style={[styles.card, { width, height: h, borderRadius: px(MOCK.feat.radius, u), borderWidth: Math.max(1, 1.5 * u), borderColor: c.border, backgroundColor: p.card }, cardShadow(p)]}
    >
      {legendary ? <View style={[styles.legGlow, { width: px(90, u), height: px(60, u), borderRadius: px(45, u), top: px(14, u), left: (width - px(90, u)) / 2 }]} /> : null}
      <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`${item.name}, ${tag.label}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin`}. Details kholo`}>
        <View style={[styles.abs, { top: px(14, u), left: (width - artW) / 2 }]}>
          <ArtStage width={artW} height={artH} radius={px(8, u)}>
            <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(8, u)} bare />
          </ArtStage>
        </View>
        <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(6, u), right: px(6, u), fontSize: nameFs, lineHeight: nameFs * 1.25, color: p.text }]} numberOfLines={1}>{item.name}</Text>
      </Pressable>
      <LinearGradient colors={c.pill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.tag, { top: px(8, u), left: px(8, u), height: tagH, borderRadius: tagH / 2, paddingHorizontal: px(6, u) }]} pointerEvents="none">
        <Text style={[styles.tagText, { fontSize: font(9.5, u, 7.5), letterSpacing: 0.5 * u }]} numberOfLines={1}>{tag.label}</Text>
      </LinearGradient>
      <View style={[styles.foot, { top: footTop, left: px(8, u), right: px(8, u) }]}>
        <Price p={p} item={item} u={u} size={13} width={width} />
        <WishlistHeart itemId={item.itemId} name={item.name} size={Math.max(10, px(14, u))} bubble={false} color={p.sub} />
      </View>
    </View>
  );
});

/** "Trending Items" card (108×76). */
export const TrendCard = React.memo(function TrendCard({
  p, item, u, width, viewer, onOpen,
}: { p: TophuntPalette; item: StoreItemView; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const h = px(MOCK.trend.h, u);
  const nameFs = font(10, u, FONT_FLOOR.label);
  const priceFs = font(10, u, FONT_FLOOR.label);
  const footTop = h - px(5, u) - priceFs * 1.25;
  const nameTop = footTop - px(1, u) - nameFs * 1.2;
  const artH = Math.max(12, Math.min(px(40, u), nameTop - px(5, u) - 1));
  const artW = Math.min(px(70, u), width - px(8, u));
  return (
    <View style={[styles.card, { width, height: h, borderRadius: px(MOCK.trend.radius, u), backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }, cardShadow(p)]}>
      <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin`}. Details kholo`}>
        <View style={[styles.abs, { top: px(5, u), left: (width - artW) / 2 }]}>
          <ArtStage width={artW} height={artH} radius={px(6, u)}>
            <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(6, u)} bare />
          </ArtStage>
        </View>
        <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(4, u), right: px(4, u), fontSize: nameFs, lineHeight: nameFs * 1.2, color: p.text }]} numberOfLines={1}>{item.name}</Text>
      </Pressable>
      <View style={[styles.foot, { top: footTop, left: px(5, u), right: px(5, u) }]}>
        <Price p={p} item={item} u={u} size={10} width={width} />
        <WishlistHeart itemId={item.itemId} name={item.name} size={Math.max(9, px(11, u))} bubble={false} color={p.sub} />
      </View>
    </View>
  );
});

/** A product card of the Physical Products block (116×88), or a placeholder frame (no price, not tappable). */
export const PhysicalCard = React.memo(function PhysicalCard({ p, product, u, width, onPress }: { p: TophuntPalette; product: ShopProduct | null; u: number; width: number; onPress?: () => void }) {
  const h = px(MOCK.phys.h, u);
  const imgH = px(MOCK.phys.imgH, u);
  const r = px(MOCK.phys.radius, u);
  const frame = [styles.card, { width, height: h, borderRadius: r, backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }, cardShadow(p)];
  const imgFill = { backgroundColor: p.cardAlt };
  if (!product) {
    return (
      <View style={frame} accessible={false}>
        <View style={[styles.physImg, imgFill, { height: imgH, borderTopLeftRadius: r, borderTopRightRadius: r }]}>
          <CubeLine size={px(26, u)} color={p.sub} />
        </View>
      </View>
    );
  }
  const inStock = product.variants.some((v) => v.inStock);
  const img = product.images[0];
  const fs = font(11, u, FONT_FLOOR.label);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`${product.title}, ${product.priceCoins} DP coin${inStock ? '' : ', out of stock'}`} style={frame}>
      <View style={[styles.physImg, imgFill, { height: imgH, borderTopLeftRadius: r, borderTopRightRadius: r }]}>
        {img ? <AppImage source={{ uri: img }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} /> : <CubeLine size={px(26, u)} color={p.sub} />}
        {!inStock ? (
          <View style={[styles.oos, { bottom: px(3, u), left: px(3, u) }]}><Text style={[styles.oosText, { fontSize: font(8, u, 7) }]}>Out of stock</Text></View>
        ) : null}
      </View>
      <Text style={[styles.cardName, { fontSize: fs, marginTop: px(4, u), paddingHorizontal: px(5, u), textAlign: 'left', color: p.text }]} numberOfLines={1}>{product.title}</Text>
      <View style={[styles.price, { gap: px(3, u), paddingHorizontal: px(5, u), marginTop: px(2, u) }]}>
        <CoinArt size={Math.max(fs, px(12, u))} />
        <Text style={[styles.priceText, { fontSize: fs, color: p.text }]} numberOfLines={1}>{discountOf(product) ? product.priceCoins.toLocaleString() : priceText(product.priceCoins, width)}</Text>
        <DiscountTag item={product} size={font(9, u, 7)} color={p.sub} />
      </View>
    </TouchableOpacity>
  );
});

/** Physical Products block (x 26..398): header + 3 cards, or 3 placeholder frames with a caption. */
export function PhysicalBlock({ p, products, u, onAll, onOpen }: { p: TophuntPalette; products: ShopProduct[] | null; u: number; onAll?: () => void; onOpen: (id: string) => void }) {
  const blockW = px(MOCK.physHead.blockW, u);
  const gap = px(MOCK.phys.gap, u);
  const w = cellWidth(blockW - px(8, u), 3, gap);
  const slots: (ShopProduct | null)[] = products ? products.slice(0, 3) : [null, null, null];
  return (
    <View style={{ width: blockW }}>
      <SectionHeader p={p} u={u} icon={<BoxIcon size={px(MOCK.sectionIcon, u)} />} title="Physical Products" action={onAll && products ? { label: 'View All', onPress: onAll } : undefined} />
      <View style={[styles.row, { gap, marginTop: px(MOCK.phys.y - MOCK.physHead.y - MOCK.physHead.h, u) }]}>
        {slots.map((x, k) => <PhysicalCard key={x?.id ?? `ph${k}`} p={p} product={x} u={u} width={w} onPress={x ? () => onOpen(x.id) : undefined} />)}
      </View>
      {!products ? (
        <Text style={[styles.caption, { fontSize: font(10, u), marginTop: px(4, u), color: p.sub }]} numberOfLines={1}>Products jaldi aa rahe hain</Text>
      ) : null}
    </View>
  );
}

/** Hot Deals card (x 410..722, 312×124): a real featured product, or the honest placeholder with the contest CTA. */
export function DealsCard({ p, product, u, onGrab, onContest }: { p: TophuntPalette; product: ShopProduct | null; u: number; onGrab: (id: string) => void; onContest: () => void }) {
  const w = px(MOCK.deals.w, u);
  const h = px(MOCK.deals.h, u);
  const r = px(MOCK.deals.radius, u);
  const btnH = Math.max(px(26, u), font(12, u) + 6);
  const btnFs = font(12, u);
  const button = (label: string, onPress: () => void, a11y: string) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={a11y} style={{ alignSelf: 'flex-start', marginTop: px(6, u) }}>
      <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.btn, { minWidth: px(120, u), height: btnH, borderRadius: btnH / 2, paddingHorizontal: px(8, u), gap: px(4, u) }]}>
        <Text style={[styles.btnText, { fontSize: btnFs }]} numberOfLines={1}>{label}</Text>
        <ArrowIcon variant="arrow" direction="right" size={btnFs} color={TH.colors.white} />
      </LinearGradient>
    </TouchableOpacity>
  );
  return (
    <View style={[{ width: w, minHeight: h, borderRadius: r }, cardShadow(p)]}>
      <View style={[styles.deals, { width: w, minHeight: h, borderRadius: r, padding: px(10, u), backgroundColor: p.card, borderColor: p.border }]}>
        <View style={[styles.head, { gap: px(5, u) }]}>
          <BoltIcon size={px(16, u)} />
          <Text style={[styles.headTitle, { fontSize: font(15, u, FONT_FLOOR.title), color: p.text }]} accessibilityRole="header">Hot Deals</Text>
        </View>
        <View style={[styles.dealsBody, { gap: px(8, u), marginTop: px(4, u) }]}>
          <View style={{ width: px(96, u), height: px(70, u), alignItems: 'center', justifyContent: 'center' }}>
            <ChestArt width={px(96, u)} height={px(70, u)} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {product ? (
              <>
                <Text style={[styles.dealTitle, { fontSize: font(13, u), color: p.text }]} numberOfLines={1}>Featured product</Text>
                <Text style={[styles.dealSub, { fontSize: font(11, u), marginTop: px(2, u), color: p.sub }]} numberOfLines={2}>{product.title}</Text>
                <View style={[styles.price, { gap: px(3, u), marginTop: px(3, u) }]}>
                  <CoinArt size={Math.max(font(11, u), px(13, u))} />
                  <Text style={[styles.priceText, { fontSize: font(12, u), color: p.text }]}>{product.priceCoins.toLocaleString()} DP</Text>
                  <DiscountTag item={product} size={font(10, u, 7.5)} color={p.sub} />
                </View>
                {button('Grab Now', () => onGrab(product.id), `Grab now: ${product.title}`)}
              </>
            ) : (
              <>
                <Text style={[styles.dealTitle, { fontSize: font(13, u), color: p.text }]} numberOfLines={2}>Deals jaldi aa rahe hain</Text>
                <Text style={[styles.dealSub, { fontSize: font(11, u), marginTop: px(2, u), color: p.sub }]} numberOfLines={2}>Contest jeeto, DP coin jama karo</Text>
                {button('Contest jeeto', onContest, 'Contest jeeto: battles kholo')}
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Admin deal cards in the Hot Deals slot (same 312×124 box): the section
 * title and the current card's real timer in the header, one card per page
 * (DealPager), the admin image in place of the chest art, and an
 * "UP TO X% OFF" pill only when the computed percent is above 0.
 */
export function AdminDealsCard({
  p, title, cards, u, onNav,
}: { p: TophuntPalette; title: string; cards: DealCardView<StoreItemView, ShopProduct>[]; u: number; onNav: (nav: ShopNav) => void }) {
  const w = px(MOCK.deals.w, u);
  const h = px(MOCK.deals.h, u);
  const r = px(MOCK.deals.radius, u);
  const pad = px(10, u);
  const pageW = w - pad * 2;
  const [idx, setIdx] = useState(0);
  const cur = cards[Math.min(idx, cards.length - 1)];
  const btnH = Math.max(px(26, u), font(12, u) + 6);
  const btnFs = font(12, u);
  const art = { w: px(96, u), h: px(70, u) };
  const page = (i: number) => {
    const c = cards[i];
    const prod = c.product;
    return (
      <View style={[styles.dealsBody, { gap: px(8, u), marginTop: px(4, u), width: pageW }]}>
        <View style={{ width: art.w, height: art.h, alignItems: 'center', justifyContent: 'center' }}>
          {c.imageUrl ? (
            <AppImage source={{ uri: c.imageUrl }} displayWidth={art.w} style={{ width: art.w, height: art.h, borderRadius: px(8, u), backgroundColor: p.cardAlt }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
          ) : (
            <ChestArt width={art.w} height={art.h} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {c.percent > 0 ? (
            <View style={[styles.offPill, { borderRadius: px(8, u), paddingHorizontal: px(6, u), marginBottom: px(2, u) }]} accessible accessibilityLabel={`Up to ${c.percent}% off`}>
              <Text style={[styles.offPillText, { fontSize: font(10, u, 7.5) }]} numberOfLines={1}>UP TO {c.percent}% OFF</Text>
            </View>
          ) : null}
          <Text style={[styles.dealTitle, { fontSize: font(13, u), color: p.text }]} numberOfLines={1}>{c.title}</Text>
          {c.subtitle ? <Text style={[styles.dealSub, { fontSize: font(11, u), marginTop: px(2, u), color: p.sub }]} numberOfLines={prod ? 1 : 2}>{c.subtitle}</Text> : null}
          {prod ? (
            <View style={[styles.price, { gap: px(3, u), marginTop: px(3, u) }]}>
              <CoinArt size={Math.max(font(11, u), px(13, u))} />
              <Text style={[styles.priceText, { fontSize: font(12, u), color: p.text }]}>{prod.priceCoins.toLocaleString()} DP</Text>
              <DiscountTag item={prod} size={font(10, u, 7.5)} showPercent={false} color={p.sub} />
            </View>
          ) : null}
          <TouchableOpacity onPress={() => onNav(c.nav)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${c.ctaLabel}: ${c.title}`} style={{ alignSelf: 'flex-start', marginTop: px(6, u) }}>
            <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.btn, { minWidth: px(120, u), height: btnH, borderRadius: btnH / 2, paddingHorizontal: px(8, u), gap: px(4, u) }]}>
              <Text style={[styles.btnText, { fontSize: btnFs }]} numberOfLines={1}>{c.ctaLabel}</Text>
              <ArrowIcon variant="arrow" direction="right" size={btnFs} color={TH.colors.white} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  return (
    <View style={[{ width: w, minHeight: h, borderRadius: r }, cardShadow(p)]}>
      <View style={[styles.deals, { width: w, minHeight: h, borderRadius: r, padding: pad, backgroundColor: p.card, borderColor: p.border }]}>
        <View style={[styles.head, { gap: px(5, u) }]}>
          <BoltIcon size={px(16, u)} />
          <Text style={[styles.headTitle, { fontSize: font(15, u, FONT_FLOOR.title), flex: 1, color: p.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
          {cur?.endsAt ? <DealTimerPill endsAt={cur.endsAt} u={u * 0.9} /> : null}
        </View>
        <DealPager p={p} count={cards.length} width={pageW} u={u} renderPage={page} onIndex={setIdx} labelOf={(i) => cards[i]?.title ?? ''} />
      </View>
    </View>
  );
}

const CollectionTileView = React.memo(function CollectionTileView({ p, tile, u, width, onPress }: { p: TophuntPalette; tile: CollectionTile; u: number; width: number; onPress: () => void }) {
  const count = `${tile.count}${tile.more ? '+' : ''}`;
  const labelFs = font(10.5, u, FONT_FLOOR.label);
  const countFs = font(10, u, FONT_FLOOR.label);
  const artH = px(26, u);
  // Mock 62 high; taller only when the font floors need it.
  const h = Math.max(px(MOCK.col.h, u), px(5, u) + artH + labelFs * 1.2 + countFs * 1.2 + px(6, u));
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${tile.label}: ${count}. Collection kholo`}
      style={[styles.tile, { width, height: h, borderRadius: px(MOCK.col.radius, u), borderWidth: 1, backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
    >
      <View style={{ marginTop: px(5, u) }}>
        <TileArt tile={tile.key} width={px(32, u)} height={artH} />
      </View>
      <Text style={[styles.colLabel, { fontSize: labelFs, lineHeight: labelFs * 1.2, marginTop: px(1, u), color: p.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tile.label}</Text>
      <Text style={[styles.colCount, { fontSize: countFs, lineHeight: countFs * 1.2, color: p.sub }]} numberOfLines={1}>({count})</Text>
    </TouchableOpacity>
  );
});

export function CollectionRow({ p, tiles, u, inner, onPress }: { p: TophuntPalette; tiles: CollectionTile[]; u: number; inner: number; onPress: () => void }) {
  const gap = px(MOCK.col.gap, u);
  const w = cellWidth(inner, MOCK.col.cols, gap);
  return (
    <View style={[styles.row, { gap }]}>
      {tiles.map((t) => <CollectionTileView key={t.key} p={p} tile={t} u={u} width={w} onPress={onPress} />)}
    </View>
  );
}

export interface QuickAction {
  key: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  onPress: () => void;
}

/** Bottom quick-actions bar: one row, equal items split by dividers. */
export function QuickActionsBar({ p, actions, u, width }: { p: TophuntPalette; actions: QuickAction[]; u: number; width: number }) {
  const h = Math.max(px(MOCK.quick.h, u), font(12.5, u) + font(10, u) + 10);
  return (
    <View style={[styles.qa, { width, height: h, borderRadius: px(MOCK.quick.radius, u), backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}>
      {actions.map((a, i) => (
        <TouchableOpacity
          key={a.key}
          onPress={a.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${a.title}: ${a.sub}`}
          style={[styles.qaItem, { gap: px(6, u), paddingHorizontal: px(8, u) }, i > 0 && [styles.divider, { borderLeftColor: p.border }]]}
        >
          {a.icon}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.qaTitle, { fontSize: font(12.5, u), color: p.text }]} numberOfLines={1}>{a.title}</Text>
            <Text style={[styles.qaSub, { fontSize: font(10, u, FONT_FLOOR.label), color: p.sub }]} numberOfLines={1}>{a.sub}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  row: { flexDirection: 'row' },
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  headAction: { flexDirection: 'row', alignItems: 'center' },
  headActionText: { color: LINK, fontFamily: TH.fonts.semibold },
  tile: { alignItems: 'center' },
  tileLabel: { position: 'absolute', left: 2, right: 2, fontFamily: TH.fonts.semibold, textAlign: 'center' },
  soon: { position: 'absolute', backgroundColor: BRAND },
  soonText: { color: '#FFF', fontFamily: TH.fonts.bold, letterSpacing: 0.3 },
  card: { overflow: 'visible' },
  legGlow: { position: 'absolute', backgroundColor: 'rgba(255,200,87,0.18)' },
  tag: { position: 'absolute', justifyContent: 'center' },
  tagText: { color: '#FFF', fontFamily: TH.fonts.bold },
  cardName: { fontFamily: TH.fonts.semibold, textAlign: 'center' },
  foot: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  priceText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  physImg: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  oos: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, paddingVertical: 1 },
  oosText: { color: '#FFF', fontFamily: TH.fonts.bold },
  caption: { fontFamily: TH.fonts.medium, textAlign: 'center' },
  deals: { borderWidth: 1, overflow: 'hidden' },
  dealsBody: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dealTitle: { fontFamily: TH.fonts.bold },
  dealSub: { fontFamily: TH.fonts.medium },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: TH.colors.white, fontFamily: TH.fonts.bold },
  offPill: { alignSelf: 'flex-start', backgroundColor: BRAND, paddingVertical: 1 },
  offPillText: { color: '#FFF', fontFamily: TH.fonts.bold, letterSpacing: 0.3 },
  colLabel: { fontFamily: TH.fonts.semibold, textAlign: 'center', paddingHorizontal: 2 },
  colCount: { fontFamily: TH.fonts.semibold },
  qa: { flexDirection: 'row', borderWidth: 1 },
  qaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  divider: { borderLeftWidth: 1 },
  qaTitle: { fontFamily: TH.fonts.bold },
  qaSub: { fontFamily: TH.fonts.medium },
});
