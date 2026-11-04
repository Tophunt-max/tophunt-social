import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import { useAuth } from '@/src/hooks/useAuth';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { isShort } from '@/src/lib/shopModel';
import { useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';
import type { ListGate } from './ShopListScreen';

/**
 * What every digital "View All" page needs: the signed-in user, the store
 * listing (getStore), the viewer for item previews, the DP coin balance and
 * the shared buy flow (render `dialog` once, the scaffold does it via `overlay`).
 */
export function useShopListData() {
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const enabled = !!user && cfg.store.enabled;
  const store = useStore(enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const avatarUri: string | null = (me as any)?.profileImageUrl ?? user?.photoURL ?? null;
  const name: string | null = (me as any)?.fullName ?? user?.displayName ?? null;
  const viewer: Viewer = useMemo(() => ({ avatarUri, name }), [avatarUri, name]);
  const purchase = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });
  const gate: ListGate = !user ? 'signedOut' : !cfg.store.enabled ? 'off' : null;
  const dpcoin = bal.dpcoin;
  const short = useCallback((i: StoreItemView) => isShort(dpcoin, i.priceCoins, live), [dpcoin, live]);
  const router = useRouter();
  const openItem = useCallback((id: string) => router.push(`/shop/item/${encodeURIComponent(id)}` as any), [router]);
  const { onBuy } = purchase;
  const buyItem = useCallback((i: StoreItemView) => void onBuy(i), [onBuy]);
  const items = useMemo(() => store.data ?? [], [store.data]);
  return { user, cfg, enabled, store, items, me, refetchMe, live, bal, viewer, purchase, gate, short, router, openItem, buyItem };
}
