/**
 * Virtual gifts: a user spends coins to send a gift to another user.
 *
 * Money rules:
 *  - The sender's DP coin is spent (never Diamonds, lib/coinSpend.ts). The
 *    recipient receives a gift record and a notification, NOT coins. Nothing
 *    here creates a balance payable to the recipient; `creator_share_bps` is a
 *    snapshot for future reporting only (see MONETIZATION.md, creator payouts).
 *  - Price is read from the server catalogue and re-checked inside the debit
 *    transaction. The client sends the price it showed (`expectedUnitPrice`) and
 *    the send is refused if it no longer matches, so the user is never charged
 *    a price they did not see.
 *  - `requestId` (client generated, one per tap) makes the send idempotent: the
 *    row id is `gift:<sender>:<requestId>`, and a retry returns the original
 *    result without charging again.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { assertCoinAmount } from "./money";
import { isHiddenAccountStatus } from "./accountStatus";
import { isBlockedBetween } from "./blocks";
import { LOCKED_SPENT_OF, spendStatements, validRequestId } from "./coinSpend";
import { parseMonetizationConfig } from "./monetizationConfig";
import { getAppConfig } from "./settings";

export const GIFT_CATEGORIES = ["reaction", "flower", "premium", "festival", "creator", "seasonal", "limited"] as const;
export const GIFT_CONTEXTS = ["profile", "match", "story"] as const;
export const GIFT_ID_RE = /^[a-z0-9_-]{2,40}$/;

export interface GiftRow {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCoins: number;
  asset: Record<string, unknown>;
  animation: Record<string, unknown>;
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
  sort: number;
}

const json = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  try {
    const o = JSON.parse(String(v ?? "{}"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};

export function toGift(r: any): GiftRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    category: r.category,
    priceCoins: Number(r.price_coins),
    asset: json(r.asset),
    animation: json(r.animation),
    active: !!r.active,
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    sort: Number(r.sort) || 0,
  };
}

const LIVE_GIFT_SQL = `active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?)`;

/** Gifts a user can send right now, in display order. */
export async function listLiveGifts(env: Env, ts = Date.now()): Promise<GiftRow[]> {
  const rows = await env.DB.prepare(`SELECT * FROM virtual_gifts WHERE ${LIVE_GIFT_SQL} ORDER BY sort, price_coins, id`)
    .bind(ts, ts)
    .all<any>();
  return (rows.results ?? []).map(toGift);
}

export interface GiftSendResult {
  id: string;
  giftId: string;
  giftName: string;
  quantity: number;
  totalCoins: number;
  diamondsSpent: number;
  recipientUid: string;
  createdAt: number;
  replayed: boolean;
}

function toResult(r: any, replayed: boolean): GiftSendResult {
  return {
    id: r.id,
    giftId: r.gift_id,
    giftName: r.gift_name,
    quantity: Number(r.quantity),
    totalCoins: Number(r.total_coins),
    diamondsSpent: Number(r.locked_spent),
    recipientUid: r.recipient_uid,
    createdAt: Number(r.created_at),
    replayed,
  };
}

export interface SendGiftInput {
  recipientUid: unknown;
  giftId: unknown;
  quantity?: unknown;
  expectedUnitPrice: unknown;
  requestId: unknown;
  contextType?: unknown;
  contextId?: unknown;
}

export async function sendGift(env: Env, senderUid: string, input: SendGiftInput, ts = Date.now()): Promise<GiftSendResult> {
  const cfg = parseMonetizationConfig(await getAppConfig(env));
  if (!cfg.gifts.enabled) throw httpsError("failed-precondition", "Gifts are not available right now.", "gifts_disabled");

  if (!validRequestId(input.requestId)) throw httpsError("invalid-argument", "requestId is required (8-64 letters, digits, - or _).");
  const id = `gift:${senderUid}:${input.requestId}`;

  // Replay: the original result, never a second charge.
  const prior = await env.DB.prepare(`SELECT * FROM gift_transactions WHERE id = ?`).bind(id).first<any>();
  if (prior) return toResult(prior, true);

  const recipientUid = typeof input.recipientUid === "string" ? input.recipientUid : "";
  if (!recipientUid || recipientUid.length > 128) throw httpsError("invalid-argument", "recipientUid is required.");
  if (recipientUid === senderUid) throw httpsError("invalid-argument", "You can't send a gift to yourself.");
  const giftId = typeof input.giftId === "string" && GIFT_ID_RE.test(input.giftId) ? input.giftId : null;
  if (!giftId) throw httpsError("invalid-argument", "giftId is invalid.");
  const quantity = input.quantity === undefined ? 1 : Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > cfg.gifts.maxQuantity) {
    throw httpsError("invalid-argument", `quantity must be a whole number from 1 to ${cfg.gifts.maxQuantity}.`);
  }
  const contextType = input.contextType == null ? "profile" : String(input.contextType);
  if (!(GIFT_CONTEXTS as readonly string[]).includes(contextType)) throw httpsError("invalid-argument", "contextType is invalid.");
  const contextId = input.contextId == null ? null : String(input.contextId).slice(0, 128);

  const recipient = await env.DB.prepare(`SELECT uid, status, is_blocked FROM users WHERE uid = ?`).bind(recipientUid).first<any>();
  if (!recipient || isHiddenAccountStatus(recipient.status) || Number(recipient.is_blocked) === 1 || recipient.status === "blocked") {
    throw httpsError("not-found", "This user can't receive gifts.");
  }
  if (await isBlockedBetween(env, senderUid, recipientUid)) {
    // Same answer as a missing user: a block must not be detectable.
    throw httpsError("not-found", "This user can't receive gifts.");
  }

  const giftRow = await env.DB.prepare(`SELECT * FROM virtual_gifts WHERE id = ? AND ${LIVE_GIFT_SQL}`).bind(giftId, ts, ts).first<any>();
  if (!giftRow) throw httpsError("not-found", "This gift is not available.", "gift_unavailable");
  const gift = toGift(giftRow);
  if (Number(input.expectedUnitPrice) !== gift.priceCoins) {
    throw httpsError("failed-precondition", `The price of ${gift.name} changed to ${gift.priceCoins} coins. Please confirm again.`, "price_changed");
  }
  const total = assertCoinAmount(gift.priceCoins * quantity, "total");
  if (total > cfg.gifts.maxCoinsPerSend) {
    throw httpsError("invalid-argument", `One send can cost at most ${cfg.gifts.maxCoinsPerSend} coins.`);
  }

  const ledgerId = `gift_send:${id}`;
  // Gift still live at the same price, and this request not yet recorded.
  const gate = `NOT EXISTS (SELECT 1 FROM gift_transactions WHERE id = ?)
    AND EXISTS (SELECT 1 FROM virtual_gifts WHERE id = ? AND price_coins = ? AND ${LIVE_GIFT_SQL})`;
  const gateArgs = [id, giftId, gift.priceCoins, ts, ts];
  const results = await env.DB.batch([
    ...spendStatements(env, {
      uid: senderUid,
      coins: total,
      ledgerId,
      type: "gift_send",
      description: `Gift: ${quantity} × ${gift.name}`,
      ts,
      gate,
      gateArgs,
    }),
    env.DB.prepare(
      `INSERT INTO gift_transactions
         (id, sender_uid, recipient_uid, gift_id, gift_name, quantity, unit_price_coins, total_coins,
          locked_spent, ledger_id, context_type, context_id, creator_share_bps, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ${LOCKED_SPENT_OF}, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)
          AND NOT EXISTS (SELECT 1 FROM gift_transactions WHERE id = ?)`,
    ).bind(
      id, senderUid, recipientUid, giftId, gift.name, quantity, gift.priceCoins, total,
      ledgerId, ledgerId, contextType, contextId, cfg.gifts.creatorShareBps, ts,
      ledgerId, id,
    ),
  ]);

  if (Number(results[2]?.meta?.changes || 0) === 0) {
    // A concurrent retry with the same requestId may have won.
    const raced = await env.DB.prepare(`SELECT * FROM gift_transactions WHERE id = ?`).bind(id).first<any>();
    if (raced) return toResult(raced, true);
    const live = await env.DB.prepare(`SELECT price_coins FROM virtual_gifts WHERE id = ? AND ${LIVE_GIFT_SQL}`).bind(giftId, ts, ts).first<any>();
    if (!live) throw httpsError("not-found", "This gift is not available.", "gift_unavailable");
    if (Number(live.price_coins) !== gift.priceCoins) throw httpsError("failed-precondition", "The gift price changed. Please confirm again.", "price_changed");
    throw httpsError("failed-precondition", `Not enough DP coin: this gift costs ${total} DP coin.`, "insufficient_coins");
  }
  const row = await env.DB.prepare(`SELECT * FROM gift_transactions WHERE id = ?`).bind(id).first<any>();
  return toResult(row, false);
}

export interface GiftHistoryItem {
  id: string;
  giftId: string;
  giftName: string;
  quantity: number;
  totalCoins: number;
  counterpartUid: string;
  createdAt: number;
}

/** A user's own sent or received gifts, newest first, cursor = created_at. */
export async function giftHistory(
  env: Env,
  uid: string,
  direction: "sent" | "received",
  before: number | null,
  limit: number,
): Promise<{ items: GiftHistoryItem[]; nextCursor: number | null }> {
  const col = direction === "sent" ? "sender_uid" : "recipient_uid";
  const other = direction === "sent" ? "recipient_uid" : "sender_uid";
  const rows = await env.DB.prepare(
    `SELECT id, gift_id, gift_name, quantity, total_coins, ${other} AS counterpart, created_at
       FROM gift_transactions WHERE ${col} = ? AND created_at < ?
      ORDER BY created_at DESC LIMIT ?`,
  ).bind(uid, before ?? Number.MAX_SAFE_INTEGER, limit + 1).all<any>();
  const list = rows.results ?? [];
  const page = list.slice(0, limit);
  return {
    items: page.map((r) => ({
      id: r.id,
      giftId: r.gift_id,
      giftName: r.gift_name,
      quantity: Number(r.quantity),
      totalCoins: Number(r.total_coins),
      counterpartUid: r.counterpart,
      createdAt: Number(r.created_at),
    })),
    nextCursor: list.length > limit ? Number(page[page.length - 1].created_at) : null,
  };
}

/** Public gift wall for a profile: totals per gift and top supporters' count. */
export async function profileGiftSummary(env: Env, uid: string) {
  const [byGift, totals] = await Promise.all([
    env.DB.prepare(
      `SELECT gift_id, gift_name, SUM(quantity) AS n FROM gift_transactions
        WHERE recipient_uid = ? GROUP BY gift_id, gift_name ORDER BY n DESC LIMIT 12`,
    ).bind(uid).all<any>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS gifts, COUNT(DISTINCT sender_uid) AS supporters
         FROM gift_transactions WHERE recipient_uid = ?`,
    ).bind(uid).first<any>(),
  ]);
  return {
    totalGifts: Number(totals?.gifts || 0),
    supporters: Number(totals?.supporters || 0),
    gifts: (byGift.results ?? []).map((r) => ({ giftId: r.gift_id, name: r.gift_name, count: Number(r.n) })),
  };
}

/** Validate an admin create/update of a gift. Returns DB-ready values. */
export function validateGiftInput(id: string, body: any) {
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", m);
  };
  if (!GIFT_ID_RE.test(id)) bad("Gift id: 2-40 lowercase letters, digits, - or _.");
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 40) bad("Name: 1-40 characters.");
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length > 200) bad("Description: at most 200 characters.");
  const category = String(body?.category ?? "reaction");
  if (!(GIFT_CATEGORIES as readonly string[]).includes(category)) bad(`Category must be one of ${GIFT_CATEGORIES.join(", ")}.`);
  const price = Number(body?.priceCoins);
  if (!Number.isInteger(price) || price < 1 || price > 100_000) bad("Price: a whole number of coins from 1 to 100000.");
  const asset = body?.asset ?? {};
  const animation = body?.animation ?? {};
  for (const [label, v] of [["asset", asset], ["animation", animation]] as const) {
    if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${label} must be an object.`);
    if (JSON.stringify(v).length > 2000) bad(`${label} is too large.`);
  }
  for (const k of ["imageUrl", "lottieUrl"]) {
    const u = (asset as any)[k];
    if (u !== undefined && u !== "" && (typeof u !== "string" || !/^https:\/\/\S+$/i.test(u))) bad(`asset.${k} must be an https URL.`);
  }
  const startsAt = body?.startsAt == null ? null : Number(body.startsAt);
  const endsAt = body?.endsAt == null ? null : Number(body.endsAt);
  if (startsAt !== null && !(Number.isFinite(startsAt) && startsAt > 0)) bad("startsAt must be a time or empty.");
  if (endsAt !== null && !(Number.isFinite(endsAt) && endsAt > 0)) bad("endsAt must be a time or empty.");
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) bad("endsAt must be after startsAt.");
  const sort = Number(body?.sort ?? 0);
  if (!Number.isInteger(sort) || Math.abs(sort) > 100_000) bad("sort must be a whole number.");
  return {
    name,
    description,
    category,
    priceCoins: price,
    asset: JSON.stringify(asset),
    animation: JSON.stringify(animation),
    active: body?.active === false ? 0 : 1,
    startsAt,
    endsAt,
    sort,
  };
}
