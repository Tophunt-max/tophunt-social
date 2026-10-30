/**
 * Physical shop: products bought with DP coin, shipped by the admin.
 *
 * Pricing: the admin sets a ₹ price (and optional ₹ delivery) per product. The
 * DP coin price is derived from Coin Economy → Values (`dpCoinInr`), rounded
 * up, and recomputed for new orders only. Each order stores the coins charged
 * and the rate used.
 *
 * Checkout is one D1 batch (lib/coinSpend.ts): the DP coin ledger row and
 * balance UPDATE are gated on EVERY line still being in stock at the expected
 * price; stock is then decremented, and the order, its items and the first
 * status-history row are written. Overselling and double charging are
 * impossible: a retry with the same `requestId` returns the original order.
 *
 * Lifecycle (admin ships by hand and enters the tracking number):
 *   placed → packed → shipped → delivered → (return_requested → returned | return_rejected)
 *   placed | packed → cancelled          (by the user while placed, or the admin)
 * Cancelled and returned orders give the DP coin back, exactly once.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { spendStatements, validRequestId } from "./coinSpend";
import { coinValuesFromConfig, dpCoinsForPaise } from "./coinPricing";
import { getAppConfig } from "./settings";
import { parseDeliveryAddress } from "./deliveryAddress";

export const ORDER_STATUSES = ["placed", "packed", "shipped", "delivered", "cancelled", "return_requested", "returned", "return_rejected"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Moves an ADMIN may make. */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  return_requested: ["returned", "return_rejected"],
  returned: [],
  return_rejected: [],
};
/** Statuses whose transition gives the DP coin back. */
const REFUNDING: OrderStatus[] = ["cancelled", "returned"];

export const MAX_LINES = 10;
export const MAX_QTY = 5;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const json = <T>(v: unknown, fallback: T): T => {
  try {
    return typeof v === "string" ? JSON.parse(v) : (v as T) ?? fallback;
  } catch {
    return fallback;
  }
};

export interface ProductView {
  id: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  priceInr: number;
  shippingInr: number;
  /** DP coins per unit, delivery included. */
  priceCoins: number;
  returnDays: number;
  featured: boolean;
  variants: { id: string; label: string; inStock: boolean; stock: number }[];
}

/** DP coin price for one unit: (₹ price + ₹ delivery) at the current rate. */
export function unitCoins(priceInrPaise: number, shippingInrPaise: number, dpCoinInr: number): number {
  return Math.max(1, dpCoinsForPaise(priceInrPaise + shippingInrPaise, dpCoinInr));
}

export async function listProducts(env: Env, opts: { category?: string | null; productId?: string | null } = {}): Promise<ProductView[]> {
  const { dpCoinInr } = coinValuesFromConfig(await getAppConfig(env));
  const where = ["p.active = 1"];
  const binds: unknown[] = [];
  if (opts.category) { where.push("p.category = ?"); binds.push(opts.category); }
  if (opts.productId) { where.push("p.id = ?"); binds.push(opts.productId); }
  const products = await env.DB.prepare(
    `SELECT * FROM shop_products p WHERE ${where.join(" AND ")} ORDER BY p.featured DESC, p.sort, p.created_at DESC LIMIT 200`,
  ).bind(...binds).all<any>();
  const rows = products.results ?? [];
  if (!rows.length) return [];
  const ph = rows.map(() => "?").join(",");
  const variants = await env.DB.prepare(
    `SELECT * FROM shop_variants WHERE active = 1 AND product_id IN (${ph}) ORDER BY sort, label`,
  ).bind(...rows.map((r) => r.id)).all<any>();
  const byProduct = new Map<string, any[]>();
  for (const v of variants.results ?? []) {
    const list = byProduct.get(v.product_id) ?? [];
    list.push(v);
    byProduct.set(v.product_id, list);
  }
  return rows
    .map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      category: p.category,
      images: json<string[]>(p.images, []),
      priceInr: Number(p.price_inr_paise) / 100,
      shippingInr: Number(p.shipping_inr_paise) / 100,
      priceCoins: unitCoins(Number(p.price_inr_paise), Number(p.shipping_inr_paise), dpCoinInr),
      returnDays: Number(p.return_days),
      featured: !!p.featured,
      variants: (byProduct.get(p.id) ?? []).map((v) => ({ id: v.id, label: v.label, stock: Number(v.stock), inStock: Number(v.stock) > 0 })),
    }))
    .filter((p) => p.variants.length > 0);
}

export interface CartLine {
  productId: string;
  variantId: string;
  qty: number;
}

function parseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw) || raw.length === 0) throw httpsError("invalid-argument", "Cart is empty.");
  const merged = new Map<string, CartLine>();
  for (const l of raw as any[]) {
    const productId = String(l?.productId ?? "");
    const variantId = String(l?.variantId ?? "");
    const qty = Number(l?.qty);
    if (!ID_RE.test(productId) || !ID_RE.test(variantId)) throw httpsError("invalid-argument", "Invalid product in cart.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw httpsError("invalid-argument", `Quantity must be 1-${MAX_QTY}.`);
    const prev = merged.get(variantId);
    const next = (prev?.qty ?? 0) + qty;
    if (next > MAX_QTY) throw httpsError("invalid-argument", `At most ${MAX_QTY} of one item per order.`);
    merged.set(variantId, { productId, variantId, qty: next });
  }
  if (merged.size > MAX_LINES) throw httpsError("invalid-argument", `At most ${MAX_LINES} different items per order.`);
  return [...merged.values()];
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  totalCoins: number;
  totalInr: number;
  dpCoinInr: number;
  address: Record<string, unknown>;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number | null;
  returnUntil: number | null;
  items: { productId: string; variantId: string; title: string; variantLabel: string; image: string | null; qty: number; unitCoins: number }[];
  history: { from: string | null; to: string; note: string | null; at: number }[];
  replayed?: boolean;
}

export async function loadOrder(env: Env, id: string, uid: string | null): Promise<OrderView | null> {
  const o = await env.DB.prepare(`SELECT * FROM shop_orders WHERE id = ?${uid ? " AND uid = ?" : ""}`).bind(...(uid ? [id, uid] : [id])).first<any>();
  if (!o) return null;
  const [items, history, ret] = await Promise.all([
    env.DB.prepare(`SELECT * FROM shop_order_items WHERE order_id = ? ORDER BY id`).bind(id).all<any>(),
    env.DB.prepare(`SELECT * FROM shop_order_history WHERE order_id = ? ORDER BY created_at, id`).bind(id).all<any>(),
    env.DB.prepare(`SELECT MIN(p.return_days) AS d FROM shop_order_items i JOIN shop_products p ON p.id = i.product_id WHERE i.order_id = ?`).bind(id).first<any>(),
  ]);
  const returnDays = ret?.d == null ? 0 : Number(ret.d);
  return {
    id: o.id,
    status: o.status,
    totalCoins: Number(o.total_coins),
    totalInr: Number(o.total_inr_paise) / 100,
    dpCoinInr: Number(o.dp_coin_inr),
    address: json(o.address, {}),
    carrier: o.carrier,
    trackingNumber: o.tracking_number,
    trackingUrl: o.tracking_url,
    createdAt: Number(o.created_at),
    updatedAt: Number(o.updated_at),
    deliveredAt: o.delivered_at ?? null,
    returnUntil: o.delivered_at && returnDays > 0 ? Number(o.delivered_at) + returnDays * 86_400_000 : null,
    items: (items.results ?? []).map((i) => ({ productId: i.product_id, variantId: i.variant_id, title: i.title, variantLabel: i.variant_label, image: i.image, qty: Number(i.qty), unitCoins: Number(i.unit_coins) })),
    history: (history.results ?? []).map((h) => ({ from: h.from_status, to: h.to_status, note: h.note, at: Number(h.created_at) })),
  };
}

export async function placeOrder(
  env: Env,
  uid: string,
  input: { items: unknown; address: unknown; expectedTotalCoins: unknown; requestId: unknown; note?: unknown },
  ts = Date.now(),
): Promise<OrderView> {
  if (!validRequestId(input.requestId)) throw httpsError("invalid-argument", "requestId is required (8-64 letters, digits, - or _).");
  const id = `order:${uid}:${input.requestId}`;
  const prior = await loadOrder(env, id, uid);
  if (prior) return { ...prior, replayed: true };

  const lines = parseCart(input.items);
  const address = parseDeliveryAddress(input.address);
  const note = input.note == null || input.note === "" ? null : String(input.note).trim().slice(0, 300);
  const { dpCoinInr } = coinValuesFromConfig(await getAppConfig(env));

  // Current prices and stock for every line.
  const ph = lines.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT v.id AS variant_id, v.label, v.stock, v.product_id, p.title, p.images, p.price_inr_paise, p.shipping_inr_paise
       FROM shop_variants v JOIN shop_products p ON p.id = v.product_id
      WHERE v.id IN (${ph}) AND v.active = 1 AND p.active = 1`,
  ).bind(...lines.map((l) => l.variantId)).all<any>();
  const byVariant = new Map((rows.results ?? []).map((r) => [r.variant_id, r]));
  let totalCoins = 0;
  let totalPaise = 0;
  const priced = lines.map((l) => {
    const r = byVariant.get(l.variantId);
    if (!r || r.product_id !== l.productId) throw httpsError("not-found", "An item in your cart is no longer available.", "item_unavailable");
    if (Number(r.stock) < l.qty) throw httpsError("failed-precondition", `Only ${r.stock} left of ${r.title} (${r.label}).`, "out_of_stock");
    const unitPaise = Number(r.price_inr_paise) + Number(r.shipping_inr_paise);
    const unit = unitCoins(Number(r.price_inr_paise), Number(r.shipping_inr_paise), dpCoinInr);
    totalCoins += unit * l.qty;
    totalPaise += unitPaise * l.qty;
    return { ...l, r, unit, unitPaise };
  });
  if (Number(input.expectedTotalCoins) !== totalCoins) {
    throw httpsError("failed-precondition", `The total changed to ${totalCoins} DP coin. Please review your cart.`, "price_changed");
  }

  const ledgerId = `shop_order:${id}`;
  // Every line still in stock at the same ₹ price; order not yet written.
  const lineGate = priced
    .map(() => `EXISTS (SELECT 1 FROM shop_variants v JOIN shop_products p ON p.id = v.product_id
                         WHERE v.id = ? AND v.active = 1 AND p.active = 1 AND v.stock >= ?
                           AND p.price_inr_paise = ? AND p.shipping_inr_paise = ?)`)
    .join(" AND ");
  const lineArgs = priced.flatMap((l) => [l.variantId, l.qty, Number(l.r.price_inr_paise), Number(l.r.shipping_inr_paise)]);
  const gate = `NOT EXISTS (SELECT 1 FROM shop_orders WHERE id = ?) AND ${lineGate}`;
  const charged = `EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM shop_orders WHERE id = ?)`;
  const stmts: D1PreparedStatement[] = [
    ...spendStatements(env, { uid, coins: totalCoins, ledgerId, type: "shop_order", description: `Shop order (${priced.length} item${priced.length > 1 ? "s" : ""})`, ts, gate, gateArgs: [id, ...lineArgs] }),
    ...priced.map((l) =>
      env.DB.prepare(`UPDATE shop_variants SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ? AND ${charged}`)
        .bind(l.qty, ts, l.variantId, l.qty, ledgerId, id),
    ),
    ...priced.map((l, i) =>
      env.DB.prepare(
        `INSERT INTO shop_order_items (id, order_id, product_id, variant_id, title, variant_label, image, qty, unit_coins, unit_inr_paise)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${charged}`,
      ).bind(`${id}:${i}`, id, l.productId, l.variantId, l.r.title, l.r.label, json<string[]>(l.r.images, [])[0] ?? null, l.qty, l.unit, l.unitPaise, ledgerId, id),
    ),
    env.DB.prepare(
      `INSERT INTO shop_order_history (id, order_id, from_status, to_status, actor, note, created_at)
       SELECT ?, ?, NULL, 'placed', 'user', NULL, ? WHERE ${charged}`,
    ).bind(`${id}:h0`, id, ts, ledgerId, id),
    // Last: the order row itself, which closes every `charged` gate above.
    env.DB.prepare(
      `INSERT INTO shop_orders (id, uid, status, total_coins, total_inr_paise, dp_coin_inr, address, ledger_id, user_note, created_at, updated_at)
       SELECT ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ? WHERE ${charged}`,
    ).bind(id, uid, totalCoins, totalPaise, dpCoinInr, JSON.stringify(address), ledgerId, note, ts, ts, ledgerId, id),
  ];
  const results = await env.DB.batch(stmts);
  if (Number(results[results.length - 1]?.meta?.changes || 0) === 0) {
    const raced = await loadOrder(env, id, uid);
    if (raced) return { ...raced, replayed: true };
    const bal = await env.DB.prepare(`SELECT dpcoin - locked_coins AS dp FROM users WHERE uid = ?`).bind(uid).first<any>();
    if (bal && Number(bal.dp) < totalCoins) {
      throw httpsError("failed-precondition", `Not enough DP coin: this order costs ${totalCoins} DP coin.`, "insufficient_coins");
    }
    throw httpsError("failed-precondition", "Stock or price changed while ordering. Please review your cart.", "price_changed");
  }
  return (await loadOrder(env, id, uid))!;
}

/**
 * Move an order to `to`, writing history, and refund DP coin + restock where
 * the move requires. Exactly once: everything is gated on the current status.
 */
export async function transitionOrder(
  env: Env,
  orderId: string,
  to: OrderStatus,
  opts: { actor: string; from: OrderStatus[]; note?: string | null; carrier?: string | null; trackingNumber?: string | null; trackingUrl?: string | null; restock?: boolean },
  ts = Date.now(),
): Promise<void> {
  const o = await env.DB.prepare(`SELECT * FROM shop_orders WHERE id = ?`).bind(orderId).first<any>();
  if (!o) throw httpsError("not-found", "Order not found.");
  if (!opts.from.includes(o.status)) throw httpsError("failed-precondition", `A ${o.status} order can't move to ${to}.`);
  const live = `EXISTS (SELECT 1 FROM shop_orders WHERE id = ? AND status = ?)`;
  const stmts: D1PreparedStatement[] = [];
  const refund = REFUNDING.includes(to);
  const refundLedgerId = `shop_refund:${orderId}`;
  if (refund) {
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
         SELECT ?, ?, ?, 'shop_refund', ?, ?, 0 WHERE ${live}`,
      ).bind(refundLedgerId, o.uid, Number(o.total_coins), `Shop refund (${to})`, ts, orderId, o.status),
      env.DB.prepare(
        `UPDATE users SET dpcoin = dpcoin + ?, updated_at = ?
          WHERE uid = ? AND ${live} AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)`,
      ).bind(Number(o.total_coins), ts, o.uid, orderId, o.status, refundLedgerId),
    );
    if (to === "cancelled" || opts.restock) {
      stmts.push(
        env.DB.prepare(
          `UPDATE shop_variants SET stock = stock + COALESCE((SELECT SUM(i.qty) FROM shop_order_items i WHERE i.order_id = ? AND i.variant_id = shop_variants.id), 0), updated_at = ?
            WHERE id IN (SELECT variant_id FROM shop_order_items WHERE order_id = ?) AND ${live}`,
        ).bind(orderId, ts, orderId, orderId, o.status),
      );
    }
  }
  stmts.push(
    env.DB.prepare(
      `INSERT INTO shop_order_history (id, order_id, from_status, to_status, actor, note, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${live}`,
    ).bind(crypto.randomUUID(), orderId, o.status, to, opts.actor, opts.note ?? null, ts, orderId, o.status),
    env.DB.prepare(
      `UPDATE shop_orders SET status = ?, updated_at = ?,
              carrier = COALESCE(?, carrier), tracking_number = COALESCE(?, tracking_number), tracking_url = COALESCE(?, tracking_url),
              delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
              refund_ledger_id = CASE WHEN ? THEN ? ELSE refund_ledger_id END
        WHERE id = ? AND status = ?`,
    ).bind(to, ts, opts.carrier ?? null, opts.trackingNumber ?? null, opts.trackingUrl ?? null, to, ts, refund ? 1 : 0, refundLedgerId, orderId, o.status),
  );
  const results = await env.DB.batch(stmts);
  if (Number(results[results.length - 1]?.meta?.changes || 0) === 0) {
    throw httpsError("failed-precondition", "The order changed meanwhile. Reload and try again.");
  }
}

/** Validate an admin product upsert (with variants). */
export function validateProductInput(body: any) {
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", m);
  };
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > 120) bad("Title: 2-120 characters.");
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length > 4000) bad("Description: at most 4000 characters.");
  const category = typeof body?.category === "string" && /^[a-z0-9_-]{2,40}$/.test(body.category) ? body.category : "general";
  const images = Array.isArray(body?.images) ? body.images : [];
  if (images.length > 8 || images.some((u: unknown) => typeof u !== "string" || !/^https:\/\/\S+$/i.test(u) || u.length > 1000)) {
    bad("Images: up to 8 https URLs.");
  }
  const priceInr = Number(body?.priceInr);
  const shippingInr = Number(body?.shippingInr ?? 0);
  if (!Number.isFinite(priceInr) || priceInr < 1 || priceInr > 1_000_000) bad("Price: ₹1 to ₹10,00,000.");
  if (!Number.isFinite(shippingInr) || shippingInr < 0 || shippingInr > 100_000) bad("Delivery charge: ₹0 to ₹1,00,000.");
  const returnDays = Number(body?.returnDays ?? 7);
  if (!Number.isInteger(returnDays) || returnDays < 0 || returnDays > 60) bad("Return window: 0-60 days.");
  const variants = Array.isArray(body?.variants) && body.variants.length ? body.variants : [{ label: "Standard", stock: 0 }];
  if (variants.length > 30) bad("At most 30 variants.");
  const seen = new Set<string>();
  const parsedVariants = variants.map((v: any) => {
    const label = typeof v?.label === "string" ? v.label.trim() : "";
    if (label.length < 1 || label.length > 60) bad("Variant label: 1-60 characters.");
    if (seen.has(label.toLowerCase())) bad(`Duplicate variant "${label}".`);
    seen.add(label.toLowerCase());
    const stock = Number(v?.stock ?? 0);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) bad("Stock: a whole number ≥ 0.");
    const sku = v?.sku ? String(v.sku).trim().slice(0, 64) : null;
    const vid = v?.id ? String(v.id) : null;
    if (vid && !ID_RE.test(vid)) bad("Invalid variant id.");
    return { id: vid, label, stock, sku, active: v?.active === false ? 0 : 1 };
  });
  const sort = Number(body?.sort ?? 0);
  if (!Number.isInteger(sort)) bad("sort must be a whole number.");
  return {
    title,
    description,
    category,
    images: JSON.stringify(images),
    pricePaise: Math.round(priceInr * 100),
    shippingPaise: Math.round(shippingInr * 100),
    returnDays,
    active: body?.active === true ? 1 : 0,
    featured: body?.featured === true ? 1 : 0,
    sort,
    variants: parsedVariants,
  };
}
