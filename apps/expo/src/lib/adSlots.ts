/**
 * Where ads go in a list, and how often an interruptive ad may be shown.
 *
 * Pure functions, no React and no native modules, so the rules are unit-tested
 * (test/adSlots.test.ts) and the same numbers the admin sets in the panel
 * (`appConfig.monetization`, served by /read/app-config) decide placement.
 */

export interface SlotRule {
  /** 1-based row of the first ad. */
  firstPosition: number;
  /** Organic rows between two ads. */
  interval: number;
  /** Most ads in this list for the session. */
  maxPerSession: number;
}

export interface SponsoredCampaign {
  id: string;
  advertiser: string;
  disclosure: string;
  weight: number;
  creative: { headline: string; body: string; imageUrl: string; ctaLabel: string; ctaUrl: string };
}

export interface SponsoredRow {
  kind: 'sponsored';
  /** Stable per slot, never a battle id. */
  id: string;
  campaign: SponsoredCampaign;
}

export const isSponsoredRow = (x: unknown): x is SponsoredRow =>
  !!x && typeof x === 'object' && (x as any).kind === 'sponsored';

/** Row indexes (0-based) at which ads go, for a list of `organicCount` items. */
export function adPositions(organicCount: number, rule: SlotRule): number[] {
  const out: number[] = [];
  if (organicCount <= 0 || rule.maxPerSession <= 0) return out;
  const interval = Math.max(1, Math.floor(rule.interval));
  let organicBefore = Math.max(0, Math.floor(rule.firstPosition) - 1);
  // An ad is only placed BETWEEN organic rows: never before the first, never
  // trailing after the last, so a short feed is not mostly ads.
  while (out.length < rule.maxPerSession && organicBefore < organicCount && organicBefore > 0) {
    out.push(organicBefore + out.length);
    organicBefore += interval;
  }
  return out;
}

/**
 * Interleave sponsored rows into a list. Campaigns rotate by weight, and the
 * same campaign is not shown twice in a row when there is another to show.
 * Deterministic for the same input, so a re-render never reshuffles the feed.
 */
export function interleaveSponsored<T>(items: readonly T[], campaigns: readonly SponsoredCampaign[], rule: SlotRule | null): (T | SponsoredRow)[] {
  if (!rule || !campaigns.length) return items.slice();
  const positions = adPositions(items.length, rule);
  if (!positions.length) return items.slice();
  const rotation = weightedRotation(campaigns);
  const out: (T | SponsoredRow)[] = [];
  let p = 0;
  let organic = 0;
  let lastId: string | null = null;
  let r = 0;
  for (let row = 0; organic < items.length; row++) {
    if (p < positions.length && positions[p] === row) {
      let pick = rotation[r % rotation.length];
      // Skip ahead to the next different campaign, if there is one.
      for (let k = 1; pick.id === lastId && k < rotation.length; k++) pick = rotation[(r + k) % rotation.length];
      r++;
      out.push({ kind: 'sponsored', id: `sp:${p}:${pick.id}`, campaign: pick });
      lastId = pick.id;
      p++;
    } else {
      out.push(items[organic++]);
    }
  }
  return out;
}

/** Expand campaigns by weight (1-100, capped at 10 slots each) into a rotation. */
function weightedRotation(campaigns: readonly SponsoredCampaign[]): SponsoredCampaign[] {
  const out: SponsoredCampaign[] = [];
  const max = Math.max(...campaigns.map((c) => Math.min(10, Math.max(1, Math.round(c.weight / 10) || 1))));
  // Round-robin by rounds, so weights interleave rather than cluster.
  for (let round = 0; round < max; round++) {
    for (const c of campaigns) {
      if (round < Math.min(10, Math.max(1, Math.round(c.weight / 10) || 1))) out.push(c);
    }
  }
  return out;
}

// ------------------------------------------------------------- interstitials

export interface InterstitialRule {
  enabled: boolean;
  minIntervalSec: number;
  maxPerSession: number;
  maxPerHour: number;
}

export interface FrequencyState {
  /** Times an interstitial was shown this session (ms). */
  shown: number[];
  /** Total SDK ads shown this session, any placement. */
  sessionAds: number;
}

export const newFrequencyState = (): FrequencyState => ({ shown: [], sessionAds: 0 });

/** Screens where an interruptive ad must never appear. */
export const PROTECTED_CONTEXTS = ['checkout', 'auth', 'chat', 'contest_entry'] as const;

export function canShowInterstitial(
  state: FrequencyState,
  rule: InterstitialRule,
  opts: { now: number; sessionMaxAds: number; context: string },
): boolean {
  if (!rule.enabled) return false;
  if ((PROTECTED_CONTEXTS as readonly string[]).includes(opts.context)) return false;
  if (state.sessionAds >= opts.sessionMaxAds) return false;
  if (state.shown.length >= rule.maxPerSession) return false;
  const last = state.shown[state.shown.length - 1];
  if (last !== undefined && opts.now - last < rule.minIntervalSec * 1000) return false;
  const lastHour = state.shown.filter((t) => opts.now - t < 3_600_000).length;
  return lastHour < rule.maxPerHour;
}

export function recordInterstitial(state: FrequencyState, now: number): FrequencyState {
  return { shown: [...state.shown, now], sessionAds: state.sessionAds + 1 };
}
