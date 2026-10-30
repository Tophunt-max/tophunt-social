/**
 * `/api` actions for gifts, the digital store, ad diagnostics and sponsored
 * delivery events. Dispatched from routes/api.ts like the gamification actions.
 *
 * Money-moving actions use fail-CLOSED rate limits. Retries are made safe by a
 * client `requestId` (lib/coinSpend.ts), not the generic `idempotencyKey`, so a
 * retry returns the original result instead of a "duplicate request" error.
 */
import type { Env } from "../types";
import { httpsError } from "./http";
import { consumeRateLimit, rateLimit } from "./rateLimit";
import { giftHistory, listLiveGifts, sendGift } from "./gifts";
import { buyStoreItem, listStore } from "./store";
import { recordAdEvents } from "./adMetrics";
import { recordCampaignEvent } from "./sponsored";
import { createNotification } from "./notify";

export const MONETIZATION_ACTIONS = new Set([
  "getGiftCatalog",
  "sendGift",
  "getGiftHistory",
  "getStore",
  "buyStoreItem",
  "recordAdEvents",
  "recordSponsoredEvent",
]);

interface Ctx {
  env: Env;
  uid: string;
  body: any;
  waitUntil: (p: Promise<unknown>) => void;
  purgeProfile: () => void;
}

export async function handleMonetizationAction(action: string, ctx: Ctx): Promise<unknown> {
  const { env, uid, body } = ctx;
  switch (action) {
    case "getGiftCatalog": {
      await rateLimit(env, `giftcat:${uid}`, 60, 60);
      return { gifts: await listLiveGifts(env) };
    }

    case "sendGift": {
      await rateLimit(env, `gift:${uid}`, 30, 60, { failClosed: true });
      const result = await sendGift(env, uid, {
        recipientUid: body.recipientUid,
        giftId: body.giftId,
        quantity: body.quantity,
        expectedUnitPrice: body.expectedUnitPrice,
        requestId: body.requestId,
        contextType: body.contextType,
        contextId: body.contextId,
      });
      if (!result.replayed) {
        ctx.waitUntil(
          (async () => {
            const sender = await env.DB.prepare(`SELECT username, profile_image_url FROM users WHERE uid = ?`).bind(uid).first<any>();
            await createNotification(env, result.recipientUid, {
              title: "You received a gift",
              body: `${sender?.username ? "@" + sender.username : "Someone"} sent you ${result.quantity > 1 ? `${result.quantity} × ` : ""}${result.giftName}`,
              type: "gift",
              targetId: uid,
              actor: { uid, username: sender?.username ?? null, avatarUrl: sender?.profile_image_url ?? null },
              noCollapse: true,
            });
          })().catch((e) => console.error("[gifts] notify failed", e)),
        );
        ctx.purgeProfile();
      }
      return { success: true, gift: result };
    }

    case "getGiftHistory": {
      await rateLimit(env, `gifthist:${uid}`, 60, 60);
      const direction = body.direction === "received" ? "received" : "sent";
      const before = body.cursor == null ? null : Number(body.cursor);
      if (before !== null && !(before > 0)) throw httpsError("invalid-argument", "cursor is invalid.");
      const limit = Math.min(Math.max(Number(body.limit) || 30, 1), 50);
      return giftHistory(env, uid, direction, before, limit);
    }

    case "getStore": {
      await rateLimit(env, `storecat:${uid}`, 60, 60);
      return { items: await listStore(env, uid) };
    }

    case "buyStoreItem": {
      await rateLimit(env, `storebuy:${uid}`, 20, 60, { failClosed: true });
      const purchase = await buyStoreItem(env, uid, { itemId: body.itemId, expectedPrice: body.expectedPrice, requestId: body.requestId });
      if (!purchase.replayed) ctx.purgeProfile();
      return { success: true, purchase };
    }

    case "recordAdEvents": {
      // Diagnostics only; a dropped batch costs nothing, so this fails open.
      if (!(await consumeRateLimit(env, `adev:${uid}`, 30, 60))) return { recorded: 0, throttled: true };
      const platform = typeof body.platform === "string" ? body.platform : "";
      const events = Array.isArray(body.events) ? body.events.map((e: any) => ({ ...e, platform: e?.platform ?? platform })) : body.events;
      return { recorded: await recordAdEvents(env, events) };
    }

    case "recordSponsoredEvent": {
      const campaignId = typeof body.campaignId === "string" && body.campaignId.length <= 64 ? body.campaignId : "";
      const event = body.event === "click" ? "click" : body.event === "impression" ? "impression" : null;
      if (!campaignId || !event) throw httpsError("invalid-argument", "campaignId and event (impression|click) are required.");
      // One impression per viewer per campaign per hour; one click per 10 min.
      const fresh = await consumeRateLimit(env, `sp${event === "click" ? "clk" : "imp"}:${uid}:${campaignId}`, 1, event === "click" ? 600 : 3600);
      if (!fresh) return { counted: false };
      return { counted: await recordCampaignEvent(env, campaignId, event) };
    }
  }
  throw httpsError("invalid-argument", `Action '${action}' nahi mila.`);
}
