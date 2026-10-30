/**
 * Rewarded video ads on the WEB build, through Google Ad Manager's Google
 * Publisher Tag (GPT). Reference:
 * https://developers.google.com/publisher-tag/samples/display-rewarded-ad
 *
 * GPT only reports "reward granted" in the browser; there is no server-side
 * verification. The Worker therefore pays against a signed watch token with a
 * minimum watch time and its own daily cap (worker lib/webAdReward.ts). This
 * file only shows the ad and says whether GPT granted the reward.
 *
 * Notes from Google's docs:
 *  - Rewarded web ads are only served on mobile-optimised pages with neutral
 *    zoom; on other pages `defineOutOfPageSlot` returns null ("unsupported").
 *  - Same-domain creatives break under a CSP, so safe frames are forced.
 */
import { loadGpt, webAdsSupported } from './gpt';

export type WebRewardedOutcome =
  /** GPT granted the reward (the user watched to the end). */
  | 'granted'
  /** Closed before the reward. */
  | 'closed'
  /** No ad to show right now. */
  | 'no_fill'
  /** This page / device cannot show rewarded ads (desktop, zoom, not web). */
  | 'unsupported'
  /** GPT failed to load (ad blocker, network, CSP). */
  | 'blocked';

/** Give up waiting for an ad to become ready after this long. */
const READY_TIMEOUT_MS = 20_000;

let busy = false;

/** True on the web build, where GPT can run at all. */
export const webRewardedSupported = webAdsSupported;

/** Load GPT ahead of time (e.g. when the Earn page opens) so the tap is fast. */
export function preloadWebRewarded(): void {
  void loadGpt();
}

/**
 * Request and show one rewarded ad for `adUnitPath`. Resolves when the ad is
 * closed, or straight away when there is nothing to show.
 */
export async function showWebRewarded(adUnitPath: string): Promise<WebRewardedOutcome> {
  if (!webAdsSupported()) return 'unsupported';
  if (busy) return 'closed';
  if (!(await loadGpt())) return 'blocked';
  busy = true;
  const gt = (window as any).googletag;
  try {
    return await new Promise<WebRewardedOutcome>((resolve) => {
      gt.cmd.push(() => {
        const slot = gt.defineOutOfPageSlot(adUnitPath, gt.enums.OutOfPageFormat.REWARDED);
        if (!slot) return resolve('unsupported');
        slot.addService(gt.pubads());
        const pubads = gt.pubads();
        let granted = false;
        let done = false;
        const finish = (o: WebRewardedOutcome) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          pubads.removeEventListener('rewardedSlotReady', onReady);
          pubads.removeEventListener('rewardedSlotGranted', onGranted);
          pubads.removeEventListener('rewardedSlotClosed', onClosed);
          pubads.removeEventListener('slotRenderEnded', onRender);
          try {
            gt.destroySlots([slot]);
          } catch {
            // The slot may already be gone.
          }
          resolve(o);
        };
        // The user already chose to watch (they tapped the button with the
        // reward on it), so the ad is shown as soon as it is ready.
        const onReady = (e: any) => {
          if (e.slot !== slot) return;
          clearTimeout(timer);
          e.makeRewardedVisible();
        };
        const onGranted = (e: any) => {
          if (e.slot === slot) granted = true;
        };
        const onClosed = (e: any) => {
          if (e.slot === slot) finish(granted ? 'granted' : 'closed');
        };
        const onRender = (e: any) => {
          if (e.slot === slot && e.isEmpty) finish('no_fill');
        };
        const timer = setTimeout(() => finish('no_fill'), READY_TIMEOUT_MS);
        pubads.addEventListener('rewardedSlotReady', onReady);
        pubads.addEventListener('rewardedSlotGranted', onGranted);
        pubads.addEventListener('rewardedSlotClosed', onClosed);
        pubads.addEventListener('slotRenderEnded', onRender);
        gt.enableServices();
        gt.display(slot);
      });
    });
  } finally {
    busy = false;
  }
}
