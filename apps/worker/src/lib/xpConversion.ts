/**
 * XP → Diamond conversion (an Earning method).
 *
 * `users.xp` never goes down: convertible XP is `xp - xp_converted`, so levels,
 * leaderboards and the XP ledger (xp = SUM(user_xp_events.delta)) are untouched.
 *
 * One D1 batch, exactly once:
 *   1. claim row in `xp_conversions`, gated on enough convertible XP and the
 *      daily Diamond cap, carrying a per-request nonce;
 *   2. free-rewards promo budget reserve (like every other free reward);
 *   3. Diamond ledger row (`xp_conversion`, locked_delta = diamonds);
 *   4. users: +Diamonds and +xp_converted, gated on the claim's nonce;
 *   5. budget finalize, and drop the claim if the budget had no room.
 * A retry with the same `requestId` returns the original result.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { getAppConfig } from "./settings";
import { parseMonetizationConfig } from "./monetizationConfig";
import { getSettings, rewardDayNumber } from "./gamification";
import { FREE_REWARDS_EXHAUSTED, freeRewardBudgetStatements, freeRewardsBudgetId } from "./promoBudget";
import { validRequestId } from "./coinSpend";

export interface XpConversionStatus {
  enabled: boolean;
  xpPerDiamond: number;
  convertibleXp: number;
  maxDiamondsPerDay: number;
  diamondsToday: number;
  /** Most Diamonds a conversion can give right now. */
  availableDiamonds: number;
}

export async function xpConversionStatus(env: Env, uid: string, ts = Date.now()): Promise<XpConversionStatus> {
  const cfg = parseMonetizationConfig(await getAppConfig(env)).earning.xpConversion;
  const day = rewardDayNumber(ts, (await getSettings(env)).dayResetOffsetMinutes);
  const [u, today] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(xp, 0) - COALESCE(xp_converted, 0) AS c FROM users WHERE uid = ?`).bind(uid).first<any>(),
    env.DB.prepare(`SELECT COALESCE(SUM(diamonds), 0) AS d FROM xp_conversions WHERE uid = ? AND day = ?`).bind(uid, day).first<any>(),
  ]);
  const convertibleXp = Math.max(0, Number(u?.c ?? 0));
  const diamondsToday = Number(today?.d ?? 0);
  const availableDiamonds = cfg.enabled
    ? Math.max(0, Math.min(Math.floor(convertibleXp / cfg.xpPerDiamond), cfg.maxDiamondsPerDay - diamondsToday))
    : 0;
  return { enabled: cfg.enabled, xpPerDiamond: cfg.xpPerDiamond, convertibleXp, maxDiamondsPerDay: cfg.maxDiamondsPerDay, diamondsToday, availableDiamonds };
}

export async function convertXp(
  env: Env,
  uid: string,
  input: { diamonds: unknown; requestId: unknown },
  ts = Date.now(),
): Promise<{ diamonds: number; xpSpent: number; replayed: boolean }> {
  const appCfg = await getAppConfig(env);
  const cfg = parseMonetizationConfig(appCfg).earning.xpConversion;
  if (!cfg.enabled) throw httpsError("failed-precondition", "XP conversion abhi band hai.", "xp_conversion_disabled");
  if (!validRequestId(input.requestId)) throw httpsError("invalid-argument", "requestId is required (8-64 letters, digits, - or _).");
  const id = `xpconv:${uid}:${input.requestId}`;
  const prior = await env.DB.prepare(`SELECT diamonds, xp_spent FROM xp_conversions WHERE id = ?`).bind(id).first<any>();
  if (prior) return { diamonds: Number(prior.diamonds), xpSpent: Number(prior.xp_spent), replayed: true };

  const diamonds = Number(input.diamonds);
  if (!Number.isInteger(diamonds) || diamonds < 1 || diamonds > cfg.maxDiamondsPerDay) {
    throw httpsError("invalid-argument", `diamonds must be a whole number from 1 to ${cfg.maxDiamondsPerDay}.`);
  }
  const xpSpent = diamonds * cfg.xpPerDiamond;
  const day = rewardDayNumber(ts, (await getSettings(env)).dayResetOffsetMinutes);
  const nonce = crypto.randomUUID();
  const claimGate = `EXISTS (SELECT 1 FROM xp_conversions WHERE id = ? AND nonce = ?)`;
  const budget = freeRewardBudgetStatements(env, {
    budgetId: freeRewardsBudgetId(appCfg),
    refId: `xpconv:${id}`,
    uid,
    coins: diamonds,
    ts,
    label: "XP conversion",
    gate: claimGate,
    gateArgs: [id, nonce],
  });
  const ledgerId = `xp_conversion:${id}`;
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO xp_conversions (id, uid, day, xp_spent, diamonds, nonce, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE uid = ? AND COALESCE(xp, 0) - COALESCE(xp_converted, 0) >= ?)
          AND (SELECT COALESCE(SUM(diamonds), 0) FROM xp_conversions WHERE uid = ? AND day = ?) + ? <= ?`,
    ).bind(id, uid, day, xpSpent, diamonds, nonce, ts, uid, xpSpent, uid, day, diamonds, cfg.maxDiamondsPerDay),
    ...budget.reserve,
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, 'xp_conversion', ?, ?, ? WHERE ${claimGate} AND ${budget.heldGate}`,
    ).bind(ledgerId, uid, diamonds, `${xpSpent} XP → ${diamonds} Diamond`, ts, diamonds, id, nonce, ...budget.heldArgs),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, xp_converted = COALESCE(xp_converted, 0) + ?, updated_at = ?
        WHERE uid = ? AND ${claimGate} AND ${budget.heldGate} AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)`,
    ).bind(diamonds, diamonds, xpSpent, ts, uid, id, nonce, ...budget.heldArgs, ledgerId),
    ...budget.finalize,
    ...(budget.reservationId
      ? [env.DB.prepare(`DELETE FROM xp_conversions WHERE id = ? AND nonce = ? AND NOT EXISTS (SELECT 1 FROM promo_reservations WHERE id = ?)`).bind(id, nonce, budget.reservationId)]
      : []),
  ]);

  if (Number(results[0]?.meta?.changes || 0) === 0) {
    const raced = await env.DB.prepare(`SELECT diamonds, xp_spent FROM xp_conversions WHERE id = ?`).bind(id).first<any>();
    if (raced) return { diamonds: Number(raced.diamonds), xpSpent: Number(raced.xp_spent), replayed: true };
    const st = await xpConversionStatus(env, uid, ts);
    if (st.convertibleXp < xpSpent) throw httpsError("failed-precondition", `Itne Diamond ke liye ${xpSpent} XP chahiye; aapke paas ${st.convertibleXp} XP hai.`, "not_enough_xp");
    throw httpsError("resource-exhausted", `Aaj ki limit: ${cfg.maxDiamondsPerDay} Diamond. Kal phir try karo.`, "daily_limit");
  }
  if (Number(results[budget.reserve.length + 2]?.meta?.changes || 0) === 0) {
    throw httpsError("failed-precondition", "Aaj ke free rewards khatam ho gaye hain. Thodi der baad try karo.", FREE_REWARDS_EXHAUSTED);
  }
  return { diamonds, xpSpent, replayed: false };
}
