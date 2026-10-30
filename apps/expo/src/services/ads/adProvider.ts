/**
 * The seam between the app and an ad-network SDK.
 *
 * No ad SDK is installed in this build, so `getAdProvider()` returns the
 * unavailable provider: every SDK placement (feed native, interstitial,
 * rewarded) renders nothing and the feed carries on. Direct sponsored posts
 * do not need an SDK and work without this (src/components/home/SponsoredCard.tsx).
 *
 * To turn on AdMob, follow MONETIZATION.md → "Enable AdMob in the app":
 * install `react-native-google-mobile-ads` (needs a dev/EAS build, not Expo
 * Go), add its config plugin with the app ids, implement `AdMobProvider`
 * against this interface (consent via the SDK's UMP API first, then
 * `setRequestConfiguration`), and return it below. Rewarded ads must set
 * `serverSideVerificationOptions.userId` to the Firebase uid: the reward is
 * paid by the Worker's SSV callback, never by the app.
 */

export interface RewardedResult {
  /** The SDK reported the reward was earned. The SERVER still decides whether to credit. */
  earned: boolean;
}

export interface AdProvider {
  readonly name: 'none' | 'admob';
  /** True when the SDK is linked and initialised (after consent). */
  isAvailable(): boolean;
  /** Ask for consent where required. Resolves to whether ads may be requested. */
  ensureConsent(): Promise<boolean>;
  showInterstitial(unitId: string): Promise<boolean>;
  showRewarded(unitId: string, userId: string): Promise<RewardedResult>;
}

const unavailable: AdProvider = {
  name: 'none',
  isAvailable: () => false,
  ensureConsent: async () => false,
  showInterstitial: async () => false,
  showRewarded: async () => ({ earned: false }),
};

export function getAdProvider(): AdProvider {
  return unavailable;
}
