/**
 * Sections of the PHONE Shop home, drawn to the phone design mock (mock.ts
 * MOCK_M, every length `ref * u` with u = width / 340): section headers, the
 * 2×5 category grid, 3 Featured cards, 5 Trending tiles, the "Daily Shop
 * Deals" banner, the Popular Collection grid, the My Collection / Orders
 * cards and the "Upgrade Your Profile" banner.
 *
 * Same honesty rules as the desktop home (ShopHomeSections.tsx): every price,
 * discount, timer and count comes from server data; a block with nothing real
 * behind it is hidden or an honest placeholder without prices, timers or
 * discounts.
 *
 * Colours: white cards (p.card) with a soft lavender border / shadow on the
 * page (light), the same layout on the dark surfaces (dark). Violet
 * (SHOP_VIOLET) for links and banners, brand pink for the primary CTA, the
 * yellow button (SHOP_YELLOW_BTN) only for "Grab Now" and "Upgrade Now".
 * Text on gradients and dark stages is white.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { discountOf, type CardTag, type CategoryTile, type DealCardView, type DealsSummary, type PopularCollection, type ShopNav } from '@/src/lib/shopModel';
import {
  SHOP_DARK_CARD,
  SHOP_DEALS_GRAD,
  SHOP_POPULAR_GRADS,
  SHOP_TAG_NEW,
  SHOP_UPGRADE_GRAD,
  SHOP_VIOLET,
  SHOP_VIOLET_GRAD,
  SHOP_YELLOW_BTN,
  SHOP_YELLOW_INK,
  TH,
  rarityToken,
  type TophuntPalette,
} from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import type { ShopProduct } from '@/src/services/shop';
import { MOCK_M, cellWidth, mfont, px } from './mock';
import { ProductPreview } from './ProductPreview';
import { BoltIcon, ClipboardArt, CollectionBoxArt, CrownIcon, GiftArt, SparkleField, TileArt, WingedCrownArt } from './ShopArt';
import { DealTimerPill } from './DealPager';
import { WishlistHeart } from './WishlistHeart';
import { ArtStage, lavenderShadow, shopBorder } from './surface';

export { DealTimerPill };

const WHITE = TH.colors.white;
/** "View All →" links: violet, a lighter violet on the dark page. */
const linkColor = (p: TophuntPalette) => (p.isDark ? '#A78BFA' : SHOP_VIOLET);
/** Extra touch area so a pill shorter than 40 pt still gets a 40 pt target. */
const slopFor = (h: number) => {
  const v = Math.max(0, Math.ceil((40 - h) / 2));
  return { top: v, bottom: v, left: 4, right: 4 };
};

// ------------------------------------------------------------------ shared bits

export function SectionHeaderM({
  p, u, icon, title, action, right, style,
}: { p: TophuntPalette; u: number; icon: React.ReactNode; title: string; action?: { label: string; onPress: () => void }; right?: React.ReactNode; style?: any }) {
  const S = MOCK_M.section;
  const link = mfont(S.link, u);
  const color = linkColor(p);
  return (
    <View style={[styles.head, { height: px(S.h, u), gap: px(6, u) }, style]}>
      {icon}
      <Text style={[styles.headTitle, { fontSize: mfont(S.title, u), color: p.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={[styles.head, { gap: px(3, u) }]} hitSlop={12} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`}>
          <Text style={[styles.link, { fontSize: link, color }]}>{action.label}</Text>
          <ArrowIcon variant="arrow" direction="right" size={link} color={color} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Yellow banner button (SHOP_YELLOW_BTN, dark text): only "Grab Now" and "Upgrade Now". */
function YellowButton({ label, onPress, u, width, height, size, a11y }: { label: string; onPress: () => void; u: number; width: number; height: number; size: number; a11y: string }) {
  const fs = mfont(size, u);
  const h = px(height, u);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={slopFor(h)}>
      <LinearGradient colors={SHOP_YELLOW_BTN} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.btn, { minWidth: px(width, u), height: h, borderRadius: h / 2, gap: px(4, u), paddingHorizontal: px(10, u) }]}>
        <Text style={[styles.btnText, { fontSize: fs, color: SHOP_YELLOW_INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
        <ArrowIcon variant="arrow" direction="right" size={fs} color={SHOP_YELLOW_INK} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** White-translucent pill button on a banner (the honest "soon" state; yellow is kept for real deals). */
function GhostButton({ label, onPress, u, height, size, a11y }: { label: string; onPress: () => void; u: number; height: number; size: number; a11y: string }) {
  const fs = mfont(size, u);
  const h = px(height, u);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={slopFor(h)}
      style={[styles.btn, styles.ghost, { height: h, borderRadius: h / 2, gap: px(4, u), paddingHorizontal: px(10, u) }]}
    >
      <Text style={[styles.btnText, { fontSize: fs, color: WHITE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      <ArrowIcon variant="arrow" direction="right" size={fs} color={WHITE} />
    </TouchableOpacity>
  );
}

/** Round white-translucent arrow at the bottom-right of a gradient card (decorative: the card is the button). */
function ArrowCircle({ u, size }: { u: number; size: number }) {
  const d = px(size, u);
  return (
    <View style={[styles.arrowCircle, { width: d, height: d, borderRadius: d / 2 }]} pointerEvents="none">
      <ArrowIcon variant="arrow" direction="right" size={d * 0.5} color={WHITE} />
    </View>
  );
}

function Soon({ u }: { u: number }) {
  return (
    <View style={[styles.soon, { top: px(3, u), right: px(3, u), borderRadius: px(4, u), paddingHorizontal: px(3, u) }]} pointerEvents="none">
      <Text style={[styles.soonText, { fontSize: mfont(6.5, u) }]}>Soon</Text>
    </View>
  );
}

/** Small brand pink "-X%" corner pill for cards too narrow for a strike-through price. */
function OffPill({ pct, u, style }: { pct: number; u: number; style?: any }) {
  if (!pct) return null;
  return (
    <View style={[styles.off, { borderRadius: px(6, u), paddingHorizontal: px(3, u), height: px(12, u) }, style]} pointerEvents="none">
      <Text style={[styles.offText, { fontSize: mfont(7.5, u) }]} numberOfLines={1}>-{pct}%</Text>
    </View>
  );
}

// ------------------------------------------------------------------ categories (2 × 5)

const CategoryTileM = React.memo(function CategoryTileM({ p, tile, u, width, onPick }: { p: TophuntPalette; tile: CategoryTile; u: number; width: number; onPick: (t: CategoryTile) => void }) {
  const C = MOCK_M.cat;
  const fs = mfont(C.label, u);
  return (
    <TouchableOpacity
      onPress={() => onPick(tile)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={tile.soon ? `${tile.label}: jaldi aa raha hai` : `${tile.label} dekho`}
      style={[styles.tile, { width, height: Math.max(width, px(C.h, u)), borderRadius: px(C.radius, u), backgroundColor: p.card, borderColor: shopBorder(p) }, lavenderShadow(p)]}
    >
      <View style={{ marginTop: px(6, u) }}>
        <TileArt tile={tile.key} width={px(C.artW, u)} height={px(C.artH, u)} />
      </View>
      <Text style={[styles.tileLabel, { fontSize: fs, lineHeight: fs * 1.2, bottom: px(5, u), color: p.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tile.label}</Text>
      {tile.soon ? <Soon u={u} /> : null}
    </TouchableOpacity>
  );
});

export function CategoryGridM({ p, tiles, u, inner, onPick }: { p: TophuntPalette; tiles: CategoryTile[]; u: number; inner: number; onPick: (t: CategoryTile) => void }) {
  const C = MOCK_M.cat;
  const gap = px(C.gap, u);
  const w = cellWidth(inner, C.cols, gap);
  const rows = [tiles.slice(0, C.cols), tiles.slice(C.cols, C.cols * 2)].filter((r) => r.length);
  return (
    <View style={{ gap: px(C.rowGap, u) }}>
      {rows.map((r, k) => (
        <View key={k} style={[styles.row, { gap }]}>
          {r.map((t) => <CategoryTileM key={t.key} p={p} tile={t} u={u} width={w} onPick={onPick} />)}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ featured (3 dark cards)

/** Tag pill colours: NEW pink, LIMITED violet, rarities their own gradient (Legendary gold with dark text). */
function tagLook(tag: CardTag): { colors: [string, string]; ink: string } {
  if (tag.kind === 'new') return { colors: SHOP_TAG_NEW, ink: WHITE };
  if (tag.kind === 'limited') return { colors: SHOP_VIOLET_GRAD, ink: WHITE };
  const t = rarityToken(tag.rarity);
  return { colors: t.gradient, ink: t.ink };
}

export const FeatureCardM = React.memo(function FeatureCardM({
  p, item, tag, u, width, viewer, onOpen,
}: { p: TophuntPalette; item: StoreItemView; tag: CardTag; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const F = MOCK_M.feat;
  const look = tagLook(tag);
  const h = px(F.h, u);
  const r = px(F.radius, u);
  const nameFs = mfont(F.name, u);
  const priceFs = mfont(F.price, u);
  const tagFs = mfont(F.tag, u);
  const tagH = px(13, u);
  const pillH = px(17, u);
  const footTop = h - px(5, u) - pillH;
  const nameTop = footTop - px(2, u) - nameFs * 1.2 * 2;
  const artTop = px(16, u);
  const artH = Math.max(px(24, u), Math.min(px(F.artH, u), nameTop - artTop - px(1, u)));
  const artW = Math.min(px(F.artW, u), width - px(12, u));
  const pct = item.owned ? 0 : discountOf(item);
  return (
    <View style={[{ width, height: h, borderRadius: r }, lavenderShadow(p)]}>
      <LinearGradient colors={SHOP_DARK_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.darkCard, { width, height: h, borderRadius: r }]}>
        <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`${item.name}, ${tag.label}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin${pct ? `, ${pct}% off` : ''}`}. Details kholo`}>
          <View style={[styles.abs, { top: artTop, left: (width - artW) / 2 }]}>
            <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(6, u)} bare />
          </View>
          <Text style={[styles.abs, styles.darkName, { top: nameTop, left: px(5, u), right: px(5, u), fontSize: nameFs, lineHeight: nameFs * 1.2 }]} numberOfLines={2}>{item.name}</Text>
        </Pressable>
        <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.tag, { top: px(5, u), left: px(5, u), height: tagH, borderRadius: tagH / 2, paddingHorizontal: px(5, u) }]} pointerEvents="none">
          <Text style={[styles.tagText, { fontSize: tagFs, letterSpacing: 0.4 * u, color: look.ink }]} numberOfLines={1}>{tag.label}</Text>
        </LinearGradient>
        <OffPill pct={pct} u={u} style={{ top: px(5, u), right: px(5, u) }} />
        <View style={[styles.foot, { top: footTop, left: px(5, u), right: px(5, u), height: pillH }]}>
          <View style={[styles.pricePill, { height: pillH, borderRadius: pillH / 2, paddingHorizontal: px(5, u), gap: px(3, u) }]} pointerEvents="none">
            {item.owned ? (
              <>
                <Ionicons name="checkmark-circle" size={priceFs} color={TH.colors.success} />
                <Text style={[styles.priceText, { fontSize: priceFs, color: WHITE }]} numberOfLines={1}>Owned</Text>
              </>
            ) : (
              <>
                <CoinIcon size={px(10, u)} />
                <Text style={[styles.priceText, { fontSize: priceFs, color: WHITE }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{`${item.priceCoins.toLocaleString()} DP`}</Text>
              </>
            )}
          </View>
          <WishlistHeart itemId={item.itemId} name={item.name} size={px(12, u)} bubble={false} color={WHITE} />
        </View>
      </LinearGradient>
    </View>
  );
});

// ------------------------------------------------------------------ trending (5 tiles)

/** White tile in light mode, dark purple card in dark mode; the art keeps its dark stage (items are designed on dark). */
export const TrendCardM = React.memo(function TrendCardM({ p, item, u, width, viewer, onOpen }: { p: TophuntPalette; item: StoreItemView; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const T = MOCK_M.trend;
  const h = px(T.h, u);
  const r = px(T.radius, u);
  const nameFs = mfont(T.name, u);
  const priceFs = mfont(T.price, u);
  const footTop = h - px(5, u) - priceFs * 1.25;
  const nameTop = footTop - px(1, u) - nameFs * 1.15 * 2;
  const artH = Math.min(px(T.artH, u), nameTop - px(7, u));
  const artW = Math.min(px(T.artW, u), width - px(8, u));
  const pct = item.owned ? 0 : discountOf(item);
  const ink = p.isDark ? WHITE : p.text;
  const body = (
    <>
      <View style={[styles.abs, { top: px(5, u), left: (width - artW) / 2 }]}>
        <ArtStage width={artW} height={artH} radius={px(6, u)}>
          <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(6, u)} bare />
        </ArtStage>
      </View>
      <OffPill pct={pct} u={u} style={{ top: px(3, u), right: px(3, u) }} />
      <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(3, u), right: px(3, u), fontSize: nameFs, lineHeight: nameFs * 1.15, color: ink }]} numberOfLines={2}>{item.name}</Text>
      <View style={[styles.abs, styles.price, { top: footTop, left: px(3, u), right: px(3, u), justifyContent: 'center', gap: px(2, u) }]}>
        {item.owned ? (
          <>
            <Ionicons name="checkmark-circle" size={priceFs} color={TH.colors.success} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: TH.colors.success }]} numberOfLines={1}>Owned</Text>
          </>
        ) : (
          <>
            <CoinIcon size={px(10, u)} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.priceCoins.toLocaleString()}</Text>
          </>
        )}
      </View>
    </>
  );
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin${pct ? `, ${pct}% off` : ''}`}. Details kholo`}
      style={[{ width, height: h, borderRadius: r }, p.isDark ? null : [styles.lightTile, { backgroundColor: p.card, borderColor: shopBorder(p) }], lavenderShadow(p)]}
    >
      {p.isDark ? (
        <LinearGradient colors={SHOP_DARK_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.darkCard, { width, height: h, borderRadius: r }]}>{body}</LinearGradient>
      ) : body}
    </Pressable>
  );
});

// ------------------------------------------------------------------ daily deals banner

export type DealCardContent =
  /** An admin deal card (monetization.store.deals), its discount computed from real compare-at prices. */
  | { kind: 'admin'; card: DealCardView<StoreItemView, ShopProduct> }
  | { kind: 'discount'; summary: DealsSummary<StoreItemView> }
  | { kind: 'product'; product: ShopProduct }
  | { kind: 'soon' };

/** The real percent behind a deal card (0 = no "% OFF" line). */
export function dealPercent(content: DealCardContent): number {
  switch (content.kind) {
    case 'admin':
      return content.card.percent;
    case 'discount':
      return content.summary.maxPercent;
    case 'product':
      return discountOf(content.product);
    default:
      return 0;
  }
}

/** The real end behind a deal card (null = no timer). */
function dealEnd(content: DealCardContent): number | null {
  if (content.kind === 'admin') return content.card.endsAt;
  if (content.kind === 'discount') return content.summary.endsAt;
  return null;
}

/** "Limited Time Offers • Up to X% OFF" only with a real end; without one just "Up to X% OFF". */
const offerLine = (pct: number, endsAt: number | null) => (endsAt ? `Limited Time Offers • Up to ${pct}% OFF` : `Up to ${pct}% OFF`);

/**
 * The "Daily Shop Deals" banner (inner × 72, pink → magenta → violet): gift
 * art and a bolt on the left, the deals heading and a real offer line, the
 * countdown (only for a real end) above the yellow "Grab Now" button on the
 * right. An admin card's image replaces the gift. Without any real deal the
 * same banner shows the honest "jaldi aa rahe hain" state: no timer, no %.
 */
export function DealCardM({
  p, content, heading, u, width, onDeals, onProduct, onContest, onNav,
}: { p: TophuntPalette; content: DealCardContent; heading: string; u: number; width: number; onDeals: () => void; onProduct: (id: string) => void; onContest: () => void; onNav?: (nav: ShopNav) => void }) {
  const D = MOCK_M.deals;
  const h = px(D.h, u);
  const r = px(D.radius, u);
  const titleFs = mfont(D.title, u);
  const subFs = mfont(D.sub, u);
  const pct = dealPercent(content);
  const end = dealEnd(content);
  const image = content.kind === 'admin' ? content.card.imageUrl : null;
  let title = heading;
  let sub = '';
  let action: React.ReactNode = null;
  let price: React.ReactNode = null;
  if (content.kind === 'admin') {
    const c = content.card;
    sub = [pct > 0 ? offerLine(pct, end) : '', c.subtitle || (pct > 0 ? '' : c.title)].filter(Boolean).join('\n');
    action = <YellowButton label={c.ctaLabel} onPress={() => onNav?.(c.nav)} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`${c.ctaLabel}: ${c.title}${c.discounted > 1 ? `, ${c.discounted} discounted items` : ''}`} />;
    if (c.product) {
      price = (
        <View style={[styles.price, { gap: px(3, u), marginTop: px(2, u) }]}>
          <CoinIcon size={px(11, u)} />
          <Text style={[styles.priceText, { fontSize: mfont(10, u), color: WHITE }]} numberOfLines={1}>{c.product.priceCoins.toLocaleString()} DP</Text>
        </View>
      );
    }
  } else if (content.kind === 'discount') {
    sub = offerLine(pct, end);
    action = <YellowButton label="Grab Now" onPress={onDeals} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`Grab now: ${content.summary.items.length} discounted items dekho`} />;
  } else if (content.kind === 'product') {
    const prod = content.product;
    sub = pct > 0 ? `${prod.title} • ${pct}% OFF` : prod.title;
    price = (
      <View style={[styles.price, { gap: px(3, u), marginTop: px(2, u) }]}>
        <CoinIcon size={px(11, u)} />
        <Text style={[styles.priceText, { fontSize: mfont(10, u), color: WHITE }]} numberOfLines={1}>{prod.priceCoins.toLocaleString()} DP</Text>
        {pct ? <Text style={[styles.was, { fontSize: mfont(8, u), color: 'rgba(255,255,255,0.7)' }]} numberOfLines={1}>{Number(prod.compareAtCoins).toLocaleString()}</Text> : null}
      </View>
    );
    action = <YellowButton label="Grab Now" onPress={() => onProduct(prod.id)} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`Grab now: ${prod.title}`} />;
  } else {
    title = 'Deals jaldi aa rahe hain';
    sub = 'Contest jeeto, DP coin jama karo';
    action = <GhostButton label="Contest jeeto" onPress={onContest} u={u} height={D.ctaH} size={D.cta} a11y="Contest jeeto: battles kholo" />;
  }
  const giftW = px(D.giftW, u);
  const giftH = px(D.giftH, u);
  return (
    <View style={[{ width, height: h, borderRadius: r }, lavenderShadow(p)]}>
      <LinearGradient colors={SHOP_DEALS_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.banner, { width, height: h, borderRadius: r, paddingHorizontal: px(8, u), gap: px(6, u) }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><SparkleField width={width} height={h} /></View>
        <View style={{ width: giftW, height: giftH }} pointerEvents="none">
          {image ? (
            <AppImage source={{ uri: image }} displayWidth={giftW} style={{ width: giftW, height: giftH, borderRadius: px(8, u) }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
          ) : (
            <GiftArt width={giftW} height={giftH} />
          )}
          <View style={[styles.abs, { right: -px(4, u), top: -px(2, u) }]}><BoltIcon size={px(18, u)} /></View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.bannerTitle, { fontSize: titleFs, lineHeight: titleFs * 1.2 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">{title}</Text>
          {sub ? <Text style={[styles.bannerSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>{sub}</Text> : null}
          {price}
        </View>
        <View style={[styles.dealRight, { gap: px(5, u) }]}>
          {end ? <DealTimerPill endsAt={end} u={u} tone="deep" /> : null}
          {action}
        </View>
      </LinearGradient>
    </View>
  );
}

// ------------------------------------------------------------------ popular collection (2 columns)

const PopularCardM = React.memo(function PopularCardM({
  c, index, u, width, viewer, onPress,
}: { c: PopularCollection<StoreItemView>; index: number; u: number; width: number; viewer: Viewer; onPress: (c: PopularCollection<StoreItemView>) => void }) {
  const P = MOCK_M.popular;
  const r = px(P.radius, u);
  const art = px(P.art, u);
  const titleFs = mfont(P.title, u);
  const subFs = mfont(P.sub, u);
  const grad = SHOP_POPULAR_GRADS[index % SHOP_POPULAR_GRADS.length];
  return (
    <TouchableOpacity
      onPress={() => onPress(c)}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${c.title}: ${c.subtitle}, ${c.count} items. Dekho`}
      style={{ width, minHeight: px(P.h, u), borderRadius: r }}
    >
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.popular, { minHeight: px(P.h, u), borderRadius: r, paddingLeft: px(4, u), paddingRight: px(22, u), paddingVertical: px(6, u), gap: px(5, u) }]}>
        <View style={{ width: art, height: art }} pointerEvents="none">
          <ProductPreview item={c.art} viewer={viewer} width={art} height={art} radius={px(8, u)} bare />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.popTitle, { fontSize: titleFs, lineHeight: titleFs * 1.15 }]} numberOfLines={2}>{c.title}</Text>
          <Text style={[styles.popSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>{c.subtitle}</Text>
        </View>
        <View style={[styles.abs, { top: px(5, u), right: px(6, u) }]} pointerEvents="none"><CrownIcon size={px(12, u)} /></View>
        <View style={[styles.abs, { bottom: px(5, u), right: px(5, u) }]}><ArrowCircle u={u} size={16} /></View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

/** Up to 6 real collections (popularCollections) in rows of 2; a row's cards share its height. */
export function PopularCollectionsM({
  cards, u, inner, viewer, onPress,
}: { cards: PopularCollection<StoreItemView>[]; u: number; inner: number; viewer: Viewer; onPress: (c: PopularCollection<StoreItemView>) => void }) {
  const P = MOCK_M.popular;
  const gap = px(P.gap, u);
  const w = cellWidth(inner, P.cols, gap);
  const rows: PopularCollection<StoreItemView>[][] = [];
  for (let k = 0; k < cards.length; k += P.cols) rows.push(cards.slice(k, k + P.cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, k) => (
        <View key={k} style={[styles.row, { gap, alignItems: 'stretch' }]}>
          {row.map((c, j) => <PopularCardM key={c.key} c={c} index={k * P.cols + j} u={u} width={w} viewer={viewer} onPress={onPress} />)}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ my collection / orders

export interface ShortcutCard {
  key: 'collection' | 'orders';
  title: string;
  sub: string;
  onPress: () => void;
}

/** "My Collection" and "Orders" side by side (violet gradient, white text, round arrow). One card spans the row. */
export function ShortcutCardsM({ p, cards, u, inner }: { p: TophuntPalette; cards: ShortcutCard[]; u: number; inner: number }) {
  const S = MOCK_M.shortcut;
  const gap = px(S.gap, u);
  const w = cellWidth(inner, Math.max(1, cards.length), gap);
  const r = px(S.radius, u);
  const art = px(S.art, u);
  return (
    <View style={[styles.row, { gap, alignItems: 'stretch' }]}>
      {cards.map((c) => (
        <TouchableOpacity key={c.key} onPress={c.onPress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`${c.title}: ${c.sub}`} style={[{ width: w, minHeight: px(S.h, u), borderRadius: r }, lavenderShadow(p)]}>
          <LinearGradient colors={SHOP_VIOLET_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.popular, { minHeight: px(S.h, u), borderRadius: r, paddingLeft: px(6, u), paddingRight: px(6, u), paddingVertical: px(6, u), gap: px(6, u) }]}>
            <View pointerEvents="none">
              {c.key === 'collection' ? <CollectionBoxArt width={art} height={art * 0.84} /> : <ClipboardArt width={art} height={art * 0.84} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.popTitle, { fontSize: mfont(S.title, u), lineHeight: mfont(S.title, u) * 1.15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{c.title}</Text>
              <Text style={[styles.popSub, { fontSize: mfont(S.sub, u), lineHeight: mfont(S.sub, u) * 1.25 }]} numberOfLines={2}>{c.sub}</Text>
            </View>
            <ArrowCircle u={u} size={S.arrow} />
          </LinearGradient>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ upgrade banner

/** Violet → magenta banner with sparkles, the yellow "Upgrade Now" button and the winged crown art. */
export function UpgradeBannerM({ p, u, width, onPress }: { p: TophuntPalette; u: number; width: number; onPress: () => void }) {
  const U = MOCK_M.upgrade;
  const h = px(U.h, u);
  const r = px(U.radius, u);
  const subFs = mfont(U.sub, u);
  return (
    <View style={[{ width, height: h, borderRadius: r }, lavenderShadow(p)]}>
      <LinearGradient colors={SHOP_UPGRADE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.8 }} style={[styles.banner, { width, height: h, borderRadius: r, paddingLeft: px(12, u) }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><SparkleField width={width} height={h} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: px(3, u) }}>
          <View style={[styles.head, { gap: px(5, u) }]}>
            <CrownIcon size={px(15, u)} />
            <Text style={[styles.bannerTitle, { fontSize: mfont(U.title, u) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">Upgrade Your Profile</Text>
          </View>
          <Text style={[styles.bannerSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>Unlock Exclusive Items, Premium Effects & More!</Text>
          <View style={{ marginTop: px(3, u), alignSelf: 'flex-start' }}>
            <YellowButton label="Upgrade Now" onPress={onPress} u={u} width={U.ctaW} height={U.ctaH} size={U.cta} a11y="Upgrade now: Epic, Legendary aur Mythic items dekho" />
          </View>
        </View>
        <View style={{ width: px(U.artW, u), height: px(U.artH, u), marginRight: px(2, u) }} pointerEvents="none">
          <WingedCrownArt width={px(U.artW, u)} height={px(U.artH, u)} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  row: { flexDirection: 'row' },
  head: { flexDirection: 'row', alignItems: 'center' },
  headTitle: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  link: { fontFamily: TH.fonts.bold },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  ghost: { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  arrowCircle: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  tile: { alignItems: 'center', borderWidth: 1 },
  tileLabel: { position: 'absolute', left: 2, right: 2, fontFamily: TH.fonts.bold, textAlign: 'center' },
  soon: { position: 'absolute', backgroundColor: SHOP_VIOLET },
  soonText: { color: '#FFF', fontFamily: TH.fonts.bold },
  off: { position: 'absolute', backgroundColor: TH.colors.primary, justifyContent: 'center' },
  offText: { color: '#FFF', fontFamily: TH.fonts.bold },
  darkCard: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  lightTile: { borderWidth: 1, overflow: 'hidden' },
  tag: { position: 'absolute', justifyContent: 'center' },
  tagText: { fontFamily: TH.fonts.bold },
  darkName: { color: '#FFF', fontFamily: TH.fonts.bold, textAlign: 'center' },
  cardName: { fontFamily: TH.fonts.bold, textAlign: 'center' },
  foot: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pricePill: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0, backgroundColor: 'rgba(0,0,0,0.38)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  price: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  priceText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  was: { fontFamily: TH.fonts.medium, textDecorationLine: 'line-through', flexShrink: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  bannerTitle: { color: '#FFF', fontFamily: TH.fonts.bold, fontStyle: 'italic', flexShrink: 1 },
  bannerSub: { color: '#FFF', fontFamily: TH.fonts.medium, opacity: 0.92 },
  dealRight: { alignItems: 'flex-end', justifyContent: 'center' },
  popular: { flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  popTitle: { color: '#FFF', fontFamily: TH.fonts.bold },
  popSub: { color: '#EBDDFF', fontFamily: TH.fonts.medium, marginTop: 1 },
});
