import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { RARITY_COLOR, assetColors, shopArtFor, tierOf } from "@/lib/shopArt";
import { Button, Card, Notice, Num, Text, Toggle, field, fromLocalInput, toLocalInput } from "./shared";

const TYPE_LABEL: Record<string, string> = {
  frame: "Profile frame", theme: "Profile theme", badge: "Name badge", title: "Title",
  effect: "Effect", accessory: "Accessory", sticker: "Sticker", collectible: "Collectible",
};
type StatusFilter = "" | "on_sale" | "hidden" | "unlisted";

const listingStatus = (r: any): Exclude<StatusFilter, ""> =>
  !r.listing ? "unlisted" : r.listing.active && r.itemActive ? "on_sale" : "hidden";

export function StoreTab() {
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ["mon-store"], queryFn: api.monetization.store });
  const [status, setStatus] = useState("");
  const purchases = useQuery({ queryKey: ["mon-purchases", status], queryFn: () => api.monetization.purchases(status || undefined) });
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [refunding, setRefunding] = useState<any>(null);
  const [type, setType] = useState("");
  const [listFilter, setListFilter] = useState<StatusFilter>("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (cfgQ.data && enabled === null) setEnabled(cfgQ.data.effective.store.enabled);
  }, [cfgQ.data, enabled]);

  const saveEnabled = useMutation({
    mutationFn: (v: boolean) => api.saveAppSettings({ monetization: { store: { enabled: v } } }),
    onSuccess: (_r, v) => {
      setEnabled(v);
      toast.success(v ? "Store opened" : "Store closed");
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // One-tap on sale / hide: re-saves the listing as it is, with only `active` flipped.
  const quickToggle = useMutation({
    mutationFn: (r: any) =>
      api.monetization.saveListing(r.itemId, {
        priceCoins: r.listing.priceCoins,
        compareAtCoins: r.listing.compareAtCoins ?? null,
        stockLimit: r.listing.stockLimit ?? null,
        refundable: r.listing.refundable,
        active: !r.listing.active,
        startsAt: r.listing.startsAt ?? null,
        endsAt: r.listing.endsAt ?? null,
        sort: r.listing.sort ?? 0,
        ownership: "permanent",
      }),
    onSuccess: (_r, r: any) => {
      toast.success(r.listing.active ? `${r.name} hidden` : `${r.name} is on sale`);
      qc.invalidateQueries({ queryKey: ["mon-store"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const all: any[] = items.data ?? [];
  const types = useMemo(() => [...new Set(all.map((r) => r.type))], [all]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!type || r.type === type) &&
        (!listFilter || listingStatus(r) === listFilter) &&
        (!term || `${r.name} ${r.itemId} ${r.description ?? ""}`.toLowerCase().includes(term)),
    );
  }, [all, type, listFilter, q]);
  const stats = useMemo(() => ({
    total: all.length,
    onSale: all.filter((r) => listingStatus(r) === "on_sale").length,
    sold: all.reduce((n, r) => n + (Number(r.purchases) || 0), 0),
    earned: all.reduce((n, r) => n + (Number(r.revenueCoins) || 0), 0),
  }), [all]);

  return (
    <div className="space-y-5">
      <Card
        title="Digital store"
        subtitle="Sell cosmetic catalogue items (frames, themes, badges, titles) for DP coin. Items are created under Gamification → Catalog."
        action={enabled !== null && <Toggle label="Store open" checked={enabled} onChange={(v) => saveEnabled.mutate(v)} />}
      >
        {enabled === false && (
          <Notice tone="warning">The store is closed: users see "Digital items jaldi aa rahe hain" in the Shop. Turn on "Store open" to sell the listed items.</Notice>
        )}
        <Notice>Only permanent ownership is sold today. Every item is cosmetic and changes no vote, fee, prize or ranking. No random or paid loot boxes.</Notice>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
          <Stat label="Catalogue items" value={fmtNumber(stats.total)} />
          <Stat label="On sale" value={fmtNumber(stats.onSale)} tone="green" />
          <Stat label="Purchases" value={fmtNumber(stats.sold)} />
          <Stat label="DP coin earned" value={fmtNumber(stats.earned)} tone="violet" />
        </div>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input className={`${field} md:max-w-xs`} placeholder="Search name, id or description" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={`${field} md:w-44`} value={listFilter} onChange={(e) => setListFilter(e.target.value as StatusFilter)}>
            <option value="">All statuses</option>
            <option value="on_sale">On sale</option>
            <option value="hidden">Hidden</option>
            <option value="unlisted">Not listed</option>
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
          {["", ...types].map((t) => (
            <button
              key={t || "all"}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap ${type === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
            >
              {t ? TYPE_LABEL[t] ?? t : "All"} <span className="opacity-70">{t ? all.filter((r) => r.type === t).length : all.length}</span>
            </button>
          ))}
        </div>

        {items.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : items.isError ? (
          <Notice tone="danger">Could not load the store: {(items.error as any)?.message}</Notice>
        ) : !shown.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No items match.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map((r) => (
              <StoreItemCard
                key={r.itemId}
                r={r}
                onEdit={() => setEditing(r)}
                onToggle={() => quickToggle.mutate(r)}
                toggling={quickToggle.isPending && (quickToggle.variables as any)?.itemId === r.itemId}
              />
            ))}
          </div>
        )}
      </Card>

      <FeaturedDropCard items={all} saved={cfgQ.data?.effective?.store?.featured} onSaved={() => qc.invalidateQueries({ queryKey: ["monetization-config"] })} />

      <Card
        title="Purchases"
        action={
          <select className={`${field} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="refunded">Refunded</option>
          </select>
        }
      >
        <Table
          data={purchases.data ?? []}
          loading={purchases.isLoading}
          empty="No purchases yet."
          keyFn={(r: any) => r.id}
          columns={[
            { key: "d", header: "When", render: (r: any) => fmtDateTime(r.createdAt) },
            { key: "u", header: "User", render: (r: any) => (r.username ? `@${r.username}` : r.uid) },
            { key: "i", header: "Item", render: (r: any) => r.itemName ?? r.itemId },
            { key: "p", header: "Paid", render: (r: any) => `${fmtNumber(r.priceCoins)} DP coin` },
            { key: "s", header: "Status", render: (r: any) => <Badge variant={r.status === "refunded" ? "warning" : "success"}>{r.status}</Badge> },
            { key: "a", header: "", render: (r: any) => (r.status === "completed" ? <button className="text-red-600 text-sm font-semibold" onClick={() => setRefunding(r)}>Refund</button> : <span className="text-xs text-muted-foreground">{r.refundReason}</span>) },
          ]}
        />
      </Card>

      {editing && <ListingDialog item={editing} onClose={() => setEditing(null)} onDone={() => qc.invalidateQueries({ queryKey: ["mon-store"] })} />}
      {refunding && <RefundDialog purchase={refunding} onClose={() => setRefunding(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["mon-purchases"] }); qc.invalidateQueries({ queryKey: ["mon-store"] }); }} />}
    </div>
  );
}

/** Same limits as the Worker (lib/monetizationConfig.ts FEATURED_LIMITS). */
const FEATURED = { badge: 24, title: 60, subtitle: 140, ctaLabel: 24, maxItems: 12 } as const;

/**
 * The Shop home's featured banner: which listed items, which one is drawn
 * large, the copy, and an optional real end time (the app shows a countdown
 * only when this is set). Saved through /admin/app-settings like "Store open".
 */
function FeaturedDropCard({ items, saved, onSaved }: { items: any[]; saved: any; onSaved: () => void }) {
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const [f, setF] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  useEffect(() => {
    if (saved && f === null) {
      setF({
        enabled: !!saved.enabled,
        badge: saved.badge ?? "Legendary Drop",
        title: saved.title ?? "",
        subtitle: saved.subtitle ?? "",
        itemIds: Array.isArray(saved.itemIds) ? saved.itemIds : [],
        heroItemId: saved.heroItemId ?? null,
        endsAt: toLocalInput(saved.endsAt),
        ctaLabel: saved.ctaLabel ?? "Explore Now",
      });
    }
  }, [saved, f]);

  const listed = useMemo(() => items.filter((r) => r.listing), [items]);
  const byId = useMemo(() => new Map(items.map((r) => [r.itemId, r])), [items]);

  const save = useMutation({
    mutationFn: () => {
      const endsAt = fromLocalInput(f.endsAt);
      const featured: Record<string, unknown> = {
        enabled: f.enabled,
        badge: f.badge.trim(),
        subtitle: f.subtitle.trim(),
        endsAt,
        ctaLabel: f.ctaLabel.trim(),
      };
      // An empty list / title can only be saved while the banner is off; the
      // Worker refuses them as values, so they are left out (kept as stored).
      if (f.title.trim()) featured.title = f.title.trim();
      if (f.itemIds.length) {
        featured.itemIds = f.itemIds;
        featured.heroItemId = f.heroItemId && f.itemIds.includes(f.heroItemId) ? f.heroItemId : null;
      }
      return api.saveAppSettings({ monetization: { store: { featured } } });
    },
    onSuccess: () => {
      setError(null);
      toast.success("Featured drop saved");
      onSaved();
    },
    onError: (e: any) => {
      const msg = describeError(e);
      setError(msg);
      toast.error(msg);
    },
  });

  if (!f) return null;
  const set = (patch: any) => setF({ ...f, ...patch });
  const ends = fromLocalInput(f.endsAt);
  const expired = ends !== null && ends <= Date.now();
  const problems = [
    f.enabled && !f.itemIds.length && "Pick at least one item.",
    f.enabled && !f.title.trim() && "Title is required.",
    !f.badge.trim() && "Badge is required.",
    !f.ctaLabel.trim() && "Button label is required.",
    expired && "The end time is in the past. Clear it or pick a future time.",
  ].filter(Boolean) as string[];
  const notOnSale = f.itemIds.filter((id: string) => listingStatus(byId.get(id) ?? {}) !== "on_sale");
  const add = (id: string) => {
    if (!id || f.itemIds.includes(id) || f.itemIds.length >= FEATURED.maxItems) return;
    set({ itemIds: [...f.itemIds, id], heroItemId: f.heroItemId ?? id });
    setPick("");
  };
  const remove = (id: string) => {
    const next = f.itemIds.filter((x: string) => x !== id);
    set({ itemIds: next, heroItemId: f.heroItemId === id ? next[0] ?? null : f.heroItemId });
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...f.itemIds];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ itemIds: next });
  };

  return (
    <Card
      title="Featured drop"
      subtitle="The banner at the top of the Shop home. It only points at listings: price, stock and the sale window still come from each listing, so it can never show fake scarcity."
      action={<Toggle label="Show banner" checked={f.enabled} onChange={(v) => set({ enabled: v })} />}
    >
      {!full && <Notice tone="warning">Only full admins can change the featured drop.</Notice>}
      <Notice>
        Users see it only while the store is open, the banner is on, it has a title and at least one item on sale, and the end time (if any) has not passed. Items that are hidden or sold out are skipped in the app.
      </Notice>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Text label={`Badge (max ${FEATURED.badge})`} value={f.badge} onChange={(v) => set({ badge: v })} placeholder="Legendary Drop" />
        <Text label={`Button label (max ${FEATURED.ctaLabel})`} value={f.ctaLabel} onChange={(v) => set({ ctaLabel: v })} placeholder="Explore Now" />
        <Text label={`Title (max ${FEATURED.title})`} value={f.title} onChange={(v) => set({ title: v })} placeholder="Mythic Week" />
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Ends at (optional; shows a countdown)</span>
          <div className="flex gap-2">
            <input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            {f.endsAt ? <Button variant="secondary" onClick={() => set({ endsAt: "" })}>Clear</Button> : null}
          </div>
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-muted-foreground mb-1 block">Subtitle (optional, max {FEATURED.subtitle})</span>
        <textarea className={field} rows={2} value={f.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
      </label>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Items ({f.itemIds.length}/{FEATURED.maxItems}) · the starred one is drawn large</p>
        <div className="flex gap-2 mb-2">
          <select className={`${field} md:max-w-sm`} value={pick} onChange={(e) => setPick(e.target.value)} disabled={f.itemIds.length >= FEATURED.maxItems}>
            <option value="">Add a listed item…</option>
            {listed.filter((r) => !f.itemIds.includes(r.itemId)).map((r) => (
              <option key={r.itemId} value={r.itemId}>
                {r.name} · {r.rarity} · {TYPE_LABEL[r.type] ?? r.type}{listingStatus(r) === "on_sale" ? "" : " (not on sale)"}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => add(pick)} disabled={!pick}>Add</Button>
        </div>
        {f.itemIds.length ? (
          <ul className="space-y-1.5">
            {f.itemIds.map((id: string, i: number) => {
              const r = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <button
                    title="Draw this one large"
                    aria-label={`Make ${r?.name ?? id} the hero item`}
                    className={`text-lg leading-none ${f.heroItemId === id ? "text-amber-500" : "text-muted-foreground"}`}
                    onClick={() => set({ heroItemId: id })}
                  >
                    {f.heroItemId === id ? "★" : "☆"}
                  </button>
                  <span className="font-semibold">{r?.name ?? id}</span>
                  {r ? (
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full text-white" style={{ background: RARITY_COLOR[r.rarity] ?? RARITY_COLOR.common }}>{r.rarity}</span>
                  ) : (
                    <Badge variant="warning">not in catalogue</Badge>
                  )}
                  {r && listingStatus(r) !== "on_sale" ? <Badge variant="warning">not on sale</Badge> : null}
                  <span className="flex-1" />
                  <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                  <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === f.itemIds.length - 1} aria-label="Move down">▼</button>
                  <button className="text-xs text-red-600 font-semibold" onClick={() => remove(id)}>Remove</button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        )}
      </div>

      {notOnSale.length > 0 && <Notice tone="warning">{notOnSale.length} picked item(s) are not on sale right now; the app will skip them.</Notice>}
      {problems.length > 0 && <Notice tone="warning">{problems.join(" ")}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={!full || save.isPending || problems.length > 0}>
          {save.isPending ? "Saving…" : "Save featured drop"}
        </Button>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "violet" }) {
  const color = tone === "green" ? "text-green-600" : tone === "violet" ? "text-violet-600" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

/** The item as users see it: a frame on a placeholder avatar, a theme as a banner. */
export function ItemPreview({ r, height = 144 }: { r: any; height?: number }) {
  const art = shopArtFor(r.asset);
  const [c0, c1] = assetColors(r.asset);
  const bg = { background: `linear-gradient(135deg, ${c0}33, ${c1}55)` };
  if (art?.kind === "theme") {
    return (
      <div className="relative w-full overflow-hidden" style={{ height }}>
        <img src={art.url} alt={r.name} className="absolute inset-0 w-full h-full object-cover" />
        {art.fxUrl ? <img src={art.fxUrl} alt="" className="absolute inset-0 w-full h-full object-cover th-fx-drift" /> : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-white p-1 shadow"><div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-300 to-slate-500" /></div>
        </div>
      </div>
    );
  }
  if (art?.kind === "frame") {
    return (
      <div className="w-full flex items-center justify-center" style={{ height, ...bg }}>
        <div className="relative" style={{ width: height * 0.8, height: height * 0.8 }}>
          <div className="absolute rounded-full bg-gradient-to-br from-slate-300 to-slate-500" style={{ inset: "8.33%" }} />
          <img src={art.url} alt={r.name} className="absolute inset-0 w-full h-full" />
          {art.fxUrl ? <img src={art.fxUrl} alt="" className="absolute inset-0 w-full h-full th-fx-pulse" /> : null}
        </div>
      </div>
    );
  }
  if (art) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-2" style={{ height, ...bg }}>
        <span className="relative" style={{ width: height * 0.42, height: height * 0.42 }}>
          <img src={art.url} alt={r.name} className="absolute inset-0 w-full h-full" />
          {art.fxUrl ? <img src={art.fxUrl} alt="" className="absolute inset-0 w-full h-full th-fx-pulse" /> : null}
        </span>
        {r.type === "title" ? (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border" style={{ color: c1, borderColor: c1 }}>{String(r.asset?.text ?? r.name)}</span>
        ) : (
          <span className="text-xs font-semibold bg-black/50 text-white px-2 py-0.5 rounded-full inline-flex items-center gap-1">Asha <img src={art.url} alt="" className="w-3.5 h-3.5" /></span>
        )}
      </div>
    );
  }
  // Level-reward items without Shop artwork: their colours, and the title text if any.
  return (
    <div className="w-full flex items-center justify-center" style={{ height, ...bg }}>
      {r.type === "title" ? (
        <span className="text-sm font-bold px-3 py-1 rounded-full border" style={{ color: c1, borderColor: c1 }}>{String(r.asset?.text ?? r.name)}</span>
      ) : (
        <div className="w-16 h-16 rounded-full" style={{ background: `linear-gradient(135deg, ${c0}, ${c1})` }} />
      )}
    </div>
  );
}

function StoreItemCard({ r, onEdit, onToggle, toggling }: { r: any; onEdit: () => void; onToggle: () => void; toggling: boolean }) {
  const l = r.listing;
  const freeXp = r.asset?.collection === "xp40";
  const st = listingStatus(r);
  const rarity = RARITY_COLOR[r.rarity] ?? RARITY_COLOR.common;
  const window =
    l && (l.startsAt || l.endsAt)
      ? `${l.startsAt ? fmtDateTime(l.startsAt) : "now"} → ${l.endsAt ? fmtDateTime(l.endsAt) : "no end"}`
      : "Always";
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative">
        <ItemPreview r={r} />
        <span className="absolute top-2 left-2 flex gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: rarity }}>{r.rarity}</span>
          <TierTag asset={r.asset} />
        </span>
        <span className="absolute top-2 right-2">
          {freeXp ? <Badge variant="info">free XP</Badge> : st === "on_sale" ? <Badge variant="active">on sale</Badge> : st === "hidden" ? <Badge variant="warning">hidden</Badge> : <Badge>not listed</Badge>}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-bold text-base">{r.name}</p>
            <p className="font-bold text-base whitespace-nowrap">
              {!freeXp && l && l.compareAtCoins > l.priceCoins ? (
                <span className="text-xs font-medium text-muted-foreground line-through mr-1.5" aria-label={`Original price ${fmtNumber(l.compareAtCoins)} DP coin`}>{fmtNumber(l.compareAtCoins)}</span>
              ) : null}
              {freeXp ? `Level ${Number(r.asset?.level) || 0}` : l ? `${fmtNumber(l.priceCoins)} DP coin` : "—"}
              {!freeXp && l && l.compareAtCoins > l.priceCoins ? (
                <span className="ml-1.5 text-xs font-bold text-red-600">-{discountPercent(l.priceCoins, l.compareAtCoins)}%</span>
              ) : null}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{TYPE_LABEL[r.type] ?? r.type} · <span className="font-mono">{r.itemId}</span></p>
          {r.description ? <p className="text-sm text-muted-foreground mt-1">{r.description}</p> : null}
        </div>
        {!r.itemActive && <Notice tone="warning">This item is turned off in Gamification → Catalog, so it is not sold even if listed.</Notice>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <Detail k="Stock" v={l ? (l.stockLimit ? `${fmtNumber(l.soldCount)} / ${fmtNumber(l.stockLimit)} sold` : `${fmtNumber(l.soldCount)} sold · unlimited`) : "–"} />
          <Detail k="Owners" v={fmtNumber(r.owners)} />
          <Detail k="Purchases" v={fmtNumber(r.purchases ?? 0)} />
          <Detail k="DP coin earned" v={fmtNumber(r.revenueCoins ?? 0)} />
          <Detail k="Refundable" v={l ? (l.refundable ? "Yes" : "No") : "–"} />
          <Detail k="Ownership" v={l ? "Permanent" : "–"} />
          <Detail k="Sale window" v={l ? window : "–"} wide />
          <Detail k="Artwork" v={r.asset?.key ? <span className="font-mono text-xs">{String(r.asset.key)}</span> : "Built-in (by rarity)"} wide />
          <Detail k="Family" v={freeXp ? "Free XP · lightweight motion" : "Premium · animated"} />
          {l ? <Detail k="Sort" v={String(l.sort)} /> : null}
          {l?.updatedAt ? <Detail k="Last changed" v={fmtDateTime(l.updatedAt)} wide /> : null}
        </dl>
        {freeXp ? (
          <Notice>Earned permanently from the server-authoritative XP level. This item cannot be listed for DP coin.</Notice>
        ) : (
          <div className="flex gap-2 mt-auto pt-1">
            <Button onClick={onEdit}>{l ? "Edit listing" : "List for sale"}</Button>
            {l && (
              <Button variant="secondary" onClick={onToggle} disabled={toggling}>
                {l.active ? "Hide" : "Put on sale"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** XP (earned with light motion) or Premium (bought with richer effects). */
function TierTag({ asset }: { asset: any }) {
  const tier = tierOf(asset);
  const level = Number(asset?.level);
  return tier === "premium" ? (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white bg-fuchsia-600 border border-fuchsia-300">◆ Premium</span>
  ) : (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-slate-600 bg-slate-200 border border-slate-400">★ XP{Number.isFinite(level) && level > 0 ? ` · Lv ${level}` : ""}</span>
  );
}

function Detail({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-medium break-words">{v}</dd>
    </div>
  );
}

/** Whole percent off (rounded down, as the app shows it). */
function discountPercent(price: number, compareAt: number): number {
  return compareAt > price && price > 0 ? Math.floor(((compareAt - price) / compareAt) * 100) : 0;
}

/** Live preview under the original-price field. */
function compareHint(price: number, raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "Empty = no discount. Must be a price you really charged before; users pay the price above.";
  const v = Number(s);
  if (!Number.isInteger(v)) return "A whole number of DP coin.";
  if (!(v > price)) return `Must be more than the price (${fmtNumber(price)}) to show a discount.`;
  return `Shows ${fmtNumber(v)} struck through, -${discountPercent(price, v)}% off. Users pay ${fmtNumber(price)}.`;
}

function ListingDialog({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const l = item.listing;
  const [f, setF] = useState({
    priceCoins: l?.priceCoins ?? 50,
    compareAtCoins: l?.compareAtCoins ?? "",
    stockLimit: l?.stockLimit ?? "",
    refundable: l?.refundable ?? true,
    active: l?.active ?? false,
    startsAt: toLocalInput(l?.startsAt),
    endsAt: toLocalInput(l?.endsAt),
    sort: l?.sort ?? 0,
  });
  const mut = useMutation({
    mutationFn: () =>
      api.monetization.saveListing(item.itemId, {
        priceCoins: Number(f.priceCoins),
        compareAtCoins: String(f.compareAtCoins).trim() === "" ? null : Number(f.compareAtCoins),
        stockLimit: f.stockLimit === "" ? null : Number(f.stockLimit),
        refundable: f.refundable,
        active: f.active,
        startsAt: fromLocalInput(f.startsAt),
        endsAt: fromLocalInput(f.endsAt),
        sort: Number(f.sort),
        ownership: "permanent",
      }),
    onSuccess: () => {
      toast.success("Listing saved");
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title={`${l ? "Edit" : "List"} ${item.name}`}>
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden border border-border"><ItemPreview r={item} height={120} /></div>
        <p className="text-xs text-muted-foreground">{item.itemId} · {item.type} · {item.rarity}{item.description ? ` · ${item.description}` : ""}</p>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Price (DP coin)" value={f.priceCoins} onChange={(v) => setF({ ...f, priceCoins: v })} />
          <Text label="Stock limit (empty = unlimited)" value={String(f.stockLimit)} onChange={(v) => setF({ ...f, stockLimit: v })} hint="A real limit. Never show fake scarcity." />
        </div>
        <Text
          label="Original price (DP coin, optional — shows a real discount)"
          value={String(f.compareAtCoins)}
          onChange={(v) => setF({ ...f, compareAtCoins: v })}
          hint={compareHint(Number(f.priceCoins), f.compareAtCoins)}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">On sale from</span><input type="datetime-local" className={field} value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">On sale until</span><input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></label>
        </div>
        <Num label="Sort" value={f.sort} onChange={(v) => setF({ ...f, sort: v })} />
        <Toggle label="Refundable on request" checked={f.refundable} onChange={(v) => setF({ ...f, refundable: v })} hint="Shown to the user before they buy. Admins can always refund." />
        <Toggle label="On sale" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function RefundDialog({ purchase, onClose, onDone }: { purchase: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => api.monetization.refundPurchase(purchase.id, reason),
    onSuccess: () => {
      toast.success("Refunded. Coins returned and the item removed.");
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title="Refund purchase">
      <div className="space-y-3 text-sm">
        <p>
          Returns {fmtNumber(purchase.priceCoins)} DP coin to {purchase.username ? `@${purchase.username}` : purchase.uid}, removes {purchase.itemName ?? purchase.itemId} from their account and unequips it.
        </p>
        <Text label="Reason (kept in the audit log)" value={reason} onChange={setReason} />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => mut.mutate()} disabled={reason.trim().length < 3 || mut.isPending}>Refund</Button>
        </div>
      </div>
    </Modal>
  );
}
