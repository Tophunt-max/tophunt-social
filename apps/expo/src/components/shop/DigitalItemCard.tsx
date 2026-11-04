/**
 * Shop cards for digital items (frames, themes, badges, titles). The preview
 * shows the item the way other people will see it: a frame on the buyer's own
 * photo, a theme as a mini profile banner, a badge next to their name.
 *
 * Visual language follows the DP contest / battle cards: dark stage, rarity
 * glow border, LIVE-style pills, a gradient VS orb on the spotlight card and
 * vote-button style gradient CTAs.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/src/components/ui/Avatar';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons, MaterialCommunityIcons } from '@/src/lib/icons';
import { CosmeticPreview } from '@/src/components/gamification/RewardBits';
import { CosmeticBadge, CosmeticTitleChip, FramedAvatar, ThemeBackdrop, TierPill } from '@/src/components/gamification/CosmeticBits';
import { type ExplorePalette } from '@/src/components/explore/theme';
import { assetColors, isCrownRarity, rarityColor, rarityLabel } from '@/src/lib/progression';
import { timeLeftLabel } from '@/src/lib/shareCaptions';
import type { StoreItemView } from '@/src/services/monetization';

export const DIGITAL_TYPE_LABEL: Record<string, string> = {
  frame: 'Profile frame', title: 'Title', theme: 'Profile theme', badge: 'Name badge', effect: 'Effect',
  accessory: 'Accessory', sticker: 'Sticker', collectible: 'Collectible',
};

/** Same pair as the battle vote buttons / VS orb. */
export const VOTE_GRAD: [string, string] = ['#FF4D67', '#FF8A4D'];

export interface Viewer {
  avatarUri: string | null;
  name: string | null;
}

/** The item as it looks on a profile, for a preview box `w` × `h`. */
export function ItemStage({ item, w, h, viewer }: { item: StoreItemView; w: number; h: number; viewer: Viewer }) {
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

/** Dark, LIVE-pill style rarity tag with a glowing dot. Legendary gets a crown. */
function RarityTag({ rarity }: { rarity?: string | null }) {
  const color = rarityColor(rarity);
  return (
    <View style={styles.rarityTag}>
      {isCrownRarity(rarity) ? (
        <MaterialCommunityIcons name="crown" size={10} color={color} />
      ) : (
        <View style={[styles.rarityDot, { backgroundColor: color, shadowColor: color }]} />
      )}
      <Text style={[styles.rarityText, { color }]}>{rarityLabel(rarity).toUpperCase()}</Text>
    </View>
  );
}

function PriceButton({ item, busy, affordable, onBuy, p, big = false }: { item: StoreItemView; busy: boolean; affordable: boolean; onBuy: () => void; p: ExplorePalette; big?: boolean }) {
  if (item.owned) {
    return (
      <View style={[styles.btn, big && styles.btnBig, styles.owned]}>
        <Ionicons name="checkmark-circle" size={15} color="#22A559" />
        <Text style={[styles.btnText, { color: '#22A559' }]}>Owned</Text>
      </View>
    );
  }
  const label = affordable ? `Buy ${item.name} for ${item.priceCoins} DP coin` : `${item.name} costs ${item.priceCoins} DP coin. Not enough DP coin`;
  if (!affordable) {
    return (
      <View style={[styles.btn, big && styles.btnBig, { backgroundColor: p.chip }]} accessible accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={label}>
        <Ionicons name="lock-closed" size={13} color={p.sub} />
        <CoinIcon size={13} />
        <Text style={[styles.btnText, { color: p.sub }]}>{item.priceCoins}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity disabled={busy} onPress={onBuy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label} style={{ opacity: busy ? 0.6 : 1 }}>
      <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.btn, big && styles.btnBig, styles.btnGlow]}>
        {busy ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="flash" size={13} color="#FFF" />
            <Text style={[styles.btnText, { color: '#FFF' }]}>{big ? 'Unlock' : 'Buy'}</Text>
            <View style={styles.btnSep} />
            <CoinIcon size={13} />
            <Text style={[styles.btnText, { color: '#FFF' }]}>{item.priceCoins}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** Two-column grid card. */
export const DigitalItemCard = React.memo(function DigitalItemCard({
  item, width, p, viewer, busy, affordable, onBuy,
}: { item: StoreItemView; width: number; p: ExplorePalette; viewer: Viewer; busy: boolean; affordable: boolean; onBuy: () => void }) {
  const [c0, c1] = assetColors(item.asset);
  const glow = rarityColor(item.rarity);
  const stageH = Math.round(width * 0.82);
  const lowStock = item.remaining !== null && item.remaining <= 5;
  // Computed at render (no timer per card), same as the battle tiles.
  const left = item.owned ? null : timeLeftLabel(item.endsAt);
  return (
    <View style={[styles.card, { width, backgroundColor: p.card, borderColor: `${glow}${p.isDark ? '88' : '66'}`, shadowColor: glow }]}>
      <LinearGradient colors={[`${c0}${p.isDark ? '45' : '33'}`, `${c1}${p.isDark ? '60' : '48'}`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width, height: stageH }}>
        <ItemStage item={item} w={width} h={stageH} viewer={viewer} />
        <LinearGradient colors={['rgba(0,0,0,0.28)', 'transparent', 'transparent', 'rgba(0,0,0,0.35)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.pillTopLeft}><RarityTag rarity={item.rarity} /></View>
        {item.remaining !== null ? (
          <View style={[styles.stockTag, { backgroundColor: lowStock ? 'rgba(240,65,62,0.95)' : 'rgba(0,0,0,0.55)' }]}>
            {lowStock ? <Ionicons name="flame" size={10} color="#FFF" /> : null}
            <Text style={styles.stockText}>{item.remaining} left</Text>
          </View>
        ) : null}
        {left ? (
          <View style={styles.timeTag} accessibilityLabel={`${left} left`}>
            <Ionicons name="time" size={10} color="#FFF" />
            <Text style={styles.stockText}>{left}</Text>
          </View>
        ) : null}
        {item.owned ? (
          <View style={styles.ownedCorner}>
            <Ionicons name="checkmark" size={11} color="#FFF" />
          </View>
        ) : null}
      </LinearGradient>
      <View style={[styles.glowLine, { backgroundColor: glow }]} />
      <View style={styles.body}>
        <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <TierPill item={item} compact />
          <Text style={[styles.type, { color: p.sub, flexShrink: 1 }]} numberOfLines={1}>{DIGITAL_TYPE_LABEL[item.type] ?? item.type}</Text>
        </View>
        <View style={{ marginTop: 9 }}>
          <PriceButton item={item} busy={busy} affordable={affordable} onBuy={onBuy} p={p} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  glowLine: { height: 2, opacity: 0.9 },
  body: { padding: 10 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  type: { fontFamily: 'Urbanist-Medium', fontSize: 11.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  pillTopLeft: { position: 'absolute', top: 8, left: 8 },
  rarityTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  rarityDot: { width: 6, height: 6, borderRadius: 3, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  rarityText: { fontFamily: 'Urbanist-Bold', fontSize: 9.5, letterSpacing: 0.6 },
  stockTag: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  stockText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 9.5, letterSpacing: 0.3 },
  timeTag: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: 'rgba(240,65,62,0.92)' },
  ownedCorner: { position: 'absolute', bottom: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22A559', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 14 },
  btnBig: { height: 46, borderRadius: 16 },
  btnGlow: { shadowColor: '#FF4D67', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3 },
  btnSep: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.45)', marginHorizontal: 3 },
  btnText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  owned: { backgroundColor: 'rgba(34,165,89,0.12)', borderWidth: 1, borderColor: 'rgba(34,165,89,0.35)' },
  avatarRing: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  nameDemo: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '90%' },
  nameDemoText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 11, flexShrink: 1 },

});
