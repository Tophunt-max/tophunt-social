# App release and OTA updates (from GitHub)

Android and iOS builds are made on **EAS Build** and started from **GitHub Actions**. JavaScript-only
updates go out as **EAS Update** (OTA), also started from GitHub Actions. Nothing is built on a
developer laptop.

| Workflow | File | What it does |
|---|---|---|
| **App release (Android / iOS)** | `.github/workflows/app-release.yml` | Type-check, icons, tests, then `eas build` for the chosen platform and profile. Optional: submit to Google Play / App Store when the build finishes. |
| **App OTA update** | `.github/workflows/app-ota.yml` | Type-check, icons, tests, then `eas update` to the `production` or `preview` channel. |

Both run from **GitHub → Actions → (workflow) → Run workflow**.

## One-time setup

1. **Expo project.** Create the project on expo.dev (or run `npx eas init` once in `apps/expo`).
   Copy its **project id**.
2. **Expo token.** expo.dev → Account settings → Access tokens → create a token for CI.
3. **GitHub secrets and variables.** Repository → Settings → Secrets and variables → Actions:

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `EXPO_TOKEN` | the token from step 2 |
   | Variable | `EAS_PROJECT_ID` | the project id from step 1 |
   | Variable | `EXPO_OWNER` | Expo account or organisation name (optional) |
   | Variable | `ADMOB_ANDROID_APP_ID` | AdMob → Apps → Android app → App ID (`ca-app-pub-…~…`) |
   | Variable | `ADMOB_IOS_APP_ID` | AdMob → Apps → iOS app → App ID (`ca-app-pub-…~…`) |
   | Variable | `ADMOB_MEDIATION` | optional: bidding partners' adapters, e.g. `{"meta":{"android":"6.20.0.0","ios":"6.20.0.0"}}` (versions from Google's mediation release notes) |
   | Variable | `ADMOB_SKADNETWORK_IDS` | optional: the partners' SKAdNetwork ids, comma separated |

   Production builds refuse to start without the AdMob app id for their platform. Preview builds fall
   back to Google's sample AdMob app ids, which only ever serve test ads.
4. **Signing and store credentials** live in EAS, not in GitHub. Run once, locally or in an EAS
   workflow: `npx eas credentials` (Android keystore, iOS certificate and profile). For automatic
   submission also add the Google Play service account JSON and an App Store Connect API key there.

## Releasing a new app version

1. Bump `expo.version` in `apps/expo/app.json` when the release contains native changes (new SDK,
   permission, AdMob app id). Build numbers increment automatically (`autoIncrement`, remote
   versioning in `eas.json`).
2. Actions → **App release** → platform, profile `production`, submit on/off → Run.
3. The run summary links to the build on expo.dev.

## Publishing an OTA update

Actions → **App OTA update** → channel `production`, a short message → Run.

- An OTA reaches installed builds with the **same app version** (`runtimeVersion.policy = appVersion`).
- Only JavaScript and assets can change. A new native module, permission or the AdMob app id needs an
  **App release** instead.
- The bundle is built on the GitHub runner with the channel's `EXPO_PUBLIC_*` values from `eas.json`, so
  it talks to the same API as the builds on that channel.
- To roll back, publish the previous commit again, or use `eas update:rollback` on expo.dev.

## How the build gets its ids

`apps/expo/app.config.ts` reads `EAS_PROJECT_ID`, `EXPO_OWNER` and the AdMob app ids from the
environment. EAS evaluates the config on its own servers, so the release workflow writes these values
into the build profile's `env` in `eas.json` for that run only (never committed). With
`EAS_PROJECT_ID` set, `expo-updates` is switched on and points at `https://u.expo.dev/<project id>`.
Without it, a build behaves exactly as before (no OTA).

## Ads in the apps

The AdMob SDK (`react-native-google-mobile-ads`) is in the build. Which ad unit shows where is set at
runtime in the admin panel (Monetization → Ad platform); only the AdMob **app** id is fixed at build
time. Consent: the app shows Google's UMP message where required; set up the message in AdMob →
Privacy & messaging. See MONETIZATION.md → "Ad platform".
