/**
 * TopHunt has no real money: Diamonds are earned free, DP coin is won and spent
 * in Shopping, and nothing is bought or cashed out.
 *
 * App builds released before that still know the old action names. They get a
 * clear answer instead of "unknown action".
 */
import { httpsError } from "./http";

export const CASH_RETIRED_REASON = "cash_flows_retired";

const OLD_ACTIONS: Record<string, string> = {
  createOrder: "Diamond ab khareede nahi jaate. Earning se free Diamond kamao.",
  topup: "Diamond ab khareede nahi jaate. Earning se free Diamond kamao.",
  requestDeposit: "Diamond ab khareede nahi jaate. Earning se free Diamond kamao.",
  requestWithdrawal: "Withdrawals nahi hote. Apne DP coin se Shopping karo.",
};

export function assertCashActionAllowed(action: string): void {
  const message = OLD_ACTIONS[action];
  if (message) throw httpsError("failed-precondition", message, CASH_RETIRED_REASON);
}
