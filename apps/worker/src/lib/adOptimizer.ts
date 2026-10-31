/**
 * Ad optimizer, run hourly (cron "0 * * * *"):
 *
 *  1. Waterfall order. For placements with `autoOptimize`, networks are ranked
 *     by expected revenue per request = fill rate × eCPM, over the last 7 days:
 *       - fill rate: Beta(fills + 1, requests - fills + 1) posterior mean, so a
 *         network with little traffic is not over- or under-rated;
 *       - eCPM: SDK impression-level revenue (ad_ilrd) when it has 50+ paid
 *         events, else the networks' imported reports (ad_revenue_reports) with
 *         100+ impressions, else the median of the known ones.
 *     Only networks with 50+ requests move; the others keep the admin's position.
 *     House ads are never scored (they are the safety net the admin placed).
 *     The app explores: with probability `explore` it tries a random other
 *     network first, so a network that improves can climb back (a bandit).
 *  2. Health. A network whose fails + timeouts are 85%+ of today's requests
 *     (50+ requests) is paused on that platform for the hour, on every
 *     placement, whatever autoOptimize says.
 *  3. Adaptive timeouts: ~2.5 × the mean fill latency, between 1 s and the
 *     admin's timeout, so fast networks fail over fast.
 *  4. Alerts: fill-rate drop, eCPM drop, paused networks (ad_alerts + admin
 *     notification, deduplicated for 24 h).
 *
 * The result is a small JSON document in KV, served at /read/ads/decisions
 * (edge-cached 5 min). The app applies it on top of the admin's config; if it
 * is missing or stale, the admin's order simply stands.
 */
import type { Env } from "../types";
import { getAppConfig } from "./settings";
import { parseMonetizationConfig } from "./monetizationConfig";
import { utcDay } from "./adMetrics";
import { adminAlert } from "./promoBudget";
import type { AdPlatformConfig, AdPlatformKey } from "./adPlatform";

export const DECISIONS_KEY = "ads:decisions:v1";
const WINDOW_DAYS = 7;
const MIN_REQUESTS = 50;
const MIN_ILRD_EVENTS = 50;
const MIN_REPORT_IMPRESSIONS = 100;
const PAUSE_FAIL_RATE = 0.85;
const EXPLORE = 0.1;
const DAY_MS = 86_400_000;

export interface Decisions {
  generatedAt: number;
  /** placement -> platform -> decision */
  placements: Record<string, Partial<Record<AdPlatformKey, { order?: string[]; paused?: string[]; explore?: number }>>>;
  /** network id -> platform -> adaptive timeout (ms) */
  timeouts: Record<string, Partial<Record<AdPlatformKey, number>>>;
  /** For the dashboard: the scores behind the order. */
  scores: Record<string, Partial<Record<AdPlatformKey, Record<string, { requests: number; fillRate: number; ecpm: number | null; score: number | null }>>>>;
}

interface StatRow { placement: string; platform: string; provider: string; requests: number; fills: number; impressions: number; fails: number; timeouts: number; latency_ms: number }

const dayN = (ts: number, back: number) => utcDay(ts - back * DAY_MS);

/** Pure ranking, unit-tested. `adminOrder` is the admin's waterfall; returns the new order. */
export function rankWaterfall(
  adminOrder: string[],
  stats: Map<string, { requests: number; fills: number }>,
  ecpms: Map<string, number | null>,
  skip: Set<string>,
): { order: string[]; scores: Record<string, { requests: number; fillRate: number; ecpm: number | null; score: number | null }> } {
  const known = [...ecpms.values()].filter((v): v is number => typeof v === "number" && v > 0).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 1;
  const scores: Record<string, { requests: number; fillRate: number; ecpm: number | null; score: number | null }> = {};
  const movable: string[] = [];
  for (const id of adminOrder) {
    const s = stats.get(id) ?? { requests: 0, fills: 0 };
    const fillRate = (s.fills + 1) / (s.requests + 2);
    const ecpm = ecpms.get(id) ?? null;
    const scorable = !skip.has(id) && s.requests >= MIN_REQUESTS;
    const score = scorable ? fillRate * (ecpm ?? median) : null;
    scores[id] = { requests: s.requests, fillRate: Math.round(fillRate * 1000) / 1000, ecpm, score: score === null ? null : Math.round(score * 1000) / 1000 };
    if (scorable) movable.push(id);
  }
  const ranked = [...movable].sort((a, b) => (scores[b].score ?? 0) - (scores[a].score ?? 0));
  let r = 0;
  const order = adminOrder.map((id) => (movable.includes(id) ? ranked[r++] : id));
  return { order, scores };
}

/** Compute the decisions document from stats and config. */
export async function computeDecisions(env: Env, cfg: AdPlatformConfig, ts = Date.now()): Promise<Decisions> {
  const from = dayN(ts, WINDOW_DAYS - 1);
  const today = utcDay(ts);
  const [weekQ, todayQ, ilrdQ, reportQ] = await Promise.all([
    env.DB.prepare(
      `SELECT placement, platform, provider, SUM(requests) AS requests, SUM(fills) AS fills, SUM(impressions) AS impressions,
              SUM(fails) AS fails, SUM(timeouts) AS timeouts, SUM(latency_ms) AS latency_ms
         FROM ad_stats WHERE day >= ? GROUP BY placement, platform, provider`,
    ).bind(from).all<StatRow>(),
    env.DB.prepare(
      `SELECT platform, provider, SUM(requests) AS requests, SUM(fails) AS fails, SUM(timeouts) AS timeouts
         FROM ad_stats WHERE day = ? GROUP BY platform, provider`,
    ).bind(today).all<{ platform: string; provider: string; requests: number; fails: number; timeouts: number }>(),
    env.DB.prepare(
      `SELECT placement, platform, provider, currency, SUM(micros) AS micros, SUM(events) AS events
         FROM ad_ilrd WHERE day >= ? GROUP BY placement, platform, provider, currency`,
    ).bind(from).all<{ placement: string; platform: string; provider: string; currency: string; micros: number; events: number }>(),
    env.DB.prepare(
      `SELECT provider, placement, platform, SUM(impressions) AS impressions, SUM(revenue_micros) AS micros
         FROM ad_revenue_reports WHERE day >= ? AND currency = 'USD' GROUP BY provider, placement, platform`,
    ).bind(from).all<{ provider: string; placement: string; platform: string; impressions: number; micros: number }>(),
  ]);

  const typeOf = new Map(cfg.networks.map((n) => [n.id, n.type]));
  const house = new Set(cfg.networks.filter((n) => n.type === "house").map((n) => n.id));

  // Health: pause networks failing almost everything today.
  const paused = new Map<string, Set<string>>(); // platform -> ids
  for (const r of todayQ.results ?? []) {
    const req = Number(r.requests);
    if (req >= MIN_REQUESTS && (Number(r.fails) + Number(r.timeouts)) / req >= PAUSE_FAIL_RATE) {
      if (!paused.has(r.platform)) paused.set(r.platform, new Set());
      paused.get(r.platform)!.add(r.provider);
    }
  }

  // Adaptive timeouts from the week's fill latency.
  const timeouts: Decisions["timeouts"] = {};
  const lat = new Map<string, { ms: number; fills: number }>();
  for (const r of weekQ.results ?? []) {
    const k = `${r.provider}|${r.platform}`;
    const a = lat.get(k) ?? { ms: 0, fills: 0 };
    a.ms += Number(r.latency_ms);
    a.fills += Number(r.fills);
    lat.set(k, a);
  }
  const adminTimeout = new Map<string, number>();
  for (const p of cfg.placements) for (const w of p.waterfall) adminTimeout.set(w.networkId, Math.max(adminTimeout.get(w.networkId) ?? 0, w.timeoutMs));
  for (const [k, a] of lat) {
    if (a.fills < 20) continue;
    const [id, platform] = k.split("|");
    const cap = adminTimeout.get(id) ?? 3000;
    const t = Math.round(Math.min(cap, Math.max(1000, (a.ms / a.fills) * 2.5)) / 100) * 100;
    (timeouts[id] ??= {})[platform as AdPlatformKey] = t;
  }

  // eCPM per placement|platform|network.
  const ecpmIlrd = new Map<string, number>();
  for (const r of ilrdQ.results ?? []) {
    if (r.currency !== "USD" || Number(r.events) < MIN_ILRD_EVENTS) continue;
    ecpmIlrd.set(`${r.placement}|${r.platform}|${r.provider}`, (Number(r.micros) / Number(r.events)) * 1000 / 1_000_000);
  }
  const ecpmReport = new Map<string, number>(); // placement|platform|type
  for (const r of reportQ.results ?? []) {
    if (Number(r.impressions) < MIN_REPORT_IMPRESSIONS) continue;
    ecpmReport.set(`${r.placement}|${r.platform}|${r.provider}`, (Number(r.micros) / Number(r.impressions)) * 1000 / 1_000_000);
  }

  const byPlacement = new Map<string, StatRow[]>();
  for (const r of weekQ.results ?? []) {
    const k = `${r.placement}|${r.platform}`;
    if (!byPlacement.has(k)) byPlacement.set(k, []);
    byPlacement.get(k)!.push(r);
  }

  const placements: Decisions["placements"] = {};
  const scores: Decisions["scores"] = {};
  for (const p of cfg.placements) {
    for (const platform of ["web", "android", "ios"] as AdPlatformKey[]) {
      if (!p.platforms[platform]) continue;
      const adminOrder = p.waterfall.filter((w) => platform in w.units || typeOf.get(w.networkId) === "house").map((w) => w.networkId);
      if (!adminOrder.length) continue;
      const pausedHere = adminOrder.filter((id) => !house.has(id) && paused.get(platform)?.has(id));
      const entry: { order?: string[]; paused?: string[]; explore?: number } = {};
      if (pausedHere.length) entry.paused = pausedHere;
      if (p.autoOptimize) {
        const stats = new Map<string, { requests: number; fills: number }>();
        for (const r of byPlacement.get(`${p.slot}|${platform}`) ?? []) stats.set(r.provider, { requests: Number(r.requests), fills: Number(r.fills) });
        const ecpms = new Map<string, number | null>();
        for (const id of adminOrder) {
          const t = typeOf.get(id);
          ecpms.set(id, ecpmIlrd.get(`${p.slot}|${platform}|${id}`) ?? (t ? ecpmReport.get(`${p.slot}|${platform}|${t}`) : undefined) ?? null);
        }
        const ranked = rankWaterfall(adminOrder, stats, ecpms, house);
        entry.order = ranked.order;
        entry.explore = EXPLORE;
        (scores[p.slot] ??= {})[platform] = ranked.scores;
      }
      if (entry.order || entry.paused) (placements[p.slot] ??= {})[platform] = entry;
    }
  }
  return { generatedAt: ts, placements, timeouts, scores };
}

/** Notify admins (deduplicated for 24 h by the message). True when it was new. */
async function raise(env: Env, kind: string, message: string, parts: { placement?: string; provider?: string; platform?: string }, ts: number): Promise<boolean> {
  const title = `Ads: ${message}`;
  const sent = await adminAlert(env, title, message, "/monetization?tab=adperformance");
  if (sent) {
    await env.DB.prepare(`INSERT INTO ad_alerts (id, kind, placement, provider, platform, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), kind, parts.placement ?? null, parts.provider ?? null, parts.platform ?? null, message, ts)
      .run()
      .catch(() => undefined);
  }
  return sent;
}

/** Fill-rate and eCPM drops: today so far vs the previous 7 days' daily average. */
export async function checkAdAnomalies(env: Env, ts = Date.now()): Promise<number> {
  const today = utcDay(ts);
  const from = dayN(ts, 7);
  const [fill, ecpm] = await Promise.all([
    env.DB.prepare(
      `SELECT placement, platform, (day = ?) AS is_today, SUM(requests) AS requests, SUM(fills) AS fills
         FROM ad_stats WHERE day >= ? GROUP BY placement, platform, is_today`,
    ).bind(today, from).all<{ placement: string; platform: string; is_today: number; requests: number; fills: number }>(),
    env.DB.prepare(
      `SELECT placement, platform, (day = ?) AS is_today, SUM(micros) AS micros, SUM(events) AS events
         FROM ad_ilrd WHERE day >= ? AND currency = 'USD' GROUP BY placement, platform, is_today`,
    ).bind(today, from).all<{ placement: string; platform: string; is_today: number; micros: number; events: number }>(),
  ]);
  let n = 0;
  const pair = <T extends { placement: string; platform: string; is_today: number }>(rows: T[]) => {
    const m = new Map<string, { now?: T; base?: T }>();
    for (const r of rows) {
      const k = `${r.placement}|${r.platform}`;
      const e = m.get(k) ?? {};
      if (Number(r.is_today)) e.now = r;
      else e.base = r;
      m.set(k, e);
    }
    return m;
  };
  for (const [k, { now, base }] of pair(fill.results ?? [])) {
    if (!now || !base || Number(now.requests) < 100 || Number(base.requests) < 100) continue;
    const fNow = Number(now.fills) / Number(now.requests);
    const fBase = Number(base.fills) / Number(base.requests);
    if (fBase >= 0.2 && fNow < fBase * 0.5) {
      const [placement, platform] = k.split("|");
      if (await raise(env, "fill_drop", `${placement} (${platform}) fill rate ${Math.round(fNow * 100)}%, usually ${Math.round(fBase * 100)}%`, { placement, platform }, ts)) n++;
    }
  }
  for (const [k, { now, base }] of pair(ecpm.results ?? [])) {
    if (!now || !base || Number(now.events) < 100 || Number(base.events) < 100) continue;
    const eNow = Number(now.micros) / Number(now.events);
    const eBase = Number(base.micros) / Number(base.events);
    if (eBase > 0 && eNow < eBase * 0.6) {
      const [placement, platform] = k.split("|");
      const usd = (m: number) => ((m * 1000) / 1_000_000).toFixed(2);
      if (await raise(env, "ecpm_drop", `${placement} (${platform}) eCPM $${usd(eNow)}, usually $${usd(eBase)}`, { placement, platform }, ts)) n++;
    }
  }
  return n;
}

/** Hourly job: decisions to KV, alerts for newly paused networks and anomalies. */
export async function adOptimizerJob(env: Env, ts = Date.now()): Promise<{ placements: number; paused: number; alerts: number }> {
  const cfg = parseMonetizationConfig(await getAppConfig(env)).adPlatform;
  if (!cfg.enabled) {
    await env.CACHE_KV.delete(DECISIONS_KEY).catch(() => undefined);
    return { placements: 0, paused: 0, alerts: 0 };
  }
  const prev = await readDecisions(env);
  const d = await computeDecisions(env, cfg, ts);
  await env.CACHE_KV.put(DECISIONS_KEY, JSON.stringify(d), { expirationTtl: 3 * 3600 });
  let alerts = 0;
  let paused = 0;
  for (const [slot, byPlat] of Object.entries(d.placements)) {
    for (const [platform, e] of Object.entries(byPlat)) {
      for (const id of e?.paused ?? []) {
        paused++;
        const before = prev?.placements?.[slot]?.[platform as AdPlatformKey]?.paused ?? [];
        if (!before.includes(id)) {
          if (await raise(env, "network_paused", `${id} paused on ${platform}: almost every request failed today`, { provider: id, platform }, ts)) alerts++;
        }
      }
    }
  }
  alerts += await checkAdAnomalies(env, ts);
  return { placements: Object.keys(d.placements).length, paused, alerts };
}

export async function readDecisions(env: Env): Promise<Decisions | null> {
  try {
    const raw = await env.CACHE_KV.get(DECISIONS_KEY);
    return raw ? (JSON.parse(raw) as Decisions) : null;
  } catch {
    return null;
  }
}

/** What the app may see (no scores). */
export function publicDecisions(d: Decisions | null) {
  if (!d) return { generatedAt: 0, placements: {}, timeouts: {} };
  return { generatedAt: d.generatedAt, placements: d.placements, timeouts: d.timeouts };
}
