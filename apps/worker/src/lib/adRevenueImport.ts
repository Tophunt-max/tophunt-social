/**
 * Automatic revenue import from the networks' reporting APIs, every 6 hours,
 * into ad_revenue_reports (the financial source of truth), mapped to slots.
 *
 *  - AdMob API v1  networkReport:generate (DATE × AD_UNIT × PLATFORM)
 *    https://developers.google.com/admob/api/v1/reference/rest/v1/accounts.networkReport/generate
 *  - AdSense Management API v2  reports:generate (DATE × AD_UNIT_ID)
 *    https://developers.google.com/adsense/management/reference/rest/v2/accounts.reports/generate
 *
 * Both are asked for USD. One Google OAuth client with an offline refresh token
 * that has the admob.readonly and adsense.readonly scopes:
 *   GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN (secrets)
 *   ADMOB_PUBLISHER_ID  "pub-…"  (turns the AdMob import on)
 *   ADSENSE_ACCOUNT_ID  "pub-…"  (turns the AdSense import on)
 *
 * The last 3 days are re-read each run (networks revise recent days). Rows are
 * 'estimated'; a row an admin marked 'finalized' is never downgraded.
 * Ad Manager (and AdX inside it) keeps the CSV import in the panel.
 *
 * After the import, our own impression counts are compared with the networks'
 * (reconciliation); a gap over 10% raises an alert.
 */
import type { Env } from "../types";
import { getAppConfig } from "./settings";
import { parseMonetizationConfig } from "./monetizationConfig";
import { adminAlert } from "./promoBudget";
import { utcDay } from "./adMetrics";
import type { AdPlatformConfig } from "./adPlatform";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const LOOKBACK_DAYS = 3;
const DAY_MS = 86_400_000;
const PUB_RE = /^pub-\d{16}$/;

export interface ImportRow {
  day: string;
  provider: "admob" | "adsense";
  placement: string;
  platform: string;
  requests: number;
  matched: number;
  impressions: number;
  clicks: number;
  micros: number;
}

const env$ = (env: Env, k: string) => String((env as any)[k] ?? "").trim();
export const importConfigured = (env: Env) => ({
  oauth: !!(env$(env, "GOOGLE_ADS_CLIENT_ID") && env$(env, "GOOGLE_ADS_CLIENT_SECRET") && env$(env, "GOOGLE_ADS_REFRESH_TOKEN")),
  admob: PUB_RE.test(env$(env, "ADMOB_PUBLISHER_ID")),
  adsense: PUB_RE.test(env$(env, "ADSENSE_ACCOUNT_ID")),
});

async function accessToken(env: Env): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env$(env, "GOOGLE_ADS_CLIENT_ID"),
      client_secret: env$(env, "GOOGLE_ADS_CLIENT_SECRET"),
      refresh_token: env$(env, "GOOGLE_ADS_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google OAuth refused the refresh token (${res.status} ${j.error ?? ""})`);
  return j.access_token;
}

const ymd = (ts: number) => {
  const d = new Date(ts);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};
const fromCompact = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v);

/** Ad unit id → slot, from the ad platform's waterfalls. */
export function unitSlotMap(cfg: AdPlatformConfig): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of cfg.placements) for (const w of p.waterfall) for (const u of Object.values(w.units)) if (u) m.set(u, p.slot);
  return m;
}

/** Parse an AdMob networkReport stream (a JSON array of header / row / footer messages). */
export function parseAdmobReport(body: unknown, slots: Map<string, string>): ImportRow[] {
  const out: ImportRow[] = [];
  for (const msg of Array.isArray(body) ? body : []) {
    const r = (msg as any)?.row;
    if (!r) continue;
    const d = r.dimensionValues ?? {};
    const m = r.metricValues ?? {};
    const int = (k: string) => Number(m[k]?.integerValue ?? 0) || 0;
    const plat = String(d.PLATFORM?.value ?? "").toLowerCase();
    out.push({
      day: fromCompact(String(d.DATE?.value ?? "")),
      provider: "admob",
      placement: slots.get(String(d.AD_UNIT?.value ?? "")) ?? "all",
      platform: plat === "android" || plat === "ios" ? plat : "all",
      requests: int("AD_REQUESTS"),
      matched: int("MATCHED_REQUESTS"),
      impressions: int("IMPRESSIONS"),
      clicks: int("CLICKS"),
      micros: Number(m.ESTIMATED_EARNINGS?.microsValue ?? 0) || 0,
    });
  }
  return out;
}

/** Parse an AdSense v2 ReportResult (headers + rows of cells). Ad unit ids are "ca-pub-…:<slot id>". */
export function parseAdsenseReport(body: any, slots: Map<string, string>): ImportRow[] {
  const headers: string[] = (body?.headers ?? []).map((h: any) => String(h?.name ?? ""));
  const at = (name: string) => headers.indexOf(name);
  const out: ImportRow[] = [];
  for (const row of body?.rows ?? []) {
    const cell = (name: string) => String(row?.cells?.[at(name)]?.value ?? "");
    const unit = cell("AD_UNIT_ID");
    const slotId = unit.includes(":") ? unit.split(":").pop()! : unit;
    out.push({
      day: cell("DATE"),
      provider: "adsense",
      placement: slots.get(slotId) ?? "all",
      platform: "web",
      requests: Number(cell("AD_REQUESTS")) || 0,
      matched: Number(cell("MATCHED_AD_REQUESTS")) || 0,
      impressions: Number(cell("IMPRESSIONS")) || 0,
      clicks: Number(cell("CLICKS")) || 0,
      micros: Math.round((Number(cell("ESTIMATED_EARNINGS")) || 0) * 1_000_000),
    });
  }
  return out;
}

async function fetchAdmob(env: Env, token: string, ts: number, slots: Map<string, string>): Promise<ImportRow[]> {
  const res = await fetch(`https://admob.googleapis.com/v1/accounts/${env$(env, "ADMOB_PUBLISHER_ID")}/networkReport:generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      reportSpec: {
        dateRange: { startDate: ymd(ts - (LOOKBACK_DAYS - 1) * DAY_MS), endDate: ymd(ts) },
        dimensions: ["DATE", "AD_UNIT", "PLATFORM"],
        metrics: ["AD_REQUESTS", "MATCHED_REQUESTS", "IMPRESSIONS", "CLICKS", "ESTIMATED_EARNINGS"],
        localizationSettings: { currencyCode: "USD" },
      },
    }),
  });
  if (!res.ok) throw new Error(`AdMob API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseAdmobReport(await res.json(), slots);
}

async function fetchAdsense(env: Env, token: string, ts: number, slots: Map<string, string>): Promise<ImportRow[]> {
  const s = ymd(ts - (LOOKBACK_DAYS - 1) * DAY_MS);
  const e = ymd(ts);
  const q = new URLSearchParams({
    dateRange: "CUSTOM",
    "startDate.year": String(s.year), "startDate.month": String(s.month), "startDate.day": String(s.day),
    "endDate.year": String(e.year), "endDate.month": String(e.month), "endDate.day": String(e.day),
    currencyCode: "USD",
  });
  for (const d of ["DATE", "AD_UNIT_ID"]) q.append("dimensions", d);
  for (const m of ["AD_REQUESTS", "MATCHED_AD_REQUESTS", "IMPRESSIONS", "CLICKS", "ESTIMATED_EARNINGS"]) q.append("metrics", m);
  const res = await fetch(`https://adsense.googleapis.com/v2/accounts/${env$(env, "ADSENSE_ACCOUNT_ID")}/reports:generate?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`AdSense API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parseAdsenseReport(await res.json(), slots);
}

/** Sum rows that share a key (several unmapped units fall into "all") and upsert them. */
export async function upsertImported(env: Env, rows: ImportRow[], source: string, ts = Date.now()): Promise<number> {
  const agg = new Map<string, ImportRow>();
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue;
    const k = `${r.day}|${r.provider}|${r.placement}|${r.platform}`;
    const a = agg.get(k);
    if (!a) agg.set(k, { ...r });
    else for (const f of ["requests", "matched", "impressions", "clicks", "micros"] as const) a[f] += r[f];
  }
  const stmts = [...agg.values()].map((r) =>
    env.DB.prepare(
      `INSERT INTO ad_revenue_reports
         (id, day, provider, placement, platform, requests, matched, impressions, clicks, revenue_micros, currency, status, source, imported_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'estimated', ?, 'system', ?, ?)
       ON CONFLICT (day, provider, placement, platform) DO UPDATE SET
         requests = excluded.requests, matched = excluded.matched, impressions = excluded.impressions,
         clicks = excluded.clicks, revenue_micros = excluded.revenue_micros, currency = excluded.currency,
         source = excluded.source, updated_at = excluded.updated_at
       WHERE ad_revenue_reports.status <> 'finalized'`,
    ).bind(crypto.randomUUID(), r.day, r.provider, r.placement, r.platform, r.requests, r.matched, r.impressions, r.clicks, r.micros, source, ts, ts),
  );
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return stmts.length;
}

/**
 * Our impressions (ad_stats, by network type) vs the network's (ad_revenue_reports),
 * for the day before yesterday (fully reported by then). Alerts on a gap > 10%.
 */
export async function reconcile(env: Env, cfg: AdPlatformConfig, ts = Date.now()): Promise<string[]> {
  const day = utcDay(ts - 2 * DAY_MS);
  const typeOf = new Map(cfg.networks.map((n) => [n.id, n.type]));
  const ours = await env.DB.prepare(`SELECT provider, SUM(impressions) AS n FROM ad_stats WHERE day = ? GROUP BY provider`).bind(day).all<{ provider: string; n: number }>();
  const theirs = await env.DB.prepare(`SELECT provider, SUM(impressions) AS n FROM ad_revenue_reports WHERE day = ? GROUP BY provider`).bind(day).all<{ provider: string; n: number }>();
  const byType = new Map<string, number>();
  for (const r of ours.results ?? []) {
    const t = typeOf.get(r.provider) ?? r.provider;
    byType.set(t, (byType.get(t) ?? 0) + Number(r.n));
  }
  const out: string[] = [];
  for (const r of theirs.results ?? []) {
    const net = Number(r.n);
    const us = byType.get(r.provider) ?? 0;
    if (net < 500 || us < 500) continue;
    const gap = Math.abs(us - net) / net;
    if (gap > 0.1) {
      const msg = `${r.provider} impressions on ${day}: app counted ${us}, network reports ${net} (${Math.round(gap * 100)}% apart)`;
      out.push(msg);
      if (await adminAlert(env, `Ads: ${msg}`, msg, "/monetization?tab=adperformance")) {
        await env.DB.prepare(`INSERT INTO ad_alerts (id, kind, provider, message, created_at) VALUES (?, 'reconcile', ?, ?, ?)`).bind(crypto.randomUUID(), r.provider, msg, ts).run().catch(() => undefined);
      }
    }
  }
  return out;
}

/** 6-hourly job. Skips networks whose credentials are not set. */
export async function adRevenueImportJob(env: Env, ts = Date.now()): Promise<{ admob: number; adsense: number; reconciled: number; errors: string[] }> {
  const conf = importConfigured(env);
  const result = { admob: 0, adsense: 0, reconciled: 0, errors: [] as string[] };
  const cfg = parseMonetizationConfig(await getAppConfig(env)).adPlatform;
  if (conf.oauth && (conf.admob || conf.adsense)) {
    const slots = unitSlotMap(cfg);
    let token = "";
    try {
      token = await accessToken(env);
    } catch (e: any) {
      result.errors.push(String(e?.message ?? e));
    }
    if (token && conf.admob) {
      try {
        result.admob = await upsertImported(env, await fetchAdmob(env, token, ts, slots), "admob_api", ts);
      } catch (e: any) {
        result.errors.push(String(e?.message ?? e));
      }
    }
    if (token && conf.adsense) {
      try {
        result.adsense = await upsertImported(env, await fetchAdsense(env, token, ts, slots), "adsense_api", ts);
      } catch (e: any) {
        result.errors.push(String(e?.message ?? e));
      }
    }
    for (const err of result.errors) {
      if (await adminAlert(env, `Ads: revenue import failed`, err, "/monetization?tab=adperformance")) {
        await env.DB.prepare(`INSERT INTO ad_alerts (id, kind, message, created_at) VALUES (?, 'import_failed', ?, ?)`).bind(crypto.randomUUID(), err, ts).run().catch(() => undefined);
      }
    }
  }
  result.reconciled = (await reconcile(env, cfg, ts)).length;
  return result;
}
