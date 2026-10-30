/**
 * /webhook — public, server-to-server callbacks (video encoder, AdMob SSV).
 *
 * These endpoints are NOT behind Firebase auth (the caller can't present a user
 * token). Trust comes entirely from verifying the caller's signature, so bodies
 * are read raw before any parsing.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { getDb, schema } from "../db";
import { createNotification } from "../lib/notify";
import { timingSafeEqualSecret } from "../lib/timingSafe";
import { callbackSignature, isVideoId, qencodeConfig, qencodeConfigured } from "../lib/qencode";
import { applyEncodeResult } from "../lib/videoReconcile";
import { creditVerifiedAdReward, verifySsv } from "../lib/admobSsv";
import { clientIp, consumeRateLimit } from "../lib/rateLimit";

export const webhookRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Qencode job callback (`callback_url` set by `startEncode`).
 *
 * Qencode POSTs form-encoded `task_token`, `event` (queued | saved | error) and a
 * `status` JSON on each job event. It does not sign them, and it cannot send a
 * custom header, so authentication is the per-video HMAC that `startEncode` put
 * in the callback URL (`?v=<videoId>&sig=<hmac>`). See `callbackSignature` for
 * why that is a per-video value and not a shared secret.
 *
 * The body is never trusted for STATE: this re-reads the job from Qencode's /v1/status (using the job handle
 * stored on OUR row) and the playlist from R2, through the same
 * `applyEncodeResult` the reconcile cron uses. A forged or replayed callback can
 * therefore only cause a re-check.
 *
 *  - 503 when Qencode is not configured, so nothing is processed half-wired;
 *  - 400 on a bad signature;
 *  - 200 otherwise, including internal failures — the cron reconciles them, and
 *    a retry storm would only repeat the same failure.
 */
webhookRoute.post("/qencode", async (c) => {
  if (!(await qencodeConfigured(c.env))) {
    console.error("[webhook/qencode] Qencode is not configured — rejecting");
    return c.json({ ok: false, error: "not_configured" }, 503);
  }
  const cfg = await qencodeConfig(c.env);
  if (!cfg) return c.json({ ok: false, error: "not_configured" }, 503);

  const videoId = c.req.query("v") || "";
  const presented = c.req.query("sig") || "";
  if (!isVideoId(videoId) || !presented) return c.json({ ok: false, error: "invalid_signature" }, 400);
  if (!(await timingSafeEqualSecret(presented, await callbackSignature(cfg, videoId)))) {
    console.warn("[webhook/qencode] invalid signature", videoId);
    return c.json({ ok: false, error: "invalid_signature" }, 400);
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await c.req.text());
  } catch {
    return c.json({ ok: false, error: "bad_body" }, 400);
  }
  const taskToken = form.get("task_token") || "";
  const event = form.get("event") || "";

  try {
    const db = getDb(c.env);
    const existing = await db
      .select({ id: schema.videos.id, status: schema.videos.status, jobId: schema.videos.jobId })
      .from(schema.videos)
      .where(eq(schema.videos.id, videoId))
      .get();
    // Deleted since (story removed mid-encode) — ack and move on.
    if (!existing) return c.json({ ok: true, ignored: "unknown_video" });
    // A callback for a job that is not this row's current one (an old job, or a
    // signature reused with someone else's token) changes nothing.
    if (taskToken && existing.jobId && taskToken !== existing.jobId) {
      return c.json({ ok: true, ignored: "stale_job" });
    }
    if (existing.status === "ready" || existing.status === "failed") {
      return c.json({ ok: true, ignored: `already_${existing.status}` });
    }
    // `queued` arrives right after start; there is nothing new to learn yet.
    if (event === "queued") return c.json({ ok: true, ignored: "queued" });

    const status = await applyEncodeResult(c.env, videoId, {
      scheduleNotify: (p) => c.executionCtx.waitUntil(p),
    });
    return c.json({ ok: true, status });
  } catch (e) {
    console.error("[webhook/qencode] processing failed", videoId, e);
    return c.json({ ok: true, error: "internal" });
  }
});

/**
 * AdMob rewarded-ad server-side verification callback (lib/admobSsv.ts).
 *
 * Trust comes only from Google's ECDSA signature over the raw query string.
 * Always answers 200 once the signature verifies (even for a duplicate or a
 * capped user) so AdMob does not retry; 4xx only for an unverifiable request.
 */
webhookRoute.get("/admob/ssv", async (c) => {
  // Coarse per-IP ceiling: verification fetches keys and does crypto.
  if (!(await consumeRateLimit(c.env, `ssv:${clientIp(c.req.raw.headers)}`, 600, 60))) {
    return c.json({ ok: false, error: "rate_limited" }, 429);
  }
  const rawQuery = new URL(c.req.url).search;
  const params = await verifySsv(rawQuery);
  if (!params) return c.json({ ok: false, error: "invalid_signature" }, 400);
  const outcome = await creditVerifiedAdReward(c.env, params);
  console.log(JSON.stringify({ evt: "admob_ssv", outcome, tx: params.transactionId }));
  if (outcome === "credited") {
    c.executionCtx.waitUntil(
      createNotification(c.env, params.userId, {
        title: "Reward added",
        body: "Thanks for watching. Your Diamonds have been added.",
        type: "ad_reward",
        targetId: "wallet",
      }).catch(() => undefined),
    );
  }
  return c.json({ ok: true, outcome });
});
