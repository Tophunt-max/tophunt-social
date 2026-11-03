/**
 * Stickers a user OWNS (reward_catalog type='sticker', user_inventory not
 * revoked) sent in DMs and comments.
 *
 * Only the item id is stored:
 *   - DM: a ChatArchive row of type 'sticker' keeps the id in `media_url` (the
 *     column is free text; no Durable Object schema change);
 *   - comments: `sticker_id` on post / match / blog comments (migration 0083).
 * Readers get `sticker: {id, name, rarity, asset}` resolved from the catalog,
 * so an admin replacing a sticker's artwork updates every message that used it.
 * A sticker sent once stays drawn even if the item is later turned off or the
 * sender's copy is refunded; only sending needs ownership.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { loadCatalog } from "./cosmetics";

export const STICKER_ID_RE = /^[a-z0-9_-]{2,40}$/;
/** Inbox preview / notification text for a sticker-only message. */
export const STICKER_PREVIEW = "🎨 Sticker";

export interface StickerView {
  id: string;
  name: string;
  rarity: string;
  asset: Record<string, unknown>;
}

/** A sticker id from a request body: undefined when absent, else validated. */
export function stickerIdOf(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !STICKER_ID_RE.test(raw)) throw httpsError("invalid-argument", "Invalid sticker.");
  return raw;
}

/** Refuses unless `uid` holds the sticker now and the item is an active sticker. */
export async function assertOwnsSticker(env: Env, uid: string, itemId: string): Promise<StickerView> {
  const row = await env.DB.prepare(
    `SELECT r.id, r.name, r.rarity, r.asset FROM reward_catalog r
       JOIN user_inventory i ON i.item_id = r.id AND i.uid = ? AND i.revoked_at IS NULL
      WHERE r.id = ? AND r.type = 'sticker' AND r.active = 1`,
  ).bind(uid, itemId).first<any>();
  if (!row) throw httpsError("failed-precondition", "You don't own this sticker. Get it in the Shop first.");
  let asset: Record<string, unknown> = {};
  try {
    const v = JSON.parse(String(row.asset ?? "{}"));
    if (v && typeof v === "object" && !Array.isArray(v)) asset = v;
  } catch {
    /* malformed asset: drawn with the fallback */
  }
  return { id: row.id, name: row.name, rarity: row.rarity, asset };
}

/** Catalog views for the given ids (inactive items included: sent stickers stay drawn). */
export async function stickerViews(env: Env, ids: Iterable<string>): Promise<Map<string, StickerView>> {
  const wanted = new Set([...ids].filter(Boolean));
  const out = new Map<string, StickerView>();
  if (!wanted.size) return out;
  for (const i of await loadCatalog(env)) {
    if (wanted.has(i.id) && i.type === "sticker") out.set(i.id, { id: i.id, name: i.name, rarity: i.rarity, asset: i.asset });
  }
  return out;
}

/**
 * DM rows as clients see them: a 'sticker' row exposes `stickerId` + `sticker`
 * and NO `mediaUrl` (the stored value is an item id, not a url).
 */
export async function withMessageStickers<T extends { type?: string | null; mediaUrl?: string | null }>(env: Env, rows: T[]): Promise<T[]> {
  const ids = rows.filter((m) => m.type === "sticker" && m.mediaUrl).map((m) => m.mediaUrl as string);
  if (!ids.length) return rows;
  const views = await stickerViews(env, ids).catch(() => new Map<string, StickerView>());
  return rows.map((m) =>
    m.type === "sticker" ? { ...m, mediaUrl: null, stickerId: m.mediaUrl ?? null, sticker: (m.mediaUrl && views.get(m.mediaUrl)) || null } : m,
  );
}

/** Comment rows with `sticker` resolved from `stickerId`. */
export async function withCommentStickers<T extends { stickerId?: string | null }>(env: Env, rows: T[]): Promise<Array<T & { sticker: StickerView | null }>> {
  const ids = rows.map((r) => r.stickerId).filter((x): x is string => !!x);
  const views = ids.length ? await stickerViews(env, ids).catch(() => new Map<string, StickerView>()) : new Map<string, StickerView>();
  return rows.map((r) => ({ ...r, stickerId: r.stickerId ?? null, sticker: (r.stickerId && views.get(r.stickerId)) || null }));
}
