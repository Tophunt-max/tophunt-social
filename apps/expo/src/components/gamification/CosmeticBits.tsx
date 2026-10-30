/**
 * Equipped cosmetics on every surface that shows a person: the frame round the
 * avatar, the badge next to the name, the title chip and (profile only) the
 * theme backdrop. These are what make a purchase visible to other people, so
 * they are deliberately cheap: no animation, no state, and they render
 * nothing (or the plain avatar) when nothing is equipped.
 *
 * Artwork: Shop items resolve through `asset.key` to apps/expo/assets/shop/digital;
 * level-reward items fall back to the tier ring / an icon disc.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Avatar } from '@/src/components/ui/Avatar';
import { Ionicons } from '@/src/lib/icons';
import { frameTier } from '@/src/lib/gamificationAssets';
import { assetColors, rarityColor } from '@/src/lib/progression';
import { SHOP_FRAME_AVATAR_RATIO, shopArt } from '@/src/lib/shopDigital';
import type { CardCosmetics, PublicCosmetics } from '@/src/services/gamification';
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
 * A Shop frame's artwork drawn over a box of `box` pt. The avatar circle is
 * `box * SHOP_FRAME_AVATAR_RATIO` and centred.
 */
export function ShopFrameArt({ frame, box }: { frame: FrameItem | undefined; box: number }) {
  const art = shopArt(frame, 'frame');
  if (!art) return null;
  const { Art } = art;
  return <Art width={box} height={box} />;
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
}: {
  uri?: string | null;
  name?: string | null;
  size: number;
  frame?: FrameItem | null;
  style?: StyleProp<ViewStyle>;
}) {
  if (!frame) return <Avatar uri={uri} name={name} size={size} style={style} />;
  const art = shopArt(frame, 'frame');
  if (art) {
    const inner = Math.round(size * SHOP_FRAME_AVATAR_RATIO);
    return (
      <View style={[{ width: size, height: size }, style]} accessibilityLabel={frame.name}>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Avatar uri={uri} name={name} size={inner} />
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <art.Art width={size} height={size} />
        </View>
      </View>
    );
  }
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
export function CosmeticBadge({ badge, size = 16 }: { badge?: BadgeItem | null; size?: number }) {
  if (!badge) return null;
  const art = shopArt(badge, 'badge');
  if (art) {
    return (
      <View accessible accessibilityLabel={badge.name} style={{ marginLeft: 3 }}>
        <art.Art width={size} height={size} />
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

/** The equipped title as a small chip. `compact` for list rows. */
export function CosmeticTitleChip({ title, compact = false }: { title?: TitleItem | null; compact?: boolean }) {
  if (!title) return null;
  const art = shopArt(title, 'title');
  const [c0, c1] = assetColors(title.asset, [rarityColor(title.rarity), rarityColor(title.rarity)]);
  const h = compact ? 18 : 24;
  return (
    <View
      accessible
      accessibilityLabel={`Title ${title.text}`}
      style={[styles.titleChip, { height: h, borderRadius: h / 2, borderColor: `${c1}AA`, backgroundColor: `${c0}22`, paddingHorizontal: compact ? 6 : 9 }]}
    >
      {art ? <art.Art width={h * 0.7} height={h * 0.7} /> : <Ionicons name="ribbon" size={h * 0.6} color={c1} />}
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
}: {
  cosmetics?: CardCosmetics | null;
  badgeSize?: number;
  showTitle?: boolean;
}) {
  if (!cosmetics || (!cosmetics.badge && !(showTitle && cosmetics.title))) return null;
  return (
    <>
      <CosmeticBadge badge={cosmetics.badge} size={badgeSize} />
      {showTitle && cosmetics.title ? (
        <View style={{ marginLeft: 5 }}>
          <CosmeticTitleChip title={cosmetics.title} compact />
        </View>
      ) : null}
    </>
  );
}

/** A profile theme drawn edge to edge behind its parent (absolute fill). */
export function ThemeBackdrop({ theme, style }: { theme?: ThemeItem | null; style?: StyleProp<ViewStyle> }) {
  if (!theme) return null;
  const art = shopArt(theme, 'theme');
  if (art) {
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
        <art.Art width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
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

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badgeDisc: { alignItems: 'center', justifyContent: 'center' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, alignSelf: 'flex-start' },
  titleText: { fontFamily: 'Urbanist-Bold', letterSpacing: 0.2 },
  themeHalf: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', opacity: 0.6 },
});
