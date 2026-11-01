import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { PurchaseConfirmationSheet, type PurchaseSheetState } from '@/src/components/shop/premium/PurchaseConfirmationSheet';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { purchaseErrorView } from '@/src/lib/shopModel';
import { newRequestId, useBuyStoreItem, useStore, type StoreItemView } from '@/src/services/monetization';
import { useTophuntPalette } from '@/src/theme/tophunt';

/**
 * Buying a digital item, shared by the Shop, the item detail and the Store
 * screens: the purchase sheet confirms, then one request id per item is used
 * for the attempt and reused on retry, so a flaky network can never charge
 * twice. The server re-checks price, stock and balance.
 *
 * Request ids: kept per item while the server has not answered (a network
 * failure: the retry sends the same id and the server replays the original
 * result if it went through); dropped once the server answered, so the next
 * confirm is a new purchase attempt.
 *
 * Render `dialog` once in the screen.
 */
export function useDigitalPurchase({ onBought, onStale }: { onBought?: () => void; onStale?: () => void } = {}) {
  const buy = useBuyStoreItem();
  const router = useRouter();
  const p = useTophuntPalette();
  const { user } = useAuth();
  const { data: me } = useProfile(user?.uid || '');
  // Read-only view of the store cache (never fetches): after a price change
  // the refetched listing replaces the one the sheet opened with.
  const storeCache = useStore(false);
  const [sheet, setSheet] = useState<PurchaseSheetState | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const pendingIds = useRef(new Map<string, string>());
  const inFlight = useRef(false);

  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };

  const current: StoreItemView | null = sheet
    ? storeCache.data?.find((i) => i.itemId === sheet.item.itemId) ?? sheet.item
    : null;

  const onBuy = useCallback(async (item: StoreItemView) => {
    if (inFlight.current) return;
    setSheet({ item, phase: 'confirm', error: null });
  }, []);

  const confirm = () => {
    if (!current || inFlight.current) return;
    const item = current;
    let rid = pendingIds.current.get(item.itemId);
    if (!rid) {
      rid = newRequestId();
      pendingIds.current.set(item.itemId, rid);
    }
    inFlight.current = true;
    setBuying(item.itemId);
    setSheet({ item, phase: 'busy', error: null });
    buy.mutate(
      { item, requestId: rid },
      {
        onSuccess: () => {
          pendingIds.current.delete(item.itemId);
          setSheet((s) => (s && s.item.itemId === item.itemId ? { item: { ...item, owned: true }, phase: 'success', error: null } : s));
          onBought?.();
        },
        onError: (e: any) => {
          // The server answered (refused): the next tap is a new purchase attempt.
          // A network failure keeps the id, so retrying cannot charge twice.
          if (e?.status) pendingIds.current.delete(item.itemId);
          const view = purchaseErrorView(e);
          if (e?.reason === 'price_changed' || e?.reason === 'item_unavailable') onStale?.();
          setSheet((s) => (s && s.item.itemId === item.itemId ? { item, phase: 'error', error: view } : s));
        },
        onSettled: () => {
          inFlight.current = false;
          setBuying(null);
        },
      },
    );
  };

  const close = () => {
    if (inFlight.current) return;
    setSheet(null);
  };
  const go = (href: string) => {
    if (inFlight.current) return;
    setSheet(null);
    router.push(href as any);
  };

  const dialog = (
    <PurchaseConfirmationSheet
      state={sheet && current ? { ...sheet, item: sheet.phase === 'success' ? sheet.item : current } : null}
      p={p}
      viewer={viewer}
      live={live}
      dpcoin={bal.dpcoin}
      onConfirm={confirm}
      onClose={close}
      onEquip={() => go('/rewards/inventory')}
      onEarn={() => go('/explore/battles')}
    />
  );

  return { onBuy, buying, dialog };
}
