# tophunt-social: setup and isolation status

This repo is a fresh copy (no git history) of `Tophunt-max/TophuntDPcontest` at commit `14cc79b`.
It must never touch the live TopHunt production app (`api.tophunt.in`, `tophunt-db`, app ID `in.tophunt.app`).

## Decisions already made

| Topic | Decision |
|---|---|
| Repo | `Tophunt-max/tophunt-social`, public for now |
| App ID | `in.tophunt.social` (iOS bundle ID and Android package) |
| Deep-link scheme | `tophuntsocial` (live app keeps `tophunt`) |
| Firebase | Keep `tophuntdpcontest` so existing users can sign in |
| Expo OTA | Disabled. Old EAS `projectId`, `owner` and updates URL removed. A new EAS project will be set up later |
| Cloudflare | Fresh resources in a NEW account (not the live TopHunt account, not the "sarkari jobs" account) |

## What the isolation commit changed

- `apps/worker/wrangler.toml`
  - Worker name `tophunt-social-api` (staging: `tophunt-social-api-staging`).
  - Custom domain route `api.tophunt.in` commented out; the API runs on `workers.dev`.
  - D1 `tophunt-social-db`, R2 `tophunt-social-media`, Queue `tophunt-social-broadcast`, Analytics dataset `tophunt_social_events`.
  - All live IDs replaced with placeholders (see below).
  - `MEDIA_TRANSFORMATIONS = "false"` (no zone host yet), `R2_LEGACY_BASE_URLS = ""`.
  - `ALLOWED_ORIGINS` = `https://tophunt-social.pages.dev,https://tophunt-social-admin.pages.dev`.
- `apps/expo/app.json`: new app ID, slug `tophunt-social`, scheme `tophuntsocial`, `updates.enabled = false`, removed `tophunt.in` associated domains / Android intent filters.
- `apps/expo/eas.json`: preview/production API and share URLs point to the new hosts (placeholders).
- `apps/expo/src/services/api.ts`: fallback API URL points to the new Worker.
- `apps/expo/src/services/auth/socialAuth.ts`: OAuth redirect scheme `tophuntsocial`.
- `apps/admin-panel/.env.production`: `VITE_API_URL` points to the new Worker.
- `.github/workflows`: `uptime.yml` and `backup-d1.yml` schedules disabled (manual run only); `media-domain-backfill.yml` and `blog-link-backfill.yml` removed (they rewrote live production data).

## Cloudflare resources (created 2026-10-29)

The owner chose to host these in the existing account `8357be8f…` (the live TopHunt account) instead of a new account, and plans to remove the old resources later. Only the `tophunt-social-*` resources below belong to this repo. Do not touch `tophunt-db`, `tophunt-media`, `tophunt-broadcast`, `tophunt-api-*` KV or the `tophunt-api` Worker.

| Resource | Name | ID |
|---|---|---|
| D1 | `tophunt-social-db` | `2d7aafa4-59ec-4807-bdda-d6dbae01cdf0` |
| KV (`OTP_KV`) | `tophunt-social-OTP_KV` | `88dd5525822b401b9f02e1e08863e3b0` |
| KV (`CACHE_KV`) | `tophunt-social-CACHE_KV` | `f53ab0b88b924b56a4be36820ec50d6b` |
| R2 | `tophunt-social-media` | - |
| Queue | `tophunt-social-broadcast` | `7ddc419169f74f919b849925c0b8fad8` |
| workers.dev subdomain | `weadown-in` | API host: `tophunt-social-api.weadown-in.workers.dev` |
| Pages | `tophunt-social`, `tophunt-social-admin` | Not created yet: the API token lacks Cloudflare Pages permission |

Rate-limit namespace IDs were moved to `7401`/`7403` (prod) and `7402`/`7404` (staging) because `7301`-`7304` came from the live repo and namespace IDs are shared account-wide.

## Placeholders to fill once the new Cloudflare account is connected

Filled on 2026-10-29 except the `REPLACE_WITH_STAGING_*` values (no staging env created).

| Placeholder | Where | Value |
|---|---|---|
| `REPLACE_WITH_D1_ID` | `wrangler.toml` (database_id, CF_D1_DATABASE_ID) | `wrangler d1 create tophunt-social-db` |
| `REPLACE_WITH_OTP_KV_ID` | `wrangler.toml` | `wrangler kv namespace create OTP_KV` |
| `REPLACE_WITH_CACHE_KV_ID` | `wrangler.toml` | `wrangler kv namespace create CACHE_KV` |
| `REPLACE_WITH_CF_ACCOUNT_ID` | `wrangler.toml` | New account ID |
| `REPLACE_WITH_WORKERS_SUBDOMAIN` | `wrangler.toml`, `eas.json`, `api.ts`, admin `.env.production` | Account's `*.workers.dev` subdomain |
| `REPLACE_WITH_STAGING_*` | `wrangler.toml` `[env.staging]` | Only if a staging env is created |
| `REPLACE_WITH_API_HOST` / `REPLACE_WITH_WEB_HOST` | `.github/workflows/uptime.yml` | New hosts |

Also required:
- Enable R2 in the dashboard, then `wrangler r2 bucket create tophunt-social-media`.
- `wrangler queues create tophunt-social-broadcast`.
- Create Pages projects `tophunt-social` (Expo web) and `tophunt-social-admin` (admin panel).
- Worker secrets: see `apps/worker/.dev.vars.example` (`wrangler secret put <NAME>`).
- Firebase console → Authentication → Settings → Authorized domains: add the new `pages.dev` hosts.
- GitHub repo secrets for workflows: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Still pointing at live `tophunt.in` (not changed yet)

These are brand/domain references, not credentials. Update them when the new domain is decided:
- `apps/expo/public/_worker.js` (default API/site origin and CSP `connect-src`). **The new web app cannot call the new API until the CSP includes the new Worker host.**
- `apps/expo/public/_headers`, `apps/admin-panel/public/_headers`, `apps/expo/public/firebase-messaging-sw.js`
- `apps/expo/src/lib/authDomain.ts`, `share.ts`, `shareMedia.ts`, `imageVariants.ts`
- `apps/worker/src/content/legal.ts`, `src/lib/seoAudit.ts`, `src/lib/r2.ts`, `src/routes/read.ts`
- `.env.example` files, `email-templates/`, tests that use `tophunt.in` as fixture data
- `apps/worker/migrations/0064_seed_explore_banners.sql` (migrations are append-only; fix with a new migration if needed)

## Validation at import time

| Check | Result |
|---|---|
| Worker typecheck | Passed |
| Worker tests | 92 files, 1740 tests passed |
| Worker `wrangler deploy --dry-run` | Passed (bindings show new names/placeholders) |
| Expo typecheck | Passed (7 pre-existing errors in node_modules ignored by the script) |
| Expo tests | 103 files, 1113 tests passed |
| Admin typecheck + build | Passed |
