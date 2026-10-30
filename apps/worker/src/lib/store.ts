/**
 * Digital store: coin-priced listings over the existing cosmetic catalogue.
 *
 * What an item IS lives in `reward_catalog`, who OWNS it in `user_inventory`
 * (lib/cosmetics.ts). A listing only adds a price and sale rules. Buying one is
 * a single D1 batch: ledger row, balance UPDATE, entitlement, stock counter and
 * the purchase record, all behind the same gate (lib/coinSpend.ts).
 *
 * Only permanent ownership is sold. Time-limited items need an expiry on
 * `user_inventory` that equip and the public profile both honour; that is not
 * built yet, so the schema refuses any other ownership type.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { LOCKED_SPENT_OF, spendStatements, validRequestId } from "./coinSpend";
import { parseMonetizationConfig } from "./monetizationConfig";
import { getAppConfig } from "./settings";

export const STORE_REFUND_REASON_PREFIX = "store_refund:";

const LIVE_LISTING_SQL = `l.active = 1 AND r.active = 1
  AND (l.starts_at IS NULL OR l.starts_at <= ?) AND (l.ends_at IS NULL OR l.ends_at > ?)
  AND (l.stock_limit IS NULL OR l.sold_count < l.stock_limit)`;

const json = (v: unknown) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v ?? {};
  } catch {
    return {};
  }
};

export interface StoreListingView {
  itemId: string;
  type: string;
  name: string;
  description: string;
  rarity: string;
  asset: Record<string, unknown>;
  priceCoins: number;
  ownership: "permanent";
  refundable: boolean;
  /** Remaining stock when the listing is limited; null = unlimited. */
  remaining: number | null;
  endsAt: number | null;
  owned: boolean;
}

/** Live listings, with the caller's ownership. */
export async function listStore(env: Env, uid: string, ts = Date.now()): Promise<StoreListingView[]> {
  const rows = await env.DB.prepare(
    `SELECT l.*, r.type, r.name, r.description, r.rarity, r.asset,
            EXISTS (SELECT 1 FROM user_inventory i WHERE i.uid = ? AND i.item_id = l.item_id AND i.revoked_at IS NULL) AS owned
       FROM store_listings l JOIN reward_catalog r ON r.id = l.item_id
      WHERE ${LIVE_LISTING_SQL}
      ORDER BY l.sort, l.price_coins, l.item_id`,
  ).bind(uid, ts, ts).all<any>();
  return (rows.results ?? []).map((r) => ({
    itemId: r.item_id,
    type: r.type,
    name: r.name,
    description: r.description ?? "",
    rarity: r.rarity,
    asset: json(r.asset),
    priceCoins: Number(r.price_coins),
    ownership: "permanent",
    refundable: !!r.refundable,
    remaining: r.stock_limit == null ? null : Math.max(0, Number(r.stock_limit) - Number(r.sold_count)),
    endsAt: r.ends_at ?? null,
    owned: !!r.owned,
  }));
}

export interface PurchaseResult {
  id: string;
  itemId: string;
  priceCoins: number;
  diamondsSpent: number;
  status: string;
  createdAt: number;
  replayed: boolean;
}

const toPurchase = (r: any, replayed: boolean): PurchaseResult => ({
  id: r.id,
  itemId: r.item_id,
  priceCoins: Number(r.price_coins),
  diamondsSpent: Number(r.locked_spent),
  status: r.status,
  createdAt: Number(r.created_at),
  replayed,
});

/**
 * Not owned (an item revoked by a store refund may be bought again; one
 * revoked by an admin for another reason may not).
 */
const NOT_OWNED_SQL = `NOT EXISTS (SELECT 1 FROM user_inventory i WHERE i.uid = ? AND i.item_id = ?
  AND (i.revoked_at IS NULL OR COALESCE(i.revoke_reason, '') NOT LIKE '${STORE_REFUND_REASON_PREFIX}%'))`;

export async function buyStoreItem(
  env: Env,
  uid: string,
  input: { itemId: unknown; expectedPrice: unknown; requestId: unknown },
  ts = Date.now(),
): Promise<PurchaseResult> {
  const cfg = parseMonetizationConfig(await getAppConfig(env));
  if (!cfg.store.enabled) throw httpsError("failed-precondition", "The store is not open right now.", "store_disabled");
  if (!validRequestId(input.requestId)) throw httpsError("invalid-argument", "requestId is required (8-64 letters, digits, - or _).");
  const id = `store:${uid}:${input.requestId}`;
  const prior = await env.DB.prepare(`SELECT * FROM store_purchases WHERE id = ?`).bind(id).first<any>();
  if (prior) return toPurchase(prior, true);

  const itemId = typeof input.itemId === "string" && /^[a-z0-9_-]{2,40}$/.test(input.itemId) ? input.itemId : null;
  if (!itemId) throw httpsError("invalid-argument", "itemId is invalid.");

  const listing = await env.DB.prepare(
    `SELECT l.price_coins, r.name FROM store_listings l JOIN reward_catalog r ON r.id = l.item_id
      WHERE l.item_id = ? AND ${LIVE_LISTING_SQL}`,
  ).bind(itemId, ts, ts).first<any>();
  if (!listing) throw httpsError("not-found", "This item is not for sale.", "item_unavailable");
  const price = Number(listing.price_coins);
  if (Number(input.expectedPrice) !== price) {
    throw httpsError("failed-precondition", `The price changed to ${price} coins. Please confirm again.`, "price_changed");
  }

  const ledgerId = `store_purchase:${id}`;
  const gate = `NOT EXISTS (SELECT 1 FROM store_purchases WHERE id = ?)
    AND ${NOT_OWNED_SQL}
    AND EXISTS (SELECT 1 FROM store_listings l JOIN reward_catalog r ON r.id = l.item_id
                 WHERE l.item_id = ? AND l.price_coins = ? AND ${LIVE_LISTING_SQL})`;
  const gateArgs = [id, uid, itemId, itemId, price, ts, ts];
  // Everything after the spend is gated on "the ledger row exists and the
  // purchase row does not yet": true only inside the batch that charged.
  const charged = `EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM store_purchases WHERE id = ?)`;
  const results = await env.DB.batch([
    ...spendStatements(env, { uid, coins: price, ledgerId, type: "store_purchase", description: `Store: ${listing.name}`, ts, gate, gateArgs }),
    env.DB.prepare(
      `INSERT INTO user_inventory (uid, item_id, source, source_ref, acquired_at)
       SELECT ?, ?, 'store', ?, ? WHERE ${charged}
       ON CONFLICT (uid, item_id) DO UPDATE
          SET revoked_at = NULL, revoke_reason = NULL, source = 'store', source_ref = excluded.source_ref, acquired_at = excluded.acquired_at
        WHERE user_inventory.revoked_at IS NOT NULL`,
    ).bind(uid, itemId, id, ts, ledgerId, id),
    env.DB.prepare(`UPDATE store_listings SET sold_count = sold_count + 1 WHERE item_id = ? AND ${charged}`).bind(itemId, ledgerId, id),
    env.DB.prepare(
      `INSERT INTO store_purchases (id, uid, item_id, price_coins, locked_spent, ledger_id, status, created_at)
       SELECT ?, ?, ?, ?, ${LOCKED_SPENT_OF}, ?, 'completed', ? WHERE ${charged}`,
    ).bind(id, uid, itemId, price, ledgerId, ledgerId, ts, ledgerId, id),
  ]);

  if (Number(results[4]?.meta?.changes || 0) === 0) {
    const raced = await env.DB.prepare(`SELECT * FROM store_purchases WHERE id = ?`).bind(id).first<any>();
    if (raced) return toPurchase(raced, true);
    const owned = await env.DB.prepare(`SELECT 1 AS x FROM user_inventory i WHERE i.uid = ? AND i.item_id = ? AND i.revoked_at IS NULL`).bind(uid, itemId).first();
    if (owned) throw httpsError("already-exists", "You already own this item.", "already_owned");
    const still = await env.DB.prepare(
      `SELECT l.price_coins FROM store_listings l JOIN reward_catalog r ON r.id = l.item_id WHERE l.item_id = ? AND ${LIVE_LISTING_SQL}`,
    ).bind(itemId, ts, ts).first<any>();
    if (!still) throw httpsError("not-found", "This item is no longer for sale.", "item_unavailable");
    if (Number(still.price_coins) !== price) throw httpsError("failed-precondition", "The price changed. Please confirm again.", "price_changed");
    const revoked = await env.DB.prepare(`SELECT 1 AS x FROM user_inventory WHERE uid = ? AND item_id = ?`).bind(uid, itemId).first();
    if (revoked) throw httpsError("permission-denied", "This item was removed from your account and can't be bought again.", "item_revoked");
    throw httpsError("failed-precondition", `Not enough DP coin: this item costs ${price} DP coin.`, "insufficient_coins");
  }
  const row = await env.DB.prepare(`SELECT * FROM store_purchases WHERE id = ?`).bind(id).first<any>();
  return toPurchase(row, false);
}

/**
 * Admin refund: give back exactly what was spent (the same Diamond / DP coin
 * split), revoke the entitlement, unequip it and mark the purchase refunded.
 * Exactly once: every statement is gated on the purchase still being
 * 'completed', and the last one flips it.
 */
export async function refundStorePurchase(
  env: Env,
  purchaseId: string,
  actor: string,
  reason: string,
  ts = Date.now(),
): Promise<{ refunded: boolean; coins: number }> {
  const p = await env.DB.prepare(
    `SELECT p.*, r.type FROM store_purchases p LEFT JOIN reward_catalog r ON r.id = p.item_id WHERE p.id = ?`,
  ).bind(purchaseId).first<any>();
  if (!p) throw httpsError("not-found", "Purchase not found.");
  if (p.status !== "completed") throw httpsError("failed-precondition", "This purchase was already refunded.");
  const refundLedgerId = `store_refund:${purchaseId}`;
  const live = `EXISTS (SELECT 1 FROM store_purchases WHERE id = ? AND status = 'completed')`;
  const coins = Number(p.price_coins);
  const locked = Number(p.locked_spent);
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, 'store_refund', ?, ?, ? WHERE ${live}`,
    ).bind(refundLedgerId, p.uid, coins, `Store refund: ${p.item_id}`, ts, locked, purchaseId),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ?
        WHERE uid = ? AND ${live} AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)`,
    ).bind(coins, locked, ts, p.uid, purchaseId, refundLedgerId),
    env.DB.prepare(
      `UPDATE user_inventory SET revoked_at = ?, revoke_reason = ?
        WHERE uid = ? AND item_id = ? AND revoked_at IS NULL AND source_ref = ? AND ${live}`,
    ).bind(ts, `${STORE_REFUND_REASON_PREFIX}${purchaseId}`, p.uid, p.item_id, purchaseId, purchaseId),
    ...(p.type
      ? [
          env.DB.prepare(
            `UPDATE users SET cosmetics = json_remove(cosmetics, ?)
              WHERE uid = ? AND cosmetics IS NOT NULL AND json_extract(cosmetics, ?) = ? AND ${live}`,
          ).bind(`$.${p.type}`, p.uid, `$.${p.type}`, p.item_id, purchaseId),
        ]
      : []),
    env.DB.prepare(
      `UPDATE store_purchases SET status = 'refunded', refund_ledger_id = ?, refund_reason = ?, refunded_by = ?, refunded_at = ?
        WHERE id = ? AND status = 'completed'`,
    ).bind(refundLedgerId, reason, actor, ts, purchaseId),
  ]);
  const flipped = Number(results[results.length - 1]?.meta?.changes || 0) > 0;
  if (!flipped) throw httpsError("failed-precondition", "This purchase was already refunded.");
  return { refunded: true, coins };
}

/** Validate an admin listing upsert. */
export function validateListingInput(body: any) {
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", m);
  };
  const price = Number(body?.priceCoins);
  if (!Number.isInteger(price) || price < 1 || price > 1_000_000) bad("Price: a whole number of coins from 1 to 1000000.");
  if (body?.ownership !== undefined && body.ownership !== "permanent") bad("Only permanent ownership is supported.");
  const stock = body?.stockLimit == null || body.stockLimit === "" ? null : Number(body.stockLimit);
  if (stock !== null && (!Number.isInteger(stock) || stock < 1)) bad("Stock limit: a whole number, or empty for unlimited.");
  const startsAt = body?.startsAt == null ? null : Number(body.startsAt);
  const endsAt = body?.endsAt == null ? null : Number(body.endsAt);
  if (startsAt !== null && !(startsAt > 0)) bad("startsAt must be a time or empty.");
  if (endsAt !== null && !(endsAt > 0)) bad("endsAt must be a time or empty.");
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) bad("endsAt must be after startsAt.");
  const sort = Number(body?.sort ?? 0);
  if (!Number.isInteger(sort)) bad("sort must be a whole number.");
  return {
    priceCoins: price,
    refundable: body?.refundable === false ? 0 : 1,
    stockLimit: stock,
    active: body?.active === true ? 1 : 0,
    startsAt,
    endsAt,
    sort,
  };
}
