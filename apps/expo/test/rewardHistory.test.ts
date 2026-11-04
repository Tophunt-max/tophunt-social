import { describe, expect, it } from 'vitest';
import { historyAmounts, historyDay, historyTabOf, historyTitle, signed, type RewardHistoryItem } from '@/src/lib/rewardHistory';
import { ledgerLabel } from '@/src/lib/ledgerLabels';

const base: RewardHistoryItem = { key: 'c:1', source: 'coin', type: 'daily_reward', diamonds: 0, dpcoin: 0, xp: 0, xpSpent: null, description: null, createdAt: 0 };

describe('reward history helpers', () => {
  it('falls back to the All tab for unknown values', () => {
    expect(historyTabOf('xp')).toBe('xp');
    expect(historyTabOf('nope')).toBe('all');
    expect(historyTabOf(undefined)).toBe('all');
  });

  it('shows the non-zero amounts of a row', () => {
    expect(historyAmounts({ ...base, diamonds: 5 })).toEqual([{ unit: 'diamond', value: 5 }]);
    expect(historyAmounts({ ...base, type: 'contest_win_reward', dpcoin: 18, diamonds: 2 })).toEqual([
      { unit: 'diamond', value: 2 },
      { unit: 'dpcoin', value: 18 },
    ]);
    expect(historyAmounts({ ...base, type: 'xp_conversion', diamonds: 3, xpSpent: 300 })).toEqual([
      { unit: 'xp', value: -300 },
      { unit: 'diamond', value: 3 },
    ]);
    expect(historyAmounts({ ...base, source: 'xp', type: 'vote', xp: 10 })).toEqual([{ unit: 'xp', value: 10 }]);
    expect(historyAmounts(base)).toEqual([]);
  });

  it('titles rows from the server label or the ledger label', () => {
    expect(historyTitle({ ...base, source: 'xp', type: 'vote', label: 'Voted in a battle' })).toBe('Voted in a battle');
    expect(historyTitle({ ...base, type: 'event_reward' })).toBe('Special event reward');
    expect(ledgerLabel('referral_clawback')).toBe('Referral reversed');
  });

  it('formats signed amounts', () => {
    expect(signed(5)).toBe('+5');
    expect(signed(-10)).toBe('−10');
    expect(signed(2.5)).toBe('+2.50');
  });

  it('groups by local day', () => {
    const now = new Date(2026, 10, 3, 15, 0).getTime();
    expect(historyDay(new Date(2026, 10, 3, 1, 0).getTime(), now)).toBe('Today');
    expect(historyDay(new Date(2026, 10, 2, 23, 0).getTime(), now)).toBe('Yesterday');
    expect(historyDay(new Date(2026, 9, 20).getTime(), now)).not.toMatch(/Today|Yesterday/);
  });
});
