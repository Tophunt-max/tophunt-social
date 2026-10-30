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
import { listProducts, loadOrder, placeOrder, transitionOrder } from "./shop";
import { convertXp, xpConversionStatus } from "./xpConversion";
import { parseMonetizationConfig } from "./monetizationConfig";
import { getAppConfig } from "./settings";

async function assertShopOpen(env: Env): Promise<void> {
  if (!parseMonetizationConfig(await getAppConfig(env)).shop.enabled) {
    throw httpsError("failed-precondition", "Shop abhi band hai.", "shop_disabled");
  }
}

export const MONETIZATION_ACTIONS = new Set([
  "getGiftCatalog",
  "sendGift",
  "getGiftHistory",
  "getStore",
  "buyStoreItem",
  "recordAdEvents",
  "recordSponsoredEvent",
  "getShopProducts",
  "placeShopOrder",
  "getMyShopOrders",
  "getShopOrder",
  "cancelShopOrder",
  "requestShopReturn",
  "getXpConversion",
  "convertXp",
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

    // ---------------------------------------------------------- physical shop (lib/shop.ts)
    case "getShopProducts": {
      await rateLimit(env, `shopcat:${uid}`, 120, 60);
      await assertShopOpen(env);
      const category = typeof body.category === "string" && /^[a-z0-9_-]{2,40}$/.test(body.category) ? body.category : null;
      const productId = typeof body.productId === "string" && body.productId.length <= 64 ? body.productId : null;
      return { products: await listProducts(env, { category, productId }) };
    }

    case "placeShopOrder": {
      await rateLimit(env, `shoporder:${uid}`, 10, 60, { failClosed: true });
      await assertShopOpen(env);
      const order = await placeOrder(env, uid, { items: body.items, address: body.address, expectedTotalCoins: body.expectedTotalCoins, requestId: body.requestId, note: body.note });
      if (!order.replayed) {
        ctx.waitUntil(
          env.DB.prepare(
            `INSERT INTO admin_notifications (id, title, message, link, created_at) VALUES (?, ?, ?, ?, ?)`,
          ).bind(crypto.randomUUID(), "New shop order", `${order.items.length} item(s), ${order.totalCoins} DP coin`, "/shopping", Date.now()).run().catch(() => undefined),
        );
        ctx.purgeProfile();
      }
      return { success: true, order };
    }

    case "getMyShopOrders": {
      await rateLimit(env, `shopmine:${uid}`, 60, 60);
      const before = body.cursor == null ? Number.MAX_SAFE_INTEGER : Number(body.cursor);
      const rows = await env.DB.prepare(
        `SELECT o.id, o.status, o.total_coins, o.created_at,
                (SELECT title FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS title,
                (SELECT image FROM shop_order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS image,
                (SELECT SUM(qty) FROM shop_order_items i WHERE i.order_id = o.id) AS units
           FROM shop_orders o WHERE o.uid = ? AND o.created_at < ? ORDER BY o.created_at DESC LIMIT 21`,
      ).bind(uid, before).all<any>();
      const list = rows.results ?? [];
      const page = list.slice(0, 20);
      return {
        orders: page.map((r) => ({ id: r.id, status: r.status, totalCoins: Number(r.total_coins), createdAt: Number(r.created_at), title: r.title, image: r.image, units: Number(r.units) })),
        nextCursor: list.length > 20 ? Number(page[page.length - 1].created_at) : null,
      };
    }

    case "getShopOrder": {
      await rateLimit(env, `shopget:${uid}`, 120, 60);
      const order = typeof body.orderId === "string" ? await loadOrder(env, body.orderId, uid) : null;
      if (!order) throw httpsError("not-found", "Order not found.");
      return { order };
    }

    case "cancelShopOrder": {
      await rateLimit(env, `shopcancel:${uid}`, 10, 60, { failClosed: true });
      const order = typeof body.orderId === "string" ? await loadOrder(env, body.orderId, uid) : null;
      if (!order) throw httpsError("not-found", "Order not found.");
      if (order.status !== "placed") throw httpsError("failed-precondition", "Packed orders can't be cancelled from the app. Contact support.");
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : null;
      await transitionOrder(env, order.id, "cancelled", { actor: "user", from: ["placed"], note: reason || "Cancelled by customer" });
      ctx.purgeProfile();
      return { success: true, order: await loadOrder(env, order.id, uid) };
    }

    case "requestShopReturn": {
      await rateLimit(env, `shopreturn:${uid}`, 10, 60, { failClosed: true });
      const order = typeof body.orderId === "string" ? await loadOrder(env, body.orderId, uid) : null;
      if (!order) throw httpsError("not-found", "Order not found.");
      if (order.status !== "delivered") throw httpsError("failed-precondition", "Only delivered orders can be returned.");
      if (!order.returnUntil || Date.now() > order.returnUntil) throw httpsError("failed-precondition", "The return window for this order has closed.", "return_window_closed");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < 3 || reason.length > 300) throw httpsError("invalid-argument", "Please tell us why (3-300 characters).");
      await transitionOrder(env, order.id, "return_requested", { actor: "user", from: ["delivered"], note: reason });
      return { success: true, order: await loadOrder(env, order.id, uid) };
    }

    // ---------------------------------------------------------- XP → Diamond (lib/xpConversion.ts)
    case "getXpConversion": {
      await rateLimit(env, `xpconvget:${uid}`, 60, 60);
      return xpConversionStatus(env, uid);
    }

    case "convertXp": {
      await rateLimit(env, `xpconv:${uid}`, 10, 60, { failClosed: true });
      const out = await convertXp(env, uid, { diamonds: body.diamonds, requestId: body.requestId });
      if (!out.replayed) ctx.purgeProfile();
      return { success: true, ...out, status: await xpConversionStatus(env, uid) };
    }
  }
  throw httpsError("invalid-argument", `Action '${action}' nahi mila.`);
}
