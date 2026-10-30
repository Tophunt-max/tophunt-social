/**
 * Friendly names for wallet history rows (worker `coin_transactions.type`).
 * Unknown types fall back to a readable version of the raw type.
 */
const LABELS: Record<string, string> = {
  // Earning (Diamonds)
  daily_reward: 'Daily check-in',
  daily_task: 'Daily task',
  referral_bonus: 'Referral bonus',
  verification_bonus: 'Verification bonus',
  signup_bonus: 'Welcome bonus',
  ad_reward: 'Ad reward',
  gamification_reward: 'Level / season reward',
  xp_conversion: 'XP → Diamond',
  monthly_hall_of_fame_reward: 'Hall of Fame',
  promo_bonus: 'Promo bonus',
  // Contests
  contest_entry_fee: 'Contest entry',
  contest_win_reward: 'Contest win',
  contest_refund: 'Contest refund',
  contest_entry_refund: 'Entry refund',
  // Shopping (DP coin)
  gift_send: 'Gift sent',
  store_purchase: 'Digital item',
  store_refund: 'Digital item refund',
  shop_order: 'Shop order',
  shop_refund: 'Shop refund',
  // Legacy / admin
  purchase: 'Diamond purchase (old)',
  manual_deposit: 'Deposit (old)',
  withdrawal_hold: 'Withdrawal (old)',
  withdrawal_refund: 'Withdrawal refund (old)',
  withdrawal: 'Withdrawal (old)',
  admin_adjustment: 'Adjustment by TopHunt',
  economy_reset: 'Fresh start reset',
};

export function ledgerLabel(type: string | null | undefined): string {
  if (!type) return '';
  return LABELS[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
