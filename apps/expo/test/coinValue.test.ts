/**
 * Coin value (₹ per DP coin) helpers.
 */
import { describe, it, expect } from 'vitest';
import { coinRate, coinsInInr, formatInr } from '@/src/lib/coinValue';

describe('coin value', () => {
  it('reads the admin rate, and shows nothing when it is unset or invalid', () => {
    expect(coinRate({ coinValues: { dpCoinInr: 0.1 } })).toBe(0.1);
    expect(coinRate({ coinValues: { dpCoinInr: 0 } })).toBeNull();
    expect(coinRate({ coinValues: { dpCoinInr: 'x' } })).toBeNull();
    expect(coinRate({})).toBeNull();
    expect(coinRate(null)).toBeNull();
    expect(coinsInInr(1250, null)).toBeNull();
  });
  it('formats rupees the Indian way', () => {
    expect(coinsInInr(1250, 0.1)).toBe('≈ ₹125');
    expect(coinsInInr(125000, 1)).toBe('≈ ₹1,25,000');
    expect(formatInr(12.5)).toBe('₹12.50');
  });
});
