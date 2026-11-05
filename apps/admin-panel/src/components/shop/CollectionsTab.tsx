import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError, type CollectionAccent, type ShopCollection, type ShopCollectionInput } from "@/lib/api";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ConfirmDialog";
import { fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Text, Toggle, field } from "@/components/monetization/shared";
import { ImageField } from "./ShopHomeTab";
import { CatalogItemPicker } from "./CatalogItemPicker";

/** Same list as the Worker (lib/storeBundles.ts COLLECTION_ACCENTS) and the app's accent palette. */
export const ACCENTS: { id: CollectionAccent; label: string; color: string }[] = [
  { id: "violet", label: "Violet", color: "#7C3AED" },
  { id: "blue", label: "Blue", color: "#2563EB" },
  { id: "plum", label: "Plum", color: "#86198F" },
  { id: "pink", label: "Pink", color: "#DB2777" },
  { id: "purple", label: "Purple", color: "#9333EA" },
  { id: "gold", label: "Gold", color: "#D97706" },
];
const accentColor = (a: string) => ACCENTS.find((x) => x.id === a)?.color ?? ACCENTS[0].color;
const ID_RE = /^[a-z0-9_-]{2,40}$/;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/** Shop → Collections: groups of catalogue items shown as "Popular Collection" on the app Shop home. */
export function CollectionsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const { confirm } = useConfirm();
  const list = useQuery({ queryKey: ["shop-collections"], queryFn: api.monetization.collections });
  const store = useQuery({ queryKey: ["mon-store"], queryFn: api.monetization.store });
  const [editing, setEditing] = useState<ShopCollection | "new" | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["shop-collections"] });
  const toggle = useMutation({
    mutationFn: (c: ShopCollection) =>
      api.monetization.saveCollection(c.id, { name: c.name, subtitle: c.subtitle, imageUrl: c.imageUrl, accent: c.accent, sort: c.sort, active: !c.active, itemIds: c.itemIds }),
    onSuccess: (r) => {
      toast.success(r.collection.active ? `${r.collection.name} is shown` : `${r.collection.name} hidden`);
      refresh();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.monetization.deleteCollection(id),
    onSuccess: () => {
      toast.success("Collection deleted");
      refresh();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const onDelete = async (c: ShopCollection) => {
    const ok = await confirm({
      title: `Delete "${c.name}"?`,
      description: "The collection disappears from the app Shop home. Its items stay in the catalogue and on sale.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) remove.mutate(c.id);
  };

  const rows = list.data?.collections ?? [];
  return (
    <div className="space-y-5">
      <Card
        title="Collections"
        subtitle='Groups of digital items shown as "Popular Collection" on the app Shop home, e.g. Anime, Couple or Festival. Items can be in many collections and are still bought one by one for DP coin.'
        action={<Button onClick={() => setEditing("new")} disabled={!full}>+ New collection</Button>}
      >
        {!full && <Notice tone="warning">Only full admins can change collections.</Notice>}
        <Notice>The app shows only active collections, and only their items that are on sale right now. A collection with no item on sale is hidden.</Notice>
        {list.isError ? (
          <Notice tone="danger">Could not load collections: {describeError(list.error)}</Notice>
        ) : (
          <Table
            data={rows}
            loading={list.isLoading}
            empty="No collections yet."
            keyFn={(r) => r.id}
            columns={[
              {
                key: "art",
                header: "Art",
                render: (r) =>
                  r.imageUrl ? (
                    <img src={r.imageUrl} alt="" className="w-14 h-10 rounded-lg object-cover border border-border" />
                  ) : (
                    <div className="w-14 h-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${accentColor(r.accent)}, ${accentColor(r.accent)}66)` }} />
                  ),
              },
              { key: "name", header: "Name", render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-[11px] font-mono text-muted-foreground">{r.id}</p></div> },
              { key: "sub", header: "Subtitle", render: (r) => <span className="text-muted-foreground">{r.subtitle || "—"}</span> },
              { key: "items", header: "Items", render: (r) => fmtNumber(r.itemIds.length) },
              {
                key: "accent",
                header: "Accent",
                render: (r) => (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full border border-border" style={{ background: accentColor(r.accent) }} />
                    {r.accent}
                  </span>
                ),
              },
              { key: "sort", header: "Sort", render: (r) => String(r.sort) },
              {
                key: "active",
                header: "Active",
                render: (r) => <Toggle label={r.active ? "Shown" : "Hidden"} checked={r.active} onChange={() => full && toggle.mutate(r)} />,
              },
              {
                key: "act",
                header: "",
                render: (r) => (
                  <div className="flex gap-3">
                    <button className="text-sm font-semibold text-primary disabled:opacity-40" onClick={() => setEditing(r)} disabled={!full}>Edit</button>
                    <button className="text-sm font-semibold text-red-600 disabled:opacity-40" onClick={() => onDelete(r)} disabled={!full || remove.isPending}>Delete</button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      {editing && (
        <CollectionDialog
          collection={editing === "new" ? null : editing}
          takenIds={rows.map((r) => r.id)}
          items={store.data ?? []}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function CollectionDialog({ collection, takenIds, items, onClose, onDone }: { collection: ShopCollection | null; takenIds: string[]; items: any[]; onClose: () => void; onDone: () => void }) {
  const isNew = !collection;
  const [id, setId] = useState(collection?.id ?? "");
  const [idTouched, setIdTouched] = useState(false);
  const [f, setF] = useState<ShopCollectionInput>({
    name: collection?.name ?? "",
    subtitle: collection?.subtitle ?? "",
    imageUrl: collection?.imageUrl ?? null,
    accent: collection?.accent ?? "violet",
    sort: collection?.sort ?? 0,
    active: collection?.active ?? true,
    itemIds: collection?.itemIds ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<ShopCollectionInput>) => setF({ ...f, ...p });
  const name = f.name.trim();
  const problems = [
    isNew && !ID_RE.test(id) && "Id: 2-40 lowercase letters, digits, _ or -.",
    isNew && takenIds.includes(id) && "That id is already used.",
    (name.length < 2 || name.length > 40) && "Name: 2-40 characters.",
    f.subtitle.trim().length > 80 && "Subtitle: at most 80 characters.",
    !Number.isInteger(f.sort) && "Sort must be a whole number.",
    (f.itemIds.length < 1 || f.itemIds.length > 60) && "Pick 1-60 items.",
  ].filter(Boolean) as string[];

  const save = useMutation({
    mutationFn: () => api.monetization.saveCollection(id, { ...f, name, subtitle: f.subtitle.trim() }),
    onSuccess: () => {
      toast.success(isNew ? "Collection created" : "Collection saved");
      onDone();
      onClose();
    },
    onError: (e) => {
      const msg = describeError(e);
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <Modal open onClose={onClose} title={isNew ? "New collection" : `Edit ${collection!.name}`} width="max-w-4xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Text
            label="Name (2-40)"
            value={f.name}
            placeholder="Anime Collection, Couple Collection, Festival Collection"
            onChange={(v) => {
              set({ name: v });
              if (isNew && !idTouched) setId(slug(v));
            }}
          />
          {isNew ? (
            <Text label="Id (permanent)" value={id} onChange={(v) => { setIdTouched(true); setId(v.toLowerCase()); }} placeholder="anime" hint="Lowercase letters, digits, _ or -." />
          ) : (
            <Text label="Id" value={id} onChange={() => undefined} hint="The id can't be changed." />
          )}
          <Text label="Subtitle (optional, max 80)" value={f.subtitle} onChange={(v) => set({ subtitle: v })} placeholder="Fan favourite frames and badges" />
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Sort (lower first)</span>
            <input type="number" className={field} value={f.sort} onChange={(e) => set({ sort: Number(e.target.value) })} />
          </label>
        </div>
        <div>
          <span className="text-xs text-muted-foreground mb-1 block">Accent</span>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => set({ accent: a.id })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm ${f.accent === a.id ? "border-primary ring-2 ring-primary/40 font-semibold" : "border-border"}`}
              >
                <span className="w-4 h-4 rounded-full" style={{ background: a.color }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          <ImageField
            label="Artwork (optional)"
            hint="JPEG, PNG or WebP up to 5 MB. Without artwork the app draws the accent colour."
            value={f.imageUrl ?? ""}
            onChange={(v) => set({ imageUrl: v || null })}
            aspect="16 / 9"
          />
          <div className="space-y-2">
            <Toggle label="Active" hint="Shown in the app while it has at least one item on sale." checked={f.active} onChange={(v) => set({ active: v })} />
            <Badge variant="info">{f.itemIds.length} item(s) selected</Badge>
          </div>
        </div>
        <CatalogItemPicker items={items} value={f.itemIds} onChange={(ids) => set({ itemIds: ids })} min={1} max={60} requireListing />
        {problems.length > 0 && <Notice tone="warning">{problems.join(" ")}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || problems.length > 0}>{save.isPending ? "Saving…" : "Save collection"}</Button>
        </div>
      </div>
    </Modal>
  );
}
