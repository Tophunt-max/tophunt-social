import { describe, expect, it } from 'vitest';
import { countdown, errorText, missionRoute, pickAchievements, streakDays } from '@/src/lib/rewardsCenter';

const ach = (id: string, over: any = {}) => ({ id, name: id, description: '', icon: '', category: '', rarity: 'common', xpReward: 10, itemId: null, repeatable: false, tier: 0, maxTier: 1, unlocked: false, unlockedAt: null, progress: 0, target: 10, endsAt: null, ...over });

describe('rewards center helpers', () => {
  it('routes each mission kind to the action that advances it', () => {
    expect(missionRoute('vote')).toBe('/');
    expect(missionRoute('votes')).toBe('/');
    expect(missionRoute('follow')).toBe('/explore/search');
    expect(missionRoute('share')).toBe('/explore/battles');
    expect(missionRoute('entries')).toBe('/explore/battles');
    expect(missionRoute('ads')).toBe('watch');
    expect(missionRoute('checkins')).toBe('checkin');
  });

  it('shows the achievements closest to unlocking, then recent unlocks', () => {
    const list = [ach('a', { progress: 1 }), ach('b', { progress: 9 }), ach('c', { unlocked: true, unlockedAt: 5 }), ach('d', { progress: 5 }), ach('e', { unlocked: true, unlockedAt: 9 })];
    expect(pickAchievements(list as any).map((a) => a.id)).toEqual(['b', 'd', 'a', 'e']);
  });

  it('formats countdowns and server errors', () => {
    expect(countdown(null)).toBeNull();
    expect(countdown(1_000 + 3 * 86_400_000 + 2 * 3_600_000, 1_000)).toBe('3d 2h');
    expect(countdown(1_000 + 90 * 60_000, 1_000)).toBe('1h 30m');
    expect(errorText({ reason: 'daily_free_limit', message: 'Limit hit' }, 'x')).toBe('Limit hit');
    expect(errorText({ message: 'Free rewards khatam' }, 'x')).toMatch(/khatam ho gaye/);
    expect(errorText({}, 'fallback')).toBe('fallback');
  });

  it('caps the streak strip at seven days', () => {
    expect(streakDays([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

import { featuredEvent } from '@/src/lib/rewardsCenter';
describe('featured event', () => {
  const ev = (id: string, phase: string, startsAt: number, endsAt: number) => ({ id, phase, startsAt, endsAt } as any);
  it('prefers the live event ending soonest, then the next scheduled one', () => {
    expect(featuredEvent([ev('a', 'scheduled', 5, 9), ev('b', 'live', 1, 20), ev('c', 'live', 1, 10)])?.id).toBe('c');
    expect(featuredEvent([ev('a', 'scheduled', 9, 19), ev('b', 'scheduled', 5, 9)])?.id).toBe('b');
    expect(featuredEvent([])).toBeNull();
  });
});

describe('safeArtUrl', () => {
  it('allows plain https image URLs only', async () => {
    const { safeArtUrl } = await import('@/src/lib/rewardsCenter');
    expect(safeArtUrl('https://media.tophunt.in/earning-assets/2026/11/abc.webp')).toBe('https://media.tophunt.in/earning-assets/2026/11/abc.webp');
    expect(safeArtUrl('http://media.tophunt.in/x.webp')).toBeNull();
    expect(safeArtUrl('https://user:pw@evil.test/x.webp')).toBeNull();
    expect(safeArtUrl('javascript:alert(1)')).toBeNull();
    expect(safeArtUrl('https://a.test/x y.webp')).toBeNull();
    expect(safeArtUrl(undefined)).toBeNull();
  });
});
