/**
 * AdMob / Ad Manager through the Google Mobile Ads SDK: apps only. This is the
 * web (and fallback) build of the module, which shows nothing; the real one is
 * admob.native.tsx (Metro picks it on Android / iOS). Both export the same API.
 */
import type { AdFormat } from '../placements';

export interface AdmobInlineProps {
  unit: string;
  format: AdFormat;
  networkType: 'admob' | 'gam';
  testMode: boolean;
  /** One-line 320×50 banner. */
  compact?: boolean;
  onLoad: () => void;
  onFail: (reason: string) => void;
  onClick?: () => void;
}

/** Inline banner / native slot. */
export function AdmobInline(props: AdmobInlineProps): null {
  props.onFail('unsupported');
  return null;
}

/** Ask for consent where required, then start the SDK. Resolves whether ads may be requested. */
export async function ensureMobileAds(): Promise<boolean> {
  return false;
}

export type FullscreenOutcome = 'shown' | 'earned' | 'closed' | 'no_fill' | 'unsupported' | 'error';

/** Load and show one interstitial. */
export async function showAdmobInterstitial(_unit: string, _testMode: boolean, _timeoutMs: number): Promise<FullscreenOutcome> {
  return 'unsupported';
}

/** Load and show one rewarded ad; the reward is paid by AdMob SSV to the Worker for `userId`. */
export async function showAdmobRewarded(_unit: string, _testMode: boolean, _timeoutMs: number, _userId: string): Promise<FullscreenOutcome> {
  return 'unsupported';
}

/** Preload an interstitial so a later show is instant. */
export function preloadAdmobInterstitial(_unit: string, _testMode: boolean): void {}

/** True when a preloaded interstitial for this unit is ready to show. */
export function admobInterstitialReady(_unit: string, _testMode: boolean): boolean {
  return false;
}
