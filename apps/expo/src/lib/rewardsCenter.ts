/**
 * Pure helpers for the Rewards Center screen (app/earn/index.tsx), kept out of
 * the route file so they can be unit tested without React Native.
 */
import type { AchievementView } from '@/src/services/gamification';

// Server error copy (same rules as the wallet screen).
const freeRewardsOut = (e: any) => typeof e?.message === 'string' && e.message.toLowerCase().includes('free rewards khatam');
const dailyFreeLimit = (e: any): string | null => (e?.reason === 'daily_free_limit' && typeof e?.message === 'string' ? e.message : null);
export const errorText = (e: any, fallback: string) =>
  dailyFreeLimit(e) ?? (freeRewardsOut(e) ? 'Aaj ke free rewards khatam ho gaye hain. Thodi der baad try karo.' : e?.message || fallback);

/** "2d 4h" / "3h 10m" / "12m" until `to`; null without a time. */
export const countdown = (to: number | null | undefined, now = Date.now()) => {
  if (!to) return null;
  const mins = Math.max(0, Math.floor((to - now) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
};

/** Where a mission's Go button takes the user (the action that advances it). */
export function missionRoute(kind: string): string | 'watch' | 'checkin' {
  if (kind === 'ads') return 'watch';
  if (kind === 'checkins' || kind === 'active_days') return 'checkin';
  if (kind === 'vote' || kind === 'votes' || kind === 'like' || kind === 'xp') return '/';
  if (kind === 'follow') return '/explore/search';
  return '/explore/battles';
}

/** The achievements to show: closest to unlocking first, then the latest unlocks. */
export function pickAchievements(list: AchievementView[], n = 4): AchievementView[] {
  const ratio = (a: AchievementView) => (a.target && a.progress != null ? a.progress / a.target : 0);
  const locked = list.filter((a) => !a.unlocked).sort((a, b) => ratio(b) - ratio(a));
  const done = list.filter((a) => a.unlocked).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0));
  return [...locked, ...done].slice(0, n);
}

/** The streak strip shows at most seven days (the reference card). */
export const streakDays = <T,>(track: T[]): T[] => track.slice(0, 7);

/** The event the Rewards Center banner shows: live (ending soonest) first, then the soonest scheduled. */
export function featuredEvent<T extends { phase: string; startsAt: number; endsAt: number }>(list: T[]): T | null {
  const live = list.filter((e) => e.phase === 'live').sort((a, b) => a.endsAt - b.endsAt);
  if (live.length) return live[0];
  const soon = list.filter((e) => e.phase === 'scheduled').sort((a, b) => a.startsAt - b.startsAt);
  return soon[0] ?? list[0] ?? null;
}
