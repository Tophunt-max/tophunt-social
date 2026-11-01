/**
 * Client side of ad optimization (pure where possible, unit-tested in
 * test/adOptimizer.test.ts):
 *
 *  - server decisions (/read/ads/decisions): waterfall order, paused networks,
 *    adaptive timeouts, exploration rate — refreshed every 15 min;
 *  - per-network circuit breaker on this device: 5+ attempts in 10 min with
 *    80%+ failures → skip that network for 10 min;
 *  - measured load latency → a per-network timeout on this device;
 *  - experiment buckets: a stable hash of (user or device, slot);
 *  - fatigue: the more ads this session, and the more often the user leaves
 *    right after a full-screen ad, the fewer ads (longer intervals);
 *  - invalid-traffic suppression returned by the server.
 */
import type { AdPlatformKey, PlacementRules } from './placementRules';

export interface ServerDecisions {
  generatedAt: number;
  placements: Record<string, Partial<Record<AdPlatformKey, { order?: string[]; paused?: string[]; explore?: number }>>>;
  timeouts: Record<string, Partial<Record<AdPlatformKey, number>>>;
}

let decisions: ServerDecisions | null = null;
export const setDecisions = (d: ServerDecisions | null) => {
  decisions = d && typeof d === 'object' && d.placements ? d : null;
};
export const getDecisions = () => decisions;

let suppressedUntil = 0;
export const setAdsSuppressedUntil = (ts: number) => {
  suppressedUntil = Number(ts) || 0;
};
export const adsSuppressed = (now = Date.now()) => suppressedUntil > now;

// ------------------------------------------------------------------ circuit breaker + latency

const WINDOW_MS = 10 * 60_000;
const OPEN_MS = 10 * 60_000;
const MIN_ATTEMPTS = 5;
const FAIL_RATE = 0.8;

interface Health {
  results: { at: number; ok: boolean }[];
  openUntil: number;
  /** Exponential moving average of fill latency (ms). */
  latency: number | null;
}
const health = new Map<string, Health>();
const h = (id: string) => {
  let x = health.get(id);
  if (!x) health.set(id, (x = { results: [], openUntil: 0, latency: null }));
  return x;
};

/** Record one attempt's outcome for a network on this device. */
export function recordNetworkResult(networkId: string, ok: boolean, latencyMs: number | null, now = Date.now()): void {
  const x = h(networkId);
  x.results = x.results.filter((r) => now - r.at < WINDOW_MS);
  x.results.push({ at: now, ok });
  if (ok && latencyMs !== null && Number.isFinite(latencyMs)) x.latency = x.latency === null ? latencyMs : x.latency * 0.7 + latencyMs * 0.3;
  const fails = x.results.filter((r) => !r.ok).length;
  if (!ok && x.results.length >= MIN_ATTEMPTS && fails / x.results.length >= FAIL_RATE) {
    x.openUntil = now + OPEN_MS;
    x.results = [];
  }
}

/** True while the breaker for a network is open on this device. */
export const networkTripped = (networkId: string, now = Date.now()) => (health.get(networkId)?.openUntil ?? 0) > now;

/**
 * Timeout for one attempt: the admin's value, tightened by the server's
 * adaptive timeout, and by 3 × this device's typical latency, never below 1 s.
 */
export function attemptTimeout(networkId: string, platform: AdPlatformKey, configured: number): number {
  let t = configured;
  const server = decisions?.timeouts?.[networkId]?.[platform];
  if (server && server > 0) t = Math.min(t, server);
  const local = health.get(networkId)?.latency;
  if (local) t = Math.min(t, Math.max(1000, local * 3));
  return Math.max(1000, Math.round(t));
}

/**
 * Order a waterfall: the server's order (if any) for ids still present, then
 * the rest in the admin's order; paused and tripped networks are dropped; with
 * probability `explore` a random other network goes first (bandit exploration).
 */
export function orderAttempts<T extends { network: { id: string; type: string } }>(
  slot: string,
  platform: AdPlatformKey,
  attempts: T[],
  rand: () => number = Math.random,
  now = Date.now(),
): T[] {
  const d = decisions?.placements?.[slot]?.[platform];
  const paused = new Set(d?.paused ?? []);
  let list = attempts.filter((a) => !paused.has(a.network.id) && !networkTripped(a.network.id, now));
  if (d?.order?.length) {
    const pos = new Map(d.order.map((id, i) => [id, i]));
    const ranked = list.filter((a) => pos.has(a.network.id)).sort((a, b) => pos.get(a.network.id)! - pos.get(b.network.id)!);
    const rest = list.filter((a) => !pos.has(a.network.id));
    // Keep unranked ones (new networks) where the admin put them relative to the ranked list.
    list = attempts.filter((a) => list.includes(a)).map((a) => (pos.has(a.network.id) ? ranked.shift()! : rest.shift()!));
    const explore = Math.max(0, Math.min(0.5, Number(d.explore) || 0));
    const pickable = list.filter((a) => a.network.type !== 'house');
    if (explore > 0 && pickable.length > 1 && rand() < explore) {
      const others = pickable.slice(1);
      const pick = others[Math.floor(rand() * others.length) % others.length];
      list = [pick, ...list.filter((a) => a !== pick)];
    }
  }
  // Never let everything be removed: fall back to the admin's list.
  return list.length ? list : attempts.filter((a) => !paused.has(a.network.id));
}

// ------------------------------------------------------------------ experiments

/** FNV-1a 32-bit, for stable buckets. */
export function hash32(s: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x >>> 0;
}

export interface Variant {
  id: string;
  weight: number;
  rules: Partial<PlacementRules>;
}

/** The variant this viewer is in for `slot`, or null when there is no experiment. */
export function pickVariant(viewerKey: string, slot: string, exp: { enabled: boolean; variants: Variant[] } | undefined): Variant | null {
  if (!exp?.enabled || !exp.variants?.length || exp.variants.length < 2 || !viewerKey) return null;
  const total = exp.variants.reduce((s, v) => s + Math.max(1, Number(v.weight) || 1), 0);
  let r = hash32(`${viewerKey}|${slot}`) % total;
  for (const v of exp.variants) {
    r -= Math.max(1, Number(v.weight) || 1);
    if (r < 0) return v;
  }
  return exp.variants[exp.variants.length - 1];
}

let viewerKey = '';
export const setViewerKey = (k: string) => {
  viewerKey = k;
};
export const getViewerKey = () => viewerKey;

// ------------------------------------------------------------------ fatigue

let sessionAds = 0;
let quickExits = 0;
let lastFullscreenClose = 0;

export const noteAdShown = () => {
  sessionAds++;
};
export const noteFullscreenClosed = (now = Date.now()) => {
  lastFullscreenClose = now;
};
/** Call when the app goes to the background: leaving within 10 s of a full-screen ad counts against ads. */
export const noteAppBackground = (now = Date.now()) => {
  if (lastFullscreenClose && now - lastFullscreenClose < 10_000) quickExits++;
  lastFullscreenClose = 0;
};

/** Multiplier for intervals and gaps: 1 (fresh) up to 2.5 (tired of ads). */
export function fatigueMultiplier(ads = sessionAds, exits = quickExits): number {
  const m = 1 + Math.max(0, ads - 6) * 0.1 + exits * 0.5;
  return Math.min(2.5, Math.round(m * 100) / 100);
}

/** Apply a variant and fatigue to a placement's rules. */
export function effectiveRules(rules: PlacementRules, variant: Variant | null, fatigue = fatigueMultiplier()): PlacementRules {
  const r = { ...rules, ...(variant?.rules ?? {}) } as PlacementRules;
  if (fatigue > 1) {
    r.interval = Math.round(r.interval * fatigue);
    r.minIntervalSec = Math.round(r.minIntervalSec * fatigue);
  }
  return r;
}

/** Test hook. */
export function __resetAdOptimizer(): void {
  decisions = null;
  suppressedUntil = 0;
  health.clear();
  sessionAds = 0;
  quickExits = 0;
  lastFullscreenClose = 0;
  viewerKey = '';
}
