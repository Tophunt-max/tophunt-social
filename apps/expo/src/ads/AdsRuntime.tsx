/**
 * App-wide ad runtime, mounted once in the root layout. Renders nothing.
 *
 *  - viewer key for experiment buckets (user id, else this device's id);
 *  - per-account ad suppression from the server (invalid-traffic guard);
 *  - server decisions (waterfall order / paused networks / timeouts);
 *  - the web consent message publisher (Ad platform → Web consent);
 *  - fatigue: leaving the app right after a full-screen ad;
 *  - app open ads (apps only): preloaded, shown when the app returns after 30+ s
 *    in the background, inside the slot's caps, never for a brand-new account
 *    within its grace period (slot audience), never on a cold start.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/src/hooks/useAuth';
import { getDeviceId } from '@/src/lib/deviceId';
import { callApi } from '@/src/services/api';
import { useAppConfig } from '@/src/services/appSettings';
import { queueAdEvent, flushAdEvents } from '@/src/services/monetization';
import { setWebConsentPublisher } from '@/src/services/ads/gpt';
import { canShowAd, recordAdShown } from './frequency';
import { noteAdShown, noteAppBackground, noteFullscreenClosed, setAdsSuppressedUntil, setViewerKey } from './optimizer';
import { AD_PLATFORM, useAdDecisions, useAdPlacement } from './placements';
import { preloadAdmobAppOpen, showAdmobAppOpen } from './providers/admob';

const MIN_BACKGROUND_MS = 30_000;

export function AdsRuntime() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const on = !!(config as any)?.monetization?.adPlatform?.enabled;
  const consent = (config as any)?.monetization?.adPlatform?.webConsent;
  useAdDecisions();
  const appOpen = useAdPlacement('app_open');
  const backgroundAt = useRef(0);

  useEffect(() => {
    if (user?.uid) setViewerKey(user.uid);
    else void getDeviceId().then((id) => setViewerKey(id)).catch(() => undefined);
  }, [user?.uid]);

  useEffect(() => {
    if (!on || !user?.uid) return;
    callApi('getAdStatus', {})
      .then((r: any) => setAdsSuppressedUntil(Number(r?.adsSuppressedUntil) || 0))
      .catch(() => undefined);
  }, [on, user?.uid]);

  useEffect(() => {
    setWebConsentPublisher(consent?.enabled ? String(consent.publisherId ?? '') : '');
  }, [consent?.enabled, consent?.publisherId]);

  const first = appOpen?.attempts.find((a) => a.network.type === 'admob');
  useEffect(() => {
    if (AD_PLATFORM !== 'web' && first && appOpen && canShowAd('app_open', appOpen.rules)) preloadAdmobAppOpen(first.unit, first.network.testMode);
  }, [first, appOpen]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') {
        backgroundAt.current = Date.now();
        noteAppBackground();
        void flushAdEvents();
        return;
      }
      if (st !== 'active' || !backgroundAt.current) return;
      const away = Date.now() - backgroundAt.current;
      backgroundAt.current = 0;
      if (AD_PLATFORM === 'web' || !appOpen || !first || away < MIN_BACKGROUND_MS || !canShowAd('app_open', appOpen.rules)) return;
      const variant = appOpen.variant ?? '-';
      void showAdmobAppOpen((valueMicros, currency) => queueAdEvent({ placement: 'app_open', event: 'paid', provider: first.network.id, variant, valueMicros, currency })).then((o) => {
        if (o !== 'shown') return;
        queueAdEvent({ placement: 'app_open', event: 'impression', provider: first.network.id, variant });
        recordAdShown('app_open');
        noteAdShown();
        noteFullscreenClosed();
        preloadAdmobAppOpen(first.unit, first.network.testMode);
      });
    });
    return () => sub.remove();
  }, [appOpen, first]);

  return null;
}
