/**
 * Hourly gamification job (index.ts, `0 * * * *`), every step idempotent:
 *
 *   1. Seasons: activate due ones, finalize ended ones (lib/seasons.ts).
 *   2. Progression sync for accounts that earned XP in the last ~hour without
 *      an app read (votes are credited by the VoteCounter Durable Object, which
 *      does not sync), so their level-ups and achievements are announced.
 *   3. Ledger reconciliation for the same accounts: users.xp must equal the
 *      sum of their XP events. A mismatch raises a review flag; nothing is
 *      corrected automatically.
 *   4. Once a day (03:00 UTC run): unequip any equipped cosmetic the account no
 *      longer owns (lib/rewardIntegrity.ts stripUnownedEquipped), a safety net
 *      for the display path, which renders users.cosmetics as stored.
 */
import type { Env } from "../types";
import { syncProgressionSafe } from "./achievements";
import { experienceOn, getProgression } from "./progression";
import { seasonTick } from "./seasons";
import { reconcileXp } from "./xpService";
import { stripUnownedEquipped } from "./rewardIntegrity";

const WINDOW_MS = 75 * 60 * 1000;
const MAX_USERS = 200;

export async function gamificationHourly(env: Env): Promise<{ seasons: unknown; synced: number; mismatches: number; unequipped: number }> {
  const seasons = await seasonTick(env);
  const p = await getProgression(env);
  const since = Date.now() - WINDOW_MS;
  const rows = await env.DB.prepare(
    `SELECT DISTINCT uid FROM user_xp_events WHERE created_at > ? AND action <> 'opening_balance' LIMIT ${MAX_USERS}`,
  ).bind(since).all<{ uid: string }>();
  const uids = (rows.results ?? []).map((r) => r.uid);
  let synced = 0;
  for (const uid of uids) {
    if (!experienceOn(p.cfg, uid)) continue;
    await syncProgressionSafe(env, uid);
    synced++;
  }
  const mismatches = await reconcileXp(env, uids);
  if (mismatches.length) {
    const ts = Date.now();
    await env.DB.batch(
      mismatches.map((m) =>
        env.DB.prepare(`INSERT OR IGNORE INTO xp_flags (id, uid, kind, detail, status, created_at) VALUES (?, ?, 'ledger_mismatch', ?, 'open', ?)`)
          .bind(`ledger:${m.uid}:${Math.floor(ts / 86_400_000)}`, m.uid, JSON.stringify(m), ts),
      ),
    );
    console.error("[gamification] XP ledger mismatches", mismatches.length);
  }
  let unequipped = 0;
  if (new Date().getUTCHours() === 3) {
    unequipped = await stripUnownedEquipped(env).catch((e) => {
      console.error("[gamification] unowned-equipped sweep failed", e);
      return 0;
    });
    if (unequipped) console.warn("[gamification] unequipped unowned cosmetics", unequipped);
  }
  return { seasons, synced, mismatches: mismatches.length, unequipped };
}
