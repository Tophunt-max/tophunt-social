import { callApi } from '../api';

// Real-money top-ups (createOrder / topup / requestDeposit) and withdrawals
// (requestWithdrawal) are retired: the server refuses them (worker
// lib/cashRetirement.ts). Diamonds are earned (app/earn), DP coin is spent in
// the shop (src/services/shop.ts).
export const walletService = {
  claimDailyBonus: async () => {
    try {
      // The server decides the day and the amount; nothing is sent.
      return await callApi('claimDailyReward', {});
    } catch (error) {
      console.error("Error claiming daily bonus:", error);
      throw error;
    }
  },

  /**
   * Credit a rewarded-ad view. The server enforces a daily cap + rate limit and
   * returns { coinsEarned, remaining }. (Server-Side Verification of the ad
   * should gate this before production — see PRODUCTION_TODO.md.)
   */
  claimAdReward: async () => {
    try {
      return await callApi('claimAdReward', {});
    } catch (error) {
      console.error("Error claiming ad reward:", error);
      throw error;
    }
  },

  /**
   * Request a cash payout of Dpcoins. The Worker validates against the admin
   * withdrawal config (enabled / min amount / conversion rate) and creates a
   * pending request; coins are held by the admin on approval.
   */
  /** `quotedFee`: the platform fee shown to the user; the server refuses if it no longer matches. */
  getDailyReward: async () => {
    return await callApi('getDailyReward', {});
  },

  /** Daily tasks with live progress + claim state. */
  getDailyTasks: async () => {
    return await callApi('getDailyTasks', {});
  },

  /** Claim a completed daily task's reward. */
  claimDailyTask: async (taskId: string) => {
    return await callApi('claimDailyTask', { taskId });
  },
};
