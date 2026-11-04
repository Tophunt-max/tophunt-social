/**
 * Shop Collections and Diamond-priced Shop Bundles (migration 0088).
 *
 * Collections: admin-defined groups of catalogue items ("Anime Collection",
 * "Couple Collection") shown in the app Shop home. Display only; each item is
 * still bought through its own DP-coin store listing (lib/store.ts).
 *
 * Bundles: 2-12 catalogue items sold together for a price in DIAMONDS
 * (users.locked_coins, lib/diamonds.ts). Contents are items only: a bundle
 * never pays out DP coin or Diamonds, so it is not a Diamond → DP coin path.
 * A user buys a given bundle once (while that purchase is completed). Items
 * the user already owns are skipped; the price is the same.
 *
 * Buying is ONE D1 batch (bundlePurchaseStatements): Diamond ledger row,
 * balance UPDATE, one inventory grant per item, the sold counter and the
 * purchase row, every statement behind the same gate. Success is decided by
 * the purchase-row insert.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { diamondSpendStatements, validRequestId } from "./coinSpend";
import { DIAMONDS_COVER, NOT_ENOUGH_DIAMONDS, splitBalance } from "./diamonds";
import { BUNDLE_REFUND_REASON_PREFIX, LIVE_LISTING_SQL, STORE_REFUND_REASON_PREFIX } from "./store";
import { parseMonetizationConfig } from "./monetizationConfig";
import { getAppConfig } from "./settings";
import { isSafeImageUrl } from "./shopHomeConfig";

export const STORE_ID_RE = /^[a-z0-9_-]{2,40}$/;
export const COLLECTION_ACCENTS = ["violet", "blue", "plum", "pink", "purple", "gold"] as const;
export type CollectionAccent = (typeof COLLECTION_ACCENTS)[number];
export const BUNDLE_PURCHASE_TYPE = "store_bundle_purchase";
export const BUNDLE_REFUND_TYPE = "store_bundle_refund";
export const BUNDLE_ITEMS = { min: 2, max: 12 } as const;
export const COLLECTION_ITEMS = { min: 1, max: 60 } as const;

const json = (v: unknown) => {
  try {
    const out = typeof v === "string" ? JSON.parse(v) : v ?? {};
    return out && typeof out === "object" ? out : {};
  } catch {
    return {};
  }
};
const jsonList = (v: unknown): string[] => {
  try {
    const out = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(out) ? out.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------- SQL pieces

/** A bundle row `b` that is on sale at `?` (bind ts twice) with at least 2 active items. */
export const LIVE_BUNDLE_SQL = `b.active = 1
  AND (b.starts_at IS NULL OR b.starts_at <= ?) AND (b.ends_at IS NULL OR b.ends_at > ?)
  AND (b.stock_limit IS NULL OR b.sold_count < b.stock_limit)
  AND (SELECT COUNT(*) FROM store_bundle_items bx JOIN reward_catalog rx ON rx.id = bx.item_id
        WHERE bx.bundle_id = b.id AND rx.active = 1) >= 2`;

/**
 * The bundle may grant `itemExpr` to user `?` (bind the uid once): no
 * inventory row, or one revoked by a store / bundle refund. An owned item, or
 * one an admin took away for another reason, is not granted (and counts as
 * "owned" for display).
 */
export const grantableSql = (itemExpr: string) => `NOT EXISTS (SELECT 1 FROM user_inventory gi WHERE gi.uid = ? AND gi.item_id = ${itemExpr}
  AND (gi.revoked_at IS NULL OR (COALESCE(gi.revoke_reason, '') NOT LIKE '${STORE_REFUND_REASON_PREFIX}%'
                                 AND COALESCE(gi.revoke_reason, '') NOT LIKE '${BUNDLE_REFUND_REASON_PREFIX}%')))`;

/** Item ids that are free XP cosmetics (managed under Gamification, never sold). */
const XP40_SQL = `(json_extract(r.asset, '$.collection') = 'xp40'
  OR EXISTS (SELECT 1 FROM xp_cosmetic_unlocks x WHERE x.item_id = r.id AND x.collection = 'xp40'))`;

// ---------------------------------------------------------------- app read

export interface ShopCollectionView {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string | null;
  accent: CollectionAccent;
  itemIds: string[];
}

export interface ShopBundleView {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  badge: string | null;
  priceDiamonds: number;
  compareAtDiamonds: number | null;
  startsAt: number | null;
  endsAt: number | null;
  remaining: number | null;
  items: Array<{ itemId: string; type: string; name: string; rarity: string; asset: Record<string, any>; owned: boolean }>;
  ownedCount: number;
  purchased: boolean;
}

const accentOf = (v: unknown): CollectionAccent =>
  (COLLECTION_ACCENTS as readonly string[]).includes(String(v)) ? (v as CollectionAccent) : "violet";

const compareAtOf = (raw: unknown, price: number): number | null => {
  const v = raw == null ? NaN : Number(raw);
  return Number.isInteger(v) && v > price ? v : null;
};

/** getShopCollections: active collections (live items only) and live bundles with the caller's ownership. */
export async function listShopCollections(env: Env, uid: string, ts = Date.now()): Promise<{ collections: ShopCollectionView[]; bundles: ShopBundleView[] }> {
  const cfg = parseMonetizationConfig(await getAppConfig(env));
  if (!cfg.store.enabled) return { collections: [], bundles: [] };
  const [cols, colItems, bundles, bundleItems] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM store_collections WHERE active = 1 ORDER BY sort, name, id`),
    env.DB.prepare(
      `SELECT ci.collection_id, ci.item_id
         FROM store_collection_items ci
         JOIN store_collections c ON c.id = ci.collection_id AND c.active = 1
         JOIN store_listings l ON l.item_id = ci.item_id
         JOIN reward_catalog r ON r.id = l.item_id
        WHERE ${LIVE_LISTING_SQL}
        ORDER BY ci.collection_id, ci.position, ci.item_id`,
    ).bind(ts, ts),
    env.DB.prepare(
      `SELECT b.*, EXISTS (SELECT 1 FROM store_bundle_purchases p WHERE p.uid = ? AND p.bundle_id = b.id AND p.status = 'completed') AS purchased
         FROM store_bundles b WHERE ${LIVE_BUNDLE_SQL}
        ORDER BY b.sort, b.price_diamonds, b.id`,
    ).bind(uid, ts, ts),
    env.DB.prepare(
      `SELECT bi.bundle_id, bi.item_id, r.type, r.name, r.rarity, r.asset, NOT (${grantableSql("bi.item_id")}) AS owned
         FROM store_bundle_items bi
         JOIN reward_catalog r ON r.id = bi.item_id AND r.active = 1
         JOIN store_bundles b ON b.id = bi.bundle_id
        WHERE ${LIVE_BUNDLE_SQL}
        ORDER BY bi.bundle_id, bi.position, bi.item_id`,
    ).bind(uid, ts, ts),
  ]);

  const idsBy = new Map<string, string[]>();
  for (const r of (colItems.results ?? []) as any[]) {
    const list = idsBy.get(r.collection_id) ?? [];
    list.push(r.item_id);
    idsBy.set(r.collection_id, list);
  }
  const collections = ((cols.results ?? []) as any[])
    .map((c) => ({
      id: c.id,
      name: c.name,
      subtitle: c.subtitle ?? "",
      imageUrl: c.image_url ?? null,
      accent: accentOf(c.accent),
      itemIds: idsBy.get(c.id) ?? [],
    }))
    .filter((c) => c.itemIds.length > 0);

  const itemsBy = new Map<string, ShopBundleView["items"]>();
  for (const r of (bundleItems.results ?? []) as any[]) {
    const list = itemsBy.get(r.bundle_id) ?? [];
    list.push({ itemId: r.item_id, type: r.type, name: r.name, rarity: r.rarity, asset: json(r.asset), owned: !!r.owned });
    itemsBy.set(r.bundle_id, list);
  }
  const out: ShopBundleView[] = ((bundles.results ?? []) as any[]).map((b) => {
    const items = itemsBy.get(b.id) ?? [];
    const price = Number(b.price_diamonds);
    return {
      id: b.id,
      name: b.name,
      description: b.description ?? "",
      imageUrl: b.image_url ?? null,
      badge: b.badge ?? null,
      priceDiamonds: price,
      compareAtDiamonds: compareAtOf(b.compare_at_diamonds, price),
      startsAt: b.starts_at ?? null,
      endsAt: b.ends_at ?? null,
      remaining: b.stock_limit == null ? null : Math.max(0, Number(b.stock_limit) - Number(b.sold_count)),
      items,
      ownedCount: items.filter((i) => i.owned).length,
      purchased: !!b.purchased,
    };
  });
  return { collections, bundles: out };
}

// ---------------------------------------------------------------- purchase

export interface BundlePurchaseResult {
  id: string;
  bundleId: string;
  priceDiamonds: number;
  granted: string[];
  replayed: boolean;
}

const toPurchase = (r: any, replayed: boolean): BundlePurchaseResult => ({
  id: r.id,
  bundleId: r.bundle_id,
  priceDiamonds: Number(r.price_diamonds),
  granted: jsonList(r.granted),
  replayed,
});

export interface BundlePurchasePlan {
  uid: string;
  purchaseId: string;
  bundleId: string;
  bundleName: string;
  priceDiamonds: number;
  /** store_bundles.updated_at read before the batch: any admin edit in between voids the purchase. */
  bundleUpdatedAt: number;
  /** The bundle's item ids as read before the batch (each grant re-checks membership). */
  itemIds: string[];
  ts: number;
}

export const bundleLedgerId = (purchaseId: string) => `${BUNDLE_PURCHASE_TYPE}:${purchaseId}`;

/**
 * The bundle purchase batch, as statements (pure: no I/O). The LAST statement
 * is the purchase-row insert; its `changes` decides success.
 *
 *   gate     no purchase with this id, no completed purchase of this bundle by
 *            the user, the bundle still live at this price and version, and at
 *            least one active bundle item the user can be granted
 *   charged  the ledger row exists and the purchase row does not yet: true
 *            only inside the batch that charged
 */
export function bundlePurchaseStatements(env: Env, p: BundlePurchasePlan): D1PreparedStatement[] {
  const ledgerId = bundleLedgerId(p.purchaseId);
  const gate = `NOT EXISTS (SELECT 1 FROM store_bundle_purchases WHERE id = ?)
    AND NOT EXISTS (SELECT 1 FROM store_bundle_purchases WHERE uid = ? AND bundle_id = ? AND status = 'completed')
    AND EXISTS (SELECT 1 FROM store_bundles b WHERE b.id = ? AND b.price_diamonds = ? AND b.updated_at = ? AND ${LIVE_BUNDLE_SQL})
    AND EXISTS (SELECT 1 FROM store_bundle_items bi JOIN reward_catalog r ON r.id = bi.item_id
                 WHERE bi.bundle_id = ? AND r.active = 1 AND ${grantableSql("bi.item_id")})`;
  const gateArgs = [p.purchaseId, p.uid, p.bundleId, p.bundleId, p.priceDiamonds, p.bundleUpdatedAt, p.ts, p.ts, p.bundleId, p.uid];
  const charged = `EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM store_bundle_purchases WHERE id = ?)`;
  const chargedArgs = [ledgerId, p.purchaseId];
  return [
    ...diamondSpendStatements(env, {
      uid: p.uid,
      diamonds: p.priceDiamonds,
      ledgerId,
      type: BUNDLE_PURCHASE_TYPE,
      description: `Bundle: ${p.bundleName}`,
      ts: p.ts,
      gate,
      gateArgs,
    }),
    ...p.itemIds.map((itemId) =>
      env.DB.prepare(
        `INSERT INTO user_inventory (uid, item_id, source, source_ref, acquired_at)
         SELECT ?, ?, 'store_bundle', ?, ?
          WHERE ${charged}
            AND EXISTS (SELECT 1 FROM store_bundle_items bi JOIN reward_catalog r ON r.id = bi.item_id
                         WHERE bi.bundle_id = ? AND bi.item_id = ? AND r.active = 1)
            AND ${grantableSql("?")}
         ON CONFLICT (uid, item_id) DO UPDATE
            SET revoked_at = NULL, revoke_reason = NULL, source = 'store_bundle', source_ref = excluded.source_ref, acquired_at = excluded.acquired_at
          WHERE user_inventory.revoked_at IS NOT NULL`,
      ).bind(p.uid, itemId, p.purchaseId, p.ts, ...chargedArgs, p.bundleId, itemId, p.uid, itemId),
    ),
    env.DB.prepare(`UPDATE store_bundles SET sold_count = sold_count + 1 WHERE id = ? AND ${charged}`).bind(p.bundleId, ...chargedArgs),
    env.DB.prepare(
      `INSERT INTO store_bundle_purchases (id, uid, bundle_id, bundle_name, price_diamonds, granted, ledger_id, status, created_at)
       SELECT ?, ?, ?, ?, ?,
              (SELECT json_group_array(item_id) FROM (
                 SELECT i.item_id FROM user_inventory i JOIN store_bundle_items bi ON bi.bundle_id = ? AND bi.item_id = i.item_id
                  WHERE i.uid = ? AND i.source_ref = ? AND i.revoked_at IS NULL ORDER BY bi.position, bi.item_id)),
              ?, 'completed', ?
        WHERE ${charged}`,
    ).bind(p.purchaseId, p.uid, p.bundleId, p.bundleName, p.priceDiamonds, p.bundleId, p.uid, p.purchaseId, ledgerId, p.ts, ...chargedArgs),
  ];
}

const invalid = (m: string) => httpsError("invalid-argument", m, "invalid_request");

/**
 * Why a purchase can't go through, in a stable order:
 * already_purchased → bundle_unavailable → price_changed → already_owned → not_enough_diamonds.
 * Returns normally when nothing is wrong (the replay case is handled by the caller).
 */
async function assertCanBuy(env: Env, uid: string, bundleId: string, expectedPrice: number, snapshotUpdatedAt: number | null, ts: number) {
  const bought = await env.DB.prepare(
    `SELECT 1 AS x FROM store_bundle_purchases WHERE uid = ? AND bundle_id = ? AND status = 'completed'`,
  ).bind(uid, bundleId).first();
  if (bought) throw httpsError("already-exists", "Aap yeh bundle pehle hi le chuke ho.", "already_purchased");
  const live = await env.DB.prepare(`SELECT b.price_diamonds, b.updated_at FROM store_bundles b WHERE b.id = ? AND ${LIVE_BUNDLE_SQL}`)
    .bind(bundleId, ts, ts)
    .first<any>();
  if (!live) throw httpsError("not-found", "Yeh bundle abhi available nahi hai.", "bundle_unavailable");
  const price = Number(live.price_diamonds);
  if (price !== expectedPrice) throw httpsError("failed-precondition", `Bundle ka price ab ${price} Diamond hai. Dobara confirm karo.`, "price_changed");
  if (snapshotUpdatedAt !== null && Number(live.updated_at) !== snapshotUpdatedAt) {
    throw httpsError("failed-precondition", "Bundle badal gaya hai. Dobara confirm karo.", "price_changed");
  }
  const missing = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM store_bundle_items bi JOIN reward_catalog r ON r.id = bi.item_id
      WHERE bi.bundle_id = ? AND r.active = 1 AND ${grantableSql("bi.item_id")}`,
  ).bind(bundleId, uid).first<any>();
  if (!Number(missing?.n)) throw httpsError("already-exists", "Is bundle ke saare items aapke paas pehle se hain.", "already_owned");
  const cover = await env.DB.prepare(`SELECT dpcoin, locked_coins, (${DIAMONDS_COVER}) AS ok FROM users WHERE uid = ?`)
    .bind(price, uid)
    .first<any>();
  if (!cover || !cover.ok) {
    const have = splitBalance(cover?.dpcoin, cover?.locked_coins).diamonds;
    throw httpsError(
      "failed-precondition",
      `Itne Diamond nahi hain: is bundle ke liye ${price} Diamond chahiye, aapke paas ${have} hain. Rewards Center se Diamond kamao.`,
      NOT_ENOUGH_DIAMONDS,
    );
  }
}

export async function buyStoreBundle(
  env: Env,
  uid: string,
  input: { bundleId: unknown; expectedPrice: unknown; requestId: unknown },
  ts = Date.now(),
): Promise<BundlePurchaseResult> {
  const cfg = parseMonetizationConfig(await getAppConfig(env));
  if (!cfg.store.enabled) throw httpsError("failed-precondition", "The store is not open right now.", "store_disabled");
  if (!validRequestId(input.requestId)) throw invalid("requestId is required (8-64 letters, digits, - or _).");
  const bundleId = typeof input.bundleId === "string" && STORE_ID_RE.test(input.bundleId) ? input.bundleId : null;
  if (!bundleId) throw invalid("bundleId is invalid.");
  const expected = Number(input.expectedPrice);
  if (!Number.isInteger(expected) || expected < 1) throw invalid("expectedPrice is required.");

  const purchaseId = `bundle:${uid}:${input.requestId}`;
  const prior = await env.DB.prepare(`SELECT * FROM store_bundle_purchases WHERE id = ?`).bind(purchaseId).first<any>();
  if (prior) return toPurchase(prior, true);

  const bundle = await env.DB.prepare(`SELECT id, name, price_diamonds, updated_at FROM store_bundles WHERE id = ?`).bind(bundleId).first<any>();
  if (!bundle) throw httpsError("not-found", "Yeh bundle abhi available nahi hai.", "bundle_unavailable");
  const updatedAt = Number(bundle.updated_at);
  await assertCanBuy(env, uid, bundleId, expected, updatedAt, ts);

  const items = await env.DB.prepare(`SELECT item_id FROM store_bundle_items WHERE bundle_id = ? ORDER BY position, item_id`).bind(bundleId).all<any>();
  const results = await env.DB.batch(
    bundlePurchaseStatements(env, {
      uid,
      purchaseId,
      bundleId,
      bundleName: String(bundle.name),
      priceDiamonds: expected,
      bundleUpdatedAt: updatedAt,
      itemIds: (items.results ?? []).map((r: any) => String(r.item_id)),
      ts,
    }),
  );
  if (Number(results[results.length - 1]?.meta?.changes || 0) === 0) {
    const raced = await env.DB.prepare(`SELECT * FROM store_bundle_purchases WHERE id = ?`).bind(purchaseId).first<any>();
    if (raced) return toPurchase(raced, true);
    await assertCanBuy(env, uid, bundleId, expected, updatedAt, ts);
    throw httpsError("not-found", "Yeh bundle abhi available nahi hai.", "bundle_unavailable");
  }
  const row = await env.DB.prepare(`SELECT * FROM store_bundle_purchases WHERE id = ?`).bind(purchaseId).first<any>();
  return toPurchase(row, false);
}

// ---------------------------------------------------------------- refund

/**
 * Admin refund: return the Diamonds, revoke only the inventory rows this
 * purchase granted (source_ref = purchase id), unequip them and mark the
 * purchase refunded. Exactly once: every statement is gated on the purchase
 * still being 'completed', and the last one flips it.
 */
export async function refundBundlePurchase(
  env: Env,
  purchaseId: string,
  actor: string,
  reason: string,
  ts = Date.now(),
): Promise<{ refunded: boolean; diamonds: number; uid: string; revoked: string[] }> {
  const p = await env.DB.prepare(`SELECT * FROM store_bundle_purchases WHERE id = ?`).bind(purchaseId).first<any>();
  if (!p) throw httpsError("not-found", "Purchase not found.");
  if (p.status !== "completed") throw httpsError("failed-precondition", "This purchase was already refunded.");
  const granted = jsonList(p.granted);
  const types = granted.length
    ? ((await env.DB.prepare(`SELECT id, type FROM reward_catalog WHERE id IN (${granted.map(() => "?").join(",")})`).bind(...granted).all<any>()).results ?? [])
    : [];
  const refundLedgerId = `${BUNDLE_REFUND_TYPE}:${purchaseId}`;
  const revokeReason = `${BUNDLE_REFUND_REASON_PREFIX}${purchaseId}`;
  const live = `EXISTS (SELECT 1 FROM store_bundle_purchases WHERE id = ? AND status = 'completed')`;
  const diamonds = Number(p.price_diamonds);
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, '${BUNDLE_REFUND_TYPE}', ?, ?, ? WHERE ${live}`,
    ).bind(refundLedgerId, p.uid, diamonds, `Bundle refund: ${p.bundle_name}`, ts, diamonds, purchaseId),
    env.DB.prepare(
      `UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ?
        WHERE uid = ? AND ${live} AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)`,
    ).bind(diamonds, diamonds, ts, p.uid, purchaseId, refundLedgerId),
    env.DB.prepare(
      `UPDATE user_inventory SET revoked_at = ?, revoke_reason = ?
        WHERE uid = ? AND source_ref = ? AND revoked_at IS NULL AND ${live}`,
    ).bind(ts, revokeReason, p.uid, purchaseId, purchaseId),
    // Unequip what was just revoked (cosmetics maps slot type → item id).
    ...types.map((t: any) =>
      env.DB.prepare(
        `UPDATE users SET cosmetics = json_remove(cosmetics, ?)
          WHERE uid = ? AND cosmetics IS NOT NULL AND json_extract(cosmetics, ?) = ? AND ${live}
            AND EXISTS (SELECT 1 FROM user_inventory WHERE uid = ? AND item_id = ? AND revoke_reason = ?)`,
      ).bind(`$.${t.type}`, p.uid, `$.${t.type}`, t.id, purchaseId, p.uid, t.id, revokeReason),
    ),
    env.DB.prepare(
      `UPDATE store_bundle_purchases SET status = 'refunded', refund_ledger_id = ?, refund_reason = ?, refunded_by = ?, refunded_at = ?
        WHERE id = ? AND status = 'completed'`,
    ).bind(refundLedgerId, reason, actor, ts, purchaseId),
  ]);
  const flipped = Number(results[results.length - 1]?.meta?.changes || 0) > 0;
  if (!flipped) throw httpsError("failed-precondition", "This purchase was already refunded.");
  return { refunded: true, diamonds, uid: p.uid, revoked: granted };
}

// ---------------------------------------------------------------- admin validation

type Bad = (m: string) => never;
const badOf: Bad = (m) => {
  throw httpsError("invalid-argument", m);
};

const text = (v: unknown, label: string, [min, max]: [number, number], bad: Bad): string => {
  if (v != null && typeof v !== "string") bad(`${label} must be text.`);
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) bad(min > 0 ? `${label}: ${min}-${max} characters.` : `${label}: at most ${max} characters.`);
  return s;
};
const imageOf = (v: unknown, bad: Bad): string | null => {
  if (v == null || v === "") return null;
  if (!isSafeImageUrl(v)) bad("imageUrl must be an https image URL (upload it from the panel), or empty.");
  return v as string;
};
const intOf = (v: unknown, label: string, bad: Bad): number => {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n)) bad(`${label} must be a whole number.`);
  return n;
};
const boolOf = (v: unknown, label: string, bad: Bad): 0 | 1 => {
  if (typeof v !== "boolean") bad(`${label} must be true or false.`);
  return v ? 1 : 0;
};
const timeOf = (v: unknown, label: string, bad: Bad): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) bad(`${label} must be a time or empty.`);
  return n;
};
const idsOf = (v: unknown, { min, max }: { min: number; max: number }, bad: Bad): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !STORE_ID_RE.test(x))) bad("itemIds must be a list of catalog item ids.");
  const ids = v as string[];
  if (new Set(ids).size !== ids.length) bad("itemIds has the same item more than once.");
  if (ids.length < min || ids.length > max) bad(`Pick ${min}-${max} items (got ${ids.length}).`);
  return ids;
};

export interface CollectionInput {
  name: string;
  subtitle: string;
  imageUrl: string | null;
  accent: CollectionAccent;
  sort: number;
  active: 0 | 1;
  itemIds: string[];
}

export function validateCollectionInput(body: any): CollectionInput {
  const bad = badOf;
  const accent = body?.accent;
  if (!(COLLECTION_ACCENTS as readonly string[]).includes(accent)) bad(`accent must be one of: ${COLLECTION_ACCENTS.join(", ")}.`);
  return {
    name: text(body?.name, "Name", [2, 40], bad),
    subtitle: text(body?.subtitle, "Subtitle", [0, 80], bad),
    imageUrl: imageOf(body?.imageUrl, bad),
    accent,
    sort: intOf(body?.sort, "sort", bad),
    active: boolOf(body?.active, "active", bad),
    itemIds: idsOf(body?.itemIds, COLLECTION_ITEMS, bad),
  };
}

export interface BundleInput {
  name: string;
  description: string;
  imageUrl: string | null;
  badge: string | null;
  priceDiamonds: number;
  compareAtDiamonds: number | null;
  startsAt: number | null;
  endsAt: number | null;
  stockLimit: number | null;
  sort: number;
  active: 0 | 1;
  itemIds: string[];
}

export function validateBundleInput(body: any): BundleInput {
  const bad = badOf;
  const price = Number(body?.priceDiamonds);
  if (!Number.isInteger(price) || price < 1 || price > 1_000_000) bad("Price: a whole number of Diamonds from 1 to 1000000.");
  const cmpRaw = body?.compareAtDiamonds;
  const compareAt = cmpRaw == null || cmpRaw === "" ? null : Number(cmpRaw);
  if (compareAt !== null) {
    if (!Number.isInteger(compareAt) || compareAt > 10_000_000) bad("Original price: a whole number of Diamonds up to 10000000, or empty.");
    if (compareAt <= price) bad(`Original price must be more than the price (${price} Diamonds), or empty.`);
  }
  const startsAt = timeOf(body?.startsAt, "startsAt", bad);
  const endsAt = timeOf(body?.endsAt, "endsAt", bad);
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) bad("endsAt must be after startsAt.");
  const stockRaw = body?.stockLimit;
  const stock = stockRaw == null || stockRaw === "" ? null : Number(stockRaw);
  if (stock !== null && (!Number.isInteger(stock) || stock < 1)) bad("Stock limit: a whole number of at least 1, or empty for unlimited.");
  const badgeRaw = body?.badge;
  const badge = badgeRaw == null || (typeof badgeRaw === "string" && badgeRaw.trim() === "") ? null : text(badgeRaw, "Badge", [1, 16], bad);
  return {
    name: text(body?.name, "Name", [2, 40], bad),
    description: text(body?.description, "Description", [0, 160], bad),
    imageUrl: imageOf(body?.imageUrl, bad),
    badge,
    priceDiamonds: price,
    compareAtDiamonds: compareAt,
    startsAt,
    endsAt,
    stockLimit: stock,
    sort: intOf(body?.sort, "sort", bad),
    active: boolOf(body?.active, "active", bad),
    itemIds: idsOf(body?.itemIds, BUNDLE_ITEMS, bad),
  };
}

/** Every id must be an existing, non-xp40 catalog item (and active, for bundles). */
export async function assertCatalogItems(env: Env, ids: string[], opts: { requireActive: boolean }): Promise<void> {
  const rows = (
    await env.DB.prepare(
      `SELECT r.id, r.active, ${XP40_SQL} AS xp40 FROM reward_catalog r WHERE r.id IN (${ids.map(() => "?").join(",")})`,
    ).bind(...ids).all<any>()
  ).results ?? [];
  const byId = new Map(rows.map((r: any) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw httpsError("invalid-argument", `Unknown catalog item(s): ${missing.join(", ")}.`);
  const xp = ids.filter((id) => byId.get(id).xp40);
  if (xp.length) throw httpsError("invalid-argument", `Free XP cosmetics can't be used here: ${xp.join(", ")}.`);
  if (opts.requireActive) {
    const off = ids.filter((id) => !byId.get(id).active);
    if (off.length) throw httpsError("invalid-argument", `Inactive catalog item(s): ${off.join(", ")}. Turn them on first.`);
  }
}

export const toAdminCollection = (r: any, itemIds: string[]) => ({
  id: r.id,
  name: r.name,
  subtitle: r.subtitle ?? "",
  imageUrl: r.image_url ?? null,
  accent: accentOf(r.accent),
  sort: Number(r.sort ?? 0),
  active: !!r.active,
  itemIds,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export const toAdminBundle = (r: any, itemIds: string[]) => ({
  id: r.id,
  name: r.name,
  description: r.description ?? "",
  imageUrl: r.image_url ?? null,
  badge: r.badge ?? null,
  priceDiamonds: Number(r.price_diamonds),
  compareAtDiamonds: r.compare_at_diamonds == null ? null : Number(r.compare_at_diamonds),
  startsAt: r.starts_at ?? null,
  endsAt: r.ends_at ?? null,
  stockLimit: r.stock_limit ?? null,
  soldCount: Number(r.sold_count ?? 0),
  sort: Number(r.sort ?? 0),
  active: !!r.active,
  itemIds,
  purchases: Number(r.purchases ?? 0),
  diamondsEarned: Number(r.diamonds_earned ?? 0),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});

export const toAdminBundlePurchase = (r: any) => ({
  id: r.id,
  uid: r.uid,
  username: r.username ?? null,
  bundleId: r.bundle_id,
  bundleName: r.bundle_name,
  priceDiamonds: Number(r.price_diamonds),
  granted: jsonList(r.granted),
  status: r.status,
  createdAt: Number(r.created_at),
  refundedAt: r.refunded_at ?? null,
  refundReason: r.refund_reason ?? null,
});
