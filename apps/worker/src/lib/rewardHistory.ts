/**
 * Rewards Center: Reward History (one user's earnings, 7 tabs) and the
 * 💎 Diamond "Top Earners" leaderboard. Read-only over the existing ledgers:
 *
 *   coin_transactions  amount = DP coin + Diamond, locked_delta = the Diamond part
 *   user_xp_events     delta = XP actually applied; a reversal is a new row
 *   xp_conversions     xp_spent for an `xp_conversion:<id>` ledger row
 *
 * History pages use a keyset cursor `<created_at>:<key>`, where key is the row id
 * prefixed with its source (`c:` coin ledger, `x:` XP ledger), so the merged "All"
 * tab pages through both tables in one deterministic order (created_at DESC, key
 * DESC) without skipping rows that share a millisecond.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { DISCOVERABLE, type DayRange, type RankRow } from "./seasons";

const DAY_MS = 86_400_000;

export type HistoryTab = "all" | "diamonds" | "xp" | "dpcoin" | "spent" | "conversion" | "adjusted";
export const HISTORY_TABS: HistoryTab[] = ["all", "diamonds", "xp", "dpcoin", "spent", "conversion", "adjusted"];

/** Ledger types that are a correction rather than an earning or a spend. */
export const ADJUSTMENT_TYPES = [
  "admin_adjustment",
  "refund_clawback",
  "referral_clawback",
  "chargeback_clawback",
  "account_deletion_forfeit",
  "balance_rounding",
  "economy_reset",
];

/** Diamond credits the user earned or was given (Diamonds Earned tab). */
export const DIAMOND_EARN_TYPES = [
  "signup_bonus",
  "verification_bonus",
  "referral_bonus",
  "promo_bonus",
  "daily_reward",
  "daily_task",
  "ad_reward",
  "gamification_reward",
  "monthly_hall_of_fame_reward",
  "quest_reward",
  "achievement_reward",
  "contest_reward",
  "event_reward",
  "xp_conversion",
  // Only the part above the monthly DP coin win cap, which is paid as Diamond.
  "contest_win_reward",
];

/**
 * Types that score on the Diamond leaderboard: earning activity only. One-off
 * bonuses (signup, verification, promo) and refunds don't rank. A reversed
 * referral writes a negative `referral_clawback` row, which is summed in, so a
 * clawed-back reward stops counting.
 */
export const DIAMOND_BOARD_TYPES = [
  "daily_reward",
  "daily_task",
  "ad_reward",
  "gamification_reward",
  "monthly_hall_of_fame_reward",
  "quest_reward",
  "achievement_reward",
  "contest_reward",
  "event_reward",
  "xp_conversion",
  "referral_bonus",
  "referral_clawback",
];

/** XP actions that are not earnings (XP Earned tab). */
const XP_NOT_EARNED = ["reversal", "admin_adjustment", "opening_balance"];
const XP_ADJUSTED = ["reversal", "admin_adjustment"];

const list = (xs: string[]) => xs.map((x) => `'${x}'`).join(", ");

export interface HistoryCursor {
  ts: number;
  key: string;
}

export function parseHistoryCursor(raw: unknown): HistoryCursor | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 400) throw httpsError("invalid-argument", "Invalid cursor.");
  const i = raw.indexOf(":");
  const ts = Number(raw.slice(0, i));
  const key = raw.slice(i + 1);
  if (i <= 0 || !Number.isFinite(ts) || !/^[cx]:/.test(key)) throw httpsError("invalid-argument", "Invalid cursor.");
  return { ts, key };
}

/**
 * The id bound to `id < ?` for one source, so that both sources resume right
 * after the cursor row in the merged order. Rows of the cursor's own source
 * continue after its id; at the same millisecond a source whose prefix sorts
 * lower (`c` < `x`) comes later in DESC order, so all of its rows remain, and a
 * higher one was already returned in full.
 */
export function tieIdFor(source: "c" | "x", cursor: HistoryCursor | null): string {
  if (!cursor) return "\uffff";
  const prefix = cursor.key[0];
  if (prefix === source) return cursor.key.slice(2);
  return source < prefix ? "\uffff" : "";
}

export interface HistoryItem {
  key: string;
  source: "coin" | "xp";
  /** Ledger type (coin) or XP action (xp). */
  type: string;
  diamonds: number;
  dpcoin: number;
  xp: number;
  /** XP turned into Diamonds, on conversion rows. */
  xpSpent: number | null;
  description: string | null;
  createdAt: number;
}

const COIN_COLS = `'c:' || t.id AS k, 'coin' AS source, t.type AS type, t.amount AS amount, t.locked_delta AS locked,
  0 AS xp, t.description AS description, t.created_at AS created_at`;
const XP_COLS = `'x:' || e.id AS k, 'xp' AS source, e.action AS type, 0 AS amount, 0 AS locked,
  e.delta AS xp, NULL AS description, e.created_at AS created_at`;

function coinWhere(tab: HistoryTab): string | null {
  switch (tab) {
    case "all": return "1 = 1";
    case "diamonds": return `t.locked_delta > 0 AND t.type IN (${list(DIAMOND_EARN_TYPES)})`;
    case "dpcoin": return `t.type = 'contest_win_reward' AND t.amount - t.locked_delta > 0`;
    case "spent": return `t.locked_delta < 0 AND t.type NOT IN (${list(ADJUSTMENT_TYPES)}, 'house_coins')`;
    case "conversion": return `t.type = 'xp_conversion'`;
    case "adjusted": return `t.type IN (${list(ADJUSTMENT_TYPES)})`;
    default: return null;
  }
}

function xpWhere(tab: HistoryTab): string | null {
  switch (tab) {
    case "all": return "1 = 1";
    case "xp": return `e.delta > 0 AND e.action NOT IN (${list(XP_NOT_EARNED)})`;
    case "adjusted": return `e.action IN (${list(XP_ADJUSTED)})`;
    default: return null;
  }
}

const KEYSET = (alias: string) => `(${alias}.created_at < ? OR (${alias}.created_at = ? AND ${alias}.id < ?))`;

/** One page of the caller's reward history for a tab, newest first. */
export async function rewardHistoryPage(
  env: Env,
  uid: string,
  tab: HistoryTab,
  cursor: HistoryCursor | null,
  limit: number,
): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
  const ts = cursor ? cursor.ts : Number.MAX_SAFE_INTEGER;
  const parts: string[] = [];
  const binds: unknown[] = [];
  const cw = coinWhere(tab);
  if (cw) {
    parts.push(
      `SELECT * FROM (SELECT ${COIN_COLS} FROM coin_transactions t
         WHERE t.uid = ? AND ${KEYSET("t")} AND ${cw}
         ORDER BY t.created_at DESC, t.id DESC LIMIT ?)`,
    );
    binds.push(uid, ts, ts, tieIdFor("c", cursor), limit + 1);
  }
  const xw = xpWhere(tab);
  if (xw) {
    parts.push(
      `SELECT * FROM (SELECT ${XP_COLS} FROM user_xp_events e
         WHERE e.uid = ? AND ${KEYSET("e")} AND ${xw}
         ORDER BY e.created_at DESC, e.id DESC LIMIT ?)`,
    );
    binds.push(uid, ts, ts, tieIdFor("x", cursor), limit + 1);
  }
  const rows = await env.DB.prepare(`${parts.join(" UNION ALL ")} ORDER BY created_at DESC, k DESC LIMIT ?`)
    .bind(...binds, limit + 1)
    .all<any>();
  const all = rows.results ?? [];
  const page = all.slice(0, limit);

  // xp_spent for conversion rows: one primary-key lookup each, at most one page.
  const convIds = page.filter((r) => r.type === "xp_conversion" && r.source === "coin").map((r) => String(r.k).slice("c:xp_conversion:".length));
  const spent = new Map<string, number>();
  if (convIds.length) {
    const res = await env.DB.prepare(`SELECT id, xp_spent FROM xp_conversions WHERE uid = ? AND id IN (${convIds.map(() => "?").join(",")})`)
      .bind(uid, ...convIds)
      .all<{ id: string; xp_spent: number }>();
    for (const r of res.results ?? []) spent.set(r.id, Number(r.xp_spent) || 0);
  }

  const items = page.map((r): HistoryItem => {
    const amount = Number(r.amount) || 0;
    const locked = Number(r.locked) || 0;
    const isConv = r.source === "coin" && r.type === "xp_conversion";
    return {
      key: String(r.k),
      source: r.source === "xp" ? "xp" : "coin",
      type: String(r.type),
      diamonds: round2(locked),
      dpcoin: round2(amount - locked),
      xp: Number(r.xp) || 0,
      xpSpent: isConv ? spent.get(String(r.k).slice("c:xp_conversion:".length)) ?? null : null,
      description: r.description ?? null,
      createdAt: Number(r.created_at),
    };
  });
  const last = page[page.length - 1];
  return { items, nextCursor: all.length > limit && last ? `${last.created_at}:${last.k}` : null };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 💎 Diamond leaderboard (Top Earners)
// ---------------------------------------------------------------------------

export type DiamondPeriod = "day" | "week" | "month";
export const DIAMOND_PERIODS: DiamondPeriod[] = ["day", "week", "month"];

/** Epoch-ms window of a reward-day range: [start of startDay, start of endDay + 1). */
export function rangeMs(range: Pick<DayRange, "startDay" | "endDay">, offsetMinutes: number): { startMs: number; endMs: number } {
  const off = offsetMinutes * 60_000;
  return { startMs: range.startDay * DAY_MS - off, endMs: (range.endDay + 1) * DAY_MS - off };
}

const BOARD_SCORES = `SELECT uid, SUM(locked_delta) AS score FROM coin_transactions
   WHERE type IN (${list(DIAMOND_BOARD_TYPES)}) AND created_at >= ? AND created_at < ?
   GROUP BY uid HAVING SUM(locked_delta) > 0`;

const toRow = (r: any, rank: number): RankRow => ({
  rank,
  uid: r.uid,
  username: r.username ?? null,
  fullName: r.full_name ?? null,
  profileImageUrl: r.profile_image_url ?? null,
  verified: !!r.verified,
  score: round2(Number(r.score) || 0),
  lifetimeXp: Number(r.lifetime) || 0,
  ...(r.cosmetics !== undefined ? { cosmetics: r.cosmetics } : {}),
});

/** One page of the Diamond board. Same tie-break as the XP boards (lib/seasons.ts). */
export async function diamondBoardPage(env: Env, win: { startMs: number; endMs: number }, offset: number, limit: number): Promise<RankRow[]> {
  const rows = await env.DB.prepare(
    `SELECT u.uid, u.username, u.full_name, u.profile_image_url, u.verified, u.cosmetics, s.score, COALESCE(u.xp, 0) AS lifetime
       FROM (${BOARD_SCORES}) s JOIN users u ON u.uid = s.uid
      WHERE ${DISCOVERABLE}
      ORDER BY s.score DESC, lifetime DESC, u.created_at ASC, u.uid ASC LIMIT ? OFFSET ?`,
  ).bind(win.startMs, win.endMs, limit, offset).all<any>();
  return (rows.results ?? []).map((r, i) => toRow(r, offset + i + 1));
}

/** The caller's place on the Diamond board, or rank null when unranked. */
export async function myDiamondRank(env: Env, uid: string, win: { startMs: number; endMs: number }): Promise<{ rank: number | null; score: number }> {
  const me = await env.DB.prepare(`SELECT u.uid, COALESCE(u.xp, 0) AS xp, u.created_at, (${DISCOVERABLE}) AS visible FROM users u WHERE u.uid = ?`)
    .bind(uid).first<{ xp: number; created_at: number; visible: number }>();
  if (!me) return { rank: null, score: 0 };
  const s = await env.DB.prepare(
    `SELECT COALESCE(SUM(locked_delta), 0) AS score FROM coin_transactions
      WHERE uid = ? AND type IN (${list(DIAMOND_BOARD_TYPES)}) AND created_at >= ? AND created_at < ?`,
  ).bind(uid, win.startMs, win.endMs).first<{ score: number }>();
  // Compare with the raw sum (the board's own value); round only for display.
  const raw = Number(s?.score || 0);
  const score = round2(raw);
  if (!me.visible || raw <= 0) return { rank: null, score };
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (${BOARD_SCORES}) s JOIN users u ON u.uid = s.uid
      WHERE ${DISCOVERABLE} AND (s.score > ? OR (s.score = ? AND (COALESCE(u.xp, 0) > ? OR (COALESCE(u.xp, 0) = ?
        AND (u.created_at < ? OR (u.created_at = ? AND u.uid < ?))))))`,
  ).bind(win.startMs, win.endMs, raw, raw, me.xp, me.xp, me.created_at, me.created_at, uid).first<{ n: number }>();
  return { rank: Number(row?.n || 0) + 1, score };
}
