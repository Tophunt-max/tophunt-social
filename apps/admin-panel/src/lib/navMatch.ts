/**
 * Which sidebar entry is active for the current URL.
 *
 * Several entries can share a path and differ only by `?tab=` ("Coin
 * Economy" is `/coin-economy`, "Earn Settings" is `/coin-economy?tab=diamond`).
 * Comparing `location.startsWith(href)` never matched the `?tab=` entries
 * (wouter's location has no query) and lit the plain one for every tab. Here
 * an entry matches when its path is the current path (or a parent of it) and
 * every query param it names has that value now; the most specific match wins
 * (longest path, then most matching params). Pure, so it is easy to reason about.
 */
export function activeNavHref(hrefs: readonly string[], path: string, search: string): string | null {
  const now = new URLSearchParams(search);
  let best: { href: string; score: number } | null = null;
  for (const href of hrefs) {
    const [p, q = ""] = href.split("?");
    if (path !== p && !path.startsWith(`${p}/`)) continue;
    const want = new URLSearchParams(q);
    let matched = 0;
    let ok = true;
    want.forEach((v, k) => {
      if (now.get(k) === v) matched++;
      else ok = false;
    });
    if (!ok) continue;
    const score = p.length * 100 + matched;
    if (!best || score > best.score) best = { href, score };
  }
  return best?.href ?? null;
}
