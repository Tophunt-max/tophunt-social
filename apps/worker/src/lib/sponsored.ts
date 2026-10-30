/**
 * Direct brand sponsorships: advertisers, campaigns, serving and delivery stats.
 *
 * Kept apart from ad-network revenue on purpose: a campaign's money is what the
 * advertiser was invoiced (`budget_paise`, `invoice_ref`, `payment_ref`), never
 * an amount derived from impressions counted here.
 *
 * Delivery counts are first-party and aggregated per campaign per day. They
 * hold no user ids, and the per-viewer de-duplication uses the rate limiter
 * (one impression per viewer per campaign per hour), so nothing personal is
 * stored or shown to advertisers.
 *
 * Lifecycle: draft → pending → approved (served while inside its dates) →
 * paused / ended; pending → rejected. Only an admin can approve.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { utcDay } from "./adMetrics";

export const CAMPAIGN_STATUSES = ["draft", "pending", "approved", "paused", "ended", "rejected"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Allowed status moves. Approval is a separate, explicit transition. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["pending", "ended"],
  pending: ["approved", "rejected", "draft"],
  approved: ["paused", "ended"],
  paused: ["approved", "ended"],
  ended: [],
  rejected: ["draft"],
};

export interface Creative {
  headline: string;
  body: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
}

const httpsUrl = (v: unknown) => typeof v === "string" && /^https:\/\/[^\s]+$/i.test(v.trim()) && v.length <= 1000;

export function validateCreative(raw: any): Creative {
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", `creative: ${m}`);
  };
  if (!raw || typeof raw !== "object") bad("required.");
  const text = (v: unknown, label: string, min: number, max: number) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length < min || s.length > max) bad(`${label} must be ${min}-${max} characters.`);
    return s;
  };
  const headline = text(raw.headline, "headline", 1, 80);
  const body = text(raw.body, "body", 0, 280);
  const ctaLabel = text(raw.ctaLabel ?? "Learn more", "ctaLabel", 1, 24);
  if (!httpsUrl(raw.imageUrl)) bad("imageUrl must be an https URL.");
  if (!httpsUrl(raw.ctaUrl)) bad("ctaUrl must be an https URL.");
  return { headline, body, imageUrl: raw.imageUrl.trim(), ctaLabel, ctaUrl: raw.ctaUrl.trim() };
}

export function validateCampaignInput(body: any) {
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", m);
  };
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > 120) bad("Title: 2-120 characters.");
  const advertiserId = typeof body?.advertiserId === "string" ? body.advertiserId : "";
  if (!advertiserId) bad("advertiserId is required.");
  const startsAt = Number(body?.startsAt);
  const endsAt = Number(body?.endsAt);
  if (!(startsAt > 0) || !(endsAt > startsAt)) bad("Dates: end must be after start.");
  if (endsAt - startsAt > 366 * 86_400_000) bad("A campaign can run at most one year.");
  const pricingModel = body?.pricingModel === "cpm" ? "cpm" : "flat";
  const budgetPaise = Number(body?.budgetPaise ?? 0);
  const cpmPaise = Number(body?.cpmPaise ?? 0);
  if (!Number.isInteger(budgetPaise) || budgetPaise < 0) bad("Budget must be a whole number of paise ≥ 0.");
  if (!Number.isInteger(cpmPaise) || cpmPaise < 0) bad("CPM must be a whole number of paise ≥ 0.");
  if (pricingModel === "cpm" && cpmPaise === 0) bad("A CPM campaign needs a CPM price.");
  const impressionCap = body?.impressionCap == null || body.impressionCap === "" ? null : Number(body.impressionCap);
  if (impressionCap !== null && (!Number.isInteger(impressionCap) || impressionCap < 1)) bad("Impression cap: a whole number, or empty.");
  const weight = Number(body?.weight ?? 1);
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) bad("Weight: 1-100.");
  const disclosure = typeof body?.disclosure === "string" && body.disclosure.trim() ? body.disclosure.trim() : "Sponsored";
  if (!/sponsored|ad|paid partnership|promoted/i.test(disclosure) || disclosure.length > 40) {
    bad("Disclosure must clearly say it is paid (e.g. 'Sponsored', 'Ad', 'Paid partnership').");
  }
  const ref = (v: unknown, label: string) => {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || v.length > 120) bad(`${label}: at most 120 characters.`);
    return (v as string).trim();
  };
  return {
    title,
    advertiserId,
    startsAt,
    endsAt,
    pricingModel,
    budgetPaise,
    cpmPaise,
    impressionCap,
    weight,
    creative: JSON.stringify(validateCreative(body?.creative)),
    disclosure,
    invoiceRef: ref(body?.invoiceRef, "Invoice reference"),
    paymentRef: ref(body?.paymentRef, "Payment reference"),
  };
}

export interface ServedCampaign {
  id: string;
  advertiser: string;
  disclosure: string;
  creative: Creative;
  weight: number;
}

/** Campaigns that may be shown now: approved, in dates, advertiser active, under any cap. */
export async function liveCampaigns(env: Env, placement: string, ts = Date.now()): Promise<ServedCampaign[]> {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.creative, c.disclosure, c.weight, a.name AS advertiser
       FROM sponsored_campaigns c JOIN advertisers a ON a.id = c.advertiser_id
      WHERE c.placement = ? AND c.status = 'approved' AND c.starts_at <= ? AND c.ends_at > ?
        AND a.status = 'active'
        AND (c.impression_cap IS NULL OR
             (SELECT COALESCE(SUM(s.impressions), 0) FROM campaign_daily_stats s WHERE s.campaign_id = c.id) < c.impression_cap)
      ORDER BY c.weight DESC, c.starts_at LIMIT 10`,
  ).bind(placement, ts, ts).all<any>();
  return (rows.results ?? []).map((r) => {
    let creative: Creative;
    try {
      creative = JSON.parse(r.creative);
    } catch {
      creative = { headline: "", body: "", imageUrl: "", ctaLabel: "", ctaUrl: "" };
    }
    return { id: r.id, advertiser: r.advertiser, disclosure: r.disclosure, creative, weight: Number(r.weight) };
  }).filter((c) => c.creative.headline && c.creative.ctaUrl);
}

/** Count one delivery event (caller de-duplicates per viewer). Only live campaigns count. */
export async function recordCampaignEvent(env: Env, campaignId: string, event: "impression" | "click", ts = Date.now()): Promise<boolean> {
  const col = event === "click" ? "clicks" : "impressions";
  const res = await env.DB.prepare(
    `INSERT INTO campaign_daily_stats (campaign_id, day, impressions, clicks)
     SELECT ?, ?, ?, ? WHERE EXISTS (
       SELECT 1 FROM sponsored_campaigns WHERE id = ? AND status = 'approved' AND starts_at <= ? AND ends_at > ?)
     ON CONFLICT (campaign_id, day) DO UPDATE SET ${col} = ${col} + 1`,
  ).bind(campaignId, utcDay(ts), event === "impression" ? 1 : 0, event === "click" ? 1 : 0, campaignId, ts, ts).run();
  return Number(res.meta?.changes || 0) > 0;
}

/** Aggregated report for one campaign: per-day delivery and the billing basis. */
export async function campaignReport(env: Env, campaignId: string) {
  const c = await env.DB.prepare(
    `SELECT c.*, a.name AS advertiser_name FROM sponsored_campaigns c JOIN advertisers a ON a.id = c.advertiser_id WHERE c.id = ?`,
  ).bind(campaignId).first<any>();
  if (!c) throw httpsError("not-found", "Campaign not found.");
  const days = await env.DB.prepare(`SELECT day, impressions, clicks FROM campaign_daily_stats WHERE campaign_id = ? ORDER BY day`)
    .bind(campaignId).all<any>();
  const list = (days.results ?? []).map((d) => ({ day: d.day, impressions: Number(d.impressions), clicks: Number(d.clicks) }));
  const impressions = list.reduce((s, d) => s + d.impressions, 0);
  const clicks = list.reduce((s, d) => s + d.clicks, 0);
  // What the campaign would bill by its own terms. Informational: the invoice is
  // the record, and CPM delivery counts are first-party measurements.
  const deliveredValuePaise = c.pricing_model === "cpm" ? Math.min(Number(c.budget_paise) || Infinity, Math.floor((impressions * Number(c.cpm_paise)) / 1000)) : Number(c.budget_paise);
  return {
    campaign: { id: c.id, title: c.title, advertiser: c.advertiser_name, status: c.status, pricingModel: c.pricing_model, budgetPaise: Number(c.budget_paise), cpmPaise: Number(c.cpm_paise), startsAt: Number(c.starts_at), endsAt: Number(c.ends_at), invoiceRef: c.invoice_ref, paymentRef: c.payment_ref },
    totals: { impressions, clicks, ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null, deliveredValuePaise: Number.isFinite(deliveredValuePaise) ? deliveredValuePaise : 0 },
    days: list,
    measurement: "first_party",
  };
}
