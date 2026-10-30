/**
 * One place that turns a cosmetic's `asset.key` into bundled artwork and keeps
 * FREE XP (`xp.*`, `xp40.*`) separate from Premium Shop (`shop.*`).
 *
 * XP40 can use optimized WebP backgrounds and lightweight shared SVG effects;
 * Premium uses layered SVG artwork. Unknown catalog art degrades to existing
 * vector/color fallbacks in the renderer rather than crashing.
 */
import type { FC } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { SHOP_DIGITAL_ART, type FxMotion } from '@/assets/shop/digital';
import { XP_ART, type XpAnimationConfig } from '@/assets/xp';

export type CosmeticTier = 'xp' | 'premium';
export type ArtKind = 'frame' | 'theme' | 'badge' | 'title' | 'sticker' | 'collectible' | 'effect';
export type { FxMotion };

export interface CosmeticArt {
  kind: ArtKind;
  tier: CosmeticTier;
  Art?: FC<SvgProps>;
  /** Optimized raster (XP40 themes; full-size badge export where needed). */
  image?: ImageSourcePropType;
  preview?: ImageSourcePropType;
  /** Animated overlay, either Premium FX or a lightweight XP40 effect. */
  Fx?: FC<SvgProps>;
  fx?: FxMotion;
  animation?: XpAnimationConfig;
  layout?: 'nameplate';
  /** Avatar diameter / artwork box; XP40 frames have a wider decorative band. */
  avatarRatio?: number;
}

type WithAsset = { asset?: Record<string, any> | null } | null | undefined;

const xpMotion = (name?: string): FxMotion => {
  if (name === 'frame-rotating-ornaments') return 'spin';
  if (name === 'frame-particles' || name === 'unlock-confetti') return 'drift';
  if (name === 'badge-shine' || name === 'unlock-burst') return 'twinkle';
  return 'pulse';
};

export function cosmeticArt(item: WithAsset, kind?: ArtKind): CosmeticArt | null {
  const key = item?.asset?.key;
  if (typeof key !== 'string') return null;
  const premium = SHOP_DIGITAL_ART[key];
  const xp = XP_ART[key] as any;
  const hit: CosmeticArt | null = premium
    ? { ...premium, tier: 'premium' }
    : xp
      ? {
          ...xp,
          tier: 'xp',
          Fx: xp.animation?.overlay,
          fx: xpMotion(xp.animation?.name),
          avatarRatio: key.startsWith('xp40.frame_') ? 332 / 512 : undefined,
        }
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

/** Level an XP item unlocks at, including the level-0 starter set. */
export function cosmeticLevel(item: WithAsset): number | null {
  const n = Number(item?.asset?.level);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Legacy and Premium frames use a 120 canvas with a 100px avatar opening. */
export const FRAME_AVATAR_RATIO = 100 / 120;

export const TIER_STYLE: Record<CosmeticTier, { label: string; fg: string; bg: string; border: string }> = {
  xp: { label: 'Free XP', fg: '#DDFBFF', bg: '#075985', border: '#38BDF8' },
  premium: { label: 'Premium', fg: '#FFFFFF', bg: '#C026D3', border: '#F0ABFC' },
};
