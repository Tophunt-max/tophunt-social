/**
 * Full-screen ads with the same fallback waterfall as inline slots:
 * interstitials (apps only) and rewarded ads (apps: AdMob with SSV; web: Ad
 * Manager through the watch-token flow).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/hooks/useAuth';
import { emitToast } from '@/src/lib/toastBridge';
import { queueAdEvent, useMonetizationConfig } from '@/src/services/monetization';
import { walletService } from '@/src/services/wallet/walletService';
import { useAppConfig } from '@/src/services/appSettings';
import { showWebRewarded, preloadWebRewarded, type WebRewardedOutcome } from '@/src/services/ads/webRewarded';
import { canShowAd, recordAdShown } from './frequency';
import { noteAdShown, noteFullscreenClosed, recordNetworkResult } from './optimizer';
import { AD_PLATFORM, useAdPlacement, type AdSlotKey, type ResolvedPlacement } from './placements';
import { admobInterstitialReady, preloadAdmobInterstitial, showAdmobInterstitial, showAdmobRewarded } from './providers/admob';

/** Full-screen ads get longer to load than banners (video). */
const FULLSCREEN_MIN_TIMEOUT = 8000;
/** Google's GPT rewarded sample unit, used in test mode on the web. */
const GAM_REWARDED_TEST_UNIT = '/22639388115/rewarded_web_example';

// ------------------------------------------------------------------ interstitial

/**
 * Show one interstitial for a placement, trying each network in order.
 * `onlyIfReady`: show only an ad that is already preloaded (used when the user
 * is leaving a screen, so nobody waits for an ad to load).
 */
export async function showInterstitial(placement: ResolvedPlacement | null, opts: { onlyIfReady?: boolean } = {}): Promise<boolean> {
  if (!placement || placement.format !== 'interstitial' || AD_PLATFORM === 'web') return false;
  if (!canShowAd(placement.slot, placement.rules)) return false;
  for (const a of placement.attempts) {
    if (a.network.type !== 'admob') continue;
    if (opts.onlyIfReady && !admobInterstitialReady(a.unit, a.network.testMode)) continue;
    const variant = placement.variant ?? '-';
    queueAdEvent({ placement: placement.slot, event: 'request', provider: a.network.id, variant });
    const t0 = Date.now();
    const o = await showAdmobInterstitial(a.unit, a.network.testMode, Math.max(a.timeoutMs, FULLSCREEN_MIN_TIMEOUT), (valueMicros, currency) =>
      queueAdEvent({ placement: placement.slot, event: 'paid', provider: a.network.id, variant, valueMicros, currency }),
    );
    if (o === 'shown') {
      queueAdEvent({ placement: placement.slot, event: 'impression', provider: a.network.id, variant });
      recordNetworkResult(a.network.id, true, Date.now() - t0);
      recordAdShown(placement.slot);
      noteAdShown();
      noteFullscreenClosed();
      return true;
    }
    queueAdEvent({ placement: placement.slot, event: 'fail', provider: a.network.id, variant });
    if (o !== 'unsupported') recordNetworkResult(a.network.id, false, null);
    if (o === 'unsupported') return false;
  }
  return false;
}

/**
 * An interstitial for `slot`, preloaded on mount. `show()` never waits for a
 * slow network: it shows a preloaded ad or moves on within the timeout.
 */
export function useInterstitial(slot: AdSlotKey) {
  const placement = useAdPlacement(slot);
  useEffect(() => {
    const first = placement?.attempts.find((a) => a.network.type === 'admob');
    if (first && placement && canShowAd(placement.slot, placement.rules)) preloadAdmobInterstitial(first.unit, first.network.testMode);
  }, [placement]);
  return useCallback(() => showInterstitial(placement, { onlyIfReady: true }), [placement]);
}

// ------------------------------------------------------------------ rewarded

const WEB_OUTCOME_TEXT: Record<Exclude<WebRewardedOutcome, 'granted'>, string> = {
  closed: 'Ad poora nahi hua, isliye reward nahi mila.',
  no_fill: 'Abhi koi ad available nahi hai. Thodi der baad try karo.',
  unsupported: 'Video ads abhi sirf mobile browser par chalte hain. Phone par tophunt.in kholo.',
  blocked: 'Ad load nahi hua. Ad blocker band karke dobara try karo.',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freeLimit = (e: any): string | null => (e?.reason === 'daily_free_limit' && typeof e?.message === 'string' ? e.message : null);

export interface RewardedState {
  /** A rewarded ad can be offered on this device right now. */
  enabled: boolean;
  reward: number;
  cap: number;
  watched: number;
  left: number;
  busy: boolean;
  /** Show an ad; resolves true when a reward was earned. */
  watch: () => Promise<boolean>;
}

/**
 * Rewarded ads for a slot (`earn_rewarded`, `contest_join_rewarded`).
 * Amounts and daily caps come from the server (getDailyTasks); the payout
 * happens on the server only (AdMob SSV, or the web watch token).
 */
export function useRewardedAd(slot: AdSlotKey, onRewarded?: () => void): RewardedState {
  const { user } = useAuth();
  const router = useRouter();
  const mon = useMonetizationConfig();
  const placement = useAdPlacement(slot);
  const { config } = useAppConfig();
  const adPlatformOn = (config as any)?.monetization?.adPlatform?.enabled;
  const tasks = useQuery({ queryKey: ['daily-tasks', user?.uid], queryFn: () => walletService.getDailyTasks(), enabled: !!user?.uid });
  const [busy, setBusy] = useState(false);
  const ads: any = (tasks.data as any)?.ads ?? {};

  // Networks to try, in order, for this platform.
  const attempts = useMemo(() => {
    if (AD_PLATFORM === 'web') {
      const fromPlatform = (placement?.attempts ?? []).filter((a) => a.network.type === 'gam' || a.network.type === 'adx').map((a) => ({ id: a.network.id, unit: a.network.testMode ? GAM_REWARDED_TEST_UNIT : a.unit, testMode: a.network.testMode, timeoutMs: a.timeoutMs }));
      // Older setup: the single unit in "Ads & rewards", handed out by startWebAd.
      return fromPlatform.length ? fromPlatform : [{ id: 'gam', unit: '', testMode: false, timeoutMs: FULLSCREEN_MIN_TIMEOUT }];
    }
    const fromPlatform = (placement?.attempts ?? []).filter((a) => a.network.type === 'admob').map((a) => ({ id: a.network.id, unit: a.unit, testMode: a.network.testMode, timeoutMs: a.timeoutMs }));
    if (fromPlatform.length) return fromPlatform;
    const legacy = mon.ads.units?.[AD_PLATFORM === 'ios' ? 'ios' : 'android']?.rewarded;
    return legacy || mon.ads.mode === 'test' ? [{ id: 'admob', unit: legacy || '', testMode: mon.ads.mode === 'test', timeoutMs: FULLSCREEN_MIN_TIMEOUT }] : [];
  }, [placement, mon.ads.units, mon.ads.mode]);

  const web = AD_PLATFORM === 'web';
  const reward = Number(web ? ads.web?.rewardDiamonds ?? mon.ads.web.rewardDiamonds : ads.rewardDiamonds ?? mon.ads.rewarded.rewardDiamonds) || 0;
  const cap = Number(web ? ads.web?.dailyCap ?? mon.ads.web.dailyCap : ads.dailyCap ?? mon.ads.rewarded.dailyCap) || 0;
  const watched = Number(web ? ads.web?.watchedToday ?? 0 : ads.watchedToday ?? 0);
  const serverOn = web ? ads.web?.enabled === true : (ads.enabled ?? mon.ads.rewarded.enabled) === true;
  // Once the admin runs the ad platform, the slot decides; before that, the
  // single rewarded unit in "Ads & rewards" keeps working.
  const platformManaged = adPlatformOn === true;
  const slotOff = platformManaged && !placement;
  const enabled = !!user && serverOn && attempts.length > 0 && !slotOff;
  const left = Math.max(0, cap - watched);

  useEffect(() => {
    if (web && enabled) preloadWebRewarded();
  }, [web, enabled]);

  const refresh = useCallback(() => {
    void tasks.refetch();
    onRewarded?.();
  }, [tasks, onRewarded]);

  const succeed = (text: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    emitToast(text, 'success');
  };

  const watch = useCallback(async (): Promise<boolean> => {
    if (busy || !user) return false;
    if (!enabled) {
      emitToast('Video ads abhi available nahi hain. Daily tasks se Diamond kamao.', 'info');
      return false;
    }
    if (left <= 0) {
      emitToast('Aaj ke saare ads ho gaye. Kal phir aao!', 'info');
      return false;
    }
    if (placement && !canShowAd(placement.slot, placement.rules)) {
      emitToast('Thodi der baad dobara ad dekho.', 'info');
      return false;
    }
    setBusy(true);
    try {
      if (web) {
        const t0 = Date.now();
        const start = await walletService.startWebAd();
        let outcome: WebRewardedOutcome = 'no_fill';
        let from = '';
        for (const a of attempts) {
          from = a.id;
          queueAdEvent({ placement: slot, event: 'request', provider: a.id });
          outcome = await showWebRewarded(a.unit || start.adUnitPath);
          if (outcome === 'granted') break;
          queueAdEvent({ placement: slot, event: 'fail', provider: a.id });
          if (outcome === 'closed' || outcome === 'unsupported') break;
        }
        if (outcome !== 'granted') {
          emitToast(WEB_OUTCOME_TEXT[outcome], 'info');
          return false;
        }
        queueAdEvent({ placement: slot, event: 'reward_complete', provider: from });
        if (placement) recordAdShown(placement.slot);
        // The server pays only after the minimum watch time (+1s for clock drift).
        const wait = start.minWatchSec * 1000 + 1000 - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        const r = await walletService.claimWebAdReward(start.token);
        succeed(`+${r.reward} Diamond mil gaye!${r.remaining > 0 ? ` Aaj ${r.remaining} ad aur.` : ''}`);
        refresh();
        return true;
      }
      for (const a of attempts) {
        queueAdEvent({ placement: slot, event: 'request', provider: a.id });
        const o = await showAdmobRewarded(a.unit, a.testMode, Math.max(a.timeoutMs, FULLSCREEN_MIN_TIMEOUT), user.uid, (valueMicros, currency) =>
          queueAdEvent({ placement: slot, event: 'paid', provider: a.id, valueMicros, currency }),
        );
        if (o === 'earned' || o === 'closed') noteFullscreenClosed();
        if (o === 'earned') {
          noteAdShown();
          queueAdEvent({ placement: slot, event: 'reward_complete', provider: a.id });
          if (placement) recordAdShown(placement.slot);
          succeed(`Ad poora hua! +${reward} Diamond aa rahe hain`);
          // AdMob calls the Worker; give it a moment, then re-read.
          setTimeout(refresh, 2500);
          return true;
        }
        queueAdEvent({ placement: slot, event: 'fail', provider: a.id });
        if (o === 'closed') {
          emitToast('Ad poora nahi hua, reward nahi mila.', 'info');
          return false;
        }
        if (o === 'unsupported') break;
      }
      emitToast('Abhi koi ad available nahi hai. Thodi der baad try karo.', 'info');
      return false;
    } catch (e: any) {
      if (e?.reason === 'phone_not_verified') {
        emitToast(e.message || 'Pehle mobile number verify karo.', 'info');
        router.push('/profile/manage/verification' as any);
        return false;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      emitToast(freeLimit(e) ?? (e?.message || 'Ad reward nahi mila. Dobara try karo.'), 'error');
      void tasks.refetch();
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, user, enabled, left, placement, web, attempts, slot, reward, refresh, router, tasks]);

  return { enabled, reward, cap, watched, left, busy, watch };
}
