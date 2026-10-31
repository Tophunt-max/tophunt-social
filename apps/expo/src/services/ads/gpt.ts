/**
 * Google Publisher Tag (Google Ad Manager) loader for the WEB build, shared by
 * rewarded ads (webRewarded.ts) and display slots (src/ads/providers/web.tsx).
 * Loaded on demand, once, and only on the web.
 */
import { Platform } from 'react-native';

const GPT_SRC = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';

let loading: Promise<boolean> | null = null;

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
          w.googletag.setConfig?.({ safeFrame: { forceSafeFrame: true } });
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
