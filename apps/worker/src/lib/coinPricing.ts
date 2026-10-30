/**
 * What one coin is worth in ₹, set by the admin (Coin Economy → Coin value).
 *
 *   dpCoinInr   prices physical products: coins = ceil(₹ price ÷ dpCoinInr).
 *   diamondInr  values Diamonds given away as rewards (cost reporting only).
 *
 * Nothing is bought or cashed out: these are reference values. A changed value
 * applies to NEW orders only, because every order stores the rate it was
 * priced at.
 */
import { httpsError } from "./http";

const MAX_RATE = 1000;

const validRate = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= MAX_RATE ? n : null;
};

/** Validate an admin `coinPricing` patch in place. */
export function validateCoinPricingPatch(cp: any): void {
  if (!cp || typeof cp !== "object") throw httpsError("invalid-argument", "coinPricing must be an object.");
  // The old Diamond buy rate is gone (nothing is sold); an old client resending it is ignored.
  delete cp.buyRate;
  for (const k of Object.keys(cp)) {
    if (k !== "dpCoinInr" && k !== "diamondInr") throw httpsError("invalid-argument", `coinPricing.${k} is not a setting.`);
  }
  for (const k of ["dpCoinInr", "diamondInr"] as const) {
    if (cp[k] === undefined) continue;
    const r = Number(cp[k]);
    const label = k === "dpCoinInr" ? "DP coin value" : "Diamond value";
    if (!Number.isFinite(r) || r <= 0 || r > MAX_RATE) throw httpsError("invalid-argument", `${label} must be more than ₹0 and at most ₹${MAX_RATE}.`);
    if (Math.round(r * 10000) !== Number((r * 10000).toFixed(4))) throw httpsError("invalid-argument", `${label}: at most 4 decimal places.`);
    cp[k] = r;
  }
}

export function coinValuesFromConfig(cfg: any): { dpCoinInr: number; diamondInr: number } {
  const dp = validRate(cfg?.coinPricing?.dpCoinInr) ?? 1;
  const diamond = validRate(cfg?.coinPricing?.diamondInr) ?? dp;
  return { dpCoinInr: dp, diamondInr: diamond };
}

/** DP coins for a ₹ amount given in paise, rounded UP (the platform never undercharges). */
export function dpCoinsForPaise(paise: number, dpCoinInr: number): number {
  if (!(paise > 0)) return 0;
  // Both sides in 1/10000 ₹ (rates carry at most 4 decimals), integer ceil.
  const unit = Math.max(1, Math.round(dpCoinInr * 10000));
  const amount = Math.round(paise) * 100;
  return Math.floor((amount + unit - 1) / unit);
}
