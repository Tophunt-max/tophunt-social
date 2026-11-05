/**
 * Validation for an admin catalog item write (`reward_catalog`), shared by
 * Gamification → Catalog (PUT /admin/gamification/catalog/:id) and the Shop's
 * Digital items editor (PUT /admin/monetization/store/items/:id), so the two
 * can never accept different shapes. Which of them may write a given row is
 * decided by its owner (CatalogOwner below, migration 0089).
 *
 * Artwork comes in two forms:
 *   - `asset.key`: artwork bundled in the app (`shop.frame_rose_petal`);
 *   - `asset.imageUrl` (+ optional `asset.fxUrl` overlay): a WebP the admin
 *     uploaded through POST /admin/media/shop-item-art. Only URLs on our own
 *     media base under `shop-items/` are accepted, so an item can never point
 *     the app (or the admin panel's <img>) at a third-party host.
 *
 * When both are present the uploaded image wins in the app; the key stays as
 * the fallback for builds that predate uploaded artwork.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { canonicalMediaUrl } from "./r2";
import { SHOP_ITEM_ART_PREFIX } from "./mediaCategories";
import { ITEM_TYPES, RARITIES, type ItemType } from "./cosmetics";

export const ITEM_ID_RE = /^[a-z0-9_-]{2,40}$/;
export const FX_MOTIONS = ["spin", "pulse", "twinkle", "flicker", "drift"] as const;
const ASSET_KEY_RE = /^[a-z][a-z0-9]*\.[a-z0-9_]{1,40}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

export const CATALOG_LIMITS = { name: 60, description: 200, text: 40, assetJson: 2000 } as const;
/** Avatar diameter / frame artwork box. Bundled premium frames are 100/120. */
export const AVATAR_RATIO_RANGE = [0.5, 0.95] as const;

export interface CatalogItemInput {
  type: ItemType;
  name: string;
  description: string;
  rarity: string;
  asset: Record<string, unknown>;
  active: boolean;
  sort: number;
}

const bad = (m: string): never => {
  throw httpsError("invalid-argument", m);
};

/**
 * The canonical form of `url` when it is an uploaded shop-item artwork on our
 * media base, else null. Legacy media hosts are rewritten to the current base.
 */
export function ownedShopArtUrl(env: Env, url: unknown): string | null {
  if (typeof url !== "string" || url.length > 500) return null;
  const base = String(env.R2_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const canonical = canonicalMediaUrl(env, url.trim());
  if (typeof canonical !== "string") return null;
  const prefix = `${base}/${SHOP_ITEM_ART_PREFIX}/`;
  if (!canonical.startsWith(prefix)) return null;
  const rest = canonical.slice(prefix.length);
  // Keys are written by uploadToR2: <yyyy>/<mm>/<uuid>.webp. No query, no traversal.
  if (!/^[0-9]{4}\/[0-9]{2}\/[A-Za-z0-9-]{8,64}\.webp$/.test(rest)) return null;
  try {
    const u = new URL(canonical);
    if (u.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return null;
    if (u.username || u.password) return null;
  } catch {
    return null;
  }
  return canonical;
}

/** Validate and normalise an item body. Throws invalid-argument with a readable message. */
export function validateCatalogItemInput(env: Env, b: any): CatalogItemInput {
  if (!(ITEM_TYPES as readonly string[]).includes(b?.type)) bad(`type must be ${ITEM_TYPES.join(", ")}.`);
  const type = b.type as ItemType;
  if (typeof b.name !== "string" || !b.name.trim() || b.name.trim().length > CATALOG_LIMITS.name) bad(`name is required (max ${CATALOG_LIMITS.name}).`);
  if (b.description !== undefined && b.description !== null && typeof b.description !== "string") bad("description must be text.");
  const description = String(b.description ?? "").trim();
  if (description.length > CATALOG_LIMITS.description) bad(`description: max ${CATALOG_LIMITS.description} characters.`);
  const rarity = String(b.rarity ?? "common");
  if (!(RARITIES as readonly string[]).includes(rarity)) bad(`rarity must be ${RARITIES.join(", ")}.`);
  if (b.sort !== undefined && b.sort !== null && (!Number.isInteger(b.sort) || Math.abs(b.sort) > 1_000_000)) bad("sort must be a whole number.");

  const raw = b.asset ?? {};
  if (typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > CATALOG_LIMITS.assetJson) {
    bad("asset must be a small JSON object (colors, icon, text, animated, artwork).");
  }
  const asset: Record<string, unknown> = { ...raw };

  const colors = asset.colors;
  if (colors !== undefined && (!Array.isArray(colors) || colors.length > 4 || !colors.every((x: unknown) => typeof x === "string" && HEX_RE.test(x)))) {
    bad("asset.colors must be up to 4 #RRGGBB colors.");
  }
  const key = asset.key;
  if (key !== undefined && (typeof key !== "string" || !ASSET_KEY_RE.test(key))) {
    bad("asset.key must be an app asset key like frame.gold or xp40.frame_green_leaf.");
  }
  if (asset.icon !== undefined && (typeof asset.icon !== "string" || !ICON_RE.test(asset.icon))) bad("asset.icon must be an icon name like star or flame.");
  if (asset.color !== undefined && (typeof asset.color !== "string" || !HEX_RE.test(asset.color))) bad("asset.color must be a #RRGGBB color.");
  if (asset.text !== undefined && (typeof asset.text !== "string" || !asset.text.trim() || asset.text.length > CATALOG_LIMITS.text)) {
    bad(`asset.text (the title shown) must be 1-${CATALOG_LIMITS.text} characters.`);
  }
  if (asset.animated !== undefined && typeof asset.animated !== "boolean") bad("asset.animated must be true or false.");
  if (asset.tier !== undefined && asset.tier !== "premium" && asset.tier !== "xp") bad("asset.tier must be premium or xp.");

  // Uploaded artwork. Empty / null clears the field.
  for (const field of ["imageUrl", "fxUrl"] as const) {
    const v = asset[field];
    if (v === undefined) continue;
    if (v === null || v === "") {
      delete asset[field];
      continue;
    }
    const owned = ownedShopArtUrl(env, v);
    if (!owned) bad(`asset.${field} must be a WebP uploaded with "Upload artwork" (our media host, shop-items/).`);
    asset[field] = owned;
  }
  if (asset.fxUrl && !asset.imageUrl) bad("An effect overlay needs a base image (asset.imageUrl).");
  if (asset.fx !== undefined && asset.fx !== null && !(FX_MOTIONS as readonly string[]).includes(String(asset.fx))) {
    bad(`asset.fx must be one of ${FX_MOTIONS.join(", ")}.`);
  }
  if (asset.fx === null) delete asset.fx;
  if (asset.avatarRatio !== undefined && asset.avatarRatio !== null) {
    const r = Number(asset.avatarRatio);
    if (type !== "frame") bad("asset.avatarRatio applies to frames only.");
    if (!Number.isFinite(r) || r < AVATAR_RATIO_RANGE[0] || r > AVATAR_RATIO_RANGE[1]) {
      bad(`asset.avatarRatio must be between ${AVATAR_RATIO_RANGE[0]} and ${AVATAR_RATIO_RANGE[1]}.`);
    }
    asset.avatarRatio = Math.round(r * 1000) / 1000;
  } else {
    delete asset.avatarRatio;
  }
  // The app draws uploaded art as the item's own kind, also where only the
  // asset travels (profile payloads carry {id, name, rarity, asset}).
  if (asset.imageUrl) asset.artKind = type;
  else {
    delete asset.artKind;
    delete asset.fx;
  }

  return {
    type,
    name: b.name.trim(),
    description,
    rarity,
    asset,
    active: b.active !== false,
    sort: Number.isInteger(b.sort) ? b.sort : 0,
  };
}

/** Owners of an item, counting revoked rows: a type change would break their history too. */
export async function itemOwnerCount(env: Env, id: string): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM user_inventory WHERE item_id = ?`).bind(id).first<{ n: number }>();
  return Number(r?.n || 0);
}

/** An item someone already owns keeps its type: a frame turned title would break every equipped slot. */
export async function assertTypeChangeAllowed(env: Env, id: string, beforeType: string | null | undefined, nextType: string): Promise<void> {
  if (!beforeType || beforeType === nextType) return;
  if ((await itemOwnerCount(env, id)) > 0) {
    throw httpsError("failed-precondition", "This item is already owned; its type cannot change. Create a new item instead.");
  }
}

/**
 * Which admin editor owns a catalogue row (reward_catalog.managed_by, migration 0089):
 *   'shop'    — Shopping → Digital items (sold, bundled or Shop-made items);
 *   'earning' — Gamification → Catalog (achievement, season, milestone, grant rewards);
 *   'xp'      — Gamification → XP level rewards (free level unlocks).
 * Each admin write route accepts only its own side, so one row has one editor.
 */
export type CatalogOwner = "shop" | "earning" | "xp";

/** Where an owner's items are edited, for refusal messages. */
export const CATALOG_OWNER_EDITOR: Record<CatalogOwner, string> = {
  shop: "Shopping → Digital items",
  earning: "Gamification → Catalog",
  xp: "Gamification → XP level rewards",
};

/** The row's owner, or null when the id is new. */
export async function catalogOwnerOf(env: Env, id: string): Promise<CatalogOwner | null> {
  const r = await env.DB.prepare(`SELECT managed_by FROM reward_catalog WHERE id = ?`).bind(id).first<{ managed_by: string }>();
  if (!r) return null;
  return r.managed_by === "shop" || r.managed_by === "xp" ? r.managed_by : "earning";
}

/**
 * Refuse a write from the `side` editor to a row another editor owns (a new
 * id has no owner yet). The Shop routes do not call this: they may take over
 * an Earning item by listing it (the row moves to 'shop', so Gamification can
 * no longer edit it) and refuse XP rows themselves.
 */
export function assertCatalogOwner(owner: CatalogOwner | null, side: CatalogOwner): void {
  if (owner === null || owner === side) return;
  throw httpsError("failed-precondition", `This item is managed under ${CATALOG_OWNER_EDITOR[owner]}. Edit it there.`);
}

/** The reward_catalog upsert, as a prepared statement so callers can batch it. `owner` is written on insert and update. */
export function catalogUpsertStatement(env: Env, id: string, v: CatalogItemInput, ts: number, owner: CatalogOwner) {
  return env.DB.prepare(
    `INSERT INTO reward_catalog (id, type, name, description, rarity, asset, active, sort, managed_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET type = excluded.type, name = excluded.name, description = excluded.description,
       rarity = excluded.rarity, asset = excluded.asset, active = excluded.active, sort = excluded.sort,
       managed_by = excluded.managed_by, updated_at = excluded.updated_at`,
  ).bind(id, v.type, v.name, v.description, v.rarity, JSON.stringify(v.asset), v.active ? 1 : 0, v.sort, owner, ts, ts);
}

/** The public catalog read (routes/read.ts /read/gamification/catalog) cache key. */
export const CATALOG_CACHE_KEY = "cache:gamification:catalog";
