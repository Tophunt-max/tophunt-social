/**
 * Rewards Center artwork overrides. The app ships every piece as an SVG
 * (apps/expo/assets/earning, registry `EARNING_ART`). An admin can upload a
 * WebP or PNG for any key (Earning Management → Assets); the app then shows
 * the upload instead of the SVG, and "Reset" brings the SVG back.
 *
 * Stored in appConfig.earningAssets as { [key]: publicUrl } and delivered with
 * /read/app-config (lib/appControl.ts#publicAppConfig) and the realtime config
 * push. Only known keys and our own `earning-assets/` uploads are accepted,
 * both on save and again when the public config is built.
 */
import { EARNING_ASSET_PREFIX } from "./mediaCategories";

/**
 * [key, default SVG file under apps/expo/assets/earning]. Must match the app
 * registry; apps/expo/test/earningAssets.test.ts checks it.
 */
export const EARNING_ART_FILES: ReadonlyArray<readonly [string, string]> = [
  ["diamond", "currencies/diamond.svg"],
  ["diamondGlow", "currencies/diamond-glow.svg"],
  ["xp", "currencies/xp.svg"],
  ["dpCoin", "currencies/dp-coin.svg"],
  ["sparkle", "currencies/reward-sparkle.svg"],
  ["rewardsCrown", "branding/rewards-crown.svg"],
  ["levelWings", "badges/level-wings.svg"],
  ["checkIn", "icons/check-in.svg"],
  ["dailyMission", "icons/daily-mission.svg"],
  ["weeklyMission", "icons/weekly-mission.svg"],
  ["contest", "icons/contest.svg"],
  ["referral", "icons/referral.svg"],
  ["watchEarn", "icons/watch-earn.svg"],
  ["xpConvert", "icons/xp-convert.svg"],
  ["achievement", "icons/achievement.svg"],
  ["leaderboard", "icons/leaderboard.svg"],
  ["rewardHistory", "icons/reward-history.svg"],
  ["specialEvent", "icons/special-event.svg"],
  ["streakFire", "streak/streak-fire.svg"],
  ["giftBox", "streak/gift-box.svg"],
  ["rewardChest", "streak/reward-chest.svg"],
  ["dayCheck", "streak/day-check.svg"],
  ["missionVote", "missions/vote.svg"],
  ["missionLike", "missions/like.svg"],
  ["missionShare", "missions/share.svg"],
  ["missionFollow", "missions/follow.svg"],
  ["missionComment", "missions/comment.svg"],
  ["missionContest", "missions/contest.svg"],
  ["missionWatch", "missions/watch.svg"],
  ["missionComplete", "missions/mission-complete.svg"],
  ["participation", "rewards/participation.svg"],
  ["winnerCrown", "rewards/winner-crown.svg"],
  ["runnerUp", "rewards/runner-up.svg"],
  ["specialPrize", "rewards/special-prize.svg"],
  ["inviteFriends", "referral/invite-friends.svg"],
  ["referralGift", "referral/referral-gift.svg"],
  ["referralSuccess", "referral/referral-success.svg"],
  ["socialStar", "achievements/social-star.svg"],
  ["votingPro", "achievements/voting-pro.svg"],
  ["contestKing", "achievements/contest-king.svg"],
  ["levelUp", "achievements/level-up.svg"],
  ["eventGiftBox", "events/event-gift-box.svg"],
  ["eventCrown", "events/event-crown.svg"],
  ["rank1", "leaderboard/rank-1.svg"],
  ["rank2", "leaderboard/rank-2.svg"],
  ["rank3", "leaderboard/rank-3.svg"],
  ["topEarnerCrown", "leaderboard/top-earner-crown.svg"],
  ["watchEarnIllustration", "illustrations/watch-earn.svg"],
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
