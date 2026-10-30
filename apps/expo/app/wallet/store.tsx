import { Redirect } from 'expo-router';

/**
 * Retired screen, kept so old links and notifications still land somewhere.
 * Buying Diamonds is retired: Diamonds are earned for free.
 * The server refuses the old actions too (worker lib/cashRetirement.ts).
 */
export default function Retired() {
  return <Redirect href={'/earn' as any} />;
}
