/**
 * AdMob / Ad Manager in the Android and iOS apps (react-native-google-mobile-ads).
 *
 * - Consent first: Google's UMP form where the law requires it, then the SDK
 *   starts. Nothing is requested before `ensureMobileAds()` says yes.
 * - Test mode swaps every unit for Google's published test unit, so a network
 *   can be wired and checked before its account is approved.
 * - Rewarded ads set the SSV user id: the reward is paid by AdMob's server
 *   callback to the Worker (lib/admobSsv.ts), never by this file.
 *
 * Needs a build that contains the SDK (EAS / GitHub release). In Expo Go the
 * native module is missing; every call then reports 'unsupported'.
 */
import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
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
  /** Impression-level revenue (AdMob onPaid), in micros of `currency`. */
  onPaid?: (valueMicros: number, currency: string) => void;
}
export type FullscreenOutcome = 'shown' | 'earned' | 'closed' | 'no_fill' | 'unsupported' | 'error';
/** Impression-level revenue callback (micros of `currency`). */
export type PaidCallback = (valueMicros: number, currency: string) => void;
const paidOf = (cb?: PaidCallback) => (e: any) => cb?.(Math.round(Number(e?.value) * 1_000_000), String(e?.currency || ''));

let sdk: any = null;
function lib(): any {
  if (sdk !== null) return sdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('react-native-google-mobile-ads');
  } catch {
    sdk = false;
  }
  return sdk;
}

let starting: Promise<boolean> | null = null;

/** Ask for consent where required, then start the SDK. Resolves whether ads may be requested. */
export function ensureMobileAds(): Promise<boolean> {
  const m = lib();
  if (!m) return Promise.resolve(false);
  if (!starting) {
    starting = (async () => {
      try {
        const info = await m.AdsConsent.gatherConsent();
        if (info && info.canRequestAds === false) return false;
      } catch {
        // UMP not configured in AdMob yet: Google treats the request as not
        // needing consent outside regulated regions. Carry on.
      }
      // iOS: ask for tracking permission (ATT) after the consent form and before
      // the SDK starts, so the first requests already carry the answer. "No" is
      // fine: ads stay non-personalised.
      if (Platform.OS === 'ios') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const att = require('expo-tracking-transparency');
          const cur = await att.getTrackingPermissionsAsync();
          if (cur?.status === 'undetermined' && cur?.canAskAgain !== false) await att.requestTrackingPermissionsAsync();
        } catch {
          // Module missing in an older build: carry on without ATT.
        }
      }
      try {
        await m.default().initialize();
        return true;
      } catch {
        return false;
      }
    })();
    // A refusal or failure may change later (consent given, network back).
    void starting.then((ok) => {
      if (!ok) starting = null;
    });
  }
  return starting;
}

function testUnit(m: any, networkType: 'admob' | 'gam', kind: 'banner' | 'interstitial' | 'rewarded'): string {
  if (networkType === 'gam') return kind === 'banner' ? m.TestIds.GAM_BANNER : kind === 'interstitial' ? m.TestIds.GAM_INTERSTITIAL : m.TestIds.GAM_REWARDED;
  return kind === 'banner' ? m.TestIds.ADAPTIVE_BANNER || m.TestIds.BANNER : kind === 'interstitial' ? m.TestIds.INTERSTITIAL : m.TestIds.REWARDED;
}

/** Inline banner / native slot (native ads render as a medium rectangle). */
export function AdmobInline({ unit, format, networkType, testMode, compact, onLoad, onFail, onClick, onPaid }: AdmobInlineProps) {
  const m = lib();
  const [ready, setReady] = React.useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    if (!m) {
      onFail('unsupported');
      return;
    }
    void ensureMobileAds().then((ok) => {
      if (!alive) return;
      setReady(ok);
      if (!ok) onFail('no_consent');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!m || !ready) return null;
  const Banner = networkType === 'gam' ? m.GAMBannerAd : m.BannerAd;
  const size = compact ? m.BannerAdSize.BANNER : format === 'native' ? m.BannerAdSize.MEDIUM_RECTANGLE : m.BannerAdSize.INLINE_ADAPTIVE_BANNER;
  const props: any = {
    unitId: testMode ? testUnit(m, networkType, 'banner') : unit,
    onAdLoaded: () => onLoad(),
    onAdFailedToLoad: (e: any) => onFail(String(e?.code || e?.message || 'error').includes('no-fill') ? 'no_fill' : 'error'),
    onAdOpened: () => onClick?.(),
    onPaid: (e: any) => onPaid?.(Math.round(Number(e?.value) * 1_000_000), String(e?.currency || '')),
  };
  if (networkType === 'gam') props.sizes = [size];
  else props.size = size;
  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <Banner {...props} />
    </View>
  );
}

/** Load one full-screen ad, show it, and resolve how it ended. */
function runFullscreen(ad: any, m: any, rewarded: boolean, timeoutMs: number, onPaid?: PaidCallback): Promise<FullscreenOutcome> {
  return new Promise<FullscreenOutcome>((resolve) => {
    let done = false;
    let earned = false;
    const subs: (() => void)[] = [];
    const finish = (o: FullscreenOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subs.forEach((u) => u());
      resolve(o);
    };
    const timer = setTimeout(() => finish('no_fill'), timeoutMs);
    subs.push(
      ad.addAdEventListener(rewarded ? m.RewardedAdEventType.LOADED : m.AdEventType.LOADED, () => {
        clearTimeout(timer);
        try {
          ad.show();
        } catch {
          finish('error');
        }
      }),
    );
    if (rewarded) subs.push(ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => (earned = true)));
    if (onPaid) subs.push(ad.addAdEventListener(m.AdEventType.PAID, paidOf(onPaid)));
    subs.push(ad.addAdEventListener(m.AdEventType.ERROR, (e: any) => finish(String(e?.code || e?.message || '').includes('no-fill') ? 'no_fill' : 'error')));
    subs.push(ad.addAdEventListener(m.AdEventType.CLOSED, () => finish(rewarded ? (earned ? 'earned' : 'closed') : 'shown')));
    ad.load();
  });
}

const preloaded = new Map<string, any>();

/** Preload an interstitial so a later show is instant. */
export function preloadAdmobInterstitial(unit: string, testMode: boolean): void {
  const m = lib();
  if (!m) return;
  const id = testMode ? testUnit(m, 'admob', 'interstitial') : unit;
  if (preloaded.has(id)) return;
  void ensureMobileAds().then((ok) => {
    if (!ok) return;
    const ad = m.InterstitialAd.createForAdRequest(id);
    preloaded.set(id, ad);
    const off = ad.addAdEventListener(m.AdEventType.ERROR, () => {
      preloaded.delete(id);
      off();
    });
    ad.load();
  });
}

/** True when a preloaded interstitial for this unit is ready to show. */
export function admobInterstitialReady(unit: string, testMode: boolean): boolean {
  const m = lib();
  if (!m) return false;
  return !!preloaded.get(testMode ? testUnit(m, 'admob', 'interstitial') : unit)?.loaded;
}

/** Load and show one interstitial. */
export async function showAdmobInterstitial(unit: string, testMode: boolean, timeoutMs: number, onPaid?: PaidCallback): Promise<FullscreenOutcome> {
  const m = lib();
  if (!m) return 'unsupported';
  if (!(await ensureMobileAds())) return 'unsupported';
  const id = testMode ? testUnit(m, 'admob', 'interstitial') : unit;
  const ready = preloaded.get(id);
  preloaded.delete(id);
  if (ready?.loaded) {
    return new Promise((resolve) => {
      const offPaid = onPaid ? ready.addAdEventListener(m.AdEventType.PAID, paidOf(onPaid)) : () => undefined;
      const off = ready.addAdEventListener(m.AdEventType.CLOSED, () => {
        off();
        offPaid();
        resolve('shown');
      });
      try {
        ready.show();
      } catch {
        off();
        resolve('error');
      }
    });
  }
  return runFullscreen(m.InterstitialAd.createForAdRequest(id), m, false, timeoutMs, onPaid);
}

/** Load and show one rewarded ad; the reward is paid by AdMob SSV to the Worker for `userId`. */
export async function showAdmobRewarded(unit: string, testMode: boolean, timeoutMs: number, userId: string, onPaid?: PaidCallback): Promise<FullscreenOutcome> {
  const m = lib();
  if (!m) return 'unsupported';
  if (!(await ensureMobileAds())) return 'unsupported';
  const id = testMode ? testUnit(m, 'admob', 'rewarded') : unit;
  const ad = m.RewardedAd.createForAdRequest(id, { serverSideVerificationOptions: { userId } });
  return runFullscreen(ad, m, true, timeoutMs, onPaid);
}

// ------------------------------------------------------------------ app open

let appOpen: { id: string; ad: any; loadedAt: number } | null = null;
/** Google: an app open ad is stale 4 hours after it loaded. */
const APP_OPEN_TTL_MS = 4 * 3600_000;

/** Load an app open ad in the background, for the next time the app comes back. */
export function preloadAdmobAppOpen(unit: string, testMode: boolean): void {
  const m = lib();
  if (!m) return;
  const id = testMode ? m.TestIds.APP_OPEN || 'ca-app-pub-3940256099942544/9257395921' : unit;
  const have = appOpen;
  if (have && have.id === id && Date.now() - have.loadedAt < APP_OPEN_TTL_MS) return;
  void ensureMobileAds().then((ok) => {
    if (!ok) return;
    const ad = m.AppOpenAd.createForAdRequest(id);
    const offLoaded = ad.addAdEventListener(m.AdEventType.LOADED, () => {
      appOpen = { id, ad, loadedAt: Date.now() };
      offLoaded();
    });
    const offErr = ad.addAdEventListener(m.AdEventType.ERROR, () => {
      offErr();
    });
    ad.load();
  });
}

/** Show the preloaded app open ad if it is fresh. Never waits for a load. */
export function showAdmobAppOpen(onPaid?: PaidCallback): Promise<FullscreenOutcome> {
  const m = lib();
  const cur = appOpen;
  if (!m || !cur || Date.now() - cur.loadedAt > APP_OPEN_TTL_MS) return Promise.resolve('no_fill');
  appOpen = null;
  return new Promise((resolve) => {
    const offPaid = onPaid ? cur.ad.addAdEventListener(m.AdEventType.PAID, paidOf(onPaid)) : () => undefined;
    const off = cur.ad.addAdEventListener(m.AdEventType.CLOSED, () => {
      off();
      offPaid();
      resolve('shown');
    });
    try {
      cur.ad.show();
    } catch {
      off();
      offPaid();
      resolve('error');
    }
  });
}
