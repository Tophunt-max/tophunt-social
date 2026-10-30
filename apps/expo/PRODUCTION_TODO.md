# Production Readiness — Remaining Work

This document tracks what still needs to be done to take the Tophunt user app
to production. The **first section is already implemented** in code and only
needs configuration/credentials to go live. The later sections are separate
initiatives that need your accounts, product decisions, or larger engineering
effort.

---

## ✅ Implemented in code — needs config/credentials to activate

### 1. Crash reporting (Sentry)
- A central reporter exists at `src/lib/reportError.ts` and is already called by
  the global `ErrorBoundary` (`src/components/ErrorBoundary.tsx`).

**To activate:**
1. `npm i @sentry/react-native`
2. `Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN })` in `app/_layout.tsx`.
3. In `reportError.ts`, swap the console call for `Sentry.captureException`.
4. Set `EXPO_PUBLIC_SENTRY_DSN` per environment.

### 2. Environment configuration
- `src/services/api.ts` now warns (in dev) when `EXPO_PUBLIC_API_URL` is unset.
- Set `EXPO_PUBLIC_API_URL` (and any other `EXPO_PUBLIC_*`) per environment in
  `.env` / `eas.json`. Keep staging and production separate so dev builds never
  hit prod by accident.

---

## 🔴 Still needed before launch

### 3. Ad-reward crediting — PARTIALLY DONE
The "Watch Ad" flow now actually credits coins via the `claimAdReward` worker
action (fixed reward, per-UTC-day cap + rate limit, ledger entry). Remaining
hardening:
- ⚠️ It currently trusts the client that an ad was watched. Gate it behind the
  ad network's **Server-Side Verification** (AdMob SSV) callback so only a
  verified impression credits coins.
- Integrate the actual rewarded-ads SDK (e.g. `react-native-google-mobile-ads`)
  in place of the simulated timer.

### 4. Automated tests — STARTED
Done:
- **Worker** coin-path suite (Vitest + a node:sqlite-backed D1 shim, since
  workerd can't run in all CI): `claimDailyReward`,
  `claimAdReward`, entry-fee deduction, `submitVote` validation. `npm test` in
  `apps/worker`.
- **Client** logic suite (Vitest, native modules mocked): `walletService`,
  `getDeviceId`, `contestService.voteOnMatch`. `npm test`
  in `apps/expo`.

Still to add:
- Component/screen tests (jest-expo + React Native Testing Library) for auth,
  join-battle, and wallet screens.
- Full `submitVote` tally/dedup test (needs the VoteCounter Durable Object → run
  under `@cloudflare/vitest-pool-workers` in a workerd-capable CI).
- E2E smoke tests (Maestro/Detox) for the critical happy paths.

### 5. Daily-tasks progress (partially mock)
The wallet's "Daily Tasks" progress values are still hardcoded. Wire them to
real per-user progress (votes cast today, profile shared, etc.) or hide the
ones that aren't tracked yet.

---

## 🟠 Stability & scale

### 6. Realtime — DONE (hot paths on WebSockets)
The worker's `RealtimeHub` Durable Object + `/ws?channel=...&token=...` endpoint
and the client's `src/services/realtime.ts` (`subscribeChannel` + `live()`,
multiplexed, ref-counted, auto-reconnect, heartbeat) now drive all hot paths off
polling:
- Live match vote/like/comment/share/reaction counts (`PostCard`) → `match:<id>`
- Chat messages → `chat:<id>`; chat-list bumps → `user:<uid>`
- Notifications (unread count + list) → `user:<uid>`
- Match/battle comments → `match:<id>` (migrated from a 6s poll)

`live()` keeps a slow (30s) safety-net refetch so a missed event or dropped
socket self-heals. Remaining low-frequency `poll()` calls (app config, auth
status, legal content) intentionally stay polled — they have no realtime channel
and aren't hot.

Optional follow-up: add a `post:<id>` channel on the worker (publish in the
post comment/like handlers + authorize it in `/ws`) to make **post** comments
instant too; today they still use a light 6s poll.

### 7. Offline & error UX — DONE (baseline)
- React Query retries + refetches on reconnect, and `onlineManager` is now wired
  to NetInfo so queries pause offline and resume automatically.
- A global `OfflineBanner` overlays every screen when connectivity drops.
- Mutation errors surface a toast globally (via `QueryClient` `MutationCache`
  + the toast bridge); query errors are reported to the central reporter.
- Reusable `ErrorState` / `EmptyState` components exist
  (`src/components/ui/StateViews.tsx`).
- Remaining: adopt `ErrorState`/`EmptyState` on the rest of the screens as they
  are touched.

### 8. Auth hardening
- Token refresh + expired-session handling, force-logout, and a race-free
  profile bootstrap (`useProfileData` auto-creates a profile — verify no double
  creation under concurrent calls).

---

## 🟡 Polish, compliance & store

### 9. Performance
- Replace `ScrollView + .map()` lists with `FlatList`/`FlashList` where lists
  can grow (some explore/home sections). Tune image sizes/thumbnails via
  `expo-image` `cachePolicy`.

### 10. Content moderation & safety (UGC app)
- Photos/videos + comments need moderation: report/block flows, a review queue,
  and automated image scanning. The worker already has a `banned_words` table
  and `reports` table — wire them into the client and an admin review flow.

### 11. Accessibility & i18n
- Add `accessibilityLabel`s, dynamic font scaling, and sufficient contrast.
- The UI mixes Hindi/English — adopt a real i18n framework (i18next) instead of
  hardcoded strings.

### 12. App Store / Play Store readiness
- `app.json`: final bundle IDs, version/build numbers, permission usage strings
  (camera, photos, **location** — `expo-location` is used), icons, splash,
  deep-link scheme.
- Link the existing legal pages (`app/legal/*`) in the store listing.
- Account-deletion / data-export flow (GDPR + store requirement).

### 13. Data & DR
- Automate a weekly `wrangler d1 export` to off-site storage (R2) in addition to
  D1 Time Travel.

---

## Note on CI/CD
Intentionally excluded from this pass per request. When ready, add GitHub
Actions to run `tsc --noEmit` + `eslint` on PRs and `wrangler deploy` +
EAS build on merges to `main`.
