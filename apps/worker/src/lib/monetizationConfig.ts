/**
 * Monetization configuration: ad placements and frequency, sponsored posts,
 * virtual gifts and the digital store.
 *
 * Stored in the `appConfig` settings document under `monetization` and edited
 * through `POST /admin/app-settings`, so it reuses the existing write path:
 * validation, version bump, KV invalidation, realtime push and the audit log.
 *
 * Separate from the legacy `appConfig.ads` block, which only drives the old
 * client-claimed rewarded ad (`claimAdReward`, fail-closed). Rewarded ads paid
 * by the AdMob server-side verification callback are configured here.
 *
 * Every default is the safe one: everything off, test mode, consent required.
 */
import { httpsError } from "./http";

export const AD_PROVIDERS = ["none", "admob"] as const;
export type AdProvider = (typeof AD_PROVIDERS)[number];
export const AD_MODES = ["test", "production"] as const;
export const AD_PLACEMENTS = ["feed_native", "short_video", "interstitial", "rewarded", "sponsored_feed"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export interface PlatformUnits {
  native: string;
  interstitial: string;
  rewarded: string;
}

export interface MonetizationConfig {
  ads: {
    enabled: boolean;
    mode: "test" | "production";
    provider: AdProvider;
    /** Publisher app ids and ad unit ids are public identifiers, not secrets. */
    admob: { androidAppId: string; iosAppId: string; android: PlatformUnits; ios: PlatformUnits };
    /** Hard ceiling on SDK ads shown in one app session, across placements. */
    sessionMaxAds: number;
    requireConsent: boolean;
    /** ISO 3166-1 alpha-2 country codes where no ads (SDK or sponsored) are served. */
    blockedRegions: string[];
    feedNative: { enabled: boolean; firstPosition: number; interval: number; maxPerSession: number };
    shortVideo: { enabled: boolean; interval: number; maxPerSession: number };
    interstitial: { enabled: boolean; minIntervalSec: number; maxPerSession: number; maxPerHour: number };
    rewarded: { enabled: boolean; rewardDiamonds: number; dailyCap: number };
    /**
     * Rewarded ads on the WEB build (Google Ad Manager / GPT). GPT has no
     * server-side verification, so these are paid on the client's word,
     * limited by a server-signed watch token (lib/webAdReward.ts), their own
     * daily cap, the verified-phone rule and the deploy switch
     * ALLOW_WEB_AD_REWARDS. Keep the reward small.
     */
    web: WebRewardedConfig;
  };
  sponsored: { enabled: boolean; firstPosition: number; interval: number; maxPerSession: number };
  gifts: { enabled: boolean; maxQuantity: number; maxCoinsPerSend: number; creatorShareBps: number };
  store: { enabled: boolean };
  /** Physical shop (lib/shop.ts) and its fraud rules (lib/shopRisk.ts). */
  /**
   * `monthlyBudgetInr`: the platform's spend limit. Physical products are the
   * only thing DP coin buys that costs real money, so the ₹ value of shop orders
   * per calendar month (UTC) is capped here. 0 = no limit.
   */
  shop: { enabled: boolean; monthlyBudgetInr: number; fraud: ShopFraudConfig };
  /** Ways to earn Diamonds that live here (others: Coin Economy → Earn). */
  earning: { xpConversion: { enabled: boolean; xpPerDiamond: number; maxDiamondsPerDay: number } };
  /** Economy guardrails (lib/economyLimits.ts). Every knob: 0 = off. */
  economy: EconomyConfig;
}

export interface WebRewardedConfig {
  enabled: boolean;
  /** Ad Manager ad unit path, e.g. "/1234567/tophunt_rewarded". Public, not a secret. */
  adUnitPath: string;
  rewardDiamonds: number;
  /** Paid web ad views per account per reward day (separate from the app cap). */
  dailyCap: number;
  /** Seconds between asking for a watch token and claiming it. */
  minWatchSec: number;
  /** Only accounts with a verified mobile number are paid. */
  requireVerifiedPhone: boolean;
}

export interface EconomyConfig {
  /** Share of a paid contest's entry pot the platform keeps (promo contests exempt). */
  contestPlatformFeePercent: number;
  /** Free Diamonds one account may receive per UTC day across check-in, tasks, ads and XP conversion. */
  dailyFreeDiamondCap: number;
  /** DP coin one account may win from contests per UTC month; the excess is paid as Diamonds. */
  monthlyDpCoinWinCap: number;
  /** Rewarding (XP + monthly win) matches between the same two players per UTC day. */
  sameOpponentRewardsPerDay: number;
}

export interface ShopFraudConfig {
  /** Hard rule: the account's mobile number must be verified before any order. */
  requireVerifiedPhone: boolean;
  /** Hard rule: account must be at least this many days old (0 = off). */
  minAccountAgeDays: number;
  /** Hard rule: orders per account in any 30 days (cancelled ones don't count). */
  maxOrdersPer30Days: number;
  /** Hard rule: DP coin spent per account in the shop in any 30 days. */
  maxCoinsPer30Days: number;
  /** Hard rule: different accounts that may ship to one address / one phone in 90 days. */
  maxAccountsPerAddress: number;
  /** Review hold: an account's first order waits for an admin. */
  reviewFirstOrder: boolean;
  /** Review hold: orders at or above this many DP coin wait for an admin (0 = off). */
  reviewAboveCoins: number;
}

const emptyUnits = (): PlatformUnits => ({ native: "", interstitial: "", rewarded: "" });

export const MONETIZATION_DEFAULTS: MonetizationConfig = {
  ads: {
    enabled: false,
    mode: "test",
    provider: "none",
    admob: { androidAppId: "", iosAppId: "", android: emptyUnits(), ios: emptyUnits() },
    sessionMaxAds: 12,
    requireConsent: true,
    blockedRegions: [],
    feedNative: { enabled: false, firstPosition: 4, interval: 8, maxPerSession: 6 },
    shortVideo: { enabled: false, interval: 6, maxPerSession: 4 },
    interstitial: { enabled: false, minIntervalSec: 300, maxPerSession: 2, maxPerHour: 3 },
    rewarded: { enabled: false, rewardDiamonds: 5, dailyCap: 5 },
    web: { enabled: false, adUnitPath: "", rewardDiamonds: 2, dailyCap: 3, minWatchSec: 15, requireVerifiedPhone: true },
  },
  sponsored: { enabled: false, firstPosition: 3, interval: 12, maxPerSession: 3 },
  gifts: { enabled: false, maxQuantity: 99, maxCoinsPerSend: 5000, creatorShareBps: 0 },
  store: { enabled: false },
  shop: {
    enabled: false,
    monthlyBudgetInr: 0,
    fraud: {
      requireVerifiedPhone: true,
      minAccountAgeDays: 3,
      maxOrdersPer30Days: 3,
      maxCoinsPer30Days: 5000,
      maxAccountsPerAddress: 2,
      reviewFirstOrder: true,
      reviewAboveCoins: 2000,
    },
  },
  earning: { xpConversion: { enabled: false, xpPerDiamond: 100, maxDiamondsPerDay: 20 } },
  economy: { contestPlatformFeePercent: 0, dailyFreeDiamondCap: 0, monthlyDpCoinWinCap: 0, sameOpponentRewardsPerDay: 0 },
};

/** Bounds for every numeric knob: [min, max]. */
const BOUNDS = {
  sessionMaxAds: [0, 50],
  firstPosition: [1, 50],
  interval: [3, 100],
  maxPerSession: [0, 50],
  minIntervalSec: [60, 86_400],
  maxPerHour: [0, 20],
  rewardDiamonds: [1, 100],
  dailyCap: [1, 50],
  minWatchSec: [5, 120],
  maxQuantity: [1, 999],
  maxCoinsPerSend: [1, 1_000_000],
  creatorShareBps: [0, 10_000],
  xpPerDiamond: [1, 1_000_000],
  maxDiamondsPerDay: [1, 10_000],
  minAccountAgeDays: [0, 365],
  maxOrdersPer30Days: [1, 100],
  maxCoinsPer30Days: [1, 100_000_000],
  maxAccountsPerAddress: [1, 20],
  reviewAboveCoins: [0, 100_000_000],
  monthlyBudgetInr: [0, 100_000_000],
  contestPlatformFeePercent: [0, 90],
  dailyFreeDiamondCap: [0, 1_000_000],
  monthlyDpCoinWinCap: [0, 100_000_000],
  sameOpponentRewardsPerDay: [0, 100],
} as const;

const ECONOMY_KEYS = ["contestPlatformFeePercent", "dailyFreeDiamondCap", "monthlyDpCoinWinCap", "sameOpponentRewardsPerDay"] as const;

const AD_UNIT_RE = /^ca-app-pub-\d{16}\/\d{10}$/;
const APP_ID_RE = /^ca-app-pub-\d{16}~\d{10}$/;
const REGION_RE = /^[A-Z]{2}$/;
/** Ad Manager ad unit path: "/<network code>/<unit>[/<child>...]". */
export const GAM_UNIT_PATH_RE = /^\/\d{2,15}(\/[A-Za-z0-9_.\-]{1,100}){1,5}$/;

function int(v: unknown, fallback: number, [min, max]: readonly [number, number]): number {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const str = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : "");

function units(raw: any): PlatformUnits {
  return {
    native: str(raw?.native, AD_UNIT_RE),
    interstitial: str(raw?.interstitial, AD_UNIT_RE),
    rewarded: str(raw?.rewarded, AD_UNIT_RE),
  };
}

/** Read the stored block with defaults and clamps. Never throws. */
export function parseMonetizationConfig(cfg: any): MonetizationConfig {
  const m = (cfg && typeof cfg === "object" ? cfg.monetization : null) || {};
  const d = MONETIZATION_DEFAULTS;
  const a = m.ads || {};
  const provider = (AD_PROVIDERS as readonly string[]).includes(a.provider) ? (a.provider as AdProvider) : d.ads.provider;
  return {
    ads: {
      enabled: bool(a.enabled, d.ads.enabled),
      mode: a.mode === "production" ? "production" : "test",
      provider,
      admob: {
        androidAppId: str(a.admob?.androidAppId, APP_ID_RE),
        iosAppId: str(a.admob?.iosAppId, APP_ID_RE),
        android: units(a.admob?.android),
        ios: units(a.admob?.ios),
      },
      sessionMaxAds: int(a.sessionMaxAds, d.ads.sessionMaxAds, BOUNDS.sessionMaxAds),
      requireConsent: bool(a.requireConsent, true),
      blockedRegions: Array.isArray(a.blockedRegions)
        ? [...new Set<string>(a.blockedRegions.map((r: unknown) => String(r).toUpperCase()).filter((r: string) => REGION_RE.test(r)))].slice(0, 250)
        : [],
      feedNative: {
        enabled: bool(a.feedNative?.enabled, false),
        firstPosition: int(a.feedNative?.firstPosition, d.ads.feedNative.firstPosition, BOUNDS.firstPosition),
        interval: int(a.feedNative?.interval, d.ads.feedNative.interval, BOUNDS.interval),
        maxPerSession: int(a.feedNative?.maxPerSession, d.ads.feedNative.maxPerSession, BOUNDS.maxPerSession),
      },
      shortVideo: {
        enabled: bool(a.shortVideo?.enabled, false),
        interval: int(a.shortVideo?.interval, d.ads.shortVideo.interval, BOUNDS.interval),
        maxPerSession: int(a.shortVideo?.maxPerSession, d.ads.shortVideo.maxPerSession, BOUNDS.maxPerSession),
      },
      interstitial: {
        enabled: bool(a.interstitial?.enabled, false),
        minIntervalSec: int(a.interstitial?.minIntervalSec, d.ads.interstitial.minIntervalSec, BOUNDS.minIntervalSec),
        maxPerSession: int(a.interstitial?.maxPerSession, d.ads.interstitial.maxPerSession, BOUNDS.maxPerSession),
        maxPerHour: int(a.interstitial?.maxPerHour, d.ads.interstitial.maxPerHour, BOUNDS.maxPerHour),
      },
      rewarded: {
        enabled: bool(a.rewarded?.enabled, false),
        rewardDiamonds: int(a.rewarded?.rewardDiamonds, d.ads.rewarded.rewardDiamonds, BOUNDS.rewardDiamonds),
        dailyCap: int(a.rewarded?.dailyCap, d.ads.rewarded.dailyCap, BOUNDS.dailyCap),
      },
      web: {
        enabled: bool(a.web?.enabled, false),
        adUnitPath: str(a.web?.adUnitPath, GAM_UNIT_PATH_RE),
        rewardDiamonds: int(a.web?.rewardDiamonds, d.ads.web.rewardDiamonds, BOUNDS.rewardDiamonds),
        dailyCap: int(a.web?.dailyCap, d.ads.web.dailyCap, BOUNDS.dailyCap),
        minWatchSec: int(a.web?.minWatchSec, d.ads.web.minWatchSec, BOUNDS.minWatchSec),
        requireVerifiedPhone: bool(a.web?.requireVerifiedPhone, true),
      },
    },
    sponsored: {
      enabled: bool(m.sponsored?.enabled, false),
      firstPosition: int(m.sponsored?.firstPosition, d.sponsored.firstPosition, BOUNDS.firstPosition),
      interval: int(m.sponsored?.interval, d.sponsored.interval, BOUNDS.interval),
      maxPerSession: int(m.sponsored?.maxPerSession, d.sponsored.maxPerSession, BOUNDS.maxPerSession),
    },
    gifts: {
      enabled: bool(m.gifts?.enabled, false),
      maxQuantity: int(m.gifts?.maxQuantity, d.gifts.maxQuantity, BOUNDS.maxQuantity),
      maxCoinsPerSend: int(m.gifts?.maxCoinsPerSend, d.gifts.maxCoinsPerSend, BOUNDS.maxCoinsPerSend),
      creatorShareBps: int(m.gifts?.creatorShareBps, d.gifts.creatorShareBps, BOUNDS.creatorShareBps),
    },
    store: { enabled: bool(m.store?.enabled, false) },
    shop: {
      enabled: bool(m.shop?.enabled, false),
      monthlyBudgetInr: int(m.shop?.monthlyBudgetInr, 0, BOUNDS.monthlyBudgetInr),
      fraud: (() => {
        const f = m.shop?.fraud || {};
        const fd = d.shop.fraud;
        return {
          requireVerifiedPhone: bool(f.requireVerifiedPhone, fd.requireVerifiedPhone),
          minAccountAgeDays: int(f.minAccountAgeDays, fd.minAccountAgeDays, BOUNDS.minAccountAgeDays),
          maxOrdersPer30Days: int(f.maxOrdersPer30Days, fd.maxOrdersPer30Days, BOUNDS.maxOrdersPer30Days),
          maxCoinsPer30Days: int(f.maxCoinsPer30Days, fd.maxCoinsPer30Days, BOUNDS.maxCoinsPer30Days),
          maxAccountsPerAddress: int(f.maxAccountsPerAddress, fd.maxAccountsPerAddress, BOUNDS.maxAccountsPerAddress),
          reviewFirstOrder: bool(f.reviewFirstOrder, fd.reviewFirstOrder),
          reviewAboveCoins: int(f.reviewAboveCoins, fd.reviewAboveCoins, BOUNDS.reviewAboveCoins),
        };
      })(),
    },
    earning: {
      xpConversion: {
        enabled: bool(m.earning?.xpConversion?.enabled, false),
        xpPerDiamond: int(m.earning?.xpConversion?.xpPerDiamond, d.earning.xpConversion.xpPerDiamond, BOUNDS.xpPerDiamond),
        maxDiamondsPerDay: int(m.earning?.xpConversion?.maxDiamondsPerDay, d.earning.xpConversion.maxDiamondsPerDay, BOUNDS.maxDiamondsPerDay),
      },
    },
    economy: Object.fromEntries(
      ECONOMY_KEYS.map((k) => [k, int(m.economy?.[k], d.economy[k], BOUNDS[k])]),
    ) as unknown as EconomyConfig,
  };
}

/**
 * True when the SDK ad provider has everything it needs for the given mode.
 * Test mode uses Google's published test units on the client, so it only needs
 * the provider selected; production needs real ids for at least one platform.
 */
export function providerReady(cfg: MonetizationConfig): boolean {
  if (cfg.ads.provider !== "admob") return false;
  if (cfg.ads.mode === "test") return true;
  const a = cfg.ads.admob;
  return Boolean(a.androidAppId || a.iosAppId);
}

/** Web rewarded ads are switched on in the panel and have an ad unit (the deploy switch is separate). */
export function webRewardedReady(cfg: MonetizationConfig): boolean {
  return cfg.ads.enabled && cfg.ads.web.enabled && cfg.ads.web.adUnitPath !== "";
}

/** What the app may see. Ad unit ids are public by design (they ship in the app binary). */
export function publicMonetizationConfig(cfg: any) {
  const m = parseMonetizationConfig(cfg);
  const ready = m.ads.enabled && providerReady(m);
  return {
    ads: {
      enabled: ready,
      mode: m.ads.mode,
      provider: m.ads.provider,
      units: { android: m.ads.admob.android, ios: m.ads.admob.ios },
      sessionMaxAds: m.ads.sessionMaxAds,
      requireConsent: m.ads.requireConsent,
      feedNative: m.ads.feedNative,
      shortVideo: m.ads.shortVideo,
      interstitial: m.ads.interstitial,
      rewarded: { enabled: ready && m.ads.rewarded.enabled, rewardDiamonds: m.ads.rewarded.rewardDiamonds, dailyCap: m.ads.rewarded.dailyCap },
      // The deploy switch is checked by the server when a token is asked for;
      // getDailyTasks reports the combined state to the Earn screen.
      web: {
        enabled: webRewardedReady(m),
        adUnitPath: m.ads.web.adUnitPath,
        rewardDiamonds: m.ads.web.rewardDiamonds,
        dailyCap: m.ads.web.dailyCap,
        minWatchSec: m.ads.web.minWatchSec,
        requireVerifiedPhone: m.ads.web.requireVerifiedPhone,
      },
    },
    sponsored: m.sponsored,
    gifts: { enabled: m.gifts.enabled, maxQuantity: m.gifts.maxQuantity, maxCoinsPerSend: m.gifts.maxCoinsPerSend },
    store: m.store,
    // Fraud thresholds stay server-side; the app only needs to know the shop is open.
    shop: { enabled: m.shop.enabled, requireVerifiedPhone: m.shop.fraud.requireVerifiedPhone },
    earning: m.earning,
    economy: m.economy,
  };
}

/** True when ads of any kind may be served to a caller in `country`. */
export function adsAllowedIn(cfg: MonetizationConfig, country: string | null | undefined): boolean {
  if (!country) return true;
  return !cfg.ads.blockedRegions.includes(String(country).toUpperCase());
}

/**
 * Validate an admin patch of `monetization`, in place. Unknown keys are refused
 * so a typo cannot silently do nothing; out-of-range numbers are refused rather
 * than clamped, so the admin sees what was wrong.
 */
export function validateMonetizationPatch(patch: any): void {
  if (patch === undefined) return;
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", `monetization: ${m}`);
  };
  const obj = (v: unknown, path: string) => {
    if (v === undefined) return false;
    if (!v || typeof v !== "object" || Array.isArray(v)) bad(`${path} must be an object.`);
    return true;
  };
  const only = (v: any, keys: string[], path: string) => {
    for (const k of Object.keys(v)) if (!keys.includes(k)) bad(`unknown setting ${path}.${k}.`);
  };
  const isBool = (v: unknown, path: string) => {
    if (v !== undefined && typeof v !== "boolean") bad(`${path} must be true or false.`);
  };
  const isInt = (v: unknown, path: string, [min, max]: readonly [number, number]) => {
    if (v === undefined) return;
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${path} must be a whole number from ${min} to ${max}.`);
  };
  const isId = (v: unknown, path: string, re: RegExp) => {
    if (v === undefined || v === "") return;
    if (typeof v !== "string" || !re.test(v.trim())) bad(`${path} is not a valid AdMob id.`);
  };

  if (!obj(patch, "monetization")) return;
  only(patch, ["ads", "sponsored", "gifts", "store", "shop", "earning", "economy"], "monetization");

  const a = patch.ads;
  if (obj(a, "ads")) {
    only(a, ["enabled", "mode", "provider", "admob", "sessionMaxAds", "requireConsent", "blockedRegions", "feedNative", "shortVideo", "interstitial", "rewarded", "web"], "ads");
    isBool(a.enabled, "ads.enabled");
    isBool(a.requireConsent, "ads.requireConsent");
    if (a.requireConsent === false) bad("ads.requireConsent cannot be turned off; consent is required where the law requires it.");
    if (a.mode !== undefined && !(AD_MODES as readonly string[]).includes(a.mode)) bad("ads.mode must be 'test' or 'production'.");
    if (a.provider !== undefined && !(AD_PROVIDERS as readonly string[]).includes(a.provider)) bad(`ads.provider must be one of ${AD_PROVIDERS.join(", ")}.`);
    isInt(a.sessionMaxAds, "ads.sessionMaxAds", BOUNDS.sessionMaxAds);
    if (a.blockedRegions !== undefined) {
      if (!Array.isArray(a.blockedRegions) || a.blockedRegions.some((r: unknown) => typeof r !== "string" || !REGION_RE.test(r.toUpperCase()))) {
        bad("ads.blockedRegions must be a list of two-letter country codes.");
      }
      a.blockedRegions = [...new Set(a.blockedRegions.map((r: string) => r.toUpperCase()))];
    }
    if (obj(a.admob, "ads.admob")) {
      only(a.admob, ["androidAppId", "iosAppId", "android", "ios"], "ads.admob");
      isId(a.admob.androidAppId, "ads.admob.androidAppId", APP_ID_RE);
      isId(a.admob.iosAppId, "ads.admob.iosAppId", APP_ID_RE);
      for (const p of ["android", "ios"]) {
        if (obj(a.admob[p], `ads.admob.${p}`)) {
          only(a.admob[p], ["native", "interstitial", "rewarded"], `ads.admob.${p}`);
          for (const u of ["native", "interstitial", "rewarded"]) isId(a.admob[p][u], `ads.admob.${p}.${u}`, AD_UNIT_RE);
        }
      }
    }
    if (obj(a.feedNative, "ads.feedNative")) {
      only(a.feedNative, ["enabled", "firstPosition", "interval", "maxPerSession"], "ads.feedNative");
      isBool(a.feedNative.enabled, "ads.feedNative.enabled");
      isInt(a.feedNative.firstPosition, "ads.feedNative.firstPosition", BOUNDS.firstPosition);
      isInt(a.feedNative.interval, "ads.feedNative.interval", BOUNDS.interval);
      isInt(a.feedNative.maxPerSession, "ads.feedNative.maxPerSession", BOUNDS.maxPerSession);
    }
    if (obj(a.shortVideo, "ads.shortVideo")) {
      only(a.shortVideo, ["enabled", "interval", "maxPerSession"], "ads.shortVideo");
      isBool(a.shortVideo.enabled, "ads.shortVideo.enabled");
      isInt(a.shortVideo.interval, "ads.shortVideo.interval", BOUNDS.interval);
      isInt(a.shortVideo.maxPerSession, "ads.shortVideo.maxPerSession", BOUNDS.maxPerSession);
    }
    if (obj(a.interstitial, "ads.interstitial")) {
      only(a.interstitial, ["enabled", "minIntervalSec", "maxPerSession", "maxPerHour"], "ads.interstitial");
      isBool(a.interstitial.enabled, "ads.interstitial.enabled");
      isInt(a.interstitial.minIntervalSec, "ads.interstitial.minIntervalSec", BOUNDS.minIntervalSec);
      isInt(a.interstitial.maxPerSession, "ads.interstitial.maxPerSession", BOUNDS.maxPerSession);
      isInt(a.interstitial.maxPerHour, "ads.interstitial.maxPerHour", BOUNDS.maxPerHour);
    }
    if (obj(a.rewarded, "ads.rewarded")) {
      only(a.rewarded, ["enabled", "rewardDiamonds", "dailyCap"], "ads.rewarded");
      isBool(a.rewarded.enabled, "ads.rewarded.enabled");
      isInt(a.rewarded.rewardDiamonds, "ads.rewarded.rewardDiamonds", BOUNDS.rewardDiamonds);
      isInt(a.rewarded.dailyCap, "ads.rewarded.dailyCap", BOUNDS.dailyCap);
    }
    if (obj(a.web, "ads.web")) {
      only(a.web, ["enabled", "adUnitPath", "rewardDiamonds", "dailyCap", "minWatchSec", "requireVerifiedPhone"], "ads.web");
      isBool(a.web.enabled, "ads.web.enabled");
      isBool(a.web.requireVerifiedPhone, "ads.web.requireVerifiedPhone");
      if (a.web.adUnitPath !== undefined && a.web.adUnitPath !== "") {
        if (typeof a.web.adUnitPath !== "string" || !GAM_UNIT_PATH_RE.test(a.web.adUnitPath.trim())) {
          bad('ads.web.adUnitPath must be an Ad Manager ad unit path like "/1234567/tophunt_rewarded".');
        }
        a.web.adUnitPath = a.web.adUnitPath.trim();
      }
      isInt(a.web.rewardDiamonds, "ads.web.rewardDiamonds", BOUNDS.rewardDiamonds);
      isInt(a.web.dailyCap, "ads.web.dailyCap", BOUNDS.dailyCap);
      isInt(a.web.minWatchSec, "ads.web.minWatchSec", BOUNDS.minWatchSec);
    }
  }

  const s = patch.sponsored;
  if (obj(s, "sponsored")) {
    only(s, ["enabled", "firstPosition", "interval", "maxPerSession"], "sponsored");
    isBool(s.enabled, "sponsored.enabled");
    isInt(s.firstPosition, "sponsored.firstPosition", BOUNDS.firstPosition);
    isInt(s.interval, "sponsored.interval", BOUNDS.interval);
    isInt(s.maxPerSession, "sponsored.maxPerSession", BOUNDS.maxPerSession);
  }

  const g = patch.gifts;
  if (obj(g, "gifts")) {
    only(g, ["enabled", "maxQuantity", "maxCoinsPerSend", "creatorShareBps"], "gifts");
    isBool(g.enabled, "gifts.enabled");
    isInt(g.maxQuantity, "gifts.maxQuantity", BOUNDS.maxQuantity);
    isInt(g.maxCoinsPerSend, "gifts.maxCoinsPerSend", BOUNDS.maxCoinsPerSend);
    isInt(g.creatorShareBps, "gifts.creatorShareBps", BOUNDS.creatorShareBps);
  }

  const st = patch.store;
  if (obj(st, "store")) {
    only(st, ["enabled"], "store");
    isBool(st.enabled, "store.enabled");
  }

  const sh = patch.shop;
  if (obj(sh, "shop")) {
    only(sh, ["enabled", "monthlyBudgetInr", "fraud"], "shop");
    isBool(sh.enabled, "shop.enabled");
    isInt(sh.monthlyBudgetInr, "shop.monthlyBudgetInr", BOUNDS.monthlyBudgetInr);
    if (obj(sh.fraud, "shop.fraud")) {
      const f = sh.fraud;
      only(f, ["requireVerifiedPhone", "minAccountAgeDays", "maxOrdersPer30Days", "maxCoinsPer30Days", "maxAccountsPerAddress", "reviewFirstOrder", "reviewAboveCoins"], "shop.fraud");
      isBool(f.requireVerifiedPhone, "shop.fraud.requireVerifiedPhone");
      isBool(f.reviewFirstOrder, "shop.fraud.reviewFirstOrder");
      isInt(f.minAccountAgeDays, "shop.fraud.minAccountAgeDays", BOUNDS.minAccountAgeDays);
      isInt(f.maxOrdersPer30Days, "shop.fraud.maxOrdersPer30Days", BOUNDS.maxOrdersPer30Days);
      isInt(f.maxCoinsPer30Days, "shop.fraud.maxCoinsPer30Days", BOUNDS.maxCoinsPer30Days);
      isInt(f.maxAccountsPerAddress, "shop.fraud.maxAccountsPerAddress", BOUNDS.maxAccountsPerAddress);
      isInt(f.reviewAboveCoins, "shop.fraud.reviewAboveCoins", BOUNDS.reviewAboveCoins);
    }
  }

  const e = patch.earning;
  if (obj(e, "earning")) {
    only(e, ["xpConversion"], "earning");
    if (obj(e.xpConversion, "earning.xpConversion")) {
      only(e.xpConversion, ["enabled", "xpPerDiamond", "maxDiamondsPerDay"], "earning.xpConversion");
      isBool(e.xpConversion.enabled, "earning.xpConversion.enabled");
      isInt(e.xpConversion.xpPerDiamond, "earning.xpConversion.xpPerDiamond", BOUNDS.xpPerDiamond);
      isInt(e.xpConversion.maxDiamondsPerDay, "earning.xpConversion.maxDiamondsPerDay", BOUNDS.maxDiamondsPerDay);
    }
  }

  const ec = patch.economy;
  if (obj(ec, "economy")) {
    only(ec, [...ECONOMY_KEYS], "economy");
    for (const k of ECONOMY_KEYS) isInt(ec[k], `economy.${k}`, BOUNDS[k]);
  }
}
