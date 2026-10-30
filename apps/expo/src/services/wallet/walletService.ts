import { callApi } from '../api';

// Diamonds are earned (app/earn), DP coin is spent in the shop (src/services/shop.ts).
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

  /** Today's daily-reward state. */
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
