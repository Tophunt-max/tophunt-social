/**
 * Shop cards for digital items (frames, themes, badges, titles). The preview
 * shows the item the way other people will see it: a frame on the buyer's own
 * photo, a theme as a mini profile banner, a badge next to their name.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/src/components/ui/Avatar';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { RarityPill } from '@/src/components/gamification/RarityPill';
import { CosmeticPreview } from '@/src/components/gamification/RewardBits';
import { CosmeticBadge, CosmeticTitleChip, FramedAvatar, ThemeBackdrop, TierPill } from '@/src/components/gamification/CosmeticBits';
import { BRAND, type ExplorePalette } from '@/src/components/explore/theme';
import { assetColors, rarityColor } from '@/src/lib/progression';
import type { StoreItemView } from '@/src/services/monetization';

export const DIGITAL_TYPE_LABEL: Record<string, string> = {
  frame: 'Profile frame', title: 'Title', theme: 'Profile theme', badge: 'Name badge', effect: 'Effect',
  accessory: 'Accessory', sticker: 'Sticker', collectible: 'Collectible',
};

interface Viewer {
  avatarUri: string | null;
  name: string | null;
}

/** The item as it looks on a profile, for a preview box `w` × `h`. */
function ItemStage({ item, w, h, viewer }: { item: StoreItemView; w: number; h: number; viewer: Viewer }) {
  const who = viewer.name || 'You';
  if (item.type === 'theme') {
    const av = Math.min(w, h) * 0.34;
    return (
      <View style={{ width: w, height: h }}>
        <ThemeBackdrop theme={item as any} />
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={[styles.avatarRing, { width: av + 6, height: av + 6, borderRadius: (av + 6) / 2 }]}>
            <Avatar uri={viewer.avatarUri} name={who} size={av} />
          </View>
        </View>
      </View>
    );
  }
  if (item.type === 'frame') {
    return (
      <View style={[{ width: w, height: h }, styles.center]}>
        <FramedAvatar uri={viewer.avatarUri} name={who} size={Math.min(w, h) * 0.72} frame={item as any} />
      </View>
    );
  }
  if (item.type === 'badge') {
    const s = Math.min(w, h) * 0.46;
    return (
      <View style={[{ width: w, height: h }, styles.center, { gap: 8 }]}>
        <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset }} size={s} />
        <View style={styles.nameDemo}>
          <Text style={styles.nameDemoText} numberOfLines={1}>{who}</Text>
          <CosmeticBadge badge={item as any} size={14} />
        </View>
      </View>
    );
  }
  if (item.type === 'title') {
    const text = String(item.asset?.text ?? item.name);
    return (
      <View style={[{ width: w, height: h }, styles.center, { gap: 10 }]}>
        <Avatar uri={viewer.avatarUri} name={who} size={Math.min(w, h) * 0.34} />
        <CosmeticTitleChip title={{ id: item.itemId, name: item.name, rarity: item.rarity, text, asset: item.asset }} />
      </View>
    );
  }
  return (
    <View style={[{ width: w, height: h }, styles.center]}>
      <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset }} size={Math.min(w, h) * 0.5} />
    </View>
  );
}

function PriceButton({ item, busy, affordable, onBuy, p, big = false }: { item: StoreItemView; busy: boolean; affordable: boolean; onBuy: () => void; p: ExplorePalette; big?: boolean }) {
  if (item.owned) {
    return (
      <View style={[styles.btn, big && styles.btnBig, { backgroundColor: p.chip }]}>
        <Ionicons name="checkmark-circle" size={14} color="#10B981" />
        <Text style={[styles.btnText, { color: p.text }]}>Owned</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.btn, big && styles.btnBig, { backgroundColor: affordable ? BRAND : p.chip, opacity: busy ? 0.6 : 1 }]}
      disabled={!affordable || busy}
      onPress={onBuy}
      accessibilityRole="button"
      accessibilityLabel={affordable ? `Buy ${item.name} for ${item.priceCoins} DP coin` : `${item.name} costs ${item.priceCoins} DP coin. Not enough DP coin`}
    >
      {busy ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <CoinIcon size={14} />
          <Text style={[styles.btnText, { color: affordable ? '#FFF' : p.sub }]}>{item.priceCoins}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Two-column grid card. */
export const DigitalItemCard = React.memo(function DigitalItemCard({
  item, width, p, viewer, busy, affordable, onBuy,
}: { item: StoreItemView; width: number; p: ExplorePalette; viewer: Viewer; busy: boolean; affordable: boolean; onBuy: () => void }) {
  const [c0, c1] = assetColors(item.asset);
  const stageH = Math.round(width * 0.82);
  return (
    <View style={[styles.card, { width, backgroundColor: p.card, borderColor: p.border }]}>
      <LinearGradient colors={[`${c0}${p.isDark ? '40' : '30'}`, `${c1}${p.isDark ? '55' : '40'}`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width, height: stageH }}>
        <ItemStage item={item} w={width} h={stageH} viewer={viewer} />
        <View style={styles.pillTopLeft}><RarityPill rarity={item.rarity} /></View>
        {item.remaining !== null ? (
          <View style={[styles.stockTag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <Text style={styles.stockText}>{item.remaining} left</Text>
          </View>
        ) : null}
      </LinearGradient>
      <View style={styles.body}>
        <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <TierPill item={item} compact />
          <Text style={[styles.type, { color: p.sub, flexShrink: 1 }]} numberOfLines={1}>{DIGITAL_TYPE_LABEL[item.type] ?? item.type}</Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <PriceButton item={item} busy={busy} affordable={affordable} onBuy={onBuy} p={p} />
        </View>
      </View>
    </View>
  );
});

/** Full-width hero card for the spotlight item. */
export function FeaturedDigitalCard({
  item, p, viewer, busy, affordable, onBuy,
}: { item: StoreItemView; p: ExplorePalette; viewer: Viewer; busy: boolean; affordable: boolean; onBuy: () => void }) {
  const color = rarityColor(item.rarity);
  return (
    <LinearGradient colors={['#1A1033', '#2D1B4E', '#14102A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featured}>
      <View style={styles.featuredStage}>
        <ItemStage item={item} w={128} h={128} viewer={viewer} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.spotlight, { borderColor: `${color}AA` }]}>
          <Ionicons name="sparkles" size={11} color={color} />
          <Text style={[styles.spotlightText, { color }]}>SPOTLIGHT</Text>
        </View>
        <Text style={styles.featuredName} numberOfLines={2}>{item.name}</Text>
        <TierPill item={item} compact />
        {item.description ? <Text style={styles.featuredDesc} numberOfLines={2}>{item.description}</Text> : null}
        <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
          <PriceButton item={item} busy={busy} affordable={affordable} onBuy={onBuy} p={{ ...p, chip: 'rgba(255,255,255,0.14)', text: '#FFF', sub: '#C9C2E0' }} big />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  body: { padding: 10 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  type: { fontFamily: 'Urbanist-Medium', fontSize: 11.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  pillTopLeft: { position: 'absolute', top: 8, left: 8 },
  stockTag: { position: 'absolute', top: 8, right: 8, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  stockText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 32, borderRadius: 12 },
  btnBig: { paddingHorizontal: 18, height: 36 },
  btnText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  avatarRing: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  nameDemo: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '90%' },
  nameDemoText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 11, flexShrink: 1 },
  featured: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, padding: 14 },
  featuredStage: { width: 128, height: 128, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  spotlight: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  spotlightText: { fontFamily: 'Urbanist-Bold', fontSize: 10, letterSpacing: 0.8 },
  featuredName: { color: '#FFFFFF', fontFamily: 'Urbanist-Bold', fontSize: 18 },
  featuredDesc: { color: '#C9C2E0', fontFamily: 'Urbanist-Medium', fontSize: 12 },
});
