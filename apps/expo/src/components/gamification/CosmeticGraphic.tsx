/**
 * Draws one cosmetic graphic, whichever form it was bundled in:
 *   - an SVG component (`FC<SvgProps>`, XP40 artwork and XP40 effects);
 *   - an image source (a required .webp file, legacy XP and Premium artwork).
 *
 * Renderers call this instead of branching on `Art` / `source` themselves.
 */
import React, { type FC } from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { SvgProps } from 'react-native-svg';

export type CosmeticGraphicSource = ImageSourcePropType | FC<SvgProps>;
/** How the graphic fills its box: `contain` (default), `cover` (crop) or `stretch`. */
export type GraphicFit = 'contain' | 'cover' | 'stretch';

const SVG_ASPECT: Record<GraphicFit, string | undefined> = {
  contain: undefined,
  cover: 'xMidYMid slice',
  stretch: 'none',
};

/**
 * True for a React component (function, forwardRef or memo object). Image
 * sources are a number (Metro asset id), a `{ uri }` object or an array.
 */
export function isSvgComponent(g: unknown): g is FC<SvgProps> {
  if (typeof g === 'function') return true;
  return !!g && typeof g === 'object' && !Array.isArray(g) && ('render' in g || '$$typeof' in g);
}

/** A single `{ uri }` image source (uploaded artwork), as opposed to a bundled asset id. */
export function isRemoteSource(g: unknown): g is { uri: string } {
  return !!g && typeof g === 'object' && !Array.isArray(g) && typeof (g as any).uri === 'string';
}

export function CosmeticGraphic({
  graphic,
  width,
  height,
  fit = 'contain',
}: {
  graphic: CosmeticGraphicSource;
  width: number | string;
  height: number | string;
  fit?: GraphicFit;
}) {
  if (isSvgComponent(graphic)) {
    const Svg = graphic;
    const aspect = SVG_ASPECT[fit];
    return <Svg width={width as any} height={height as any} {...(aspect ? { preserveAspectRatio: aspect } : {})} />;
  }
  // Admin-uploaded artwork (`{ uri }` on our media host): expo-image plays
  // animated WebP on every platform and keeps it in the disk cache, so a frame
  // seen in a feed is not downloaded again for every row.
  if (isRemoteSource(graphic)) {
    return (
      <ExpoImage
        source={graphic}
        style={{ width: width as any, height: height as any }}
        contentFit={fit === 'stretch' ? 'fill' : fit}
        cachePolicy="memory-disk"
        recyclingKey={graphic.uri}
        transition={0}
        accessible={false}
      />
    );
  }
  return <Image source={graphic} style={{ width: width as any, height: height as any }} resizeMode={fit} />;
}

/** A cosmetic's base artwork: the SVG `Art` when present, else the `source` image. */
export function CosmeticArtGraphic({
  art,
  width,
  height,
  fit,
}: {
  art: { Art?: FC<SvgProps>; source?: ImageSourcePropType };
  width: number | string;
  height: number | string;
  fit?: GraphicFit;
}) {
  const graphic = art.Art ?? art.source;
  if (!graphic) return null;
  return <CosmeticGraphic graphic={graphic} width={width} height={height} fit={fit} />;
}
