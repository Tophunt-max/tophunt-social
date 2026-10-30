/**
 * Money-flow integrity, in one query set.
 *
 * The wallet is a single number per user (`users.dpcoin`) and every change is
 * supposed to be written in the same D1 batch as a matching `coin_transactions`
 * ledger row — so the load-bearing invariant is:
 *
 *     users.dpcoin  ==  SUM(coin_transactions.amount)   for every user.
 *
 * If that ever drifts, coins were minted or burned without a ledger entry, which
 * is the one bug class in a coin economy you cannot afford to discover late. The
 * money tests assert this invariant in-process; this surfaces it in production,
 * continuously, to the admin.
 *
 * It also reports Diamond (locked_coins) drift, negative balances (a debit that
 * should have been refused) and promo-budget holds stuck on a finished match.
 *
 * Read-only and defensive: every query is wrapped so one failure degrades that
 * one metric to `null`/`-1` rather than failing the whole console.
 */
import type { Env } from "../types";

/** Coins are whole numbers; a real-sum drift below this is float noise, not a bug. */
const DRIFT_EPSILON = 0.5;

export interface LedgerDriftSample {
  uid: string;
  balance: number;
  ledger: number;
  diff: number;
}

export interface MoneyHealth {
  ok: boolean;
  ts: number;
  /** users.dpcoin != SUM(ledger) — the core invariant. Any non-zero is serious. */
  ledgerDrift: { count: number; samples: LedgerDriftSample[] };
  /** Balances below zero — a debit that should have been refused. */
  negativeBalances: { count: number; samples: { uid: string; balance: number }[] };
  /**
   * Diamonds (users.locked_coins) out of step with their ledger, or above the
   * balance they are part of. Same seriousness as ledger drift: a Diamond that
   * silently became DP coin is a free reward turned into shopping money.
   */
  lockedDrift: { count: number; overBalance: number; samples: { uid: string; locked: number; ledger: number; balance: number }[] };
  /** Promo-budget holds left behind by a finished match. */
  staleReservations: number;
}

/** COALESCE(SUM(amount)) of a user's ledger, as a correlated subquery. */
const LEDGER_SUM = "COALESCE((SELECT SUM(amount) FROM coin_transactions t WHERE t.uid = u.uid), 0)";
const LOCKED_SUM = "COALESCE((SELECT SUM(locked_delta) FROM coin_transactions t WHERE t.uid = u.uid), 0)";
const STALE_RESERVATIONS = `
  SELECT COUNT(*) AS n FROM promo_reservations r
   WHERE r.status = 'held' AND r.ref_type = 'match' AND NOT EXISTS (SELECT 1 FROM contest_matches m
         WHERE m.id = r.ref_id AND m.status IN ('waiting_for_opponent', 'active'))`;

async function firstNumber(env: Env, sql: string, ...binds: unknown[]): Promise<number> {
  try {
    const row = await env.DB.prepare(sql).bind(...binds).first<Record<string, number>>();
    if (!row) return 0;
    const v = Object.values(row)[0];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch (e) {
    console.error("[moneyHealth] query failed", sql, e);
    return -1; // -1 marks "could not compute", distinct from a real 0
  }
}

async function rows<T>(env: Env, sql: string, ...binds: unknown[]): Promise<T[]> {
  try {
    const res = await env.DB.prepare(sql).bind(...binds).all<T>();
    return (res.results ?? []) as T[];
  } catch (e) {
    console.error("[moneyHealth] query failed", sql, e);
    return [];
  }
}

export async function computeMoneyHealth(env: Env): Promise<MoneyHealth> {
  const ts = Date.now();
  const [driftCount, driftSamples, negCount, negSamples, lockedDriftCount, lockedOver, lockedSamples, staleRes] = await Promise.all([
    firstNumber(env, `SELECT COUNT(*) AS n FROM users u WHERE ABS(u.dpcoin - ${LEDGER_SUM}) > ?`, DRIFT_EPSILON),
    rows<LedgerDriftSample>(
      env,
      `SELECT u.uid AS uid, u.dpcoin AS balance, ${LEDGER_SUM} AS ledger,
              (u.dpcoin - ${LEDGER_SUM}) AS diff
         FROM users u
        WHERE ABS(u.dpcoin - ${LEDGER_SUM}) > ?
        ORDER BY ABS(u.dpcoin - ${LEDGER_SUM}) DESC
        LIMIT 20`,
      DRIFT_EPSILON,
    ),
    firstNumber(env, `SELECT COUNT(*) AS n FROM users WHERE dpcoin < 0`),
    rows<{ uid: string; balance: number }>(env, `SELECT uid, dpcoin AS balance FROM users WHERE dpcoin < 0 ORDER BY dpcoin ASC LIMIT 20`),
    firstNumber(env, `SELECT COUNT(*) AS n FROM users u WHERE ABS(u.locked_coins - ${LOCKED_SUM}) > ?`, DRIFT_EPSILON),
    firstNumber(env, `SELECT COUNT(*) AS n FROM users WHERE locked_coins < 0 OR locked_coins > MAX(dpcoin, 0) + ?`, DRIFT_EPSILON),
    rows<{ uid: string; locked: number; ledger: number; balance: number }>(
      env,
      `SELECT u.uid AS uid, u.locked_coins AS locked, ${LOCKED_SUM} AS ledger, u.dpcoin AS balance
         FROM users u
        WHERE ABS(u.locked_coins - ${LOCKED_SUM}) > ? OR u.locked_coins < 0 OR u.locked_coins > MAX(u.dpcoin, 0) + ?
        LIMIT 20`,
      DRIFT_EPSILON,
      DRIFT_EPSILON,
    ),
    firstNumber(env, STALE_RESERVATIONS),
  ]);

  // A -1 (query failure) is treated as not-ok so a broken probe is visible.
  const bad = (n: number) => n !== 0;
  const ok = !bad(driftCount) && !bad(negCount) && !bad(lockedDriftCount) && !bad(lockedOver) && !bad(staleRes);
  return {
    ok,
    ts,
    ledgerDrift: { count: driftCount, samples: driftSamples },
    negativeBalances: { count: negCount, samples: negSamples },
    lockedDrift: { count: lockedDriftCount, overBalance: lockedOver, samples: lockedSamples },
    staleReservations: staleRes,
  };
}

/** Title of the alert row; also its dedupe key. */
export const MONEY_HEALTH_ALERT_TITLE = "Money integrity check failed";
const ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000;

/**
 * Scheduled run of `computeMoneyHealth` (every 6 hours, index.ts).
 *
 * It used to run only when an admin opened the Money Health page, so a ledger
 * drift, a negative balance or an unrefunded rejection could sit unnoticed. On a
 * failure this writes ONE admin notification per 24 h (not one per run) naming
 * what failed. Returns the health so the cron heartbeat can record it.
 */
export async function moneyHealthAlert(env: Env): Promise<MoneyHealth> {
  const h = await computeMoneyHealth(env);
  if (h.ok) return h;
  const failed = [
    h.ledgerDrift.count !== 0 && `ledger drift on ${h.ledgerDrift.count} account(s)`,
    h.negativeBalances.count !== 0 && `${h.negativeBalances.count} negative balance(s)`,
    h.lockedDrift.count !== 0 && `locked-coin drift on ${h.lockedDrift.count} account(s)`,
    h.lockedDrift.overBalance !== 0 && `${h.lockedDrift.overBalance} account(s) with locked coins above the balance`,
    h.staleReservations !== 0 && `${h.staleReservations} promo reservation(s) stuck on a finished match`,
  ].filter(Boolean);
  // -1 means a probe failed; say so rather than listing nothing.
  const message = failed.length ? failed.join("; ") + "." : "One or more money checks could not run.";
  console.error("[moneyHealth] check failed:", message);
  try {
    const recent = await env.DB.prepare(
      `SELECT 1 AS x FROM admin_notifications WHERE title = ? AND created_at > ? LIMIT 1`,
    )
      .bind(MONEY_HEALTH_ALERT_TITLE, h.ts - ALERT_DEDUPE_MS)
      .first();
    if (!recent) {
      await env.DB.prepare(
        `INSERT INTO admin_notifications (id, title, message, link, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), MONEY_HEALTH_ALERT_TITLE, message, "/system-health", h.ts)
        .run();
    }
  } catch (e) {
    console.error("[moneyHealth] could not write the alert", e);
  }
  return h;
}

