/**
 * Google Publisher Tag (Google Ad Manager) loader for the WEB build, shared by
 * rewarded ads (webRewarded.ts) and display slots (src/ads/providers/web.tsx).
 * Loaded on demand, once, and only on the web.
 */
import { Platform } from 'react-native';

const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';

let loading: Promise<boolean> | null = null;
let consentPub = '';
let consentLoaded = false;

/** The web consent message's publisher id ("pub-…"), from Ad platform → Web consent. */
export function setWebConsentPublisher(pub: string): void {
  consentPub = /^pub-\d{16}$/.test(pub) ? pub : '';
}

/**
 * Google's consent message (Privacy & messaging / Funding Choices, IAB TCF v2.2).
 * Loaded before any ad tag; GPT and AdSense then read the consent string through
 * __tcfapi themselves. Google's documented snippet, as code.
 */
export function ensureWebConsent(): void {
  if (!webAdsSupported() || consentLoaded || !consentPub) return;
  consentLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://fundingchoicesmessages.google.com/i/${consentPub}?ers=1`;
  document.head.appendChild(s);
  const signal = () => {
    if ((window as any).frames?.googlefcPresent) return;
    if (!document.body) return void setTimeout(signal, 0);
    const f = document.createElement('iframe');
    f.style.cssText = 'width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;display:none';
    f.name = 'googlefcPresent';
    document.body.appendChild(f);
  };
  signal();
}

/** True on the web build, where GPT can run at all. */
export const webAdsSupported = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';

/** The `googletag` global once GPT is loaded (typed loosely: GPT ships no types here). */
export const googletag = (): any => (webAdsSupported() ? (window as any).googletag : null);

/** Load gpt.js once. Resolves false when it cannot load (ad blocker, network, CSP). */
export function loadGpt(): Promise<boolean> {
  if (!webAdsSupported()) return Promise.resolve(false);
  const w = window as any;
  if (w.googletag?.apiReady) return Promise.resolve(true);
  if (loading) return loading;
  ensureWebConsent();
  loading = new Promise<boolean>((resolve) => {
    w.googletag = w.googletag || { cmd: [] };
    const s = document.createElement('script');
    s.src = GPT_SRC;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => {
      w.googletag.cmd.push(() => {
        // Cross-domain rendering for every creative (needed with a CSP).
        try {
          w.googletag.setConfig?.({
            safeFrame: { forceSafeFrame: true },
            // Fetch slots ~2 screens ahead, render ~1 screen ahead (more on mobile).
            lazyLoad: { fetchMarginPercent: 200, renderMarginPercent: 100, mobileScaling: 2 },
            // One request for the slots on a page: no duplicate ads on one screen.
            singleRequest: true,
          });
        } catch {
          // Older GPT: the setting is optional.
        }
        resolve(true);
      });
    };
    s.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return loading;
}
