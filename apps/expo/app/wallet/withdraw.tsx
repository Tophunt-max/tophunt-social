import { Redirect } from 'expo-router';

/**
 * Retired screen, kept so old links and notifications still land somewhere.
 * Withdrawals are retired: DP coin is spent in the Shop.
 * The server refuses the old actions too (worker lib/cashRetirement.ts).
 */
export default function Retired() {
  return <Redirect href={'/shop' as any} />;
}
