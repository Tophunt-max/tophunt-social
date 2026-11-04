/**
 * Sections of the PHONE Shop home, drawn to the 340 px mobile mock
 * (mock.ts MOCK_M, every length `ref * u` with u = width / 340): section
 * headers, the 2×5 category grid, 3 Featured cards, 5 Trending cards, the
 * Special Offers deal card, 4 Physical products, 5 My Collection tiles, the
 * Upgrade banner and the quick-action cards.
 *
 * Same honesty rules as the desktop home (ShopHomeSections.tsx): every price,
 * discount, timer and count comes from server data; a block with nothing real
 * behind it is an honest placeholder without prices, timers or discounts.
 *
 * Colours follow the app theme (TophuntPalette `p`): flat cards with a 1 px
 * border, brand pink links and buttons. Item artwork sits on the dark stage
 * (ArtStage) and the Upgrade banner on the dark brand banner in both modes.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { discountOf, type CardTag, type CategoryTile, type CollectionTile, type DealCardView, type DealsSummary, type ShopNav } from '@/src/lib/shopModel';
import { BRAND, BRAND_BUTTON, TH, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import type { ShopProduct } from '@/src/services/shop';
import { MOCK_M, cellWidth, mfont, px } from './mock';
import { ProductPreview } from './ProductPreview';
import { ChestArt, CoinArt, CrownIcon, CubeLine, DealRibbon, TileArt, WingedCrownArt } from './ShopArt';
import { tagColors } from './ShopHomeSections';
import { DealTimerPill } from './DealPager';
import { WishlistHeart } from './WishlistHeart';
import { ArtStage, cardShadow } from './surface';

export { DealTimerPill };

/** "View All" / "Manage" links. */
const LINK = BRAND;
/** Text and arrow on a brand pink button. */
const INK = TH.colors.white;

// ------------------------------------------------------------------ shared bits

export function SectionHeaderM({
  p, u, icon, title, action, right, style,
}: { p: TophuntPalette; u: number; icon: React.ReactNode; title: string; action?: { label: string; onPress: () => void }; right?: React.ReactNode; style?: any }) {
  const S = MOCK_M.section;
  const link = mfont(S.link, u);
  return (
    <View style={[styles.head, { height: px(S.h, u), gap: px(5, u) }, style]}>
      {icon}
      <Text style={[styles.headTitle, { fontSize: mfont(S.title, u), color: p.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={[styles.head, { gap: px(2, u) }]} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`}>
          <Text style={[styles.link, { fontSize: link }]}>{action.label}</Text>
          <ArrowIcon variant="arrow" direction="right" size={link} color={LINK} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Primary call to action: brand pink pill (BRAND_BUTTON), white text. */
function BrandButton({ label, onPress, u, width, height, size, a11y }: { label: string; onPress: () => void; u: number; width: number; height: number; size: number; a11y: string }) {
  const fs = mfont(size, u);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={a11y} style={{ alignSelf: 'flex-start' }}>
      <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.btn, { width: px(width, u), height: px(height, u), borderRadius: px(height / 2, u), gap: px(4, u), paddingHorizontal: px(6, u) }]}>
        <Text style={[styles.btnText, { fontSize: fs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
        <ArrowIcon variant="arrow" direction="right" size={fs} color={INK} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function Soon({ u }: { u: number }) {
  return (
    <View style={[styles.soon, { top: px(2, u), right: px(2, u), borderRadius: px(3, u), paddingHorizontal: px(2.5, u) }]} pointerEvents="none">
      <Text style={[styles.soonText, { fontSize: mfont(6, u) }]}>SOON</Text>
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
      style={[styles.tile, { width, height: px(C.h, u), borderRadius: px(C.radius, u), backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
    >
      <View style={{ marginTop: px(6, u) }}>
        <TileArt tile={tile.key} width={px(C.artW, u)} height={px(C.artH, u)} />
      </View>
      <Text style={[styles.tileLabel, { fontSize: fs, lineHeight: fs * 1.2, bottom: px(4, u), color: p.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{tile.label}</Text>
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

// ------------------------------------------------------------------ featured (3 per row)

export const FeatureCardM = React.memo(function FeatureCardM({
  p, item, tag, u, width, viewer, onOpen,
}: { p: TophuntPalette; item: StoreItemView; tag: CardTag; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const F = MOCK_M.feat;
  const c = tagColors(tag, p.border);
  const h = px(F.h, u);
  const legendary = tag.kind === 'rarity' && tag.rarity === 'legendary';
  const nameFs = mfont(F.name, u);
  const priceFs = mfont(F.price, u);
  const tagFs = mfont(F.tag, u);
  const tagH = px(14, u);
  const footTop = h - px(5, u) - priceFs * 1.25;
  const nameTop = footTop - px(1, u) - nameFs * 1.2 * 2;
  const artH = Math.min(px(F.artH, u), nameTop - px(15, u));
  const artW = Math.min(px(F.artW, u), width - px(10, u));
  const pct = item.owned ? 0 : discountOf(item);
  return (
    <View style={[styles.card, { width, height: h, borderRadius: px(F.radius, u), borderWidth: Math.max(1, 1.3 * u), borderColor: c.border, backgroundColor: p.card }, cardShadow(p)]}>
      {legendary ? <View style={[styles.legGlow, { width: px(76, u), height: px(52, u), borderRadius: px(38, u), top: px(14, u), left: (width - px(76, u)) / 2 }]} /> : null}
      <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`${item.name}, ${tag.label}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin${pct ? `, ${pct}% off` : ''}`}. Details kholo`}>
        <View style={[styles.abs, { top: px(14, u), left: (width - artW) / 2 }]}>
          <ArtStage width={artW} height={artH} radius={px(6, u)}>
            <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(6, u)} bare />
          </ArtStage>
        </View>
        <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(5, u), right: px(5, u), fontSize: nameFs, lineHeight: nameFs * 1.2, color: p.text }]} numberOfLines={2}>{item.name}</Text>
      </Pressable>
      <LinearGradient colors={c.pill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.tag, { top: px(5, u), left: px(5, u), height: tagH, borderRadius: tagH / 2, paddingHorizontal: px(5, u) }]} pointerEvents="none">
        <Text style={[styles.tagText, { fontSize: tagFs, letterSpacing: 0.4 * u }]} numberOfLines={1}>{tag.label}</Text>
      </LinearGradient>
      <OffPill pct={pct} u={u} style={{ top: px(6, u), right: px(5, u) }} />
      <View style={[styles.foot, { top: footTop, left: px(6, u), right: px(6, u) }]}>
        {item.owned ? (
          <View style={[styles.price, { gap: px(3, u) }]}>
            <Ionicons name="checkmark-circle" size={priceFs} color={TH.colors.success} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: TH.colors.success }]} numberOfLines={1}>Owned</Text>
          </View>
        ) : (
          <View style={[styles.price, { gap: px(3, u) }]}>
            <CoinArt size={px(12, u)} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: p.text }]} numberOfLines={1}>{pct ? item.priceCoins.toLocaleString() : `${item.priceCoins.toLocaleString()} DP`}</Text>
            {pct ? <Text style={[styles.was, { fontSize: mfont(8.5, u), color: p.sub }]} numberOfLines={1}>{Number(item.compareAtCoins).toLocaleString()}</Text> : null}
          </View>
        )}
        <WishlistHeart itemId={item.itemId} name={item.name} size={px(12, u)} bubble={false} color={p.sub} />
      </View>
    </View>
  );
});

// ------------------------------------------------------------------ trending (5 per row)

export const TrendCardM = React.memo(function TrendCardM({ p, item, u, width, viewer, onOpen }: { p: TophuntPalette; item: StoreItemView; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const T = MOCK_M.trend;
  const h = px(T.h, u);
  const nameFs = mfont(T.name, u);
  const priceFs = mfont(T.price, u);
  const footTop = h - px(4, u) - priceFs * 1.25;
  const nameTop = footTop - px(1, u) - nameFs * 1.15 * 2;
  const artH = Math.min(px(T.artH, u), nameTop - px(6, u));
  const artW = Math.min(px(T.artW, u), width - px(6, u));
  const pct = item.owned ? 0 : discountOf(item);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin${pct ? `, ${pct}% off` : ''}`}. Details kholo`}
      style={[styles.card, { width, height: h, borderRadius: px(T.radius, u), borderWidth: 1, backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
    >
      <View style={[styles.abs, { top: px(5, u), left: (width - artW) / 2 }]}>
        <ArtStage width={artW} height={artH} radius={px(5, u)}>
          <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(5, u)} bare />
        </ArtStage>
      </View>
      <OffPill pct={pct} u={u} style={{ top: px(3, u), right: px(3, u) }} />
      <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(3, u), right: px(3, u), fontSize: nameFs, lineHeight: nameFs * 1.15, color: p.text }]} numberOfLines={2}>{item.name}</Text>
      <View style={[styles.abs, styles.price, { top: footTop, left: px(3, u), right: px(3, u), justifyContent: 'center', gap: px(2, u) }]}>
        {item.owned ? (
          <>
            <Ionicons name="checkmark-circle" size={priceFs} color={TH.colors.success} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: TH.colors.success }]} numberOfLines={1}>Owned</Text>
          </>
        ) : (
          <>
            <CoinArt size={px(10, u)} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: p.text }]} numberOfLines={1}>{item.priceCoins.toLocaleString()}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
});

// ------------------------------------------------------------------ special offers

export type DealCardContent =
  /** An admin deal card (monetization.store.deals), its discount computed from real compare-at prices. */
  | { kind: 'admin'; card: DealCardView<StoreItemView, ShopProduct> }
  | { kind: 'discount'; summary: DealsSummary<StoreItemView> }
  | { kind: 'product'; product: ShopProduct }
  | { kind: 'soon' };

/** The real percent behind a deal card's ribbon (0 = no ribbon). */
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

/**
 * The deal card (inner × 92): an admin card, else a real store discount, else
 * an admin-featured product, else the honest placeholder. An admin card's
 * image replaces the chest art.
 */
export function DealCardM({
  p, content, u, width, onDeals, onProduct, onContest, onNav,
}: { p: TophuntPalette; content: DealCardContent; u: number; width: number; onDeals: () => void; onProduct: (id: string) => void; onContest: () => void; onNav?: (nav: ShopNav) => void }) {
  const D = MOCK_M.deals;
  const h = px(D.h, u);
  const r = px(D.radius, u);
  const titleFs = mfont(D.title, u);
  const subFs = mfont(D.sub, u);
  const pct = dealPercent(content);
  const ribbon = pct > 0;
  const image = content.kind === 'admin' ? content.card.imageUrl : null;
  const title = [styles.dealTitle, { color: p.text }];
  const sub = [styles.dealSub, { color: p.sub }];
  const price = [styles.priceText, { color: p.text }];
  const was = [styles.was, { color: p.sub }];
  let body: React.ReactNode;
  if (content.kind === 'admin') {
    const c = content.card;
    const prod = c.product;
    body = (
      <>
        <Text style={[title, { fontSize: titleFs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{c.title}</Text>
        {c.subtitle ? (
          <Text style={[sub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={prod ? 1 : 2}>{c.subtitle}</Text>
        ) : null}
        {prod ? (
          <View style={[styles.price, { gap: px(3, u), marginTop: px(2, u) }]}>
            <CoinArt size={px(12, u)} />
            <Text style={[price, { fontSize: mfont(11, u) }]} numberOfLines={1}>{prod.priceCoins.toLocaleString()} DP</Text>
            {discountOf(prod) > 0 ? <Text style={[was, { fontSize: mfont(8.5, u) }]} numberOfLines={1}>{Number(prod.compareAtCoins).toLocaleString()}</Text> : null}
          </View>
        ) : null}
        <View style={{ marginTop: px(prod ? 4 : 5, u) }}>
          <BrandButton
            label={c.ctaLabel}
            onPress={() => onNav?.(c.nav)}
            u={u}
            width={D.ctaW}
            height={D.ctaH}
            size={D.cta}
            a11y={`${c.ctaLabel}: ${c.title}${c.discounted > 1 ? `, ${c.discounted} discounted items` : ''}`}
          />
        </View>
      </>
    );
  } else if (content.kind === 'discount') {
    body = (
      <>
        <Text style={[title, { fontSize: titleFs }]} numberOfLines={1}>Mega Shop Deal</Text>
        <Text style={[sub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>Get Premium Items at Special Discount!</Text>
        <View style={{ marginTop: px(5, u) }}>
          <BrandButton label="Grab Now" onPress={onDeals} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`Grab now: ${content.summary.items.length} discounted items dekho`} />
        </View>
      </>
    );
  } else if (content.kind === 'product') {
    const prod = content.product;
    body = (
      <>
        <Text style={[title, { fontSize: titleFs }]} numberOfLines={1}>{prod.title}</Text>
        <Text style={[sub, { fontSize: subFs }]} numberOfLines={1}>Featured product, stock mein</Text>
        <View style={[styles.price, { gap: px(3, u), marginTop: px(2, u) }]}>
          <CoinArt size={px(12, u)} />
          <Text style={[price, { fontSize: mfont(11, u) }]}>{prod.priceCoins.toLocaleString()} DP</Text>
          {pct ? <Text style={[was, { fontSize: mfont(8.5, u) }]} numberOfLines={1}>{Number(prod.compareAtCoins).toLocaleString()}</Text> : null}
        </View>
        <View style={{ marginTop: px(4, u) }}>
          <BrandButton label="Grab Now" onPress={() => onProduct(prod.id)} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`Grab now: ${prod.title}`} />
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Text style={[title, { fontSize: titleFs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Deals jaldi aa rahe hain</Text>
        <Text style={[sub, { fontSize: subFs }]} numberOfLines={2}>Contest jeeto, DP coin jama karo</Text>
        <View style={{ marginTop: px(5, u) }}>
          <BrandButton label="Contest jeeto" onPress={onContest} u={u} width={D.ctaW + 14} height={D.ctaH} size={D.cta} a11y="Contest jeeto: battles kholo" />
        </View>
      </>
    );
  }
  return (
    <View style={[{ width, height: h, borderRadius: r }, cardShadow(p)]}>
      <View style={[styles.deals, { width, height: h, borderRadius: r, backgroundColor: p.card, borderColor: p.border }]}>
        <View style={{ width: px(D.chestW, u), height: px(D.chestH, u), marginLeft: px(2, u) }}>
          {image ? (
            <AppImage source={{ uri: image }} displayWidth={px(D.chestW, u)} style={[{ width: px(D.chestW, u), height: px(D.chestH, u), borderRadius: px(8, u), backgroundColor: p.cardAlt }]} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
          ) : (
            <ChestArt width={px(D.chestW, u)} height={px(D.chestH, u)} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: px(4, u), marginRight: ribbon ? px(D.ribbonW + 10, u) : px(10, u) }}>{body}</View>
        {ribbon ? (
          <View style={[styles.abs, { right: px(8, u), top: 0, width: px(D.ribbonW, u), height: px(D.ribbonH, u) }]} accessible accessibilityLabel={`Up to ${pct}% off`}>
            <DealRibbon width={px(D.ribbonW, u)} height={px(D.ribbonH, u)} />
            <View style={[StyleSheet.absoluteFill, styles.ribbonText, { paddingBottom: px(8, u) }]}>
              <Text style={[styles.ribbonSmall, { fontSize: mfont(7, u), lineHeight: mfont(8, u) }]}>UP TO</Text>
              <Text style={[styles.ribbonBig, { fontSize: mfont(pct >= 100 ? 14 : 16, u), lineHeight: mfont(18, u) }]} numberOfLines={1}>{pct}%</Text>
              <Text style={[styles.ribbonSmall, { fontSize: mfont(8, u), lineHeight: mfont(9, u) }]}>OFF</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ physical (4 per row)

const PhysicalCardM = React.memo(function PhysicalCardM({ p, product, u, width, onPress }: { p: TophuntPalette; product: ShopProduct | null; u: number; width: number; onPress?: () => void }) {
  const P = MOCK_M.phys;
  const r = px(P.radius, u);
  const imgH = px(P.imgH, u);
  const frame = [styles.card, { width, height: px(P.h, u), borderRadius: r, borderWidth: 1, backgroundColor: p.card, borderColor: p.border }, cardShadow(p)];
  const img = product?.images[0];
  const imgBox = (
    <View style={[styles.physImg, { height: imgH, borderTopLeftRadius: r, borderTopRightRadius: r, backgroundColor: p.cardAlt }]}>
      {img ? <AppImage source={{ uri: img }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} /> : <CubeLine size={px(22, u)} color={p.sub} />}
      {product && !product.variants.some((v) => v.inStock) ? (
        <View style={[styles.oos, { bottom: px(2, u), left: px(2, u) }]}><Text style={[styles.oosText, { fontSize: mfont(7, u) }]}>Out of stock</Text></View>
      ) : null}
    </View>
  );
  if (!product) return <View style={frame} accessible={false}>{imgBox}</View>;
  const fs = mfont(P.title, u);
  const ps = mfont(P.price, u);
  const pct = discountOf(product);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`${product.title}, ${product.priceCoins} DP coin${pct ? `, ${pct}% off` : ''}`} style={frame}>
      {imgBox}
      <OffPill pct={pct} u={u} style={{ top: px(3, u), right: px(3, u) }} />
      <Text style={[styles.cardName, { fontSize: fs, marginTop: px(4, u), paddingHorizontal: px(4, u), textAlign: 'left', color: p.text }]} numberOfLines={1}>{product.title}</Text>
      <View style={[styles.price, { gap: px(2, u), paddingHorizontal: px(4, u), marginTop: px(2, u) }]}>
        <CoinArt size={px(10, u)} />
        <Text style={[styles.priceText, { fontSize: ps, color: p.text }]} numberOfLines={1}>{pct ? product.priceCoins.toLocaleString() : `${product.priceCoins.toLocaleString()} DP`}</Text>
        {pct ? <Text style={[styles.was, { fontSize: mfont(7.5, u), color: p.sub }]} numberOfLines={1}>{Number(product.compareAtCoins).toLocaleString()}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

/** 4 product cards, or 4 empty frames with the "jaldi aa rahe hain" caption (not tappable). */
export function PhysicalRowM({ p, products, u, inner, onOpen }: { p: TophuntPalette; products: ShopProduct[] | null; u: number; inner: number; onOpen: (id: string) => void }) {
  const P = MOCK_M.phys;
  const gap = px(P.gap, u);
  const w = cellWidth(inner, P.cols, gap);
  const slots: (ShopProduct | null)[] = products ? products.slice(0, P.cols) : Array.from({ length: P.cols }, () => null);
  return (
    <View>
      <View style={[styles.row, { gap }]}>
        {slots.map((x, k) => <PhysicalCardM key={x?.id ?? `ph${k}`} p={p} product={x} u={u} width={w} onPress={x ? () => onOpen(x.id) : undefined} />)}
      </View>
      {!products ? <Text style={[styles.caption, { fontSize: mfont(9.5, u), marginTop: px(4, u), color: p.sub }]} numberOfLines={1}>Products jaldi aa rahe hain</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ my collection (5 per row)

export function CollectionRowM({ p, tiles, u, inner, onPress }: { p: TophuntPalette; tiles: CollectionTile[]; u: number; inner: number; onPress: () => void }) {
  const C = MOCK_M.col;
  const gap = px(C.gap, u);
  const w = cellWidth(inner, C.cols, gap);
  const labelFs = mfont(C.label, u);
  const countFs = mfont(C.count, u);
  return (
    <View style={[styles.row, { gap }]}>
      {tiles.map((t) => {
        const count = `${t.count}${t.more ? '+' : ''}`;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${t.label}: ${count}. Collection kholo`}
            style={[styles.tile, { width: w, height: px(C.h, u), borderRadius: px(C.radius, u), backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
          >
            <View style={{ marginTop: px(4, u) }}>
              <TileArt tile={t.key} width={px(C.icon, u)} height={px(C.icon * 0.82, u)} />
            </View>
            <Text style={[styles.colLabel, { fontSize: labelFs, lineHeight: labelFs * 1.15, color: p.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.label}</Text>
            <Text style={[styles.colCount, { fontSize: countFs, lineHeight: countFs * 1.15, color: p.sub }]} numberOfLines={1}>({count})</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ upgrade banner

/** Dark brand banner (TH.gradients.banner) in both modes: the winged crown art is drawn for dark. */
export function UpgradeBannerM({ p, u, width, onPress }: { p: TophuntPalette; u: number; width: number; onPress: () => void }) {
  const U = MOCK_M.upgrade;
  const h = px(U.h, u);
  const r = px(U.radius, u);
  const subFs = mfont(U.sub, u);
  return (
    <View style={[{ width, height: h, borderRadius: r }, cardShadow(p)]}>
      <LinearGradient colors={TH.gradients.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={[styles.upgrade, { width, height: h, borderRadius: r, paddingLeft: px(12, u), borderColor: p.border }]}>
        <View style={{ flex: 1, minWidth: 0, gap: px(3, u) }}>
          <View style={[styles.head, { gap: px(5, u) }]}>
            <CrownIcon size={px(16, u)} />
            <Text style={[styles.dealTitle, styles.onBanner, { fontSize: mfont(U.title, u) }]} numberOfLines={1} accessibilityRole="header">Upgrade Your Profile</Text>
          </View>
          <Text style={[styles.dealSub, styles.onBannerSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>Unlock Premium Items, Special Effects & More!</Text>
          <View style={{ marginTop: px(3, u) }}>
            <BrandButton label="Upgrade Now" onPress={onPress} u={u} width={U.ctaW} height={U.ctaH} size={U.cta} a11y="Upgrade now: Epic, Legendary aur Mythic items dekho" />
          </View>
        </View>
        <View style={{ width: px(U.artW, u), height: px(U.artH, u), marginRight: px(4, u) }} pointerEvents="none">
          <WingedCrownArt width={px(U.artW, u)} height={px(U.artH, u)} />
        </View>
      </LinearGradient>
    </View>
  );
}

// ------------------------------------------------------------------ quick actions (separate cards)

export interface QuickCard {
  key: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  /** Kept for callers; the cards are drawn neutral (p.card / p.border) on the app surfaces. */
  accent: string;
  onPress: () => void;
}

export function QuickCardsM({ p, cards, u, width }: { p: TophuntPalette; cards: QuickCard[]; u: number; width: number }) {
  const Q = MOCK_M.quick;
  const gap = px(Q.gap, u);
  const w = cellWidth(width, Math.max(1, cards.length), gap);
  return (
    <View style={[styles.row, { gap }]}>
      {cards.map((a) => (
        <TouchableOpacity
          key={a.key}
          onPress={a.onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${a.title}: ${a.sub}`}
          style={[styles.quick, { width: w, height: px(Q.h, u), borderRadius: px(Q.radius, u), gap: px(6, u), paddingHorizontal: px(8, u), backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}
        >
          {a.icon}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.qaTitle, { fontSize: mfont(Q.title, u), color: p.text }]} numberOfLines={1}>{a.title}</Text>
            <Text style={[styles.qaSub, { fontSize: mfont(Q.sub, u), color: p.sub }]} numberOfLines={1}>{a.sub}</Text>
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
  link: { color: LINK, fontFamily: TH.fonts.semibold },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: INK, fontFamily: TH.fonts.bold, flexShrink: 1 },
  tile: { alignItems: 'center', borderWidth: 1 },
  tileLabel: { position: 'absolute', left: 2, right: 2, fontFamily: TH.fonts.semibold, textAlign: 'center' },
  soon: { position: 'absolute', backgroundColor: BRAND },
  soonText: { color: '#FFF', fontFamily: TH.fonts.bold, letterSpacing: 0.3 },
  off: { position: 'absolute', backgroundColor: BRAND, justifyContent: 'center' },
  offText: { color: '#FFF', fontFamily: TH.fonts.bold },
  card: { overflow: 'visible' },
  legGlow: { position: 'absolute', backgroundColor: 'rgba(255,200,87,0.2)' },
  tag: { position: 'absolute', justifyContent: 'center' },
  tagText: { color: '#FFF', fontFamily: TH.fonts.bold },
  cardName: { fontFamily: TH.fonts.semibold, textAlign: 'center' },
  foot: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  priceText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  was: { fontFamily: TH.fonts.medium, textDecorationLine: 'line-through', flexShrink: 1 },
  deals: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, overflow: 'hidden' },
  dealTitle: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  dealSub: { fontFamily: TH.fonts.medium },
  /** Text on the dark Upgrade banner (both modes). */
  onBanner: { color: TH.colors.white },
  onBannerSub: { color: TH.colors.lilac },
  ribbonText: { alignItems: 'center', justifyContent: 'center' },
  ribbonSmall: { color: '#FFF', fontFamily: TH.fonts.bold },
  ribbonBig: { color: '#FFF', fontFamily: TH.fonts.bold },
  physImg: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  oos: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, paddingVertical: 1 },
  oosText: { color: '#FFF', fontFamily: TH.fonts.bold },
  caption: { fontFamily: TH.fonts.medium, textAlign: 'center' },
  colLabel: { fontFamily: TH.fonts.semibold, textAlign: 'center', paddingHorizontal: 2, marginTop: 1 },
  colCount: { fontFamily: TH.fonts.semibold },
  upgrade: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, overflow: 'hidden' },
  quick: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  qaTitle: { fontFamily: TH.fonts.bold },
  qaSub: { fontFamily: TH.fonts.medium },
});
