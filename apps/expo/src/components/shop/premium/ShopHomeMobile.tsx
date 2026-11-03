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
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { dealTimerLabel, discountOf, type CardTag, type CategoryTile, type CollectionTile, type DealsSummary } from '@/src/lib/shopModel';
import { TH, glowShadow } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import type { ShopProduct } from '@/src/services/shop';
import { MOCK_M, cellWidth, mfont, px } from './mock';
import { ProductPreview } from './ProductPreview';
import { ChestArt, CoinArt, CrownIcon, CubeLine, DealRibbon, TileArt, WingedCrownArt } from './ShopArt';
import { CARD_FILL, tagColors } from './ShopHomeSections';
import { WishlistHeart } from './WishlistHeart';

const TILE_FILL = '#150A31';
const LINK = '#60A5FA';
const LINK_ARROW = '#A78BFA';
const INK = '#1A1033';

const alpha = (hex: string, a: number) => `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
const glow = (color: string, u: number) => ({ ...glowShadow(color, true), shadowRadius: 8 * u });

// ------------------------------------------------------------------ shared bits

export function SectionHeaderM({
  u, icon, title, action, right, style,
}: { u: number; icon: React.ReactNode; title: string; action?: { label: string; onPress: () => void }; right?: React.ReactNode; style?: any }) {
  const S = MOCK_M.section;
  const link = mfont(S.link, u);
  return (
    <View style={[styles.head, { height: px(S.h, u), gap: px(5, u) }, style]}>
      {icon}
      <Text style={[styles.headTitle, { fontSize: mfont(S.title, u) }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={[styles.head, { gap: px(2, u) }]} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`}>
          <Text style={[styles.link, { fontSize: link }]}>{action.label}</Text>
          <ArrowIcon variant="arrow" direction="right" size={link} color={LINK_ARROW} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function YellowButton({ label, onPress, u, width, height, size, a11y }: { label: string; onPress: () => void; u: number; width: number; height: number; size: number; a11y: string }) {
  const fs = mfont(size, u);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={a11y} style={{ alignSelf: 'flex-start' }}>
      <LinearGradient colors={['#FFE45C', '#FFC41A']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.btn, { width: px(width, u), height: px(height, u), borderRadius: px(height / 2, u), gap: px(4, u), paddingHorizontal: px(6, u) }]}>
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

/** Small red "-X%" corner pill for cards too narrow for a strike-through price. */
function OffPill({ pct, u, style }: { pct: number; u: number; style?: any }) {
  if (!pct) return null;
  return (
    <View style={[styles.off, { borderRadius: px(6, u), paddingHorizontal: px(3, u), height: px(12, u) }, style]} pointerEvents="none">
      <Text style={[styles.offText, { fontSize: mfont(7.5, u) }]} numberOfLines={1}>-{pct}%</Text>
    </View>
  );
}

// ------------------------------------------------------------------ categories (2 × 5)

const CategoryTileM = React.memo(function CategoryTileM({ tile, u, width, onPick }: { tile: CategoryTile; u: number; width: number; onPick: (t: CategoryTile) => void }) {
  const C = MOCK_M.cat;
  const fs = mfont(C.label, u);
  return (
    <TouchableOpacity
      onPress={() => onPick(tile)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={tile.soon ? `${tile.label}: jaldi aa raha hai` : `${tile.label} dekho`}
      style={[styles.tile, { width, height: px(C.h, u), borderRadius: px(C.radius, u), borderColor: alpha(tile.accent, 0.75) }, glow(tile.accent, u)]}
    >
      <View style={{ marginTop: px(6, u) }}>
        <TileArt tile={tile.key} width={px(C.artW, u)} height={px(C.artH, u)} />
      </View>
      <Text style={[styles.tileLabel, { fontSize: fs, lineHeight: fs * 1.2, bottom: px(4, u) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{tile.label}</Text>
      {tile.soon ? <Soon u={u} /> : null}
    </TouchableOpacity>
  );
});

export function CategoryGridM({ tiles, u, inner, onPick }: { tiles: CategoryTile[]; u: number; inner: number; onPick: (t: CategoryTile) => void }) {
  const C = MOCK_M.cat;
  const gap = px(C.gap, u);
  const w = cellWidth(inner, C.cols, gap);
  const rows = [tiles.slice(0, C.cols), tiles.slice(C.cols, C.cols * 2)].filter((r) => r.length);
  return (
    <View style={{ gap: px(C.rowGap, u) }}>
      {rows.map((r, k) => (
        <View key={k} style={[styles.row, { gap }]}>
          {r.map((t) => <CategoryTileM key={t.key} tile={t} u={u} width={w} onPick={onPick} />)}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ featured (3 per row)

export const FeatureCardM = React.memo(function FeatureCardM({
  item, tag, u, width, viewer, onOpen,
}: { item: StoreItemView; tag: CardTag; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
  const F = MOCK_M.feat;
  const c = tagColors(tag);
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
    <View style={[styles.card, { width, height: h, borderRadius: px(F.radius, u), borderWidth: Math.max(1, 1.3 * u), borderColor: c.border, backgroundColor: legendary ? '#24123A' : CARD_FILL }, glow(c.border, u)]}>
      {legendary ? <View style={[styles.legGlow, { width: px(76, u), height: px(52, u), borderRadius: px(38, u), top: px(14, u), left: (width - px(76, u)) / 2 }]} /> : null}
      <Pressable onPress={onOpen} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`${item.name}, ${tag.label}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin${pct ? `, ${pct}% off` : ''}`}. Details kholo`}>
        <View style={[styles.abs, { top: px(14, u), left: (width - artW) / 2 }]}>
          <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(6, u)} bare />
        </View>
        <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(5, u), right: px(5, u), fontSize: nameFs, lineHeight: nameFs * 1.2 }]} numberOfLines={2}>{item.name}</Text>
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
            <Text style={[styles.priceText, { fontSize: priceFs }]} numberOfLines={1}>{pct ? item.priceCoins.toLocaleString() : `${item.priceCoins.toLocaleString()} DP`}</Text>
            {pct ? <Text style={[styles.was, { fontSize: mfont(8.5, u) }]} numberOfLines={1}>{Number(item.compareAtCoins).toLocaleString()}</Text> : null}
          </View>
        )}
        <WishlistHeart itemId={item.itemId} name={item.name} size={px(12, u)} bubble={false} />
      </View>
    </View>
  );
});

// ------------------------------------------------------------------ trending (5 per row)

export const TrendCardM = React.memo(function TrendCardM({ item, u, width, viewer, onOpen }: { item: StoreItemView; u: number; width: number; viewer: Viewer; onOpen: () => void }) {
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
      style={[styles.card, { width, height: h, borderRadius: px(T.radius, u), borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)' }, glow('#A855F7', u)]}
    >
      <View style={[styles.abs, { top: px(5, u), left: (width - artW) / 2 }]}>
        <ProductPreview item={item} viewer={viewer} width={artW} height={artH} radius={px(5, u)} bare />
      </View>
      <OffPill pct={pct} u={u} style={{ top: px(3, u), right: px(3, u) }} />
      <Text style={[styles.abs, styles.cardName, { top: nameTop, left: px(3, u), right: px(3, u), fontSize: nameFs, lineHeight: nameFs * 1.15 }]} numberOfLines={2}>{item.name}</Text>
      <View style={[styles.abs, styles.price, { top: footTop, left: px(3, u), right: px(3, u), justifyContent: 'center', gap: px(2, u) }]}>
        {item.owned ? (
          <>
            <Ionicons name="checkmark-circle" size={priceFs} color={TH.colors.success} />
            <Text style={[styles.priceText, { fontSize: priceFs, color: TH.colors.success }]} numberOfLines={1}>Owned</Text>
          </>
        ) : (
          <>
            <CoinArt size={px(10, u)} />
            <Text style={[styles.priceText, { fontSize: priceFs }]} numberOfLines={1}>{item.priceCoins.toLocaleString()}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
});

// ------------------------------------------------------------------ special offers

/** Red "⏱ 12:36:59" pill: only for a real future end; ticks every second when ≤ 7 days away, else every minute. */
export function DealTimerPill({ endsAt, u }: { endsAt: number; u: number }) {
  const [now, setNow] = useState(() => Date.now());
  const near = endsAt - now <= 7 * 86_400_000;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), near ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [near]);
  const label = dealTimerLabel(endsAt, now);
  if (!label) return null;
  const D = MOCK_M.deals;
  const fs = mfont(D.timer, u);
  return (
    <View style={[styles.timer, { height: px(D.timerH, u), borderRadius: px(D.timerH / 2, u), paddingHorizontal: px(7, u), gap: px(3, u), marginRight: px(2, u) }]} accessible accessibilityLabel={`Deal ${label} mein khatam`}>
      <Ionicons name="time" size={fs} color="#FFF" />
      <Text style={[styles.timerText, { fontSize: fs }]}>{label}</Text>
    </View>
  );
}

export type DealCardContent =
  | { kind: 'discount'; summary: DealsSummary<StoreItemView> }
  | { kind: 'product'; product: ShopProduct }
  | { kind: 'soon' };

/** The deal card (inner × 92): a real store discount, else an admin-featured product, else the honest placeholder. */
export function DealCardM({
  content, u, width, onDeals, onProduct, onContest,
}: { content: DealCardContent; u: number; width: number; onDeals: () => void; onProduct: (id: string) => void; onContest: () => void }) {
  const D = MOCK_M.deals;
  const h = px(D.h, u);
  const r = px(D.radius, u);
  const titleFs = mfont(D.title, u);
  const subFs = mfont(D.sub, u);
  const ribbon = content.kind === 'discount';
  let body: React.ReactNode;
  if (content.kind === 'discount') {
    body = (
      <>
        <Text style={[styles.dealTitle, { fontSize: titleFs }]} numberOfLines={1}>Mega Shop Deal</Text>
        <Text style={[styles.dealSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>Get Premium Items at Special Discount!</Text>
        <View style={{ marginTop: px(5, u) }}>
          <YellowButton label="Grab Now" onPress={onDeals} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`Grab now: ${content.summary.items.length} discounted items dekho`} />
        </View>
      </>
    );
  } else if (content.kind === 'product') {
    const p = content.product;
    body = (
      <>
        <Text style={[styles.dealTitle, { fontSize: titleFs }]} numberOfLines={1}>{p.title}</Text>
        <Text style={[styles.dealSub, { fontSize: subFs }]} numberOfLines={1}>Featured product, stock mein</Text>
        <View style={[styles.price, { gap: px(3, u), marginTop: px(2, u) }]}>
          <CoinArt size={px(12, u)} />
          <Text style={[styles.priceText, { fontSize: mfont(11, u) }]}>{p.priceCoins.toLocaleString()} DP</Text>
        </View>
        <View style={{ marginTop: px(4, u) }}>
          <YellowButton label="Grab Now" onPress={() => onProduct(p.id)} u={u} width={D.ctaW} height={D.ctaH} size={D.cta} a11y={`Grab now: ${p.title}`} />
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Text style={[styles.dealTitle, { fontSize: titleFs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Deals jaldi aa rahe hain</Text>
        <Text style={[styles.dealSub, { fontSize: subFs }]} numberOfLines={2}>Contest jeeto, DP coin jama karo</Text>
        <View style={{ marginTop: px(5, u) }}>
          <YellowButton label="Contest jeeto" onPress={onContest} u={u} width={D.ctaW + 14} height={D.ctaH} size={D.cta} a11y="Contest jeeto: battles kholo" />
        </View>
      </>
    );
  }
  return (
    <View style={[{ width, height: h, borderRadius: r }, glow('#EC4899', u)]}>
      <LinearGradient colors={['#3B0A55', '#24104E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.deals, { width, height: h, borderRadius: r }]}>
        <View style={{ width: px(D.chestW, u), height: px(D.chestH, u), marginLeft: px(2, u) }}>
          <ChestArt width={px(D.chestW, u)} height={px(D.chestH, u)} />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: px(4, u), marginRight: ribbon ? px(D.ribbonW + 10, u) : px(10, u) }}>{body}</View>
        {ribbon ? (
          <View style={[styles.abs, { right: px(8, u), top: 0, width: px(D.ribbonW, u), height: px(D.ribbonH, u) }]} accessible accessibilityLabel={`Up to ${content.summary.maxPercent}% off`}>
            <DealRibbon width={px(D.ribbonW, u)} height={px(D.ribbonH, u)} />
            <View style={[StyleSheet.absoluteFill, styles.ribbonText, { paddingBottom: px(8, u) }]}>
              <Text style={[styles.ribbonSmall, { fontSize: mfont(7, u), lineHeight: mfont(8, u) }]}>UP TO</Text>
              <Text style={[styles.ribbonBig, { fontSize: mfont(content.summary.maxPercent >= 100 ? 14 : 16, u), lineHeight: mfont(18, u) }]} numberOfLines={1}>{content.summary.maxPercent}%</Text>
              <Text style={[styles.ribbonSmall, { fontSize: mfont(8, u), lineHeight: mfont(9, u) }]}>OFF</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

// ------------------------------------------------------------------ physical (4 per row)

const PhysicalCardM = React.memo(function PhysicalCardM({ product, u, width, onPress }: { product: ShopProduct | null; u: number; width: number; onPress?: () => void }) {
  const P = MOCK_M.phys;
  const r = px(P.radius, u);
  const imgH = px(P.imgH, u);
  const frame = [styles.card, { width, height: px(P.h, u), borderRadius: r, borderWidth: 1, borderColor: 'rgba(168,85,247,0.55)' }, glow('#A855F7', u)];
  const img = product?.images[0];
  const imgBox = (
    <View style={[styles.physImg, { height: imgH, borderTopLeftRadius: r, borderTopRightRadius: r }]}>
      {img ? <AppImage source={{ uri: img }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} /> : <CubeLine size={px(22, u)} />}
      {product && !product.variants.some((v) => v.inStock) ? (
        <View style={[styles.oos, { bottom: px(2, u), left: px(2, u) }]}><Text style={[styles.oosText, { fontSize: mfont(7, u) }]}>Out of stock</Text></View>
      ) : null}
    </View>
  );
  if (!product) return <View style={frame} accessible={false}>{imgBox}</View>;
  const fs = mfont(P.title, u);
  const ps = mfont(P.price, u);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`${product.title}, ${product.priceCoins} DP coin`} style={frame}>
      {imgBox}
      <Text style={[styles.cardName, { fontSize: fs, marginTop: px(4, u), paddingHorizontal: px(4, u), textAlign: 'left' }]} numberOfLines={1}>{product.title}</Text>
      <View style={[styles.price, { gap: px(2, u), paddingHorizontal: px(4, u), marginTop: px(2, u) }]}>
        <CoinArt size={px(10, u)} />
        <Text style={[styles.priceText, { fontSize: ps }]} numberOfLines={1}>{product.priceCoins.toLocaleString()} DP</Text>
      </View>
    </TouchableOpacity>
  );
});

/** 4 product cards, or 4 empty frames with the "jaldi aa rahe hain" caption (not tappable). */
export function PhysicalRowM({ products, u, inner, onOpen }: { products: ShopProduct[] | null; u: number; inner: number; onOpen: (id: string) => void }) {
  const P = MOCK_M.phys;
  const gap = px(P.gap, u);
  const w = cellWidth(inner, P.cols, gap);
  const slots: (ShopProduct | null)[] = products ? products.slice(0, P.cols) : Array.from({ length: P.cols }, () => null);
  return (
    <View>
      <View style={[styles.row, { gap }]}>
        {slots.map((x, k) => <PhysicalCardM key={x?.id ?? `ph${k}`} product={x} u={u} width={w} onPress={x ? () => onOpen(x.id) : undefined} />)}
      </View>
      {!products ? <Text style={[styles.caption, { fontSize: mfont(9.5, u), marginTop: px(4, u) }]} numberOfLines={1}>Products jaldi aa rahe hain</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ my collection (5 per row)

export function CollectionRowM({ tiles, u, inner, onPress }: { tiles: CollectionTile[]; u: number; inner: number; onPress: () => void }) {
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
            style={[styles.tile, { width: w, height: px(C.h, u), borderRadius: px(C.radius, u), borderColor: alpha(t.accent, 0.75) }, glow(t.accent, u)]}
          >
            <View style={{ marginTop: px(4, u) }}>
              <TileArt tile={t.key} width={px(C.icon, u)} height={px(C.icon * 0.82, u)} />
            </View>
            <Text style={[styles.colLabel, { fontSize: labelFs, lineHeight: labelFs * 1.15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.label}</Text>
            <Text style={[styles.colCount, { fontSize: countFs, lineHeight: countFs * 1.15 }]} numberOfLines={1}>({count})</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ upgrade banner

export function UpgradeBannerM({ u, width, onPress }: { u: number; width: number; onPress: () => void }) {
  const U = MOCK_M.upgrade;
  const h = px(U.h, u);
  const r = px(U.radius, u);
  const subFs = mfont(U.sub, u);
  return (
    <View style={[{ width, height: h, borderRadius: r }, glow('#A855F7', u)]}>
      <LinearGradient colors={['#2A0B5E', '#4C1D95', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.6 }} style={[styles.upgrade, { width, height: h, borderRadius: r, paddingLeft: px(12, u) }]}>
        <View style={{ flex: 1, minWidth: 0, gap: px(3, u) }}>
          <View style={[styles.head, { gap: px(5, u) }]}>
            <CrownIcon size={px(16, u)} />
            <Text style={[styles.dealTitle, { fontSize: mfont(U.title, u) }]} numberOfLines={1} accessibilityRole="header">Upgrade Your Profile</Text>
          </View>
          <Text style={[styles.dealSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>Unlock Premium Items, Special Effects & More!</Text>
          <View style={{ marginTop: px(3, u) }}>
            <YellowButton label="Upgrade Now" onPress={onPress} u={u} width={U.ctaW} height={U.ctaH} size={U.cta} a11y="Upgrade now: Epic, Legendary aur Mythic items dekho" />
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
  accent: string;
  onPress: () => void;
}

export function QuickCardsM({ cards, u, width }: { cards: QuickCard[]; u: number; width: number }) {
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
          style={[styles.quick, { width: w, height: px(Q.h, u), borderRadius: px(Q.radius, u), gap: px(6, u), paddingHorizontal: px(8, u), borderColor: alpha(a.accent, 0.6) }, glow(a.accent, u)]}
        >
          {a.icon}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.qaTitle, { fontSize: mfont(Q.title, u) }]} numberOfLines={1}>{a.title}</Text>
            <Text style={[styles.qaSub, { fontSize: mfont(Q.sub, u) }]} numberOfLines={1}>{a.sub}</Text>
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
  headTitle: { color: '#FFFFFF', fontFamily: TH.fonts.bold, flexShrink: 1 },
  link: { color: LINK, fontFamily: TH.fonts.semibold },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: INK, fontFamily: TH.fonts.bold, flexShrink: 1 },
  tile: { backgroundColor: TILE_FILL, alignItems: 'center', borderWidth: 1 },
  tileLabel: { position: 'absolute', left: 2, right: 2, color: '#FFFFFF', fontFamily: TH.fonts.semibold, textAlign: 'center' },
  soon: { position: 'absolute', backgroundColor: '#EC4899' },
  soonText: { color: '#FFF', fontFamily: TH.fonts.bold, letterSpacing: 0.3 },
  off: { position: 'absolute', backgroundColor: '#EF4444', justifyContent: 'center' },
  offText: { color: '#FFF', fontFamily: TH.fonts.bold },
  card: { backgroundColor: CARD_FILL, overflow: 'visible' },
  legGlow: { position: 'absolute', backgroundColor: 'rgba(255,200,87,0.2)' },
  tag: { position: 'absolute', justifyContent: 'center' },
  tagText: { color: '#FFF', fontFamily: TH.fonts.bold },
  cardName: { color: '#FFFFFF', fontFamily: TH.fonts.semibold, textAlign: 'center' },
  foot: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  priceText: { color: '#FFFFFF', fontFamily: TH.fonts.bold, flexShrink: 1 },
  was: { color: '#B8A9D9', fontFamily: TH.fonts.medium, textDecorationLine: 'line-through', flexShrink: 1 },
  timer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444' },
  timerText: { color: '#FFF', fontFamily: TH.fonts.bold, fontVariant: ['tabular-nums'] },
  deals: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(236,72,153,0.7)', overflow: 'hidden' },
  dealTitle: { color: '#FFFFFF', fontFamily: TH.fonts.bold, flexShrink: 1 },
  dealSub: { color: '#E9D5FF', fontFamily: TH.fonts.medium },
  ribbonText: { alignItems: 'center', justifyContent: 'center' },
  ribbonSmall: { color: '#FFF', fontFamily: TH.fonts.bold },
  ribbonBig: { color: '#FFF', fontFamily: TH.fonts.bold },
  physImg: { backgroundColor: '#1A0F3D', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  oos: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(11,6,32,0.78)', paddingHorizontal: 4, paddingVertical: 1 },
  oosText: { color: '#FFF', fontFamily: TH.fonts.bold },
  caption: { color: '#B8A9D9', fontFamily: TH.fonts.medium, textAlign: 'center' },
  colLabel: { color: '#FFFFFF', fontFamily: TH.fonts.semibold, textAlign: 'center', paddingHorizontal: 2, marginTop: 1 },
  colCount: { color: '#C4B5FD', fontFamily: TH.fonts.semibold },
  upgrade: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.75)', overflow: 'hidden' },
  quick: { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_FILL, borderWidth: 1 },
  qaTitle: { color: '#FFFFFF', fontFamily: TH.fonts.bold },
  qaSub: { color: '#B8A9D9', fontFamily: TH.fonts.medium },
});
