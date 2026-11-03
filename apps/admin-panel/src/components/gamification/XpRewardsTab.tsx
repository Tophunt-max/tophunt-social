import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { fmtNumber } from "@/lib/format";
import { RARITY_COLOR, artSource } from "@/lib/shopArt";
import { Badge } from "@/components/ui/Badge";
import { ItemPreview } from "@/components/monetization/ItemPreview";
import { StoreItemDialog, TYPE_LABEL, XP_KINDS } from "@/components/monetization/StoreItemDialog";
import { Button, Card, Notice, field } from "@/components/monetization/shared";

/**
 * Gamification → XP Level Rewards: the free collection, one frame / theme /
 * badge / title per level 1-100. Users get each item by reaching its level;
 * nothing here is sold (DP coin items live in Shopping → Digital items).
 */
export function XpRewardsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const q = useQuery({ queryKey: ["xp-rewards"], queryFn: api.gamification.xpRewards });
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const items: any[] = q.data?.items ?? [];
  const maxLevel = q.data?.maxLevel ?? 100;
  const levels = useMemo(() => new Map(items.map((r) => [r.level, { itemId: r.itemId, name: r.name }])), [items]);
  const freeLevels = useMemo(() => Array.from({ length: maxLevel }, (_, i) => i + 1).filter((l) => !levels.has(l)), [levels, maxLevel]);
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return items.filter((r) => (!kind || r.type === kind) && (!t || `${r.name} ${r.itemId} ${r.level}`.toLowerCase().includes(t)));
  }, [items, kind, search]);
  const noArt = items.filter((r) => artSource(r.asset) === "none").length;
  const done = () => {
    qc.invalidateQueries({ queryKey: ["xp-rewards"] });
    qc.invalidateQueries({ queryKey: ["gamification-catalog"] });
  };

  return (
    <div className="space-y-5">
      <Card
        title="XP Level Rewards"
        subtitle={`Free items users unlock by reaching a level: one per level, 1 to ${maxLevel}. Never sold. Premium (DP coin) items are under Shopping → Digital items.`}
        action={<Button onClick={() => setCreating(true)} disabled={!full || freeLevels.length === 0}>+ New reward</Button>}
      >
        {!full && <Notice tone="warning">Only full admins can change level rewards.</Notice>}
        {freeLevels.length === 0 && <Notice>All {maxLevel} levels have an item. To add a new one, edit an existing level, or move an item with "Swap levels".</Notice>}
        {noArt > 0 && <Notice tone="warning">{noArt} level reward(s) have no artwork yet; the app draws their colours. Open one and upload a WebP.</Notice>}
        {q.isError && <Notice tone="danger">Could not load: {(q.error as any)?.message}</Notice>}

        <div className="flex flex-col md:flex-row gap-2">
          <input className={`${field} md:max-w-xs`} placeholder="Search name, id or level" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex gap-2 overflow-x-auto">
            {["", ...XP_KINDS].map((t) => (
              <button
                key={t || "all"}
                onClick={() => setKind(t)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${kind === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                {t ? TYPE_LABEL[t] : "All"} <span className="opacity-70">{t ? items.filter((r) => r.type === t).length : items.length}</span>
              </button>
            ))}
          </div>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !shown.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No rewards match.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {shown.map((r) => (
              <button key={r.itemId} onClick={() => full && setEditing(r)} className="text-left rounded-2xl border border-border bg-card overflow-hidden hover:border-primary disabled:opacity-60" disabled={!full}>
                <div className="relative">
                  <ItemPreview r={r} height={110} />
                  <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-black/70 text-white">Lv {r.level}</span>
                  {!r.active && <span className="absolute top-2 right-2"><Badge variant="warning">off</Badge></span>}
                </div>
                <div className="p-3 space-y-1">
                  <p className="font-semibold text-sm truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: RARITY_COLOR[r.rarity] ?? RARITY_COLOR.common }} />
                    {TYPE_LABEL[r.type] ?? r.type} · {fmtNumber(r.owners)} owners
                  </p>
                  <p className="text-[11px] text-muted-foreground">{artSource(r.asset) === "uploaded" ? "Uploaded art" : artSource(r.asset) === "bundled" ? "Bundled art" : "No art yet"}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {(editing || creating) && (
        <StoreItemDialog
          item={editing}
          takenIds={items.map((r) => r.itemId)}
          xp={{ levels, maxLevel, defaultLevel: freeLevels[0] ?? null }}
          onClose={() => { setEditing(null); setCreating(false); }}
          onDone={done}
        />
      )}
    </div>
  );
}
