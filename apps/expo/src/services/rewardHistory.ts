/**
 * Reward History and the 💎 Diamond leaderboard
 * (server: apps/worker/src/lib/rewardHistory.ts).
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { callApi, readApi, readApiLive } from '@/src/services/api';
import type { HistoryTab, RewardHistoryItem } from '@/src/lib/rewardHistory';
import type { XpRankRow } from '@/src/services/gamification';

export type DiamondPeriod = 'day' | 'week' | 'month';

export const REWARD_HISTORY_KEYS = {
  history: (tab: HistoryTab) => ['me', 'rewardHistory', tab] as const,
  diamondBoard: (period: DiamondPeriod) => ['gamification', 'diamondLeaderboard', period] as const,
  myDiamondRank: (period: DiamondPeriod) => ['me', 'diamondRank', period] as const,
};

export function useRewardHistory(tab: HistoryTab, enabled = true) {
  return useInfiniteQuery({
    queryKey: REWARD_HISTORY_KEYS.history(tab),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      callApi('getRewardHistory', { tab, limit: 30, ...(pageParam ? { cursor: pageParam } : {}) }) as Promise<{
        tab: HistoryTab;
        items: RewardHistoryItem[];
        nextCursor: string | null;
      }>,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 20_000,
  });
}

export function useDiamondLeaderboard(period: DiamondPeriod, enabled = true) {
  return useInfiniteQuery({
    queryKey: REWARD_HISTORY_KEYS.diamondBoard(period),
    initialPageParam: '0',
    queryFn: ({ pageParam }) =>
      readApi('/read/leaderboard/diamonds', { period, limit: 25, cursor: pageParam }) as Promise<{
        period: DiamondPeriod;
        active: boolean;
        label: string | null;
        endsAt: number | null;
        rows: XpRankRow[];
        nextCursor: string | null;
      }>,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
  });
}

export function useMyDiamondRank(period: DiamondPeriod, enabled: boolean) {
  return useQuery({
    queryKey: REWARD_HISTORY_KEYS.myDiamondRank(period),
    queryFn: () => readApiLive(`/read/leaderboard/diamonds/me?period=${period}`) as Promise<{ rank: number | null; score: number }>,
    enabled,
    staleTime: 30_000,
  });
}
