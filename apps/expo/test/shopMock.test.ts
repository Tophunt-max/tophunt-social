import { describe, expect, it } from 'vitest';
import {
  FLICK_VELOCITY,
  FONT_FLOOR,
  MOCK,
  MOCK_INNER,
  cellWidth,
  fitFont,
  font,
  loopDelta,
  mockScale,
  px,
  rowWidths,
  slideOffset,
  snapTarget,
  wrapIndex,
} from '@/src/components/shop/premium/mock';

describe('shop mock scale', () => {
  it('u = min(width, 1200) / 748', () => {
    expect(mockScale(748)).toBe(1);
    expect(mockScale(374)).toBe(0.5);
    expect(mockScale(1496)).toBeCloseTo(1200 / 748);
    expect(mockScale(5000)).toBeCloseTo(1200 / 748);
    // Bad input falls back to the mock width.
    expect(mockScale(0)).toBe(1);
    expect(mockScale(Number.NaN)).toBe(1);
  });

  it('px scales and rounds to a quarter pixel', () => {
    expect(px(136, 1)).toBe(136);
    expect(px(136, 0.5)).toBe(68);
    expect(px(10, 0.513)).toBe(5.25);
    expect(px(0, 2)).toBe(0);
  });

  it('font scales but never goes under its floor', () => {
    expect(font(17, 1, FONT_FLOOR.title)).toBe(17);
    expect(font(17, 0.5, FONT_FLOOR.title)).toBe(12);
    expect(font(12, 0.5)).toBe(FONT_FLOOR.body);
    expect(font(11, 0.5, FONT_FLOOR.label)).toBe(8.5);
    expect(font(14, 1.6, FONT_FLOOR.label)).toBeCloseTo(22.4);
    expect(FONT_FLOOR).toEqual({ body: 9, label: 8.5, title: 12 });
  });

  it('fitFont shrinks long titles to the width, between floor and max', () => {
    expect(fitFont('GOLD', 300, 36)).toBe(36);
    const fs = fitFont('LEGENDARYCOLLECTION', 200, 36);
    expect(fs).toBeLessThan(36);
    expect(fs * 19 * 0.64).toBeLessThanOrEqual(200 + 1e-9);
    expect(fitFont('X'.repeat(80), 50, 36)).toBe(FONT_FLOOR.title);
  });

  it('category rows span the inner width; grids keep the mock column counts', () => {
    const u = 0.5;
    const inner = px(MOCK_INNER, u);
    const gap = px(MOCK.catRow1.gap, u);
    for (const ws of [MOCK.catRow1.widths, MOCK.catRow2.widths]) {
      const w = rowWidths(ws, inner, gap);
      expect(w).toHaveLength(ws.length);
      const total = w.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
      expect(total).toBeLessThanOrEqual(inner);
      expect(inner - total).toBeLessThan(ws.length * 0.25 + 1e-9);
    }
    // Row 2 keeps the mock proportions (Victory FX widest, More narrowest).
    const w2 = rowWidths(MOCK.catRow2.widths, 696, 4.5);
    expect(w2[0] / w2[5]).toBeCloseTo(136 / 80, 1);
    // Featured: 4 across, trending: 6, collection: 8, whatever the width.
    for (const width of [320, 375, 768, 1200]) {
      const uu = mockScale(width);
      const inn = px(MOCK_INNER, uu);
      const fw = cellWidth(inn, MOCK.feat.cols, px(MOCK.feat.gap, uu));
      expect(fw * 4 + px(MOCK.feat.gap, uu) * 3).toBeLessThanOrEqual(inn);
      expect(cellWidth(inn, MOCK.col.cols, px(MOCK.col.gap, uu)) * 8).toBeLessThanOrEqual(inn);
    }
  });
});

describe('hero slider math', () => {
  it('wrapIndex loops', () => {
    expect(wrapIndex(0, 4)).toBe(0);
    expect(wrapIndex(4, 4)).toBe(0);
    expect(wrapIndex(5, 4)).toBe(1);
    expect(wrapIndex(-1, 4)).toBe(3);
    expect(wrapIndex(-5, 4)).toBe(3);
    expect(wrapIndex(2.6, 4)).toBe(3);
    expect(wrapIndex(3, 0)).toBe(0);
  });

  it('slideOffset places every slide within [-n/2, n/2) of the position (no seam)', () => {
    expect([0, 1, 2, 3].map((i) => slideOffset(i, 0, 4))).toEqual([0, 1, -2, -1]);
    // Dragging left from the last slide brings slide 0 in from the right.
    expect(slideOffset(0, 3.5, 4)).toBeCloseTo(0.5);
    expect(slideOffset(3, 3.5, 4)).toBeCloseTo(-0.5);
    // Positions outside 0..n-1 while looping.
    expect(slideOffset(1, 5, 4)).toBeCloseTo(0);
    expect(slideOffset(3, -1, 4)).toBeCloseTo(0);
    // Two slides: the other one waits on the side being dragged towards.
    expect(slideOffset(1, -0.3, 2)).toBeCloseTo(-0.7);
    expect(slideOffset(1, 0.3, 2)).toBeCloseTo(0.7);
    expect(slideOffset(0, 0, 1)).toBe(0);
  });

  it('snapTarget moves one slide on a long drag or a flick, else snaps back', () => {
    const W = 300;
    expect(snapTarget(2, -10, 0, W)).toBe(2);
    expect(snapTarget(2, -80, 0, W)).toBe(3);
    expect(snapTarget(2, 80, 0, W)).toBe(1);
    expect(snapTarget(0, 80, 0, W)).toBe(-1);
    expect(snapTarget(2, -10, -FLICK_VELOCITY - 1, W)).toBe(3);
    expect(snapTarget(2, 10, FLICK_VELOCITY, W)).toBe(1);
    // Never more than one slide.
    expect(snapTarget(2, -900, -4000, W)).toBe(3);
    expect(snapTarget(1, 0, 0, 0)).toBe(1);
  });

  it('loopDelta takes the short way round (dots)', () => {
    expect(loopDelta(0, 1, 4)).toBe(1);
    expect(loopDelta(0, 3, 4)).toBe(-1);
    expect(loopDelta(3, 0, 4)).toBe(1);
    expect(Math.abs(loopDelta(0, 2, 4))).toBe(2);
    expect(loopDelta(1, 1, 4)).toBe(0);
    expect(loopDelta(0, 0, 1)).toBe(0);
  });
});
