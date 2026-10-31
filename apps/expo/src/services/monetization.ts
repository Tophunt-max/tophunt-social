/**
 * Client for gifts, the digital store, sponsored posts and ad diagnostics.
 *
 * The server decides every price, balance and entitlement. The app only shows
 * the price it was given and sends it back (`expectedUnitPrice` /
 * `expectedPrice`) so the server can refuse if it changed. Each purchase or
 * send carries a `requestId` made once per user tap: a network retry of the
 * same tap is then answered with the original result, never a second charge.
 */
import { useMemo } from 'react';
import { Platform } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi, readApi } from '@/src/services/api';
import { useAppConfig } from '@/src/services/appSettings';
import type { SlotRule, SponsoredCampaign } from '@/src/lib/adSlots';
import { GAMIFICATION_KEYS } from '@/src/services/gamification';

// ------------------------------------------------------------------ config

export interface MonetizationPublicConfig {
  ads: {
    enabled: boolean;
    mode: 'test' | 'production';
    provider: 'none' | 'admob';
    units: Record<'android' | 'ios', { native: string; interstitial: string; rewarded: string }>;
    sessionMaxAds: number;
    requireConsent: boolean;
    feedNative: SlotRule & { enabled: boolean };
    shortVideo: { enabled: boolean; interval: number; maxPerSession: number };
    interstitial: { enabled: boolean; minIntervalSec: number; maxPerSession: number; maxPerHour: number };
    rewarded: { enabled: boolean; rewardDiamonds: number; dailyCap: number };
    /** Rewarded ads on the web build (Google Ad Manager). Paid by the Worker against a watch token. */
    web: { enabled: boolean; adUnitPath: string; rewardDiamonds: number; dailyCap: number; minWatchSec: number; requireVerifiedPhone: boolean };
  };
  sponsored: SlotRule & { enabled: boolean };
  gifts: { enabled: boolean; maxQuantity: number; maxCoinsPerSend: number };
  store: { enabled: boolean };
  shop: { enabled: boolean };
  earning: { xpConversion: { enabled: boolean; xpPerDiamond: number; maxDiamondsPerDay: number } };
}

/** Everything off until the server says otherwise (older servers send nothing). */
const OFF: MonetizationPublicConfig = {
  ads: {
    enabled: false,
    mode: 'test',
    provider: 'none',
    units: { android: { native: '', interstitial: '', rewarded: '' }, ios: { native: '', interstitial: '', rewarded: '' } },
    sessionMaxAds: 0,
    requireConsent: true,
    feedNative: { enabled: false, firstPosition: 4, interval: 8, maxPerSession: 0 },
    shortVideo: { enabled: false, interval: 6, maxPerSession: 0 },
    interstitial: { enabled: false, minIntervalSec: 300, maxPerSession: 0, maxPerHour: 0 },
    rewarded: { enabled: false, rewardDiamonds: 0, dailyCap: 0 },
    web: { enabled: false, adUnitPath: '', rewardDiamonds: 0, dailyCap: 0, minWatchSec: 15, requireVerifiedPhone: true },
  },
  sponsored: { enabled: false, firstPosition: 3, interval: 12, maxPerSession: 0 },
  gifts: { enabled: false, maxQuantity: 1, maxCoinsPerSend: 0 },
  store: { enabled: false },
  shop: { enabled: false },
  earning: { xpConversion: { enabled: false, xpPerDiamond: 100, maxDiamondsPerDay: 0 } },
};

export function useMonetizationConfig(): MonetizationPublicConfig {
  const { config } = useAppConfig();
  const m = (config as any)?.monetization;
  // Stable identity while the config is unchanged, so lists built from it don't re-render.
  return useMemo(
    () =>
      m && typeof m === 'object'
        ? { ...OFF, ...m, ads: { ...OFF.ads, ...(m.ads ?? {}), web: { ...OFF.ads.web, ...(m.ads?.web ?? {}) } }, earning: { xpConversion: { ...OFF.earning.xpConversion, ...(m.earning?.xpConversion ?? {}) } } }
        : OFF,
    [m],
  );
}

/** A fresh id for one user action (one tap = one id, reused on retries of that tap). */
export function newRequestId(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ------------------------------------------------------------------ gifts

export interface GiftView {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCoins: number;
  asset: { emoji?: string; imageUrl?: string; lottieUrl?: string };
  animation: { style?: string };
}

export interface GiftSendResult {
  id: string;
  giftName: string;
  quantity: number;
  totalCoins: number;
  diamondsSpent: number;
  replayed: boolean;
}

export const MONETIZATION_KEYS = {
  gifts: ['gift-catalog'] as const,
  giftHistory: (d: 'sent' | 'received') => ['gift-history', d] as const,
  giftWall: (uid: string) => ['gift-wall', uid] as const,
  store: ['digital-store'] as const,
  sponsored: ['sponsored-feed'] as const,
};

export function useGiftCatalog(enabled: boolean) {
  return useQuery({
    queryKey: MONETIZATION_KEYS.gifts,
    queryFn: async () => ((await callApi('getGiftCatalog')) as { gifts: GiftView[] }).gifts,
    enabled,
    staleTime: 60_000,
  });
}

export function useSendGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { recipientUid: string; gift: GiftView; quantity: number; requestId: string; contextType?: string; contextId?: string }) =>
      callApi(
        'sendGift',
        {
          recipientUid: v.recipientUid,
          giftId: v.gift.id,
          quantity: v.quantity,
          expectedUnitPrice: v.gift.priceCoins,
          requestId: v.requestId,
          contextType: v.contextType ?? 'profile',
          contextId: v.contextId,
        },
        // Safe to retry: the server de-duplicates on requestId.
        { retries: 1 },
      ) as Promise<{ success: true; gift: GiftSendResult }>,
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['gift-history'] });
      qc.invalidateQueries({ queryKey: MONETIZATION_KEYS.giftWall(v.recipientUid) });
    },
  });
}

export function useGiftHistory(direction: 'sent' | 'received', enabled = true) {
  return useInfiniteQuery({
    queryKey: MONETIZATION_KEYS.giftHistory(direction),
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      callApi('getGiftHistory', { direction, cursor: pageParam, limit: 30 }) as Promise<{
        items: { id: string; giftId: string; giftName: string; quantity: number; totalCoins: number; counterpartUid: string; createdAt: number }[];
        nextCursor: number | null;
      }>,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export function useGiftWall(uid: string, enabled: boolean) {
  return useQuery({
    queryKey: MONETIZATION_KEYS.giftWall(uid),
    queryFn: () => readApi(`/read/users/${encodeURIComponent(uid)}/gift-wall`) as Promise<{ totalGifts: number; supporters: number; gifts: { giftId: string; name: string; count: number }[] }>,
    enabled: enabled && !!uid,
    staleTime: 60_000,
  });
}

// ------------------------------------------------------------------ store

export interface StoreItemView {
  itemId: string;
  type: string;
  name: string;
  description: string;
  rarity: string;
  asset: Record<string, any>;
  priceCoins: number;
  ownership: 'permanent';
  refundable: boolean;
  remaining: number | null;
  endsAt: number | null;
  owned: boolean;
}

export function useStore(enabled: boolean) {
  return useQuery({
    queryKey: MONETIZATION_KEYS.store,
    queryFn: async () => ((await callApi('getStore')) as { items: StoreItemView[] }).items,
    enabled,
    staleTime: 30_000,
  });
}

export function useBuyStoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { item: StoreItemView; requestId: string }) =>
      callApi('buyStoreItem', { itemId: v.item.itemId, expectedPrice: v.item.priceCoins, requestId: v.requestId }, { retries: 1 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MONETIZATION_KEYS.store });
      qc.invalidateQueries({ queryKey: GAMIFICATION_KEYS.inventory });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ------------------------------------------------------------------ sponsored + diagnostics

export function useSponsoredCampaigns(enabled: boolean) {
  return useQuery({
    queryKey: MONETIZATION_KEYS.sponsored,
    queryFn: async () => ((await readApi('/read/sponsored', { placement: 'feed' })) as { campaigns: SponsoredCampaign[] }).campaigns,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Count a sponsored impression or click. Never throws: delivery stats must not break the feed. */
export function recordSponsoredEvent(campaignId: string, event: 'impression' | 'click'): void {
  callApi('recordSponsoredEvent', { campaignId, event }).catch(() => undefined);
}

type AdEvent = { placement: string; event: string; provider: string; count?: number };
let pending: AdEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Queue an ad-SDK diagnostic event; sent in batches every 30 s (fail-open). */
export function queueAdEvent(e: AdEvent): void {
  pending.push(e);
  if (pending.length >= 20) void flushAdEvents();
  else if (!flushTimer) flushTimer = setTimeout(() => void flushAdEvents(), 30_000);
}

export async function flushAdEvents(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const batch = pending.splice(0, 25);
  if (!batch.length) return;
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  await callApi('recordAdEvents', { platform, events: batch }).catch(() => undefined);
}
