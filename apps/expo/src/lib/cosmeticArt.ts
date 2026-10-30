/**
 * One place that turns a cosmetic's `asset` into its bundled artwork and tells
 * apart the two families:
 *
 *   - `xp`      earned with XP (level milestones, achievements):
 *               apps/expo/assets/xp, "Earned" style, never animated;
 *   - `premium` bought with DP coin in the Shop:
 *               apps/expo/assets/shop/digital, layered and animated.
 *
 * The tier is read from `asset.tier` (set by migrations 0076/0077) and falls
 * back to the key prefix. Anything else in the catalog is earned, so `xp` is
 * the default.
 */
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';
import { SHOP_DIGITAL_ART, type FxMotion } from '@/assets/shop/digital';
import { XP_ART } from '@/assets/xp';

export type CosmeticTier = 'xp' | 'premium';
export type ArtKind = 'frame' | 'theme' | 'badge' | 'title' | 'sticker' | 'collectible' | 'effect';
export type { FxMotion };

export interface CosmeticArt {
  kind: ArtKind;
  tier: CosmeticTier;
  Art: FC<SvgProps>;
  /** Animated overlay (premium only). */
  Fx?: FC<SvgProps>;
  fx?: FxMotion;
}

type WithAsset = { asset?: Record<string, any> | null } | null | undefined;

export function cosmeticArt(item: WithAsset, kind?: ArtKind): CosmeticArt | null {
  const key = item?.asset?.key;
  if (typeof key !== 'string') return null;
  const shop = SHOP_DIGITAL_ART[key];
  const hit: CosmeticArt | null = shop
    ? { ...shop, tier: 'premium' }
    : XP_ART[key]
      ? { ...XP_ART[key], tier: 'xp' }
      : null;
  if (!hit || (kind && hit.kind !== kind)) return null;
  return hit;
}

export function cosmeticTier(item: WithAsset): CosmeticTier {
  const t = item?.asset?.tier;
  if (t === 'premium' || t === 'xp') return t;
  const key = item?.asset?.key;
  return typeof key === 'string' && key.startsWith('shop.') ? 'premium' : 'xp';
}

/** Level an XP item unlocks at, when the catalog says so (asset.level). */
export function cosmeticLevel(item: WithAsset): number | null {
  const n = Number(item?.asset?.level);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Avatar diameter inside a frame artwork of outer size `box`: every frame's
 * avatar circle is r=50 in a 120-unit box.
 */
export const FRAME_AVATAR_RATIO = 100 / 120;

/** Hallmark colours, shared by every label that says XP or Premium. */
export const TIER_STYLE: Record<CosmeticTier, { label: string; fg: string; bg: string; border: string }> = {
  xp: { label: 'XP', fg: '#475569', bg: '#E2E8F0', border: '#94A3B8' },
  premium: { label: 'Premium', fg: '#FFFFFF', bg: '#C026D3', border: '#F0ABFC' },
};
