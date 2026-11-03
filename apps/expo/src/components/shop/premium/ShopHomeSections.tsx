/**
 * Building blocks of the Shop home in the reference layout: section titles,
 * the category tile grid (with "Jaldi" tiles), featured / trending cards with
 * the wishlist heart, the physical products block, the Hot Deals card, the My
 * Collection tiles and the bottom quick-actions bar. Everything is static
 * (no per-tile animation); the glow is a shadow, not a loop.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import type { CardTag, CategoryTile, CollectionTile } from '@/src/lib/shopModel';
import { TH, glowShadow, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import type { ShopProduct } from '@/src/services/shop';
import { ProductPreview } from './ProductPreview';
import { WishlistHeart } from './WishlistHeart';

/** Bordered glow card surface. */
export const glowCard = (p: TophuntPalette, accent?: string) => [
  styles.glowCard,
  { backgroundColor: p.card, borderColor: accent ? `${accent}${p.isDark ? '88' : '66'}` : p.glowBorder },
  glowShadow(accent ?? p.glowShadow, p.isDark),
];

export function SectionTitle({
  p, pad, icon, iconColor, title, action,
}: { p: TophuntPalette; pad: number; icon: string; iconColor?: string; title: string; action?: { label: string; onPress: () => void } }) {
  const link = p.isDark ? TH.colors.lilac : TH.colors.royal;
  return (
    <View style={[styles.head, { paddingHorizontal: pad }]}>
      <Ionicons name={icon} size={18} color={iconColor ?? p.gold} />
      <Text style={[styles.headTitle, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={styles.headAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${action.label}: ${title}`}>
          <Text style={[styles.headActionText, { color: link }]}>{action.label}</Text>
          <ArrowIcon variant="arrow" direction="right" size={11} color={link} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** "Shop Categories": square-ish tiles; "Jaldi" tiles are dimmed and not tappable. */
export function CategoryTileGrid({
  p, tiles, tileW, gap, pad, onPick,
}: { p: TophuntPalette; tiles: CategoryTile[]; tileW: number; gap: number; pad: number; onPick: (t: CategoryTile) => void }) {
  const small = tileW < 70;
  return (
    <View style={[styles.wrapRow, { gap, paddingHorizontal: pad }]}>
      {tiles.map((t) => {
        const off = t.target === null;
        return (
          <TouchableOpacity
            key={t.key}
            disabled={off}
            onPress={() => onPick(t)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: off }}
            accessibilityLabel={off ? `${t.label} jaldi aa raha hai` : `${t.label} dekho`}
            style={[glowCard(p, off ? undefined : t.accent), styles.tile, { width: tileW, height: small ? Math.round(tileW * 1.12) : Math.min(Math.round(tileW * 0.92), 108) }, off && styles.tileOff]}
          >
            <View style={[styles.tileIcon, small && styles.tileIconSm, { backgroundColor: `${t.accent}26`, borderColor: `${t.accent}66` }]}>
              <Ionicons name={t.icon} size={small ? 16 : 22} color={t.accent} />
            </View>
            <Text style={[styles.tileLabel, small && { fontSize: 10 }, { color: p.text }]} numberOfLines={2}>{t.label}</Text>
            {off ? (
              <View style={[styles.soon, { backgroundColor: p.cardAlt }]}>
                <Text style={[styles.soonText, { color: p.sub }]}>Jaldi</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TagPill({ tag }: { tag: CardTag }) {
  if (tag.kind === 'rarity') {
    const t = rarityToken(tag.rarity);
    return (
      <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tag}>
        <Text style={[styles.tagText, { color: t.ink }]}>{tag.label}</Text>
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.tag, { backgroundColor: tag.kind === 'new' ? TH.colors.success : TH.colors.pink }]}>
      <Text style={[styles.tagText, { color: '#FFF' }]}>{tag.label}</Text>
    </View>
  );
}

function Price({ p, item, size = 14 }: { p: TophuntPalette; item: StoreItemView; size?: number }) {
  if (item.owned) {
    return (
      <View style={styles.price}>
        <Ionicons name="checkmark-circle" size={size} color={TH.colors.success} />
        <Text style={[styles.priceText, { color: TH.colors.success, fontSize: size - 1 }]}>Owned</Text>
      </View>
    );
  }
  return (
    <View style={styles.price}>
      <CoinIcon size={size} />
      <Text style={[styles.priceText, { color: p.gold, fontSize: size }]} numberOfLines={1}>{item.priceCoins.toLocaleString()} DP</Text>
    </View>
  );
}

/** Tall card of "Featured Collection": corner tag, artwork, name, price, heart. */
export const FeatureCard = React.memo(function FeatureCard({
  p, item, tag, width, viewer, onOpen,
}: { p: TophuntPalette; item: StoreItemView; tag: CardTag; width: number; viewer: Viewer; onOpen: () => void }) {
  const t = rarityToken(item.rarity);
  const art = width - 12;
  return (
    <View style={[glowCard(p, t.glow ? t.color : undefined), styles.card, { width }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.name}, ${tag.label}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin`}. Details kholo`}>
        <View>
          <ProductPreview item={item} viewer={viewer} width={art} height={Math.round(art * 1.05)} radius={TH.radii.md} shimmer={false} />
          <View style={styles.cornerTag} pointerEvents="none"><TagPill tag={tag} /></View>
        </View>
        <Text style={[styles.cardName, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
      </Pressable>
      <View style={styles.cardFoot}>
        <Price p={p} item={item} />
        <View style={{ flex: 1 }} />
        <WishlistHeart itemId={item.itemId} name={item.name} size={14} color={p.isDark ? '#FFF' : p.text} />
      </View>
    </View>
  );
});

/** Compact card of "Trending Items". */
export const TrendCard = React.memo(function TrendCard({
  p, item, width, viewer, onOpen,
}: { p: TophuntPalette; item: StoreItemView; width: number; viewer: Viewer; onOpen: () => void }) {
  const art = width - 10;
  return (
    <View style={[glowCard(p), styles.card, styles.cardSm, { width }]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.owned ? 'owned' : `${item.priceCoins} DP coin`}. Details kholo`}>
        <ProductPreview item={item} viewer={viewer} width={art} height={Math.round(art * 0.82)} radius={TH.radii.sm} shimmer={false} />
        <Text style={[styles.cardName, { color: p.text, fontSize: 12.5 }]} numberOfLines={1}>{item.name}</Text>
      </Pressable>
      <View style={styles.cardFoot}>
        <Price p={p} item={item} size={12} />
        <View style={{ flex: 1 }} />
        <WishlistHeart itemId={item.itemId} name={item.name} size={12} color={p.isDark ? '#FFF' : p.text} />
      </View>
    </View>
  );
});

export function PhysicalCard({ p, product, width, onPress }: { p: TophuntPalette; product: ShopProduct; width: number; onPress: () => void }) {
  const inStock = product.variants.some((v) => v.inStock);
  const img = product.images[0];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${product.priceCoins} DP coin${inStock ? '' : ', out of stock'}`}
      style={[glowCard(p), styles.card, styles.cardSm, { width }]}
    >
      <View style={[styles.physImg, { height: width - 10, backgroundColor: p.cardAlt }]}>
        {img ? <AppImage source={{ uri: img }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="cube" size={26} color={p.sub} />}
        {!inStock ? (
          <View style={styles.oos}><Text style={styles.oosText}>Out of stock</Text></View>
        ) : null}
      </View>
      <Text style={[styles.cardName, { color: p.text, fontSize: 12.5 }]} numberOfLines={1}>{product.title}</Text>
      <View style={[styles.price, { paddingHorizontal: 4, paddingBottom: 4, marginTop: 2 }]}>
        <CoinIcon size={12} />
        <Text style={[styles.priceText, { color: p.gold, fontSize: 12 }]} numberOfLines={1}>{product.priceCoins.toLocaleString()} DP</Text>
      </View>
    </TouchableOpacity>
  );
}

/** "Hot Deals": an admin-featured, in-stock product. No timer, no discount claim. */
export function HotDealsCard({ p, product, onGrab, style }: { p: TophuntPalette; product: ShopProduct; onGrab: () => void; style?: any }) {
  const img = product.images[0];
  return (
    <LinearGradient colors={p.isDark ? ['#3B0A4E', '#1A0F3D'] : ['#FFF1F8', '#F3EEFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[glowCard(p, TH.colors.pink), styles.deals, style]}>
      <View style={styles.dealsHead}>
        <Ionicons name="flame" size={18} color={TH.colors.pink} />
        <Text style={[styles.headTitle, { color: p.text }]} accessibilityRole="header">Hot Deals</Text>
      </View>
      <View style={styles.dealsBody}>
        <View style={[styles.dealsImg, { backgroundColor: p.cardAlt }]}>
          {img ? <AppImage source={{ uri: img }} displayWidth={110} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : <Ionicons name="gift" size={34} color={TH.colors.gold} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={[styles.dealsKicker, { color: p.isDark ? '#F9A8D4' : '#BE185D' }]}>Featured product</Text>
          <Text style={[styles.cardName, { color: p.text, paddingHorizontal: 0, marginTop: 0, fontSize: 15 }]} numberOfLines={2}>{product.title}</Text>
          <View style={styles.price}>
            <CoinIcon size={14} />
            <Text style={[styles.priceText, { color: p.gold }]}>{product.priceCoins.toLocaleString()} DP</Text>
          </View>
          <TouchableOpacity onPress={onGrab} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Grab now: ${product.title}`} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <LinearGradient colors={TH.gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.grab}>
              <Text style={styles.grabText}>Grab Now</Text>
              <ArrowIcon variant="arrow" direction="right" size={11} color="#2A1A00" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

export function CollectionTileView({ p, tile, width, onPress }: { p: TophuntPalette; tile: CollectionTile; width: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${tile.label}: ${tile.count} owned. Collection kholo`}
      style={[glowCard(p, tile.accent), styles.colTile, { width }]}
    >
      <Ionicons name={tile.icon} size={20} color={tile.accent} />
      <Text style={[styles.colLabel, { color: p.text }]} numberOfLines={1}>{tile.label}</Text>
      <Text style={[styles.colCount, { color: p.sub }]}>({tile.count})</Text>
    </TouchableOpacity>
  );
}

export interface QuickAction {
  key: string;
  icon: string;
  title: string;
  sub: string;
  accent: string;
  onPress: () => void;
}

export function QuickActionsBar({ p, actions, pad, wide }: { p: TophuntPalette; actions: QuickAction[]; pad: number; wide: boolean }) {
  return (
    <View style={{ paddingHorizontal: pad, marginTop: 26 }}>
      <View style={[glowCard(p), styles.qa, !wide && styles.qaWrap]}>
        {actions.map((a, i) => (
          <TouchableOpacity
            key={a.key}
            onPress={a.onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${a.title}: ${a.sub}`}
            style={[styles.qaItem, wide ? { flex: 1 } : { width: '50%' }, wide && i > 0 && { borderLeftWidth: 1, borderLeftColor: p.border }]}
          >
            <View style={[styles.qaIcon, { backgroundColor: `${a.accent}22`, borderColor: `${a.accent}66` }]}>
              <Ionicons name={a.icon} size={18} color={a.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.qaTitle, { color: p.text }]} numberOfLines={1}>{a.title}</Text>
              <Text style={[styles.qaSub, { color: p.sub }]} numberOfLines={1}>{a.sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glowCard: { borderWidth: 1, borderRadius: TH.radii.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 24, marginBottom: 12 },
  headTitle: { fontFamily: TH.fonts.bold, fontSize: 18, letterSpacing: 0.1 },
  headAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headActionText: { fontFamily: TH.fonts.bold, fontSize: 12.5 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 3, paddingVertical: 6 },
  tileOff: { opacity: 0.45 },
  tileIcon: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tileIconSm: { width: 30, height: 30, borderRadius: 10 },
  tileLabel: { fontFamily: TH.fonts.bold, fontSize: 12, textAlign: 'center', lineHeight: 13 },
  soon: { position: 'absolute', top: 3, right: 3, borderRadius: TH.radii.pill, paddingHorizontal: 4, paddingVertical: 1 },
  soonText: { fontFamily: TH.fonts.bold, fontSize: 7.5, letterSpacing: 0.3 },
  card: { padding: 6, borderRadius: TH.radii.lg },
  cardSm: { padding: 5, borderRadius: TH.radii.md },
  cornerTag: { position: 'absolute', top: 6, left: 6 },
  tag: { borderRadius: TH.radii.pill, paddingHorizontal: 7, paddingVertical: 2.5 },
  tagText: { fontFamily: TH.fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  cardName: { fontFamily: TH.fonts.bold, fontSize: 13.5, marginTop: 7, paddingHorizontal: 4 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2, gap: 4 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  priceText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  physImg: { borderRadius: TH.radii.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  oos: { position: 'absolute', bottom: 4, left: 4, borderRadius: TH.radii.pill, backgroundColor: 'rgba(11,6,32,0.78)', paddingHorizontal: 6, paddingVertical: 2 },
  oosText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 9 },
  deals: { padding: 14, borderRadius: TH.radii.lg, overflow: 'hidden' },
  dealsHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dealsBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  dealsImg: { width: 96, height: 96, borderRadius: TH.radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dealsKicker: { fontFamily: TH.fonts.bold, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  grab: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 14, borderRadius: TH.radii.pill },
  grabText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 13 },
  colTile: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 4 },
  colLabel: { fontFamily: TH.fonts.bold, fontSize: 11.5 },
  colCount: { fontFamily: TH.fonts.semibold, fontSize: 11 },
  qa: { flexDirection: 'row', borderRadius: TH.radii.lg, paddingVertical: 6 },
  qaWrap: { flexWrap: 'wrap' },
  qaItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  qaIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qaTitle: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  qaSub: { fontFamily: TH.fonts.medium, fontSize: 11 },
});
