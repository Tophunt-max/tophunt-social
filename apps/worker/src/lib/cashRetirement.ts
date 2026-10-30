/**
 * Real-money deposits and withdrawals are retired.
 *
 * The economy is now closed-loop:
 *   Earning (free) → 💎 Diamond → contests → 🪙 DP coin → Shopping
 * Nobody pays ₹ into the app and nobody takes ₹ out. See MONETIZATION.md.
 *
 * Retired, refused server-side (hiding buttons is not enough):
 *   createOrder, requestDeposit  (no new coin purchases)
 *   requestWithdrawal            (no new payouts)
 *   admin approve / mark-paid of withdrawals, admin approve of deposits
 *
 * Kept on purpose so nobody's money is lost in the switch:
 *   - `topup`, the Razorpay webhook and the reconcile cron still credit an order
 *     that was ALREADY paid before the switch.
 *   - Admin can still REJECT pending withdrawals (refunds the held DP coin).
 *   - All historical rows stay readable.
 *
 * Deploy flag `CASH_FLOWS_RETIRED`: anything except the literal "false" means
 * retired (fail-closed). The test harness sets "false" so the legacy money
 * tests keep covering the code paths that still credit in-flight orders.
 */
import type { Env } from "../types";
import { httpsError } from "./http";

export const CASH_RETIRED_REASON = "cash_flows_retired";

export const RETIRED_CASH_ACTIONS: ReadonlySet<string> = new Set(["createOrder", "requestDeposit", "requestWithdrawal"]);

export function cashFlowsRetired(env: Env): boolean {
  return (env as any).CASH_FLOWS_RETIRED !== "false";
}

export function assertCashActionAllowed(env: Env, action: string): void {
  if (!cashFlowsRetired(env) || !RETIRED_CASH_ACTIONS.has(action)) return;
  if (action === "requestWithdrawal") {
    throw httpsError("failed-precondition", "Withdrawals band ho gaye hain. Apne DP coin se Shopping karo.", CASH_RETIRED_REASON);
  }
  throw httpsError("failed-precondition", "Diamond ab khareede nahi jaate. Earning se free Diamond kamao.", CASH_RETIRED_REASON);
}
