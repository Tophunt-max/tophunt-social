/**
 * Shop → Shop Assets: list, set, reset and history of the Shop artwork
 * overrides (lib/shopAssets.ts). The upload itself is POST
 * /admin/media/shop-asset?key=… in routes/admin.ts, next to the other media
 * uploads. Mirrors the Rewards Center artwork routes in adminEarning.ts.
 */
import type { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getDb, schema } from "../db";
import { httpsError } from "../lib/http";
import { getAppConfig, invalidateSetting } from "../lib/settings";
import { appConfigChannels, publicAppConfig } from "../lib/appControl";
import { publishMany } from "../lib/publish";
import { edgePurgeUrl } from "../lib/edgeCache";
import {
  SHOP_ASSET_MAX_BYTES,
  SHOP_ASSET_MAX_SIDE,
  SHOP_ASSET_MIME_TYPES,
  SHOP_ASSET_MIN_SIDE,
  SHOP_ICON_FILES,
  SHOP_ICON_KEYS,
  isShopAssetUrl,
  sanitizeShopAssets,
} from "../lib/shopAssets";

type App = Hono<{ Bindings: Env; Variables: Variables }>;
type Audit = (c: any, action: string, targetType: string, targetId: string, detail?: Record<string, unknown>) => Promise<void>;

const ACTIONS = "('shop.asset.update', 'shop.asset.reset')";

export function registerShopAssetRoutes(adminRoute: App, requireFullAdmin: (c: any) => void, logAudit: Audit) {
  adminRoute.get("/shop/assets", async (c) => {
    requireFullAdmin(c);
    const cfg = (await getAppConfig(c.env)) || {};
    const current = sanitizeShopAssets(cfg.shopAssets, c.env.R2_PUBLIC_BASE_URL);
    const recent = await c.env.DB.prepare(
      `SELECT target_id, admin_email, admin_uid, created_at FROM admin_audit_log
        WHERE action IN ${ACTIONS} ORDER BY created_at DESC LIMIT 500`,
    ).all<any>();
    const last = new Map<string, { by: string | null; at: number }>();
    for (const r of recent.results ?? []) if (!last.has(r.target_id)) last.set(r.target_id, { by: r.admin_email || r.admin_uid || null, at: Number(r.created_at) });
    return c.json({
      maxBytes: SHOP_ASSET_MAX_BYTES,
      types: SHOP_ASSET_MIME_TYPES,
      rules: { minSide: SHOP_ASSET_MIN_SIDE, maxSide: SHOP_ASSET_MAX_SIDE, alpha: true },
      assets: SHOP_ICON_FILES.map(([key, file, w, h, tint]) => ({
        key,
        file,
        group: file.split("/")[0],
        aspect: [w, h],
        tint,
        url: current[key] ?? null,
        changedBy: last.get(key)?.by ?? null,
        changedAt: last.get(key)?.at ?? null,
      })),
    });
  });

  /** Body `{ url }` sets the override (an upload from POST /admin/media/shop-asset); `{ url: null }` resets to the bundled WebP. */
  adminRoute.put("/shop/assets/:key", async (c) => {
    requireFullAdmin(c);
    const key = c.req.param("key");
    if (!SHOP_ICON_KEYS.has(key)) throw httpsError("invalid-argument", "Unknown artwork key.");
    const b = await c.req.json<any>().catch(() => ({}));
    const url = b?.url ?? null;
    if (url !== null && !isShopAssetUrl(url, c.env.R2_PUBLIC_BASE_URL)) {
      throw httpsError("invalid-argument", "Upload the image first (WebP or PNG); only our own shop-assets uploads can be used.");
    }
    if (url !== null) {
      const objectKey = url.slice(String(c.env.R2_PUBLIC_BASE_URL).replace(/\/+$/, "").length + 1);
      const head = await c.env.MEDIA.head(objectKey).catch(() => null);
      if (!head) throw httpsError("invalid-argument", "That upload was not found in storage. Upload the image again.");
    }
    const existing = structuredClone((await getAppConfig(c.env)) || {});
    const before = sanitizeShopAssets(existing.shopAssets, c.env.R2_PUBLIC_BASE_URL);
    const next = { ...before };
    if (url) next[key] = url;
    else delete next[key];
    const merged = { ...existing, shopAssets: next, _version: Math.max(Date.now(), (Number(existing._version) || 0) + 1) };
    const ts = Date.now();
    await getDb(c.env)
      .insert(schema.settings)
      .values({ id: "appConfig", data: merged, updatedAt: ts })
      .onConflictDoUpdate({ target: schema.settings.id, set: { data: merged, updatedAt: ts } });
    await invalidateSetting(c.env, "appConfig");
    edgePurgeUrl(c, "/read/app-config");
    const pushed = publicAppConfig(merged, ts);
    c.executionCtx.waitUntil(publishMany(c.env, appConfigChannels(), { type: "config", config: pushed }));
    await logAudit(c, url ? "shop.asset.update" : "shop.asset.reset", "shop_asset", key, { before: before[key] ?? null, after: url });
    return c.json({ success: true, key, url, version: merged._version });
  });

  /** Previous artwork for one key (from the audit trail), so an admin can restore an earlier upload. */
  adminRoute.get("/shop/assets/:key/history", async (c) => {
    requireFullAdmin(c);
    const key = c.req.param("key");
    if (!SHOP_ICON_KEYS.has(key)) throw httpsError("invalid-argument", "Unknown artwork key.");
    const rows = await c.env.DB.prepare(
      `SELECT id, action, admin_email, admin_uid, detail, created_at FROM admin_audit_log
        WHERE action IN ${ACTIONS} AND target_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 30`,
    ).bind(key).all<any>();
    return c.json(
      (rows.results ?? []).map((r) => {
        let d: any = {};
        try {
          d = typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail || {};
        } catch {
          d = {};
        }
        const url = isShopAssetUrl(d?.after, c.env.R2_PUBLIC_BASE_URL) ? d.after : null;
        return { id: r.id, action: r.action, url, by: r.admin_email || r.admin_uid || null, at: Number(r.created_at) };
      }),
    );
  });
}
