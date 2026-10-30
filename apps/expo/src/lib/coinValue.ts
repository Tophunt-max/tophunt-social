/**
 * Coin value (₹ per DP coin) as the app shows it.
 *
 * Set by the admin in Coin Economy → Coin value (`coinValues.dpCoinInr` in the
 * public app config). It is what a DP coin is worth in the shop, shown for
 * reference only.
 */

/** ₹ per DP coin, or null when not configured / invalid (then nothing is shown). */
export function coinRate(config: any): number | null {
  const r = Number(config?.coinValues?.dpCoinInr);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** "₹1,250" / "₹12.50" (paise only when there are any). */
export function formatInr(amount: number): string {
  const n = Math.max(0, Number(amount) || 0);
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `₹${n.toLocaleString('en-IN', whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "≈ ₹125" for a coin amount, or null when the rate is unknown. */
export function coinsInInr(coins: number, rate: number | null): string | null {
  if (rate === null) return null;
  return `≈ ${formatInr((Number(coins) || 0) * rate)}`;
}
