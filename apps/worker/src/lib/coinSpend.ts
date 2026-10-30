/**
 * Spending coins on in-app goods (virtual gifts, digital store items).
 *
 * A spend takes Diamonds first (play-only coins, lib/diamonds.ts) and only the
 * rest from DP coins, so a user's withdrawable balance is the last thing used.
 * That is the same split a purchase reversal uses (`DIAMONDS_AFTER_DEBIT`).
 *
 * Callers build ONE D1 batch: the ledger row, the balance UPDATE and their own
 * record (gift, purchase, entitlement), all behind the same gate, so either
 * everything is written or nothing is. These helpers only return statements;
 * they never run anything themselves.
 *
 * Ordering rule, relied on by every caller: the ledger INSERT comes first and
 * does not touch `users`, so the UPDATE that follows sees the same balance
 * snapshot and the two cannot disagree (the pattern adjustUserWallet uses).
 */
import type { Env } from "../types";
import { DIAMONDS_AFTER_DEBIT } from "./money";

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

/** `users` balance condition for a spend of `?` coins (bind the amount once). */
export const CAN_SPEND = "dpcoin >= ?";

/**
 * Ledger row + balance UPDATE for a spend. Both are gated on the caller's gate
 * AND the user being able to afford it, evaluated on the same snapshot.
 *
 * `locked_delta` is the Diamond part of the spend, negative.
 */
export function spendStatements(env: Env, s: SpendInput): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions
         (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, ?, ?, ?,
              (SELECT ${DIAMONDS_AFTER_DEBIT} - locked_coins FROM users WHERE uid = ?)
        WHERE EXISTS (SELECT 1 FROM users WHERE uid = ? AND ${CAN_SPEND})
          AND ${s.gate}`,
    ).bind(s.ledgerId, s.uid, -s.coins, s.type, s.description, s.ts, s.coins, s.coins, s.uid, s.uid, s.coins, ...s.gateArgs),
    env.DB.prepare(
      `UPDATE users
          SET dpcoin = dpcoin - ?,
              locked_coins = ${DIAMONDS_AFTER_DEBIT},
              updated_at = ?
        WHERE uid = ? AND ${CAN_SPEND}
          AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)
          AND ${s.gate}`,
    ).bind(s.coins, s.coins, s.coins, s.ts, s.uid, s.coins, s.ledgerId, ...s.gateArgs),
  ];
}

/** Diamonds spent by a ledger row (positive), for snapshot columns. */
export const LOCKED_SPENT_OF = "(SELECT -locked_delta FROM coin_transactions WHERE id = ?)";

/** Whether the request id is safe to embed in a deterministic primary key. */
export function validRequestId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}
