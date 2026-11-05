/**
 * Where an old admin URL lives now (the Shop / Earning split).
 *
 * Old links keep working: bookmarks, links inside older admin notifications
 * (stored with their URL in admin_notifications.link) and links in docs. Each
 * old path maps by its `?tab=` to the new page; any other query parameter is
 * carried over. `null` = the URL is still a real page (e.g. /monetization
 * without a moved tab) and is not redirected.
 */
type TabMap = { tabs: Record<string, string>; fallback: string | null; keepTab?: boolean };

const LEGACY: Record<string, TabMap> = {
  "/shopping": {
    tabs: {
      orders: "/shop/orders",
      products: "/shop/products",
      digital: "/shop/digital",
      home: "/shop/storefront",
      collections: "/shop/collections",
      bundles: "/shop/bundles",
      fraud: "/shop/settings",
    },
    fallback: "/shop/orders",
  },
  "/gamification": {
    tabs: {
      overview: "/earning/xp",
      rules: "/earning/xp?tab=rules",
      achievements: "/earning/achievements",
      events: "/earning/events",
      "xp-rewards": "/earning/level-rewards",
      catalog: "/earning/catalog",
      seasons: "/earning/seasons",
      users: "/earning/players",
      flags: "/earning/players?tab=flags",
      grants: "/earning/players?tab=grants",
    },
    fallback: "/earning/xp",
  },
  "/earning-dashboard": { tabs: {}, fallback: "/earning" },
  "/earning-events": { tabs: {}, fallback: "/earning/events" },
  "/earning-assets": { tabs: {}, fallback: "/earning/assets" },
  "/earning-audit": { tabs: {}, fallback: "/earning/audit", keepTab: true },
  "/referrals": { tabs: {}, fallback: "/earning/referrals", keepTab: true },
  // Still real pages; only their moved tabs redirect.
  "/monetization": { tabs: { store: "/shop/digital", gifts: "/shop/gifts" }, fallback: null, keepTab: false },
  "/coin-economy": { tabs: { earn: "/earning/free-rewards" }, fallback: null, keepTab: false },
};

/** The new URL for an old one, or null when `path` is not (or no longer) a moved page. */
export function legacyTarget(path: string, search: string): string | null {
  const rule = LEGACY[path];
  if (!rule) return null;
  const params = new URLSearchParams(search);
  const tab = params.get("tab") ?? "";
  const mapped = tab ? rule.tabs[tab] : undefined;
  const base = mapped ?? rule.fallback;
  if (!base) return null;
  // The tab was consumed by the mapping (or means nothing on the new page) unless the page keeps it.
  if (mapped || !rule.keepTab) params.delete("tab");
  const [p, q = ""] = base.split("?");
  const out = new URLSearchParams(q);
  params.forEach((v, k) => {
    if (!out.has(k)) out.set(k, v);
  });
  const s = out.toString();
  return s ? `${p}?${s}` : p;
}

/** Every old path that redirects (for the router). */
export const LEGACY_PATHS = Object.keys(LEGACY);
