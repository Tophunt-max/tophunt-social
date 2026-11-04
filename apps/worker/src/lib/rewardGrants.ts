/**
 * Claimable coin rewards from level milestones and season results.
 *
 * XP is never converted into coins. A milestone or a season result may carry a
 * fixed, admin-configured Diamond amount; it becomes a `reward_grants` row, and
 * claiming it pays through the SAME machinery as the daily check-in:
 *
 *   - a reservation on the reward budget (progression.rewardBudgetId, else the
 *     free-rewards budget), which enforces the budget total and its per-user
 *     limit inside the transaction;
 *   - a deterministic coin ledger row `reward_grant:<grantId>`;
 *   - Diamonds only (locked_coins): spendable on entries, never withdrawable.
 *
 * Without a budget there is no claim: a grant stays `claimable` and the app
 * shows it as unavailable. A budget running out leaves the grant claimable for
 * later. XP, levels and cosmetics never depend on any of this.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { getAppConfig } from "./settings";
import { assertUnderFreeDiamondCap, economyConfig, freeDiamondCapGate } from "./economyLimits";
import { rewardDayStart } from "./gamification";
import { FREE_REWARDS_EXHAUSTED, freeRewardBudgetStatements, freeRewardsBudgetId, notifyBudgetExhausted } from "./promoBudget";
import { MAX_COIN_AMOUNT } from "./money";
import { experienceOn, type Progression } from "./progression";

export const REWARD_BUDGET_UNAVAILABLE = "reward_budget_unavailable";

/** Ledger type per grant source; anything else is `gamification_reward` (level / season). */
const GRANT_LEDGER_TYPE: Record<string, string> = { achievement: "achievement_reward", contest: "contest_reward" };

export async function rewardBudgetFor(env: Env, p: Progression): Promise<string | null> {
  return p.cfg.rewardBudgetId ?? freeRewardsBudgetId(await getAppConfig(env));
}

export async function listGrants(env: Env, uid: string) {
  const rows = await env.DB.prepare(
    `SELECT id, source_type, source_id, coins, status, note, created_at, claimed_at FROM reward_grants WHERE uid = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(uid).all<any>();
  return (rows.results ?? []).map((r) => ({
    id: r.id,
    sourceType: r.source_type,
    sourceId: r.source_id,
    coins: Number(r.coins),
    status: r.status,
    note: r.note,
    createdAt: Number(r.created_at),
    claimedAt: r.claimed_at ?? null,
  }));
}

export async function claimRewardGrant(
  env: Env,
  uid: string,
  p: Progression,
  grantIdRaw: unknown,
  waitUntil: (pr: Promise<unknown>) => void,
): Promise<{ coins: number; lockedCoins: number }> {
  const grantId = typeof grantIdRaw === "string" ? grantIdRaw : "";
  if (!grantId || grantId.length > 200) throw httpsError("invalid-argument", "grantId is required.");
  const grant = await env.DB.prepare(`SELECT id, source_type, coins, status, note FROM reward_grants WHERE id = ? AND uid = ?`)
    .bind(grantId, uid).first<{ id: string; source_type: string; coins: number; status: string; note: string | null }>();
  // Contest Diamonds belong to the contest economy, not the gamification
  // experience switch; everything else needs the experience on.
  if (grant?.source_type !== "contest" && !experienceOn(p.cfg, uid)) throw httpsError("failed-precondition", "Rewards are not available yet.");
  // Someone else's grant answers exactly like a missing one.
  if (!grant) throw httpsError("not-found", "Reward not found.");
  if (grant.status === "claimed") throw httpsError("already-exists", "Reward already claimed.");
  if (grant.status === "held") throw httpsError("failed-precondition", "Aapke rewards review me hain. Review ke baad claim kar sakte ho.", "rewards_held");
  if (grant.status !== "claimable") throw httpsError("failed-precondition", "This reward is no longer available.");
  const coins = Math.floor(Number(grant.coins));
  if (!Number.isInteger(coins) || coins <= 0 || coins > MAX_COIN_AMOUNT) throw httpsError("internal", "Reward is misconfigured.");

  const budgetId = await rewardBudgetFor(env, p);
  if (!budgetId) {
    throw httpsError("failed-precondition", "Coin rewards are not available right now. Your reward is saved — try again later.", REWARD_BUDGET_UNAVAILABLE);
  }
  const ts = Date.now();
  const ledgerId = `reward_grant:${grantId}`;
  // Rewards Center Diamonds have their own ledger type and share the daily
  // free Diamond cap; level-milestone and season grants keep theirs.
  const type = GRANT_LEDGER_TYPE[grant.source_type] ?? "gamification_reward";
  const capped = type !== "gamification_reward";
  const dayStart = rewardDayStart(ts, p.settings.dayResetOffsetMinutes);
  const cap = capped ? economyConfig(await getAppConfig(env)).dailyFreeDiamondCap : 0;
  if (capped) await assertUnderFreeDiamondCap(env, cap, uid, dayStart, coins);
  const capGate = freeDiamondCapGate(cap, uid, dayStart, coins);
  const gate = `EXISTS (SELECT 1 FROM reward_grants WHERE id = ? AND uid = ? AND status = 'claimable')
    AND NOT EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)
    AND EXISTS (SELECT 1 FROM users WHERE uid = ?)
    AND ${capGate.sql}`;
  const gateArgs = [grantId, uid, ledgerId, uid, ...capGate.args];
  const budget = freeRewardBudgetStatements(env, {
    budgetId, refId: ledgerId, uid, coins, ts, label: grant.note || "Milestone reward", gate, gateArgs,
  });
  // Credit before the ledger insert so both read the same snapshot (same shape as claimDailyTask).
  const results = await env.DB.batch([
    ...budget.reserve,
    env.DB.prepare(`UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ? WHERE uid = ? AND ${gate} AND ${budget.heldGate}`)
      .bind(coins, coins, ts, uid, ...gateArgs, ...budget.heldArgs),
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta, budget_id)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${gate} AND ${budget.heldGate}`,
    ).bind(ledgerId, uid, coins, type, `${grant.note || "Milestone reward"} · Diamond`, ts, coins, budgetId, ...gateArgs, ...budget.heldArgs),
    ...budget.finalize,
    env.DB.prepare(`UPDATE reward_grants SET status = 'claimed', claimed_at = ?, updated_at = ? WHERE id = ? AND status = 'claimable'
        AND EXISTS (SELECT 1 FROM coin_transactions WHERE id = ? AND created_at = ?)`).bind(ts, ts, grantId, ledgerId, ts),
  ]);
  if (Number(results[budget.reserve.length]?.meta?.changes || 0) === 0) {
    const credited = await env.DB.prepare(`SELECT 1 AS x FROM coin_transactions WHERE id = ?`).bind(ledgerId).first();
    if (credited) throw httpsError("already-exists", "Reward already claimed.");
    if (capped) await assertUnderFreeDiamondCap(env, cap, uid, dayStart, coins);
    waitUntil(notifyBudgetExhausted(env, budgetId, "Gamification rewards (level milestones / seasons)"));
    throw httpsError("failed-precondition", "Rewards are used up for now. Your reward is saved — try again later.", FREE_REWARDS_EXHAUSTED);
  }
  return { coins, lockedCoins: coins };
}
