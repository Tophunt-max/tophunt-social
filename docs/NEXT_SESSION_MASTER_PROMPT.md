# TopHunt Social: master prompt for the next implementation session

Copy everything below the line into a new Kiro session.

---

You are working on **TopHunt Social**, a free photo/VS battle + creator social app. Act as a senior full-stack engineer (Expo/React Native, Cloudflare Workers + D1, React/Vite admin) with strong attention to financial correctness and security.

## 1. Repositories and hard rules

- **Work repo:** `Tophunt-max/tophunt-social` (public). Clone it if it is not on disk.
- **Source repo:** `Tophunt-max/TophuntDPcontest` is the live production app. **Never change, push to, or deploy anything from it.** Read it only if you need to compare.
- First read these files in `tophunt-social`:
  - `TOPHUNT_SOCIAL_SETUP.md` (isolation status, placeholders, decisions)
  - `README.md`, `COIN_ECONOMY.md`, `AUDIT_2026-10-26.md`, `SECURITY.md`, `apps/worker/GAMIFICATION.md`
- Never touch live production resources: `api.tophunt.in`, `tophunt.in`, D1 `tophunt-db`, Cloudflare account `8357be8f…`, app ID `in.tophunt.app`, EAS project `3591f0e2…`.
- Also never touch the unrelated "sarkari jobs" Cloudflare account (`221f2d6f…`, "Bubunmohanta14@gmail.com's Account") or its resources (`sarkari_jobs_db`, `sarkari-jobs-worker`, `sarkari-jobs-admin`).
- One feature = one branch = one pull request into `main`. Create PRs with `gh api repos/Tophunt-max/tophunt-social/pulls ...`. Do not commit directly to `main`.
- Never commit secrets or tokens. Never paste them into chat.
- **Ask me before:** creating any cloud resource, the first deploy, deleting anything, or any change to money rules not described here.
- Reply to me in simple Hinglish. Code, comments and PR text in English.

## 2. Decisions already made (do not re-ask)

| Topic | Decision |
|---|---|
| App ID | `in.tophunt.social`, scheme `tophuntsocial` (already applied) |
| Firebase | Keep project `tophuntdpcontest` (existing users must be able to sign in) |
| Expo OTA | Disabled for now. I will set up a new EAS project later |
| Cloudflare | Fresh resources in a NEW account. Same setup as the old repo, but all new |
| Contests | **Free entry.** No paid entry fees |
| Cash-out | **No cash withdrawals.** Disabled server-side |
| Product | Free photo/VS battles + Instagram-style social shell + creator support |

### Currency design

| Currency | Source | Used for | Cash value |
|---|---|---|---|
| 💎 Diamond (existing `users.locked_coins`) | Bought with coin packages | Gifts, Digital Store, boosts | None, never withdrawable |
| ⭐ XP (existing `users.xp` ledger) | Check-in, voting, battles, rewarded ads | Levels, free cosmetics, badges | None |
| 🎁 Creator Points (new) | Receiving gifts | Shown on profile, leaderboards. Payout is a future phase with KYC | None for now |

Rewarded ads must never grant Diamonds. They grant XP or free, non-transferable cosmetics only.

## 3. Step 0: verify Cloudflare (do this first, then STOP and wait)

1. Run `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify` and list `/accounts`.
2. Show me: account name, account ID (first 8 chars), and existing D1 / KV / R2 / Queues / Workers / Pages in it, plus which of those APIs the token can access.
3. If it is the live TopHunt account or the sarkari-jobs account, stop and tell me.
4. **Wait for my "haan" before creating anything.**

## 4. Step 1: provision and connect (after my confirmation)

1. Create: D1 `tophunt-social-db`, KV `OTP_KV` and `CACHE_KV`, R2 `tophunt-social-media` (I may need to enable R2 in the dashboard first), Queue `tophunt-social-broadcast`, Pages projects `tophunt-social` (Expo web) and `tophunt-social-admin`.
2. Fill every `REPLACE_WITH_*` placeholder listed in `TOPHUNT_SOCIAL_SETUP.md`, including the account's `workers.dev` subdomain.
3. Update the remaining live-domain references listed in `TOPHUNT_SOCIAL_SETUP.md` → "Still pointing at live tophunt.in". **Most important:** `apps/expo/public/_worker.js` CSP `connect-src` and default API/site origins, otherwise the web app cannot reach the new API. Keep tests passing; update test fixtures only where they assert real hosts.
4. List the Worker secrets needed (from `apps/worker/.dev.vars.example`) and tell me which ones I must set myself (Firebase service account, Razorpay, email/SMS, settings encryption key). Do not invent values.
5. Remind me to add the new `pages.dev` hosts to Firebase → Authentication → Authorized domains.
6. Ask before the first `wrangler deploy` and Pages deploy. After deploying, check `/health` and the D1 auto-migrations (72 migrations, up to `0071`).
7. Open PR: `setup/cloudflare-resources`.

## 5. Feature PRs (in this order)

General rules for every PR:
- Inspect existing code before editing. Reuse existing patterns: `adjustUserWallet` (`apps/worker/src/lib/money.ts`), deterministic ledger IDs in `coin_transactions`, `idempotency_keys`, `db.batch` gated statements (no interactive D1 transactions), `logAudit()`, `requireFullAdmin`, `SENSITIVE_ADMIN_ROUTES` (re-auth), rate limits via `lib/rateLimit.ts`, feature flags/settings via `lib/settings.ts`.
- Do not grow `routes/api.ts` (4.4k lines) or `routes/admin.ts` (6.2k lines) with business logic. Put logic in new `lib/<feature>.ts` services; route handlers stay thin.
- Migrations are append-only: next number is `0072`. Never edit old migrations.
- Server decides all prices, balances and eligibility. Never trust client values.
- Every feature sits behind a feature flag that admins can toggle.
- Add Vitest tests for new backend logic (happy path, insufficient balance, duplicate/replay request, concurrent requests, unauthorized user, invalid input).
- Before opening each PR, run and report exact results:
  - worker: `npm run typecheck && npm test && npx wrangler deploy --dry-run --outdir=/tmp/worker-build` (set `XDG_CONFIG_HOME=/tmp/wcfg` if wrangler cannot write its log dir)
  - expo: `npm run lint && npm run typecheck && npm run check:icons && npm test && npm run build`
  - admin: `npm run typecheck && npm run build`
- `moneyHealth` invariants (`dpcoin = SUM(amount)`, `locked_coins = SUM(locked_delta)`) must still hold.

### PR 1: Free contests, no cash-out (`feat/free-contests-no-cashout`)
- Add settings flags: `contests.paidEntryEnabled = false`, `wallet.withdrawalsEnabled = false`, `wallet.manualDepositsEnabled` (decide default with me).
- Server-side: reject paid entry fees and withdrawal requests when disabled, with clear error codes. Do not delete historical tables or data.
- Contest creation (admin) and joining (app) must work with zero entry fee. Prizes, if any, come from admin-funded `promo_budgets` / product prizes, never from user pots.
- App: hide/replace withdraw screens and entry-fee UI; explain "Free to join".
- Admin: show the flags in App Control; withdrawals page becomes read-only history.
- Keep old DP coin balances visible as legacy, read-only. Ask me how to handle existing DP coin balances (fresh DB means probably none).

### PR 2: Digital Store (`feat/digital-store`)
- Reuse `reward_catalog`, `user_inventory`, `users.cosmetics`, `lib/cosmetics.ts`, `equipCosmetic`.
- Add pricing to catalog items: `price_diamonds`, `is_purchasable`, `ownership` (`permanent` | `timed` with `duration_days`), `available_from/until`, `sort_order`.
- API: `listStoreItems` (paginated, by category), `buyStoreItem(itemId, idempotencyKey)`: one gated `db.batch` that debits Diamonds (`locked: true`), writes ledger `store_purchase:<uid>:<itemId>:<key>`, inserts inventory, and refuses duplicates for permanent items. Timed items extend expiry.
- Expiry handling for timed items (cron unequips expired items).
- App: Store screen (Frames & Themes, Badges & Effects, Diamond Packs), item preview, confirm dialog "X 💎 me khareedein?", owned/equipped states, loading/empty/error/retry.
- Admin: Store page to price items, toggle availability, see sales and revenue. Writes are sensitive routes + audit log.
- No loot boxes or random paid rewards. No fake countdowns.

### PR 3: Virtual Gifts (`feat/virtual-gifts`)
- New tables: `virtual_gifts` (id, title, category, price_diamonds, asset_url, animation, status, start/end, sort_order) and `gift_transactions` (id, sender_uid, recipient_uid, gift_id, price_diamonds, creator_points, context_type `battle|post|profile`, context_id, idempotency_key UNIQUE, created_at). Add `users.creator_points` + a creator points ledger (or a typed entry) so totals reconcile.
- API: `listGifts`, `sendGift(recipientUid, giftId, context, idempotencyKey)`. Validate: recipient exists, not self, not blocked either way, not deleted, gift active. Price from server. Single gated batch: debit sender Diamonds, credit recipient Creator Points by an admin-configured ratio, insert gift row. Rate limit sends. Retry with same key must not double-charge.
- Notifications to recipient (respect existing notification settings and blocks).
- App: gift button on battle screen, post card and profile; gift sheet with prices and balance; Lottie animation on send/receive; gift history (sent/received); "Top supporters" on profile.
- Admin: Gift manager (CRUD, prices, availability), gift sales report, top creators.
- Creator Points are not cash. No payouts in this PR.

### PR 4: New navigation and screens (`feat/navigation-redesign`)
- Bottom nav: **Home, Battles, ＋ Create, Inbox, Profile** (current: Home, Explore, ＋, Inbox, Profile in `apps/expo/src/components/home/BottomNav.tsx`).
- Battles tab: live battles, contests, sponsored contests section (placeholder until sponsorship exists), leaderboard. Move search to the Home header.
- Profile: entry points to Wallet, Store, Gifts history, Rewards, Settings. Show equipped frame/badge and received-gift summary.
- Dark theme with gold/purple accents for Diamonds/gifts. Keep existing design system and components; do not add a new UI library.
- Keep all existing routes working (deep links, notifications, `[slug]`).

### PR 5: Ads adapter (`feat/ads-admob-adapter`)
- No AdMob account yet. Build the integration so it works in test mode and is clearly marked "not configured" otherwise.
- Check current compatibility of `react-native-google-mobile-ads` with Expo SDK 54 / RN 0.81 / New Architecture and use its Expo config plugin. Native only; provide web stubs so `expo export -p web` still builds.
- Use Google test ad unit IDs by default. Real IDs come from server config (admin panel), never hardcoded.
- Formats: feed native ads (clearly labelled "Sponsored", every N posts, configurable; feed continues if ad fails) and rewarded ads (user taps "Watch ad", reward explained first).
- Rewarded reward = XP or a free cosmetic only. Replace the simulated `startRewardedAd`/`finishAd` in `apps/expo/app/wallet/index.tsx`. Add an AdMob SSV callback endpoint (`/webhook/admob-ssv`) that verifies Google's ECDSA signature with their published keys, dedupes by `transaction_id`, and grants the reward. Keep the existing fail-closed behaviour when SSV is not configured.
- Central frequency config (per placement caps, min spacing, per-day rewarded limit), editable in admin, cached in KV with correct invalidation.
- Consent: integrate Google UMP consent flow; respect it before loading ads.
- No interstitials in this PR. No ads during voting, chat, checkout or login. Never reward clicks.
- Admin: Ads Manager page (provider config, test/production toggle, placements, caps). Ad revenue analytics are a later phase (AdMob Reporting API).
- Docs: `docs/ADS_SETUP.md` with the exact AdMob steps I must do (account, app IDs, ad units, SSV URL, app-ads.txt).

## 6. Later phases (do NOT start without asking)

1. Google Play Billing + Apple IAP for Diamond packs and premium (required by store policy for digital goods; Razorpay can stay for web).
2. Premium membership (ad-free enforced server-side, exclusive cosmetics, profile analytics).
3. Brand-sponsored contests and campaign manager.
4. Ad revenue reporting and reconciliation.
5. Physical shopping.
6. Creator Points payouts (needs KYC, tax and legal review).
7. Fix open items from `AUDIT_2026-10-26.md` (#10 concurrent partial refund clawback, #12 public deposit screenshots, #16 `dispute.won`, D1 backup verification).

## 7. Report after each PR

In simple Hinglish:
- What was built, files changed, migrations added.
- Exact test/build results (numbers), and any pre-existing failures listed separately.
- What is mocked or not configured.
- What I need to do manually.
- PR link.
