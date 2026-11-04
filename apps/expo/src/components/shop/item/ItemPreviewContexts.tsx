/**
 * The item drawn on the viewer's real avatar / name in the places it shows
 * once equipped: a profile header, a post header, a comment row and a battle
 * card. Everything uses the same renderers the app uses for equipped
 * cosmetics (FramedAvatar, CosmeticBadge, CosmeticTitleChip, ThemeBackdrop,
 * ProfileEffect), so the preview is exactly what other people will see.
 *
 * Laid out on the dark item stage (white text). Placeholder lines stand in
 * for post / comment text: no invented content, counts or opponents.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/src/components/ui/Avatar';
import { CosmeticPreview } from '@/src/components/gamification/RewardBits';
import { CosmeticBadge, CosmeticTitleChip, FramedAvatar, ThemeBackdrop } from '@/src/components/gamification/CosmeticBits';
import { ProfileEffect } from '@/src/components/gamification/ProfileEffect';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { PreviewContext } from '@/src/lib/shopItemModel';
import type { StoreItemView } from '@/src/services/monetization';
import { TH } from '@/src/theme/tophunt';

const WHITE = TH.colors.white;
const LINE = 'rgba(255,255,255,0.16)';
const LINE_SOFT = 'rgba(255,255,255,0.09)';

/** The cosmetic slots this item fills (one of them, by type). */
function slotsOf(item: StoreItemView) {
  const anyItem = item as any;
  const title =
    item.type === 'title'
      ? { id: item.itemId, name: item.name, rarity: item.rarity, text: String(item.asset?.text ?? item.name), asset: item.asset }
      : null;
  return {
    frame: item.type === 'frame' ? anyItem : null,
    badge: item.type === 'badge' ? anyItem : null,
    theme: item.type === 'theme' ? anyItem : null,
    effect: item.type === 'effect' ? { id: item.itemId, name: item.name, rarity: item.rarity, asset: item.asset } : null,
    title,
  };
}

function NameRow({ name, badge, size, color = WHITE }: { name: string; badge: any; size: number; color?: string }) {
  return (
    <View style={styles.nameRow}>
      <Text style={[styles.name, { fontSize: size, color }]} numberOfLines={1}>{name}</Text>
      <CosmeticBadge badge={badge} size={Math.round(size * 1.15)} />
    </View>
  );
}

function Lines({ widths, h = 8 }: { widths: (number | `${number}%`)[]; h?: number }) {
  return (
    <View style={{ gap: 6 }}>
      {widths.map((w, k) => <View key={k} style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: k === 0 ? LINE : LINE_SOFT }} />)}
    </View>
  );
}

/** Profile header: theme banner, the avatar (frame / effect), name + badge, title chip. */
function ProfileCtx({ item, viewer, w, h }: { item: StoreItemView; viewer: Viewer; w: number; h: number }) {
  const s = slotsOf(item);
  const who = viewer.name || 'You';
  const showsArt = item.type !== 'frame' && item.type !== 'theme' && item.type !== 'effect' && item.type !== 'title' && item.type !== 'badge';
  if (showsArt) {
    // Accessories, stickers, collectibles: the artwork itself, large.
    return (
      <View style={[{ width: w, height: h }, styles.center]}>
        <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset }} size={Math.min(w, h) * 0.55} />
      </View>
    );
  }
  const bannerH = Math.round(h * (s.theme ? 0.5 : 0.38));
  const big = item.type === 'frame' || item.type === 'effect';
  const av = Math.round(Math.min(w * 0.42, h * (big ? 0.44 : 0.3)));
  const ring = s.frame ? 0 : 4;
  return (
    <View style={{ width: w, height: h, alignItems: 'center' }}>
      <View style={{ width: w, height: bannerH, overflow: 'hidden' }}>
        {s.theme ? (
          <ThemeBackdrop theme={s.theme} />
        ) : (
          <LinearGradient colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={{ marginTop: -Math.round(av * 0.55), width: av + ring * 2, height: av + ring * 2, alignItems: 'center', justifyContent: 'center' }}>
        {s.frame ? null : <View style={[StyleSheet.absoluteFill, { borderRadius: (av + ring * 2) / 2, backgroundColor: '#181920' }]} />}
        <View style={{ width: av, height: av }}>
          {s.effect ? <ProfileEffect effect={s.effect} avatarSize={av} /> : null}
          <FramedAvatar uri={viewer.avatarUri} name={who} size={av} frame={s.frame} />
        </View>
      </View>
      <View style={{ marginTop: 10, alignItems: 'center', gap: 6, maxWidth: w - 24 }}>
        <NameRow name={who} badge={s.badge} size={item.type === 'badge' ? 20 : 17} />
        {s.title ? <CosmeticTitleChip title={s.title} /> : null}
      </View>
    </View>
  );
}

/** A post header (avatar, name + badge, title) over a placeholder post body. */
function PostCtx({ item, viewer, w }: { item: StoreItemView; viewer: Viewer; w: number }) {
  const s = slotsOf(item);
  const who = viewer.name || 'You';
  const cardW = Math.min(w - 32, 340);
  return (
    <View style={[styles.surface, { width: cardW }]}>
      <View style={styles.headRow}>
        <FramedAvatar uri={viewer.avatarUri} name={who} size={s.frame ? 52 : 42} frame={s.frame} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <NameRow name={who} badge={s.badge} size={15} />
          {s.title ? <CosmeticTitleChip title={s.title} compact /> : <Lines widths={[64]} h={7} />}
        </View>
      </View>
      <View style={[styles.media, { height: Math.round(cardW * 0.42) }]} />
      <Lines widths={['86%', '58%']} />
    </View>
  );
}

/** A comment row: small avatar, name + badge (+ title), placeholder text. */
function CommentCtx({ item, viewer, w }: { item: StoreItemView; viewer: Viewer; w: number }) {
  const s = slotsOf(item);
  const who = viewer.name || 'You';
  const cardW = Math.min(w - 32, 340);
  if (item.type === 'sticker') {
    return (
      <View style={[styles.surface, { width: cardW }]}>
        <View style={styles.headRow}>
          <Avatar uri={viewer.avatarUri} name={who} size={34} />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <NameRow name={who} badge={null} size={13.5} />
            <CosmeticPreview item={{ id: item.itemId, type: item.type, name: item.name, rarity: item.rarity, asset: item.asset }} size={Math.min(110, cardW * 0.4)} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ width: cardW, gap: 12 }}>
      <View style={[styles.surface, { width: cardW }]}>
        <View style={[styles.headRow, { alignItems: 'flex-start' }]}>
          <FramedAvatar uri={viewer.avatarUri} name={who} size={s.frame ? 44 : 34} frame={s.frame} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={[styles.nameRow, { gap: 6 }]}>
              <NameRow name={who} badge={s.badge} size={13.5} />
              {s.title ? <CosmeticTitleChip title={s.title} compact /> : null}
            </View>
            <Lines widths={['92%', '64%']} h={7} />
          </View>
        </View>
      </View>
      {/* A neutral second comment for scale (no name, no text). */}
      <View style={[styles.surface, { width: cardW, opacity: 0.55 }]}>
        <View style={[styles.headRow, { alignItems: 'flex-start' }]}>
          <View style={styles.ghostAvatar} />
          <View style={{ flex: 1, gap: 6 }}>
            <Lines widths={[72]} h={8} />
            <Lines widths={['80%']} h={7} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** A battle card: the viewer's side (frame / badge) against a blank opponent. */
function BattleCtx({ item, viewer, w }: { item: StoreItemView; viewer: Viewer; w: number }) {
  const s = slotsOf(item);
  const who = viewer.name || 'You';
  const cardW = Math.min(w - 32, 340);
  const side = Math.round((cardW - 64) / 2);
  const av = Math.min(96, Math.round(side * 0.78));
  return (
    <View style={[styles.surface, styles.battle, { width: cardW }]}>
      <View style={[styles.side, { width: side }]}>
        <FramedAvatar uri={viewer.avatarUri} name={who} size={av} frame={s.frame} />
        <NameRow name={who} badge={s.badge} size={13} />
      </View>
      <LinearGradient colors={['#FF4D67', '#FF8A4D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.vs}>
        <Text style={styles.vsText}>VS</Text>
      </LinearGradient>
      <View style={[styles.side, { width: side }]}>
        <View style={[styles.ghostAvatar, { width: Math.round(av * 0.8), height: Math.round(av * 0.8), borderRadius: av }]} />
        <Lines widths={[Math.round(side * 0.55)]} h={9} />
      </View>
    </View>
  );
}

export function ItemPreviewContext({ ctx, item, viewer, width, height }: { ctx: PreviewContext; item: StoreItemView; viewer: Viewer; width: number; height: number }) {
  let body: React.ReactNode;
  if (ctx === 'post') body = <PostCtx item={item} viewer={viewer} w={width} />;
  else if (ctx === 'comment') body = <CommentCtx item={item} viewer={viewer} w={width} />;
  else if (ctx === 'battle') body = <BattleCtx item={item} viewer={viewer} w={width} />;
  else return <ProfileCtx item={item} viewer={viewer} w={width} h={height} />;
  return <View style={[{ width, height }, styles.center]}>{body}</View>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  name: { fontFamily: TH.fonts.bold, color: WHITE, flexShrink: 1 },
  surface: { borderRadius: TH.radii.md, padding: 12, gap: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  media: { borderRadius: TH.radii.sm, backgroundColor: LINE_SOFT },
  ghostAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: LINE },
  battle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18 },
  side: { alignItems: 'center', gap: 10 },
  vs: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  vsText: { color: WHITE, fontFamily: TH.fonts.bold, fontSize: 14 },
});
