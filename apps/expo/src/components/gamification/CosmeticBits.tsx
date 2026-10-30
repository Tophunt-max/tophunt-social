/**
 * Equipped cosmetics on every surface that shows a person: the frame round the
 * avatar, the badge next to the name, the title chip and (profile only) the
 * theme backdrop. These are what make an item visible to other people.
 *
 * Two families, told apart everywhere (src/lib/cosmeticArt.ts):
 *   - XP (earned):  matte "Earned" artwork with the XP seal, static;
 *   - Premium (bought): layered artwork with the gem hallmark, animated by the
 *     shared fx clock (cheap even in long lists), static under reduced motion.
 *
 * Everything renders nothing (or the plain avatar) when nothing is equipped.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/src/components/ui/Avatar';
import { Ionicons } from '@/src/lib/icons';
import { frameTier } from '@/src/lib/gamificationAssets';
import { assetColors, rarityColor } from '@/src/lib/progression';
import { FRAME_AVATAR_RATIO, TIER_STYLE, cosmeticArt, cosmeticLevel, cosmeticTier } from '@/src/lib/cosmeticArt';
import type { CardCosmetics, PublicCosmetics } from '@/src/services/gamification';
import { CosmeticFx, PremiumGem, ShimmerSweep, type MotionLevel } from './CosmeticFx';
import { FrameRing } from './vectors';

type FrameItem = PublicCosmetics['frame'];
type BadgeItem = PublicCosmetics['badge'];
type TitleItem = PublicCosmetics['title'];
type ThemeItem = PublicCosmetics['theme'];

/** Read the card cosmetics off any API row that may or may not carry them. */
export function cosmeticsOf(row: unknown): CardCosmetics | null {
  const c = (row as any)?.cosmetics;
  return c && typeof c === 'object' ? (c as CardCosmetics) : null;
}

/**
 * A frame's artwork (base + premium fx) over a box of `box` pt. The avatar
 * circle is `box * FRAME_AVATAR_RATIO`, centred.
 */
export function FrameArt({ frame, box, motion = 'full' }: { frame: { asset?: Record<string, any> | null } | null | undefined; box: number; motion?: MotionLevel }) {
  const art = cosmeticArt(frame, 'frame');
  if (!art) return null;
  return (
    <View pointerEvents="none" style={[{ width: box, height: box }, styles.center]}>
      <art.Art width={box} height={box} />
      {art.Fx ? <CosmeticFx Fx={art.Fx} fx={art.fx} width={box} height={box} motion={motion} /> : null}
    </View>
  );
}

/**
 * Avatar with the owner's equipped frame, at a FIXED outer size: with a frame
 * the photo shrinks inside the ring, so list rows never shift when someone
 * equips or removes one. Without a frame it is exactly `<Avatar />`.
 */
export function FramedAvatar({
  uri,
  name,
  size,
  frame,
  style,
  motion = 'full',
}: {
  uri?: string | null;
  name?: string | null;
  size: number;
  frame?: FrameItem | null;
  style?: StyleProp<ViewStyle>;
  motion?: MotionLevel;
}) {
  if (!frame) return <Avatar uri={uri} name={name} size={size} style={style} />;
  const art = cosmeticArt(frame, 'frame');
  if (art) {
    const inner = Math.round(size * FRAME_AVATAR_RATIO);
    return (
      <View style={[{ width: size, height: size }, style]} accessibilityLabel={`${frame.name}, ${TIER_STYLE[art.tier].label}`}>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Avatar uri={uri} name={name} size={inner} />
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <FrameArt frame={frame} box={size} motion={motion} />
        </View>
      </View>
    );
  }
  // An item without bundled artwork (an admin-made one): the tier ring by rarity.
  const tier = frameTier(frame);
  if (!tier) return <Avatar uri={uri} name={name} size={size} style={style} />;
  const th = Math.max(2, Math.round(size * 0.07));
  const inner = size - th * 2;
  return (
    <View style={[{ width: size, height: size }, style]} accessibilityLabel={frame.name}>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Avatar uri={uri} name={name} size={inner} />
      </View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <FrameRing tier={tier.id} size={inner} thickness={th} />
      </View>
    </View>
  );
}

/** The equipped badge, sized to sit next to a name like the verified seal. */
export function CosmeticBadge({ badge, size = 16, motion = 'full' }: { badge?: BadgeItem | null; size?: number; motion?: MotionLevel }) {
  if (!badge) return null;
  const art = cosmeticArt(badge, 'badge');
  if (art) {
    return (
      <View accessible accessibilityLabel={`${badge.name}, ${TIER_STYLE[art.tier].label}`} style={{ marginLeft: 3, width: size, height: size }}>
        <art.Art width={size} height={size} />
        {art.Fx ? <CosmeticFx Fx={art.Fx} fx={art.fx} width={size} height={size} motion={motion} /> : null}
      </View>
    );
  }
  const color = typeof badge.asset?.color === 'string' ? badge.asset.color : rarityColor(badge.rarity);
  return (
    <View
      accessible
      accessibilityLabel={badge.name}
      style={[styles.badgeDisc, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26`, marginLeft: 3 }]}
    >
      <Ionicons name={String(badge.asset?.icon || 'star')} size={size * 0.68} color={color} />
    </View>
  );
}

/**
 * The equipped title as a chip. Earned (XP) titles are a quiet engraved chip
 * with their medal; premium titles are filled with their gradient, carry the
 * gem and a light sweeps across them.
 */
export function CosmeticTitleChip({ title, compact = false, motion = 'full' }: { title?: TitleItem | null; compact?: boolean; motion?: MotionLevel }) {
  const [w, setW] = useState(0);
  if (!title) return null;
  const art = cosmeticArt(title, 'title');
  const tier = cosmeticTier(title);
  const [c0, c1] = assetColors(title.asset, [rarityColor(title.rarity), rarityColor(title.rarity)]);
  const h = compact ? 18 : 24;
  const icon = art ? <art.Art width={h * 0.72} height={h * 0.72} /> : <Ionicons name="ribbon" size={h * 0.6} color={tier === 'premium' ? '#FFF' : c1} />;
  if (tier === 'premium') {
    return (
      <View
        accessible
        accessibilityLabel={`Title ${title.text}, Premium`}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[styles.titleChip, { height: h, borderRadius: h / 2, paddingHorizontal: compact ? 6 : 9, borderColor: '#FFFFFFAA', overflow: 'hidden' }]}
      >
        <LinearGradient colors={[c0, c1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {icon}
        <Text style={[styles.titleText, { color: '#FFFFFF', fontSize: compact ? 10.5 : 12.5 }]} numberOfLines={1}>
          {title.text}
        </Text>
        <PremiumGem size={compact ? 6 : 8} />
        <ShimmerSweep width={w} motion={motion} />
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={`Title ${title.text}, earned with XP`}
      style={[styles.titleChip, { height: h, borderRadius: h / 2, borderColor: `${c1}88`, backgroundColor: `${c0}1F`, paddingHorizontal: compact ? 6 : 9 }]}
    >
      {icon}
      <Text style={[styles.titleText, { color: c1, fontSize: compact ? 10.5 : 12.5 }]} numberOfLines={1}>
        {title.text}
      </Text>
    </View>
  );
}

/**
 * Badge (and optionally the title) after a name. Drop it next to
 * `<VerifiedBadge />` in any name row.
 */
export function NameCosmetics({
  cosmetics,
  badgeSize = 15,
  showTitle = false,
  motion = 'full',
}: {
  cosmetics?: CardCosmetics | null;
  badgeSize?: number;
  showTitle?: boolean;
  motion?: MotionLevel;
}) {
  if (!cosmetics || (!cosmetics.badge && !(showTitle && cosmetics.title))) return null;
  return (
    <>
      <CosmeticBadge badge={cosmetics.badge} size={badgeSize} motion={motion} />
      {showTitle && cosmetics.title ? (
        <View style={{ marginLeft: 5 }}>
          <CosmeticTitleChip title={cosmetics.title} compact motion={motion} />
        </View>
      ) : null}
    </>
  );
}

/** A profile theme drawn edge to edge behind its parent (absolute fill). */
export function ThemeBackdrop({ theme, style, motion = 'full' }: { theme?: ThemeItem | null; style?: StyleProp<ViewStyle>; motion?: MotionLevel }) {
  if (!theme) return null;
  const art = cosmeticArt(theme, 'theme');
  if (art) {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
        <art.Art width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        {art.Fx ? <CosmeticFx Fx={art.Fx} fx={art.fx} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" motion={motion} /> : null}
      </View>
    );
  }
  const [c0, c1] = assetColors(theme.asset);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c0 }]} />
      <View style={[styles.themeHalf, { backgroundColor: c1 }]} />
    </View>
  );
}

/**
 * "XP · Lv 25" or "Premium": where an item came from, on every card that
 * lists items (Shop, Store, My items).
 */
export function TierPill({ item, compact = false }: { item: { asset?: Record<string, any> | null; unlocksAtLevel?: number | null }; compact?: boolean }) {
  const tier = cosmeticTier(item);
  const s = TIER_STYLE[tier];
  const level = item.unlocksAtLevel ?? cosmeticLevel(item);
  const label = tier === 'xp' ? (level ? `XP · Lv ${level}` : 'XP reward') : 'Premium';
  return (
    <View
      accessible
      accessibilityLabel={tier === 'xp' ? `Earned with XP${level ? `, level ${level}` : ''}` : 'Premium, bought with DP coin'}
      style={[styles.tierPill, { backgroundColor: s.bg, borderColor: s.border, paddingVertical: compact ? 1 : 2 }]}
    >
      {tier === 'premium' ? <PremiumGem size={compact ? 6 : 7} /> : <Ionicons name="star" size={compact ? 9 : 10} color={s.fg} />}
      <Text style={[styles.tierText, { color: s.fg, fontSize: compact ? 9.5 : 10.5 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badgeDisc: { alignItems: 'center', justifyContent: 'center' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, alignSelf: 'flex-start' },
  titleText: { fontFamily: 'Urbanist-Bold', letterSpacing: 0.2 },
  themeHalf: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', opacity: 0.6 },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, alignSelf: 'flex-start' },
  tierText: { fontFamily: 'Urbanist-Bold', letterSpacing: 0.3 },
});
