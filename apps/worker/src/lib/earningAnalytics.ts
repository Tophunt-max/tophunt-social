/**
 * Earning Management analytics and CSV export (admin). Read-only over the
 * ledgers: coin_transactions for Diamonds / DP coin, user_xp_daily for XP,
 * reward_event_claims for special events. House accounts are excluded, like
 * the Coin Economy report. Days are reward days (dayResetOffsetMinutes).
 */
import type { Env } from "../types";
import { NOT_HOUSE_UID } from "./coinEconomy";
import { DIAMOND_BOARD_TYPES } from "./rewardHistory";

const DAY_MS = 86_400_000;

/** Ledger types shown on the dashboard: every earning credit, the DP coin prize and reward reversals. */
export const EARNING_LEDGER_TYPES = [
  ...DIAMOND_BOARD_TYPES,
  "signup_bonus",
  "verification_bonus",
  "promo_bonus",
  "contest_win_reward",
];

const TYPES_SQL = EARNING_LEDGER_TYPES.map((t) => `'${t}'`).join(", ");
const XP_EXCLUDED = `'admin_adjustment', 'opening_balance'`;

export interface EarningWindow {
  startDay: number;
  endDay: number;
  startMs: number;
  endMs: number;
  offsetMinutes: number;
}

/** The last `days` reward days up to and including today. */
export function earningWindow(days: number, offsetMinutes: number, now = Date.now()): EarningWindow {
  const off = offsetMinutes * 60_000;
  const today = Math.floor((now + off) / DAY_MS);
  const startDay = today - days + 1;
  return { startDay, endDay: today, startMs: startDay * DAY_MS - off, endMs: (today + 1) * DAY_MS - off, offsetMinutes };
}

export const dayLabel = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: unknown) => Math.round(n(v) * 100) / 100;

export async function earningAnalytics(env: Env, w: EarningWindow) {
  const off = w.offsetMinutes * 60_000;
  const dayExpr = `CAST((created_at + ${off}) / ${DAY_MS} AS INTEGER)`;
  const [byDayType, earners, xpDaily, totalsRow, events, top, xpTotal] = await Promise.all([
    env.DB.prepare(
      `SELECT ${dayExpr} AS day, type, COUNT(*) AS n, COUNT(DISTINCT uid) AS users,
              SUM(locked_delta) AS diamonds, SUM(amount - locked_delta) AS dp
         FROM coin_transactions
        WHERE type IN (${TYPES_SQL}) AND created_at >= ? AND created_at < ? AND ${NOT_HOUSE_UID()}
        GROUP BY day, type`,
    ).bind(w.startMs, w.endMs).all<any>(),
    env.DB.prepare(
      `SELECT ${dayExpr} AS day, COUNT(DISTINCT uid) AS users
         FROM coin_transactions
        WHERE type IN (${TYPES_SQL}) AND created_at >= ? AND created_at < ? AND locked_delta > 0 AND ${NOT_HOUSE_UID()}
        GROUP BY day`,
    ).bind(w.startMs, w.endMs).all<any>(),
    env.DB.prepare(
      `SELECT day, SUM(xp) AS xp, COUNT(DISTINCT uid) AS users FROM user_xp_daily
        WHERE day BETWEEN ? AND ? AND action NOT IN (${XP_EXCLUDED}) AND ${NOT_HOUSE_UID()}
        GROUP BY day`,
    ).bind(w.startDay, w.endDay).all<any>(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT uid) AS earners FROM coin_transactions
        WHERE type IN (${TYPES_SQL}) AND created_at >= ? AND created_at < ? AND locked_delta > 0 AND ${NOT_HOUSE_UID()}`,
    ).bind(w.startMs, w.endMs).first<any>(),
    env.DB.prepare(
      `SELECT c.event_id AS id, e.title AS title, COUNT(*) AS claims, COUNT(DISTINCT c.uid) AS users, SUM(c.coins) AS diamonds,
              (SELECT COUNT(*) FROM reward_event_participants p WHERE p.event_id = c.event_id) AS participants
         FROM reward_event_claims c LEFT JOIN reward_events e ON e.id = c.event_id
        WHERE c.created_at >= ? AND c.created_at < ?
        GROUP BY c.event_id ORDER BY diamonds DESC LIMIT 50`,
    ).bind(w.startMs, w.endMs).all<any>(),
    env.DB.prepare(
      `SELECT s.uid, u.username, u.full_name, s.score FROM (
         SELECT uid, SUM(locked_delta) AS score FROM coin_transactions
          WHERE type IN (${DIAMOND_BOARD_TYPES.map((t) => `'${t}'`).join(", ")}) AND created_at >= ? AND created_at < ?
          GROUP BY uid HAVING SUM(locked_delta) > 0) s
         JOIN users u ON u.uid = s.uid
        WHERE COALESCE(u.role, '') <> 'superadmin'
        ORDER BY s.score DESC, s.uid ASC LIMIT 20`,
    ).bind(w.startMs, w.endMs).all<any>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(xp), 0) AS xp, COUNT(DISTINCT uid) AS users FROM user_xp_daily
        WHERE day BETWEEN ? AND ? AND action NOT IN (${XP_EXCLUDED}) AND ${NOT_HOUSE_UID()}`,
    ).bind(w.startDay, w.endDay).first<any>(),
  ]);

  const daily = new Map<number, { day: number; diamonds: number; reversed: number; dpcoin: number; claims: number; earners: number; xp: number; xpUsers: number }>();
  for (let d = w.startDay; d <= w.endDay; d++) daily.set(d, { day: d, diamonds: 0, reversed: 0, dpcoin: 0, claims: 0, earners: 0, xp: 0, xpUsers: 0 });
  const types = new Map<string, { type: string; count: number; users: number; diamonds: number; dpcoin: number }>();
  for (const r of byDayType.results ?? []) {
    const d = daily.get(n(r.day));
    const diamonds = n(r.diamonds);
    if (d) {
      if (diamonds >= 0) d.diamonds += diamonds;
      else d.reversed += -diamonds;
      d.dpcoin += n(r.dp);
      d.claims += n(r.n);
    }
    const t = types.get(r.type) ?? { type: r.type, count: 0, users: 0, diamonds: 0, dpcoin: 0 };
    t.count += n(r.n);
    // Per-day distinct users summed: an upper bound across days, exact for one day.
    t.users += n(r.users);
    t.diamonds += diamonds;
    t.dpcoin += n(r.dp);
    types.set(r.type, t);
  }
  for (const r of earners.results ?? []) {
    const d = daily.get(n(r.day));
    if (d) d.earners = n(r.users);
  }
  for (const r of xpDaily.results ?? []) {
    const d = daily.get(n(r.day));
    if (d) {
      d.xp = n(r.xp);
      d.xpUsers = n(r.users);
    }
  }
  const dailyRows = [...daily.values()].map((d) => ({ ...d, date: dayLabel(d.day), diamonds: r2(d.diamonds), reversed: r2(d.reversed), dpcoin: r2(d.dpcoin) }));
  const byType = [...types.values()]
    .map((t) => ({ ...t, diamonds: r2(t.diamonds), dpcoin: r2(t.dpcoin) }))
    .sort((a, b) => Math.abs(b.diamonds) + b.dpcoin - (Math.abs(a.diamonds) + a.dpcoin));

  return {
    from: dayLabel(w.startDay),
    to: dayLabel(w.endDay),
    days: w.endDay - w.startDay + 1,
    totals: {
      diamondsEarned: r2(dailyRows.reduce((s, d) => s + d.diamonds, 0)),
      diamondsReversed: r2(dailyRows.reduce((s, d) => s + d.reversed, 0)),
      dpcoinWon: r2(dailyRows.reduce((s, d) => s + d.dpcoin, 0)),
      claims: dailyRows.reduce((s, d) => s + d.claims, 0),
      earners: n(totalsRow?.earners),
      xp: n(xpTotal?.xp),
      xpUsers: n(xpTotal?.users),
    },
    daily: dailyRows,
    byType,
    events: (events.results ?? []).map((e) => ({
      id: e.id,
      title: e.title ?? e.id,
      claims: n(e.claims),
      users: n(e.users),
      participants: n(e.participants),
      diamonds: n(e.diamonds),
    })),
    topEarners: (top.results ?? []).map((t, i) => ({ rank: i + 1, uid: t.uid, username: t.username ?? null, fullName: t.full_name ?? null, diamonds: r2(t.score) })),
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One CSV cell. Quotes when needed, and neutralises spreadsheet formulas in
 * text (a username or description starting with = + - @ tab or CR).
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");

/** Daily rows per ledger type, plus one XP row per day. */
export async function earningDailyCsv(env: Env, w: EarningWindow): Promise<string> {
  const off = w.offsetMinutes * 60_000;
  const rows = await env.DB.prepare(
    `SELECT CAST((created_at + ${off}) / ${DAY_MS} AS INTEGER) AS day, type, COUNT(*) AS n, COUNT(DISTINCT uid) AS users,
            SUM(locked_delta) AS diamonds, SUM(amount - locked_delta) AS dp
       FROM coin_transactions
      WHERE type IN (${TYPES_SQL}) AND created_at >= ? AND created_at < ? AND ${NOT_HOUSE_UID()}
      GROUP BY day, type ORDER BY day, type`,
  ).bind(w.startMs, w.endMs).all<any>();
  const lines = [csvLine(["date", "source", "type", "rows", "users", "diamonds", "dp_coin", "xp"])];
  for (const r of rows.results ?? []) lines.push(csvLine([dayLabel(n(r.day)), "ledger", r.type, n(r.n), n(r.users), r2(r.diamonds), r2(r.dp), 0]));
  const xp = await env.DB.prepare(
    `SELECT day, SUM(xp) AS xp, COUNT(DISTINCT uid) AS users FROM user_xp_daily
      WHERE day BETWEEN ? AND ? AND action NOT IN (${XP_EXCLUDED}) AND ${NOT_HOUSE_UID()}
      GROUP BY day ORDER BY day`,
  ).bind(w.startDay, w.endDay).all<any>();
  for (const d of xp.results ?? []) lines.push(csvLine([dayLabel(n(d.day)), "xp", "xp_earned", "", n(d.users), 0, 0, n(d.xp)]));
  return lines.join("\r\n") + "\r\n";
}

export const LEDGER_CSV_MAX_ROWS = 20_000;

/** Every earning ledger row in the window (capped), newest first. */
export async function earningLedgerCsv(env: Env, w: EarningWindow): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const res = await env.DB.prepare(
    `SELECT t.id, t.created_at, t.uid, u.username, t.type, t.locked_delta, t.amount, t.description
       FROM coin_transactions t LEFT JOIN users u ON u.uid = t.uid
      WHERE t.type IN (${TYPES_SQL}) AND t.created_at >= ? AND t.created_at < ? AND ${NOT_HOUSE_UID("t.uid")}
      ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
  ).bind(w.startMs, w.endMs, LEDGER_CSV_MAX_ROWS + 1).all<any>();
  const all = res.results ?? [];
  const page = all.slice(0, LEDGER_CSV_MAX_ROWS);
  const lines = [csvLine(["created_at", "id", "uid", "username", "type", "diamonds", "dp_coin", "description"])];
  for (const r of page) {
    lines.push(csvLine([new Date(n(r.created_at)).toISOString(), r.id, r.uid, r.username ?? "", r.type, r2(r.locked_delta), r2(n(r.amount) - n(r.locked_delta)), r.description ?? ""]));
  }
  return { csv: lines.join("\r\n") + "\r\n", rows: page.length, truncated: all.length > LEDGER_CSV_MAX_ROWS };
}
