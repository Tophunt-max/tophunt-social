import { describe, expect, it } from 'vitest';
import { roadmapWindow } from '@/src/lib/gamificationAssets';

const rm = (current: number, extra: Record<number, string> = {}) =>
  Array.from({ length: 100 }, (_, i) => ({ level: i + 1, unlocked: i + 1 <= current, rewardState: extra[i + 1] ?? 'none' }));

describe('level roadmap window', () => {
  it('at level 2, folds level 1, shows level 2, focuses level 3 and a few after', () => {
    const w = roadmapWindow(rm(2));
    expect(w.currentLevel).toBe(2);
    expect(w.nextLevel).toBe(3);
    expect(w.rows.map((r) => r.level)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(w.pastHidden).toBe(1);
    expect(w.futureHidden).toBe(93);
  });

  it('moves on by itself: at level 3 the focus is level 4', () => {
    expect(roadmapWindow(rm(3)).nextLevel).toBe(4);
  });

  it('keeps a reached level with a claimable reward visible', () => {
    const w = roadmapWindow(rm(10, { 4: 'claimable' }));
    expect(w.rows.map((r) => r.level).slice(0, 2)).toEqual([4, 10]);
  });

  it('expands to all 100 levels', () => {
    expect(roadmapWindow(rm(2), { showPast: true, showFuture: true }).rows).toHaveLength(100);
    const max = roadmapWindow(rm(100));
    expect(max).toMatchObject({ nextLevel: null, futureHidden: 0 });
    expect(max.rows.map((r) => r.level)).toEqual([100]);
  });
});
