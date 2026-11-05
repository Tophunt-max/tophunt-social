# Coin Economy

Every coin setting and report lives in the admin panel under **Coin Economy**
(`apps/admin-panel/src/pages/CoinEconomy.tsx`). Older pages (App Control, App
Settings, Referrals, Rewards) link there, so each setting has one editor.

## Three coins (current model)

```
⚡ XP ──convert──▶ 💎 Diamond ──contest entry──▶ win ──▶ 🪙 DP coin ──▶ Shopping
```

| Coin | Comes from | Used for | Admin (Coin Economy tab) |
|---|---|---|---|
| ⚡ XP | Playing (votes, contests, wins, daily activity) | Levels, and **converting to Diamonds** (`xp - xp_converted`; XP never goes down) | ⚡ XP: rate (XP per Diamond), daily cap |
| 💎 Diamond (`users.locked_coins`) | Free only: check-in, tasks, referral, verification, verified ads, level/season, Hall of Fame, XP conversion. Never bought (deposits retired) | **Contest entry fees and Shop Bundles** (bundles contain items only, never DP coin or Diamonds) | 💎 Diamond: every earning setting, contest P&L |
| 🪙 DP coin (`dpcoin - locked_coins`) | Only by winning contests | **All shopping**: digital items, gifts, physical products. Never withdrawn (withdrawals retired) | 🪙 DP coin: won vs spent, shop/digital/gift switches, **monthly shop budget (₹)**, fraud rules |

- Free rewards are always Diamonds; the server refuses `rewardLocking: false`. There is no Diamond → DP coin conversion.
- **Shop Bundles** (admin: Shopping → Bundles, `lib/storeBundles.ts`) are the only Diamond spend besides contest
  entry: 2-12 catalogue items for a Diamond price, once per user. Contents are items only, so a bundle can never turn
  Diamonds into DP coin. Shopping → Collections only groups items for the Shop home; it sells nothing itself.
- ₹ per coin: Coin Economy → Coin value (`coinPricing.dpCoinInr` prices products; `diamondInr` is for reports).
- **Spend limit:** `monetization.shop.monthlyBudgetInr` caps the ₹ value of physical shop orders per calendar month
  (UTC), checked again inside the checkout transaction. Cancelled/returned orders free their share. 0 = no limit.
  Digital items and gifts are not counted (they cost nothing to deliver).
- Report: `GET /admin/monetization/coins` (XP / Diamond / DP coin supply, earned, spent, shop budget meter).
- Ledger types: `xp_conversion` (Diamond in), `contest_entry_fee` (Diamond out), `contest_win_reward` (DP coin in),
  `gift_send`, `store_purchase`, `shop_order` (DP coin out), `store_refund`, `shop_refund`,
  `store_bundle_purchase` (Diamond out: `amount = locked_delta = -price`), `store_bundle_refund` (Diamond back), and the one-off
  `economy_reset` of 2026-10-30. Every one is written in the same batch as the balance change, so the invariants below hold.
- Real money is removed entirely: no purchases, deposits, withdrawals or coin packages (see MONETIZATION.md).
- `users.dpcoin` is the total; every ledger row's `locked_delta` is its Diamond part, so both ledger invariants cover both balances. Entry fee: `MIN(locked_coins, dpcoin) >= fee`, all Diamonds (`lib/diamonds.ts`); a refund returns Diamonds. Bundle purchases use the same cover check (`diamondSpendStatements`, `lib/coinSpend.ts`).

### Signup bonus (paid only after verification, `lib/verificationReward.ts`)

Admin: Coin Economy → 💎 Diamond → "Signup bonus (verify ke baad)" and "Signup bonus review".

- Amount: `rewardSettings.signupBonus`. The admin save mirrors it into `verificationReward.completionReward`, which
  is snapshotted at signup. Paid as 💎 Diamonds, from the free-rewards budget, once, after email AND mobile are verified
  by server-side proof. `verificationReward.registrationReward` (paid at signup without verification) should stay 0.
- Hard rules (never paid): the email, mobile or device already earned a bonus on another account
  (`verification_reward_claims`, kinds email / phone / device); a disposable email; a blocked or inactive account.
- Wait: `minAccountAgeHours`. The hourly cron (`sweepSignupBonuses`) pays it once the account is old enough.
- Review hold (admin approves or rejects, with a reason; both audited): `requireDevice` and no device id,
  `maxBonusesPerIpPerDay` bonuses already paid to one IP in 24h, more than `maxAccountsPerDevice` accounts on one
  device, or `reviewAll`. Approve still applies the hard rules. Device and IP are stored only as SHA-256 hashes
  (migration 0074). The app sends its install id with every call that can pay the bonus.

### Economy limits (`monetization.economy`, `lib/economyLimits.ts`)

Edited in Coin Economy → Overview → "Economy limits". Every limit is 0 = off (the code default).

| Setting | What it does | Where it is enforced |
|---|---|---|
| `contestPlatformFeePercent` (0-90) | A new match's coin prize = `min(rewardCoins, pot × (100 − fee) / 100)`. The rest is recorded as `platform_fee` in `platform_ledger` at settlement. Promo contests (linked to a budget) and product prizes are exempt. The contest listing shows the same prize. | `startMatch`, `read.ts#withPromoPrizeAvailability` |
| `dailyFreeDiamondCap` | Free Diamonds per user per reward day, summed over check-in, daily tasks, rewarded ads (legacy and AdMob SSV) and XP conversion. A SQL gate in each crediting batch makes it exact under concurrency; a refused claim writes nothing (no claim row, no task marked claimed). Error reason `daily_free_limit`. | `api.ts`, `admobSsv.ts`, `xpConversion.ts` |
| `monthlyDpCoinWinCap` | DP coin one user may win from contests per UTC month. The part of a prize above the cap is paid as Diamonds (`locked_delta` on the `contest_win_reward` row), so it can enter contests but not the shop. | `contestSettlement.ts#settleWinner` |
| `sameOpponentRewardsPerDay` | Completed matches between the same two players per UTC day that still give win/loss XP and a monthly win (Hall of Fame). Past the limit the prize is still paid. | `settleWinner` |

Also:
- `match_win` / `match_loss` XP have default daily caps of 300 / 60 (Gamification → XP rules can change them).
- Hall of Fame Diamonds are charged to the free-rewards budget. If the budget has no room, that winner is not paid,
  the cron run fails (alert), the leaderboard is kept, and a re-run after raising the budget pays them once.
- Economy health: `GET /admin/monetization/economy-health?days=30` reports active users, ad (per currency) and
  sponsored revenue, physical shop cost in ₹, DP coin minted and its ₹ value, Diamonds given free and kept as fees,
  per-active-user numbers, and alerts for missing guardrails. Shown on the Coin Economy overview.

## Concepts

| Term | Meaning | Where |
|---|---|---|
| Diamonds (locked coins) | `users.locked_coins`: contest entry fees only. DP coin = `dpcoin − locked_coins`: Shopping only. | `lib/diamonds.ts`, `lib/rewardLocking.ts` |
| Ledger invariant | `locked_coins = SUM(coin_transactions.locked_delta)` per user, and `dpcoin = SUM(amount)`. Checked in Health. | `lib/coinEconomy.ts` |
| Promo budget | One per offer, with a hard coin limit, optional time window and per-user limit. Coins are reserved (`promo_reservations`), then spent. The platform side is written to `platform_ledger`. | `lib/promoBudget.ts` |
| Budget kinds | `contest_prize` (coin prize above the pot), `product_prize` (admin-only coin cost of a physical prize, above the pot), `free_rewards` (cap on daily login, rewarded ads, daily tasks). | |
| Approval password | Separate from the login password. Required to create/edit a budget or link one to a contest or free rewards. 5 wrong tries = 15 min lock. Forgotten: superadmin resets it with an email code. | `lib/approvalPassword.ts` |

## What happens when a budget runs out

| Kind | Effect |
|---|---|
| contest_prize | New matches pay the pot prize instead of the promo prize. |
| product_prize | New matches are refused (`prize_budget_exhausted`); the app shows "Prize khatam"; admin gets a notification. Raise the total to reopen. |
| free_rewards | Free Diamonds (check-in, tasks, ads, XP conversion, signup bonus) pay nothing (`free_rewards_exhausted`) and Hall of Fame waits, until the total is raised. |

## Abuse checks (advisory, never block)

- **Referral holds** (`lib/referralProgram.ts`): `same_ip_burst`, `ip_shared`, `referrer_velocity`, `no_device` (the app sent no device id), `monthly_budget`. A held referral goes to review instead of paying out.

## Rewards Center (`/earn`, `apps/expo/app/earn/index.tsx`)

One scrolling page in the order of the design reference: header (Diamonds, XP, level), shortcuts, 7-day streak,
today's missions (daily tasks), weekly missions (quests), contest rewards, Watch & Earn, referral, XP convert,
special events (the featured admin event, else the live season), achievements, leaderboard and reward history. It adds no earning logic of its
own: every amount, limit, progress bar and claim comes from the existing actions (`getDailyReward`,
`getDailyTasks`, `getQuests`, `getAchievements`, `getXpConversion`, `/read/me/referrals`, the rewarded-ad
platform with SSV) and every claim is re-checked by the Worker. Winning a contest pays 🪙 DP coin; the
contest card says so and shows no Diamond amount. Artwork: `apps/expo/assets/earning/` (44 transparent WebP,
256 px, illustrations 384 px; registry `index.ts`) and the claim-burst Lottie. The WebP are rendered from the SVG
sources in `apps/expo/design/earning/` (`scripts/gen-earning-assets.py`) by `scripts/gen-earning-webp.mjs`, which
adds glow, drop shadow and sheen; the app bundles no SVG for this artwork. 💎 Diamond, ⚡ XP and 🪙 DP coin are not
Rewards Center artwork: the Rewards Center draws the app-wide icons (`DiamondIcon`, `XpIcon`, `CoinIcon`) like every
other screen, and they can't be replaced from the panel. Those three draw `apps/expo/assets/images/currency/{diamond,xp,dp-coin}.webp`
(192 px square, transparent; to change one, replace its WebP with one of the same size); the
admin panel's `DiamondIcon` / `CoinIcon` / `XpIcon` import the same files. Admins can replace any other piece (below).

### Rewards Center Diamonds (missions, achievements, contests)

All three are 💎 Diamonds, paid from the free-rewards budget and counted in `dailyFreeDiamondCap`, with their own
ledger types (`quest_reward`, `achievement_reward`, `contest_reward`). The bonus-chasing guard holds them while an
account has an open abuse flag (released when the flag is reviewed).

| Reward | Admin | How it pays |
|---|---|---|
| Weekly / monthly mission | Gamification → Rules → Quests, "Diamond" column (`quests[].coins`) | On `claimQuest`, in the same batch as the claim row and the XP (ledger id `quest:<id>:<period>:<uid>`). Over the cap: nothing recorded. Budget empty: the claim is kept and a retry pays once. |
| Achievement | Gamification → Achievements, "Diamond reward (per tier)" (`achievement_definitions.diamond_reward`, migration 0085) | Each tier unlocked by progress (not a backfill) creates a `reward_grants` row `achievement:<id>:<tier>:<uid>`; the user claims it in Rewards Center. |
| Contest participation / runner-up | Coin Economy → XP → "Contest rewards (Diamonds)" (`monetization.earning.contestRewards {enabled, participation, runnerUp, paidOnly}`) | Created inside the winner settlement batch (`contestSettlement.ts#settleWinner`), gated on that settlement: `contest:<match>:participation:<uid>` for both players and `contest:<match>:runner_up:<loser>`. Never for refunded/cancelled matches or farmed repeat pairs; with `paidOnly` (default) only for battles with an entry fee. Claimable even with the gamification experience off. |

The contest **winner** still gets the DP coin prize only. "Special" in the Rewards Center is the Hall of Fame.

### Special events (`/earn/events`, migration 0086)

Admin: Gamification → Events (`GET/PUT /admin/earning/events[/:id]`, `GET .../:id/participants`; saving is a
sensitive action). An event has a title, banner (shop-banner upload), start / end, eligibility (minimum level,
minimum account age, verified only), an optional Diamond budget, and tasks. Each task uses a quest metric (`votes`, `entries`, `wins`, `checkins`,
`active_days`, `xp`), a target and a 💎 Diamond reward.

- The user joins (`joinEvent`). Progress counts from the later of the event start and the join time to the earlier
  of now and the event end, with the same counters as quests (`questProgress`).
- `claimEventTask` pays once per user per task (`reward_event_claims` primary key; ledger type `event_reward`, id
  `event:<event>:<task>:<uid>`). It pays from the free-rewards budget and counts in `dailyFreeDiamondCap`. Errors:
  `event_ineligible`, `event_budget_exhausted` (the sum of claims reached the event budget), `rewards_held`
  (bonus-chasing hold), `daily_free_limit`, `free_rewards_exhausted`.
- Claims stay open for 24 hours after the event ends. A task that has claims can't be edited, and the budget
  can't be set below what has already been claimed.
- Events are not tied to the gamification experience switch. They stop with the earning kill switch (App Control).
- The Rewards Center "Special Events" card shows the featured live event, or the season when there is none.
- Account deletion keeps the event claim and participant rows with the uid anonymised.

### Reward History and Top Earners

- **Reward History** (`/earn/history`, action `getRewardHistory {tab, cursor, limit}`, `lib/rewardHistory.ts`): the
  caller's own rows from `coin_transactions` and `user_xp_events`, newest first, keyset cursor
  `<created_at>:<c|x>:<id>` (index `idx_txn_uid_created`, migration 0087). Tabs:
  | Tab | Rows |
  |---|---|
  | All | every coin ledger row and every XP event |
  | Diamonds Earned | Diamond credits of the reward types (`locked_delta > 0`), incl. the Diamond part of a capped contest win |
  | XP Earned | XP events with a positive delta, except reversals, admin adjustments and the opening balance |
  | DP Coins Won | `contest_win_reward` rows with a DP coin part |
  | Diamonds Spent | Diamond debits that are not a correction (contest entry fees) |
  | XP Conversion | `xp_conversion` rows, with the XP used from `xp_conversions` |
  | Reversed / Adjusted | clawbacks, admin adjustments, deletion forfeits, rounding, resets, and XP reversals |
  XP staff reasons are never returned. The older XP-only list (`/rewards/history`) stays.
- **Top Earners** (`/read/leaderboard/diamonds?period=day|week|month`, `/me`; app `/rewards/leaderboard?board=diamonds`):
  Diamonds from `daily_reward`, `daily_task`, `ad_reward`, `gamification_reward`, `monthly_hall_of_fame_reward`,
  `quest_reward`, `achievement_reward`, `contest_reward`, `event_reward`, `xp_conversion` and `referral_bonus`,
  summed with `referral_clawback` so a reversed referral stops counting. One-off bonuses (signup, verification,
  promo), refunds and DP coin don't rank. Periods are reward days (`dayResetOffsetMinutes`). Same visibility
  rule, tie-break (score, lifetime XP, account age, uid), 500-deep limit and block filter as the XP boards.
  The XP board also has a `day` (Today) period.

### Earning Management (admin panel group)

One sidebar group, "Earning Management", holds every Rewards Center control:

| Page | What it does |
|---|---|
| Earning Dashboard (`/earning-dashboard`, `GET /admin/earning/analytics?days=7\|30\|90`) | 💎 earned, 💎 reversed, 🪙 DP coin won, XP and distinct earners per reward day; totals by ledger type; special-event claims; top 20 earners. House accounts excluded (`lib/earningAnalytics.ts`). |
| CSV export (`GET /admin/earning/export?kind=daily\|ledger&days=`) | Daily summary per type plus XP (up to 90 days), or every earning ledger row (up to 31 days, 20,000 rows; `X-Truncated: 1` when cut). Text cells are formula-safe. Each export is audited (`earning.export`). |
| Earn Settings (💎 Diamond) | Coin Economy → Diamond tab (check-in, tasks, ads, signup bonus, contest rewards). |
| Special Events (`/earning-events`) | The event editor (also in Gamification → Events). |
| Gamification, Referral Program | Moved into the group unchanged. |
| Earning Assets (`/earning-assets`) | Every artwork key with its bundled WebP and who changed it last. Pick a WebP or PNG; the panel checks it (1 MB, square within 2%, 128-2048 px, transparent) and shows a preview at the app's sizes (24/40/58/92 pt) next to what is live; **Publish** uploads it (`POST /admin/media/earning-asset`, which enforces the same rules from the file header, stored under `earning-assets/`) and switches the slot (`PUT /admin/earning/assets/:key {url}`; the object must exist in R2). **Reset** brings the bundled art back (`{url: null}`); **History** (`GET .../:key/history`) restores an earlier upload. Saved in `appConfig.earningAssets`, delivered by `/read/app-config` and the realtime config push, so no app update is needed. In the app the bundled art is the placeholder while an upload loads and the fallback if it fails; uploads load as a resized variant. Only known keys and our own `earning-assets/` URLs are accepted; the full App Settings save ignores this field. Upload and save need a recent sign-in and are audited (`earning.asset.upload / update / reset`). |
| Audit & Alerts (`/earning-audit`) | `GET /admin/earning/audit`: admin actions on events, artwork, gamification, referrals, budgets, wallet adjustments and reward settings, paged. `GET /admin/earning/notifications`: admin alerts that link to an earning page. The 6-hourly coin alerts also flag a special event whose Diamond budget is 80%+ claimed. |

## Daily check-in, daily tasks, referrals (admin controls)

- **Daily check-in** (Earn → Daily check-in, `gamification` row): on/off (`dailyLoginEnabled`), base + streak bonus (bonus capped at 30 days) or a fixed per-day schedule (`dailyRewardSchedule`, up to 30 days, repeats). The app draws its track from `getDailyReward`, which uses the same function the claim pays with, so the app and the server always agree.
- **Day reset** (`dayResetOffsetMinutes`): when the reward day starts, as minutes ahead of UTC (0 = midnight UTC, 330 = midnight IST). Used by check-in, daily tasks and the rewarded-ad cap. The day it changes, a user may get one extra claim.
- **Daily tasks** (Earn → Daily tasks): per task `enabled`, optional `startsAt` / `endsAt`. Types: `vote` (votes today), `share` (different battles shared today; the same battle again within 24h is not recorded), `contest` (contest entries today), `ad`. Progress is counted on the server. Task ids are locked in the panel once saved, because a new id can be claimed again the same day.
- **Stats** (Earn → "Check-in aur tasks" card, `GET /admin/rewards/stats`): check-ins, task claims and coins per day; users on 7+ and 30+ day streaks.
- **One user** (Users → user → rewards): streak, check-ins, task claims, referrals, and the audited streak fix (`PATCH /admin/users/:id/streak`).
- **Referral caps and budget**: the lifetime cap, 24h cap and monthly budget (`maxCoinsPerMonth`, inviter + friend coins per UTC month) are sub-queries in the WHERE of the single `rewarded` flip, so referrals that qualify at the same moment cannot overshoot them. Over the budget, a referral waits in review and the cron pays it once there is room. The coins are credited after the flip; the cron repairs a credit lost to a crash.
- **Referral rules**: qualify on `signup`, `verified` or `first_contest`; a friend blocked or deleted before payout is rejected (`referred_unavailable`).
- **Referral admin tools** (Referrals page): bulk approve / reject, linked accounts (same device / IP, the inviter's referrals per IP), and **Reverse** for a rewarded referral. Reverse takes back what each credit added, from the same balance (Diamond or DP coin), up to what is left in the wallet (`referral_clawback` ledger rows), and reports any shortfall. Milestone bonuses are not touched.

## Alerts and reports (`lib/coinAlerts.ts`)

- Every 6 hours: budget ≥ 80% used, a user with more free coins in 24h than `coinAlerts.dailyFreeCoinsPerUser` (default 300). Admin notification + email to `adminAlertEmail`, deduplicated.
- Report email: daily (08:30 IST) and weekly (Monday), switches in `coinReport`. Earn tab has "send now" and "check alerts now" buttons.

## Go-live checklist

1. Coin Economy → Budgets: set the approval password.
2. App Settings: set **Admin alert email**. Coin Economy → Earn → "Aaj ki report abhi bhejo" and confirm the email arrives.
3. Create a `free_rewards` budget and link it in Earn → Free rewards budget. Claim the daily reward with a test account and check the budget is charged.
4. For a product contest: set the prize coin value, link a `product_prize` budget, play one match, and check Contests P&L.
5. Health tab: every row shows OK and every reconciliation check is green.
6. Signup bonus: verify email + mobile on a test account and check it arrives (or lands in Signup bonus review).
