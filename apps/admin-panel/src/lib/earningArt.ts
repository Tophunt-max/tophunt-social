/**
 * Built-in Rewards Center artwork (apps/expo/assets/earning, SVG), so the
 * Assets page can show the default next to an uploaded override. Keyed by the
 * file path the Worker reports per key (worker lib/earningAssets.ts).
 */
const files = import.meta.glob("../../../expo/assets/earning/**/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const byFile: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) byFile[path.replace(/^.*\/assets\/earning\//, "")] = url;

/** URL of the default SVG for a registry file such as `currencies/diamond.svg`, or null. */
export const defaultEarningArt = (file: string): string | null => byFile[file] ?? null;

/** Friendly names for the earning ledger types on the dashboard. */
export const EARNING_TYPE_LABELS: Record<string, string> = {
  daily_reward: "Daily check-in",
  daily_task: "Daily missions",
  ad_reward: "Watch & Earn (ads)",
  quest_reward: "Weekly / monthly missions",
  achievement_reward: "Achievements",
  contest_reward: "Contest participation / runner-up",
  event_reward: "Special events",
  gamification_reward: "Level / season rewards",
  monthly_hall_of_fame_reward: "Hall of Fame",
  xp_conversion: "XP → Diamond",
  referral_bonus: "Referral bonus",
  referral_clawback: "Referral reversed",
  signup_bonus: "Signup bonus",
  verification_bonus: "Verification bonus",
  promo_bonus: "Promo bonus",
  contest_win_reward: "Contest win (DP coin)",
};
export const earningTypeLabel = (t: string) => EARNING_TYPE_LABELS[t] ?? t;
