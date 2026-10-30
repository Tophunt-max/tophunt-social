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
import { assetColors, rarityColor, rarityLabel } from '@/src/lib/progression';
import { timeLeftLabel } from '@/src/lib/shareCaptions';
import type { StoreItemView } from '@/src/services/monetization';

export const DIGITAL_TYPE_LABEL: Record<string, string> = {
  frame: 'Profile frame', title: 'Title', theme: 'Profile theme', badge: 'Name badge', effect: 'Effect',
  accessory: 'Accessory', sticker: 'Sticker', collectible: 'Collectible',
};

/** Same pair as the battle vote buttons / VS orb. */
export const VOTE_GRAD: [string, string] = ['#FF4D67', '#FF8A4D'];
const STAGE_DARK: [string, string, string] = ['#1A1033', '#2D1B4E', '#14102A'];

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

/** Dark, LIVE-pill style rarity tag with a glowing dot. Legendary gets a crown. */
function RarityTag({ rarity }: { rarity?: string | null }) {
  const color = rarityColor(rarity);
  return (
    <View style={styles.rarityTag}>
      {rarity === 'legendary' ? (
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

/**
 * Full-width spotlight card, laid out like a DP battle: the viewer as they are
 * now ("ABHI") against the viewer with the item ("UPGRADE"), split by the VS orb.
 */
export function FeaturedDigitalCard({
  item, p, viewer, busy, affordable, onBuy, width = 340,
}: { item: StoreItemView; p: ExplorePalette; viewer: Viewer; busy: boolean; affordable: boolean; onBuy: () => void; width?: number }) {
  const color = rarityColor(item.rarity);
  const inner = width - 28; // card padding 14 × 2
  const panelW = (inner - 10) / 2;
  const panelH = Math.round(panelW * 1.05);
  const who = viewer.name || 'You';
  return (
    <LinearGradient colors={[color, '#FF4D67', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.featuredBorder, { width }]}>
      <LinearGradient colors={STAGE_DARK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featured}>
        <View style={styles.featuredTop}>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>SPOTLIGHT DROP</Text>
          </View>
          <View style={{ flex: 1 }} />
          <RarityTag rarity={item.rarity} />
        </View>

        <View style={styles.vsRow}>
          <View style={[styles.panel, { width: panelW, height: panelH }]}>
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              <Avatar uri={viewer.avatarUri} name={who} size={panelW * 0.5} />
            </View>
            <View style={[styles.corner, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
              <Text style={styles.cornerText}>ABHI</Text>
            </View>
          </View>
          <View style={[styles.panel, styles.panelWin, { width: panelW, height: panelH, borderColor: color }]}>
            <ItemStage item={item} w={panelW} h={panelH} viewer={viewer} />
            <View style={[styles.corner, { backgroundColor: color }]}>
              <Text style={styles.cornerText}>UPGRADE</Text>
            </View>
            <View style={styles.crown} pointerEvents="none">
              <MaterialCommunityIcons name="crown" size={18} color="#FFD700" />
            </View>
          </View>
          <View style={[styles.vsWrap, { top: panelH / 2 - 21 }]} pointerEvents="none">
            <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vsOrb}>
              <Text style={styles.vsText}>VS</Text>
            </LinearGradient>
          </View>
        </View>

        <Text style={styles.featuredName} numberOfLines={1}>{item.name}</Text>
        <View style={[styles.metaRow, { marginTop: 4 }]}>
          <TierPill item={item} compact />
          <Text style={styles.featuredType} numberOfLines={1}>{DIGITAL_TYPE_LABEL[item.type] ?? item.type}</Text>
        </View>
        {item.description ? <Text style={styles.featuredDesc} numberOfLines={2}>{item.description}</Text> : null}
        <View style={{ marginTop: 12 }}>
          <PriceButton item={item} busy={busy} affordable={affordable} onBuy={onBuy} p={{ ...p, chip: 'rgba(255,255,255,0.12)', text: '#FFF', sub: '#C9C2E0' }} big />
        </View>
      </LinearGradient>
    </LinearGradient>
  );
}

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
  rarityText: { fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 0.6 },
  stockTag: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 100, paddingHorizontal: 7, paddingVertical: 3 },
  stockText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 0.3 },
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

  featuredBorder: { borderRadius: 24, padding: 1.5, alignSelf: 'center' },
  featured: { borderRadius: 22.5, padding: 14 },
  featuredTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF4D67' },
  livePillText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 0.8 },
  vsRow: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative' },
  panel: { borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)' },
  panelWin: { backgroundColor: 'rgba(255,255,255,0.1)' },
  corner: { position: 'absolute', top: 7, left: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  cornerText: { color: '#FFF', fontSize: 9, fontFamily: 'Urbanist-Black', letterSpacing: 0.5 },
  crown: { position: 'absolute', top: 6, right: 8 },
  vsWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  vsOrb: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  vsText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 14, fontStyle: 'italic' },
  featuredName: { color: '#FFFFFF', fontFamily: 'Urbanist-Black', fontSize: 20, marginTop: 12 },
  featuredType: { color: '#C9C2E0', fontFamily: 'Urbanist-SemiBold', fontSize: 12, flexShrink: 1 },
  featuredDesc: { color: '#C9C2E0', fontFamily: 'Urbanist-Medium', fontSize: 12.5, marginTop: 6 },
});
