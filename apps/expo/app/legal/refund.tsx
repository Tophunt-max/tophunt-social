import { LegalDocument } from '@/src/components/legal/LegalDocument';

/**
 * Refund & cancellation policy, bundled with the app.
 *
 * TopHunt sells nothing for money, so the policy is short and fixed: it covers
 * DP coin spent in the Shop and on digital items.
 */
const POLICY = `## Nothing to pay for

TopHunt is free. You never pay money in the app, so there is no money to refund.

- **Diamonds** are free. You earn them from XP and rewards and use them to enter contests.
- **DP coin** is won in contests and spent in the Shop and on gifts. It cannot be bought, and it cannot be exchanged for money.

## Contest entries

If a contest is cancelled, or ends in a way that refunds entries, your Diamonds go back to your wallet automatically.

## Shop orders

- You can cancel an order from **Shop → My orders** while it is still being reviewed, before it is packed. The DP coin goes back to your wallet straight away.
- After delivery, you can request a return from the order screen until the return date shown there. Once the return is approved, the DP coin is refunded to your wallet.

## Digital items

Items marked non-refundable cannot be returned. For other items, contact support and we will refund the DP coin.

## Help

For any problem with an order or a refund, use **Settings → Contact Support**.`;

export default function RefundPolicyScreen() {
  return <LegalDocument docKey="refundPolicy" title="Refund Policy" bundledContent={POLICY} />;
}
