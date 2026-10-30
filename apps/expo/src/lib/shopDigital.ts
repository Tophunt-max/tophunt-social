/**
 * Resolve a cosmetic's `asset.key` to the bundled Shop artwork
 * (apps/expo/assets/shop/digital). Items without a `shop.*` key (the level
 * rewards from migration 0070) keep their vector rendering.
 */
import { SHOP_DIGITAL_ART, type ShopArtKind } from '@/assets/shop/digital';

export type { ShopArtKind };

export function shopArt(item: { asset?: Record<string, any> | null } | null | undefined, kind?: ShopArtKind) {
  const key = item?.asset?.key;
  if (typeof key !== 'string') return null;
  const hit = SHOP_DIGITAL_ART[key];
  if (!hit || (kind && hit.kind !== kind)) return null;
  return hit;
}

/**
 * Avatar diameter inside a Shop frame of outer size `box`: the artwork's
 * avatar circle is r=50 in a 120-unit box.
 */
export const SHOP_FRAME_AVATAR_RATIO = 100 / 120;
