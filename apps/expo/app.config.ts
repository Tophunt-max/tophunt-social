/**
 * Dynamic layer over app.json for native builds (see APP_RELEASE.md).
 *
 * Everything here comes from GitHub Actions variables at build time, so no
 * account id lives in the repo and the same code builds staging and production:
 *
 *   EAS_PROJECT_ID          Expo project id → turns on OTA updates (expo-updates)
 *   EXPO_OWNER              Expo account / organisation that owns the project
 *   ADMOB_ANDROID_APP_ID    AdMob app id "ca-app-pub-…~…" (Android)
 *   ADMOB_IOS_APP_ID        AdMob app id "ca-app-pub-…~…" (iOS)
 *   ADMOB_MEDIATION         bidding partners' adapters, JSON (plugins/withAdMediation.js)
 *   ADMOB_SKADNETWORK_IDS   extra SKAdNetwork ids for those partners, comma separated
 *
 * The AdMob APP id is compiled into the binary (AndroidManifest / Info.plist),
 * so changing it needs a new build. Ad UNIT ids are not: they come from the
 * admin panel at runtime (Monetization → Ad platform).
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Google's published sample AdMob app ids: dev and preview builds only, never real ads. */
const ADMOB_TEST_ANDROID = 'ca-app-pub-3940256099942544~3347511713';
const ADMOB_TEST_IOS = 'ca-app-pub-3940256099942544~1458002511';

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID?.trim();
  const owner = process.env.EXPO_OWNER?.trim();
  const plugins = [
    ...(config.plugins ?? []),
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.ADMOB_ANDROID_APP_ID?.trim() || ADMOB_TEST_ANDROID,
        iosAppId: process.env.ADMOB_IOS_APP_ID?.trim() || ADMOB_TEST_IOS,
        // Nothing is measured before the consent flow has run (src/ads/providers/admob.native.tsx).
        delayAppMeasurementInit: true,
        userTrackingUsageDescription:
          'TopHunt uses this to show ads that are more relevant to you. You can say no and still use the app.',
        // Google's own SKAdNetwork id; add partners' ids here when mediation is added.
        skAdNetworkItems: [
          'cstr6suwn9.skadnetwork',
          ...(process.env.ADMOB_SKADNETWORK_IDS ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => /^[a-z0-9]+\.skadnetwork$/.test(s)),
        ],
      },
    ],
    // Mediation adapters (bidding partners), only when ADMOB_MEDIATION is set.
    './plugins/withAdMediation',
  ] as ExpoConfig['plugins'];

  return {
    ...(config as ExpoConfig),
    ...(owner ? { owner } : {}),
    plugins,
    // OTA updates only when the build knows its Expo project. Without it the app
    // runs the bundle it shipped with, exactly as before.
    updates: projectId
      ? { enabled: true, url: `https://u.expo.dev/${projectId}`, checkAutomatically: 'ON_LOAD', fallbackToCacheTimeout: 0 }
      : config.updates,
    extra: { ...(config.extra ?? {}), ...(projectId ? { eas: { projectId } } : {}) },
  };
};
