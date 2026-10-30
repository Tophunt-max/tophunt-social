import { useAppConfig } from '@/src/services/appSettings';
import { coinRate } from '@/src/lib/coinValue';

/** ₹ per DP coin (live), or null when not configured. */
export function useCoinRate(): number | null {
  const { config } = useAppConfig();
  return coinRate(config);
}
