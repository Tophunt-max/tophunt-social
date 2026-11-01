/**
 * AdMob rewarded-ad Server-Side Verification (SSV).
 *
 * Google calls `GET /webhook/admob/ssv?...&signature=..&key_id=..` when a user
 * earns a reward. The query string up to `&signature=` is signed with ECDSA
 * P-256 / SHA-256 (DER signature, URL-safe base64). Public keys are published
 * at VERIFIER_KEYS_URL and rotate, so they are cached briefly and re-fetched on
 * an unknown key id.
 * Reference: https://developers.google.com/admob/android/ssv
 *
 * Crediting rules (deliberately narrower than the legacy client claim):
 *  - Reward is paid in Diamonds only (play-only, never withdrawable), amount
 *    and daily cap from `monetization.ads.rewarded`, never from the callback.
 *  - `transaction_id` is the claim's primary key, so a replayed callback is a
 *    no-op. The daily cap is enforced inside the same transaction.
 *  - The free-rewards promo budget is charged like every other free reward.
 */
import type { Env } from "../types";
import { getAppConfig } from "./settings";
import { parseMonetizationConfig } from "./monetizationConfig";
import { getSettings, rewardDayNumber, rewardDayStart } from "./gamification";
import { economyConfig, freeDiamondCapGate } from "./economyLimits";
import { freeRewardBudgetStatements, freeRewardsBudgetId } from "./promoBudget";
import { memoGet, memoPut } from "./memo";

export const VERIFIER_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const KEYS_MEMO = "memo:admob:ssv-keys";
const KEYS_TTL_SEC = 3600;

function b64ToBytes(b64: string): Uint8Array {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Convert a DER ECDSA signature to the raw r||s form WebCrypto expects. */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array {
  if (der[0] !== 0x30) throw new Error("bad DER");
  let off = 2;
  if (der[1] & 0x80) off = 2 + (der[1] & 0x7f);
  const readInt = (): Uint8Array => {
    if (der[off] !== 0x02) throw new Error("bad DER int");
    const len = der[off + 1];
    let v = der.slice(off + 2, off + 2 + len);
    off += 2 + len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new Error("bad DER int length");
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

type KeyMap = Record<string, string>; // keyId -> base64 SPKI

async function fetchKeys(fetcher: typeof fetch): Promise<KeyMap> {
  const res = await fetcher(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`verifier keys HTTP ${res.status}`);
  const body: any = await res.json();
  const map: KeyMap = {};
  for (const k of body?.keys ?? []) if (k?.keyId != null && typeof k.base64 === "string") map[String(k.keyId)] = k.base64;
  if (!Object.keys(map).length) throw new Error("no verifier keys");
  return map;
}

async function keyFor(keyId: string, fetcher: typeof fetch): Promise<string | null> {
  let keys = memoGet<KeyMap>(KEYS_MEMO);
  if (!keys || !keys[keyId]) {
    keys = await fetchKeys(fetcher);
    memoPut(KEYS_MEMO, keys, KEYS_TTL_SEC);
  }
  return keys[keyId] ?? null;
}

export interface SsvParams {
  transactionId: string;
  userId: string;
  adUnit: string;
  rewardAmount: string;
  rewardItem: string;
  timestamp: number;
}

/**
 * Verify the signature over the raw query string. Returns the parsed params on
 * success, or null for anything that does not verify.
 */
export async function verifySsv(rawQuery: string, fetcher: typeof fetch = fetch): Promise<SsvParams | null> {
  const q = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const i = q.indexOf("&signature=");
  if (i <= 0) return null;
  const content = q.slice(0, i);
  const tail = q.slice(i + 1);
  const params = new URLSearchParams(tail);
  const sig = params.get("signature");
  const keyId = params.get("key_id");
  if (!sig || !keyId || !/^\d{1,20}$/.test(keyId)) return null;
  // key_id must be the last parameter; anything after it would be unsigned.
  if (!tail.endsWith(`key_id=${keyId}`)) return null;
  let ok = false;
  try {
    const spki = await keyFor(keyId, fetcher);
    if (!spki) return null;
    const key = await crypto.subtle.importKey("spki", b64ToBytes(spki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(b64ToBytes(sig)), new TextEncoder().encode(content));
  } catch (e) {
    console.error("[admob-ssv] verification error", e);
    return null;
  }
  if (!ok) return null;
  const p = new URLSearchParams(content);
  const transactionId = p.get("transaction_id") ?? "";
  if (!/^[A-Za-z0-9]{8,128}$/.test(transactionId)) return null;
  return {
    transactionId,
    userId: p.get("user_id") ?? "",
    adUnit: p.get("ad_unit") ?? "",
    rewardAmount: p.get("reward_amount") ?? "",
    rewardItem: p.get("reward_item") ?? "",
    timestamp: Number(p.get("timestamp") ?? 0),
  };
}

export type SsvOutcome = "credited" | "duplicate" | "disabled" | "unknown_user" | "cap_reached" | "budget_exhausted";

/** Credit a verified reward exactly once. */
export async function creditVerifiedAdReward(env: Env, p: SsvParams, ts = Date.now()): Promise<SsvOutcome> {
  const cfg = await getAppConfig(env);
  const m = parseMonetizationConfig(cfg);
  if (!m.ads.enabled || !m.ads.rewarded.enabled || m.ads.provider !== "admob") return "disabled";
  if (!p.userId || p.userId.length > 128) return "unknown_user";
  const user = await env.DB.prepare(`SELECT uid FROM users WHERE uid = ? AND COALESCE(is_blocked, 0) = 0`).bind(p.userId).first();
  if (!user) return "unknown_user";

  const claimId = `admob:${p.transactionId}`;
  const prior = await env.DB.prepare(`SELECT 1 AS x FROM ad_reward_claims WHERE id = ?`).bind(claimId).first();
  if (prior) return "duplicate";

  const reward = m.ads.rewarded.rewardDiamonds;
  const offset = (await getSettings(env)).dayResetOffsetMinutes;
  const day = rewardDayNumber(ts, offset);
  // Shared daily free Diamond cap (lib/economyLimits.ts); a capped view is not paid.
  const capGate = freeDiamondCapGate(economyConfig(cfg).dailyFreeDiamondCap, p.userId, rewardDayStart(ts, offset), reward);
  const claimGate = `EXISTS (SELECT 1 FROM ad_reward_claims WHERE id = ?)`;
  const budget = freeRewardBudgetStatements(env, {
    budgetId: freeRewardsBudgetId(cfg),
    refId: `ad:${claimId}`,
    uid: p.userId,
    coins: reward,
    ts,
    label: "Rewarded ad (verified)",
    gate: claimGate,
    gateArgs: [claimId],
  });
  const ledgerId = `ad_reward:${claimId}`;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO ad_reward_claims (id, uid, day, provider, reward, created_at)
       SELECT ?, ?, ?, 'admob', ?, ?
        WHERE (SELECT COUNT(*) FROM ad_reward_claims WHERE uid = ? AND day = ? AND COALESCE(provider, '') <> 'web') < ? AND ${capGate.sql}`,
    ).bind(claimId, p.userId, day, reward, ts, p.userId, day, m.ads.rewarded.dailyCap, ...capGate.args),
    ...budget.reserve,
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, 'ad_reward', 'Rewarded ad (verified) · Diamond', ?, ?
        WHERE ${claimGate} AND ${budget.heldGate}`,
    ).bind(ledgerId, p.userId, reward, ts, reward, claimId, ...budget.heldArgs),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ?
        WHERE uid = ? AND ${claimGate} AND ${budget.heldGate}
          AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)`,
    ).bind(reward, reward, ts, p.userId, claimId, ...budget.heldArgs, ledgerId),
    ...budget.finalize,
    ...(budget.reservationId
      ? [env.DB.prepare(`DELETE FROM ad_reward_claims WHERE id = ? AND NOT EXISTS (SELECT 1 FROM promo_reservations WHERE id = ?)`).bind(claimId, budget.reservationId)]
      : []),
  ]);
  if (Number(results[0]?.meta?.changes || 0) === 0) {
    const again = await env.DB.prepare(`SELECT 1 AS x FROM ad_reward_claims WHERE id = ?`).bind(claimId).first();
    return again ? "duplicate" : "cap_reached";
  }
  if (Number(results[budget.reserve.length + 1]?.meta?.changes || 0) === 0) return "budget_exhausted";
  return "credited";
}
