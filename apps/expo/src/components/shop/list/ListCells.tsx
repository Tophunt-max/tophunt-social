/**
 * Cells and banners of the Shop "View All" pages (ShopListScreen): the
 * premium item card with stable callbacks, the ranked trending row, the
 * category tile, the deal item card and the page banner.
 *
 * Everything shown is real data: price, compare-at discount, rarity, owned,
 * a sale countdown only for a real future end. Units sold are used for the
 * trending order but never displayed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { DigitalItemCard } from '@/src/components/shop/premium/DigitalItemCard';
import { DiscountTag } from '@/src/components/shop/premium/DiscountTag';
import { ProductPreview } from '@/src/components/shop/premium/ProductPreview';
import { SparkleField, TileArt } from '@/src/components/shop/premium/ShopArt';
import { ArtStage, cardShadow } from '@/src/components/shop/premium/surface';
import { Ionicons } from '@/src/lib/icons';
import { rankMedal } from '@/src/lib/shopListModel';
import { TYPE_SINGULAR, dealTimerLabel, type TileKey } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { BRAND, BRAND_BUTTON, SHOP_HERO_GRAD, TH, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';

const WHITE = TH.colors.white;

/** Item card for a grid cell: DigitalItemCard with callbacks bound to the item, so the memo holds. */
export const ItemCell = React.memo(function ItemCell({
  item, width, p, viewer, busy, short, onOpen, onBuy,
}: {
  item: StoreItemView;
  width: number;
  p: TophuntPalette;
  viewer: Viewer;
  busy: boolean;
  short: boolean;
  onOpen: (id: string) => void;
  onBuy: (item: StoreItemView) => void;
}) {
  const open = useCallback(() => onOpen(item.itemId), [onOpen, item.itemId]);
  const buy = useCallback(() => onBuy(item), [onBuy, item]);
  return <DigitalItemCard item={item} width={width} p={p} viewer={viewer} busy={busy} short={short} onOpen={open} onBuy={buy} />;
});

// ------------------------------------------------------------------ trending row

const MEDAL: Record<'gold' | 'silver' | 'bronze', { colors: [string, string]; ink: string }> = {
  gold: { colors: ['#FFE08A', '#F5B935'], ink: '#2A1A00' },
  silver: { colors: ['#E7EAF0', '#AEB6C2'], ink: '#1F2430' },
  bronze: { colors: ['#F0B27A', '#C7783A'], ink: '#2A1405' },
};

function RankBadge({ rank, p }: { rank: number; p: TophuntPalette }) {
  const medal = rankMedal(rank);
  if (medal) {
    const m = MEDAL[medal];
    return (
      <LinearGradient colors={m.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rank} accessible accessibilityLabel={`Rank ${rank}`}>
        <Text style={[styles.rankText, { color: m.ink }]}>#{rank}</Text>
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.rank, { backgroundColor: p.cardAlt, borderWidth: 1, borderColor: p.border }]} accessible accessibilityLabel={`Rank ${rank}`}>
      <Text style={[styles.rankText, { color: p.sub }]}>#{rank}</Text>
    </View>
  );
}

/** One horizontal row: rank (optional), art, name, "type · rarity", price (with real discount), Buy / Owned. */
export const TrendRow = React.memo(function TrendRow({
  item, rank, width, p, viewer, busy, short, onOpen, onBuy,
}: {
  item: StoreItemView;
  /** null: no rank shown (the "Shop Items" fallback). */
  rank: number | null;
  width: number;
  p: TophuntPalette;
  viewer: Viewer;
  busy: boolean;
  short: boolean;
  onOpen: (id: string) => void;
  onBuy: (item: StoreItemView) => void;
}) {
  const t = rarityToken(item.rarity);
  const typeLabel = TYPE_SINGULAR[item.type] ?? item.type;
  const art = 64;
  return (
    <View style={[styles.row, { width, backgroundColor: p.card, borderColor: t.glow ? `${t.color}${p.isDark ? '55' : '44'}` : p.border }, cardShadow(p)]}>
      <Pressable
        onPress={() => onOpen(item.itemId)}
        style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.9 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={`${rank ? `Rank ${rank}, ` : ''}${item.name}, ${t.label} ${typeLabel}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin`}. Details kholo`}
      >
        {rank ? <RankBadge rank={rank} p={p} /> : null}
        <ArtStage width={art} height={art} radius={TH.radii.sm}>
          <ProductPreview item={item} viewer={viewer} width={art} height={art} radius={TH.radii.sm} bare />
        </ArtStage>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={[styles.rowName, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.rowSub, { color: p.sub }]} numberOfLines={1}>{`${typeLabel} · `}<Text style={{ color: t.color }}>{t.label}</Text></Text>
          {item.owned ? null : (
            <View style={styles.rowPrice}>
              <CoinIcon size={20} />
              <Text style={[styles.rowPriceText, { color: p.text }]}>{item.priceCoins.toLocaleString()}</Text>
              <DiscountTag item={item} size={10.5} color={p.sub} />
            </View>
          )}
        </View>
      </Pressable>
      {item.owned ? (
        <View style={styles.ownedTag}>
          <Ionicons name="checkmark-circle" size={15} color={TH.colors.success} />
          <Text style={styles.ownedText}>Owned</Text>
        </View>
      ) : (
        <BuyButton p={p} name={item.name} price={item.priceCoins} busy={busy} short={short} onPress={() => onBuy(item)} />
      )}
    </View>
  );
});

function BuyButton({ p, name, price, busy, short, onPress }: { p: TophuntPalette; name: string; price: number; busy: boolean; short: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      accessibilityLabel={short ? `${name}: DP coin kam hai. Details dekho` : `${name} kharido, ${price} DP coin`}
    >
      <LinearGradient colors={short ? [p.cardAlt, p.cardAlt] : BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.buy, busy && { opacity: 0.6 }]}>
        <Ionicons name={short ? 'lock-closed' : 'flash'} size={12} color={short ? p.sub : WHITE} />
        <Text style={[styles.buyText, { color: short ? p.sub : WHITE }]}>Buy</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ------------------------------------------------------------------ deal item

/** The premium card with the deal strip under it: "-X% OFF" and the real sale countdown (when there is an end). */
export const DealItemCell = React.memo(function DealItemCell({
  item, percent, endsAt, width, p, viewer, busy, short, onOpen, onBuy,
}: {
  item: StoreItemView;
  percent: number;
  endsAt: number | null;
  width: number;
  p: TophuntPalette;
  viewer: Viewer;
  busy: boolean;
  short: boolean;
  onOpen: (id: string) => void;
  onBuy: (item: StoreItemView) => void;
}) {
  return (
    <View style={{ width }}>
      <ItemCell item={item} width={width} p={p} viewer={viewer} busy={busy} short={short} onOpen={onOpen} onBuy={onBuy} />
      <View style={[styles.dealStrip, { backgroundColor: `${BRAND}14`, borderColor: `${BRAND}33` }]}>
        <Ionicons name="pricetag-outline" size={12} color={BRAND} />
        <Text style={[styles.dealPct, { color: BRAND }]} accessibilityLabel={`${percent}% off`}>{`${percent}% OFF`}</Text>
        <View style={{ flex: 1 }} />
        {endsAt ? <TimeLeft endsAt={endsAt} color={p.sub} /> : null}
      </View>
    </View>
  );
});

// ------------------------------------------------------------------ category tile

/** One category of the All Categories page: tile art, name, real count (or "Jaldi aa raha hai"). */
export const CategoryCell = React.memo(function CategoryCell({
  tileKey, label, count, soon, width, p, onPress,
}: { tileKey: TileKey; label: string; count: number | null; soon: boolean; width: number; p: TophuntPalette; onPress: () => void }) {
  const art = Math.round(width * 0.46);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={soon ? `${label}: jaldi aa raha hai` : `${label}${count != null ? `, ${count} items` : ''}. Dekho`}
      style={[styles.cat, { width, backgroundColor: p.card, borderColor: p.border, opacity: soon ? 0.78 : 1 }, cardShadow(p)]}
    >
      <View style={[styles.catArt, { height: art + 16 }]}>
        <TileArt tile={tileKey} width={art} height={art} />
      </View>
      <Text style={[styles.catName, { color: p.text }]} numberOfLines={1}>{label}</Text>
      {soon ? (
        <View style={[styles.soon, { backgroundColor: p.cardAlt }]}>
          <Text style={[styles.soonText, { color: p.sub }]}>Jaldi aa raha hai</Text>
        </View>
      ) : (
        <View style={styles.catFoot}>
          <Text style={[styles.catCount, { color: p.sub }]} numberOfLines={1}>{count != null ? `${count.toLocaleString()} ${count === 1 ? 'item' : 'items'}` : 'Dekho'}</Text>
          <ArrowIcon variant="arrow" direction="right" size={13} color={BRAND} />
        </View>
      )}
    </TouchableOpacity>
  );
});

// ------------------------------------------------------------------ banner

/**
 * The page banner: a gradient, art on the left, an optional badge, title,
 * subtitle and a real count line; `right` for a countdown pill.
 */
export function ListBanner({
  art, badge, title, sub, count, colors = SHOP_HERO_GRAD, right,
}: { art?: React.ReactNode; badge?: string; title: string; sub?: string; count?: string; colors?: readonly [string, string, ...string[]]; right?: React.ReactNode }) {
  return (
    <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><SparkleField width={360} height={120} /></View>
      {art ? <View style={styles.bannerArt} pointerEvents="none">{art}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        {badge ? (
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText} numberOfLines={1}>{badge.toUpperCase()}</Text>
          </View>
        ) : null}
        <Text style={styles.bannerTitle} numberOfLines={2} accessibilityRole="header">{title}</Text>
        {sub ? <Text style={styles.bannerSub} numberOfLines={2}>{sub}</Text> : null}
        {count || right ? (
          <View style={styles.bannerFoot}>
            {count ? <Text style={styles.bannerCount}>{count}</Text> : null}
            {right}
          </View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

/** Wall clock for one countdown: every second when the end is ≤ 7 days away, else every minute. */
function useCountdownNow(endsAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const near = endsAt - now <= 7 * 86_400_000;
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), near ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [near, endsAt]);
  return now;
}

/** "⏱ 12:36:59" for a real future sale end; nothing once it has passed. */
function TimeLeft({ endsAt, color }: { endsAt: number; color: string }) {
  const label = dealTimerLabel(endsAt, useCountdownNow(endsAt));
  if (!label) return null;
  return (
    <View style={styles.timeLeft} accessible accessibilityLabel={`Sale ${label} mein khatam`}>
      <Ionicons name="time-outline" size={12} color={color} />
      <Text style={[styles.dealTime, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Small countdown pill for a banner (real future end only). */
export function BannerTimer({ endsAt }: { endsAt: number }) {
  const label = dealTimerLabel(endsAt, useCountdownNow(endsAt));
  if (!label) return null;
  return (
    <View style={styles.timer} accessible accessibilityLabel={`${label} mein khatam`}>
      <Ionicons name="time" size={11} color={WHITE} />
      <Text style={styles.timerText}>{label}</Text>
    </View>
  );
}

/** A section heading inside a list footer / header (Deals: "Products par deals"). */
export function ListSectionTitle({ p, title, sub }: { p: TophuntPalette; title: string; sub?: string }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: p.text }]} accessibilityRole="header">{title}</Text>
      {sub ? <Text style={[styles.sectionSub, { color: p.sub }]}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: TH.radii.lg, borderWidth: 1, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, gap: 10 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  rank: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: TH.fonts.bold, fontSize: 12.5 },
  rowName: { fontFamily: TH.fonts.bold, fontSize: 15 },
  rowSub: { fontFamily: TH.fonts.medium, fontSize: 12 },
  rowPrice: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowPriceText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  ownedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  ownedText: { color: TH.colors.success, fontFamily: TH.fonts.bold, fontSize: 13 },
  buy: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 14, borderRadius: TH.radii.pill },
  buyText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  dealStrip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 10, height: 28 },
  dealPct: { fontFamily: TH.fonts.bold, fontSize: 11.5 },
  timeLeft: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  dealTime: { fontFamily: TH.fonts.semibold, fontSize: 11, fontVariant: ['tabular-nums'], flexShrink: 1 },
  cat: { borderRadius: TH.radii.lg, borderWidth: 1, padding: 12, gap: 6 },
  catArt: { alignItems: 'center', justifyContent: 'center' },
  catName: { fontFamily: TH.fonts.bold, fontSize: 15 },
  catFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  catCount: { fontFamily: TH.fonts.semibold, fontSize: 12.5, flexShrink: 1 },
  soon: { alignSelf: 'flex-start', borderRadius: TH.radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  soonText: { fontFamily: TH.fonts.bold, fontSize: 10.5 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: TH.radii.xl, padding: 16, overflow: 'hidden', minHeight: 112 },
  bannerArt: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  bannerBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: TH.radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  bannerBadgeText: { color: WHITE, fontFamily: TH.fonts.bold, fontSize: 9.5, letterSpacing: 0.8 },
  bannerTitle: { color: WHITE, fontFamily: TH.fonts.bold, fontSize: 21 },
  bannerSub: { color: '#EBDDFF', fontFamily: TH.fonts.medium, fontSize: 13, lineHeight: 18 },
  bannerFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  bannerCount: { color: WHITE, fontFamily: TH.fonts.bold, fontSize: 12.5, opacity: 0.92 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(120,8,62,0.55)', borderRadius: TH.radii.pill, paddingHorizontal: 8, height: 22 },
  timerText: { color: WHITE, fontFamily: TH.fonts.bold, fontSize: 11, fontVariant: ['tabular-nums'] },
  section: { marginTop: 24, marginBottom: 12, gap: 2 },
  sectionTitle: { fontFamily: TH.fonts.bold, fontSize: 18 },
  sectionSub: { fontFamily: TH.fonts.medium, fontSize: 12.5 },
});
