/**
 * Economy guardrails (config: `appConfig.monetization.economy`,
 * lib/monetizationConfig.ts). Every knob is 0 = off.
 *
 *   - contestPlatformFeePercent: share of a paid contest's pot the platform
 *     keeps. Applied when a match snapshots its prize (routes/api.ts startMatch)
 *     and in the contest listing (routes/read.ts), so the card shows the real
 *     prize. Promo contests (linked to a budget) and product prizes are exempt.
 *   - dailyFreeDiamondCap: free Diamonds per account per reward day, summed over
 *     check-in, daily tasks, rewarded ads and XP conversion. Enforced by a SQL
 *     gate inside each crediting batch, so it is exact under concurrency.
 *   - monthlyDpCoinWinCap: DP coin one account may win from contests per UTC
 *     month. The part of a prize above the cap is paid as Diamonds (play-only),
 *     so the winner still gets the full prize but cannot cash it into the shop.
 *   - sameOpponentRewardsPerDay: how many completed matches between the same
 *     two players per UTC day still give XP and count toward monthly wins.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { matchPot } from "./money";
import { parseMonetizationConfig, type EconomyConfig } from "./monetizationConfig";

export const DAILY_FREE_LIMIT = "daily_free_limit";
/** Ledger types that pay free Diamonds and share the daily cap. */
export const FREE_DIAMOND_TYPES = ["daily_reward", "daily_task", "ad_reward", "xp_conversion"] as const;
const FREE_TYPES_SQL = FREE_DIAMOND_TYPES.map((t) => `'${t}'`).join(", ");

export function economyConfig(appCfg: any): EconomyConfig {
  return parseMonetizationConfig(appCfg).economy;
}

/**
 * The coin prize one new match snapshots. Without a fee this is the old
 * `min(rewardCoins, pot)`; with a fee the prize is at most the pot minus the
 * platform's share. Promo contests keep their full prize (the budget pays the
 * part above the pot) and product prizes are not coin prizes.
 */
export function contestPrizeCoins(
  contest: { rewardCoins?: unknown; totalEntryFee?: unknown; subsidyBudgetId?: unknown; prizeType?: unknown },
  feePercent: number,
): number {
  const pot = matchPot(contest.totalEntryFee);
  const reward = Math.max(0, Number(contest.rewardCoins || 0));
  const exempt = Boolean(contest.subsidyBudgetId) || contest.prizeType === "product";
  const pct = exempt ? 0 : Math.min(90, Math.max(0, Math.floor(Number(feePercent) || 0)));
  return Math.min(reward, Math.floor((pot * (100 - pct)) / 100));
}

/** SQL fragment: Diamonds this account already received from free sources since `dayStart`. */
const FREE_TODAY_SQL = `COALESCE((SELECT SUM(locked_delta) FROM coin_transactions
   WHERE uid = ? AND created_at >= ? AND type IN (${FREE_TYPES_SQL}) AND locked_delta > 0), 0)`;

/**
 * Gate for a crediting statement: true when `diamonds` more fits under today's
 * cap. Put it on the statement that creates the claim (or the ledger row) so a
 * refused credit leaves nothing behind. `1 = 1` when the cap is off.
 */
export function freeDiamondCapGate(
  cap: number,
  uid: string,
  dayStart: number,
  diamonds: number,
): { sql: string; args: unknown[] } {
  if (!(cap > 0) || !(diamonds > 0)) return { sql: "1 = 1", args: [] };
  return { sql: `(${FREE_TODAY_SQL} + ? <= ?)`, args: [uid, dayStart, diamonds, cap] };
}

export async function freeDiamondsToday(env: Env, uid: string, dayStart: number): Promise<number> {
  const r = await env.DB.prepare(`SELECT ${FREE_TODAY_SQL} AS n`).bind(uid, dayStart).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

/** True when `diamonds` more would go over today's cap. */
export async function overFreeDiamondCap(env: Env, cap: number, uid: string, dayStart: number, diamonds: number): Promise<boolean> {
  if (!(cap > 0) || !(diamonds > 0)) return false;
  return (await freeDiamondsToday(env, uid, dayStart)) + diamonds > cap;
}

export function dailyFreeLimitError(cap: number) {
  return httpsError(
    "resource-exhausted",
    `Aaj ki free Diamond limit (${cap}) poori ho gayi. Kal phir try karo.`,
    DAILY_FREE_LIMIT,
  );
}

/** Fail fast with a clear message; the SQL gate stays the real guard. */
export async function assertUnderFreeDiamondCap(env: Env, cap: number, uid: string, dayStart: number, diamonds: number): Promise<void> {
  if (await overFreeDiamondCap(env, cap, uid, dayStart, diamonds)) throw dailyFreeLimitError(cap);
}

export function utcMonthStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function utcDayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * SQL expression: the part of a `reward`-coin contest prize that goes over the
 * winner's monthly DP coin cap, to be paid as Diamonds. Reads the ledger before
 * this match's row exists, so evaluate it in statements that run BEFORE the
 * `contest_win_reward` insert (or in that insert's own SELECT). `0` when off.
 */
export function winCapExcessSql(
  cap: number,
  uid: string,
  monthStart: number,
  reward: number,
): { sql: string; args: unknown[] } {
  if (!(cap > 0) || !(reward > 0)) return { sql: "0", args: [] };
  return {
    sql: `CAST(MAX(0, ? - MAX(0, ? - COALESCE((SELECT SUM(amount - COALESCE(locked_delta, 0)) FROM coin_transactions
             WHERE uid = ? AND type = 'contest_win_reward' AND created_at >= ?), 0))) AS INTEGER)`,
    args: [reward, cap, uid, monthStart],
  };
}

/** Completed matches between these two players since `since` (excluding `matchId`). */
export async function samePairMatchesSince(env: Env, a: string, b: string, since: number, matchId: string): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM contest_matches
      WHERE status = 'completed' AND completed_at >= ? AND id != ?
        AND ((json_extract(user_a, '$.uid') = ? AND json_extract(user_b, '$.uid') = ?)
          OR (json_extract(user_a, '$.uid') = ? AND json_extract(user_b, '$.uid') = ?))`,
  ).bind(since, matchId, a, b, b, a).first<{ n: number }>();
  return Number(r?.n ?? 0);
}
