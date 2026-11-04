/**
 * /admin/earning/* — Earning Management (analytics, CSV export, artwork
 * overrides, audit trail and alerts). Special events live in adminEvents.ts.
 *
 * Every route is full-admin: the numbers are financial. Saving an artwork
 * override is a sensitive action (admin.ts SENSITIVE_ADMIN_ROUTES) and is
 * audited with before / after.
 */
import type { Hono } from "hono";
import type { Env, Variables } from "../types";
import { getDb, schema } from "../db";
import { httpsError } from "../lib/http";
import { getAppConfig, invalidateSetting } from "../lib/settings";
import { getProgression } from "../lib/progression";
import { appConfigChannels, publicAppConfig } from "../lib/appControl";
import { publishMany } from "../lib/publish";
import { edgePurgeUrl } from "../lib/edgeCache";
import { EARNING_ART_FILES, EARNING_ART_KEYS, isEarningAssetUrl, sanitizeEarningAssets } from "../lib/earningAssets";
import { earningAnalytics, earningDailyCsv, earningLedgerCsv, earningWindow } from "../lib/earningAnalytics";

type Audit = (c: any, action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown>) => Promise<void>;
type App = Hono<{ Bindings: Env; Variables: Variables }>;

/** Admin actions that change what users earn, or reverse it. Exact names and prefixes. */
export const EARNING_AUDIT_PREFIXES = ["earning.", "gamification.", "referral.", "promo-budget.", "signup-bonus.", "approval-password.", "xp."];
export const EARNING_AUDIT_ACTIONS = [
  "wallet.adjust",
  "user.streak.update",
  "user.grant",
  "settings.rewards.update",
  ...["coinPricing", "rewardLocking", "freeRewardsBudgetId", "coinAlerts", "coinReport", "referralProgram", "verificationReward"].map((s) => `settings.${s}.update`),
];
const AUDIT_WHERE = `(${EARNING_AUDIT_PREFIXES.map(() => "action LIKE ?").join(" OR ")} OR action IN (${EARNING_AUDIT_ACTIONS.map(() => "?").join(", ")}))`;
const AUDIT_BINDS = [...EARNING_AUDIT_PREFIXES.map((p) => `${p}%`), ...EARNING_AUDIT_ACTIONS];

/** Admin alerts that link to an earning page. */
const ALERT_LINKS = ["/coin-economy%", "/earning%", "/referrals%", "/gamification%"];

const intIn = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const v = parseInt(raw ?? "", 10);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

export function registerEarningRoutes(adminRoute: App, requireFullAdmin: (c: any) => void, logAudit: Audit) {
  const windowOf = async (c: any, max: number) => {
    const days = intIn(c.req.query("days"), 30, 1, max);
    const p = await getProgression(c.env);
    return earningWindow(days, p.settings.dayResetOffsetMinutes);
  };

  // ---- analytics ----
  adminRoute.get("/earning/analytics", async (c) => {
    requireFullAdmin(c);
    return c.json(await earningAnalytics(c.env, await windowOf(c, 90)));
  });

  // ---- CSV export: ?kind=daily|ledger&days= ----
  adminRoute.get("/earning/export", async (c) => {
    requireFullAdmin(c);
    const kind = c.req.query("kind") === "ledger" ? "ledger" : "daily";
    const w = await windowOf(c, kind === "ledger" ? 31 : 90);
    const name = `tophunt-earning-${kind}-${new Date(w.startMs).toISOString().slice(0, 10)}-${w.endDay - w.startDay + 1}d.csv`;
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${name}"`);
    c.header("Cache-Control", "private, no-store");
    if (kind === "ledger") {
      const out = await earningLedgerCsv(c.env, w);
      c.header("X-Rows", String(out.rows));
      c.header("X-Truncated", out.truncated ? "1" : "0");
      await logAudit(c, "earning.export", "csv", kind, { days: w.endDay - w.startDay + 1, rows: out.rows, truncated: out.truncated });
      return c.body(out.csv);
    }
    await logAudit(c, "earning.export", "csv", kind, { days: w.endDay - w.startDay + 1 });
    return c.body(await earningDailyCsv(c.env, w));
  });

  // ---- artwork overrides ----
  adminRoute.get("/earning/assets", async (c) => {
    requireFullAdmin(c);
    const cfg = (await getAppConfig(c.env)) || {};
    const current = sanitizeEarningAssets(cfg.earningAssets, c.env.R2_PUBLIC_BASE_URL);
    return c.json({
      maxBytes: 1024 * 1024,
      types: ["image/webp", "image/png"],
      assets: EARNING_ART_FILES.map(([key, file]) => ({ key, file, group: file.split("/")[0], url: current[key] ?? null })),
    });
  });

  /** Body `{ url }` sets the override (an upload from POST /admin/media/earning-asset); `{ url: null }` resets to the SVG. */
  adminRoute.put("/earning/assets/:key", async (c) => {
    requireFullAdmin(c);
    const key = c.req.param("key");
    if (!EARNING_ART_KEYS.has(key)) throw httpsError("invalid-argument", "Unknown artwork key.");
    const b = await c.req.json<any>().catch(() => ({}));
    const url = b?.url ?? null;
    if (url !== null && !isEarningAssetUrl(url, c.env.R2_PUBLIC_BASE_URL)) {
      throw httpsError("invalid-argument", "Upload the image first (WebP or PNG); only our own earning-assets uploads can be used.");
    }
    const existing = structuredClone((await getAppConfig(c.env)) || {});
    const before = sanitizeEarningAssets(existing.earningAssets, c.env.R2_PUBLIC_BASE_URL);
    const next = { ...before };
    if (url) next[key] = url;
    else delete next[key];
    const merged = { ...existing, earningAssets: next, _version: Math.max(Date.now(), (Number(existing._version) || 0) + 1) };
    const ts = Date.now();
    await getDb(c.env)
      .insert(schema.settings)
      .values({ id: "appConfig", data: merged, updatedAt: ts })
      .onConflictDoUpdate({ target: schema.settings.id, set: { data: merged, updatedAt: ts } });
    await invalidateSetting(c.env, "appConfig");
    edgePurgeUrl(c, "/read/app-config");
    const pushed = publicAppConfig(merged, ts);
    c.executionCtx.waitUntil(publishMany(c.env, appConfigChannels(), { type: "config", config: pushed }));
    await logAudit(c, url ? "earning.asset.update" : "earning.asset.reset", "earning_asset", key, { before: before[key] ?? null, after: url });
    return c.json({ success: true, key, url, version: merged._version });
  });

  // ---- audit trail: ?limit=&before=<createdAt ms>:<id> ----
  adminRoute.get("/earning/audit", async (c) => {
    requireFullAdmin(c);
    const limit = intIn(c.req.query("limit"), 50, 1, 200);
    let ts = Number.MAX_SAFE_INTEGER;
    let id = "\uffff";
    const before = c.req.query("before");
    if (before) {
      const i = before.indexOf(":");
      ts = Number(before.slice(0, i));
      id = before.slice(i + 1);
      if (i <= 0 || !Number.isFinite(ts) || !id) throw httpsError("invalid-argument", "Invalid cursor.");
    }
    const rows = await c.env.DB.prepare(
      `SELECT id, admin_uid, admin_email, action, target_type, target_id, detail, created_at FROM admin_audit_log
        WHERE ${AUDIT_WHERE} AND (created_at < ? OR (created_at = ? AND id < ?))
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(...AUDIT_BINDS, ts, ts, id, limit + 1).all<any>();
    const list = rows.results ?? [];
    const page = list.slice(0, limit);
    const last = page[page.length - 1];
    return c.json({
      items: page.map((r) => ({
        id: r.id,
        adminUid: r.admin_uid,
        adminEmail: r.admin_email,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        detail: (() => {
          try {
            return typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail;
          } catch {
            return r.detail;
          }
        })(),
        createdAt: Number(r.created_at),
      })),
      nextCursor: list.length > limit && last ? `${last.created_at}:${last.id}` : null,
    });
  });

  // ---- earning alerts (admin notifications that link to an earning page) ----
  adminRoute.get("/earning/notifications", async (c) => {
    requireFullAdmin(c);
    const limit = intIn(c.req.query("limit"), 50, 1, 200);
    const rows = await c.env.DB.prepare(
      `SELECT id, title, message, link, is_read, created_at FROM admin_notifications
        WHERE ${ALERT_LINKS.map(() => "link LIKE ?").join(" OR ")}
        ORDER BY created_at DESC LIMIT ?`,
    ).bind(...ALERT_LINKS, limit).all<any>();
    return c.json(
      (rows.results ?? []).map((r) => ({ id: r.id, title: r.title, message: r.message, link: r.link, read: !!r.is_read, createdAt: Number(r.created_at) })),
    );
  });
}
