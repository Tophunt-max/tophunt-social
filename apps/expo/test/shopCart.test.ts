import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock('@/src/services/api', () => ({ callApi: vi.fn(), readApi: vi.fn() }));

import { repriceCart, type CartLine, type ShopProduct } from '../src/services/shop';
import { coinRate } from '../src/lib/coinValue';

const line = (variantId: string, qty: number, unitCoins = 100): CartLine => ({ productId: 'p1', variantId, qty, title: 'T', variantLabel: variantId, image: null, unitCoins });
const product = (priceCoins: number, stock: Record<string, number>): ShopProduct => ({
  id: 'p1', title: 'T', description: '', category: 'general', images: [], priceInr: 0, shippingInr: 0, priceCoins, returnDays: 7, featured: false,
  variants: Object.entries(stock).map(([id, s]) => ({ id, label: id, stock: s, inStock: s > 0 })),
});

describe('repriceCart', () => {
  it('uses the current server price, not the price saved in the cart', () => {
    const r = repriceCart([line('m', 2, 100)], [product(120, { m: 5 })]);
    expect(r.total).toBe(240);
    expect(r.allAvailable).toBe(true);
  });

  it('flags lines that are out of stock or gone', () => {
    const r = repriceCart([line('m', 3), line('x', 1)], [product(100, { m: 2 })]);
    expect(r.lines[0]).toMatchObject({ available: false, stock: 2 });
    expect(r.lines[1]).toMatchObject({ available: false, stock: 0 });
    expect(r.allAvailable).toBe(false);
  });
});

describe('coinRate', () => {
  it('reads the admin DP coin value', () => {
    expect(coinRate({ coinValues: { dpCoinInr: 2, diamondInr: 1 } })).toBe(2);
    expect(coinRate({})).toBeNull();
  });
});
