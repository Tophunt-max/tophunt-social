/**
 * Geometry of the Shop home reference mock, and the scale that maps it onto a
 * screen.
 *
 * The mock is a 748 px wide canvas. Every box, gap, radius, icon and image of
 * the Shop home is `ref * u` with `u = contentW / 748` (contentW = window
 * width, capped at 1200), so a phone shows the same grid as the mock (same
 * tiles per row, same proportions) instead of horizontal rails. Fonts scale
 * the same way but never go below a readable floor.
 *
 * Pure (no react-native import) so vitest can load it. The slider helpers
 * carry the 'worklet' directive: Reanimated runs them on the UI thread, plain
 * Node treats the directive as an ignored string.
 */

/** Width of the reference canvas. */
export const MOCK_W = 748;
/** Content column cap on wide screens (TH.maxContentWidth). */
export const MOCK_MAX_CONTENT = 1200;
/** Side margin of the mock (content spans x 26..722). */
export const MOCK_MARGIN = 26;
/** Inner width of the mock (748 - 2 * 26). */
export const MOCK_INNER = MOCK_W - MOCK_MARGIN * 2;

/** Scale factor for a window width: contentW / 748. */
export function mockScale(width: number): number {
  const w = Number.isFinite(width) && width > 0 ? width : MOCK_W;
  return Math.min(w, MOCK_MAX_CONTENT) / MOCK_W;
}

/** A mock length on screen, rounded to a quarter pixel (keeps rows summing to their width). */
export function px(ref: number, u: number): number {
  return Math.round(ref * u * 4) / 4;
}

/** Readable floors for scaled fonts. */
export const FONT_FLOOR = { body: 9, label: 8.5, title: 12 } as const;

/** A mock font size on screen, never below `floor`. */
export function font(ref: number, u: number, floor: number = FONT_FLOOR.body): number {
  return Math.max(floor, Math.round(ref * u * 10) / 10);
}

/**
 * Largest font (≤ `max`) at which `text` fits in `width`, assuming each glyph
 * is about `glyph` em wide (Urbanist Bold caps ≈ 0.64). Never below `floor`.
 */
export function fitFont(text: string, width: number, max: number, floor: number = FONT_FLOOR.title, glyph = 0.64): number {
  const n = Math.max(1, text.length);
  return Math.max(floor, Math.min(max, width / (n * glyph)));
}

// ------------------------------------------------------------------ layout (mock px)

/**
 * Top (y) and height (h) of each element of the mock, top to bottom. The
 * screen stacks them with `marginTop = y - previous bottom`, all scaled by u.
 */
export const MOCK = {
  crown: { y: 14, w: 56, h: 34 },
  header: { y: 36, h: 30, logoW: 26, logoH: 22, word: 21, dpW: 125, diaW: 100, pillH: 30, cart: 26, orders: 30, gap: 8, pillText: 15, pillIcon: 18, badge: 16 },
  title: { y: 68, h: 36, bag: 34, size: 27, tagline: 13.5 },
  tabs: { y: 106, h: 34, radius: 17, inset: 3, text: 14, icon: 15 },
  hero: { y: 147, h: 145, radius: 16 },
  catHead: { y: 302, h: 20 },
  catRow1: { y: 328, h: 58, widths: [136, 136, 136, 136, 136], gap: 4.5 },
  catRow2: { y: 394, h: 58, widths: [136, 128, 124, 96, 92, 80] },
  featHead: { y: 462, h: 20 },
  feat: { y: 486, w: 168, h: 116, gap: 7, radius: 12, cols: 4 },
  trendHead: { y: 611, h: 20 },
  trend: { y: 634, w: 108, h: 76, gap: 6, radius: 10, cols: 6 },
  physHead: { y: 724, h: 20, blockW: 372 },
  phys: { y: 750, w: 116, h: 88, gap: 8, radius: 10, imgH: 54 },
  deals: { y: 724, x: 410, w: 312, h: 124, radius: 12 },
  colHead: { y: 857, h: 20 },
  col: { y: 880, w: 80, h: 62, gap: 7.5, radius: 10, cols: 8 },
  quick: { y: 966, h: 52, radius: 12 },
  bottom: 24,
  sectionTitle: 17,
  sectionIcon: 22,
  sectionLink: 12.5,
} as const;

/**
 * Hero banner, relative to its own top-left (mock x 26, y 147). The left text
 * block is x 14..304, the artwork x 304..696.
 */
export const HERO = {
  w: MOCK_INNER,
  h: 145,
  textX: 14,
  textW: 290,
  badge: { y: 13, h: 18, text: 10.5 },
  title: { y: 33, h: 42, size: 36 },
  caps: { y: 75, h: 18, size: 16 },
  sub: { y: 92, h: 14, size: 12 },
  cta: { y: 106, h: 28, w: 155, size: 13 },
  artX: 304,
  art: 172,
  timer: { x: 559, y: 15, w: 110, h: 22, box: 26, boxH: 30, num: 15, unit: 8 },
  dots: { y: 137, size: 6 },
} as const;

/**
 * Widths of row 2 of the category grid, scaled so the row spans exactly
 * `inner` with `gap` between tiles (the raw mock widths sum to 656 + gaps).
 */
export function rowWidths(widths: readonly number[], inner: number, gap: number): number[] {
  const sum = widths.reduce((a, b) => a + b, 0);
  const free = Math.max(0, inner - gap * (widths.length - 1));
  const k = sum > 0 ? free / sum : 0;
  return widths.map((w) => Math.floor(w * k * 4) / 4);
}

/** `cols` equal cells across `inner` with `gap` between them. */
export function cellWidth(inner: number, cols: number, gap: number): number {
  return Math.floor(((inner - gap * (cols - 1)) / Math.max(1, cols)) * 4) / 4;
}

// ------------------------------------------------------------------ hero slider math

/** Autoplay period of the hero slider. */
export const AUTOPLAY_MS = 4000;
/** A flick faster than this (px/s) moves one slide whatever the distance. */
export const FLICK_VELOCITY = 500;
/** A drag longer than this share of the width moves one slide. */
export const SNAP_SHARE = 0.25;

/** `i` wrapped into 0..n-1 (loop). */
export function wrapIndex(i: number, n: number): number {
  'worklet';
  if (n <= 0) return 0;
  return ((Math.round(i) % n) + n) % n;
}

/**
 * Where slide `i` sits relative to the (fractional) position `pos`, in slide
 * widths, wrapped into [-n/2, n/2) so the loop has no seam: with 4 slides at
 * pos 0, slide 3 waits at -1 (to the left) and slide 1 at +1.
 */
export function slideOffset(i: number, pos: number, n: number): number {
  'worklet';
  if (n <= 1) return i - pos;
  const d = i - pos;
  const half = n / 2;
  return ((((d + half) % n) + n) % n) - half;
}

/**
 * Target position after a drag that started at slide `start` (integer, may be
 * outside 0..n-1 while looping) and moved `dx` px at `vx` px/s, on a slider
 * `width` px wide. Moves at most one slide.
 */
export function snapTarget(start: number, dx: number, vx: number, width: number): number {
  'worklet';
  const w = width > 0 ? width : 1;
  if (Math.abs(vx) >= FLICK_VELOCITY) return start + (vx < 0 ? 1 : -1);
  if (Math.abs(dx) >= w * SNAP_SHARE) return start + (dx < 0 ? 1 : -1);
  return start;
}

/** Shortest signed step from slide `from` to slide `to` on a loop of n (for the dots). */
export function loopDelta(from: number, to: number, n: number): number {
  'worklet';
  if (n <= 1) return 0;
  return slideOffset(to, from, n);
}
