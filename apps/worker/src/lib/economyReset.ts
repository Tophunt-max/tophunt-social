/**
 * Admin "fresh start": reject every open withdrawal and set balances to zero.
 *
 * Nothing is silently overwritten. Each user's removed balance becomes an
 * `economy_reset` ledger row in the same batch as the balance change, so the
 * ledger invariants (dpcoin = SUM(amount), locked_coins = SUM(locked_delta))
 * still hold and Health stays green. The ledger keeps what everyone had.
 *
 * Resumable: it processes users in chunks and is called repeatedly with the
 * same reset id until `remaining` is 0. Each user's row id is
 * `economy_reset:<resetId>:<uid>`, so a repeated call never removes twice.
 * Every balance move is gated on the exact balance it read, so a user whose
 * balance changed mid-reset is picked up by the next call instead of drifting.
 *
 * Refuses while any manual deposit is pending: those users paid real money and
 * must be refunded (or credited) by an admin first.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { refundRejectedWithdrawal } from "./payouts";

export const RESET_CONFIRM_PHRASE = "RESET ECONOMY";
const USER_CHUNK = 40;
const WITHDRAWAL_CHUNK = 25;

export interface ResetOptions {
  resetId: string;
  resetDpCoin: boolean;
  resetDiamonds: boolean;
  reason: string;
  actor: string;
}

export interface ResetProgress {
  resetId: string;
  withdrawalsRejected: number;
  usersReset: number;
  remaining: number;
  done: boolean;
}

export async function resetPreview(env: Env) {
  const [users, withdrawals, deposits] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(dpcoin - locked_coins), 0) AS dp, COALESCE(SUM(locked_coins), 0) AS diamonds
         FROM users WHERE dpcoin != 0 OR locked_coins != 0`,
    ).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS coins FROM withdrawals WHERE status IN ('pending', 'approved')`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM deposits WHERE status = 'pending'`).first<any>(),
  ]);
  return {
    usersWithBalance: Number(users?.n ?? 0),
    dpCoinTotal: Number(users?.dp ?? 0),
    diamondTotal: Number(users?.diamonds ?? 0),
    openWithdrawals: Number(withdrawals?.n ?? 0),
    openWithdrawalCoins: Number(withdrawals?.coins ?? 0),
    pendingDeposits: Number(deposits?.n ?? 0),
    confirmPhrase: RESET_CONFIRM_PHRASE,
  };
}

/** One chunk of work. Call until `done`. */
export async function runResetChunk(env: Env, o: ResetOptions, ts = Date.now()): Promise<ResetProgress> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(o.resetId)) throw httpsError("invalid-argument", "resetId is invalid.");
  if (!o.resetDpCoin && !o.resetDiamonds) throw httpsError("invalid-argument", "Choose DP coin, Diamonds, or both.");
  const pendingDeposits = await env.DB.prepare(`SELECT COUNT(*) AS n FROM deposits WHERE status = 'pending'`).first<any>();
  if (Number(pendingDeposits?.n ?? 0) > 0) {
    throw httpsError("failed-precondition", `${pendingDeposits.n} manual deposit(s) are still pending. Those users paid real money: approve or reject (and refund) them first.`, "pending_deposits");
  }

  const existing = await env.DB.prepare(`SELECT * FROM economy_resets WHERE id = ?`).bind(o.resetId).first<any>();
  if (existing && (Number(existing.reset_dp_coin) !== (o.resetDpCoin ? 1 : 0) || Number(existing.reset_diamonds) !== (o.resetDiamonds ? 1 : 0))) {
    throw httpsError("invalid-argument", "This reset was started with different options.");
  }
  if (existing?.completed_at) {
    return { resetId: o.resetId, withdrawalsRejected: Number(existing.withdrawals_rejected), usersReset: Number(existing.users_reset), remaining: 0, done: true };
  }
  if (!existing) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO economy_resets (id, reset_dp_coin, reset_diamonds, reason, started_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(o.resetId, o.resetDpCoin ? 1 : 0, o.resetDiamonds ? 1 : 0, o.reason, o.actor, ts).run();
  }

  // 1) Open withdrawals → rejected, held DP coin refunded (same path as the admin reject).
  let withdrawalsRejected = 0;
  const open = await env.DB.prepare(
    `SELECT id, user_id, amount, status, reserved FROM withdrawals WHERE status IN ('pending', 'approved') ORDER BY created_at LIMIT ?`,
  ).bind(WITHDRAWAL_CHUNK).all<any>();
  for (const w of open.results ?? []) {
    const claim = await env.DB.prepare(
      `UPDATE withdrawals SET status = 'rejected', admin_note = ?, processed_by = ?, updated_at = ? WHERE id = ? AND status = ?`,
    ).bind("Withdrawals retired (economy reset). DP coin returned before the reset.", o.actor, ts, w.id, w.status).run();
    if (!claim.meta?.changes) continue;
    if (Number(w.reserved) === 1 || w.status === "approved") {
      await refundRejectedWithdrawal(env, w.id, w.user_id, Number(w.amount), ts);
    }
    withdrawalsRejected++;
  }
  if ((open.results ?? []).length === WITHDRAWAL_CHUNK) {
    await bump(env, o.resetId, withdrawalsRejected, 0, 0, 0);
    return { resetId: o.resetId, withdrawalsRejected, usersReset: 0, remaining: -1, done: false };
  }

  // 2) Balances → 0.
  const balanceWhere = o.resetDpCoin && o.resetDiamonds
    ? "(dpcoin != 0 OR locked_coins != 0)"
    : o.resetDpCoin
      ? "dpcoin - locked_coins != 0"
      : "locked_coins != 0";
  const users = await env.DB.prepare(
    `SELECT uid, dpcoin, locked_coins FROM users WHERE ${balanceWhere}
        AND NOT EXISTS (SELECT 1 FROM coin_transactions t WHERE t.id = 'economy_reset:' || ? || ':' || users.uid)
      LIMIT ?`,
  ).bind(o.resetId, USER_CHUNK).all<any>();
  const stmts: D1PreparedStatement[] = [];
  let dpRemoved = 0;
  let diamondsRemoved = 0;
  for (const u of users.results ?? []) {
    const total = Number(u.dpcoin ?? 0);
    const locked = Number(u.locked_coins ?? 0);
    const dpPart = total - locked;
    const amount = -((o.resetDpCoin ? dpPart : 0) + (o.resetDiamonds ? locked : 0));
    const lockedDelta = o.resetDiamonds ? -locked : 0;
    if (amount === 0 && lockedDelta === 0) continue;
    const ledgerId = `economy_reset:${o.resetId}:${u.uid}`;
    const same = `EXISTS (SELECT 1 FROM users WHERE uid = ? AND dpcoin = ? AND locked_coins = ?)`;
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
         SELECT ?, ?, ?, 'economy_reset', ?, ?, ? WHERE ${same}`,
      ).bind(ledgerId, u.uid, amount, `Economy reset: ${o.reason}`.slice(0, 200), ts, lockedDelta, u.uid, total, locked),
      env.DB.prepare(
        `UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ?
          WHERE uid = ? AND dpcoin = ? AND locked_coins = ? AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ? AND created_at = ?)`,
      ).bind(amount, lockedDelta, ts, u.uid, total, locked, ledgerId, ts),
    );
    dpRemoved += o.resetDpCoin ? dpPart : 0;
    diamondsRemoved += o.resetDiamonds ? locked : 0;
  }
  let usersReset = 0;
  if (stmts.length) {
    const res = await env.DB.batch(stmts);
    for (let i = 1; i < res.length; i += 2) usersReset += Number(res[i]?.meta?.changes || 0);
  }
  const more = (users.results ?? []).length === USER_CHUNK;
  const remainingRow = more
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM users WHERE ${balanceWhere}
            AND NOT EXISTS (SELECT 1 FROM coin_transactions t WHERE t.id = 'economy_reset:' || ? || ':' || users.uid)`,
      ).bind(o.resetId).first<any>()
    : { n: 0 };
  const remaining = Number(remainingRow?.n ?? 0);
  await bump(env, o.resetId, withdrawalsRejected, usersReset, dpRemoved, diamondsRemoved, remaining === 0 ? ts : null);
  return { resetId: o.resetId, withdrawalsRejected, usersReset, remaining, done: remaining === 0 };
}

async function bump(env: Env, id: string, w: number, u: number, dp: number, d: number, completedAt: number | null = null) {
  await env.DB.prepare(
    `UPDATE economy_resets SET withdrawals_rejected = withdrawals_rejected + ?, users_reset = users_reset + ?,
            dp_coin_removed = dp_coin_removed + ?, diamonds_removed = diamonds_removed + ?,
            completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
  ).bind(w, u, dp, d, completedAt, id).run();
}
