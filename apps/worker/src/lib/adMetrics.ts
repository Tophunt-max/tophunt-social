/**
 * Ad measurement, in two deliberately separate tiers:
 *
 * 1. `ad_event_counters`: what the app SAYS happened (requests, fills,
 *    impressions, failures). Aggregated per day / platform / placement, no user
 *    ids. Useful for fill rate and error diagnostics. NEVER used as revenue.
 * 2. `ad_revenue_reports`: what the ad network REPORTS (impressions, earnings),
 *    imported by an admin from the provider's report. Rows are 'estimated' until
 *    the provider finalises the month; only 'finalized' rows count as booked
 *    revenue in the dashboard.
 *
 * eCPM is computed from provider rows only: revenue / impressions × 1000.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { AD_PLACEMENTS, AD_PROVIDERS } from "./monetizationConfig";

export const AD_EVENTS = ["request", "fill", "impression", "click", "fail", "reward_complete"] as const;
export const AD_PLATFORMS = ["android", "ios", "web"] as const;
const MAX_EVENTS_PER_CALL = 25;
const MAX_COUNT_PER_EVENT = 10;

export const utcDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export interface AdEventInput {
  placement: string;
  event: string;
  provider: string;
  platform: string;
  count?: number;
}

/** Validate and upsert a batch of client diagnostic events. Returns how many were recorded. */
export async function recordAdEvents(env: Env, raw: unknown, ts = Date.now()): Promise<number> {
  if (!Array.isArray(raw) || raw.length === 0) throw httpsError("invalid-argument", "events must be a non-empty list.");
  if (raw.length > MAX_EVENTS_PER_CALL) throw httpsError("invalid-argument", `At most ${MAX_EVENTS_PER_CALL} events per call.`);
  const day = utcDay(ts);
  const merged = new Map<string, { e: AdEventInput; n: number }>();
  for (const e of raw as AdEventInput[]) {
    if (!e || typeof e !== "object") throw httpsError("invalid-argument", "Malformed event.");
    if (!(AD_PLACEMENTS as readonly string[]).includes(e.placement)) throw httpsError("invalid-argument", "Unknown placement.");
    if (!(AD_EVENTS as readonly string[]).includes(e.event)) throw httpsError("invalid-argument", "Unknown event.");
    if (!(AD_PROVIDERS as readonly string[]).includes(e.provider) && e.provider !== "direct") throw httpsError("invalid-argument", "Unknown provider.");
    if (!(AD_PLATFORMS as readonly string[]).includes(e.platform)) throw httpsError("invalid-argument", "Unknown platform.");
    const n = e.count === undefined ? 1 : Number(e.count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT_PER_EVENT) throw httpsError("invalid-argument", `count must be 1-${MAX_COUNT_PER_EVENT}.`);
    const k = `${e.platform}|${e.placement}|${e.provider}|${e.event}`;
    const prev = merged.get(k);
    merged.set(k, { e, n: Math.min(MAX_COUNT_PER_EVENT, (prev?.n ?? 0) + n) });
  }
  await env.DB.batch(
    [...merged.values()].map(({ e, n }) =>
      env.DB.prepare(
        `INSERT INTO ad_event_counters (day, platform, placement, provider, event, count) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, platform, placement, provider, event) DO UPDATE SET count = count + excluded.count`,
      ).bind(day, e.platform, e.placement, e.provider, e.event, n),
    ),
  );
  return merged.size;
}

export interface RevenueRowInput {
  day: string;
  provider: string;
  placement?: string;
  platform?: string;
  requests?: number;
  matched?: number;
  impressions: number;
  clicks?: number;
  /** Earnings in the currency's major unit (e.g. 12.34 USD). Stored as micros. */
  revenue: number;
  currency: string;
  status: "estimated" | "finalized";
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Upsert provider-reported rows. A finalized row is never downgraded to estimated. */
export async function importRevenueRows(env: Env, raw: unknown, actor: string, ts = Date.now()): Promise<number> {
  if (!Array.isArray(raw) || raw.length === 0) throw httpsError("invalid-argument", "rows must be a non-empty list.");
  if (raw.length > 500) throw httpsError("invalid-argument", "At most 500 rows per import.");
  const nonNeg = (v: unknown, label: string, i: number) => {
    const n = v === undefined || v === null || v === "" ? 0 : Number(v);
    if (!Number.isInteger(n) || n < 0) throw httpsError("invalid-argument", `Row ${i + 1}: ${label} must be a whole number ≥ 0.`);
    return n;
  };
  const stmts = (raw as RevenueRowInput[]).map((r, i) => {
    if (!r || typeof r !== "object") throw httpsError("invalid-argument", `Row ${i + 1} is malformed.`);
    if (!DAY_RE.test(String(r.day)) || Number.isNaN(Date.parse(`${r.day}T00:00:00Z`))) throw httpsError("invalid-argument", `Row ${i + 1}: day must be YYYY-MM-DD.`);
    if (!(AD_PROVIDERS as readonly string[]).includes(r.provider) || r.provider === "none") throw httpsError("invalid-argument", `Row ${i + 1}: unknown provider.`);
    const placement = r.placement ?? "all";
    if (placement !== "all" && !(AD_PLACEMENTS as readonly string[]).includes(placement)) throw httpsError("invalid-argument", `Row ${i + 1}: unknown placement.`);
    const platform = r.platform ?? "all";
    if (platform !== "all" && !(AD_PLATFORMS as readonly string[]).includes(platform as any)) throw httpsError("invalid-argument", `Row ${i + 1}: unknown platform.`);
    const revenue = Number(r.revenue);
    if (!Number.isFinite(revenue) || revenue < 0 || revenue > 1e9) throw httpsError("invalid-argument", `Row ${i + 1}: revenue must be ≥ 0.`);
    if (!/^[A-Z]{3}$/.test(String(r.currency))) throw httpsError("invalid-argument", `Row ${i + 1}: currency must be a 3-letter code.`);
    if (r.status !== "estimated" && r.status !== "finalized") throw httpsError("invalid-argument", `Row ${i + 1}: status must be estimated or finalized.`);
    const micros = Math.round(revenue * 1_000_000);
    return env.DB.prepare(
      `INSERT INTO ad_revenue_reports
         (id, day, provider, placement, platform, requests, matched, impressions, clicks, revenue_micros, currency, status, source, imported_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_import', ?, ?, ?)
       ON CONFLICT (day, provider, placement, platform) DO UPDATE SET
         requests = excluded.requests, matched = excluded.matched, impressions = excluded.impressions,
         clicks = excluded.clicks, revenue_micros = excluded.revenue_micros, currency = excluded.currency,
         status = CASE WHEN ad_revenue_reports.status = 'finalized' THEN 'finalized' ELSE excluded.status END,
         imported_by = excluded.imported_by, updated_at = excluded.updated_at`,
    ).bind(
      crypto.randomUUID(), r.day, r.provider, placement, platform,
      nonNeg(r.requests, "requests", i), nonNeg(r.matched, "matched", i), nonNeg(r.impressions, "impressions", i), nonNeg(r.clicks, "clicks", i),
      micros, r.currency, r.status, actor, ts, ts,
    );
  });
  await env.DB.batch(stmts);
  return stmts.length;
}

/** eCPM in major currency units, or null when there were no impressions. */
export function ecpm(revenueMicros: number, impressions: number): number | null {
  if (!impressions) return null;
  return Math.round((revenueMicros / 1_000_000 / impressions) * 1000 * 100) / 100;
}

/** Estimated revenue = monetized impressions × eCPM / 1000 (planning aid only). */
export function estimateRevenue(impressions: number, ecpmValue: number): number {
  return Math.round(((impressions * ecpmValue) / 1000) * 100) / 100;
}

/** Ads report for [from, to] (inclusive, YYYY-MM-DD). */
export async function adsReport(env: Env, from: string, to: string) {
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw httpsError("invalid-argument", "from/to must be YYYY-MM-DD and from ≤ to.");
  const [diag, revenue, byDay] = await Promise.all([
    env.DB.prepare(
      `SELECT placement, platform, provider, event, SUM(count) AS n FROM ad_event_counters
        WHERE day BETWEEN ? AND ? GROUP BY placement, platform, provider, event`,
    ).bind(from, to).all<any>(),
    env.DB.prepare(
      `SELECT provider, placement, platform, currency, status,
              SUM(requests) AS requests, SUM(matched) AS matched, SUM(impressions) AS impressions,
              SUM(clicks) AS clicks, SUM(revenue_micros) AS revenue_micros
         FROM ad_revenue_reports WHERE day BETWEEN ? AND ?
        GROUP BY provider, placement, platform, currency, status`,
    ).bind(from, to).all<any>(),
    env.DB.prepare(
      `SELECT day, currency, status, SUM(impressions) AS impressions, SUM(revenue_micros) AS revenue_micros
         FROM ad_revenue_reports WHERE day BETWEEN ? AND ? GROUP BY day, currency, status ORDER BY day`,
    ).bind(from, to).all<any>(),
  ]);

  // Client diagnostics, per placement: fill rate = fills / requests.
  const diagnostics = new Map<string, Record<string, number>>();
  for (const r of diag.results ?? []) {
    const k = `${r.placement}|${r.platform}|${r.provider}`;
    const m = diagnostics.get(k) ?? {};
    m[r.event] = Number(r.n);
    diagnostics.set(k, m);
  }
  return {
    from,
    to,
    diagnostics: [...diagnostics.entries()].map(([k, m]) => {
      const [placement, platform, provider] = k.split("|");
      const requests = m.request ?? 0;
      return {
        placement, platform, provider,
        requests, fills: m.fill ?? 0, impressions: m.impression ?? 0, clicks: m.click ?? 0,
        failures: m.fail ?? 0, rewardCompletions: m.reward_complete ?? 0,
        fillRate: requests ? Math.round(((m.fill ?? 0) / requests) * 1000) / 10 : null,
      };
    }),
    revenue: (revenue.results ?? []).map((r) => ({
      provider: r.provider, placement: r.placement, platform: r.platform, currency: r.currency, status: r.status,
      requests: Number(r.requests), matched: Number(r.matched), impressions: Number(r.impressions), clicks: Number(r.clicks),
      revenue: Number(r.revenue_micros) / 1_000_000,
      ecpm: ecpm(Number(r.revenue_micros), Number(r.impressions)),
      matchRate: Number(r.requests) ? Math.round((Number(r.matched) / Number(r.requests)) * 1000) / 10 : null,
    })),
    byDay: (byDay.results ?? []).map((r) => ({
      day: r.day, currency: r.currency, status: r.status, impressions: Number(r.impressions), revenue: Number(r.revenue_micros) / 1_000_000,
    })),
  };
}
