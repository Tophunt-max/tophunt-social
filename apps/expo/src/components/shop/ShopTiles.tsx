/**
 * Tiles for the Shop screen (store layout v3): soft rounded stages, the price
 * on its own row and a round gradient action button, plus wide carousel cards
 * for the Spotlight (digital) and Hot deals (physical) rails.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons, MaterialCommunityIcons } from '@/src/lib/icons';
import { ScaleTouchable } from '@/src/components/explore/ScaleTouchable';
import { BRAND_GRAD, GOLD, type ExplorePalette } from '@/src/components/explore/theme';
import { assetColors, rarityColor, rarityLabel } from '@/src/lib/progression';
import { timeLeftLabel } from '@/src/lib/shareCaptions';
import type { StoreItemView } from '@/src/services/monetization';
import { DIGITAL_TYPE_LABEL, ItemStage, VOTE_GRAD, type Viewer } from './DigitalItemCard';

export interface ShopProduct {
  id: string;
  title: string;
  images: string[];
  priceCoins: number;
  featured: boolean;
  category: string;
  variants: { inStock: boolean }[];
}

/** Round action button: gradient when it can act, muted with a lock when not. */
function RoundAction({ icon, onPress, busy, locked, owned, p, label, size = 36 }: {
  icon: string; onPress?: () => void; busy?: boolean; locked?: boolean; owned?: boolean; p: ExplorePalette; label: string; size?: number;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (owned) {
    return (
      <View style={[styles.round, box, { backgroundColor: 'rgba(34,165,89,0.15)' }]} accessible accessibilityLabel={label}>
        <Ionicons name="checkmark" size={size * 0.46} color="#22A559" />
      </View>
    );
  }
  if (locked) {
    return (
      <View style={[styles.round, box, { backgroundColor: p.chip }]} accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={label}>
        <Ionicons name="lock-closed" size={size * 0.4} color={p.sub} />
      </View>
    );
  }
  const inner = busy ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name={icon} size={size * 0.46} color="#FFF" />;
  if (!onPress) {
    return <LinearGradient colors={VOTE_GRAD} style={[styles.round, box, styles.roundGlow]}>{inner}</LinearGradient>;
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} activeOpacity={0.85}>
      <LinearGradient colors={VOTE_GRAD} style={[styles.round, box, styles.roundGlow]}>{inner}</LinearGradient>
    </TouchableOpacity>
  );
}

function Price({ coins, p, size = 15 }: { coins: number; p: ExplorePalette; size?: number }) {
  return (
    <View style={styles.price}>
      <CoinIcon size={size} />
      <Text style={[styles.priceText, { color: p.text, fontSize: size + 1 }]}>{coins.toLocaleString()}</Text>
    </View>
  );
}

/** Grid tile for a digital item. */
export const DigitalTile = React.memo(function DigitalTile({
  item, width, p, viewer, busy, affordable, onBuy,
}: { item: StoreItemView; width: number; p: ExplorePalette; viewer: Viewer; busy: boolean; affordable: boolean; onBuy: () => void }) {
  const [c0, c1] = assetColors(item.asset);
  const rc = rarityColor(item.rarity);
  const stageW = width - 12;
  const stageH = Math.round(stageW * 0.92);
  const left = item.owned ? null : timeLeftLabel(item.endsAt);
  const lowStock = item.remaining !== null && item.remaining <= 5;
  return (
    <View style={[styles.tile, { width, backgroundColor: p.card, borderColor: p.border }]}>
      <LinearGradient
        colors={[`${c0}${p.isDark ? '50' : '2E'}`, `${c1}${p.isDark ? '70' : '4D'}`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.stage, { width: stageW, height: stageH }]}
      >
        <ItemStage item={item} w={stageW} h={stageH} viewer={viewer} />
        <View style={[styles.rarity, { backgroundColor: p.isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)' }]}>
          {item.rarity === 'legendary' ? <MaterialCommunityIcons name="crown" size={10} color={rc} /> : <View style={[styles.rarityDot, { backgroundColor: rc }]} />}
          <Text style={[styles.rarityText, { color: rc }]}>{rarityLabel(item.rarity)}</Text>
        </View>
        {left || lowStock ? (
          <View style={styles.urgent}>
            <Ionicons name={left ? 'time' : 'flame'} size={10} color="#FFF" />
            <Text style={styles.urgentText}>{left ?? `${item.remaining} left`}</Text>
          </View>
        ) : null}
      </LinearGradient>
      <View style={styles.tileBody}>
        <Text style={[styles.tileName, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.tileType, { color: p.sub }]} numberOfLines={1}>{DIGITAL_TYPE_LABEL[item.type] ?? item.type}</Text>
        <View style={styles.tileFoot}>
          {item.owned ? <Text style={styles.ownedText}>Owned</Text> : <Price coins={item.priceCoins} p={p} />}
          <View style={{ flex: 1 }} />
          <RoundAction
            p={p}
            icon="add"
            owned={item.owned}
            locked={!item.owned && !affordable}
            busy={busy}
            onPress={onBuy}
            label={item.owned ? `${item.name}, owned` : affordable ? `Buy ${item.name} for ${item.priceCoins} DP coin` : `${item.name} costs ${item.priceCoins} DP coin. Not enough DP coin`}
          />
        </View>
      </View>
    </View>
  );
});

/** Wide carousel card for a spotlight digital item. */
export function SpotlightCard({
  item, width, p, viewer, busy, affordable, onBuy,
}: { item: StoreItemView; width: number; p: ExplorePalette; viewer: Viewer; busy: boolean; affordable: boolean; onBuy: () => void }) {
  const [c0, c1] = assetColors(item.asset);
  const rc = rarityColor(item.rarity);
  const stage = Math.round(width * 0.42);
  return (
    <LinearGradient colors={[c0, c1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.spot, { width }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,8,25,0.55)' }]} />
      <View style={styles.spotBlobA} />
      <View style={styles.spotBlobB} />
      <View style={[styles.spotStage, { width: stage, height: stage }]}>
        <ItemStage item={item} w={stage} h={stage} viewer={viewer} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[styles.spotTag, { borderColor: `${rc}AA` }]}>
          <Ionicons name="sparkles" size={10} color={rc} />
          <Text style={[styles.spotTagText, { color: rc }]}>{rarityLabel(item.rarity).toUpperCase()}</Text>
        </View>
        <Text style={styles.spotName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.spotType} numberOfLines={1}>{DIGITAL_TYPE_LABEL[item.type] ?? item.type}</Text>
        <View style={styles.spotFoot}>
          <View style={styles.price}>
            <CoinIcon size={15} />
            <Text style={[styles.priceText, { color: '#FFF', fontSize: 16 }]}>{item.priceCoins.toLocaleString()}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <RoundAction
            p={{ ...p, chip: 'rgba(255,255,255,0.18)', sub: '#E5E1F5' }}
            icon="flash"
            size={38}
            owned={item.owned}
            locked={!item.owned && !affordable}
            busy={busy}
            onPress={onBuy}
            label={affordable ? `Buy ${item.name} for ${item.priceCoins} DP coin` : `${item.name} costs ${item.priceCoins} DP coin. Not enough DP coin`}
          />
        </View>
      </View>
    </LinearGradient>
  );
}

/** Grid tile for a physical product. */
export const ProductTile = React.memo(function ProductTile({
  item, width, p, canAfford, onPress,
}: { item: ShopProduct; width: number; p: ExplorePalette; canAfford: boolean; onPress: () => void }) {
  const inStock = item.variants.some((v) => v.inStock);
  const imgW = width - 12;
  return (
    <ScaleTouchable
      style={[styles.tile, { width, backgroundColor: p.card, borderColor: p.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.priceCoins} DP coin${inStock ? '' : ', out of stock'}`}
    >
      <View style={[styles.stage, { width: imgW, height: imgW, backgroundColor: p.chip }]}>
        {item.images[0] ? (
          <AppImage source={{ uri: item.images[0] }} displayWidth={imgW} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
            <Ionicons name="gift" size={30} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        )}
        {item.featured ? (
          <View style={[styles.urgent, { left: 8, right: undefined, top: 8, bottom: undefined }]}>
            <Ionicons name="flame" size={10} color="#FFF" />
            <Text style={styles.urgentText}>HOT</Text>
          </View>
        ) : null}
        {!inStock ? (
          <View style={[StyleSheet.absoluteFill, styles.soldOut]}>
            <Text style={styles.soldOutText}>Sold out</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text style={[styles.tileName, { color: p.text }]} numberOfLines={1}>{item.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="car" size={11} color={p.sub} />
          <Text style={[styles.tileType, { color: p.sub }]} numberOfLines={1}>Delivery included</Text>
        </View>
        <View style={styles.tileFoot}>
          <Price coins={item.priceCoins} p={p} />
          <View style={{ flex: 1 }} />
          {inStock ? <RoundAction p={p} icon="bag-handle" locked={!canAfford} label={canAfford ? 'Open product' : 'Not enough DP coin'} /> : null}
        </View>
      </View>
    </ScaleTouchable>
  );
});

/** Wide carousel card for a featured product. */
export function DealCard({ item, width, p, canAfford, onPress }: { item: ShopProduct; width: number; p: ExplorePalette; canAfford: boolean; onPress: () => void }) {
  const h = Math.round(width * 0.56);
  return (
    <ScaleTouchable style={[styles.deal, { width, height: h }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Hot deal: ${item.title}, ${item.priceCoins} DP coin`}>
      {item.images[0] ? (
        <AppImage source={{ uri: item.images[0] }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
          <Ionicons name="gift" size={48} color="rgba(255,255,255,0.9)" />
        </LinearGradient>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.urgent, { left: 12, top: 12, right: undefined, bottom: undefined }]}>
        <Ionicons name="flame" size={10} color="#FFF" />
        <Text style={styles.urgentText}>HOT DEAL</Text>
      </View>
      <View style={styles.dealFoot}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.dealTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.price}>
            <CoinIcon size={15} color={GOLD} />
            <Text style={[styles.priceText, { color: GOLD, fontSize: 17 }]}>{item.priceCoins.toLocaleString()}</Text>
          </View>
        </View>
        <RoundAction p={{ ...p, chip: 'rgba(255,255,255,0.2)', sub: '#FFF' }} icon="bag-handle" size={42} locked={!canAfford} label={canAfford ? 'Open product' : 'Not enough DP coin'} />
      </View>
    </ScaleTouchable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  round: { alignItems: 'center', justifyContent: 'center' },
  roundGlow: { shadowColor: '#FF4D67', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 3 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { fontFamily: 'Urbanist-Black' },

  tile: { borderRadius: 24, borderWidth: 1, padding: 6 },
  stage: { borderRadius: 19, overflow: 'hidden' },
  rarity: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  rarityDot: { width: 6, height: 6, borderRadius: 3 },
  rarityText: { fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 0.3 },
  urgent: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(240,65,62,0.95)', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  urgentText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 0.4 },
  soldOut: { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  soldOutText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, overflow: 'hidden' },
  tileBody: { paddingHorizontal: 6, paddingTop: 9, paddingBottom: 4, gap: 2 },
  tileName: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  tileType: { fontFamily: 'Urbanist-Medium', fontSize: 11.5 },
  tileFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  ownedText: { color: '#22A559', fontFamily: 'Urbanist-Black', fontSize: 13 },

  spot: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 26, padding: 12, overflow: 'hidden' },
  spotBlobA: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)', top: -70, right: -40 },
  spotBlobB: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -40, right: 60 },
  spotStage: { borderRadius: 20, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' },
  spotTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.3)' },
  spotTagText: { fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 0.8 },
  spotName: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 18 },
  spotType: { color: 'rgba(255,255,255,0.75)', fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
  spotFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },

  deal: { borderRadius: 26, overflow: 'hidden' },
  dealFoot: { position: 'absolute', left: 14, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dealTitle: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 18 },
});
