/**
 * Ad statistics the optimizer and the performance dashboard read, written from
 * the app's ad events (`recordAdEvents`), plus the invalid-traffic guard.
 *
 *  - ad_stats: request / fill / impression / click / fail / timeout / reward per
 *    day × platform × slot × network × country × experiment variant, with the
 *    summed load latency of fills.
 *  - ad_ilrd: impression-level revenue reported by the SDK (AdMob onPaidEvent).
 *
 * Diagnostics only: payouts never read these tables. Money is in ad_revenue_reports
 * (imported from the networks) and, as an early signal, ad_ilrd.
 */
import type { Env } from "../types";
import { utcDay } from "./adMetrics";

export interface StatEvent {
  placement: string;
  provider: string;
  platform: string;
  event: string;
  count?: number;
  latencyMs?: number;
  variant?: string;
  valueMicros?: number;
  currency?: string;
}

const VARIANT_RE = /^[a-z0-9_-]{1,16}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const COLUMN: Record<string, string> = {
  request: "requests",
  fill: "fills",
  impression: "impressions",
  click: "clicks",
  fail: "fails",
  timeout: "timeouts",
  reward_complete: "rewards",
};
/** One AdMob paid event cannot plausibly be worth more than this (100 units). */
const MAX_PAID_MICROS = 100_000_000;

/** Statements that add a validated batch to ad_stats / ad_ilrd. Events are already validated by the caller. */
export function statStatements(env: Env, events: StatEvent[], country: string | null, ts = Date.now()): D1PreparedStatement[] {
  const day = utcDay(ts);
  const cc = country && COUNTRY_RE.test(country) ? country : "ZZ";
  const agg = new Map<string, { e: StatEvent; v: string; cols: Record<string, number>; latency: number }>();
  const paid = new Map<string, { e: StatEvent; v: string; cur: string; micros: number; n: number }>();
  for (const e of events) {
    const v = e.variant && VARIANT_RE.test(e.variant) ? e.variant : "-";
    if (e.event === "paid") {
      const micros = Math.round(Number(e.valueMicros));
      const cur = String(e.currency ?? "").toUpperCase();
      if (!Number.isFinite(micros) || micros < 0 || micros > MAX_PAID_MICROS || !/^[A-Z]{3}$/.test(cur)) continue;
      const k = `${e.platform}|${e.placement}|${e.provider}|${v}|${cur}`;
      const p = paid.get(k) ?? { e, v, cur, micros: 0, n: 0 };
      p.micros += micros;
      p.n += 1;
      paid.set(k, p);
      continue;
    }
    const col = COLUMN[e.event];
    if (!col) continue;
    const k = `${e.platform}|${e.placement}|${e.provider}|${v}`;
    const a = agg.get(k) ?? { e, v, cols: {}, latency: 0 };
    const n = Math.max(1, Math.min(10, Number(e.count) || 1));
    a.cols[col] = (a.cols[col] ?? 0) + n;
    if (e.event === "fill" && Number.isFinite(e.latencyMs)) a.latency += Math.max(0, Math.min(30_000, Math.round(Number(e.latencyMs))));
    agg.set(k, a);
  }
  const out: D1PreparedStatement[] = [];
  for (const a of agg.values()) {
    const c = a.cols;
    out.push(
      env.DB.prepare(
        `INSERT INTO ad_stats (day, platform, placement, provider, country, variant, requests, fills, impressions, clicks, fails, timeouts, rewards, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, platform, placement, provider, country, variant) DO UPDATE SET
           requests = requests + excluded.requests, fills = fills + excluded.fills, impressions = impressions + excluded.impressions,
           clicks = clicks + excluded.clicks, fails = fails + excluded.fails, timeouts = timeouts + excluded.timeouts,
           rewards = rewards + excluded.rewards, latency_ms = latency_ms + excluded.latency_ms`,
      ).bind(
        day, a.e.platform, a.e.placement, a.e.provider, cc, a.v,
        c.requests ?? 0, c.fills ?? 0, c.impressions ?? 0, c.clicks ?? 0, c.fails ?? 0, c.timeouts ?? 0, c.rewards ?? 0, a.latency,
      ),
    );
  }
  for (const p of paid.values()) {
    out.push(
      env.DB.prepare(
        `INSERT INTO ad_ilrd (day, platform, placement, provider, variant, currency, micros, events) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (day, platform, placement, provider, variant, currency) DO UPDATE SET micros = micros + excluded.micros, events = events + excluded.events`,
      ).bind(day, p.e.platform, p.e.placement, p.e.provider, p.v, p.cur, p.micros, p.n),
    );
  }
  return out;
}

// ------------------------------------------------------------------ invalid traffic

/** Clicks one account may make on ads per UTC day before its ads are switched off. */
export const IVT_MAX_CLICKS_PER_DAY = 15;
/** Clicks per impression above which a day with enough impressions is suspicious. */
export const IVT_MAX_CTR = 0.25;
const IVT_MIN_IMPRESSIONS = 20;
export const IVT_SUPPRESS_DAYS = 7;
const suppressKey = (uid: string) => `ads:suppress:${uid}`;
const dayKey = (uid: string, day: string) => `ads:ivt:${uid}:${day}`;

/** Epoch ms until which this account sees no ads, or 0. */
export async function adsSuppressedUntil(env: Env, uid: string, ts = Date.now()): Promise<number> {
  const v = Number(await env.CACHE_KV.get(suppressKey(uid)).catch(() => null)) || 0;
  return v > ts ? v : 0;
}

/**
 * Count this account's clicks and impressions for today and switch its ads off
 * for IVT_SUPPRESS_DAYS when it clicks far more than people do. Protecting the
 * ad accounts matters more than a few impressions: networks claw back revenue
 * and close accounts over invalid clicks. Fail-open on KV errors.
 */
export async function ivtCheck(env: Env, uid: string, events: StatEvent[], ts = Date.now()): Promise<{ suppressedUntil: number }> {
  const clicks = events.filter((e) => e.event === "click").length;
  const imps = events.filter((e) => e.event === "impression").length;
  const already = await adsSuppressedUntil(env, uid, ts);
  if (already || (!clicks && !imps)) return { suppressedUntil: already };
  try {
    const key = dayKey(uid, utcDay(ts));
    const prev = JSON.parse((await env.CACHE_KV.get(key)) || "{}");
    const c = (Number(prev.c) || 0) + clicks;
    const i = (Number(prev.i) || 0) + imps;
    await env.CACHE_KV.put(key, JSON.stringify({ c, i }), { expirationTtl: 2 * 86_400 });
    if (c > IVT_MAX_CLICKS_PER_DAY || (i >= IVT_MIN_IMPRESSIONS && c / i > IVT_MAX_CTR)) {
      const until = ts + IVT_SUPPRESS_DAYS * 86_400_000;
      await env.CACHE_KV.put(suppressKey(uid), String(until), { expirationTtl: IVT_SUPPRESS_DAYS * 86_400 });
      return { suppressedUntil: until };
    }
  } catch {
    // KV hiccup: let it through.
  }
  return { suppressedUntil: 0 };
}

/** Admin: lift a suppression. */
export async function clearAdsSuppression(env: Env, uid: string): Promise<void> {
  await env.CACHE_KV.delete(suppressKey(uid));
}

// ------------------------------------------------------------------ dashboard

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ad performance for [from, to]: per slot × network × platform, per experiment variant, and recent alerts. */
export async function adPerformance(env: Env, from: string, to: string) {
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw new Error("from/to must be YYYY-MM-DD and from ≤ to.");
  const [rows, ilrd, variants, alerts, countries] = await Promise.all([
    env.DB.prepare(
      `SELECT placement, platform, provider, SUM(requests) AS requests, SUM(fills) AS fills, SUM(impressions) AS impressions,
              SUM(clicks) AS clicks, SUM(fails) AS fails, SUM(timeouts) AS timeouts, SUM(rewards) AS rewards, SUM(latency_ms) AS latency_ms
         FROM ad_stats WHERE day BETWEEN ? AND ? GROUP BY placement, platform, provider ORDER BY impressions DESC LIMIT 500`,
    ).bind(from, to).all<any>(),
    env.DB.prepare(
      `SELECT placement, platform, provider, variant, currency, SUM(micros) AS micros, SUM(events) AS events
         FROM ad_ilrd WHERE day BETWEEN ? AND ? GROUP BY placement, platform, provider, variant, currency`,
    ).bind(from, to).all<any>(),
    env.DB.prepare(
      `SELECT placement, variant, SUM(requests) AS requests, SUM(fills) AS fills, SUM(impressions) AS impressions, SUM(clicks) AS clicks
         FROM ad_stats WHERE day BETWEEN ? AND ? AND variant <> '-' GROUP BY placement, variant ORDER BY placement, variant`,
    ).bind(from, to).all<any>(),
    env.DB.prepare(`SELECT id, kind, placement, provider, platform, message, created_at FROM ad_alerts ORDER BY created_at DESC LIMIT 50`).all<any>(),
    env.DB.prepare(
      `SELECT country, SUM(impressions) AS impressions, SUM(requests) AS requests, SUM(fills) AS fills
         FROM ad_stats WHERE day BETWEEN ? AND ? GROUP BY country ORDER BY impressions DESC LIMIT 20`,
    ).bind(from, to).all<any>(),
  ]);
  const usd = new Map<string, { micros: number; events: number }>();
  const usdVariant = new Map<string, { micros: number; events: number }>();
  for (const r of ilrd.results ?? []) {
    if (r.currency !== "USD") continue;
    const k = `${r.placement}|${r.platform}|${r.provider}`;
    const a = usd.get(k) ?? { micros: 0, events: 0 };
    a.micros += Number(r.micros);
    a.events += Number(r.events);
    usd.set(k, a);
    if (r.variant !== "-") {
      const kv = `${r.placement}|${r.variant}`;
      const b = usdVariant.get(kv) ?? { micros: 0, events: 0 };
      b.micros += Number(r.micros);
      b.events += Number(r.events);
      usdVariant.set(kv, b);
    }
  }
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    from,
    to,
    rows: (rows.results ?? []).map((r: any) => {
      const req = Number(r.requests);
      const imp = Number(r.impressions);
      const rev = usd.get(`${r.placement}|${r.platform}|${r.provider}`);
      return {
        placement: r.placement, platform: r.platform, provider: r.provider,
        requests: req, fills: Number(r.fills), impressions: imp, clicks: Number(r.clicks), fails: Number(r.fails), timeouts: Number(r.timeouts), rewards: Number(r.rewards),
        fillRate: pct(Number(r.fills), req),
        failRate: pct(Number(r.fails) + Number(r.timeouts), req),
        ctr: pct(Number(r.clicks), imp),
        avgLatencyMs: Number(r.fills) ? Math.round(Number(r.latency_ms) / Number(r.fills)) : null,
        sdkRevenueUsd: rev ? Math.round((rev.micros / 1_000_000) * 100) / 100 : null,
        sdkEcpmUsd: rev && rev.events ? Math.round((rev.micros / rev.events) * 1000 / 1_000_000 * 100) / 100 : null,
      };
    }),
    experiments: (variants.results ?? []).map((v: any) => {
      const rev = usdVariant.get(`${v.placement}|${v.variant}`);
      return {
        placement: v.placement, variant: v.variant,
        requests: Number(v.requests), impressions: Number(v.impressions), clicks: Number(v.clicks),
        fillRate: pct(Number(v.fills), Number(v.requests)),
        sdkRevenueUsd: rev ? Math.round((rev.micros / 1_000_000) * 100) / 100 : null,
      };
    }),
    countries: (countries.results ?? []).map((c: any) => ({ country: c.country, impressions: Number(c.impressions), fillRate: pct(Number(c.fills), Number(c.requests)) })),
    alerts: alerts.results ?? [],
  };
}
