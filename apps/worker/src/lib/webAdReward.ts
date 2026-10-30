/**
 * Rewarded ads on the WEB build (Google Ad Manager / GPT).
 *
 * Unlike AdMob in the app, GPT has NO server-side verification: the only signal
 * that an ad was watched is the browser's `rewardedSlotGranted` event. So this
 * pays on the client's word, and every limit below exists to bound what a
 * scripted client can take:
 *
 *  1. Watch token. `startWebAd` signs {uid, nonce, issuedAt, minWatch, exp}
 *     (HMAC-SHA256, stateless). `claimWebAdReward` only pays a token that is
 *     the caller's own, at least `minWatchSec` old and not expired.
 *  2. One payout per token: the claim's primary key is `web:<nonce>`.
 *  3. Its own daily cap (`monetization.ads.web.dailyCap`), counted on
 *     `ad_reward_claims` rows with provider 'web', inside the crediting batch.
 *  4. Verified mobile number required (default on).
 *  5. The shared daily free Diamond cap and the free-rewards budget.
 *  6. Paid in Diamonds only (play-only, `locked_delta` = reward).
 *  7. Deploy switch: nothing pays unless `ALLOW_WEB_AD_REWARDS` is exactly
 *     "true", so the admin panel alone can never turn this on.
 *
 * A script that waits `minWatchSec` per token can still collect up to the daily
 * cap without watching. That is the accepted cost of web rewarded ads; keep the
 * reward and the cap small.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { getAppConfig } from "./settings";
import { parseMonetizationConfig, webRewardedReady, webRewardedUnit } from "./monetizationConfig";
import { getSettings, rewardDayNumber, rewardDayStart } from "./gamification";
import { assertUnderFreeDiamondCap, dailyFreeLimitError, economyConfig, freeDiamondCapGate, overFreeDiamondCap } from "./economyLimits";
import { FREE_REWARDS_EXHAUSTED, freeRewardBudgetStatements, freeRewardsBudgetId } from "./promoBudget";

/** A token is valid this long after it was issued (an ad plus a slow network). */
export const WEB_AD_TOKEN_TTL_MS = 5 * 60 * 1000;
export const WEB_AD_PROVIDER = "web";

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
};

/** True when the deploy-level switch allows paying web ads on the client's word. */
export const webAdsDeployAllowed = (env: Env) => (env as any).ALLOW_WEB_AD_REWARDS === "true";

async function tokenKey(env: Env): Promise<CryptoKey | null> {
  const dedicated = (env as any).WEB_AD_TOKEN_SECRET as string | undefined;
  const base = dedicated || (env.ADMIN_PROXY_SECRET ? `web-ad-token.v1|${env.ADMIN_PROXY_SECRET}` : "");
  if (!base) return null;
  return crypto.subtle.importKey("raw", enc.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

interface TokenData {
  u: string;
  n: string;
  i: number;
  w: number;
  e: number;
}

async function mintToken(env: Env, data: TokenData): Promise<string> {
  const key = await tokenKey(env);
  if (!key) throw httpsError("failed-precondition", "Web ads are not configured on the server.");
  const payload = b64url(enc.encode(JSON.stringify(data)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`wad1.${payload}`)));
  return `${payload}.${b64url(sig)}`;
}

async function readToken(env: Env, token: unknown): Promise<TokenData | null> {
  if (typeof token !== "string" || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const key = await tokenKey(env);
  if (!key) return null;
  try {
    const payload = token.slice(0, dot);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(token.slice(dot + 1)), enc.encode(`wad1.${payload}`));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof d?.u !== "string" || typeof d?.n !== "string" || !/^[a-f0-9]{32}$/.test(d.n)) return null;
    if (![d.i, d.w, d.e].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
    return d as TokenData;
  } catch {
    return null;
  }
}

function randomNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Everything both actions check before anything else. */
async function webAdContext(env: Env, uid: string) {
  const cfg = await getAppConfig(env);
  const m = parseMonetizationConfig(cfg);
  if (!webRewardedReady(m) || !webAdsDeployAllowed(env)) {
    throw httpsError("failed-precondition", "Web par video ads abhi band hain.");
  }
  const w = m.ads.web;
  if (w.requireVerifiedPhone) {
    const row = await env.DB.prepare(`SELECT phone_verified AS v FROM users WHERE uid = ? AND COALESCE(is_blocked, 0) = 0`).bind(uid).first<{ v: number }>();
    if (!row) throw httpsError("not-found", "User not found.");
    if (!Number(row.v)) {
      throw httpsError("failed-precondition", "Ad reward ke liye pehle mobile number verify karo.", "phone_not_verified");
    }
  }
  const offset = (await getSettings(env)).dayResetOffsetMinutes;
  return { cfg, w, offset, unit: webRewardedUnit(m) };
}

/** Paid web ad views today for `uid` (same reward day as the other free rewards). */
export async function webAdsWatchedToday(env: Env, uid: string, day: number): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ad_reward_claims WHERE uid = ? AND day = ? AND provider = ?`)
    .bind(uid, day, WEB_AD_PROVIDER)
    .first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/** `startWebAd`: a signed watch token, refused when today's cap is already used. */
export async function startWebAd(env: Env, uid: string, ts: number) {
  const { w, offset, unit } = await webAdContext(env, uid);
  const day = rewardDayNumber(ts, offset);
  const watched = await webAdsWatchedToday(env, uid, day);
  if (watched >= w.dailyCap) throw httpsError("resource-exhausted", "Aaj ke saare ads ho gaye. Kal phir aao!");
  const minWatchMs = w.minWatchSec * 1000;
  const token = await mintToken(env, { u: uid, n: randomNonce(), i: ts, w: minWatchMs, e: ts + WEB_AD_TOKEN_TTL_MS });
  return {
    token,
    adUnitPath: unit,
    rewardDiamonds: w.rewardDiamonds,
    minWatchSec: w.minWatchSec,
    claimableAt: ts + minWatchMs,
    expiresAt: ts + WEB_AD_TOKEN_TTL_MS,
    remaining: w.dailyCap - watched,
  };
}

/** `claimWebAdReward`: pay one token once, inside the caps. */
export async function claimWebAdReward(env: Env, uid: string, token: unknown, ts: number) {
  const data = await readToken(env, token);
  if (!data || data.u !== uid) throw httpsError("invalid-argument", "Ad token galat hai. Dobara ad dekho.");
  if (ts > data.e) throw httpsError("failed-precondition", "Ad token expire ho gaya. Dobara ad dekho.");
  if (ts < data.i + data.w) throw httpsError("failed-precondition", "Ad poora dekho, phir reward milega.");

  const { cfg, w, offset } = await webAdContext(env, uid);
  const reward = w.rewardDiamonds;
  const day = rewardDayNumber(ts, offset);
  const dayStart = rewardDayStart(ts, offset);
  const claimId = `web:${data.n}`;

  const prior = await env.DB.prepare(`SELECT 1 AS x FROM ad_reward_claims WHERE id = ?`).bind(claimId).first();
  if (prior) throw httpsError("already-exists", "Is ad ka reward mil chuka hai.");

  const freeCap = economyConfig(cfg).dailyFreeDiamondCap;
  await assertUnderFreeDiamondCap(env, freeCap, uid, dayStart, reward);
  const capGate = freeDiamondCapGate(freeCap, uid, dayStart, reward);
  const claimGate = `EXISTS (SELECT 1 FROM ad_reward_claims WHERE id = ?)`;
  const budget = freeRewardBudgetStatements(env, {
    budgetId: freeRewardsBudgetId(cfg),
    refId: `ad:${claimId}`,
    uid,
    coins: reward,
    ts,
    label: "Rewarded ad (web)",
    gate: claimGate,
    gateArgs: [claimId],
  });
  const ledgerId = `ad_reward:${claimId}`;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO ad_reward_claims (id, uid, day, provider, reward, created_at)
       SELECT ?, ?, ?, ?, ?, ?
        WHERE (SELECT COUNT(*) FROM ad_reward_claims WHERE uid = ? AND day = ? AND provider = ?) < ? AND ${capGate.sql}`,
    ).bind(claimId, uid, day, WEB_AD_PROVIDER, reward, ts, uid, day, WEB_AD_PROVIDER, w.dailyCap, ...capGate.args),
    ...budget.reserve,
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, 'ad_reward', 'Rewarded ad (web) · Diamond', ?, ?
        WHERE ${claimGate} AND ${budget.heldGate}`,
    ).bind(ledgerId, uid, reward, ts, reward, claimId, ...budget.heldArgs),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ?
        WHERE uid = ? AND ${claimGate} AND ${budget.heldGate}
          AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)`,
    ).bind(reward, reward, ts, uid, claimId, ...budget.heldArgs, ledgerId),
    ...budget.finalize,
    // Budget had no room: the claim must not count against today's cap.
    ...(budget.reservationId
      ? [env.DB.prepare(`DELETE FROM ad_reward_claims WHERE id = ? AND NOT EXISTS (SELECT 1 FROM promo_reservations WHERE id = ?)`).bind(claimId, budget.reservationId)]
      : []),
  ]);
  if (Number(results[0]?.meta?.changes || 0) === 0) {
    const again = await env.DB.prepare(`SELECT 1 AS x FROM ad_reward_claims WHERE id = ?`).bind(claimId).first();
    if (again) throw httpsError("already-exists", "Is ad ka reward mil chuka hai.");
    if (await overFreeDiamondCap(env, freeCap, uid, dayStart, reward)) throw dailyFreeLimitError(freeCap);
    throw httpsError("resource-exhausted", "Aaj ke saare ads ho gaye. Kal phir aao!");
  }
  if (Number(results[budget.reserve.length + 1]?.meta?.changes || 0) === 0) {
    throw httpsError("failed-precondition", "Aaj ke free rewards khatam ho gaye hain. Thodi der baad try karo.", FREE_REWARDS_EXHAUSTED);
  }
  const watched = await webAdsWatchedToday(env, uid, day);
  return { success: true, reward, lockedCoins: reward, remaining: Math.max(0, w.dailyCap - watched) };
}
