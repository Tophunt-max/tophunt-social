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
import { adPlatformRegistry } from "../lib/adPlatform";
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
import { ADMIN_TRANSITIONS, ORDER_STATUSES, loadOrder, monthStart, shopMonthSpendPaise, transitionOrder, unitCoins, validateProductInput, type OrderStatus } from "../lib/shop";
import { coinValuesFromConfig } from "../lib/coinPricing";
import { RISK_FLAG_LABELS } from "../lib/shopRisk";
import { createNotification } from "../lib/notify";

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
    const [gifts, store, refunds, shop, adRevenue, sponsorship, diag] = await Promise.all([
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(total_coins),0) AS coins, COALESCE(SUM(locked_spent),0) AS diamonds,
                  COUNT(DISTINCT sender_uid) AS senders, COUNT(DISTINCT recipient_uid) AS recipients
             FROM gift_transactions WHERE created_at >= ? AND created_at < ?`, from, to),
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(price_coins),0) AS coins FROM store_purchases WHERE created_at >= ? AND created_at < ?`, from, to),
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(price_coins),0) AS coins FROM store_purchases WHERE status = 'refunded' AND refunded_at >= ? AND refunded_at < ?`, from, to),
      // Physical shop (lib/shop.ts); cancelled / returned orders are not spend.
      one(`SELECT COUNT(*) AS n, COALESCE(SUM(total_coins),0) AS coins, COALESCE(SUM(total_inr_paise),0) AS paise
             FROM shop_orders WHERE status NOT IN ('cancelled','returned') AND created_at >= ? AND created_at < ?`, from, to),
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
      shop: { orders: Number(shop.n), coins: Number(shop.coins), valueInr: Number(shop.paise) / 100 },
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
      // Web rewarded ads pay only when this deploy switch is on (lib/webAdReward.ts).
      webAdRewardsAllowed: (c.env as any).ALLOW_WEB_AD_REWARDS === "true",
      // Slots the app has, network types and limits, for the Ad platform editor.
      adPlatformRegistry: adPlatformRegistry(),
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

  /** reward_catalog.asset is JSON text; a malformed row shows as {} rather than failing the list. */
  const parseAsset = (raw: unknown): Record<string, unknown> => {
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
    try {
      const v = JSON.parse(String(raw ?? "{}"));
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };

  adminRoute.get("/monetization/store", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT r.id, r.type, r.name, r.description, r.rarity, r.asset, r.active AS item_active, l.price_coins, l.ownership, l.refundable, l.stock_limit,
              l.sold_count, l.active, l.starts_at, l.ends_at, l.sort, l.updated_at,
              (SELECT COUNT(*) FROM user_inventory i WHERE i.item_id = r.id AND i.revoked_at IS NULL) AS owners,
              (SELECT COUNT(*) FROM store_purchases p WHERE p.item_id = r.id AND p.status = 'completed') AS purchases,
              (SELECT COALESCE(SUM(p.price_coins), 0) FROM store_purchases p WHERE p.item_id = r.id AND p.status = 'completed') AS revenue
         FROM reward_catalog r LEFT JOIN store_listings l ON l.item_id = r.id
        ORDER BY (l.item_id IS NULL), l.sort, r.sort, r.id`,
    ).all<any>();
    return c.json((rows.results ?? []).map((r) => ({
      itemId: r.id, type: r.type, name: r.name, description: r.description ?? "", rarity: r.rarity, asset: parseAsset(r.asset),
      itemActive: !!r.item_active, owners: Number(r.owners), purchases: Number(r.purchases), revenueCoins: Number(r.revenue),
      listing: r.price_coins == null ? null : {
        priceCoins: Number(r.price_coins), ownership: r.ownership, refundable: !!r.refundable, stockLimit: r.stock_limit,
        soldCount: Number(r.sold_count), active: !!r.active, startsAt: r.starts_at, endsAt: r.ends_at, sort: Number(r.sort),
        updatedAt: r.updated_at == null ? null : Number(r.updated_at),
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

  // ------------------------------------------------------------ physical shop

  adminRoute.get("/monetization/shop/products", async (c) => {
    const { dpCoinInr } = coinValuesFromConfig(await getAppConfig(c.env));
    const [products, variants, sold] = await Promise.all([
      c.env.DB.prepare(`SELECT * FROM shop_products ORDER BY active DESC, sort, created_at DESC`).all<any>(),
      c.env.DB.prepare(`SELECT * FROM shop_variants ORDER BY sort, label`).all<any>(),
      c.env.DB.prepare(
        `SELECT i.product_id, SUM(i.qty) AS units FROM shop_order_items i JOIN shop_orders o ON o.id = i.order_id
          WHERE o.status NOT IN ('cancelled', 'returned') GROUP BY i.product_id`,
      ).all<any>(),
    ]);
    const soldBy = new Map((sold.results ?? []).map((r) => [r.product_id, Number(r.units)]));
    const varsBy = new Map<string, any[]>();
    for (const v of variants.results ?? []) varsBy.set(v.product_id, [...(varsBy.get(v.product_id) ?? []), v]);
    return c.json({
      dpCoinInr,
      products: (products.results ?? []).map((p) => ({
        id: p.id, title: p.title, description: p.description, category: p.category, images: JSON.parse(p.images || "[]"),
        priceInr: Number(p.price_inr_paise) / 100, shippingInr: Number(p.shipping_inr_paise) / 100,
        priceCoins: unitCoins(Number(p.price_inr_paise), Number(p.shipping_inr_paise), dpCoinInr),
        returnDays: Number(p.return_days), active: !!p.active, featured: !!p.featured, sort: Number(p.sort),
        unitsSold: soldBy.get(p.id) ?? 0,
        variants: (varsBy.get(p.id) ?? []).map((v) => ({ id: v.id, label: v.label, sku: v.sku, stock: Number(v.stock), active: !!v.active })),
      })),
    });
  });

  adminRoute.put("/monetization/shop/products/:id", async (c) => {
    const id = c.req.param("id");
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) throw httpsError("invalid-argument", "Product id: 2-64 letters, digits, - or _.");
    const v = validateProductInput(await c.req.json<any>().catch(() => ({})));
    const before = await c.env.DB.prepare(`SELECT * FROM shop_products WHERE id = ?`).bind(id).first<any>();
    const oldVariants = (await c.env.DB.prepare(`SELECT id FROM shop_variants WHERE product_id = ?`).bind(id).all<any>()).results ?? [];
    const ts = Date.now();
    const keep = new Set<string>();
    const stmts: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `INSERT INTO shop_products (id, title, description, category, images, price_inr_paise, shipping_inr_paise, return_days, active, featured, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET title = excluded.title, description = excluded.description, category = excluded.category,
           images = excluded.images, price_inr_paise = excluded.price_inr_paise, shipping_inr_paise = excluded.shipping_inr_paise,
           return_days = excluded.return_days, active = excluded.active, featured = excluded.featured, sort = excluded.sort, updated_at = excluded.updated_at`,
      ).bind(id, v.title, v.description, v.category, v.images, v.pricePaise, v.shippingPaise, v.returnDays, v.active, v.featured, v.sort, ts, ts),
    ];
    v.variants.forEach((vr: any, i: number) => {
      const vid = vr.id && oldVariants.some((o) => o.id === vr.id) ? vr.id : `${id}-${crypto.randomUUID().slice(0, 8)}`;
      keep.add(vid);
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO shop_variants (id, product_id, label, sku, stock, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET label = excluded.label, sku = excluded.sku, stock = excluded.stock, active = excluded.active, sort = excluded.sort, updated_at = excluded.updated_at`,
        ).bind(vid, id, vr.label, vr.sku, vr.stock, vr.active, i, ts, ts),
      );
    });
    // Variants dropped from the form are hidden, never deleted: past orders point at them.
    for (const o of oldVariants) if (!keep.has(o.id)) stmts.push(c.env.DB.prepare(`UPDATE shop_variants SET active = 0, updated_at = ? WHERE id = ?`).bind(ts, o.id));
    await c.env.DB.batch(stmts);
    await logAudit(c, before ? "shop.product.update" : "shop.product.create", "shop_product", id, {
      before: before ? { title: before.title, priceInrPaise: before.price_inr_paise, active: !!before.active } : null,
      after: { title: v.title, priceInrPaise: v.pricePaise, shippingInrPaise: v.shippingPaise, active: !!v.active, variants: v.variants.map((x: any) => ({ label: x.label, stock: x.stock })) },
    });
    return c.json({ success: true });
  });

  adminRoute.get("/monetization/shop/orders", async (c) => {
    const status = c.req.query("status");
    const where: string[] = [];
    const binds: unknown[] = [];
    if (status && (ORDER_STATUSES as readonly string[]).includes(status)) { where.push("o.status = ?"); binds.push(status); }
    if (c.req.query("review") === "pending") where.push("o.review_status = 'pending'");
    const rows = await c.env.DB.prepare(
      `SELECT o.id, o.uid, o.status, o.total_coins, o.total_inr_paise, o.tracking_number, o.created_at, o.updated_at, u.username,
              o.review_status, o.risk_flags,
              (SELECT SUM(qty) FROM shop_order_items i WHERE i.order_id = o.id) AS units,
              (SELECT title FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS title
         FROM shop_orders o LEFT JOIN users u ON u.uid = o.uid
        ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.created_at DESC LIMIT 200`,
    ).bind(...binds).all<any>();
    const counts = await c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM shop_orders GROUP BY status`).all<any>();
    const review = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM shop_orders WHERE review_status = 'pending'`).first<any>();
    return c.json({
      counts: { ...Object.fromEntries((counts.results ?? []).map((r) => [r.status, Number(r.n)])), review_pending: Number(review?.n ?? 0) },
      riskLabels: RISK_FLAG_LABELS,
      orders: (rows.results ?? []).map((r) => ({
        id: r.id, uid: r.uid, username: r.username, status: r.status, totalCoins: Number(r.total_coins), totalInr: Number(r.total_inr_paise) / 100,
        trackingNumber: r.tracking_number, units: Number(r.units), title: r.title, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
        reviewStatus: r.review_status, riskFlags: JSON.parse(r.risk_flags || "[]"),
      })),
    });
  });

  adminRoute.get("/monetization/shop/orders/:id", async (c) => {
    const order = await loadOrder(c.env, c.req.param("id"), null);
    if (!order) throw httpsError("not-found", "Order not found.");
    const owner = await c.env.DB.prepare(
      `SELECT o.uid, o.risk_flags, o.review_status, o.review_note, o.reviewed_at, o.address_fp, o.phone_fp, u.username, u.created_at AS joined,
              (SELECT COUNT(DISTINCT s.uid) FROM shop_orders s WHERE (s.address_fp = o.address_fp OR s.phone_fp = o.phone_fp) AND s.uid != o.uid) AS other_accounts,
              (SELECT COUNT(*) FROM shop_orders s WHERE s.uid = o.uid AND s.status != 'cancelled') AS orders_total
         FROM shop_orders o LEFT JOIN users u ON u.uid = o.uid WHERE o.id = ?`,
    ).bind(order.id).first<any>();
    // While under review the only move is through the review decision (or cancel).
    const next = owner?.review_status === "pending" ? ["cancelled"] : ADMIN_TRANSITIONS[order.status];
    return c.json({
      order, uid: owner?.uid, username: owner?.username, next,
      risk: {
        reviewStatus: owner?.review_status, reviewNote: owner?.review_note, reviewedAt: owner?.reviewed_at,
        flags: JSON.parse(owner?.risk_flags || "[]"), labels: RISK_FLAG_LABELS,
        accountJoined: owner?.joined ? Number(owner.joined) : null, ordersTotal: Number(owner?.orders_total ?? 0),
        otherAccountsOnAddressOrPhone: Number(owner?.other_accounts ?? 0),
      },
    });
  });

  /**
   * Closed-loop trend per UTC day (replaces the old deposits-vs-withdrawals chart):
   * Diamonds earned (free rewards + XP conversion), DP coin won in contests,
   * DP coin spent on gifts / digital items / shop (net of refunds), shop orders.
   */
  adminRoute.get("/monetization/daily", async (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days")) || 14, 1), 90);
    const since = Date.now() - days * DAY_MS;
    const earnTypes = ["daily_reward", "daily_task", "referral_bonus", "verification_bonus", "signup_bonus", "ad_reward", "gamification_reward", "xp_conversion", "monthly_hall_of_fame_reward"];
    const spendTypes = ["gift_send", "store_purchase", "shop_order", "store_refund", "shop_refund"];
    const ph = (a: string[]) => a.map(() => "?").join(",");
    const [ledger, orders] = await Promise.all([
      c.env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day,
                COALESCE(SUM(CASE WHEN type IN (${ph(earnTypes)}) AND locked_delta > 0 THEN locked_delta ELSE 0 END), 0) AS diamonds_earned,
                COALESCE(SUM(CASE WHEN type = 'contest_win_reward' AND amount > 0 THEN amount - locked_delta ELSE 0 END), 0) AS dp_won,
                COALESCE(SUM(CASE WHEN type IN (${ph(spendTypes)}) THEN -amount ELSE 0 END), 0) AS dp_spent
           FROM coin_transactions WHERE created_at >= ? GROUP BY day`,
      ).bind(...earnTypes, ...spendTypes, since).all<any>(),
      c.env.DB.prepare(
        `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n
           FROM shop_orders WHERE created_at >= ? AND status != 'cancelled' GROUP BY day`,
      ).bind(since).all<any>(),
    ]);
    const byDay = new Map<string, any>();
    for (let i = days - 1; i >= 0; i--) {
      const d = utcDay(Date.now() - i * DAY_MS);
      byDay.set(d, { date: d, diamondsEarned: 0, dpCoinWon: 0, dpCoinSpent: 0, orders: 0 });
    }
    for (const r of ledger.results ?? []) {
      const row = byDay.get(r.day);
      if (row) Object.assign(row, { diamondsEarned: Number(r.diamonds_earned), dpCoinWon: Number(r.dp_won), dpCoinSpent: Number(r.dp_spent) });
    }
    for (const r of orders.results ?? []) {
      const row = byDay.get(r.day);
      if (row) row.orders = Number(r.n);
    }
    return c.json([...byDay.values()]);
  });

  /**
   * The three coins in one report (Coin Economy → Overview / XP / Diamond / DP coin):
   *   ⚡ XP       earned by playing; converts to Diamonds (never lowered)
   *   💎 Diamond  earned free (rewards + XP); pays contest entry fees only
   *   🪙 DP coin  won in contests; spent on gifts, digital items, physical shop
   * Superadmin ("house") accounts are excluded from supply, as in Coin Economy.
   */
  adminRoute.get("/monetization/coins", async (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 365);
    const since = Date.now() - days * DAY_MS;
    const db = c.env.DB;
    const notHouse = `COALESCE(role, '') <> 'superadmin'`;
    const [supply, xpConv, byType, shopMonth] = await Promise.all([
      db.prepare(
        `SELECT COALESCE(SUM(xp), 0) AS xp, COALESCE(SUM(COALESCE(xp_converted, 0)), 0) AS xp_converted,
                COALESCE(SUM(locked_coins), 0) AS diamonds, COALESCE(SUM(dpcoin - locked_coins), 0) AS dp,
                COUNT(*) AS users, SUM(CASE WHEN locked_coins > 0 THEN 1 ELSE 0 END) AS diamond_holders,
                SUM(CASE WHEN dpcoin - locked_coins > 0 THEN 1 ELSE 0 END) AS dp_holders
           FROM users WHERE ${notHouse}`,
      ).first<any>(),
      db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(xp_spent), 0) AS xp, COALESCE(SUM(diamonds), 0) AS d, COUNT(DISTINCT uid) AS users FROM xp_conversions WHERE created_at >= ?`).bind(since).first<any>(),
      db.prepare(
        `SELECT type, COUNT(*) AS n, COALESCE(SUM(locked_delta), 0) AS diamonds, COALESCE(SUM(amount - locked_delta), 0) AS dp
           FROM coin_transactions WHERE created_at >= ? AND uid NOT IN (SELECT uid FROM users WHERE role = 'superadmin')
          GROUP BY type`,
      ).bind(since).all<any>(),
      shopMonthSpendPaise(c.env),
    ]);
    const t = new Map((byType.results ?? []).map((r) => [r.type, { n: Number(r.n), diamonds: Number(r.diamonds), dp: Number(r.dp) }]));
    const get = (k: string) => t.get(k) ?? { n: 0, diamonds: 0, dp: 0 };
    const EARN = ["daily_reward", "daily_task", "referral_bonus", "verification_bonus", "signup_bonus", "ad_reward", "gamification_reward", "monthly_hall_of_fame_reward", "xp_conversion", "admin_adjustment"];
    const SPEND = ["gift_send", "store_purchase", "shop_order"];
    const REFUND = ["store_refund", "shop_refund"];
    const cfg = parseMonetizationConfig(await getAppConfig(c.env));
    const values = coinValuesFromConfig(await getAppConfig(c.env));
    const diamondEarned = EARN.map((k) => ({ type: k, count: get(k).n, diamonds: Math.max(0, get(k).diamonds) })).filter((r) => r.count > 0);
    const dpSpent = SPEND.map((k) => ({ type: k, count: get(k).n, dpCoin: -get(k).dp })).filter((r) => r.count > 0);
    const dpRefunded = REFUND.reduce((sum, k) => sum + get(k).dp, 0);
    return c.json({
      days,
      values,
      xp: {
        total: Number(supply?.xp ?? 0),
        converted: Number(supply?.xp_converted ?? 0),
        convertible: Math.max(0, Number(supply?.xp ?? 0) - Number(supply?.xp_converted ?? 0)),
        conversion: cfg.earning.xpConversion,
        period: { conversions: Number(xpConv?.n ?? 0), xpSpent: Number(xpConv?.xp ?? 0), diamonds: Number(xpConv?.d ?? 0), users: Number(xpConv?.users ?? 0) },
      },
      diamond: {
        supply: Number(supply?.diamonds ?? 0),
        holders: Number(supply?.diamond_holders ?? 0),
        valueInr: Math.round(Number(supply?.diamonds ?? 0) * values.diamondInr * 100) / 100,
        earned: diamondEarned,
        earnedTotal: diamondEarned.reduce((s2, r) => s2 + r.diamonds, 0),
        contestEntries: { count: get("contest_entry_fee").n, diamonds: -get("contest_entry_fee").diamonds },
        contestRefunds: get("contest_refund").diamonds + get("contest_entry_refund").diamonds,
      },
      dpCoin: {
        supply: Number(supply?.dp ?? 0),
        holders: Number(supply?.dp_holders ?? 0),
        valueInr: Math.round(Number(supply?.dp ?? 0) * values.dpCoinInr * 100) / 100,
        won: { count: get("contest_win_reward").n, dpCoin: get("contest_win_reward").dp },
        spent: dpSpent,
        spentTotal: dpSpent.reduce((s2, r) => s2 + r.dpCoin, 0),
        refunded: dpRefunded,
      },
      shopBudget: {
        monthlyBudgetInr: cfg.shop.monthlyBudgetInr,
        spentThisMonthInr: shopMonth / 100,
        monthStart: monthStart(),
      },
    });
  });

  /**
   * Economy health (Coin Economy → Overview): does the platform earn more than
   * the closed loop costs it? The only real-money cost is physical shop orders
   * (DP coin → products); revenue is ads (as reported, per currency) and
   * sponsored campaigns (impressions × CPM). Also: DP coin minted from contests
   * and its ₹ liability, Diamonds kept as the contest platform fee, and the
   * active guardrails (lib/economyLimits.ts).
   */
  adminRoute.get("/monetization/economy-health", async (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 365);
    const since = Date.now() - days * DAY_MS;
    const sinceDay = utcDay(since);
    const db = c.env.DB;
    const appCfg = await getAppConfig(c.env);
    const values = coinValuesFromConfig(appCfg);
    const cfg = parseMonetizationConfig(appCfg);
    const [active, shop, won, fee, free, ads, sponsored] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ? AND COALESCE(role, '') <> 'superadmin'`).bind(since).first<any>(),
      db.prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_inr_paise), 0) AS p FROM shop_orders WHERE created_at >= ? AND status NOT IN ('cancelled', 'returned')`,
      ).bind(since).first<any>(),
      db.prepare(
        `SELECT COALESCE(SUM(amount - COALESCE(locked_delta, 0)), 0) AS dp, COALESCE(SUM(COALESCE(locked_delta, 0)), 0) AS diamonds
           FROM coin_transactions WHERE type = 'contest_win_reward' AND amount > 0 AND created_at >= ?`,
      ).bind(since).first<any>(),
      db.prepare(`SELECT COALESCE(SUM(coins), 0) AS n FROM platform_ledger WHERE kind = 'platform_fee' AND created_at >= ?`).bind(since).first<any>(),
      db.prepare(
        `SELECT COALESCE(SUM(locked_delta), 0) AS n FROM coin_transactions
          WHERE created_at >= ? AND locked_delta > 0
            AND type IN ('daily_reward', 'daily_task', 'ad_reward', 'xp_conversion', 'monthly_hall_of_fame_reward', 'referral_bonus', 'verification_bonus', 'signup_bonus', 'gamification_reward')`,
      ).bind(since).first<any>(),
      db.prepare(
        `SELECT currency, COALESCE(SUM(revenue_micros), 0) AS micros FROM ad_revenue_reports WHERE day >= ? GROUP BY currency`,
      ).bind(sinceDay).all<any>(),
      db.prepare(
        `SELECT COALESCE(SUM(s.impressions * c.cpm_paise), 0) / 1000.0 AS p
           FROM campaign_daily_stats s JOIN sponsored_campaigns c ON c.id = s.campaign_id WHERE s.day >= ?`,
      ).bind(sinceDay).first<any>(),
    ]);
    const round = (n: number) => Math.round(n * 100) / 100;
    const activeUsers = Number(active?.n ?? 0);
    const shopInr = Number(shop?.p ?? 0) / 100;
    const adsByCurrency = (ads.results ?? []).map((r) => ({ currency: String(r.currency), amount: round(Number(r.micros) / 1e6) }));
    const adsInr = adsByCurrency.find((r) => r.currency === "INR")?.amount ?? 0;
    const sponsoredInr = round(Number(sponsored?.p ?? 0) / 100);
    const dpWon = Number(won?.dp ?? 0);
    const revenueInr = round(adsInr + sponsoredInr);
    const per = (n: number) => (activeUsers > 0 ? round(n / activeUsers) : 0);
    const alerts: string[] = [];
    if (shopInr > revenueInr) alerts.push("shop_cost_above_revenue");
    if (adsByCurrency.some((r) => r.currency !== "INR" && r.amount > 0)) alerts.push("non_inr_ad_revenue_not_counted");
    if (cfg.economy.contestPlatformFeePercent === 0) alerts.push("no_contest_fee");
    if (cfg.economy.dailyFreeDiamondCap === 0) alerts.push("no_daily_free_cap");
    if (cfg.economy.monthlyDpCoinWinCap === 0) alerts.push("no_monthly_win_cap");
    if (!appCfg?.freeRewardsBudgetId) alerts.push("no_free_rewards_budget");
    return c.json({
      days,
      values,
      activeUsers,
      cost: { shopOrders: Number(shop?.n ?? 0), shopInr: round(shopInr) },
      revenue: { adsByCurrency, adsInr, sponsoredInr, totalInr: revenueInr },
      netInr: round(revenueInr - shopInr),
      minted: {
        dpCoinWon: dpWon,
        dpCoinWonInr: round(dpWon * values.dpCoinInr),
        winExcessAsDiamonds: Number(won?.diamonds ?? 0),
        freeDiamonds: Number(free?.n ?? 0),
        platformFeeDiamonds: Number(fee?.n ?? 0),
      },
      perActiveUser: { shopInr: per(shopInr), revenueInr: per(revenueInr), dpCoinWon: per(dpWon) },
      guardrails: cfg.economy,
      alerts,
    });
  });

  /** One user's shopping, gifts, digital items and XP conversions (Users → Shopping tab). */
  adminRoute.get("/monetization/users/:uid/summary", async (c) => {
    const uid = c.req.param("uid");
    if (!uid || uid.length > 128) throw httpsError("invalid-argument", "Invalid user id.");
    const db = c.env.DB;
    const [orders, giftsOut, giftsIn, store, xp, limits] = await Promise.all([
      db.prepare(
        `SELECT o.id, o.status, o.review_status, o.risk_flags, o.total_coins, o.created_at,
                (SELECT title FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS title
           FROM shop_orders o WHERE o.uid = ? ORDER BY o.created_at DESC LIMIT 50`,
      ).bind(uid).all<any>(),
      db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_coins), 0) AS coins FROM gift_transactions WHERE sender_uid = ?`).bind(uid).first<any>(),
      db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_coins), 0) AS coins, COUNT(DISTINCT sender_uid) AS senders FROM gift_transactions WHERE recipient_uid = ?`).bind(uid).first<any>(),
      db.prepare(
        `SELECT p.id, p.item_id, r.name, p.price_coins, p.status, p.created_at FROM store_purchases p
           LEFT JOIN reward_catalog r ON r.id = p.item_id WHERE p.uid = ? ORDER BY p.created_at DESC LIMIT 50`,
      ).bind(uid).all<any>(),
      db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(diamonds), 0) AS diamonds, COALESCE(SUM(xp_spent), 0) AS xp FROM xp_conversions WHERE uid = ?`).bind(uid).first<any>(),
      db.prepare(
        `SELECT COUNT(*) AS orders30, COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned') THEN total_coins ELSE 0 END), 0) AS coins30
           FROM shop_orders WHERE uid = ? AND created_at >= ? AND status != 'cancelled'`,
      ).bind(uid, Date.now() - 30 * 86_400_000).first<any>(),
    ]);
    const fraud = parseMonetizationConfig(await getAppConfig(c.env)).shop.fraud;
    return c.json({
      orders: (orders.results ?? []).map((o) => ({
        id: o.id, status: o.status, reviewStatus: o.review_status, riskFlags: JSON.parse(o.risk_flags || "[]"),
        totalCoins: Number(o.total_coins), createdAt: Number(o.created_at), title: o.title,
      })),
      limits: { orders30: Number(limits?.orders30 ?? 0), maxOrders30: fraud.maxOrdersPer30Days, coins30: Number(limits?.coins30 ?? 0), maxCoins30: fraud.maxCoinsPer30Days },
      gifts: { sent: Number(giftsOut?.n ?? 0), sentCoins: Number(giftsOut?.coins ?? 0), received: Number(giftsIn?.n ?? 0), receivedCoins: Number(giftsIn?.coins ?? 0), supporters: Number(giftsIn?.senders ?? 0) },
      digital: (store.results ?? []).map((p) => ({ id: p.id, itemId: p.item_id, name: p.name, priceCoins: Number(p.price_coins), status: p.status, createdAt: Number(p.created_at) })),
      xpConversions: { count: Number(xp?.n ?? 0), diamonds: Number(xp?.diamonds ?? 0), xpSpent: Number(xp?.xp ?? 0) },
      riskLabels: RISK_FLAG_LABELS,
    });
  });

  /** Fraud review decision for a held order: approve (can be packed) or reject (cancelled, DP coin refunded). */
  adminRoute.post("/monetization/shop/orders/:id/review", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<any>().catch(() => ({}));
    const decision = body?.decision === "approve" ? "approve" : body?.decision === "reject" ? "reject" : null;
    if (!decision) throw httpsError("invalid-argument", "decision must be approve or reject.");
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : "";
    if (decision === "reject" && note.length < 3) throw httpsError("invalid-argument", "A reason is required to reject (shown to the customer).");
    const cur = await c.env.DB.prepare(`SELECT uid, status, review_status FROM shop_orders WHERE id = ?`).bind(id).first<any>();
    if (!cur) throw httpsError("not-found", "Order not found.");
    if (cur.review_status !== "pending") throw httpsError("failed-precondition", "This order is not waiting for review.");
    const ts = Date.now();
    const actor = actorOf(c);
    if (decision === "approve") {
      const res = await c.env.DB.prepare(
        `UPDATE shop_orders SET review_status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ? AND review_status = 'pending'`,
      ).bind(actor, ts, note || null, ts, id).run();
      if (!res.meta?.changes) throw httpsError("failed-precondition", "The order changed meanwhile. Reload and try again.");
    } else {
      await transitionOrder(c.env, id, "cancelled", { actor, from: [cur.status], note: `Not approved: ${note}` }, ts);
      await c.env.DB.prepare(`UPDATE shop_orders SET review_status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?`)
        .bind(actor, ts, note, id).run();
      c.executionCtx.waitUntil(
        createNotification(c.env, cur.uid, {
          title: "Order update", body: `Your order was not approved and has been cancelled. DP coin refunded. Reason: ${note}`,
          type: "shop_order", targetId: id,
        }).catch(() => undefined),
      );
    }
    await logAudit(c, `shop.order.review.${decision}`, "shop_order", id, { note });
    return c.json({ success: true, order: await loadOrder(c.env, id, null) });
  });

  adminRoute.post("/monetization/shop/orders/:id/status", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<any>().catch(() => ({}));
    const to = String(body?.status ?? "") as OrderStatus;
    if (!(ORDER_STATUSES as readonly string[]).includes(to)) throw httpsError("invalid-argument", "Unknown status.");
    const cur = await c.env.DB.prepare(`SELECT uid, status FROM shop_orders WHERE id = ?`).bind(id).first<any>();
    if (!cur) throw httpsError("not-found", "Order not found.");
    if (!ADMIN_TRANSITIONS[cur.status as OrderStatus]?.includes(to)) throw httpsError("failed-precondition", `A ${cur.status} order can't move to ${to}.`);
    const text = (v: unknown, max: number) => (v == null || v === "" ? null : String(v).trim().slice(0, max));
    const trackingNumber = text(body.trackingNumber, 64);
    const trackingUrl = text(body.trackingUrl, 500);
    if (trackingUrl && !/^https:\/\/\S+$/i.test(trackingUrl)) throw httpsError("invalid-argument", "Tracking link must be an https URL.");
    if (to === "shipped" && !trackingNumber) throw httpsError("invalid-argument", "A tracking number is required to mark an order shipped.");
    const note = text(body.note, 300);
    if ((to === "cancelled" || to === "return_rejected") && !note) throw httpsError("invalid-argument", "A reason is required.");
    await transitionOrder(c.env, id, to, {
      actor: actorOf(c), from: [cur.status], note, carrier: text(body.carrier, 60), trackingNumber, trackingUrl, restock: body.restock === true,
    });
    await logAudit(c, "shop.order.status", "shop_order", id, { from: cur.status, to, note, trackingNumber });
    const label: Record<string, string> = {
      packed: "is packed", shipped: "has been shipped", delivered: "was delivered", cancelled: "was cancelled (DP coin refunded)",
      returned: "return was accepted (DP coin refunded)", return_rejected: "return request was declined",
    };
    c.executionCtx.waitUntil(
      createNotification(c.env, cur.uid, {
        title: "Order update", body: `Your order ${label[to] ?? `is ${to}`}.${trackingNumber && to === "shipped" ? ` Tracking: ${trackingNumber}` : ""}`,
        type: "shop_order", targetId: id,
      }).catch(() => undefined),
    );
    return c.json({ success: true, order: await loadOrder(c.env, id, null) });
  });

}
