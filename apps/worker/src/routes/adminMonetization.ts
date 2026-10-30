/**
 * /admin/monetization/* — ads, sponsorships, gifts, digital store, revenue overview.
 *
 * Registered onto `adminRoute` (routes/admin.ts), so the admin gate and the
 * recent-sign-in gate for writes apply. Every route here also requires a FULL
 * admin: moderators manage content, not money. Every write is audited.
 *
 * Settings (frequency caps, ad units, on/off switches) are NOT written here:
 * they live in `appConfig.monetization` and are saved through
 * `POST /admin/app-settings`, which validates, versions, pushes and audits them.
 */
import type { Hono } from "hono";
import type { Env, Variables } from "../types";
import { httpsError } from "../lib/http";
import { newId } from "../lib/ids";
import { getAppConfig } from "../lib/settings";
import { MONETIZATION_DEFAULTS, parseMonetizationConfig, providerReady } from "../lib/monetizationConfig";
import { adsReport, importRevenueRows, utcDay } from "../lib/adMetrics";
import { GIFT_ID_RE, toGift, validateGiftInput } from "../lib/gifts";
import { refundStorePurchase, validateListingInput } from "../lib/store";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  campaignReport,
  validateCampaignInput,
  type CampaignStatus,
} from "../lib/sponsored";
import { purgeShared } from "../lib/edgeCache";

type Audit = (c: any, action: string, targetType: string, targetId: string | null, detail?: Record<string, unknown>) => Promise<void>;

const actorOf = (c: any): string => c.get("user")?.uid ?? "server";
const ITEM_ID_RE = /^[a-z0-9_-]{2,40}$/;
const DAY_MS = 86_400_000;

/** ?from=&to= as ms; defaults to the last 30 days. */
function range(c: any): { from: number; to: number } {
  const to = Number(c.req.query("to")) || Date.now();
  const from = Number(c.req.query("from")) || to - 30 * DAY_MS;
  if (!(from > 0) || !(to > from) || to - from > 400 * DAY_MS) throw httpsError("invalid-argument", "from/to: a range of at most 400 days.");
  return { from, to };
}

function reasonOf(body: any): string {
  const r = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (r.length < 3 || r.length > 300) throw httpsError("invalid-argument", "A reason (3-300 characters) is required.");
  return r;
}

export function registerMonetizationRoutes(
  adminRoute: Hono<{ Bindings: Env; Variables: Variables }>,
  requireFullAdmin: (c: any) => void,
  logAudit: Audit,
) {
  adminRoute.use("/monetization/*", async (c, next) => {
    requireFullAdmin(c);
    await next();
  });

  // ------------------------------------------------------------ overview

  adminRoute.get("/monetization/overview", async (c) => {
    const { from, to } = range(c);
    const db = c.env.DB;
    const one = async (sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).first<any>()) ?? {};
    const [gifts, store, refunds, coinSales, adRevenue, sponsorship, diag] = await Promise.all([
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(total_coins),0) AS coins, COALESCE(SUM(locked_spent),0) AS diamonds,
                  COUNT(DISTINCT sender_uid) AS senders, COUNT(DISTINCT recipient_uid) AS recipients
             FROM gift_transactions WHERE created_at >= ? AND created_at < ?`, from, to),
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(price_coins),0) AS coins FROM store_purchases WHERE created_at >= ? AND created_at < ?`, from, to),
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(price_coins),0) AS coins FROM store_purchases WHERE status = 'refunded' AND refunded_at >= ? AND refunded_at < ?`, from, to),
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_paise),0) AS paise, COALESCE(SUM(refunded_amount_paise),0) AS refunded_paise
             FROM payment_orders WHERE status = 'paid' AND created_at >= ? AND created_at < ?`, from, to),
      db.prepare(`SELECT currency, status, SUM(revenue_micros) AS micros, SUM(impressions) AS impressions
                    FROM ad_revenue_reports WHERE day BETWEEN ? AND ? GROUP BY currency, status`).bind(utcDay(from), utcDay(to)).all<any>(),
      // Booked = approved/paused/ended campaigns overlapping the range (contract value, not cash collected).
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(budget_paise),0) AS paise,
                  COALESCE(SUM(CASE WHEN payment_ref IS NOT NULL AND payment_ref != '' THEN budget_paise ELSE 0 END),0) AS paid_paise
             FROM sponsored_campaigns WHERE status IN ('approved','paused','ended') AND starts_at < ? AND ends_at > ?`, to, from),
      db.prepare(`SELECT event, SUM(count) AS n FROM ad_event_counters WHERE day BETWEEN ? AND ? GROUP BY event`).bind(utcDay(from), utcDay(to)).all<any>(),
    ]);
    const events = Object.fromEntries((diag.results ?? []).map((r) => [r.event, Number(r.n)]));
    return c.json({
      from,
      to,
      coinSales: {
        orders: Number(coinSales.n), grossInr: Number(coinSales.paise) / 100, refundedInr: Number(coinSales.refunded_paise) / 100,
        note: "Razorpay orders marked paid. Manual deposits are in Coin Economy.",
      },
      gifts: { sends: Number(gifts.n), coins: Number(gifts.coins), diamonds: Number(gifts.diamonds), senders: Number(gifts.senders), recipients: Number(gifts.recipients) },
      store: { purchases: Number(store.n), coins: Number(store.coins), refunds: Number(refunds.n), refundedCoins: Number(refunds.coins) },
      adNetwork: (adRevenue.results ?? []).map((r) => ({ currency: r.currency, status: r.status, revenue: Number(r.micros) / 1_000_000, impressions: Number(r.impressions) })),
      sponsorships: { campaigns: Number(sponsorship.n), bookedInr: Number(sponsorship.paise) / 100, withPaymentRefInr: Number(sponsorship.paid_paise) / 100 },
      adDiagnostics: {
        requests: events.request ?? 0, fills: events.fill ?? 0, impressions: events.impression ?? 0, failures: events.fail ?? 0,
        note: "Counted by the app. Diagnostics only, not revenue.",
      },
    });
  });

  // ------------------------------------------------------------ ads

  adminRoute.get("/monetization/config", async (c) => {
    const cfg = parseMonetizationConfig(await getAppConfig(c.env));
    return c.json({
      effective: cfg,
      defaults: MONETIZATION_DEFAULTS,
      providerReady: providerReady(cfg),
      ssvCallbackPath: "/webhook/admob/ssv",
      unverifiedClientRewards: (c.env as any).ALLOW_UNVERIFIED_AD_REWARDS === "true",
    });
  });

  adminRoute.get("/monetization/ads/report", async (c) => {
    const { from, to } = range(c);
    return c.json(await adsReport(c.env, utcDay(from), utcDay(to)));
  });

  adminRoute.post("/monetization/ads/revenue", async (c) => {
    const body = await c.req.json<any>().catch(() => ({}));
    const n = await importRevenueRows(c.env, body?.rows, actorOf(c));
    await logAudit(c, "ads.revenue.import", "ad_revenue_reports", null, { rows: n, days: [...new Set((body.rows as any[]).map((r) => r.day))].slice(0, 31) });
    return c.json({ imported: n });
  });

  // ------------------------------------------------------------ gifts

  adminRoute.get("/monetization/gifts", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM gift_transactions t WHERE t.gift_id = g.id) AS sends,
              (SELECT COALESCE(SUM(total_coins),0) FROM gift_transactions t WHERE t.gift_id = g.id) AS coins
         FROM virtual_gifts g ORDER BY g.sort, g.id`,
    ).all<any>();
    return c.json((rows.results ?? []).map((r) => ({ ...toGift(r), sends: Number(r.sends), coins: Number(r.coins) })));
  });

  adminRoute.put("/monetization/gifts/:id", async (c) => {
    const id = c.req.param("id");
    if (!GIFT_ID_RE.test(id)) throw httpsError("invalid-argument", "Invalid gift id.");
    const v = validateGiftInput(id, await c.req.json<any>().catch(() => ({})));
    const before = await c.env.DB.prepare(`SELECT * FROM virtual_gifts WHERE id = ?`).bind(id).first<any>();
    const ts = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO virtual_gifts (id, name, description, category, price_coins, asset, animation, active, starts_at, ends_at, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, description = excluded.description, category = excluded.category,
         price_coins = excluded.price_coins, asset = excluded.asset, animation = excluded.animation, active = excluded.active,
         starts_at = excluded.starts_at, ends_at = excluded.ends_at, sort = excluded.sort, updated_at = excluded.updated_at`,
    ).bind(id, v.name, v.description, v.category, v.priceCoins, v.asset, v.animation, v.active, v.startsAt, v.endsAt, v.sort, ts, ts).run();
    await logAudit(c, before ? "gift.update" : "gift.create", "virtual_gift", id, { before: before ? toGift(before) : null, after: v });
    return c.json({ success: true });
  });

  adminRoute.get("/monetization/gifts/stats", async (c) => {
    const { from, to } = range(c);
    const [byDay, topRecipients, topGifts] = await Promise.all([
      c.env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS sends, SUM(total_coins) AS coins
           FROM gift_transactions WHERE created_at >= ? AND created_at < ? GROUP BY day ORDER BY day`,
      ).bind(from, to).all<any>(),
      c.env.DB.prepare(
        `SELECT t.recipient_uid AS uid, u.username, SUM(t.total_coins) AS coins, COUNT(*) AS sends, COUNT(DISTINCT t.sender_uid) AS supporters
           FROM gift_transactions t LEFT JOIN users u ON u.uid = t.recipient_uid
          WHERE t.created_at >= ? AND t.created_at < ? GROUP BY t.recipient_uid ORDER BY coins DESC LIMIT 20`,
      ).bind(from, to).all<any>(),
      c.env.DB.prepare(
        `SELECT gift_id, gift_name, SUM(quantity) AS qty, SUM(total_coins) AS coins FROM gift_transactions
          WHERE created_at >= ? AND created_at < ? GROUP BY gift_id, gift_name ORDER BY coins DESC LIMIT 20`,
      ).bind(from, to).all<any>(),
    ]);
    const shareBps = parseMonetizationConfig(await getAppConfig(c.env)).gifts.creatorShareBps;
    return c.json({
      from, to,
      creatorShareBps: shareBps,
      creatorShareNote: "Informational only. No creator balance or payout exists; see MONETIZATION.md before enabling payouts.",
      byDay: (byDay.results ?? []).map((r) => ({ day: r.day, sends: Number(r.sends), coins: Number(r.coins) })),
      topRecipients: (topRecipients.results ?? []).map((r) => ({ uid: r.uid, username: r.username, coins: Number(r.coins), sends: Number(r.sends), supporters: Number(r.supporters) })),
      topGifts: (topGifts.results ?? []).map((r) => ({ giftId: r.gift_id, name: r.gift_name, quantity: Number(r.qty), coins: Number(r.coins) })),
    });
  });

  // ------------------------------------------------------------ digital store

  adminRoute.get("/monetization/store", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT r.id, r.type, r.name, r.rarity, r.active AS item_active, l.price_coins, l.ownership, l.refundable, l.stock_limit,
              l.sold_count, l.active, l.starts_at, l.ends_at, l.sort,
              (SELECT COUNT(*) FROM user_inventory i WHERE i.item_id = r.id AND i.revoked_at IS NULL) AS owners
         FROM reward_catalog r LEFT JOIN store_listings l ON l.item_id = r.id
        ORDER BY (l.item_id IS NULL), l.sort, r.sort, r.id`,
    ).all<any>();
    return c.json((rows.results ?? []).map((r) => ({
      itemId: r.id, type: r.type, name: r.name, rarity: r.rarity, itemActive: !!r.item_active, owners: Number(r.owners),
      listing: r.price_coins == null ? null : {
        priceCoins: Number(r.price_coins), ownership: r.ownership, refundable: !!r.refundable, stockLimit: r.stock_limit,
        soldCount: Number(r.sold_count), active: !!r.active, startsAt: r.starts_at, endsAt: r.ends_at, sort: Number(r.sort),
      },
    })));
  });

  adminRoute.put("/monetization/store/:itemId", async (c) => {
    const itemId = c.req.param("itemId");
    if (!ITEM_ID_RE.test(itemId)) throw httpsError("invalid-argument", "Invalid item id.");
    const item = await c.env.DB.prepare(`SELECT id FROM reward_catalog WHERE id = ?`).bind(itemId).first();
    if (!item) throw httpsError("not-found", "Catalog item not found. Create it under Gamification → Catalog first.");
    const v = validateListingInput(await c.req.json<any>().catch(() => ({})));
    const before = await c.env.DB.prepare(`SELECT * FROM store_listings WHERE item_id = ?`).bind(itemId).first<any>();
    if (before && v.stockLimit !== null && v.stockLimit < Number(before.sold_count)) {
      throw httpsError("invalid-argument", `Stock limit cannot be below the ${before.sold_count} already sold.`);
    }
    const ts = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO store_listings (item_id, price_coins, ownership, refundable, stock_limit, active, starts_at, ends_at, sort, created_at, updated_at)
       VALUES (?, ?, 'permanent', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (item_id) DO UPDATE SET price_coins = excluded.price_coins, refundable = excluded.refundable,
         stock_limit = excluded.stock_limit, active = excluded.active, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
         sort = excluded.sort, updated_at = excluded.updated_at`,
    ).bind(itemId, v.priceCoins, v.refundable, v.stockLimit, v.active, v.startsAt, v.endsAt, v.sort, ts, ts).run();
    await logAudit(c, before ? "store.listing.update" : "store.listing.create", "store_listing", itemId, { before, after: v });
    return c.json({ success: true });
  });

  adminRoute.get("/monetization/store/purchases", async (c) => {
    const status = c.req.query("status");
    const uid = c.req.query("uid");
    const where: string[] = [];
    const binds: unknown[] = [];
    if (status === "completed" || status === "refunded") { where.push("p.status = ?"); binds.push(status); }
    if (uid) { where.push("p.uid = ?"); binds.push(uid.slice(0, 128)); }
    const rows = await c.env.DB.prepare(
      `SELECT p.*, u.username, r.name AS item_name FROM store_purchases p
         LEFT JOIN users u ON u.uid = p.uid LEFT JOIN reward_catalog r ON r.id = p.item_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.created_at DESC LIMIT 200`,
    ).bind(...binds).all<any>();
    return c.json((rows.results ?? []).map((r) => ({
      id: r.id, uid: r.uid, username: r.username, itemId: r.item_id, itemName: r.item_name, priceCoins: Number(r.price_coins),
      diamondsSpent: Number(r.locked_spent), status: r.status, createdAt: Number(r.created_at), refundedAt: r.refunded_at, refundReason: r.refund_reason,
    })));
  });

  adminRoute.post("/monetization/store/purchases/:id/refund", async (c) => {
    const id = c.req.param("id");
    const reason = reasonOf(await c.req.json<any>().catch(() => ({})));
    const out = await refundStorePurchase(c.env, id, actorOf(c), reason);
    await logAudit(c, "store.purchase.refund", "store_purchase", id, { reason, coins: out.coins });
    return c.json(out);
  });

  // ------------------------------------------------------------ sponsorships

  adminRoute.get("/monetization/advertisers", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT a.*, (SELECT COUNT(*) FROM sponsored_campaigns s WHERE s.advertiser_id = a.id) AS campaigns FROM advertisers a ORDER BY a.name`,
    ).all<any>();
    return c.json((rows.results ?? []).map((r) => ({ id: r.id, name: r.name, contactEmail: r.contact_email, status: r.status, notes: r.notes, campaigns: Number(r.campaigns), createdAt: Number(r.created_at) })));
  });

  const advertiserFields = (body: any) => {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 120) throw httpsError("invalid-argument", "Advertiser name: 2-120 characters.");
    const email = body?.contactEmail ? String(body.contactEmail).trim() : null;
    if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)) throw httpsError("invalid-argument", "Contact email is invalid.");
    const status = body?.status === "suspended" ? "suspended" : "active";
    const notes = body?.notes ? String(body.notes).slice(0, 1000) : null;
    return { name, email, status, notes };
  };

  adminRoute.post("/monetization/advertisers", async (c) => {
    const f = advertiserFields(await c.req.json<any>().catch(() => ({})));
    const id = newId();
    const ts = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO advertisers (id, name, contact_email, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, f.name, f.email, f.status, f.notes, actorOf(c), ts, ts).run();
    await logAudit(c, "advertiser.create", "advertiser", id, f);
    return c.json({ id });
  });

  adminRoute.patch("/monetization/advertisers/:id", async (c) => {
    const id = c.req.param("id");
    const f = advertiserFields(await c.req.json<any>().catch(() => ({})));
    const res = await c.env.DB.prepare(
      `UPDATE advertisers SET name = ?, contact_email = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`,
    ).bind(f.name, f.email, f.status, f.notes, Date.now(), id).run();
    if (!res.meta?.changes) throw httpsError("not-found", "Advertiser not found.");
    await logAudit(c, "advertiser.update", "advertiser", id, f);
    await purgeShared(c, "sponsored:feed");
    return c.json({ success: true });
  });

  adminRoute.get("/monetization/campaigns", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT s.*, a.name AS advertiser_name,
              (SELECT COALESCE(SUM(impressions),0) FROM campaign_daily_stats d WHERE d.campaign_id = s.id) AS impressions,
              (SELECT COALESCE(SUM(clicks),0) FROM campaign_daily_stats d WHERE d.campaign_id = s.id) AS clicks
         FROM sponsored_campaigns s JOIN advertisers a ON a.id = s.advertiser_id ORDER BY s.created_at DESC LIMIT 200`,
    ).all<any>();
    return c.json((rows.results ?? []).map((r) => ({
      id: r.id, advertiserId: r.advertiser_id, advertiser: r.advertiser_name, title: r.title, placement: r.placement, status: r.status,
      startsAt: Number(r.starts_at), endsAt: Number(r.ends_at), pricingModel: r.pricing_model, budgetPaise: Number(r.budget_paise),
      cpmPaise: Number(r.cpm_paise), impressionCap: r.impression_cap, weight: Number(r.weight), creative: JSON.parse(r.creative || "{}"),
      disclosure: r.disclosure, invoiceRef: r.invoice_ref, paymentRef: r.payment_ref, approvedBy: r.approved_by, approvedAt: r.approved_at,
      createdBy: r.created_by, impressions: Number(r.impressions), clicks: Number(r.clicks),
    })));
  });

  adminRoute.post("/monetization/campaigns", async (c) => {
    const v = validateCampaignInput(await c.req.json<any>().catch(() => ({})));
    const adv = await c.env.DB.prepare(`SELECT id FROM advertisers WHERE id = ?`).bind(v.advertiserId).first();
    if (!adv) throw httpsError("not-found", "Advertiser not found.");
    const id = newId();
    const ts = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO sponsored_campaigns
         (id, advertiser_id, title, placement, status, starts_at, ends_at, pricing_model, budget_paise, cpm_paise, impression_cap,
          weight, creative, disclosure, invoice_ref, payment_ref, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'feed', 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, v.advertiserId, v.title, v.startsAt, v.endsAt, v.pricingModel, v.budgetPaise, v.cpmPaise, v.impressionCap,
      v.weight, v.creative, v.disclosure, v.invoiceRef, v.paymentRef, actorOf(c), ts, ts).run();
    await logAudit(c, "campaign.create", "sponsored_campaign", id, { ...v, creative: JSON.parse(v.creative) });
    return c.json({ id });
  });

  /**
   * Edit a campaign. Approved campaigns may only change their billing
   * references; anything a viewer would see needs a new review (pause, edit
   * as draft, resubmit).
   */
  adminRoute.patch("/monetization/campaigns/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<any>().catch(() => ({}));
    const cur = await c.env.DB.prepare(`SELECT * FROM sponsored_campaigns WHERE id = ?`).bind(id).first<any>();
    if (!cur) throw httpsError("not-found", "Campaign not found.");
    const ts = Date.now();
    if (cur.status === "approved" || cur.status === "paused" || cur.status === "ended") {
      const ref = (v: unknown) => (v == null || v === "" ? null : String(v).trim().slice(0, 120));
      await c.env.DB.prepare(`UPDATE sponsored_campaigns SET invoice_ref = ?, payment_ref = ?, updated_at = ? WHERE id = ?`)
        .bind(ref(body.invoiceRef), ref(body.paymentRef), ts, id).run();
      await logAudit(c, "campaign.billing.update", "sponsored_campaign", id, { before: { invoiceRef: cur.invoice_ref, paymentRef: cur.payment_ref }, after: { invoiceRef: ref(body.invoiceRef), paymentRef: ref(body.paymentRef) } });
      return c.json({ success: true, billingOnly: true });
    }
    const v = validateCampaignInput({ ...body, advertiserId: body.advertiserId ?? cur.advertiser_id });
    await c.env.DB.prepare(
      `UPDATE sponsored_campaigns SET advertiser_id = ?, title = ?, starts_at = ?, ends_at = ?, pricing_model = ?, budget_paise = ?, cpm_paise = ?,
         impression_cap = ?, weight = ?, creative = ?, disclosure = ?, invoice_ref = ?, payment_ref = ?, updated_at = ? WHERE id = ?`,
    ).bind(v.advertiserId, v.title, v.startsAt, v.endsAt, v.pricingModel, v.budgetPaise, v.cpmPaise, v.impressionCap, v.weight,
      v.creative, v.disclosure, v.invoiceRef, v.paymentRef, ts, id).run();
    await logAudit(c, "campaign.update", "sponsored_campaign", id, { after: { ...v, creative: JSON.parse(v.creative) } });
    return c.json({ success: true });
  });

  adminRoute.post("/monetization/campaigns/:id/status", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<any>().catch(() => ({}));
    const to = String(body?.status ?? "") as CampaignStatus;
    if (!(CAMPAIGN_STATUSES as readonly string[]).includes(to)) throw httpsError("invalid-argument", "Unknown status.");
    const cur = await c.env.DB.prepare(`SELECT status, created_by FROM sponsored_campaigns WHERE id = ?`).bind(id).first<any>();
    if (!cur) throw httpsError("not-found", "Campaign not found.");
    if (!CAMPAIGN_TRANSITIONS[cur.status as CampaignStatus]?.includes(to)) {
      throw httpsError("failed-precondition", `A ${cur.status} campaign can't move to ${to}.`);
    }
    const actor = actorOf(c);
    // Four-eyes on approval: whoever created a campaign can't approve it,
    // unless they are a superadmin (or the call is server-to-server).
    if (to === "approved" && cur.status === "pending" && actor !== "server" && actor === cur.created_by && c.get("adminRole") !== "superadmin") {
      throw httpsError("permission-denied", "Another admin must approve a campaign you created.");
    }
    const ts = Date.now();
    const res = await c.env.DB.prepare(
      `UPDATE sponsored_campaigns SET status = ?, updated_at = ?,
              approved_by = CASE WHEN ? = 'approved' AND status = 'pending' THEN ? ELSE approved_by END,
              approved_at = CASE WHEN ? = 'approved' AND status = 'pending' THEN ? ELSE approved_at END
        WHERE id = ? AND status = ?`,
    ).bind(to, ts, to, actor, to, ts, id, cur.status).run();
    if (!res.meta?.changes) throw httpsError("failed-precondition", "The campaign changed meanwhile. Reload and try again.");
    await logAudit(c, "campaign.status", "sponsored_campaign", id, { from: cur.status, to, note: typeof body?.note === "string" ? body.note.slice(0, 300) : null });
    await purgeShared(c, "sponsored:feed");
    return c.json({ success: true, status: to });
  });

  adminRoute.get("/monetization/campaigns/:id/report", async (c) => c.json(await campaignReport(c.env, c.req.param("id"))));
}
