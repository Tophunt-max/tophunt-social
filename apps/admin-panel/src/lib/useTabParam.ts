import { useCallback, useEffect } from "react";
import { useSearchParams } from "wouter";

/**
 * A page's active tab, kept in the URL as `?tab=`.
 *
 * The tab is read from the URL on every render, so a sidebar link, a
 * dashboard alert or the browser's back button that changes `?tab=` switches
 * the tab even while the page is already open. (Pages used to read
 * `window.location.search` once in a useState initializer, so a second link
 * to the same page changed the URL but not the tab.)
 *
 * The URL stays canonical: an alias (`?tab=earn` → `diamond`) or an unknown
 * value is rewritten in place, and the fallback tab has no `?tab=` at all, so
 * the sidebar can match links exactly (lib/navMatch.ts). Tab clicks replace
 * the history entry instead of adding one.
 */
export function useTabParam<T extends string>(
  tabs: readonly T[],
  fallback: T,
  aliases: Readonly<Record<string, T>> = {},
): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") ?? "";
  const resolved = (aliases[raw] ?? raw) as T;
  const tab = tabs.includes(resolved) ? resolved : fallback;

  const write = useCallback(
    (next: T) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback) p.delete("tab");
          else p.set("tab", next);
          return p;
        },
        { replace: true },
      ),
    [fallback, setParams],
  );

  useEffect(() => {
    const canonical = tab === fallback ? "" : tab;
    if (raw !== canonical) write(tab);
  }, [raw, tab, fallback, write]);

  return [tab, write];
}
