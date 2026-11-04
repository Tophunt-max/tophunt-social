/**
 * Special events client (server: apps/worker/src/lib/rewardEvents.ts).
 * Progress and claimability come from the server; the app only displays them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '@/src/services/api';

export type EventPhase = 'scheduled' | 'live' | 'ended';

export interface EventTaskView {
  id: string;
  title: string;
  metric: string;
  target: number;
  coins: number;
  progress: number;
  claimed: boolean;
  claimable: boolean;
}

export interface RewardEventView {
  id: string;
  title: string;
  description: string;
  bannerUrl: string | null;
  phase: EventPhase;
  startsAt: number;
  endsAt: number;
  claimUntil: number;
  joined: boolean;
  joinedAt: number | null;
  /** Why the user cannot take part (level, account age, verification), or null. */
  blockedReason: string | null;
  budgetLeft: number | null;
  totalCoins: number;
  tasks: EventTaskView[];
}

export const EVENTS_KEY = ['earning', 'events'] as const;

export function useEvents(enabled = true) {
  return useQuery({
    queryKey: EVENTS_KEY,
    queryFn: () => callApi('getEvents') as Promise<{ events: RewardEventView[] }>,
    enabled,
    staleTime: 20_000,
  });
}

export function useJoinEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => callApi('joinEvent', { eventId }) as Promise<{ joined: boolean }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}

export function useClaimEventTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { eventId: string; taskId: string }) => callApi('claimEventTask', v) as Promise<{ diamonds: number }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EVENTS_KEY });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export { featuredEvent } from '@/src/lib/rewardsCenter';
