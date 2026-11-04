/**
 * Special events: admin-made, time-limited earning campaigns (migration 0086).
 *
 *   - An event has a window (starts_at..ends_at), a status (draft | active |
 *     paused | archived), eligibility (min level, account age, verified email
 *     or phone), an optional Diamond budget and 1-10 tasks.
 *   - A user JOINS (participation tracking). Each task's progress is counted on
 *     the server from max(event start, join time) to min(now, event end), with
 *     the quest metrics (lib/quests.ts questProgress). Nothing the client sends
 *     counts as progress.
 *   - A completed task is claimed once for Diamonds: claim row + credit + ledger
 *     (`event:<event>:<task>:<uid>`, type `event_reward`) in one D1 batch. The
 *     claim row is written only under the daily free Diamond cap and the event
 *     budget (sum of claims); the credit is gated on the free-rewards budget, so
 *     a "budget used up" claim pays once on a later retry. Held accounts
 *     (bonus-chasing guard) cannot claim until reviewed.
 *   - Claims stay open for CLAIM_GRACE_MS after the event ends, for tasks
 *     completed in time.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { getAppConfig } from "./settings";
import { rewardDayNumber, rewardDayStart } from "./gamification";
import { assertUnderFreeDiamondCap, economyConfig, freeDiamondCapGate } from "./economyLimits";
import { FREE_REWARDS_EXHAUSTED, freeRewardBudgetStatements, freeRewardsBudgetId } from "./promoBudget";
import { levelFor, QUEST_METRICS, type Progression, type QuestMetric } from "./progression";
import { questProgress, type Period } from "./quests";
import { rewardsHeld } from "./rewardIntegrity";

export const EVENT_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
/** What users see, derived from status + window. */
export type EventPhase = "scheduled" | "live" | "ended" | "paused" | "draft" | "archived";
export const EVENT_LIMITS = { title: 60, description: 300, tasks: 10, taskTitle: 80, target: 100_000, coins: 100_000, budget: 100_000_000, maxDays: 90 } as const;
export const CLAIM_GRACE_MS = 24 * 3_600_000;
const ID_RE = /^[a-z0-9_-]{2,40}$/;
const DAY_MS = 86_400_000;

export interface EventTask {
  id: string;
  title: string;
  metric: QuestMetric;
  target: number;
  coins: number;
}

export interface RewardEvent {
  id: string;
  title: string;
  description: string;
  bannerUrl: string | null;
  status: EventStatus;
  startsAt: number;
  endsAt: number;
  minLevel: number;
  minAccountAgeDays: number;
  requireVerified: boolean;
  totalBudget: number | null;
  tasks: EventTask[];
  sort: number;
}

export function phaseOf(e: Pick<RewardEvent, "status" | "startsAt" | "endsAt">, now = Date.now()): EventPhase {
  if (e.status !== "active") return e.status;
  if (now < e.startsAt) return "scheduled";
  if (now >= e.endsAt) return "ended";
  return "live";
}

function parseTasks(raw: unknown): EventTask[] {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((t) => t && typeof t.id === "string") : [];
  } catch {
    return [];
  }
}

export function rowToEvent(r: any): RewardEvent {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    bannerUrl: r.banner_url ?? null,
    status: r.status,
    startsAt: Number(r.starts_at),
    endsAt: Number(r.ends_at),
    minLevel: Number(r.min_level) || 1,
    minAccountAgeDays: Number(r.min_account_age_days) || 0,
    requireVerified: !!r.require_verified,
    totalBudget: r.total_budget == null ? null : Number(r.total_budget),
    tasks: parseTasks(r.tasks),
    sort: Number(r.sort) || 0,
  };
}

/** Admin write validation. Throws invalid-argument with a readable message. */
export function validateEventInput(b: any, isSafeImage: (u: string) => boolean): Omit<RewardEvent, "id"> {
  const bad = (m: string): never => {
    throw httpsError("invalid-argument", m);
  };
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  if (!title || title.length > EVENT_LIMITS.title) bad(`Title is required (max ${EVENT_LIMITS.title}).`);
  const description = typeof b?.description === "string" ? b.description.trim() : "";
  if (description.length > EVENT_LIMITS.description) bad(`Description: max ${EVENT_LIMITS.description} characters.`);
  const bannerUrl = b?.bannerUrl ? String(b.bannerUrl) : null;
  if (bannerUrl && !isSafeImage(bannerUrl)) bad("Banner must be an https image uploaded from the panel.");
  const status = String(b?.status ?? "draft");
  if (!(EVENT_STATUSES as readonly string[]).includes(status)) bad(`Status must be ${EVENT_STATUSES.join(", ")}.`);
  const startsAt = Number(b?.startsAt);
  const endsAt = Number(b?.endsAt);
  if (!Number.isInteger(startsAt) || startsAt <= 0) bad("Start time is required.");
  if (!Number.isInteger(endsAt) || endsAt <= startsAt) bad("End time must be after the start time.");
  if (endsAt - startsAt > EVENT_LIMITS.maxDays * DAY_MS) bad(`An event can run for at most ${EVENT_LIMITS.maxDays} days.`);
  const int = (v: unknown, field: string, min: number, max: number, dflt: number) => {
    if (v === undefined || v === null || v === "") return dflt;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) bad(`${field} must be a whole number from ${min} to ${max}.`);
    return n;
  };
  const minLevel = int(b?.minLevel, "Min level", 1, 1000, 1);
  const minAccountAgeDays = int(b?.minAccountAgeDays, "Min account age (days)", 0, 3650, 0);
  const totalBudget = b?.totalBudget === null || b?.totalBudget === undefined || b?.totalBudget === "" ? null : int(b.totalBudget, "Event budget", 1, EVENT_LIMITS.budget, 0);
  const sort = int(b?.sort, "Sort", -1_000_000, 1_000_000, 0);
  if (!Array.isArray(b?.tasks) || b.tasks.length < 1 || b.tasks.length > EVENT_LIMITS.tasks) bad(`An event needs 1-${EVENT_LIMITS.tasks} tasks.`);
  const ids = new Set<string>();
  const tasks: EventTask[] = (b.tasks as any[]).map((t, i) => {
    const id = typeof t?.id === "string" ? t.id.trim() : "";
    if (!ID_RE.test(id)) bad(`Task ${i + 1}: id must be 2-40 lowercase letters, digits, _ or -.`);
    if (ids.has(id)) bad(`Task id "${id}" is used twice.`);
    ids.add(id);
    const tTitle = typeof t?.title === "string" ? t.title.trim() : "";
    if (!tTitle || tTitle.length > EVENT_LIMITS.taskTitle) bad(`Task "${id}": title is required (max ${EVENT_LIMITS.taskTitle}).`);
    if (!(QUEST_METRICS as readonly string[]).includes(t?.metric)) bad(`Task "${id}": metric must be ${QUEST_METRICS.join(", ")}.`);
    return {
      id,
      title: tTitle,
      metric: t.metric,
      target: int(t?.target, `Task "${id}" target`, 1, EVENT_LIMITS.target, 1),
      coins: int(t?.coins, `Task "${id}" Diamonds`, 1, EVENT_LIMITS.coins, 1),
    };
  });
  return { title, description, bannerUrl, status: status as EventStatus, startsAt, endsAt, minLevel, minAccountAgeDays, requireVerified: b?.requireVerified === true, totalBudget, tasks, sort };
}

/** The progress window for one participant: from max(start, join) to min(now, end). */
export function progressPeriod(e: RewardEvent, joinedAt: number, now: number, offsetMinutes: number): Period {
  const startMs = Math.max(e.startsAt, joinedAt);
  const endMs = Math.max(startMs, Math.min(now, e.endsAt));
  return {
    key: `event:${e.id}`,
    startMs,
    endMs,
    startDay: rewardDayNumber(startMs, offsetMinutes),
    endDay: rewardDayNumber(Math.max(startMs, endMs - 1), offsetMinutes),
  };
}

interface UserRow { xp: number; created_at: number; email_verified: number; phone_verified: number; status: string }

/** Why `user` may not take part, or null when eligible. */
export function ineligibility(e: RewardEvent, user: UserRow, p: Progression, now: number): string | null {
  if (user.status && user.status !== "active") return "Ye account events me hissa nahi le sakta.";
  if (levelFor(user.xp ?? 0, p.curve) < e.minLevel) return `Level ${e.minLevel} par unlock hoga.`;
  if (e.minAccountAgeDays > 0 && now - Number(user.created_at) < e.minAccountAgeDays * DAY_MS) return `Account kam se kam ${e.minAccountAgeDays} din purana hona chahiye.`;
  if (e.requireVerified && !user.email_verified && !user.phone_verified) return "Email ya mobile verify karo, phir join karo.";
  return null;
}

async function loadUser(env: Env, uid: string): Promise<UserRow> {
  const u = await env.DB.prepare(`SELECT xp, created_at, email_verified, phone_verified, status FROM users WHERE uid = ?`).bind(uid).first<UserRow>();
  if (!u) throw httpsError("not-found", "User not found.");
  return u;
}

async function loadEvent(env: Env, id: unknown): Promise<RewardEvent> {
  if (typeof id !== "string" || !ID_RE.test(id)) throw httpsError("invalid-argument", "eventId is required.");
  const r = await env.DB.prepare(`SELECT * FROM reward_events WHERE id = ?`).bind(id).first<any>();
  if (!r || r.status === "draft") throw httpsError("not-found", "Event not found.");
  return rowToEvent(r);
}

/** Events a user can see: live, scheduled, and those ended within the claim grace. */
export async function listEvents(env: Env, uid: string, p: Progression, now = Date.now()) {
  const rows = await env.DB.prepare(
    `SELECT * FROM reward_events WHERE status IN ('active', 'paused') AND ends_at > ? ORDER BY sort, starts_at LIMIT 20`,
  ).bind(now - CLAIM_GRACE_MS).all<any>();
  const events = (rows.results ?? []).map(rowToEvent).filter((e) => e.status === "active");
  if (!events.length) return [];
  const user = await loadUser(env, uid);
  const ids = events.map((e) => e.id);
  const ph = ids.map(() => "?").join(", ");
  const joined = await env.DB.prepare(`SELECT event_id, joined_at FROM reward_event_participants WHERE uid = ? AND event_id IN (${ph})`).bind(uid, ...ids).all<any>();
  const joinedAt = new Map((joined.results ?? []).map((r) => [r.event_id, Number(r.joined_at)]));
  const claims = await env.DB.prepare(`SELECT event_id, task_id FROM reward_event_claims WHERE uid = ? AND event_id IN (${ph})`).bind(uid, ...ids).all<any>();
  const claimed = new Set((claims.results ?? []).map((r) => `${r.event_id}|${r.task_id}`));
  const spent = await env.DB.prepare(`SELECT event_id, COALESCE(SUM(coins), 0) AS s FROM reward_event_claims WHERE event_id IN (${ph}) GROUP BY event_id`).bind(...ids).all<any>();
  const spentBy = new Map((spent.results ?? []).map((r) => [r.event_id, Number(r.s)]));
  const off = p.settings.dayResetOffsetMinutes;
  const out = [];
  for (const e of events) {
    const phase = phaseOf(e, now);
    const j = joinedAt.get(e.id) ?? null;
    const used = spentBy.get(e.id) ?? 0;
    const budgetLeft = e.totalBudget == null ? null : Math.max(0, e.totalBudget - used);
    const tasks = [];
    for (const t of e.tasks) {
      const progress = j != null && phase !== "scheduled" ? Math.min(t.target, await questProgress(env, uid, t.metric, progressPeriod(e, j, now, off))) : 0;
      const isClaimed = claimed.has(`${e.id}|${t.id}`);
      tasks.push({
        ...t,
        progress,
        claimed: isClaimed,
        claimable: j != null && !isClaimed && progress >= t.target && (phase === "live" || phase === "ended") && (budgetLeft == null || budgetLeft >= t.coins),
      });
    }
    out.push({
      id: e.id,
      title: e.title,
      description: e.description,
      bannerUrl: e.bannerUrl,
      phase,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      claimUntil: e.endsAt + CLAIM_GRACE_MS,
      joined: j != null,
      joinedAt: j,
      blockedReason: ineligibility(e, user, p, now),
      budgetLeft,
      totalCoins: e.tasks.reduce((s, t) => s + t.coins, 0),
      tasks,
    });
  }
  // Ended events only matter while they still have something to claim.
  return out.filter((e) => e.phase !== "ended" || e.tasks.some((t) => t.claimable));
}

export async function joinEvent(env: Env, uid: string, p: Progression, eventId: unknown, now = Date.now()) {
  const e = await loadEvent(env, eventId);
  const phase = phaseOf(e, now);
  if (phase === "scheduled") throw httpsError("failed-precondition", "Ye event abhi shuru nahi hua.");
  if (phase !== "live") throw httpsError("failed-precondition", "Ye event ab live nahi hai.");
  const why = ineligibility(e, await loadUser(env, uid), p, now);
  if (why) throw httpsError("failed-precondition", why, "event_ineligible");
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO reward_event_participants (event_id, uid, joined_at) VALUES (?, ?, ?)`).bind(e.id, uid, now).run();
  return { joined: true, alreadyJoined: Number(r.meta?.changes || 0) === 0 };
}

export async function claimEventTask(env: Env, uid: string, p: Progression, eventId: unknown, taskId: unknown, now = Date.now()) {
  const e = await loadEvent(env, eventId);
  const task = e.tasks.find((t) => t.id === taskId);
  if (!task) throw httpsError("not-found", "Unknown task.");
  const phase = phaseOf(e, now);
  if (phase !== "live" && !(phase === "ended" && now < e.endsAt + CLAIM_GRACE_MS)) throw httpsError("failed-precondition", "Ye event ab claim ke liye open nahi hai.");
  const joined = await env.DB.prepare(`SELECT joined_at FROM reward_event_participants WHERE event_id = ? AND uid = ?`).bind(e.id, uid).first<{ joined_at: number }>();
  if (!joined) throw httpsError("failed-precondition", "Pehle event join karo.");
  const why = ineligibility(e, await loadUser(env, uid), p, now);
  if (why) throw httpsError("failed-precondition", why, "event_ineligible");
  const off = p.settings.dayResetOffsetMinutes;
  if ((await questProgress(env, uid, task.metric, progressPeriod(e, Number(joined.joined_at), now, off))) < task.target) {
    throw httpsError("failed-precondition", "Task abhi poora nahi hua.");
  }
  if (await rewardsHeld(env, p, uid)) throw httpsError("failed-precondition", "Aapke rewards review me hain. Review ke baad claim kar sakte ho.", "rewards_held");

  const coins = task.coins;
  const appCfg = await getAppConfig(env);
  const dayStart = rewardDayStart(now, off);
  const cap = economyConfig(appCfg).dailyFreeDiamondCap;
  await assertUnderFreeDiamondCap(env, cap, uid, dayStart, coins);
  const capGate = freeDiamondCapGate(cap, uid, dayStart, coins);
  const budgetGate = e.totalBudget == null
    ? { sql: "1 = 1", args: [] as unknown[] }
    : { sql: `(SELECT COALESCE(SUM(coins), 0) FROM reward_event_claims WHERE event_id = ?) + ? <= ?`, args: [e.id, coins, e.totalBudget] };
  const ledgerId = `event:${e.id}:${task.id}:${uid}`;
  const gate = `EXISTS (SELECT 1 FROM reward_event_claims WHERE event_id = ? AND task_id = ? AND uid = ?)
    AND NOT EXISTS (SELECT 1 FROM coin_transactions WHERE id = ?)
    AND EXISTS (SELECT 1 FROM users WHERE uid = ?)
    AND ${capGate.sql}`;
  const gateArgs = [e.id, task.id, uid, ledgerId, uid, ...capGate.args];
  const budget = freeRewardBudgetStatements(env, {
    budgetId: freeRewardsBudgetId(appCfg), refId: ledgerId, uid, coins, ts: now, label: `Event "${e.title}"`, gate, gateArgs,
  });
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO reward_event_claims (event_id, task_id, uid, coins, created_at)
       SELECT ?, ?, ?, ?, ? WHERE ${capGate.sql} AND ${budgetGate.sql}`,
    ).bind(e.id, task.id, uid, coins, now, ...capGate.args, ...budgetGate.args),
    ...budget.reserve,
    env.DB.prepare(`UPDATE users SET dpcoin = dpcoin + ?, locked_coins = locked_coins + ?, updated_at = ? WHERE uid = ? AND ${gate} AND ${budget.heldGate}`)
      .bind(coins, coins, now, uid, ...gateArgs, ...budget.heldArgs),
    env.DB.prepare(
      `INSERT OR IGNORE INTO coin_transactions (id, uid, amount, type, description, created_at, locked_delta)
       SELECT ?, ?, ?, 'event_reward', ?, ?, ? WHERE ${gate} AND ${budget.heldGate}`,
    ).bind(ledgerId, uid, coins, `Event reward: ${e.title} · ${task.title} · Diamond`, now, coins, ...gateArgs, ...budget.heldArgs),
    ...budget.finalize,
  ]);
  const claimWritten = Number(res[0]?.meta?.changes || 0) > 0;
  const credited = Number(res[1 + budget.reserve.length]?.meta?.changes || 0) > 0;
  if (credited) return { diamonds: coins };
  const claimRow = await env.DB.prepare(`SELECT 1 AS x FROM reward_event_claims WHERE event_id = ? AND task_id = ? AND uid = ?`).bind(e.id, task.id, uid).first();
  const paid = await env.DB.prepare(`SELECT 1 AS x FROM coin_transactions WHERE id = ?`).bind(ledgerId).first();
  if (paid) throw httpsError("already-exists", "Ye reward pehle hi claim ho chuka hai.");
  if (!claimRow) {
    await assertUnderFreeDiamondCap(env, cap, uid, dayStart, coins);
    throw httpsError("failed-precondition", "Is event ka reward budget khatam ho gaya.", "event_budget_exhausted");
  }
  void claimWritten;
  throw httpsError("failed-precondition", "Rewards abhi khatam ho gaye hain. Aapka reward save hai, thodi der baad claim karo.", FREE_REWARDS_EXHAUSTED);
}

/** Admin: per-event participation and payout stats. */
export async function eventStats(env: Env, ids: string[]) {
  if (!ids.length) return new Map<string, { participants: number; claims: number; diamonds: number }>();
  const ph = ids.map(() => "?").join(", ");
  const [p, c] = await Promise.all([
    env.DB.prepare(`SELECT event_id, COUNT(*) AS n FROM reward_event_participants WHERE event_id IN (${ph}) GROUP BY event_id`).bind(...ids).all<any>(),
    env.DB.prepare(`SELECT event_id, COUNT(*) AS n, COALESCE(SUM(coins), 0) AS s FROM reward_event_claims WHERE event_id IN (${ph}) GROUP BY event_id`).bind(...ids).all<any>(),
  ]);
  const out = new Map<string, { participants: number; claims: number; diamonds: number }>();
  for (const id of ids) out.set(id, { participants: 0, claims: 0, diamonds: 0 });
  for (const r of p.results ?? []) out.get(r.event_id)!.participants = Number(r.n);
  for (const r of c.results ?? []) Object.assign(out.get(r.event_id)!, { claims: Number(r.n), diamonds: Number(r.s) });
  return out;
}
