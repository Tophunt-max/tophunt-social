import { useMemo, useState } from "react";
import { RARITY_COLOR } from "@/lib/shopArt";
import { Badge } from "@/components/ui/Badge";
import { ItemPreview } from "@/components/monetization/ItemPreview";
import { TYPE_LABEL } from "@/components/monetization/StoreItemDialog";
import { field } from "@/components/monetization/shared";

/** Free XP level rewards are managed under Gamification and can't be grouped or bundled. */
export const isFreeXp = (r: any) => r?.asset?.collection === "xp40";

/**
 * Ordered multi-select of catalogue items (rows from api.monetization.store()).
 * Left: searchable list to add from. Right: the picked items in order, with
 * move up / down and remove.
 */
export function CatalogItemPicker({
  items,
  value,
  onChange,
  min,
  max,
  requireActive,
  requireListing,
}: {
  items: any[];
  value: string[];
  onChange: (ids: string[]) => void;
  min: number;
  max: number;
  /** Bundles: only enabled catalogue items can be picked. */
  requireActive?: boolean;
  /** Collections: show which items have no live listing (the app hides them). */
  requireListing?: boolean;
}) {
  const [q, setQ] = useState("");
  const pool = useMemo(() => items.filter((r) => !isFreeXp(r)), [items]);
  const byId = useMemo(() => new Map(items.map((r) => [r.itemId, r])), [items]);
  const term = q.trim().toLowerCase();
  const results = useMemo(
    () =>
      pool
        .filter((r) => !value.includes(r.itemId))
        .filter((r) => !term || `${r.name} ${r.itemId} ${r.type} ${r.rarity}`.toLowerCase().includes(term))
        .slice(0, 60),
    [pool, value, term],
  );
  const full = value.length >= max;
  const add = (id: string) => {
    if (full || value.includes(id)) return;
    onChange([...value, id]);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const notLive = (r: any) => !r?.listing || !r.listing.active || !r.itemActive;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Catalogue ({pool.length} items, free XP rewards excluded)</p>
        <input className={field} placeholder="Search name, id, kind or rarity" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {results.map((r) => {
            const blocked = requireActive && !r.itemActive;
            return (
              <li key={r.itemId} className="flex items-center gap-2 rounded-xl border border-border px-2 py-1.5 text-sm">
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                  <ItemPreview r={r} height={40} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {TYPE_LABEL[r.type] ?? r.type} · <span className="font-mono">{r.itemId}</span>
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full text-white" style={{ background: RARITY_COLOR[r.rarity] ?? RARITY_COLOR.common }}>
                  {r.rarity}
                </span>
                <button
                  className="text-xs font-semibold text-primary disabled:opacity-40"
                  onClick={() => add(r.itemId)}
                  disabled={full || blocked}
                  title={blocked ? "This item is disabled in the catalogue" : full ? `At most ${max} items` : "Add"}
                >
                  {blocked ? "Disabled" : "Add"}
                </button>
              </li>
            );
          })}
          {!results.length && <li className="text-sm text-muted-foreground py-4 text-center">No items match.</li>}
        </ul>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">
          Selected {value.length} / {max} {value.length < min ? <span className="text-amber-700">· pick at least {min}</span> : null}
        </p>
        {value.length ? (
          <ol className="space-y-1.5 max-h-[21rem] overflow-y-auto pr-1">
            {value.map((id, i) => {
              const r = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-xl border border-border px-2 py-1.5 text-sm">
                  <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}</span>
                  {r ? (
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                      <ItemPreview r={r} height={32} />
                    </div>
                  ) : null}
                  <span className="font-semibold truncate flex-1">{r?.name ?? id}</span>
                  {!r ? <Badge variant="warning">missing</Badge> : null}
                  {r && requireActive && !r.itemActive ? <Badge variant="warning">disabled</Badge> : null}
                  {r && requireListing && notLive(r) ? <Badge variant="warning">not on sale</Badge> : null}
                  <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                  <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move down">▼</button>
                  <button className="text-xs text-red-600 font-semibold" onClick={() => onChange(value.filter((x) => x !== id))}>Remove</button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground py-4">No items yet.</p>
        )}
      </div>
    </div>
  );
}
