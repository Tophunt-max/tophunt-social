/**
 * Spending DP coin on goods: virtual gifts, digital store items, physical shop orders.
 *
 * Closed-loop economy (lib/cashRetirement.ts): Diamonds are earned and only
 * pay contest entry fees; DP coin is won in contests and only buys things.
 * A spend therefore takes DP coin ONLY (`dpcoin - locked_coins`) and never
 * touches Diamonds; its ledger row has `locked_delta = 0`.
 *
 * Callers build ONE D1 batch: the ledger row, the balance UPDATE and their own
 * records, all behind the same gate, so either everything is written or
 * nothing is. These helpers only return statements.
 *
 * Ordering rule: the ledger INSERT comes first and does not touch `users`, so
 * the UPDATE that follows sees the same balance snapshot and the two cannot
 * disagree (the pattern adjustUserWallet uses).
 */
import type { Env } from "../types";

export interface SpendInput {
  uid: string;
  coins: number;
  ledgerId: string;
  type: string;
  description: string;
  ts: number;
  /** Extra SQL condition (no leading AND) that must hold for the spend to apply. */
  gate: string;
  gateArgs: unknown[];
}

/** `users` condition: enough DP coin (not Diamonds) for `?` coins. Bind the amount once. */
export const CAN_SPEND = "dpcoin - locked_coins >= ?";

export function spendStatements(env: Env, s: SpendInput): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions
         (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, ?, ?, ?, 0
        WHERE EXISTS (SELECT 1 FROM users WHERE uid = ? AND ${CAN_SPEND})
          AND ${s.gate}`,
    ).bind(s.ledgerId, s.uid, -s.coins, s.type, s.description, s.ts, s.uid, s.coins, ...s.gateArgs),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin - ?, updated_at = ?
        WHERE uid = ? AND ${CAN_SPEND}
          AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)
          AND ${s.gate}`,
    ).bind(s.coins, s.ts, s.uid, s.coins, s.ledgerId, ...s.gateArgs),
  ];
}

/** Diamonds spent by a ledger row (always 0 now; kept for the snapshot columns). */
export const LOCKED_SPENT_OF = "(SELECT -locked_delta FROM coin_transactions WHERE id = ?)";

/** Whether the request id is safe to embed in a deterministic primary key. */
export function validRequestId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}
