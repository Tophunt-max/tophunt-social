/**
 * Reward History display helpers (server: apps/worker/src/lib/rewardHistory.ts).
 * The server decides which rows belong to a tab and every amount; these only
 * turn a row into a title and amount chips.
 */
import type { EarningArtKey } from '@/assets/earning';
import { ledgerLabel } from '@/src/lib/ledgerLabels';

export type HistoryTab = 'all' | 'diamonds' | 'xp' | 'dpcoin' | 'spent' | 'conversion' | 'adjusted';

export const REWARD_HISTORY_TABS: { key: HistoryTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'diamonds', label: 'Diamonds Earned' },
  { key: 'xp', label: 'XP Earned' },
  { key: 'dpcoin', label: 'DP Coins Won' },
  { key: 'spent', label: 'Diamonds Spent' },
  { key: 'conversion', label: 'XP Conversion' },
  { key: 'adjusted', label: 'Reversed / Adjusted' },
];

export function historyTabOf(raw: unknown): HistoryTab {
  return REWARD_HISTORY_TABS.some((t) => t.key === raw) ? (raw as HistoryTab) : 'all';
}

export interface RewardHistoryItem {
  key: string;
  source: 'coin' | 'xp';
  type: string;
  /** Server label for XP rows. */
  label?: string;
  diamonds: number;
  dpcoin: number;
  xp: number;
  xpSpent: number | null;
  description: string | null;
  createdAt: number;
}

export type AmountUnit = 'diamond' | 'dpcoin' | 'xp';

export function historyTitle(item: RewardHistoryItem): string {
  if (item.source === 'xp') return item.label || ledgerLabel(item.type);
  return ledgerLabel(item.type);
}

/** Non-zero amounts in display order. A conversion shows the XP it used, then the Diamonds. */
export function historyAmounts(item: RewardHistoryItem): { unit: AmountUnit; value: number }[] {
  const out: { unit: AmountUnit; value: number }[] = [];
  if (item.source === 'xp') {
    if (item.xp) out.push({ unit: 'xp', value: item.xp });
    return out;
  }
  if (item.type === 'xp_conversion' && item.xpSpent) out.push({ unit: 'xp', value: -item.xpSpent });
  if (item.diamonds) out.push({ unit: 'diamond', value: item.diamonds });
  if (item.dpcoin) out.push({ unit: 'dpcoin', value: item.dpcoin });
  return out;
}

/** Rewards Center artwork per ledger type (coin rows) and XP action (XP rows). */
const COIN_ART: Record<string, EarningArtKey> = {
  daily_reward: 'checkIn',
  daily_task: 'dailyMission',
  quest_reward: 'weeklyMission',
  achievement_reward: 'achievement',
  contest_reward: 'participation',
  contest_win_reward: 'winnerCrown',
  contest_entry_fee: 'contest',
  contest_refund: 'contest',
  contest_entry_refund: 'contest',
  event_reward: 'eventGiftBox',
  ad_reward: 'watchEarn',
  xp_conversion: 'xpConvert',
  referral_bonus: 'referralGift',
  referral_clawback: 'referral',
  gamification_reward: 'levelUp',
  monthly_hall_of_fame_reward: 'topEarnerCrown',
  signup_bonus: 'giftBox',
  verification_bonus: 'giftBox',
  promo_bonus: 'giftBox',
};

const XP_ART: Record<string, EarningArtKey> = {
  vote: 'missionVote',
  contest_entry: 'missionContest',
  match_win: 'winnerCrown',
  match_loss: 'participation',
  daily_checkin: 'checkIn',
  daily_task: 'dailyMission',
  quest: 'weeklyMission',
  achievement: 'achievement',
  hall_of_fame: 'topEarnerCrown',
};

/** The artwork drawn next to a history row. */
export function historyArt(item: RewardHistoryItem): EarningArtKey {
  if (item.source === 'xp') return XP_ART[item.type] ?? 'xp';
  return COIN_ART[item.type] ?? (item.diamonds ? 'diamond' : 'dpCoin');
}

/** A reversal or clawback row (drawn with a "Reversed" tag). */
export const isReversedRow = (item: RewardHistoryItem) => item.type === 'reversal' || item.type.endsWith('_clawback');

export function signed(value: number): string {
  const abs = Math.abs(value);
  const text = Number.isInteger(abs) ? abs.toLocaleString() : abs.toFixed(2);
  return `${value < 0 ? '−' : '+'}${text}`;
}

/** "Today", "Yesterday" or a short date, for grouping rows by day (device local time). */
export function historyDay(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}
