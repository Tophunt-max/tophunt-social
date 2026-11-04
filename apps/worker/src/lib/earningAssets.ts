/**
 * Rewards Center artwork overrides. The app ships every piece as a
 * transparent WebP (apps/expo/assets/earning, registry `EARNING_ART`). An
 * admin can upload a WebP or PNG for any key (Earning Management → Assets);
 * the app then shows the upload instead of the bundled art, and "Reset"
 * brings the bundled art back.
 *
 * Stored in appConfig.earningAssets as { [key]: publicUrl } and delivered with
 * /read/app-config (lib/appControl.ts#publicAppConfig) and the realtime config
 * push. Only known keys and our own `earning-assets/` uploads are accepted,
 * both on save and again when the public config is built.
 */
import { EARNING_ASSET_PREFIX } from "./mediaCategories";

/**
 * [key, bundled WebP under apps/expo/assets/earning]. Must match the app
 * registry; apps/expo/test/earningAssets.test.ts checks it.
 */
export const EARNING_ART_FILES: ReadonlyArray<readonly [string, string]> = [
  ["diamond", "currencies/diamond.webp"],
  ["diamondGlow", "currencies/diamond-glow.webp"],
  ["xp", "currencies/xp.webp"],
  ["dpCoin", "currencies/dp-coin.webp"],
  ["sparkle", "currencies/reward-sparkle.webp"],
  ["rewardsCrown", "branding/rewards-crown.webp"],
  ["levelWings", "badges/level-wings.webp"],
  ["checkIn", "icons/check-in.webp"],
  ["dailyMission", "icons/daily-mission.webp"],
  ["weeklyMission", "icons/weekly-mission.webp"],
  ["contest", "icons/contest.webp"],
  ["referral", "icons/referral.webp"],
  ["watchEarn", "icons/watch-earn.webp"],
  ["xpConvert", "icons/xp-convert.webp"],
  ["achievement", "icons/achievement.webp"],
  ["leaderboard", "icons/leaderboard.webp"],
  ["rewardHistory", "icons/reward-history.webp"],
  ["specialEvent", "icons/special-event.webp"],
  ["streakFire", "streak/streak-fire.webp"],
  ["giftBox", "streak/gift-box.webp"],
  ["rewardChest", "streak/reward-chest.webp"],
  ["dayCheck", "streak/day-check.webp"],
  ["missionVote", "missions/vote.webp"],
  ["missionLike", "missions/like.webp"],
  ["missionShare", "missions/share.webp"],
  ["missionFollow", "missions/follow.webp"],
  ["missionComment", "missions/comment.webp"],
  ["missionContest", "missions/contest.webp"],
  ["missionWatch", "missions/watch.webp"],
  ["missionComplete", "missions/mission-complete.webp"],
  ["participation", "rewards/participation.webp"],
  ["winnerCrown", "rewards/winner-crown.webp"],
  ["runnerUp", "rewards/runner-up.webp"],
  ["specialPrize", "rewards/special-prize.webp"],
  ["inviteFriends", "referral/invite-friends.webp"],
  ["referralGift", "referral/referral-gift.webp"],
  ["referralSuccess", "referral/referral-success.webp"],
  ["socialStar", "achievements/social-star.webp"],
  ["votingPro", "achievements/voting-pro.webp"],
  ["contestKing", "achievements/contest-king.webp"],
  ["levelUp", "achievements/level-up.webp"],
  ["eventGiftBox", "events/event-gift-box.webp"],
  ["eventCrown", "events/event-crown.webp"],
  ["rank1", "leaderboard/rank-1.webp"],
  ["rank2", "leaderboard/rank-2.webp"],
  ["rank3", "leaderboard/rank-3.webp"],
  ["topEarnerCrown", "leaderboard/top-earner-crown.webp"],
  ["watchEarnIllustration", "illustrations/watch-earn.webp"],
];

export const EARNING_ART_KEYS: ReadonlySet<string> = new Set(EARNING_ART_FILES.map(([k]) => k));

/** Max bytes for one uploaded artwork (it is drawn at icon size). */
export const EARNING_ASSET_MAX_BYTES = 1024 * 1024;
export const EARNING_ASSET_MIME_TYPES = ["image/webp", "image/png"];

const KEY_PATH = new RegExp(`^/${EARNING_ASSET_PREFIX}/[0-9]{4}/[0-9]{2}/[A-Za-z0-9-]{8,64}\\.(webp|png)$`);

/**
 * True for an https URL of an object uploadToR2 wrote under `earning-assets/`
 * (`<yyyy>/<mm>/<uuid>.webp|png`): no query, fragment, credentials or
 * traversal. With `publicBase` it must also be on our media origin.
 */
export function isEarningAssetUrl(url: unknown, publicBase?: string | null): url is string {
  if (typeof url !== "string" || url.length > 500) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.search || u.hash || u.username || u.password) return false;
  if (u.href !== url) return false;
  const base = String(publicBase ?? "").trim().replace(/\/+$/, "");
  if (base) {
    if (!url.startsWith(`${base}/`)) return false;
    return KEY_PATH.test("/" + url.slice(base.length + 1));
  }
  return KEY_PATH.test(u.pathname.slice(u.pathname.indexOf(`/${EARNING_ASSET_PREFIX}/`)));
}

/** Keeps only known keys with a valid upload URL. */
export function sanitizeEarningAssets(raw: unknown, publicBase?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (EARNING_ART_KEYS.has(k) && isEarningAssetUrl(v, publicBase)) out[k] = v;
  }
  return out;
}

/** Upload rules: square (within 2%), 128-2048 px a side, with an alpha channel. */
export const EARNING_ASSET_MIN_SIDE = 128;
export const EARNING_ASSET_MAX_SIDE = 2048;

export interface ImageHeader {
  width: number;
  height: number;
  alpha: boolean;
  animated: boolean;
}

/**
 * Reads width, height, alpha and animation from a PNG or WebP header without
 * decoding the image. Null when the bytes are not a well-formed header of the
 * declared type.
 */
export function readImageHeader(bytes: Uint8Array, type: string): ImageHeader | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (type === "image/png") {
    if (bytes.length < 33 || ascii(12, 4) !== "IHDR") return null;
    const width = dv.getUint32(16);
    const height = dv.getUint32(20);
    const colorType = bytes[25];
    // Alpha: colour types 4 (grey + alpha) and 6 (RGBA), or a tRNS chunk.
    let alpha = colorType === 4 || colorType === 6;
    let animated = false;
    let o = 8;
    while (o + 8 <= bytes.length) {
      const len = dv.getUint32(o);
      const name = ascii(o + 4, 4);
      if (name === "tRNS") alpha = true;
      if (name === "acTL") animated = true;
      if (name === "IDAT" || name === "IEND") break;
      o += 12 + len;
    }
    return width && height ? { width, height, alpha, animated } : null;
  }
  if (type === "image/webp") {
    if (bytes.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return null;
    const chunk = ascii(12, 4);
    const u24 = (o: number) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
    if (chunk === "VP8X") {
      const flags = bytes[20];
      return { width: 1 + u24(24), height: 1 + u24(27), alpha: (flags & 0x10) !== 0, animated: (flags & 0x02) !== 0 };
    }
    if (chunk === "VP8L") {
      if (bytes[20] !== 0x2f) return null;
      const b = dv.getUint32(21, true);
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >>> 14) & 0x3fff), alpha: ((b >>> 28) & 1) === 1, animated: false };
    }
    if (chunk === "VP8 ") {
      return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff, alpha: false, animated: false };
    }
    return null;
  }
  return null;
}

/** Why an upload can't be used as artwork, or null when it fits the rules. */
export function earningAssetProblem(h: ImageHeader | null): string | null {
  if (!h) return "The file is not a readable WebP or PNG image.";
  const side = Math.max(h.width, h.height);
  if (Math.abs(h.width - h.height) > side * 0.02) return `Artwork must be square (got ${h.width}x${h.height}).`;
  if (Math.min(h.width, h.height) < EARNING_ASSET_MIN_SIDE) return `Artwork must be at least ${EARNING_ASSET_MIN_SIDE}x${EARNING_ASSET_MIN_SIDE} px (got ${h.width}x${h.height}).`;
  if (side > EARNING_ASSET_MAX_SIDE) return `Artwork must be at most ${EARNING_ASSET_MAX_SIDE}x${EARNING_ASSET_MAX_SIDE} px (got ${h.width}x${h.height}).`;
  if (!h.alpha) return "Artwork needs a transparent background (export with an alpha channel).";
  return null;
}
