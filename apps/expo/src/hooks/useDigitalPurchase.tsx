import { useRef, useState } from 'react';
import { emitToast } from '@/src/lib/toastBridge';
import { useConfirm } from '@/src/components/modals/ConfirmDialog';
import { newRequestId, useBuyStoreItem, type StoreItemView } from '@/src/services/monetization';

/**
 * Buying a digital item, shared by the Shop and the Store screens: confirm,
 * then one request id per confirmed item, reused on retry so a flaky network
 * can never charge twice. The server re-checks price, stock and balance.
 *
 * Render `dialog` once in the screen.
 */
export function useDigitalPurchase({ onBought, onStale }: { onBought?: () => void; onStale?: () => void } = {}) {
  const buy = useBuyStoreItem();
  const { confirm, dialog } = useConfirm();
  const [buying, setBuying] = useState<string | null>(null);
  const pendingIds = useRef(new Map<string, string>());

  const onBuy = async (item: StoreItemView) => {
    const ok = await confirm({
      title: `Buy ${item.name}?`,
      message:
        `${item.priceCoins} DP coin. ` +
        `Yours permanently. ${item.refundable ? 'Refunds on request through support.' : 'Not refundable.'}`,
      confirmLabel: 'Buy',
    });
    if (!ok) return;
    let rid = pendingIds.current.get(item.itemId);
    if (!rid) {
      rid = newRequestId();
      pendingIds.current.set(item.itemId, rid);
    }
    setBuying(item.itemId);
    buy.mutate(
      { item, requestId: rid },
      {
        onSuccess: () => {
          pendingIds.current.delete(item.itemId);
          emitToast(`${item.name} is yours. Equip it from My items.`, 'success');
          onBought?.();
        },
        onError: (e: any) => {
          // The server answered (refused): the next tap is a new purchase attempt.
          // A network failure keeps the id, so retrying cannot charge twice.
          if (e?.status) pendingIds.current.delete(item.itemId);
          if (e?.reason === 'price_changed' || e?.reason === 'item_unavailable') onStale?.();
          emitToast(e?.message || 'Purchase failed. You were not charged.', 'error');
        },
        onSettled: () => setBuying(null),
      },
    );
  };

  return { onBuy, buying, dialog };
}
