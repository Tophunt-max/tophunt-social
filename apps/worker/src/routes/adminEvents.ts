/**
 * /admin/earning/events — Special events (lib/rewardEvents.ts).
 *
 * Reads: any admin. Writes: full admin + recent sign-in (admin.ts
 * SENSITIVE_ADMIN_ROUTES), audited with before/after. Ending, pausing and
 * archiving never touch Diamonds already paid; an active event's tasks can be
 * edited, but a task id that already has claims cannot be removed or have its
 * reward changed, so the ledger always matches the definition.
 */
import type { Hono } from "hono";
import type { Env, Variables } from "../types";
import { httpsError } from "../lib/http";
import { EVENT_STATUSES, eventStats, phaseOf, rowToEvent, validateEventInput } from "../lib/rewardEvents";
import { isSafeImageUrl } from "../lib/shopHomeConfig";

type Audit = (c: any, action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown>) => Promise<void>;
const ID_RE = /^[a-z0-9_-]{2,40}$/;

export function registerEventRoutes(adminRoute: Hono<{ Bindings: Env; Variables: Variables }>, requireFullAdmin: (c: any) => void, logAudit: Audit) {
  adminRoute.get("/earning/events", async (c) => {
    const rows = await c.env.DB.prepare(`SELECT * FROM reward_events ORDER BY (status = 'archived'), starts_at DESC LIMIT 200`).all<any>();
    const events = (rows.results ?? []).map(rowToEvent);
    const stats = await eventStats(c.env, events.map((e) => e.id));
    const now = Date.now();
    return c.json({ statuses: EVENT_STATUSES, events: events.map((e) => ({ ...e, phase: phaseOf(e, now), stats: stats.get(e.id) })) });
  });

  adminRoute.put("/earning/events/:id", async (c) => {
    requireFullAdmin(c);
    const id = c.req.param("id");
    if (!ID_RE.test(id)) throw httpsError("invalid-argument", "Event id: 2-40 lowercase letters, digits, _ or -.");
    const b = await c.req.json<any>().catch(() => ({}));
    const v = validateEventInput(b, isSafeImageUrl);
    const beforeRow = await c.env.DB.prepare(`SELECT * FROM reward_events WHERE id = ?`).bind(id).first<any>();
    if (beforeRow && b.create === true) throw httpsError("already-exists", `An event with id "${id}" already exists.`);
    const before = beforeRow ? rowToEvent(beforeRow) : null;
    if (before) {
      const paid = await c.env.DB.prepare(`SELECT task_id, COALESCE(SUM(coins), 0) AS s FROM reward_event_claims WHERE event_id = ? GROUP BY task_id`).bind(id).all<any>();
      for (const r of paid.results ?? []) {
        const now = v.tasks.find((t) => t.id === r.task_id);
        const was = before.tasks.find((t) => t.id === r.task_id);
        if (!now) throw httpsError("failed-precondition", `Task "${r.task_id}" already has claims; it cannot be removed. Turn the event off instead.`);
        if (was && (now.coins !== was.coins || now.metric !== was.metric || now.target !== was.target)) {
          throw httpsError("failed-precondition", `Task "${r.task_id}" already has claims; its metric, target and Diamonds are locked.`);
        }
      }
      if (v.totalBudget != null) {
        const total = (paid.results ?? []).reduce((s: number, r: any) => s + Number(r.s), 0);
        if (v.totalBudget < total) throw httpsError("invalid-argument", `Budget cannot be below the ${total} Diamonds already claimed.`);
      }
    }
    const ts = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO reward_events (id, title, description, banner_url, status, starts_at, ends_at, min_level, min_account_age_days, require_verified, total_budget, tasks, sort, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET title = excluded.title, description = excluded.description, banner_url = excluded.banner_url,
         status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, min_level = excluded.min_level,
         min_account_age_days = excluded.min_account_age_days, require_verified = excluded.require_verified,
         total_budget = excluded.total_budget, tasks = excluded.tasks, sort = excluded.sort, updated_at = excluded.updated_at`,
    ).bind(id, v.title, v.description, v.bannerUrl, v.status, v.startsAt, v.endsAt, v.minLevel, v.minAccountAgeDays, v.requireVerified ? 1 : 0,
      v.totalBudget, JSON.stringify(v.tasks), v.sort, c.get("user")?.uid ?? "server", ts, ts).run();
    await logAudit(c, before ? "earning.event.update" : "earning.event.create", "reward_event", id, { before, after: v });
    return c.json({ success: true, id });
  });

  /** Participants of one event with their claims (paged, newest first). */
  adminRoute.get("/earning/events/:id/participants", async (c) => {
    const id = c.req.param("id");
    const rows = await c.env.DB.prepare(
      `SELECT p.uid, u.username, p.joined_at,
              (SELECT COUNT(*) FROM reward_event_claims k WHERE k.event_id = p.event_id AND k.uid = p.uid) AS claims,
              (SELECT COALESCE(SUM(coins), 0) FROM reward_event_claims k WHERE k.event_id = p.event_id AND k.uid = p.uid) AS diamonds
         FROM reward_event_participants p LEFT JOIN users u ON u.uid = p.uid
        WHERE p.event_id = ? ORDER BY p.joined_at DESC LIMIT 200`,
    ).bind(id).all<any>();
    return c.json((rows.results ?? []).map((r) => ({ uid: r.uid, username: r.username, joinedAt: Number(r.joined_at), claims: Number(r.claims), diamonds: Number(r.diamonds) })));
  });
}
