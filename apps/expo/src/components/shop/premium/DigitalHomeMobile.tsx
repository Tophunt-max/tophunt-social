/**
 * PHONE layout of the Shop "Digital" tab (design mock), shown when the tab
 * is opened without a filter: Premium Themes, Avatar Frames, Badges
 * Collection, Titles Collection, the 2×2 category cards (VS Effects, Victory
 * Animations, Profile Effects, Virtual Gifts), the "Special Collections"
 * banner and a link to the full catalogue. A filtered Digital tab (wishlist,
 * ids, rarity, discounts, type, search) keeps the DigitalCatalogue.
 *
 * Every length is `mock px * u` (u = width / 340, premium/mock.ts). Data rules
 * (src/lib/digitalHomeModel.ts): shelves hold real live items only (an empty
 * shelf is hidden), tags come from real fields, a category price is the real
 * lowest price and a category with nothing on sale says "Jaldi aa raha hai".
 *
 * Colours follow the app palette `p`: Themes / Frames cards are dark in both
 * modes (item art is designed on dark), Badges / Titles cards are white with a
 * lavender border in light mode and dark purple in dark mode.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { CosmeticPreview } from '@/src/components/gamification/RewardBits';
import { CosmeticTitleChip, ThemeBackdrop } from '@/src/components/gamification/CosmeticBits';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { Ionicons } from '@/src/lib/icons';
import { cosmeticTier } from '@/src/lib/cosmeticArt';
import { digitalTag, rarityPill, type DigitalTag, type ShelfType, type SpecialCard } from '@/src/lib/digitalHomeModel';
import type { StoreItemView } from '@/src/services/monetization';
import {
  BRAND_BUTTON,
  SHOP_DARK_CARD,
  SHOP_DIGITAL_CAT_GRADS,
  SHOP_SPECIAL_GRAD_DARK,
  SHOP_SPECIAL_GRAD_LIGHT,
  SHOP_TAG_FREE,
  SHOP_TAG_NEW,
  SHOP_VIOLET,
  SHOP_VIOLET_GRAD,
  TH,
  rarityToken,
  type TophuntPalette,
} from '@/src/theme/tophunt';
import { MOCK_M, cellWidth, mfont, px } from './mock';
import { ProductPreview } from './ProductPreview';
import { BadgeIcon, DiamondSparkle, FlameIcon, TileArt, TrophyIcon, VioletCrownIcon, WingedCrownArt } from './ShopArt';
import { ArrowCircle, SectionHeaderM } from './ShopHomeMobile';
import { WishlistHeart } from './WishlistHeart';
import { ArtStage, lavenderShadow, shopBorder } from './surface';

const WHITE = TH.colors.white;

/** Geometry of the Digital tab mock (mock px at 340 wide; widths come from cellWidth). */
export const DIGITAL_M = {
  /** Themes / Frames: 4 dark cards (≈ width / 4 × 100 pt on a 390 phone). */
  dark: { cols: 4, gap: 6, h: 88, radius: 10.5, name: 8.5, price: 7.5, tag: 6.5, tagH: 11, coin: 8, heart: 10 },
  /** Badges: 5 cards, art ≈ 44 pt. */
  badge: { cols: 5, gap: 5, h: 100, radius: 10, art: 38, name: 8, price: 7.5, tag: 6.5, tagH: 11, coin: 8, heart: 9 },
  /** Titles: 4 cards with the title plate on a small dark stage. */
  title: { cols: 4, gap: 6, h: 84, radius: 10, plateH: 30, price: 7.5, tag: 6.5, tagH: 11, coin: 8, heart: 9 },
  /** 2 × 2 gradient category cards (≈ half width × 70 pt). */
  special: { cols: 2, gap: 7, h: 61, radius: 12, artW: 40, artH: 34, title: 10.5, sub: 7.5, price: 8.5, coin: 9, arrow: 18 },
  /** "Special Collections" banner (≈ 90 pt). */
  banner: { h: 78, radius: 14, title: 13.5, sub: 8.5, ctaH: 22, cta: 9.5, artW: 96, artH: 62, crown: 14 },
} as const;

/** Extra touch area so a control shorter than 44 pt still gets a 44 pt target. */
const slop = (h: number) => {
  const v = Math.max(0, Math.ceil((44 - h) / 2));
  return { top: v, bottom: v, left: 6, right: 6 };
};
/** WishlistHeart hit slop for a 44 pt target. */
const heartSlop = (size: number) => Math.max(8, Math.ceil((44 - size) / 2));

/** Pill colours for a Digital tag: PREMIUM brand pink, FREE green, NEW pink, LIMITED violet, rarities their own gradient. */
function tagLook(tag: DigitalTag): { colors: readonly [string, string]; ink: string } {
  if (tag.kind === 'premium') return { colors: BRAND_BUTTON, ink: WHITE };
  if (tag.kind === 'free') return { colors: SHOP_TAG_FREE, ink: WHITE };
  if (tag.kind === 'new') return { colors: SHOP_TAG_NEW, ink: WHITE };
  if (tag.kind === 'limited') return { colors: SHOP_VIOLET_GRAD, ink: WHITE };
  const t = rarityToken(tag.rarity);
  return { colors: t.gradient, ink: t.ink };
}

function TagPill({ tag, u, height, size, style }: { tag: DigitalTag; u: number; height: number; size: number; style?: any }) {
  const look = tagLook(tag);
  const h = px(height, u);
  return (
    <LinearGradient
      colors={look.colors as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.tag, { height: h, borderRadius: h / 2, paddingHorizontal: px(4.5, u) }, style]}
      pointerEvents="none"
    >
      <Text style={[styles.tagText, { fontSize: mfont(size, u), letterSpacing: 0.3 * u, color: look.ink }]} numberOfLines={1}>{tag.label}</Text>
    </LinearGradient>
  );
}

/** Coin + "3,000 DP", or a green "Owned". */
function Price({ item, u, size, coin, color }: { item: StoreItemView; u: number; size: number; coin: number; color: string }) {
  const fs = mfont(size, u);
  if (item.owned) {
    return (
      <View style={[styles.price, { gap: px(2, u) }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={fs} color={TH.colors.success} />
        <Text style={[styles.priceText, { fontSize: fs, color: TH.colors.success }]} numberOfLines={1}>Owned</Text>
      </View>
    );
  }
  return (
    <View style={[styles.price, { gap: px(2, u) }]} pointerEvents="none">
      <CoinIcon size={px(coin, u)} />
      <Text style={[styles.priceText, { fontSize: fs, color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`${item.priceCoins.toLocaleString()} DP`}</Text>
    </View>
  );
}

const priceA11y = (i: StoreItemView) => (i.owned ? 'owned' : `${i.priceCoins} DP coin`);
const isPremiumArt = (i: StoreItemView) => cosmeticTier(i) === 'premium';

// ------------------------------------------------------------------ Themes / Frames (dark cards)

/**
 * Dark card of the Premium Themes / Avatar Frames rows: the theme art fills
 * the card (a frame is drawn on the viewer's avatar instead), tag top-left,
 * white name, dark price pill bottom-left and a white heart bottom-right.
 */
export const DarkShelfCard = React.memo(function DarkShelfCard({
  item, now, u, width, viewer, onOpen,
}: { item: StoreItemView; now: number; u: number; width: number; viewer: Viewer; onOpen: (id: string) => void }) {
  const D = DIGITAL_M.dark;
  const h = px(D.h, u);
  const r = px(D.radius, u);
  const tag = digitalTag(item, now, isPremiumArt(item));
  const nameFs = mfont(D.name, u);
  const pillH = px(15, u);
  const pad = px(4, u);
  const footTop = h - pad - pillH;
  const nameTop = footTop - px(2, u) - nameFs * 1.2;
  const theme = item.type === 'theme';
  const artTop = px(15, u);
  const artSize = Math.max(px(24, u), Math.min(width - px(10, u), nameTop - artTop - px(1, u)));
  return (
    <View style={{ width, height: h, borderRadius: r }}>
      <LinearGradient colors={SHOP_DARK_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.darkCard, { width, height: h, borderRadius: r }]}>
        <Pressable onPress={() => onOpen(item.itemId)} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`${item.name}, ${tag.label}, ${priceA11y(item)}. Details kholo`}>
          {theme ? (
            <>
              <ThemeBackdrop theme={item as any} />
              <LinearGradient colors={['rgba(8,6,24,0)', 'rgba(8,6,24,0.82)']} start={{ x: 0, y: 0.35 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
            </>
          ) : (
            <View style={[styles.abs, { top: artTop, left: (width - artSize) / 2 }]}>
              <ProductPreview item={item} viewer={viewer} width={artSize} height={artSize} radius={px(6, u)} bare />
            </View>
          )}
          <Text style={[styles.abs, styles.darkName, { top: nameTop, left: pad, right: pad, fontSize: nameFs, lineHeight: nameFs * 1.2 }]} numberOfLines={1}>{item.name}</Text>
        </Pressable>
        <TagPill tag={tag} u={u} height={D.tagH} size={D.tag} style={{ position: 'absolute', top: pad, left: pad }} />
        <View style={[styles.foot, { top: footTop, left: pad, right: pad, height: pillH }]}>
          <View style={[styles.pricePill, { height: pillH, borderRadius: pillH / 2, paddingHorizontal: px(4, u) }]} pointerEvents="none">
            <Price item={item} u={u} size={D.price} coin={D.coin} color={WHITE} />
          </View>
          <WishlistHeart itemId={item.itemId} name={item.name} size={px(D.heart, u)} bubble={false} color={WHITE} hitSlop={heartSlop(px(D.heart, u))} />
        </View>
      </LinearGradient>
    </View>
  );
});

// ------------------------------------------------------------------ Badges / Titles (light cards)

/** White card with a lavender border (light) or dark purple card (dark); a Pressable with the content on top. */
function LightCard({ p, u, width, height, radius, a11y, onPress, children }: { p: TophuntPalette; u: number; width: number; height: number; radius: number; a11y: string; onPress: () => void; children: React.ReactNode }) {
  const r = px(radius, u);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[{ width, height, borderRadius: r }, p.isDark ? null : [styles.lightCard, { backgroundColor: p.card, borderColor: shopBorder(p) }], lavenderShadow(p)]}
    >
      {p.isDark ? (
        <LinearGradient colors={SHOP_DARK_CARD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.darkCard, styles.center, { width, height, borderRadius: r }]}>{children}</LinearGradient>
      ) : (
        <View style={[styles.center, { width: '100%', height: '100%' }]}>{children}</View>
      )}
    </Pressable>
  );
}

/** Badges Collection card: rarity pill, the badge on a small dark circle, 2-line name, price and a violet heart. */
export const BadgeShelfCard = React.memo(function BadgeShelfCard({
  p, item, now, u, width, onOpen,
}: { p: TophuntPalette; item: StoreItemView; now: number; u: number; width: number; onOpen: (id: string) => void }) {
  const B = DIGITAL_M.badge;
  const tag = digitalTag(item, now, isPremiumArt(item));
  const d = px(B.art, u);
  const nameFs = mfont(B.name, u);
  const ink = p.isDark ? WHITE : p.text;
  const heart = px(B.heart, u);
  return (
    <LightCard p={p} u={u} width={width} height={px(B.h, u)} radius={B.radius} a11y={`${item.name}, ${tag.label}, ${priceA11y(item)}. Details kholo`} onPress={() => onOpen(item.itemId)}>
      <View style={[styles.col, { paddingTop: px(5, u), paddingBottom: px(4, u), paddingHorizontal: px(3, u), gap: px(3, u) }]}>
        <TagPill tag={tag} u={u} height={B.tagH} size={B.tag} />
        <ArtStage width={d} height={d} radius={d / 2}>
          <View style={[styles.center, { width: d, height: d }]}>
            <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset }} size={d * 0.8} />
          </View>
        </ArtStage>
        <Text style={[styles.cardName, { fontSize: nameFs, lineHeight: nameFs * 1.15, minHeight: nameFs * 1.15 * 2, color: ink }]} numberOfLines={2}>{item.name}</Text>
        <View style={[styles.rowCenter, { gap: px(2, u), alignSelf: 'stretch', justifyContent: 'center' }]}>
          <View style={{ flexShrink: 1, minWidth: 0 }}><Price item={item} u={u} size={B.price} coin={B.coin} color={ink} /></View>
          <WishlistHeart itemId={item.itemId} name={item.name} size={heart} bubble={false} color={p.isDark ? '#C4B5FD' : SHOP_VIOLET} hitSlop={heartSlop(heart)} />
        </View>
      </View>
    </LightCard>
  );
});

/** Titles Collection card: the title plate on a small dark stage, its rarity pill, price and a violet heart. */
export const TitleShelfCard = React.memo(function TitleShelfCard({
  p, item, u, width, onOpen,
}: { p: TophuntPalette; item: StoreItemView; u: number; width: number; onOpen: (id: string) => void }) {
  const T = DIGITAL_M.title;
  const tag = rarityPill(item);
  const ink = p.isDark ? WHITE : p.text;
  const plateW = width - px(8, u);
  const plateH = px(T.plateH, u);
  const heart = px(T.heart, u);
  const text = String(item.asset?.text ?? item.name);
  return (
    <LightCard p={p} u={u} width={width} height={px(T.h, u)} radius={T.radius} a11y={`Title ${text}: ${item.name}, ${tag.label}, ${priceA11y(item)}. Details kholo`} onPress={() => onOpen(item.itemId)}>
      <View style={[styles.col, { paddingVertical: px(5, u), paddingHorizontal: px(4, u), gap: px(4, u), justifyContent: 'space-between' }]}>
        <ArtStage width={plateW} height={plateH} radius={px(7, u)}>
          <View style={[styles.center, { width: plateW, height: plateH, paddingHorizontal: px(3, u) }]}>
            <CosmeticTitleChip title={{ id: item.itemId, name: item.name, rarity: item.rarity, text, asset: item.asset } as any} compact />
          </View>
        </ArtStage>
        <TagPill tag={tag} u={u} height={T.tagH} size={T.tag} />
        <View style={[styles.rowCenter, { gap: px(3, u), alignSelf: 'stretch', justifyContent: 'center' }]}>
          <View style={{ flexShrink: 1, minWidth: 0 }}><Price item={item} u={u} size={T.price} coin={T.coin} color={ink} /></View>
          <WishlistHeart itemId={item.itemId} name={item.name} size={heart} bubble={false} color={p.isDark ? '#C4B5FD' : SHOP_VIOLET} hitSlop={heartSlop(heart)} />
        </View>
      </View>
    </LightCard>
  );
});

// ------------------------------------------------------------------ 2 × 2 category cards

const SpecialCardM = React.memo(function SpecialCardM({
  card, index, u, width, onPress,
}: { card: SpecialCard; index: number; u: number; width: number; onPress: (c: SpecialCard) => void }) {
  const S = DIGITAL_M.special;
  const r = px(S.radius, u);
  const titleFs = mfont(S.title, u);
  const subFs = mfont(S.sub, u);
  const priceFs = mfont(S.price, u);
  const a11y = card.state === 'price' && card.price !== null
    ? `${card.title}: ${card.sub}, ${card.price} DP coin se shuru. Dekho`
    : card.state === 'soon'
      ? `${card.title}: jaldi aa raha hai`
      : `${card.title}: ${card.sub}`;
  return (
    <TouchableOpacity onPress={() => onPress(card)} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={a11y} style={{ width, minHeight: px(S.h, u), borderRadius: r }}>
      <LinearGradient
        colors={SHOP_DIGITAL_CAT_GRADS[index % SHOP_DIGITAL_CAT_GRADS.length]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.special, { minHeight: px(S.h, u), borderRadius: r, paddingLeft: px(5, u), paddingRight: px(20, u), paddingVertical: px(6, u), gap: px(5, u) }]}
      >
        <View style={{ width: px(S.artW, u), height: px(S.artH, u) }} pointerEvents="none">
          <TileArt tile={card.tile} width={px(S.artW, u)} height={px(S.artH, u)} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.specialTitle, { fontSize: titleFs, lineHeight: titleFs * 1.15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{card.title}</Text>
          <Text style={[styles.specialSub, { fontSize: subFs, lineHeight: subFs * 1.25 }]} numberOfLines={2}>{card.sub}</Text>
          {card.state === 'price' && card.price !== null ? (
            <View style={[styles.price, { gap: px(3, u), marginTop: px(2, u) }]}>
              <CoinIcon size={px(S.coin, u)} />
              <Text style={[styles.priceText, { fontSize: priceFs, color: WHITE }]} numberOfLines={1}>{`${card.price.toLocaleString()} DP`}</Text>
            </View>
          ) : card.state === 'soon' ? (
            <View style={[styles.soon, { marginTop: px(3, u), height: px(12, u), borderRadius: px(6, u), paddingHorizontal: px(5, u) }]}>
              <Text style={[styles.soonText, { fontSize: mfont(6.5, u) }]} numberOfLines={1}>Jaldi aa raha hai</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.abs, { bottom: px(5, u), right: px(5, u) }]}><ArrowCircle u={u} size={S.arrow} /></View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

export function SpecialCategoryGrid({ cards, u, inner, onPress }: { cards: SpecialCard[]; u: number; inner: number; onPress: (c: SpecialCard) => void }) {
  const S = DIGITAL_M.special;
  const gap = px(S.gap, u);
  const w = cellWidth(inner, S.cols, gap);
  const rows: SpecialCard[][] = [];
  for (let k = 0; k < cards.length; k += S.cols) rows.push(cards.slice(k, k + S.cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, k) => (
        <View key={k} style={[styles.row, { gap, alignItems: 'stretch' }]}>
          {row.map((c, j) => <SpecialCardM key={c.key} card={c} index={k * S.cols + j} u={u} width={w} onPress={onPress} />)}
        </View>
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ Special Collections banner

export function SpecialCollectionsBanner({ p, u, width, onExplore }: { p: TophuntPalette; u: number; width: number; onExplore: () => void }) {
  const B = DIGITAL_M.banner;
  const h = px(B.h, u);
  const r = px(B.radius, u);
  const ctaH = px(B.ctaH, u);
  const ctaFs = mfont(B.cta, u);
  const titleInk = p.isDark ? WHITE : p.text;
  const subInk = p.isDark ? '#EBDDFF' : p.sub;
  const artW = px(B.artW, u);
  const artH = px(B.artH, u);
  return (
    <View style={[{ width, height: h, borderRadius: r }, lavenderShadow(p)]}>
      <LinearGradient
        colors={p.isDark ? SHOP_SPECIAL_GRAD_DARK : SHOP_SPECIAL_GRAD_LIGHT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.banner, { width, height: h, borderRadius: r, paddingLeft: px(12, u), borderColor: p.isDark ? 'rgba(255,255,255,0.1)' : shopBorder(p) }]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: px(3, u) }}>
          <View style={[styles.rowCenter, { gap: px(5, u) }]}>
            <VioletCrownIcon size={px(B.crown, u)} />
            <Text style={[styles.bannerTitle, { fontSize: mfont(B.title, u), color: titleInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">Special Collections</Text>
          </View>
          <Text style={[styles.bannerSub, { fontSize: mfont(B.sub, u), color: subInk }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Limited Edition • Seasonal • Exclusive</Text>
          <TouchableOpacity onPress={onExplore} activeOpacity={0.85} hitSlop={slop(ctaH)} accessibilityRole="button" accessibilityLabel="Explore now: special collections dekho" style={{ alignSelf: 'flex-start', marginTop: px(3, u) }}>
            <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cta, { height: ctaH, borderRadius: ctaH / 2, paddingHorizontal: px(10, u), gap: px(4, u) }]}>
              <Text style={[styles.ctaText, { fontSize: ctaFs }]} numberOfLines={1}>Explore Now</Text>
              <ArrowIcon variant="arrow" direction="right" size={ctaFs} color={WHITE} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={{ width: artW, height: artH, marginRight: px(6, u) }} pointerEvents="none">
          <WingedCrownArt width={artW} height={artH} />
          <View style={[styles.abs, { left: -px(4, u), bottom: px(2, u) }]}><DiamondSparkle size={px(13, u)} /></View>
          <View style={[styles.abs, { right: -px(2, u), top: -px(2, u) }]}><DiamondSparkle size={px(11, u)} /></View>
        </View>
      </LinearGradient>
    </View>
  );
}

// ------------------------------------------------------------------ loading

/** Skeleton of the shelves (store loading). */
export function DigitalHomeSkeleton({ p, u, inner }: { p: TophuntPalette; u: number; inner: number }) {
  const rows = [
    { cols: DIGITAL_M.dark.cols, gap: DIGITAL_M.dark.gap, h: DIGITAL_M.dark.h, r: DIGITAL_M.dark.radius },
    { cols: DIGITAL_M.badge.cols, gap: DIGITAL_M.badge.gap, h: DIGITAL_M.badge.h, r: DIGITAL_M.badge.radius },
    { cols: DIGITAL_M.title.cols, gap: DIGITAL_M.title.gap, h: DIGITAL_M.title.h, r: DIGITAL_M.title.radius },
    { cols: DIGITAL_M.special.cols, gap: DIGITAL_M.special.gap, h: DIGITAL_M.special.h, r: DIGITAL_M.special.radius },
  ];
  return (
    <View accessible accessibilityLabel="Digital items load ho rahe hain">
      {rows.map((row, k) => {
        const gap = px(row.gap, u);
        const w = cellWidth(inner, row.cols, gap);
        return (
          <View key={k} style={{ marginTop: px(MOCK_M.gap, u) }}>
            <View style={{ width: inner * 0.45, height: px(12, u), borderRadius: px(6, u), backgroundColor: p.skeleton }} />
            <View style={[styles.row, { gap, marginTop: px(MOCK_M.head + 4, u) }]}>
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

export interface DigitalHomeProps {
  p: TophuntPalette;
  u: number;
  inner: number;
  now: number;
  viewer: Viewer;
  shelves: Record<ShelfType, StoreItemView[]>;
  specials: SpecialCard[];
  onOpenItem: (id: string) => void;
  /** "View All" of a shelf. */
  onAll: (type: ShelfType) => void;
  onSpecial: (c: SpecialCard) => void;
  onExplore: () => void;
  /** "Sab digital items dekho": the full catalogue. */
  onBrowseAll: () => void;
}

/** The Digital tab body on phones, top to bottom as the design mock (plus Avatar Frames after Premium Themes). */
export function DigitalHomeMobile({ p, u, inner, now, viewer, shelves, specials, onOpenItem, onAll, onSpecial, onExplore, onBrowseAll }: DigitalHomeProps) {
  const icon = px(MOCK_M.section.icon, u);
  const gap = px(MOCK_M.gap, u);
  const head = px(MOCK_M.head, u);
  const darkGap = px(DIGITAL_M.dark.gap, u);
  const darkW = cellWidth(inner, DIGITAL_M.dark.cols, darkGap);
  const badgeGap = px(DIGITAL_M.badge.gap, u);
  const badgeW = cellWidth(inner, DIGITAL_M.badge.cols, badgeGap);
  const titleGap = px(DIGITAL_M.title.gap, u);
  const titleW = cellWidth(inner, DIGITAL_M.title.cols, titleGap);
  const link = p.isDark ? '#A78BFA' : SHOP_VIOLET;
  const linkFs = mfont(10.5, u);
  const darkRow = (items: StoreItemView[]) => (
    <View style={[styles.row, { gap: darkGap, marginTop: head }]}>
      {items.map((i) => <DarkShelfCard key={i.itemId} item={i} now={now} u={u} width={darkW} viewer={viewer} onOpen={onOpenItem} />)}
    </View>
  );
  return (
    <View>
      {shelves.theme.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<FlameIcon size={icon} />} title="Premium Themes" action={{ label: 'View All', onPress: () => onAll('theme') }} />
          {darkRow(shelves.theme)}
        </View>
      ) : null}

      {shelves.frame.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<TileArt tile="frame" width={icon * 1.2} height={icon} />} title="Avatar Frames" action={{ label: 'View All', onPress: () => onAll('frame') }} />
          {darkRow(shelves.frame)}
        </View>
      ) : null}

      {shelves.badge.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<BadgeIcon size={icon} />} title="Badges Collection" action={{ label: 'View All', onPress: () => onAll('badge') }} />
          <View style={[styles.row, { gap: badgeGap, marginTop: head }]}>
            {shelves.badge.map((i) => <BadgeShelfCard key={i.itemId} p={p} item={i} now={now} u={u} width={badgeW} onOpen={onOpenItem} />)}
          </View>
        </View>
      ) : null}

      {shelves.title.length ? (
        <View style={{ marginTop: gap }}>
          <SectionHeaderM p={p} u={u} icon={<TrophyIcon size={icon} />} title="Titles Collection" action={{ label: 'View All', onPress: () => onAll('title') }} />
          <View style={[styles.row, { gap: titleGap, marginTop: head }]}>
            {shelves.title.map((i) => <TitleShelfCard key={i.itemId} p={p} item={i} u={u} width={titleW} onOpen={onOpenItem} />)}
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: gap + px(2, u) }}>
        <SpecialCategoryGrid cards={specials} u={u} inner={inner} onPress={onSpecial} />
      </View>

      <View style={{ marginTop: gap }}>
        <SpecialCollectionsBanner p={p} u={u} width={inner} onExplore={onExplore} />
      </View>

      <TouchableOpacity onPress={onBrowseAll} hitSlop={slop(linkFs * 1.3)} accessibilityRole="button" accessibilityLabel="Sab digital items dekho" style={[styles.rowCenter, styles.browse, { marginTop: gap + px(2, u), gap: px(3, u) }]}>
        <Text style={[styles.link, { fontSize: linkFs, color: link }]}>Sab digital items dekho</Text>
        <ArrowIcon variant="arrow" direction="right" size={linkFs} color={link} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  row: { flexDirection: 'row' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  col: { flex: 1, alignSelf: 'stretch', alignItems: 'center' },
  darkCard: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  lightCard: { borderWidth: 1, overflow: 'hidden' },
  tag: { justifyContent: 'center', alignSelf: 'center' },
  tagText: { fontFamily: TH.fonts.bold },
  darkName: { color: '#FFF', fontFamily: TH.fonts.bold },
  cardName: { fontFamily: TH.fonts.bold, textAlign: 'center', alignSelf: 'stretch' },
  foot: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pricePill: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  price: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  priceText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  special: { flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  specialTitle: { color: '#FFF', fontFamily: TH.fonts.bold },
  specialSub: { color: '#EBDDFF', fontFamily: TH.fonts.medium, marginTop: 1 },
  soon: { alignSelf: 'flex-start', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  soonText: { color: '#FFF', fontFamily: TH.fonts.bold },
  banner: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  bannerTitle: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  bannerSub: { fontFamily: TH.fonts.medium },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFF', fontFamily: TH.fonts.bold },
  browse: { alignSelf: 'center', justifyContent: 'center' },
  link: { fontFamily: TH.fonts.bold },
});
