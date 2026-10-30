# Monetization

## The economy is now closed-loop (no real money in or out)

```
Earning (free) → 💎 Diamond → contest entry → win → 🪙 DP coin → Shopping (gifts, digital items, physical products)
```

| | Before | Now |
|---|---|---|
| Deposits (₹ → Diamond) | Razorpay / manual UPI | **Retired** server-side. Diamonds are only earned |
| Withdrawals (DP coin → ₹) | Admin paid out by bank/UPI | **Retired** server-side. DP coin is only spent in Shopping |
| 💎 Diamond | Bought or earned | Earned only: check-in, tasks, referral, verification, level/season, verified ads, **XP → Diamond** |
| 🪙 DP coin | Withdrawable | Spent only: gifts, digital items, **physical shop** |
| ₹ value of coins | Buy rate / payout rate | Admin sets **1 DP coin = ₹X** and **1 Diamond = ₹Y** (Coin Economy → Coin value). Used to price products and for reports |

- `lib/cashRetirement.ts`: `createOrder`, `requestDeposit`, `requestWithdrawal` are refused unless the deploy var
  `CASH_FLOWS_RETIRED` is the literal `"false"` (wrangler.toml sets `"true"`). Admins cannot approve new withdrawals; they can
  still reject (DP coin returned) and mark an already-approved payout paid. Razorpay webhook, `topup` and the reconcile
  cron still credit an order that was paid before the switch, so nobody loses money.
- Diamond → DP coin conversion does not exist, by design. XP → Diamond does (`lib/xpConversion.ts`): convertible XP is
  `xp - xp_converted`, so XP, levels and leaderboards never go down. Daily cap, charged to the free-rewards budget.
- **Fresh start (done once, 2026-10-30, by the operator, not an admin tool).** On `tophunt-social-db`: 9 users,
  0 DP coin and 5,826 Diamonds in total, no open withdrawals, no pending deposits. Every balance was set to 0 through one
  `economy_reset` ledger row per user (id `economy_reset:fresh-start-2026-10-30:<uid>`), so `dpcoin = SUM(amount)` and
  `locked_coins = SUM(locked_delta)` still hold (verified: 0 drift). Restore point before the reset: D1 Time Travel
  bookmark `00000057-00000000-00005114-65e6bf3a832e4d5297657598f6b42315`
  (`wrangler d1 time-travel restore tophunt-social-db --bookmark=<id>`, available for 30 days).

### Physical shop (`lib/shop.ts`, admin Shopping page, app `/shop`)

- Admin creates products with a ₹ price, ₹ delivery, images, variants with stock and a return window. DP coin price per
  unit = ceil((₹ price + ₹ delivery) ÷ ₹ per DP coin). Each order stores the coins charged and the rate used.
- Checkout is one D1 batch: DP coin debit gated on every line still in stock at the same ₹ price, stock decrement,
  order + items + history. No overselling, no double charge (`requestId`), price change refused (`price_changed`).
- Lifecycle: placed → packed → shipped (tracking number required) → delivered → return requested → returned / declined.
  The customer can cancel while `placed`; the admin can cancel until shipped. Cancel and accepted returns refund the DP
  coin exactly once (`shop_refund`), cancel restocks, a return restocks if the admin ticks it. The customer gets a
  notification at each step. Addresses are scrubbed on account deletion; an open order defers deletion.
- Shipping is manual (the admin enters courier + tracking). No courier API, GST invoice or payment gateway is involved.

### Shop fraud protection (`lib/shopRisk.ts`, admin Shopping → Fraud rules)

Free Diamonds can end as real products, so checkout applies two kinds of rule (all thresholds editable):

| Kind | Rule (default) | Effect |
|---|---|---|
| Hard | Verified mobile number required | Order refused (`phone_not_verified`); the app opens the verify screen |
| Hard | Account at least 3 days old | Refused (`account_too_new`) |
| Hard | 3 orders per account per 30 days (cancelled don't count) | Refused (`order_limit`) |
| Hard | 5,000 DP coin per account per 30 days | Refused (`coin_limit`) |
| Hard | At most 2 accounts per delivery address or phone in 90 days | Refused (`address_limit`) |
| Review | First order of an account; order ≥ 2,000 DP coin; another account on the same device; address/phone used by another account; account < 7 days; most contest wins against one opponent | Order placed, DP coin and stock held, **cannot be packed until an admin approves**. Reject = cancelled + DP coin refunded once, customer told the reason |

The hard limits are evaluated twice: once for a clear error message, and again inside the checkout transaction, so
two orders sent at the same moment cannot both pass a cap. Address and phone are compared as SHA-256 fingerprints of
the normalised value (PIN code + first address line; last 10 phone digits). The fingerprints are kept after account
deletion (the address itself is scrubbed) so deleting and re-registering does not reset the caps. Weak signals never
refuse on their own. A customer can always cancel an order that is under review.

### Spending rule changed

Gifts, digital items and shop orders are paid in **DP coin only** (`lib/coinSpend.ts`, `dpcoin - locked_coins >= price`,
`locked_delta = 0`). Diamonds pay contest entry fees only. The "Diamonds first" rule described further down was the
first version and no longer applies.

Ads, direct brand sponsorships, virtual gifts and the digital store. Admin: **Finance → Monetization**
(`apps/admin-panel/src/pages/Monetization.tsx`). Coin balances, packages, budgets and ledger health stay in
**Coin Economy** (`COIN_ECONOMY.md`).

## Status at a glance

| Area | Status | Notes |
|---|---|---|
| Config (frequency caps, ad units, switches) | Done | `appConfig.monetization`, edited in the panel, validated, audited, pushed to apps without a release |
| Direct sponsored posts in the home feed | Done | Works without any ad SDK. Needs real campaigns and the switch on |
| Sponsorship manager (advertisers, campaigns, approval, reports, billing refs) | Done | First-party, aggregated delivery counts |
| Virtual gifts (catalogue, send, history, gift wall, admin, stats) | Done | Off by default |
| Digital store (listings over the cosmetic catalogue, buy, refund) | Done | Permanent items only. Off by default |
| Rewarded ads paid by AdMob SSV callback | Server done, app not wired | Needs the AdMob SDK in the app and an SSV-enabled ad unit |
| Ad diagnostics + provider revenue import, eCPM | Done | Revenue comes only from imported provider reports |
| AdMob SDK in the app (feed native, interstitial, rewarded) | **Not installed** | Adapter seam only (`apps/expo/src/services/ads/adProvider.ts`). See "Enable AdMob" |
| Ad consent (Google UMP) | **Not installed** | Comes with the SDK. Ads must stay off until it is in place |
| Short-video ads | Config only | The app has no short-video feed yet |
| Physical shopping, premium plans, creator payouts, creator marketplace | **Not built** | See "Not built and why" |

Nothing here produces revenue numbers on its own. The dashboard shows Razorpay coin sales, coins spent,
imported ad-network reports and sponsorship contract values, each labelled.

## Audit findings that shaped the design

- **Two balances already exist** (`COIN_ECONOMY.md`). `users.dpcoin` is the total; `users.locked_coins` is the
  **Diamond** part (bought with coin packages or earned free, play-only, never withdrawable). The rest is
  **DP coin** (contest prizes, withdrawable). This is the reverse of the naming in the original brief, where
  "DP Coin" was the spendable currency and "Diamonds" a reward. The code was kept as it is: renaming would
  touch every screen, the ledger and user expectations.
- **Diamonds already have a ledger**: `coin_transactions.locked_delta`. A separate `diamond_ledger` table
  would be a second source of truth, so none was added.
- **Cosmetic ownership already exists**: `reward_catalog` (items) and `user_inventory` (ownership,
  revocation), with server-checked equip. The store adds prices on top instead of a parallel entitlement table.
- **Rewarded ads**: a client-claimed `claimAdReward` exists and is fail-closed (needs a deploy-level env
  flag). It is unchanged. Verified rewards now go through the new SSV callback.
- **No ad SDK, no consent library, no `expo-dev-client`** in `apps/expo/package.json`.
- **Atomicity**: every money move is one `env.DB.batch([...])` (a D1 transaction) with the same gate on each
  statement. The new code follows the same pattern (`lib/coinSpend.ts`).

## How spending works

`apps/worker/src/lib/coinSpend.ts`. One D1 batch per spend:

1. Ledger row in `coin_transactions` (deterministic id), gated on the user affording it and the caller's gate.
2. `users` UPDATE with the same gate, plus "the ledger row exists".
3. The caller's own rows (gift record / entitlement / stock counter / purchase record), gated on
   "ledger row exists AND the record does not yet".

A spend takes **Diamonds first**, then DP coin (`DIAMONDS_AFTER_DEBIT`), so the withdrawable balance is used
last. `locked_delta` records the Diamond part, so the existing invariants (`dpcoin = SUM(amount)`,
`locked_coins = SUM(locked_delta)`) and the Health checks cover gifts and the store unchanged.
New ledger types: `gift_send`, `store_purchase`, `store_refund` (category "spend" in Coin Economy).

**Idempotency**: the app sends a `requestId` per tap. Row ids are `gift:<uid>:<requestId>` /
`store:<uid>:<requestId>`. A retry returns the original result with `replayed: true` and charges nothing.
**Price safety**: the app sends the price it displayed; the server refuses with `price_changed` if it differs,
and re-checks price and availability inside the transaction.

## Virtual gifts

- Tables: `virtual_gifts` (catalogue, seeded with 6 gifts), `gift_transactions` (immutable snapshots of name,
  price, quantity, Diamond part, creator share).
- `/api` actions: `getGiftCatalog`, `sendGift`, `getGiftHistory` (own sent/received only).
- `/read/users/:id/gift-wall`: totals and per-gift counts, no sender identities.
- Checks: gifts switched on, recipient exists and is active, not self, no block either way (same "not
  available" answer for all, so a block is not detectable), gift live, quantity and per-send caps, fail-closed
  rate limit (30/min). The recipient gets a notification (`type: gift`, respects mute/block).
- **Recipients receive no coins.** `creator_share_bps` is recorded for reporting only.

## Digital store

- `store_listings` (price, refundable, real stock limit, sale window, sort) on top of `reward_catalog`;
  `store_purchases` (one live purchase per user+item, enforced by a partial unique index).
- `/api` actions: `getStore`, `buyStoreItem`. Bought items appear in the existing Inventory and are equipped
  through the existing `equipCosmetic`.
- Admin refund (`POST /admin/monetization/store/purchases/:id/refund`, reason required): returns exactly what
  was paid (same Diamond/DP split), revokes the item, unequips it, once. An item revoked for another reason
  (e.g. abuse) cannot be bought back.
- Not supported yet: time-limited items (needs an expiry on `user_inventory` honoured by equip and the public
  profile), bundles/collections, promotional pricing. No randomised paid items.

## Ads

### Configuration (`appConfig.monetization.ads`, `lib/monetizationConfig.ts`)

Provider (`none`/`admob`), mode (`test`/`production`), AdMob app ids and ad unit ids per platform, session
ceiling, blocked countries, and per placement: feed native (first position, interval, per-session cap),
short video, interstitial (min seconds apart, per session, per hour), rewarded (Diamonds per view, daily cap).
Unknown keys and out-of-range values are refused. `requireConsent` cannot be turned off.
The app is told ads are **off** unless the provider is AdMob and (in production mode) app ids are set.

Client rules live in `apps/expo/src/lib/adSlots.ts` (tested): ads go only between organic rows, never
lead or trail the list; interstitials are refused on checkout, payment, sign-in, chat, withdraw, deposit and
contest entry screens.

### Rewarded ads (server-side verification)

`GET /webhook/admob/ssv` (`lib/admobSsv.ts`). Verifies Google's ECDSA P-256 signature over the query string
with keys from `https://www.gstatic.com/admob/reward/verifier-keys.json` (cached 1 h, refetched on an unknown
key id). `key_id` must be the last parameter. Then credits **Diamonds only** (never DP coin), amount and
daily cap from the config (never from the callback), deduplicated by `transaction_id`
(`ad_reward_claims.id = admob:<tx>`), charged to the free-rewards promo budget like other free rewards.
Reference: [AdMob SSV](https://developers.google.com/admob/android/ssv).

Policy note: Diamonds pay contest entry fees, and contest prizes are withdrawable DP coin. A rewarded-ad
reward therefore has indirect cash value. Review AdMob's rewarded-ad policy for this before enabling
`ads.rewarded`. The safer alternative is a cosmetic item reward, which is not built.

### Measurement

- `ad_event_counters`: app-reported requests/fills/impressions/clicks/failures, per day/platform/placement,
  no user ids (`recordAdEvents`, batched by the app, fail-open). Diagnostics only.
- `ad_revenue_reports`: rows pasted from the AdMob report (CSV in the Ads tab). `estimated` or `finalized`;
  a finalized row is never downgraded. eCPM = revenue ÷ impressions × 1000.
  Estimated revenue for planning = impressions × eCPM ÷ 1000 (`estimateRevenue`).
- Not built: AdMob Reporting API sync (needs OAuth credentials), invalid-traffic alerts.

## Sponsorships

- `advertisers`, `sponsored_campaigns` (dates, flat or CPM, budget, impression cap, weight, creative,
  disclosure, invoice/payment refs), `campaign_daily_stats` (aggregated impressions/clicks).
- Lifecycle draft → pending → approved → paused/ended; pending → rejected. **The creator of a campaign cannot
  approve it** (superadmin excepted). Approved campaigns can only change billing references.
- The disclosure must say it is paid (Sponsored / Ad / Paid partnership / Promoted). Links and images must be https.
- Serving: `GET /read/sponsored?placement=feed` (approved, in dates, advertiser active, under cap; 60 s edge
  cache; empty in blocked countries). The app interleaves them into the For You feed only.
- Delivery: one impression per signed-in viewer per campaign per hour, one click per 10 min; guests are not
  counted. Advertisers see aggregates only.

## Security

- All `/admin/monetization/*` routes require a full admin (moderators get 403) and every write is in
  `admin_audit_log`. Writes also need a recent sign-in (added to `SENSITIVE_ADMIN_ROUTES`).
- Money actions use fail-closed rate limits; no client-supplied price, amount, balance or success flag is
  trusted. The SSV route trusts only the signature.
- New uid-bearing tables are listed in the account-deletion completeness test as retained financial records.

## Enable AdMob in the app (manual)

1. Create the AdMob app and ad units (native advanced, interstitial, rewarded). On the rewarded unit, turn on
   server-side verification with callback URL `https://api.tophunt.in/webhook/admob/ssv`.
2. `cd apps/expo && npx expo install react-native-google-mobile-ads expo-dev-client`, add the config plugin
   to `app.json` with `androidAppId` / `iosAppId`, add `NSUserTrackingUsageDescription` and the SDK's
   `SKAdNetworkItems` for iOS. Expo Go cannot load it; use an EAS development build.
3. Implement `AdProvider` in `src/services/ads/` with that SDK: run the UMP consent flow first
   (`AdsConsent`), then initialise; use Google's test unit ids when `mode === 'test'`; set
   `serverSideVerificationOptions.userId` to the Firebase uid for rewarded ads; return it from
   `getAdProvider()`. Keep a `.web.ts` variant returning the unavailable provider.
4. Render feed native slots with `interleaveSponsored`-style positions from `ads.feedNative`, report events with
   `queueAdEvent`, and gate interstitials with `canShowInterstitial`.
5. In the panel: provider AdMob, mode Test, enter the ids, enable one placement, verify with a test device,
   then switch to Production.

## Deployment checklist

1. Migration `0072_monetization.sql` applies automatically (`autoMigrate`) or with
   `npm run db:migrate:remote` in `apps/worker`. It only creates tables and seeds 6 gifts; nothing existing
   changes. Take the usual D1 backup first (`.github/workflows/backup-d1.yml`).
2. Deploy the Worker, then the admin panel. The app changes ship with the next app build; older builds ignore
   the new config.
3. Everything starts **off**. Turn on one area at a time in Monetization and test with a test account:
   gifts (send one, check both histories, Coin Economy → Health stays green), store (list an item, buy,
   equip, refund), sponsorships (two admins: create, submit, approve; check the feed and the report).
4. Do not enable `ads.enabled` until the SDK and consent flow are in the app build.

No new secrets or environment variables are required. AdMob ids are public and set in the panel.

## Not built and why

- **Physical shopping**: needs inventory, tax (GST), shipping, returns and consumer-protection terms, and a
  payment flow that is allowed for physical goods. Do not reuse contest prize claims as orders.
- **Premium membership / ad-free**: needs Apple/Google in-app purchase and subscription handling (store
  rules for digital goods), receipt validation and entitlement expiry. Not started.
- **Creator payouts and marketplace**: needs KYC, TDS/GST handling, a settlement ledger separate from coins,
  dispute handling. Gifts deliberately create no payable balance until then.
- **Legacy cash flows**: deposits, withdrawals and prize claims are unchanged. Whether the new model keeps cash
  withdrawals is a business and legal decision; nothing was disabled.

Coin purchases for digital goods inside iOS/Android apps may be required to use Apple/Google in-app
purchase. Razorpay top-ups are the existing flow; review store policy before shipping the store and gifts to
app-store builds. None of this is a legal review.
