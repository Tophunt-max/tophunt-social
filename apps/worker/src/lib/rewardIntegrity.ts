/**
 * Level reward integrity: the bonus-chasing guard and level clawback.
 *
 * Level rewards (free XP level items, milestone items, milestone Diamond) are
 * earned from XP. Two things used to let farmed XP turn into permanent rewards:
 *
 *  1. HOLD (bonus-chasing guard). While an account has an OPEN abuse flag
 *     (velocity, same-device battle, ledger mismatch), new level rewards are not
 *     paid out: items are not granted and milestone Diamond is created as
 *     `held` instead of `claimable`. Progress (XP, level) is untouched. When an
 *     admin reviews the flag, `settleLevelRewards` pays out whatever the
 *     account's real XP still earns. Switch: progression.holdRewardsWhenFlagged.
 *
 *  2. CLAWBACK. When XP goes down (an admin reversal or negative adjustment),
 *     rewards for levels above the new level are taken back: level items are
 *     revoked (reason `level_clawback`) and unequipped, unclaimed level Diamond
 *     becomes `clawed_back`, and `level_seen` is lowered. Re-reaching the level
 *     restores exactly those rows, so a legitimate user never loses anything
 *     for good. Already-claimed Diamond is not debited; it is reported.
 *
 * Shop purchases, achievements, seasons and admin grants are never touched:
 * only rows with source `xp_level` / `level` and a `level:N` reference.
 */
import type { Env } from "../types";
import { EQUIP_SLOTS } from "./cosmetics";
import { levelFor, type Progression } from "./progression";
import { grantMilestoneItems, grantXpCosmeticItems } from "./achievements";

/** Flag kinds that hold level rewards while open. */
export const HOLD_FLAG_KINDS = ["velocity", "same_device_match", "ledger_mismatch"] as const;
export const CLAWBACK_REASON = "level_clawback";
const LEVEL_SOURCES = `('xp_level', 'level')`;
const REF_LEVEL = `CAST(substr(source_ref, 7) AS INTEGER)`;

/** True while level rewards for `uid` are on hold (guard on + an open abuse flag). */
export async function rewardsHeld(env: Env, p: Progression, uid: string): Promise<boolean> {
  if (p.cfg.holdRewardsWhenFlagged === false) return false;
  const row = await env.DB.prepare(
    `SELECT 1 AS x FROM xp_flags WHERE uid = ? AND status = 'open' AND kind IN (${HOLD_FLAG_KINDS.map(() => "?").join(", ")}) LIMIT 1`,
  ).bind(uid, ...HOLD_FLAG_KINDS).first();
  return !!row;
}

export interface SettleResult {
  level: number;
  held: boolean;
  itemsRevoked: string[];
  itemsRestored: number;
  itemsGranted: string[];
  grantsClawedBack: number;
  grantsReleased: number;
  claimedAboveLevel: number;
}

/**
 * Bring an account's level rewards in line with its real XP. Idempotent; safe
 * to call any number of times (admin review, XP corrections, full syncs).
 */
export async function settleLevelRewards(env: Env, p: Progression, uid: string, ts = Date.now()): Promise<SettleResult | null> {
  const user = await env.DB.prepare(`SELECT xp, level_seen, status FROM users WHERE uid = ?`).bind(uid).first<{ xp: number; level_seen: number | null; status: string }>();
  if (!user || user.status === "deleted") return null;
  const level = levelFor(user.xp ?? 0, p.curve);
  const held = await rewardsHeld(env, p, uid);

  // 1. Clawback above the real level.
  const above = await env.DB.prepare(
    `SELECT item_id FROM user_inventory
      WHERE uid = ? AND revoked_at IS NULL AND source IN ${LEVEL_SOURCES} AND source_ref LIKE 'level:%' AND ${REF_LEVEL} > ?`,
  ).bind(uid, level).all<{ item_id: string }>();
  const itemsRevoked = (above.results ?? []).map((r) => r.item_id);
  const clawStmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE user_inventory SET revoked_at = ?, revoke_reason = ?
        WHERE uid = ? AND revoked_at IS NULL AND source IN ${LEVEL_SOURCES} AND source_ref LIKE 'level:%' AND ${REF_LEVEL} > ?`,
    ).bind(ts, CLAWBACK_REASON, uid, level),
    ...itemsRevoked.flatMap((itemId) =>
      EQUIP_SLOTS.map((slot) =>
        env.DB.prepare(`UPDATE users SET cosmetics = json_remove(cosmetics, ?) WHERE uid = ? AND json_extract(cosmetics, ?) = ?`)
          .bind(`$.${slot}`, uid, `$.${slot}`, itemId),
      ),
    ),
    env.DB.prepare(
      `UPDATE reward_grants SET status = 'clawed_back', updated_at = ?
        WHERE uid = ? AND source_type = 'level' AND status IN ('claimable', 'held') AND CAST(source_id AS INTEGER) > ?`,
    ).bind(ts, uid, level),
    env.DB.prepare(`UPDATE users SET level_seen = ? WHERE uid = ? AND level_seen > ?`).bind(level, uid, level),
  ];
  const claw = await env.DB.batch(clawStmts);
  const grantsClawedBack = Number(claw[claw.length - 2]?.meta?.changes || 0);
  const claimed = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM reward_grants WHERE uid = ? AND source_type = 'level' AND status = 'claimed' AND CAST(source_id AS INTEGER) > ?`,
  ).bind(uid, level).first<{ n: number }>();

  // 2. At or below the real level: hold, or pay out.
  let itemsRestored = 0;
  let itemsGranted: string[] = [];
  let grantsReleased = 0;
  if (held) {
    // Earned again, but the account is under review: back to held, not claimable.
    await env.DB.prepare(
      `UPDATE reward_grants SET status = 'held', updated_at = ?
        WHERE uid = ? AND source_type = 'level' AND status = 'clawed_back' AND CAST(source_id AS INTEGER) <= ?`,
    ).bind(ts, uid, level).run();
  } else {
    const res = await env.DB.batch([
      env.DB.prepare(
        `UPDATE user_inventory SET revoked_at = NULL, revoke_reason = NULL
          WHERE uid = ? AND revoke_reason = ? AND source IN ${LEVEL_SOURCES} AND source_ref LIKE 'level:%' AND ${REF_LEVEL} <= ?`,
      ).bind(uid, CLAWBACK_REASON, level),
      env.DB.prepare(
        `UPDATE reward_grants SET status = 'claimable', updated_at = ?
          WHERE uid = ? AND source_type = 'level' AND status IN ('held', 'clawed_back') AND CAST(source_id AS INTEGER) <= ?`,
      ).bind(ts, uid, level),
    ]);
    itemsRestored = Number(res[0]?.meta?.changes || 0);
    grantsReleased = Number(res[1]?.meta?.changes || 0);
    const [legacy, xp] = await Promise.all([
      grantMilestoneItems(env, p, uid, level, ts),
      grantXpCosmeticItems(env, uid, level, ts),
    ]);
    itemsGranted = [...legacy, ...xp];
  }

  return { level, held, itemsRevoked, itemsRestored, itemsGranted, grantsClawedBack, grantsReleased, claimedAboveLevel: Number(claimed?.n || 0) };
}

/**
 * Safety net for the display path (resolveCosmetics / card cosmetics render
 * whatever id is in users.cosmetics): strip equipped ids that have no live
 * inventory row. Every revoke path already unequips; this catches anything
 * that did not (a new path, a manual D1 edit). Bounded per run.
 */
export async function stripUnownedEquipped(env: Env, limit = 500): Promise<number> {
  let changed = 0;
  for (const slot of EQUIP_SLOTS) {
    const r = await env.DB.prepare(
      `UPDATE users SET cosmetics = json_remove(cosmetics, ?)
        WHERE rowid IN (
          SELECT u.rowid FROM users u
           WHERE u.cosmetics IS NOT NULL AND json_valid(u.cosmetics) AND json_extract(u.cosmetics, ?) IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM user_inventory i WHERE i.uid = u.uid AND i.item_id = json_extract(u.cosmetics, ?) AND i.revoked_at IS NULL)
           LIMIT ?)`,
    ).bind(`$.${slot}`, `$.${slot}`, `$.${slot}`, limit).run();
    changed += Number(r.meta?.changes || 0);
  }
  return changed;
}
