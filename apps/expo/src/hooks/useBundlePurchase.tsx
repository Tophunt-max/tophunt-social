import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { BundleConfirmSheet, type BundleSheetState } from '@/src/components/shop/premium/BundleConfirmSheet';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { bundleErrorView } from '@/src/lib/shopModel';
import { newRequestId, useBuyStoreBundle, useShopCollections, type PublicShopBundle } from '@/src/services/monetization';
import { useTophuntPalette } from '@/src/theme/tophunt';

/**
 * Buying a Diamond bundle (the bundle detail screen): the sheet confirms,
 * then one request id per bundle is used for the attempt and reused on
 * retry, so a flaky network can never charge twice. The server re-checks
 * price, schedule, stock, ownership and the Diamond balance.
 *
 * Request ids: kept per bundle while the server has not answered (a network
 * failure: the retry sends the same id and the server replays the original
 * result if it went through); dropped once the server answered, so the next
 * confirm is a new purchase attempt. Same rules as useDigitalPurchase.
 *
 * Render `dialog` once in the screen.
 */
export function useBundlePurchase({ onBought, onStale }: { onBought?: () => void; onStale?: () => void } = {}) {
  const buy = useBuyStoreBundle();
  const router = useRouter();
  const p = useTophuntPalette();
  const { user } = useAuth();
  const { data: me } = useProfile(user?.uid || '');
  // Read-only view of the bundles cache (never fetches): after a price change
  // the refetched bundle replaces the one the sheet opened with.
  const cache = useShopCollections(false);
  const [sheet, setSheet] = useState<BundleSheetState | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const pendingIds = useRef(new Map<string, string>());
  const inFlight = useRef(false);

  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };

  const current: PublicShopBundle | null = sheet
    ? cache.data?.bundles.find((b) => b.id === sheet.bundle.id) ?? sheet.bundle
    : null;

  const onBuy = useCallback((bundle: PublicShopBundle) => {
    if (inFlight.current) return;
    setSheet({ bundle, phase: 'confirm', error: null });
  }, []);

  const confirm = () => {
    if (!current || inFlight.current) return;
    const bundle = current;
    let rid = pendingIds.current.get(bundle.id);
    if (!rid) {
      rid = newRequestId();
      pendingIds.current.set(bundle.id, rid);
    }
    inFlight.current = true;
    setBuying(bundle.id);
    setSheet({ bundle, phase: 'busy', error: null });
    buy.mutate(
      { bundle, requestId: rid },
      {
        onSuccess: (res) => {
          pendingIds.current.delete(bundle.id);
          const granted = Array.isArray(res?.purchase?.granted) ? res.purchase.granted.length : undefined;
          setSheet((s) => (s && s.bundle.id === bundle.id ? { bundle: { ...bundle, purchased: true }, phase: 'success', error: null, granted } : s));
          onBought?.();
        },
        onError: (e: any) => {
          // The server answered (refused): the next tap is a new purchase attempt.
          // A network failure keeps the id, so retrying cannot charge twice.
          if (e?.status) pendingIds.current.delete(bundle.id);
          const view = bundleErrorView(e);
          if (view.refresh) onStale?.();
          setSheet((s) => (s && s.bundle.id === bundle.id ? { bundle, phase: 'error', error: view } : s));
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
    <BundleConfirmSheet
      state={sheet && current ? { ...sheet, bundle: sheet.phase === 'success' ? sheet.bundle : current } : null}
      p={p}
      viewer={viewer}
      live={live}
      diamonds={bal.diamonds}
      onConfirm={confirm}
      onClose={close}
      onEquip={() => go('/shop/collection')}
      onEarn={() => go('/earn')}
    />
  );

  return { onBuy, buying, dialog };
}
