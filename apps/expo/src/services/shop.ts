/**
 * Physical shop (DP coin) and XP → Diamond conversion clients.
 *
 * The cart lives on the device (zustand, persisted). The server re-prices and
 * re-checks stock at checkout; the app sends the total it showed and a
 * per-checkout `requestId`, so a retry never places two orders.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '@/src/services/api';

export interface ShopVariant { id: string; label: string; inStock: boolean; stock: number }
export interface ShopProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  priceInr: number;
  shippingInr: number;
  priceCoins: number;
  returnDays: number;
  featured: boolean;
  variants: ShopVariant[];
}

export type OrderStatus = 'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'return_requested' | 'returned' | 'return_rejected';
export interface ShopOrder {
  id: string;
  status: OrderStatus;
  totalCoins: number;
  totalInr: number;
  address: Record<string, any>;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: number;
  deliveredAt: number | null;
  returnUntil: number | null;
  items: { productId: string; variantId: string; title: string; variantLabel: string; image: string | null; qty: number; unitCoins: number }[];
  history: { from: string | null; to: string; note: string | null; at: number }[];
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Order placed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled · DP coin refunded',
  return_requested: 'Return requested',
  returned: 'Returned · DP coin refunded',
  return_rejected: 'Return declined',
};

export const SHOP_KEYS = {
  products: ['shop', 'products'] as const,
  orders: ['shop', 'orders'] as const,
  order: (id: string) => ['shop', 'order', id] as const,
  xp: ['earning', 'xp-conversion'] as const,
};

export function useShopProducts(enabled: boolean) {
  return useQuery({
    queryKey: SHOP_KEYS.products,
    queryFn: async () => ((await callApi('getShopProducts')) as { products: ShopProduct[] }).products,
    enabled,
    staleTime: 30_000,
  });
}

export function useMyOrders(enabled = true) {
  return useInfiniteQuery({
    queryKey: SHOP_KEYS.orders,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      callApi('getMyShopOrders', { cursor: pageParam }) as Promise<{
        orders: { id: string; status: OrderStatus; totalCoins: number; createdAt: number; title: string; image: string | null; units: number }[];
        nextCursor: number | null;
      }>,
    getNextPageParam: (l) => l.nextCursor,
    enabled,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: SHOP_KEYS.order(id),
    queryFn: async () => ((await callApi('getShopOrder', { orderId: id })) as { order: ShopOrder }).order,
    enabled: !!id,
  });
}

export function usePlaceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: { productId: string; variantId: string; qty: number }[]; address: any; expectedTotalCoins: number; requestId: string; note?: string }) =>
      callApi('placeShopOrder', v, { retries: 1 }) as Promise<{ success: true; order: ShopOrder }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shop'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: 'cancelShopOrder' | 'requestShopReturn'; orderId: string; reason?: string }) =>
      callApi(v.action, { orderId: v.orderId, reason: v.reason }) as Promise<{ success: true; order: ShopOrder }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shop'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ------------------------------------------------------------------ cart

export interface CartLine {
  productId: string;
  variantId: string;
  qty: number;
  title: string;
  variantLabel: string;
  image: string | null;
  unitCoins: number;
}

interface CartState {
  lines: CartLine[];
  add: (l: CartLine) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

export const MAX_QTY = 5;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (l) =>
        set((s) => {
          const prev = s.lines.find((x) => x.variantId === l.variantId);
          if (prev) return { lines: s.lines.map((x) => (x.variantId === l.variantId ? { ...x, qty: Math.min(MAX_QTY, x.qty + l.qty), unitCoins: l.unitCoins } : x)) };
          return { lines: [...s.lines, { ...l, qty: Math.min(MAX_QTY, l.qty) }].slice(0, 10) };
        }),
      setQty: (variantId, qty) => set((s) => ({ lines: s.lines.map((x) => (x.variantId === variantId ? { ...x, qty: Math.max(1, Math.min(MAX_QTY, qty)) } : x)) })),
      remove: (variantId) => set((s) => ({ lines: s.lines.filter((x) => x.variantId !== variantId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'tophunt-shop-cart', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** Re-price the cart against the current catalogue; drops lines that are gone. */
export function repriceCart(lines: CartLine[], products: ShopProduct[] | undefined) {
  const byVariant = new Map<string, { p: ShopProduct; v: ShopVariant }>();
  for (const p of products ?? []) for (const v of p.variants) byVariant.set(v.id, { p, v });
  const priced = lines.map((l) => {
    const hit = byVariant.get(l.variantId);
    return { ...l, unitCoins: hit ? hit.p.priceCoins : l.unitCoins, available: !!hit && hit.v.stock >= l.qty, stock: hit?.v.stock ?? 0 };
  });
  return { lines: priced, total: priced.reduce((s, l) => s + l.unitCoins * l.qty, 0), allAvailable: priced.every((l) => l.available) };
}

// ------------------------------------------------------------------ XP → Diamond

export interface XpConversionStatus {
  enabled: boolean;
  xpPerDiamond: number;
  convertibleXp: number;
  maxDiamondsPerDay: number;
  diamondsToday: number;
  availableDiamonds: number;
}

export function useXpConversion(enabled: boolean) {
  return useQuery({
    queryKey: SHOP_KEYS.xp,
    queryFn: () => callApi('getXpConversion') as Promise<XpConversionStatus>,
    enabled,
    staleTime: 15_000,
  });
}

export function useConvertXp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { diamonds: number; requestId: string }) =>
      callApi('convertXp', v, { retries: 1 }) as Promise<{ success: true; diamonds: number; xpSpent: number; replayed: boolean; status: XpConversionStatus }>,
    onSuccess: (r) => {
      qc.setQueryData(SHOP_KEYS.xp, r.status);
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
