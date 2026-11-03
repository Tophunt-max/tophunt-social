/**
 * Shop wishlist: digital store items a user saved for later (migration 0080).
 *
 * Only an item that is an active catalogue item AND has an active store
 * listing can be added. Removing never checks the catalogue, so an entry for
 * an item that was later delisted can always be cleared. Adding and removing
 * are idempotent (INSERT OR IGNORE / DELETE).
 */
import type { Env } from "../types";
import { httpsError } from "./http";

export const WISHLIST_MAX = 200;
const ITEM_ID_RE = /^[a-z0-9_-]{2,40}$/;

export async function getWishlist(env: Env, uid: string): Promise<{ itemIds: string[] }> {
  const rows = await env.DB.prepare(
    `SELECT item_id FROM store_wishlist WHERE uid = ? ORDER BY created_at DESC, item_id LIMIT ?`,
  ).bind(uid, WISHLIST_MAX).all<{ item_id: string }>();
  return { itemIds: (rows.results ?? []).map((r) => r.item_id) };
}

export async function setWishlist(env: Env, uid: string, input: { itemId: unknown; on: unknown }): Promise<{ itemIds: string[] }> {
  const itemId = typeof input.itemId === "string" && ITEM_ID_RE.test(input.itemId) ? input.itemId : null;
  if (!itemId) throw httpsError("invalid-argument", "Invalid item id.");
  if (typeof input.on !== "boolean") throw httpsError("invalid-argument", "`on` must be true or false.");

  if (!input.on) {
    await env.DB.prepare(`DELETE FROM store_wishlist WHERE uid = ? AND item_id = ?`).bind(uid, itemId).run();
    return getWishlist(env, uid);
  }

  const listed = await env.DB.prepare(
    `SELECT 1 FROM reward_catalog r JOIN store_listings l ON l.item_id = r.id
      WHERE r.id = ? AND r.active = 1 AND l.active = 1`,
  ).bind(itemId).first();
  if (!listed) throw httpsError("not-found", "Ye item shop mein nahi hai.", "item_unavailable");

  // The cap is checked in the same statement as the insert, so two concurrent
  // adds cannot both slip past it. An item already on the list is a no-op.
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO store_wishlist (uid, item_id, created_at)
     SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM store_wishlist WHERE uid = ?) < ?
        OR EXISTS (SELECT 1 FROM store_wishlist WHERE uid = ? AND item_id = ?)`,
  ).bind(uid, itemId, Date.now(), uid, WISHLIST_MAX, uid, itemId).run();
  if (!res.meta?.changes) {
    const exists = await env.DB.prepare(`SELECT 1 FROM store_wishlist WHERE uid = ? AND item_id = ?`).bind(uid, itemId).first();
    if (!exists) throw httpsError("resource-exhausted", `Wishlist mein ${WISHLIST_MAX} items tak hi rakh sakte ho.`, "wishlist_full");
  }
  return getWishlist(env, uid);
}
