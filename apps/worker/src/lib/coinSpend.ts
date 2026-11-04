/**
 * Spending DP coin on goods: virtual gifts, digital store items, physical shop orders.
 *
 * Closed-loop economy (lib/cashRetirement.ts): Diamonds are earned and pay
 * contest entry fees and Shop Bundles (items only); DP coin is won in contests
 * and buys gifts, digital items and physical goods. `spendStatements` takes DP
 * coin ONLY (`dpcoin - locked_coins`) with `locked_delta = 0`;
 * `diamondSpendStatements` takes Diamonds ONLY (bundles).
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
import { DIAMONDS_COVER } from "./diamonds";

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

export interface DiamondSpendInput {
  uid: string;
  diamonds: number;
  ledgerId: string;
  type: string;
  description: string;
  ts: number;
  /** Extra SQL condition (no leading AND) that must hold for the spend to apply. */
  gate: string;
  gateArgs: unknown[];
}

/**
 * Spending DIAMONDS on Shop Bundles (lib/storeBundles.ts): the only Diamond
 * spend besides contest entry. Same shape and ordering rule as
 * spendStatements, but the cover check is DIAMONDS_COVER and both `dpcoin`
 * (the total) and `locked_coins` (the Diamond part) go down by the price, so
 * the ledger row carries amount = locked_delta = -diamonds. DP coin is never
 * touched.
 */
export function diamondSpendStatements(env: Env, s: DiamondSpendInput): D1PreparedStatement[] {
  return [
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions
         (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM users WHERE uid = ? AND ${DIAMONDS_COVER})
          AND ${s.gate}`,
    ).bind(s.ledgerId, s.uid, -s.diamonds, s.type, s.description, s.ts, -s.diamonds, s.uid, s.diamonds, ...s.gateArgs),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin - ?, locked_coins = locked_coins - ?, updated_at = ?
        WHERE uid = ? AND ${DIAMONDS_COVER}
          AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)
          AND ${s.gate}`,
    ).bind(s.diamonds, s.diamonds, s.ts, s.uid, s.diamonds, s.ledgerId, ...s.gateArgs),
  ];
}

/** Diamonds spent by a ledger row (always 0 now; kept for the snapshot columns). */
export const LOCKED_SPENT_OF = "(SELECT -locked_delta FROM coin_transactions WHERE id = ?)";

/** Whether the request id is safe to embed in a deterministic primary key. */
export function validRequestId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}
