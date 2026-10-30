/**
 * Shop fraud controls (lib/shop.ts calls these at checkout).
 *
 * Free Diamonds → contests → DP coin → real products is worth farming, so the
 * shop has two kinds of rule (all thresholds in Coin Economy / Shopping
 * settings, `appConfig.monetization.shop.fraud`):
 *
 * HARD RULES: clear, announced, and the order is refused with a reason the app
 * shows. The limits are ALSO evaluated inside the checkout transaction
 * (`limitGate`), so two orders racing each other cannot both slip under a cap.
 *   phone_not_verified   mobile number not verified
 *   account_too_new      account younger than minAccountAgeDays
 *   order_limit          maxOrdersPer30Days reached (cancelled orders don't count)
 *   coin_limit           maxCoinsPer30Days of DP coin would be exceeded
 *   address_limit        address or phone already used by maxAccountsPerAddress
 *                        different accounts in 90 days
 *
 * REVIEW SIGNALS: weak on their own, so they never refuse an order. The order
 * is placed (coins held, stock reserved) but waits for an admin to approve it
 * before it can be packed; a rejected order is cancelled and fully refunded.
 *   first_order          the account's first shop order
 *   large_order          total at or above reviewAboveCoins
 *   shared_device        another account signed up from this device
 *   shared_address       another account has shipped to this address / phone
 *   new_account          account younger than 7 days
 *   same_opponent_wins   most of the account's contest wins came from beating
 *                        one opponent (possible collusion)
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import type { ShopFraudConfig } from "./monetizationConfig";

const DAY = 86_400_000;
export const LIMIT_WINDOW_MS = 30 * DAY;
export const ADDRESS_WINDOW_MS = 90 * DAY;

export const RISK_FLAG_LABELS: Record<string, string> = {
  first_order: "Pehla order",
  large_order: "Bada order",
  shared_device: "Same device par doosra account",
  shared_address: "Ye address / phone doosra account bhi use kar chuka",
  new_account: "Naya account (7 din se kam)",
  same_opponent_wins: "Zyada tar jeet ek hi opponent se (mili-bhagat ho sakti hai)",
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hashes of the normalised address (PIN + first line) and phone (last 10 digits). */
export async function addressFingerprints(address: { addressLine1: string; postalCode: string; phone: string }) {
  const line = String(address.addressLine1 || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const pin = String(address.postalCode || "").replace(/\D/g, "");
  const phone = String(address.phone || "").replace(/\D/g, "").slice(-10);
  return {
    addressFp: await sha256(`shop-address|${pin}|${line}`),
    phoneFp: await sha256(`shop-phone|${phone}`),
  };
}

export interface Fingerprints {
  addressFp: string;
  phoneFp: string;
}

/**
 * SQL (no leading AND) that is true while every hard limit still holds, for an
 * order of `coins`. Evaluated inside the checkout batch.
 */
export function limitGate(uid: string, coins: number, fps: Fingerprints, cfg: ShopFraudConfig, ts: number): { sql: string; args: unknown[] } {
  const since = ts - LIMIT_WINDOW_MS;
  const addrSince = ts - ADDRESS_WINDOW_MS;
  return {
    sql: `(SELECT COUNT(*) FROM shop_orders WHERE uid = ? AND created_at >= ? AND status != 'cancelled') < ?
      AND (SELECT COALESCE(SUM(total_coins), 0) FROM shop_orders WHERE uid = ? AND created_at >= ? AND status NOT IN ('cancelled', 'returned')) + ? <= ?
      AND (SELECT COUNT(DISTINCT uid) FROM shop_orders WHERE (address_fp = ? OR phone_fp = ?) AND uid != ? AND created_at >= ?) < ?`,
    args: [
      uid, since, cfg.maxOrdersPer30Days,
      uid, since, coins, cfg.maxCoinsPer30Days,
      // Other accounts allowed = max - 1, i.e. fewer than `max` others.
      fps.addressFp, fps.phoneFp, uid, addrSince, cfg.maxAccountsPerAddress,
    ],
  };
}

interface Snapshot {
  phoneVerified: boolean;
  createdAt: number;
  deviceId: string | null;
  sharedDevice: number;
  orders30: number;
  coins30: number;
  ordersEver: number;
  otherAccountsOnAddress: number;
  wins: number;
  topOpponentWins: number;
}

async function snapshot(env: Env, uid: string, fps: Fingerprints, ts: number): Promise<Snapshot | null> {
  const r = await env.DB.prepare(
    `SELECT u.created_at, u.device_id, COALESCE(u.phone_verified, 0) AS phone_verified, u.phone,
            (SELECT COUNT(*) FROM users o WHERE u.device_id IS NOT NULL AND o.device_id = u.device_id AND o.uid != u.uid) AS shared_device,
            (SELECT COUNT(*) FROM shop_orders s WHERE s.uid = u.uid AND s.created_at >= ? AND s.status != 'cancelled') AS orders30,
            (SELECT COALESCE(SUM(total_coins), 0) FROM shop_orders s WHERE s.uid = u.uid AND s.created_at >= ? AND s.status NOT IN ('cancelled', 'returned')) AS coins30,
            (SELECT COUNT(*) FROM shop_orders s WHERE s.uid = u.uid AND s.status != 'cancelled') AS orders_ever,
            (SELECT COUNT(DISTINCT s.uid) FROM shop_orders s WHERE (s.address_fp = ? OR s.phone_fp = ?) AND s.uid != u.uid AND s.created_at >= ?) AS other_accounts
       FROM users u WHERE u.uid = ?`,
  ).bind(ts - LIMIT_WINDOW_MS, ts - LIMIT_WINDOW_MS, fps.addressFp, fps.phoneFp, ts - ADDRESS_WINDOW_MS, uid).first<any>();
  if (!r) return null;
  // Contest wins in 90 days, and how many of them were against the most-beaten opponent.
  const opp = await env.DB.prepare(
    `SELECT opponent, COUNT(*) AS n FROM (
        SELECT CASE WHEN json_extract(user_a, '$.uid') = ? THEN json_extract(user_b, '$.uid') ELSE json_extract(user_a, '$.uid') END AS opponent
          FROM contest_matches WHERE winner_uid = ? AND created_at >= ?)
      WHERE opponent IS NOT NULL GROUP BY opponent ORDER BY n DESC`,
  ).bind(uid, uid, ts - ADDRESS_WINDOW_MS).all<any>().catch(() => ({ results: [] as any[] }));
  const rows = opp.results ?? [];
  return {
    phoneVerified: Number(r.phone_verified) === 1 && !!r.phone,
    createdAt: Number(r.created_at),
    deviceId: r.device_id ?? null,
    sharedDevice: Number(r.shared_device),
    orders30: Number(r.orders30),
    coins30: Number(r.coins30),
    ordersEver: Number(r.orders_ever),
    otherAccountsOnAddress: Number(r.other_accounts),
    wins: rows.reduce((s: number, x: any) => s + Number(x.n), 0),
    topOpponentWins: rows.length ? Number(rows[0].n) : 0,
  };
}

export interface RiskResult {
  flags: string[];
  needsReview: boolean;
  deviceId: string | null;
}

/** Throws for a hard rule; otherwise returns the review flags for this order. */
export async function assessOrder(env: Env, uid: string, coins: number, fps: Fingerprints, cfg: ShopFraudConfig, ts = Date.now()): Promise<RiskResult> {
  const s = await snapshot(env, uid, fps, ts);
  if (!s) throw httpsError("not-found", "User not found.");
  explainHardLimit(s, coins, cfg, ts);

  const flags: string[] = [];
  if (cfg.reviewFirstOrder && s.ordersEver === 0) flags.push("first_order");
  if (cfg.reviewAboveCoins > 0 && coins >= cfg.reviewAboveCoins) flags.push("large_order");
  if (s.sharedDevice > 0) flags.push("shared_device");
  if (s.otherAccountsOnAddress > 0) flags.push("shared_address");
  if (s.createdAt > ts - 7 * DAY) flags.push("new_account");
  if (s.wins >= 3 && s.topOpponentWins / s.wins >= 0.5) flags.push("same_opponent_wins");
  return { flags, needsReview: flags.length > 0, deviceId: s.deviceId };
}

function explainHardLimit(s: Snapshot, coins: number, cfg: ShopFraudConfig, ts: number): void {
  if (cfg.requireVerifiedPhone && !s.phoneVerified) {
    throw httpsError("failed-precondition", "Order karne se pehle apna mobile number verify karo.", "phone_not_verified");
  }
  if (cfg.minAccountAgeDays > 0 && s.createdAt > ts - cfg.minAccountAgeDays * DAY) {
    const days = Math.ceil((s.createdAt + cfg.minAccountAgeDays * DAY - ts) / DAY);
    throw httpsError("failed-precondition", `Naye account ${cfg.minAccountAgeDays} din baad order kar sakte hain. ${days} din aur ruko.`, "account_too_new");
  }
  if (s.orders30 >= cfg.maxOrdersPer30Days) {
    throw httpsError("resource-exhausted", `30 din mein maximum ${cfg.maxOrdersPer30Days} order ho sakte hain.`, "order_limit");
  }
  if (s.coins30 + coins > cfg.maxCoinsPer30Days) {
    throw httpsError("resource-exhausted", `30 din mein maximum ${cfg.maxCoinsPer30Days} DP coin ki shopping ho sakti hai. Abhi ${Math.max(0, cfg.maxCoinsPer30Days - s.coins30)} bache hain.`, "coin_limit");
  }
  if (s.otherAccountsOnAddress >= cfg.maxAccountsPerAddress) {
    throw httpsError("failed-precondition", "Ye address ya phone number pehle hi doosre accounts use kar chuke hain. Apna address use karo.", "address_limit");
  }
}

/** After a checkout batch was refused by `limitGate`, find which limit it was. */
export async function explainRefusal(env: Env, uid: string, coins: number, fps: Fingerprints, cfg: ShopFraudConfig, ts = Date.now()): Promise<void> {
  const s = await snapshot(env, uid, fps, ts);
  if (s) explainHardLimit(s, coins, cfg, ts);
}
