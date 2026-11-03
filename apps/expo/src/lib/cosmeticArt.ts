/**
 * One place that turns a cosmetic's `asset.key` into bundled artwork and keeps
 * FREE XP (`xp.*`, `xp40.*`) separate from Premium Shop (`shop.*`).
 *
 * XP40 uses SVG artwork (WebP backgrounds for themes) with lightweight shared
 * SVG effects; legacy XP is static WebP; Premium is WebP with a WebP effect
 * overlay. Unknown catalog art degrades to existing vector/color fallbacks in
 * the renderer rather than crashing.
 */
import type { FC } from 'react';
import type { ImageSourcePropType } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { SHOP_DIGITAL_ART, type FxMotion } from '@/assets/shop/digital';
import { XP_ART, type LegacyXpArtEntry, type Xp40Entry, type XpAnimationConfig } from '@/assets/xp';

export type CosmeticTier = 'xp' | 'premium';
export type ArtKind = 'frame' | 'theme' | 'badge' | 'title' | 'sticker' | 'collectible' | 'effect';
export type { FxMotion };

interface CosmeticArtBase {
  kind: ArtKind;
  tier: CosmeticTier;
  /** Optimized raster (XP40 themes; full-size badge export where needed). */
  image?: ImageSourcePropType;
  preview?: ImageSourcePropType;
  /**
   * Animated overlay: a WebP image for Premium items, an SVG component for
   * XP40's lightweight effects. CosmeticFx draws and animates either.
   */
  Fx?: ImageSourcePropType | FC<SvgProps>;
  fx?: FxMotion;
  animation?: XpAnimationConfig;
  layout?: 'nameplate';
  /** Avatar diameter / artwork box; XP40 frames have a wider decorative band. */
  avatarRatio?: number;
}

/**
 * Base artwork is an SVG component (`Art`, XP40) or a bundled image (`source`,
 * legacy XP and Premium WebP). At least one is always present; renderers draw
 * `Art` when it exists, else `source` (see CosmeticArtGraphic).
 */
export type CosmeticArt = CosmeticArtBase &
  ({ Art: FC<SvgProps>; source?: ImageSourcePropType } | { Art?: undefined; source: ImageSourcePropType });

type WithAsset = { asset?: Record<string, any> | null; type?: string | null } | null | undefined;

const ART_KINDS: readonly ArtKind[] = ['frame', 'theme', 'badge', 'title', 'sticker', 'collectible', 'effect'];
const FX_MOTIONS: readonly FxMotion[] = ['spin', 'pulse', 'twinkle', 'flicker', 'drift'];

/** https only, no credentials; the Worker additionally pins it to our media host. */
export function isSafeArtUrl(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 500 && /^https:\/\/[^\s/@]+\/\S+$/i.test(v);
}

/**
 * Artwork an admin uploaded (asset.imageUrl, optional asset.fxUrl overlay),
 * drawn as the item's own kind (asset.artKind, stamped by the Worker, or the
 * item type). Older builds ignore these fields and keep their fallback.
 */
function uploadedArt(item: WithAsset): CosmeticArt | null {
  const a = item?.asset;
  if (!a || !isSafeArtUrl(a.imageUrl)) return null;
  const kind = (ART_KINDS as readonly string[]).includes(a.artKind) ? (a.artKind as ArtKind) : (ART_KINDS as readonly string[]).includes(item?.type ?? '') ? (item!.type as ArtKind) : null;
  if (!kind) return null;
  const ratio = Number(a.avatarRatio);
  return {
    kind,
    tier: a.tier === 'xp' ? 'xp' : 'premium',
    source: { uri: a.imageUrl },
    Fx: isSafeArtUrl(a.fxUrl) ? { uri: a.fxUrl } : undefined,
    fx: (FX_MOTIONS as readonly string[]).includes(a.fx) ? (a.fx as FxMotion) : undefined,
    avatarRatio: kind === 'frame' && ratio >= 0.5 && ratio <= 0.95 ? ratio : undefined,
  };
}

const xpMotion = (name?: string): FxMotion => {
  if (name === 'frame-rotating-ornaments') return 'spin';
  if (name === 'frame-particles' || name === 'unlock-confetti') return 'drift';
  if (name === 'badge-shine' || name === 'unlock-burst') return 'twinkle';
  return 'pulse';
};

/** XP40 frame artwork is 512 units wide with a 332-unit avatar opening. */
const XP40_FRAME_AVATAR_RATIO = 332 / 512;

function xpArt(key: string, entry: LegacyXpArtEntry | Xp40Entry): CosmeticArt {
  if (!('collection' in entry)) return { kind: entry.kind, tier: 'xp', source: entry.source };
  const base: CosmeticArtBase = {
    kind: entry.kind,
    tier: 'xp',
    image: entry.image,
    preview: entry.preview,
    Fx: entry.animation.overlay,
    fx: xpMotion(entry.animation.name),
    animation: entry.animation,
    layout: entry.type === 'theme' ? undefined : entry.layout,
    avatarRatio: key.startsWith('xp40.frame_') ? XP40_FRAME_AVATAR_RATIO : undefined,
  };
  // Themes are raster-only; frames, badges and titles draw their SVG.
  return entry.type === 'theme' ? { ...base, source: entry.image } : { ...base, Art: entry.Art };
}

export function cosmeticArt(item: WithAsset, kind?: ArtKind): CosmeticArt | null {
  // Uploaded artwork wins: it is how an admin replaces or adds art without a release.
  const uploaded = uploadedArt(item);
  if (uploaded) return kind && uploaded.kind !== kind ? null : uploaded;
  const key = item?.asset?.key;
  if (typeof key !== 'string') return null;
  const premium = SHOP_DIGITAL_ART[key];
  const xp = XP_ART[key];
  const hit: CosmeticArt | null = premium ? { ...premium, tier: 'premium' } : xp ? xpArt(key, xp) : null;
  if (!hit || (kind && hit.kind !== kind)) return null;
  return hit;
}

export function cosmeticTier(item: WithAsset): CosmeticTier {
  const t = item?.asset?.tier;
  if (t === 'premium' || t === 'xp') return t;
  if (isSafeArtUrl(item?.asset?.imageUrl)) return 'premium';
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
