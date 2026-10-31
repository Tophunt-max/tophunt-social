/**
 * Admin-managed ad platform: ad networks, placements (slots) and a fallback
 * waterfall per placement, for web, Android and iOS.
 *
 * Stored in `appConfig.monetization.adPlatform` and saved through
 * `POST /admin/app-settings` (validation, version bump, KV invalidation,
 * realtime push and the audit log come with that path).
 *
 * The model:
 *  - networks:   accounts the app can request ads from. Types: Google AdMob
 *                (apps), Google Ad Manager (web + apps; AdX demand is set up
 *                inside Ad Manager), AdSense (web) and House ads (TopHunt's own
 *                sponsored campaigns, the last-resort fallback).
 *  - placements: one per SLOT the app has in code (AD_SLOTS). The admin turns a
 *                slot on per platform, picks a format, sets frequency rules,
 *                audience and schedule, and orders a waterfall of networks.
 *                The app tries the first entry, and on no-fill / error / timeout
 *                the next one.
 *
 * What the panel cannot do, by design:
 *  - put an ad where the app has no slot (login, checkout, chat, uploads and
 *    next to vote buttons are deliberately slot-free);
 *  - add an ad SDK the app binary does not contain (that needs an app release);
 *  - pay rewards: rewarded payouts stay on the verified paths (AdMob SSV,
 *    lib/admobSsv.ts) and the web watch-token flow (lib/webAdReward.ts), with the
 *    amounts and caps in `monetization.ads.rewarded` / `monetization.ads.web`.
 *
 * Every id here (AdMob app / unit ids, Ad Manager paths, AdSense client ids) is
 * public by design: they ship in the app or the page source.
 */
import { httpsError } from "./http";

export const AD_NETWORK_TYPES = ["admob", "gam", "adx", "adsense", "house"] as const;
/** Types served through Ad Manager's tags / SDK (GPT on the web, GAM in the apps). */
export const GAM_FAMILY: readonly AdNetworkType[] = ["gam", "adx"];
const isGamFamily = (t: AdNetworkType) => t === "gam" || t === "adx";
export type AdNetworkType = (typeof AD_NETWORK_TYPES)[number];
export const AD_FORMATS = ["banner", "native", "interstitial", "rewarded"] as const;
export type AdFormat = (typeof AD_FORMATS)[number];
export const AD_PLATFORM_KEYS = ["web", "android", "ios"] as const;
export type AdPlatformKey = (typeof AD_PLATFORM_KEYS)[number];

type PlatformFlags = Record<AdPlatformKey, boolean>;

/** Where each network type can run, and which formats it can serve. */
export const NETWORK_TYPE_RULES: Record<AdNetworkType, { label: string; platforms: AdPlatformKey[]; formats: AdFormat[] }> = {
  admob: { label: "Google AdMob", platforms: ["android", "ios"], formats: ["banner", "native", "interstitial", "rewarded"] },
  gam: { label: "Google Ad Manager", platforms: ["web", "android", "ios"], formats: ["banner", "native", "rewarded"] },
  // AdX has no tag or SDK of its own: its demand is served through Ad Manager
  // ad units (Ad Manager 360, or an MCM partner's network). Same code path as
  // "gam"; a separate type so it is named and reported on its own.
  adx: { label: "Google Ad Exchange (AdX)", platforms: ["web", "android", "ios"], formats: ["banner", "native", "rewarded"] },
  adsense: { label: "Google AdSense", platforms: ["web"], formats: ["banner", "native"] },
  house: { label: "House ads (sponsored campaigns)", platforms: ["web", "android", "ios"], formats: ["banner", "native"] },
};

/**
 * The slots the app has in code. Keep in sync with apps/expo/src/ads/slots.ts
 * (the app ignores a slot it does not know).
 */
export const AD_SLOTS = {
  home_feed: { label: "Home feed", hint: "Between battles in the For You feed.", formats: ["native", "banner"], list: true },
  explore_grid: { label: "Explore: all battles", hint: "A full-width row between battle tiles.", formats: ["native", "banner"], list: true },
  battle_page: { label: "Battle page (shared link)", hint: "Below the battle card and its vote buttons.", formats: ["banner", "native"], list: false },
  result_page: { label: "Result page", hint: "Below the winner card, share buttons and prize.", formats: ["banner", "native"], list: false },
  blog_list: { label: "Blog list", hint: "Between blog articles.", formats: ["native", "banner"], list: true },
  blog_article: { label: "Blog article", hint: "After the article text, before related posts.", formats: ["banner", "native"], list: false },
  leaderboard: { label: "Leaderboard", hint: "After the top 10.", formats: ["banner", "native"], list: false },
  // Small 320×50 banners where people share. Never inside the VS / winner image.
  share_sheet: { label: "Share sheet (VS image)", hint: "Small banner in the share sheet of every battle (feed, battle page, both players), below the VS preview.", formats: ["banner"], list: false },
  entry_share: { label: "After contest entry", hint: "Small banner on the 'entry done, share your VS image' screen, below Go to Home.", formats: ["banner"], list: false },
  referral_share: { label: "Invite friends page", hint: "Small banner at the bottom of Refer & earn.", formats: ["banner"], list: false },
  earn_rewarded: { label: "Earn page: watch & earn", hint: "The user chooses to watch for Diamonds.", formats: ["rewarded"], list: false },
  contest_join_rewarded: { label: "Contest join: not enough Diamonds", hint: "Offered when the entry fee is short.", formats: ["rewarded"], list: false },
  result_exit_interstitial: { label: "Leaving the result page", hint: "Full screen, apps only, strict caps.", formats: ["interstitial"], list: false },
} as const satisfies Record<string, { label: string; hint: string; formats: readonly AdFormat[]; list: boolean }>;
export type AdSlotKey = keyof typeof AD_SLOTS;
export const AD_SLOT_KEYS = Object.keys(AD_SLOTS) as AdSlotKey[];

export interface AdNetwork {
  id: string;
  type: AdNetworkType;
  name: string;
  enabled: boolean;
  platforms: PlatformFlags;
  /** Test mode: the app requests Google's published test ads instead of the real units. */
  testMode: boolean;
  /** AdSense client id ("ca-pub-1234567890123456"). AdSense only. */
  publisherId: string;
}

export interface WaterfallEntry {
  networkId: string;
  /** Ad unit per platform. House ads need none. */
  units: Partial<Record<AdPlatformKey, string>>;
  /** Give up on this network after this long and try the next one. */
  timeoutMs: number;
}

export interface AdPlacementRules {
  /** Lists: 1-based row of the first ad. */
  firstPosition: number;
  /** Lists: organic rows between two ads. */
  interval: number;
  /** Most ads from this placement in one app session. */
  maxPerSession: number;
  /** Most ads from this placement per user per day (0 = no daily limit). */
  maxPerDay: number;
  /** Full-screen: seconds between two of these ads. */
  minIntervalSec: number;
}

export interface AdPlacement {
  slot: AdSlotKey;
  enabled: boolean;
  platforms: PlatformFlags;
  format: AdFormat;
  waterfall: WaterfallEntry[];
  rules: AdPlacementRules;
  audience: {
    /** Show to signed-out visitors (most shared-link traffic). */
    guests: boolean;
    /** No ads from this placement for accounts younger than this many days. */
    newUserGraceDays: number;
  };
  /** Optional window (epoch ms). */
  startsAt: number | null;
  endsAt: number | null;
}

export interface AdPlatformConfig {
  /** Master switch for every placement below. Off = no SDK / web ad anywhere. */
  enabled: boolean;
  networks: AdNetwork[];
  placements: AdPlacement[];
  /** Served at https://tophunt.in/ads.txt and /app-ads.txt (lines, as entered). */
  adsTxt: string;
  appAdsTxt: string;
}

export const AD_PLATFORM_DEFAULTS: AdPlatformConfig = { enabled: false, networks: [], placements: [], adsTxt: "", appAdsTxt: "" };

export const MAX_NETWORKS = 20;
export const MAX_WATERFALL = 6;
const TXT_MAX = 20_000;

const RULE_BOUNDS = {
  firstPosition: [1, 50],
  interval: [3, 100],
  maxPerSession: [0, 50],
  maxPerDay: [0, 500],
  minIntervalSec: [0, 86_400],
  timeoutMs: [500, 15_000],
  newUserGraceDays: [0, 90],
} as const;

const DEFAULT_RULES: AdPlacementRules = { firstPosition: 4, interval: 8, maxPerSession: 6, maxPerDay: 0, minIntervalSec: 0 };
const FULLSCREEN_RULES: AdPlacementRules = { firstPosition: 1, interval: 8, maxPerSession: 2, maxPerDay: 10, minIntervalSec: 300 };

const NETWORK_ID_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const ADMOB_UNIT_RE = /^ca-app-pub-\d{16}\/\d{10}$/;
const GAM_PATH_RE = /^\/\d{2,15}(\/[A-Za-z0-9_.\-]{1,100}){1,5}$/;
const ADSENSE_CLIENT_RE = /^ca-pub-\d{16}$/;
const ADSENSE_SLOT_RE = /^\d{8,12}$/;

/** True when `unit` is a valid ad unit for that network type. */
export function unitValid(type: AdNetworkType, unit: unknown): boolean {
  if (typeof unit !== "string") return false;
  const u = unit.trim();
  if (type === "admob") return ADMOB_UNIT_RE.test(u);
  // An Ad Manager unit is a path on the web and in apps alike.
  if (isGamFamily(type)) return GAM_PATH_RE.test(u);
  if (type === "adsense") return ADSENSE_SLOT_RE.test(u);
  return false;
}

const UNIT_HINT: Record<AdNetworkType, string> = {
  admob: 'an AdMob unit id like "ca-app-pub-0000000000000000/0000000000"',
  gam: 'an Ad Manager ad unit path like "/1234567/tophunt_feed"',
  adx: 'an Ad Manager ad unit path carrying AdX demand, like "/1234567/tophunt_adx_feed"',
  adsense: 'an AdSense ad slot id (8-12 digits)',
  house: "nothing (house ads use the sponsored campaigns)",
};

const isFullscreen = (f: AdFormat) => f === "interstitial" || f === "rewarded";
const flags = (v: any, fallback: boolean): PlatformFlags => ({
  web: typeof v?.web === "boolean" ? v.web : fallback,
  android: typeof v?.android === "boolean" ? v.android : fallback,
  ios: typeof v?.ios === "boolean" ? v.ios : fallback,
});
function int(v: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
const optionalMs = (v: unknown): number | null => {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isInteger(n) && n > 0 ? n : null;
};
const cleanTxt = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, TXT_MAX) : "");

/** Read the stored block with defaults and clamps. Never throws; drops what is invalid. */
export function parseAdPlatform(raw: any): AdPlatformConfig {
  const r = raw && typeof raw === "object" ? raw : {};
  const networks: AdNetwork[] = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(r.networks) ? r.networks.slice(0, MAX_NETWORKS) : []) {
    const id = String(n?.id ?? "");
    const type = n?.type as AdNetworkType;
    if (!NETWORK_ID_RE.test(id) || seen.has(id) || !(AD_NETWORK_TYPES as readonly string[]).includes(type)) continue;
    seen.add(id);
    const allowed = NETWORK_TYPE_RULES[type].platforms;
    const p = flags(n.platforms, true);
    networks.push({
      id,
      type,
      name: String(n.name ?? id).slice(0, 60) || id,
      enabled: n.enabled === true,
      platforms: { web: p.web && allowed.includes("web"), android: p.android && allowed.includes("android"), ios: p.ios && allowed.includes("ios") },
      testMode: n.testMode !== false,
      publisherId: type === "adsense" && ADSENSE_CLIENT_RE.test(String(n.publisherId ?? "").trim()) ? String(n.publisherId).trim() : "",
    });
  }
  const byId = new Map(networks.map((n) => [n.id, n]));
  const placements: AdPlacement[] = [];
  const slots = new Set<string>();
  for (const pl of Array.isArray(r.placements) ? r.placements : []) {
    const slot = pl?.slot as AdSlotKey;
    if (!AD_SLOTS[slot] || slots.has(slot)) continue;
    slots.add(slot);
    const formats = AD_SLOTS[slot].formats as readonly AdFormat[];
    const format = formats.includes(pl.format) ? (pl.format as AdFormat) : formats[0];
    const d = isFullscreen(format) ? FULLSCREEN_RULES : DEFAULT_RULES;
    const waterfall: WaterfallEntry[] = [];
    for (const w of Array.isArray(pl.waterfall) ? pl.waterfall.slice(0, MAX_WATERFALL) : []) {
      const net = byId.get(String(w?.networkId ?? ""));
      if (!net || !NETWORK_TYPE_RULES[net.type].formats.includes(format)) continue;
      const units: Partial<Record<AdPlatformKey, string>> = {};
      for (const k of AD_PLATFORM_KEYS) if (unitValid(net.type, w.units?.[k])) units[k] = String(w.units[k]).trim();
      waterfall.push({ networkId: net.id, units, timeoutMs: int(w.timeoutMs, 3000, RULE_BOUNDS.timeoutMs) });
    }
    placements.push({
      slot,
      enabled: pl.enabled === true,
      platforms: flags(pl.platforms, false),
      format,
      waterfall,
      rules: {
        firstPosition: int(pl.rules?.firstPosition, d.firstPosition, RULE_BOUNDS.firstPosition),
        interval: int(pl.rules?.interval, d.interval, RULE_BOUNDS.interval),
        maxPerSession: int(pl.rules?.maxPerSession, d.maxPerSession, RULE_BOUNDS.maxPerSession),
        maxPerDay: int(pl.rules?.maxPerDay, d.maxPerDay, RULE_BOUNDS.maxPerDay),
        minIntervalSec: int(pl.rules?.minIntervalSec, d.minIntervalSec, RULE_BOUNDS.minIntervalSec),
      },
      audience: {
        guests: pl.audience?.guests !== false,
        newUserGraceDays: int(pl.audience?.newUserGraceDays, 0, RULE_BOUNDS.newUserGraceDays),
      },
      startsAt: optionalMs(pl.startsAt),
      endsAt: optionalMs(pl.endsAt),
    });
  }
  return { enabled: r.enabled === true, networks, placements, adsTxt: cleanTxt(r.adsTxt), appAdsTxt: cleanTxt(r.appAdsTxt) };
}

/**
 * What the app sees: only switched-on placements inside their window, each with
 * the waterfall entries whose network is on for that platform and has a unit
 * there (house ads need none). ads.txt stays server-side.
 */
export function publicAdPlatform(cfg: AdPlatformConfig, nowMs = Date.now()) {
  if (!cfg.enabled) return { enabled: false, networks: [], placements: [] };
  const live = cfg.networks.filter((n) => n.enabled);
  const byId = new Map(live.map((n) => [n.id, n]));
  const placements = cfg.placements
    .filter((p) => p.enabled && (p.startsAt === null || nowMs >= p.startsAt) && (p.endsAt === null || nowMs < p.endsAt))
    .map((p) => {
      const platforms = { ...p.platforms };
      const waterfall = p.waterfall
        .filter((w) => byId.has(w.networkId))
        .map((w) => {
          const net = byId.get(w.networkId)!;
          const units: Partial<Record<AdPlatformKey, string>> = {};
          for (const k of AD_PLATFORM_KEYS) if (net.platforms[k] && (net.type === "house" || w.units[k])) units[k] = w.units[k] ?? "";
          return { networkId: w.networkId, units, timeoutMs: w.timeoutMs };
        })
        .filter((w) => Object.keys(w.units).length > 0);
      // A platform with nothing to try is off.
      for (const k of AD_PLATFORM_KEYS) if (!waterfall.some((w) => k in w.units)) platforms[k] = false;
      return { ...p, platforms, waterfall };
    })
    .filter((p) => AD_PLATFORM_KEYS.some((k) => p.platforms[k]));
  const used = new Set(placements.flatMap((p) => p.waterfall.map((w) => w.networkId)));
  return {
    enabled: true,
    networks: live
      .filter((n) => used.has(n.id))
      .map((n) => ({ id: n.id, type: n.type, platforms: n.platforms, testMode: n.testMode, publisherId: n.publisherId })),
    placements,
  };
}

/** First Ad Manager web unit of a rewarded slot (used by the web watch-token flow). */
export function webRewardedUnitFrom(cfg: AdPlatformConfig, slot: AdSlotKey = "earn_rewarded"): string {
  const pub = publicAdPlatform(cfg);
  const p = pub.placements.find((x) => x.slot === slot && x.format === "rewarded" && x.platforms.web);
  const nets = new Map(pub.networks.map((n) => [n.id, n]));
  for (const w of p?.waterfall ?? []) { const t = nets.get(w.networkId)?.type; if (t && isGamFamily(t) && w.units.web) return w.units.web; }
  return "";
}

/** ads.txt / app-ads.txt body as served. */
export function adsTxtBody(cfg: AdPlatformConfig, kind: "web" | "app"): string {
  const t = (kind === "app" ? cfg.appAdsTxt : cfg.adsTxt).trim();
  return t ? `${t}\n` : "";
}

/**
 * Validate an admin patch of `monetization.adPlatform`, in place. The panel
 * sends the whole block, so this checks the whole block. Refuses rather than
 * clamps, so the admin sees what was wrong.
 */
export function validateAdPlatformPatch(p: any): void {
  if (p === undefined) return;
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", `adPlatform: ${m}`);
  };
  if (!p || typeof p !== "object" || Array.isArray(p)) bad("must be an object.");
  for (const k of Object.keys(p)) if (!["enabled", "networks", "placements", "adsTxt", "appAdsTxt"].includes(k)) bad(`unknown setting ${k}.`);
  if (p.enabled !== undefined && typeof p.enabled !== "boolean") bad("enabled must be true or false.");
  for (const k of ["adsTxt", "appAdsTxt"] as const) {
    if (p[k] === undefined) continue;
    if (typeof p[k] !== "string" || p[k].length > TXT_MAX) bad(`${k} must be text up to ${TXT_MAX} characters.`);
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F<>]/.test(p[k])) bad(`${k} has characters that do not belong in ads.txt.`);
  }
  const isFlags = (v: any, path: string) => {
    if (v === undefined) return;
    if (!v || typeof v !== "object") bad(`${path} must be { web, android, ios }.`);
    for (const k of Object.keys(v)) if (!(AD_PLATFORM_KEYS as readonly string[]).includes(k) || typeof v[k] !== "boolean") bad(`${path}.${k} is not a platform switch.`);
  };
  const isInt = (v: unknown, path: string, [min, max]: readonly [number, number]) => {
    if (v === undefined) return;
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${path} must be a whole number from ${min} to ${max}.`);
  };

  const nets = new Map<string, AdNetworkType>();
  if (p.networks !== undefined) {
    if (!Array.isArray(p.networks) || p.networks.length > MAX_NETWORKS) bad(`networks must be a list of at most ${MAX_NETWORKS}.`);
    for (const n of p.networks) {
      const id = String(n?.id ?? "");
      if (!NETWORK_ID_RE.test(id)) bad(`network id "${id}" must be 2-32 lowercase letters, digits, _ or -.`);
      if (nets.has(id)) bad(`network id "${id}" is used twice.`);
      if (!(AD_NETWORK_TYPES as readonly string[]).includes(n.type)) bad(`network "${id}": type must be one of ${AD_NETWORK_TYPES.join(", ")}.`);
      nets.set(id, n.type);
      for (const k of Object.keys(n)) if (!["id", "type", "name", "enabled", "platforms", "testMode", "publisherId"].includes(k)) bad(`network "${id}": unknown setting ${k}.`);
      if (n.name !== undefined && (typeof n.name !== "string" || n.name.length > 60)) bad(`network "${id}": name up to 60 characters.`);
      for (const b of ["enabled", "testMode"]) if (n[b] !== undefined && typeof n[b] !== "boolean") bad(`network "${id}": ${b} must be true or false.`);
      isFlags(n.platforms, `network "${id}".platforms`);
      const allowed = NETWORK_TYPE_RULES[n.type as AdNetworkType].platforms;
      for (const k of AD_PLATFORM_KEYS) if (n.platforms?.[k] === true && !allowed.includes(k)) bad(`network "${id}": ${NETWORK_TYPE_RULES[n.type as AdNetworkType].label} does not run on ${k}.`);
      if (n.type === "adsense") {
        if (n.enabled === true && !ADSENSE_CLIENT_RE.test(String(n.publisherId ?? "").trim())) bad(`network "${id}": AdSense needs the publisher id "ca-pub-" + 16 digits.`);
      } else if (n.publisherId !== undefined && n.publisherId !== "") bad(`network "${id}": publisherId is for AdSense only.`);
    }
  }

  if (p.placements !== undefined) {
    if (!Array.isArray(p.placements) || p.placements.length > AD_SLOT_KEYS.length) bad("placements must be a list, one per slot.");
    const seen = new Set<string>();
    for (const pl of p.placements) {
      const slot = String(pl?.slot ?? "") as AdSlotKey;
      if (!AD_SLOTS[slot]) bad(`unknown slot "${slot}". The app has: ${AD_SLOT_KEYS.join(", ")}.`);
      if (seen.has(slot)) bad(`slot "${slot}" is listed twice.`);
      seen.add(slot);
      for (const k of Object.keys(pl)) if (!["slot", "enabled", "platforms", "format", "waterfall", "rules", "audience", "startsAt", "endsAt"].includes(k)) bad(`${slot}: unknown setting ${k}.`);
      if (pl.enabled !== undefined && typeof pl.enabled !== "boolean") bad(`${slot}: enabled must be true or false.`);
      isFlags(pl.platforms, `${slot}.platforms`);
      const formats = AD_SLOTS[slot].formats as readonly AdFormat[];
      const format = (pl.format ?? formats[0]) as AdFormat;
      if (!formats.includes(format)) bad(`${slot}: format must be ${formats.join(" or ")}.`);
      if (format === "interstitial" && pl.platforms?.web === true) bad(`${slot}: interstitials run in the apps only.`);
      if (pl.waterfall !== undefined) {
        if (!Array.isArray(pl.waterfall) || pl.waterfall.length > MAX_WATERFALL) bad(`${slot}: waterfall has at most ${MAX_WATERFALL} networks.`);
        const inFall = new Set<string>();
        for (const w of pl.waterfall) {
          const nid = String(w?.networkId ?? "");
          const type = nets.get(nid);
          if (!type) bad(`${slot}: waterfall uses unknown network "${nid}".`);
          if (inFall.has(nid)) bad(`${slot}: network "${nid}" is in the waterfall twice.`);
          inFall.add(nid);
          for (const k of Object.keys(w)) if (!["networkId", "units", "timeoutMs"].includes(k)) bad(`${slot} / ${nid}: unknown setting ${k}.`);
          if (!NETWORK_TYPE_RULES[type!].formats.includes(format)) bad(`${slot}: ${NETWORK_TYPE_RULES[type!].label} cannot serve ${format} ads.`);
          if (format === "rewarded" && isGamFamily(type!) && Object.keys(w.units ?? {}).some((k) => k !== "web")) {
            bad(`${slot}: rewarded ads in the apps are paid through AdMob's verification; use an AdMob network there.`);
          }
          isInt(w.timeoutMs, `${slot} / ${nid}.timeoutMs`, RULE_BOUNDS.timeoutMs);
          if (w.units !== undefined) {
            if (!w.units || typeof w.units !== "object") bad(`${slot} / ${nid}: units must be { web, android, ios }.`);
            for (const [k, u] of Object.entries(w.units)) {
              if (!(AD_PLATFORM_KEYS as readonly string[]).includes(k)) bad(`${slot} / ${nid}: unknown platform ${k}.`);
              if (u === "" || u === null) continue;
              if (type === "house") bad(`${slot} / ${nid}: house ads take no ad unit.`);
              if (!NETWORK_TYPE_RULES[type!].platforms.includes(k as AdPlatformKey)) bad(`${slot} / ${nid}: ${NETWORK_TYPE_RULES[type!].label} does not run on ${k}.`);
              if (!unitValid(type!, u)) bad(`${slot} / ${nid} / ${k}: expected ${UNIT_HINT[type!]}.`);
              (w.units as any)[k] = String(u).trim();
            }
          }
        }
      }
      if (pl.rules !== undefined) {
        if (!pl.rules || typeof pl.rules !== "object") bad(`${slot}: rules must be an object.`);
        for (const k of Object.keys(pl.rules)) if (!["firstPosition", "interval", "maxPerSession", "maxPerDay", "minIntervalSec"].includes(k)) bad(`${slot}: unknown rule ${k}.`);
        for (const k of ["firstPosition", "interval", "maxPerSession", "maxPerDay", "minIntervalSec"] as const) isInt(pl.rules[k], `${slot}.rules.${k}`, RULE_BOUNDS[k]);
        if (format === "interstitial" && pl.rules.minIntervalSec !== undefined && pl.rules.minIntervalSec < 60) bad(`${slot}: interstitials need at least 60 seconds between them.`);
      }
      if (pl.audience !== undefined) {
        if (!pl.audience || typeof pl.audience !== "object") bad(`${slot}: audience must be an object.`);
        for (const k of Object.keys(pl.audience)) if (!["guests", "newUserGraceDays"].includes(k)) bad(`${slot}: unknown audience setting ${k}.`);
        if (pl.audience.guests !== undefined && typeof pl.audience.guests !== "boolean") bad(`${slot}: audience.guests must be true or false.`);
        isInt(pl.audience.newUserGraceDays, `${slot}.audience.newUserGraceDays`, RULE_BOUNDS.newUserGraceDays);
      }
      for (const k of ["startsAt", "endsAt"] as const) {
        const v = pl[k];
        if (v !== undefined && v !== null && optionalMs(v) === null) bad(`${slot}: ${k} must be empty or a date.`);
      }
      const s = optionalMs(pl.startsAt);
      const e = optionalMs(pl.endsAt);
      if (s !== null && e !== null && e <= s) bad(`${slot}: the end must be after the start.`);
    }
  }
}

/** Slot + network-type registry for the admin panel. */
export function adPlatformRegistry() {
  return {
    slots: AD_SLOT_KEYS.map((key) => ({ key, ...AD_SLOTS[key] })),
    networkTypes: AD_NETWORK_TYPES.map((t) => ({ type: t, ...NETWORK_TYPE_RULES[t] })),
    limits: { maxNetworks: MAX_NETWORKS, maxWaterfall: MAX_WATERFALL, bounds: RULE_BOUNDS },
  };
}
