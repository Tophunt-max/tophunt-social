/**
 * PHONE layout of the Shop "Physical" tab (design mock), shown when the tab
 * is opened without a category: the "Physical Rewards" hero with the yellow
 * Explore Rewards button, the trust row (Free Shipping, Secure Packaging,
 * Easy Replacement, Genuine Products), the Featured Rewards, Trending
 * Products (real most-ordered) and Exclusive Collection (admin picks) rows
 * of product cards (a HOT / NEW / POPULAR / LIMITED pill, a saved heart and
 * the pink DP price pill), the Categories row (6 tiles; the admin's uploaded
 * images when managed, else outline icons) and the "Redeem & Get Real
 * Rewards" banner. Picking a category / "View All" / Explore opens the full
 * products catalogue (app/shop/index.tsx).
 *
 * Every length is `mock px * u` (u = width / 340, premium/mock.ts). Data rules
 * (src/lib/physicalHomeModel.ts): the shelf holds real in-stock featured
 * products only, every tag comes from a real field (stock, compare-at,
 * createdAt, featured) and a card with no signal shows no tag. Hearts save
 * the product on the device (useSavedProducts; the server wishlist is
 * digital-items only).
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/components/shop/ShopGlyphs';
import {
  productTag,
  type PhysicalCategory,
  type PhysCatIcon,
} from '@/src/lib/physicalHomeModel';
import type { ShopProduct } from '@/src/services/shop';
import {
  BRAND,
  BRAND_BUTTON,
  SHOP_HERO_GRAD,
  SHOP_PRODUCT_TAG_GRADS,
  SHOP_REDEEM_GRAD,
  SHOP_YELLOW_BTN,
  SHOP_YELLOW_INK,
  TH,
  type TophuntPalette,
} from '@/src/theme/tophunt';
import { MOCK_M, cellWidth, mfont, px } from './mock';
import { CrownIcon, DiamondSparkle, FlameIcon, GiftArt, TabGlyph, TrophyIcon } from './ShopArt';
import { SectionHeaderM } from './ShopHomeMobile';
import { lavenderShadow, shopBorder } from './surface';
import { ShopIcon } from '@/src/components/shop/ShopIcon';
import type { ShopIconKey } from '@/assets/icons/shop';

const WHITE = TH.colors.white;

/** Geometry of the Physical tab mock (mock px at 340 wide; widths come from cellWidth). */
export const PHYS_M = {
  /** "Physical Rewards" hero: purple gradient, yellow CTA, products art right. */
  hero: { h: 64, radius: 14, crown: 11, title: 14, sub: 8.5, ctaH: 20, cta: 8.5, artW: 116 },
  /** Trust row: 4 white pills (icon + 2-line label). */
  trust: { cols: 4, gap: 6, h: 28, radius: 9, icon: 13, text: 7.5 },
  /** Featured Rewards: 4 white cards with the product photo and the pink price pill. */
  feat: { cols: 4, gap: 6, h: 95, radius: 10, imgH: 38, name: 8, price: 7.5, priceH: 14, tag: 6.5, tagH: 11, coin: 11, heart: 9 },
  /** Categories: 6 white tiles with a pink outline icon. */
  cat: { cols: 6, gap: 5, h: 46, radius: 10, icon: 16, label: 6.5 },
  /** "Redeem & Get Real Rewards" banner: trophy left, gifts right. */
  banner: { h: 46, radius: 12, title: 11, sub: 7.5, trophy: 34, giftsW: 56, giftsH: 38 },
} as const;

/** Extra touch area so a control shorter than 44 pt still gets a 44 pt target. */
const slop = (h: number) => {
  const v = Math.max(0, Math.ceil((44 - h) / 2));
  return { top: v, bottom: v, left: 6, right: 6 };
};

// ------------------------------------------------------------------ hero

/** Products collage on the hero's right: gift box, shirt, trophy and sparkles (admin banner art can replace it). */
function HeroArt({ width, height }: { width: number; height: number }) {
  return (
    <View style={{ width, height }} pointerEvents="none">
      <View style={[styles.abs, { right: 0, bottom: 0 }]}>
        <GiftArt width={width * 0.52} height={height * 0.72} />
      </View>
      <View style={[styles.abs, { left: width * 0.1, bottom: height * 0.06 }]}>
        <ShopIcon name="uiShirt" size={height * 0.52} color="#FFD9E1" />
      </View>
      <View style={[styles.abs, { right: width * 0.42, bottom: 0 }]}>
        <TrophyIcon size={height * 0.4} />
      </View>
      <View style={[styles.abs, { left: width * 0.3, top: 0 }]}><DiamondSparkle size={height * 0.2} /></View>
      <View style={[styles.abs, { right: width * 0.04, top: height * 0.1 }]}><DiamondSparkle size={height * 0.16} /></View>
    </View>
  );
}

/** "Physical Rewards / Redeem Your DP Coins for Real Products" + yellow Explore Rewards, on the purple hero gradient. */
export function PhysicalHeroM({ u, width, onExplore }: { u: number; width: number; onExplore: () => void }) {
  const H = PHYS_M.hero;
  const h = px(H.h, u);
  const r = px(H.radius, u);
  const titleFs = mfont(H.title, u);
  const subFs = mfont(H.sub, u);
  const ctaH = px(H.ctaH, u);
  const ctaFs = mfont(H.cta, u);
  return (
    <TouchableOpacity onPress={onExplore} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Physical Rewards: DP coin se real products redeem karo. Explore rewards" style={{ width, borderRadius: r }}>
      <LinearGradient colors={SHOP_HERO_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { width, minHeight: h, borderRadius: r, paddingLeft: px(10, u), paddingVertical: px(8, u) }]}>
        <View style={{ flex: 1, minWidth: 0, gap: px(3, u) }}>
          <View style={[styles.rowCenter, { gap: px(4, u) }]}>
            <CrownIcon size={px(H.crown, u)} />
            <Text style={[styles.heroTitle, { fontSize: titleFs, lineHeight: titleFs * 1.15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">Physical Rewards</Text>
          </View>
          <Text style={[styles.heroSub, { fontSize: subFs, lineHeight: subFs * 1.3 }]} numberOfLines={2}>{'Redeem Your DP Coins\nfor Real Products'}</Text>
          <View style={{ alignSelf: 'flex-start', marginTop: px(3, u) }} pointerEvents="none">
            <LinearGradient colors={SHOP_YELLOW_BTN} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.rowCenter, { height: ctaH, borderRadius: ctaH / 2, paddingHorizontal: px(10, u), gap: px(4, u) }]}>
              <Text style={[styles.ctaText, { fontSize: ctaFs, color: SHOP_YELLOW_INK }]} numberOfLines={1}>Explore Rewards</Text>
              <ArrowIcon variant="arrow" direction="right" size={ctaFs} color={SHOP_YELLOW_INK} />
            </LinearGradient>
          </View>
        </View>
        <HeroArt width={px(H.artW, u)} height={h - px(10, u)} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------------ trust row

const TRUST: { key: string; icon: string; lines: string }[] = [
  { key: 'shipping', icon: 'car-outline', lines: 'Free\nShipping' },
  { key: 'packaging', icon: 'shield-checkmark-outline', lines: 'Secure\nPackaging' },
  { key: 'replacement', icon: 'swap-horizontal-outline', lines: 'Easy\nReplacement' },
  { key: 'genuine', icon: 'ribbon-outline', lines: 'Genuine\nProducts' },
];

/** The 4 service promises of the mock (delivery is included in every price; returns follow each product's return window). */
export function TrustRowM({ p, u, inner }: { p: TophuntPalette; u: number; inner: number }) {
  const T = PHYS_M.trust;
  const gap = px(T.gap, u);
  const w = cellWidth(inner, T.cols, gap);
  const h = px(T.h, u);
  const r = px(T.radius, u);
  const fs = mfont(T.text, u);
  return (
    <View style={[styles.row, { gap }]}>
      {TRUST.map((t) => (
        <View key={t.key} style={[styles.trustPill, { width: w, height: h, borderRadius: r, gap: px(4, u), paddingHorizontal: px(5, u), backgroundColor: p.card, borderColor: shopBorder(p) }, lavenderShadow(p)]}>
          <Ionicons name={t.icon} size={px(T.icon, u)} color={BRAND} />
          <Text style={[styles.trustText, { fontSize: fs, lineHeight: fs * 1.25, color: p.text }]}>{t.lines}</Text>
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ Featured Rewards cards

/** Heart of a product card: saved on the device (useSavedProducts), filled brand pink when saved. */
function SavedHeart({ id, name, saved, size, onToggle }: { id: string; name: string; saved: boolean; size: number; onToggle: (id: string) => void }) {
  return (
    <TouchableOpacity
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onToggle(id);
      }}
      hitSlop={slop(size)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={`${name}: ${saved ? 'Saved se hatao' : 'Save karo'}`}
    >
      <ShopIcon name={saved ? 'uiHeartFilled' : 'uiHeart'} size={size} color={BRAND} />
    </TouchableOpacity>
  );
}

/** Featured Rewards card: tag pill top-left, saved heart top-right, product photo, 1-line name and the pink DP price pill. */
export const ProductCardM = React.memo(function ProductCardM({
  p, product, now, u, width, saved, onOpen, onToggleSaved,
}: {
  p: TophuntPalette;
  product: ShopProduct;
  now: number;
  u: number;
  width: number;
  saved: boolean;
  onOpen: (id: string) => void;
  onToggleSaved: (id: string) => void;
}) {
  const F = PHYS_M.feat;
  const h = px(F.h, u);
  const r = px(F.radius, u);
  const tag = productTag(product, now);
  const nameFs = mfont(F.name, u);
  const priceFs = mfont(F.price, u);
  const pillH = px(F.priceH, u);
  const heart = px(F.heart, u);
  const img = product.images[0] ?? null;
  const ink = p.isDark ? WHITE : p.text;
  const a11y = `${product.title}, ${product.priceCoins.toLocaleString()} DP coin${tag ? `, ${tag.label}` : ''}. Details kholo`;
  return (
    <Pressable
      onPress={() => onOpen(product.id)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[{ width, height: h, borderRadius: r, backgroundColor: p.card, borderColor: shopBorder(p), borderWidth: 1, overflow: 'hidden' }, lavenderShadow(p)]}
    >
      <View style={[styles.col, { paddingTop: px(4, u), paddingBottom: px(4, u), paddingHorizontal: px(3, u), gap: px(3, u) }]}>
        <View style={{ width: '100%', height: px(F.imgH, u), alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          {img ? (
            <AppImage source={{ uri: img }} displayWidth={Math.round(width - px(8, u))} style={{ width: width - px(8, u), height: px(F.imgH, u) }} contentFit="contain" transition={0} accessibilityLabel={product.title} />
          ) : (
            <ShopIcon name="uiPackage" size={px(F.imgH, u) * 0.7} color={p.sub} />
          )}
        </View>
        <Text style={[styles.cardName, { fontSize: nameFs, lineHeight: nameFs * 1.2, color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{product.title}</Text>
        <View style={{ flex: 1 }} />
        <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.rowCenter, { height: pillH, borderRadius: pillH / 2, paddingHorizontal: px(6, u), gap: px(2.5, u) }]} pointerEvents="none">
          <CoinIcon size={px(F.coin, u)} />
          <Text style={[styles.priceText, { fontSize: priceFs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`${product.priceCoins.toLocaleString()} DP`}</Text>
        </LinearGradient>
      </View>
      {tag ? (
        <LinearGradient colors={SHOP_PRODUCT_TAG_GRADS[tag.kind]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.abs, styles.tag, { top: px(4, u), left: px(4, u), height: px(F.tagH, u), borderRadius: px(F.tagH, u) / 2, paddingHorizontal: px(4.5, u) }]} pointerEvents="none">
          <Text style={[styles.tagText, { fontSize: mfont(F.tag, u), letterSpacing: 0.3 * u }]} numberOfLines={1}>{tag.label}</Text>
        </LinearGradient>
      ) : null}
      <View style={[styles.abs, { top: px(4, u), right: px(4, u) }]}>
        <SavedHeart id={product.id} name={product.title} saved={saved} size={heart} onToggle={onToggleSaved} />
      </View>
    </Pressable>
  );
});

// ------------------------------------------------------------------ Categories row

/** Baseball cap outline (lucide has none), same stroke style as the other category icons. */
const CAT_ICON: Record<PhysCatIcon, ShopIconKey> = { shirt: 'uiShirt', cap: 'uiCap', headphones: 'uiHeadphones', watch: 'uiWatch', mug: 'uiCoffee', gift: 'uiGift', box: 'uiPackage' };

function CatIcon({ icon, size }: { icon: PhysCatIcon; size: number }) {
  return <ShopIcon name={CAT_ICON[icon] ?? 'uiPackage'} size={size} color={BRAND} />;
}

/** Categories row: 6 white tiles — the admin's uploaded image when there is one, else the pink outline icon — and the category name. */
export function CategoryTilesM({ p, u, inner, cats, onPick }: { p: TophuntPalette; u: number; inner: number; cats: PhysicalCategory[]; onPick: (key: string) => void }) {
  const C = PHYS_M.cat;
  const gap = px(C.gap, u);
  const w = cellWidth(inner, C.cols, gap);
  const h = px(C.h, u);
  const r = px(C.radius, u);
  const fs = mfont(C.label, u);
  const icon = px(C.icon, u);
  return (
    <View style={[styles.row, { gap }]}>
      {cats.map((c) => (
        <TouchableOpacity
          key={c.key}
          onPress={() => onPick(c.key)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${c.label}: ${c.count} products. Dekho`}
          style={[styles.catTile, { width: w, height: h, borderRadius: r, gap: px(2, u), backgroundColor: p.card, borderColor: shopBorder(p) }, lavenderShadow(p)]}
        >
          {c.imageUrl ? (
            <AppImage source={{ uri: c.imageUrl }} displayWidth={Math.round(icon)} style={{ width: icon, height: icon, borderRadius: icon * 0.3 }} contentFit="cover" transition={0} accessibilityLabel={c.label} />
          ) : (
            <CatIcon icon={c.icon} size={icon} />
          )}
          <Text style={[styles.catLabel, { fontSize: fs, lineHeight: fs * 1.2, color: p.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{c.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ Redeem banner

/** "Redeem & Get Real Rewards" banner: gold trophy left, text, gift boxes right, on the pink → violet gradient. */
export function RedeemBannerM({ u, width, onExplore }: { u: number; width: number; onExplore: () => void }) {
  const B = PHYS_M.banner;
  const h = px(B.h, u);
  const r = px(B.radius, u);
  const titleFs = mfont(B.title, u);
  const subFs = mfont(B.sub, u);
  return (
    <TouchableOpacity onPress={onExplore} activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="Redeem and get real rewards: TopHunt branded products, gadgets and more. Dekho" style={{ width, borderRadius: r }}>
      <LinearGradient colors={SHOP_REDEEM_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.rowCenter, { width, minHeight: h, borderRadius: r, paddingHorizontal: px(8, u), paddingVertical: px(5, u), gap: px(6, u), overflow: 'hidden' }]}>
        <View pointerEvents="none"><TrophyIcon size={px(B.trophy, u)} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: px(1.5, u) }}>
          <Text style={[styles.bannerTitle, { fontSize: titleFs, lineHeight: titleFs * 1.15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">Redeem &amp; Get Real Rewards</Text>
          <Text style={[styles.bannerSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>TopHunt Branded Products, Gadgets &amp; More</Text>
        </View>
        <View style={{ width: px(B.giftsW, u), height: px(B.giftsH, u) }} pointerEvents="none">
          <View style={[styles.abs, { right: 0, bottom: 0 }]}><GiftArt width={px(B.giftsW, u) * 0.62} height={px(B.giftsH, u) * 0.8} /></View>
          <View style={[styles.abs, { left: 0, bottom: 0 }]}><GiftArt width={px(B.giftsW, u) * 0.5} height={px(B.giftsH, u) * 0.62} /></View>
          <View style={[styles.abs, { left: px(4, u), top: 0 }]}><DiamondSparkle size={px(9, u)} /></View>
          <View style={[styles.abs, { right: px(2, u), top: px(2, u) }]}><DiamondSparkle size={px(7, u)} /></View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------------ loading

/** Skeleton of the Physical home (products loading). */
export function PhysicalHomeSkeleton({ p, u, inner }: { p: TophuntPalette; u: number; inner: number }) {
  const rows = [
    { cols: 1, gap: 0, h: PHYS_M.hero.h, r: PHYS_M.hero.radius },
    { cols: PHYS_M.trust.cols, gap: PHYS_M.trust.gap, h: PHYS_M.trust.h, r: PHYS_M.trust.radius },
    { cols: PHYS_M.feat.cols, gap: PHYS_M.feat.gap, h: PHYS_M.feat.h, r: PHYS_M.feat.radius },
    { cols: PHYS_M.cat.cols, gap: PHYS_M.cat.gap, h: PHYS_M.cat.h, r: PHYS_M.cat.radius },
    { cols: 1, gap: 0, h: PHYS_M.banner.h, r: PHYS_M.banner.radius },
  ];
  return (
    <View accessible accessibilityLabel="Physical products load ho rahe hain">
      {rows.map((row, k) => {
        const gap = px(row.gap, u);
        const w = row.cols === 1 ? inner : cellWidth(inner, row.cols, gap);
        return (
          <View key={k} style={{ marginTop: px(MOCK_M.gap, u) }}>
            {k === 2 || k === 3 ? <View style={{ width: inner * 0.45, height: px(12, u), borderRadius: px(6, u), backgroundColor: p.skeleton, marginBottom: px(MOCK_M.head + 4, u) }} /> : null}
            <View style={[styles.row, { gap }]}>
              {Array.from({ length: row.cols }, (_, i) => (
                <View key={i} style={{ width: w, height: px(row.h, u), borderRadius: px(row.r, u), backgroundColor: p.skeleton }} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ the page

export interface PhysicalHomeProps {
  p: TophuntPalette;
  u: number;
  inner: number;
  now: number;
  /** Featured shelf (physicalHomeModel.featuredProducts: in-stock featured only). */
  featured: ShopProduct[];
  /** Trending shelf (physicalHomeModel.trendingProducts: the server's most-ordered ids). */
  trending: ShopProduct[];
  /** Exclusive Collection shelf (physicalHomeModel.exclusiveProducts: the admin's picks). */
  exclusive: ShopProduct[];
  /** Category tiles (physicalHomeModel.resolveCategories: the admin's tiles, else derived). */
  cats: PhysicalCategory[];
  savedIds: string[];
  onToggleSaved: (id: string) => void;
  onOpenProduct: (id: string) => void;
  /** "View All" of a shelf: the full products catalogue. */
  onAllFeatured: () => void;
  onAllTrending: () => void;
  onAllExclusive: () => void;
  onAllCategories: () => void;
  onCategory: (key: string) => void;
  /** Hero CTA and the Redeem banner. */
  onExplore: () => void;
}

/** The Physical tab body, top to bottom exactly as the design mock. An empty shelf hides its section. */
export function PhysicalHomeMobile({ p, u, inner, now, featured, trending, exclusive, cats, savedIds, onToggleSaved, onOpenProduct, onAllFeatured, onAllTrending, onAllExclusive, onAllCategories, onCategory, onExplore }: PhysicalHomeProps) {
  const gap = px(MOCK_M.gap, u);
  const head = px(MOCK_M.head, u);
  const icon = px(MOCK_M.section.icon, u);
  const featGap = px(PHYS_M.feat.gap, u);
  const featW = cellWidth(inner, PHYS_M.feat.cols, featGap);
  const productRow = (items: ShopProduct[]) => (
    <View style={[styles.row, { gap: featGap, marginTop: head }]}>
      {items.map((prod) => (
        <ProductCardM key={prod.id} p={p} product={prod} now={now} u={u} width={featW} saved={savedIds.includes(prod.id)} onOpen={onOpenProduct} onToggleSaved={onToggleSaved} />
      ))}
    </View>
  );
  return (
    <View>
      <View style={{ marginTop: gap }}>
        <PhysicalHeroM u={u} width={inner} onExplore={onExplore} />
      </View>

      <View style={{ marginTop: gap }}>
        <TrustRowM p={p} u={u} inner={inner} />
      </View>

      {featured.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<FlameIcon size={icon} />} title="Featured Rewards" action={{ label: 'View All', onPress: onAllFeatured }} />
          {productRow(featured)}
        </View>
      ) : null}

      {trending.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<ShopIcon name="uiTrendingUp" size={icon} color={BRAND} />} title="Trending Products" action={{ label: 'View All', onPress: onAllTrending }} />
          {productRow(trending)}
        </View>
      ) : null}

      {cats.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<TabGlyph name="layers" size={icon} color={BRAND} />} title="Categories" action={{ label: 'View All', onPress: onAllCategories }} />
          <View style={{ marginTop: head }}>
            <CategoryTilesM p={p} u={u} inner={inner} cats={cats} onPick={onCategory} />
          </View>
        </View>
      ) : null}

      {exclusive.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<CrownIcon size={icon} />} title="Exclusive Collection" action={{ label: 'View All', onPress: onAllExclusive }} />
          {productRow(exclusive)}
        </View>
      ) : null}

      <View style={{ marginTop: gap }}>
        <RedeemBannerM u={u} width={inner} onExplore={onExplore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  row: { flexDirection: 'row' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  col: { flex: 1, alignSelf: 'stretch', alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  heroTitle: { color: WHITE, fontFamily: TH.fonts.bold, fontStyle: 'italic', flexShrink: 1 },
  heroSub: { color: '#F3E8FF', fontFamily: TH.fonts.semibold },
  ctaText: { fontFamily: TH.fonts.bold },
  trustPill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, overflow: 'hidden' },
  trustText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  cardName: { fontFamily: TH.fonts.bold, textAlign: 'center', alignSelf: 'stretch' },
  priceText: { color: WHITE, fontFamily: TH.fonts.bold, flexShrink: 1 },
  tag: { justifyContent: 'center' },
  tagText: { color: WHITE, fontFamily: TH.fonts.bold },
  catTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  catLabel: { fontFamily: TH.fonts.semibold, textAlign: 'center' },
  bannerTitle: { color: WHITE, fontFamily: TH.fonts.bold, flexShrink: 1 },
  bannerSub: { color: '#FFE3F1', fontFamily: TH.fonts.semibold, flexShrink: 1 },
});
