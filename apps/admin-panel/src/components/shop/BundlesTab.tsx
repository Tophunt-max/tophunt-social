import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError, type ShopBundle, type ShopBundlePurchase } from "@/lib/api";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { DiamondIcon } from "@/components/ui/DiamondIcon";
import { useConfirm } from "@/components/ConfirmDialog";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Text, Toggle, field, fromLocalInput, toLocalInput } from "@/components/monetization/shared";
import { ImageField } from "./ShopHomeTab";
import { CatalogItemPicker } from "./CatalogItemPicker";

const ID_RE = /^[a-z0-9_-]{2,40}$/;
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

const Diamonds = ({ n }: { n: number }) => (
  <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap">
    <DiamondIcon size={14} />
    {fmtNumber(n)}
  </span>
);

function schedule(b: ShopBundle): string {
  if (!b.startsAt && !b.endsAt) return "Always";
  return `${b.startsAt ? fmtDateTime(b.startsAt) : "now"} → ${b.endsAt ? fmtDateTime(b.endsAt) : "no end"}`;
}

/** Shopping → Bundles: sets of catalogue items sold together for Diamonds. */
export function BundlesTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const list = useQuery({ queryKey: ["shop-bundles"], queryFn: api.monetization.bundles });
  const store = useQuery({ queryKey: ["mon-store"], queryFn: api.monetization.store });
  const [editing, setEditing] = useState<ShopBundle | "new" | null>(null);
  const rows = list.data?.bundles ?? [];
  const totals = useMemo(
    () => ({
      live: rows.filter((b) => b.active).length,
      purchases: rows.reduce((n, b) => n + b.purchases, 0),
      diamonds: rows.reduce((n, b) => n + b.diamondsEarned, 0),
    }),
    [rows],
  );

  return (
    <div className="space-y-5">
      <Card
        title="Bundles"
        subtitle="Sell 2-12 digital items together for Diamonds. Users who already own some items get the rest at the same price; owning all of them blocks the purchase."
        action={<Button onClick={() => setEditing("new")} disabled={!full}>+ New bundle</Button>}
      >
        <Notice>Bundles are paid in Diamonds and contain items only.</Notice>
        {!full && <Notice tone="warning">Only full admins can change bundles.</Notice>}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Active bundles" value={fmtNumber(totals.live)} />
          <Stat label="Purchases" value={fmtNumber(totals.purchases)} />
          <Stat label="Diamonds earned" value={<Diamonds n={totals.diamonds} />} />
        </div>
        {list.isError ? (
          <Notice tone="danger">Could not load bundles: {describeError(list.error)}</Notice>
        ) : (
          <Table
            data={rows}
            loading={list.isLoading}
            empty="No bundles yet."
            keyFn={(r) => r.id}
            columns={[
              {
                key: "art",
                header: "Art",
                render: (r) =>
                  r.imageUrl ? <img src={r.imageUrl} alt="" className="w-14 h-10 rounded-lg object-cover border border-border" /> : <div className="w-14 h-10 rounded-lg bg-secondary" />,
              },
              { key: "name", header: "Name", render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-[11px] font-mono text-muted-foreground">{r.id}</p></div> },
              { key: "badge", header: "Badge", render: (r) => (r.badge ? <Badge variant="info">{r.badge}</Badge> : "—") },
              { key: "items", header: "Items", render: (r) => fmtNumber(r.itemIds.length) },
              { key: "price", header: "Price", render: (r) => <Diamonds n={r.priceDiamonds} /> },
              { key: "cmp", header: "Compare at", render: (r) => (r.compareAtDiamonds ? <span className="line-through text-muted-foreground">{fmtNumber(r.compareAtDiamonds)}</span> : "—") },
              { key: "when", header: "Schedule", render: (r) => <span className="text-xs">{schedule(r)}</span> },
              { key: "stock", header: "Stock / sold", render: (r) => (r.stockLimit ? `${fmtNumber(r.soldCount)} / ${fmtNumber(r.stockLimit)}` : `${fmtNumber(r.soldCount)} · unlimited`) },
              { key: "p", header: "Purchases", render: (r) => fmtNumber(r.purchases) },
              { key: "d", header: "Diamonds earned", render: (r) => <Diamonds n={r.diamondsEarned} /> },
              { key: "active", header: "Active", render: (r) => (r.active ? <Badge variant="active">on sale</Badge> : <Badge>off</Badge>) },
              { key: "act", header: "", render: (r) => <button className="text-sm font-semibold text-primary disabled:opacity-40" onClick={() => setEditing(r)} disabled={!full}>Edit</button> },
            ]}
          />
        )}
      </Card>
      <PurchasesCard full={full} />
      {editing && (
        <BundleDialog
          bundle={editing === "new" ? null : editing}
          takenIds={rows.map((r) => r.id)}
          items={store.data ?? []}
          onClose={() => setEditing(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ["shop-bundles"] })}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

interface Form {
  name: string;
  description: string;
  imageUrl: string;
  badge: string;
  priceDiamonds: string;
  compareAtDiamonds: string;
  startsAt: string;
  endsAt: string;
  stockLimit: string;
  sort: string;
  active: boolean;
  itemIds: string[];
}

function BundleDialog({ bundle, takenIds, items, onClose, onDone }: { bundle: ShopBundle | null; takenIds: string[]; items: any[]; onClose: () => void; onDone: () => void }) {
  const isNew = !bundle;
  const [id, setId] = useState(bundle?.id ?? "");
  const [idTouched, setIdTouched] = useState(false);
  const [f, setF] = useState<Form>({
    name: bundle?.name ?? "",
    description: bundle?.description ?? "",
    imageUrl: bundle?.imageUrl ?? "",
    badge: bundle?.badge ?? "",
    priceDiamonds: bundle ? String(bundle.priceDiamonds) : "",
    compareAtDiamonds: bundle?.compareAtDiamonds ? String(bundle.compareAtDiamonds) : "",
    startsAt: toLocalInput(bundle?.startsAt),
    endsAt: toLocalInput(bundle?.endsAt),
    stockLimit: bundle?.stockLimit ? String(bundle.stockLimit) : "",
    sort: String(bundle?.sort ?? 0),
    active: bundle?.active ?? false,
    itemIds: bundle?.itemIds ?? [],
  });
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Form>) => setF({ ...f, ...p });

  const price = Number(f.priceDiamonds);
  const compareAt = f.compareAtDiamonds.trim() === "" ? null : Number(f.compareAtDiamonds);
  const stock = f.stockLimit.trim() === "" ? null : Number(f.stockLimit);
  const startsAt = fromLocalInput(f.startsAt);
  const endsAt = fromLocalInput(f.endsAt);
  const sort = Number(f.sort);
  const sold = bundle?.soldCount ?? 0;
  const problems = [
    isNew && !ID_RE.test(id) && "Id: 2-40 lowercase letters, digits, _ or -.",
    isNew && takenIds.includes(id) && "That id is already used.",
    (f.name.trim().length < 2 || f.name.trim().length > 40) && "Name: 2-40 characters.",
    f.description.trim().length > 160 && "Description: at most 160 characters.",
    f.badge.trim().length > 16 && "Badge: at most 16 characters.",
    (!Number.isInteger(price) || price < 1 || price > 1_000_000) && "Price: 1-1,000,000 Diamonds.",
    compareAt !== null && (!Number.isInteger(compareAt) || compareAt <= price) && "Compare-at price must be more than the price, or empty.",
    startsAt !== null && endsAt !== null && endsAt <= startsAt && "End must be after start.",
    stock !== null && (!Number.isInteger(stock) || stock < 1) && "Stock limit: a whole number of at least 1, or empty.",
    stock !== null && stock < sold && `Stock limit can't be below the ${sold} already sold.`,
    !Number.isInteger(sort) && "Sort must be a whole number.",
    (f.itemIds.length < 2 || f.itemIds.length > 12) && "Pick 2-12 items.",
  ].filter(Boolean) as string[];

  const save = useMutation({
    mutationFn: () =>
      api.monetization.saveBundle(id, {
        name: f.name.trim(),
        description: f.description.trim(),
        imageUrl: f.imageUrl || null,
        badge: f.badge.trim() || null,
        priceDiamonds: price,
        compareAtDiamonds: compareAt,
        startsAt,
        endsAt,
        stockLimit: stock,
        sort,
        active: f.active,
        itemIds: f.itemIds,
      }),
    onSuccess: () => {
      toast.success(isNew ? "Bundle created" : "Bundle saved");
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
    <Modal open onClose={onClose} title={isNew ? "New bundle" : `Edit ${bundle!.name}`} width="max-w-4xl">
      <div className="space-y-4">
        <Notice>Bundles are paid in Diamonds and contain items only.</Notice>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Text
            label="Name (2-40)"
            value={f.name}
            placeholder="Festival Starter Pack"
            onChange={(v) => {
              set({ name: v });
              if (isNew && !idTouched) setId(slug(v));
            }}
          />
          {isNew ? (
            <Text label="Id (permanent)" value={id} onChange={(v) => { setIdTouched(true); setId(v.toLowerCase()); }} placeholder="festival_pack" hint="Lowercase letters, digits, _ or -." />
          ) : (
            <Text label="Id" value={id} onChange={() => undefined} hint="The id can't be changed. Turn a bundle off instead of deleting it." />
          )}
          <Text label="Badge (optional, max 16)" value={f.badge} onChange={(v) => set({ badge: v })} placeholder="Best Value" />
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Sort (lower first)</span>
            <input type="number" className={field} value={f.sort} onChange={(e) => set({ sort: e.target.value })} />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Description (optional, max 160)</span>
          <textarea className={field} rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Price <DiamondIcon size={12} /> Diamonds</span>
            <input type="number" min={1} className={field} value={f.priceDiamonds} onChange={(e) => set({ priceDiamonds: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Compare-at (optional, display only)</span>
            <input type="number" min={1} className={field} value={f.compareAtDiamonds} onChange={(e) => set({ compareAtDiamonds: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Stock limit (empty = unlimited){sold ? ` · ${sold} sold` : ""}</span>
            <input type="number" min={1} className={field} value={f.stockLimit} onChange={(e) => set({ stockLimit: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Starts (optional)</span>
            <input type="datetime-local" className={field} value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Ends (optional)</span>
            <input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
          </label>
          <div className="pt-5">
            <Toggle label="Active (on sale)" checked={f.active} onChange={(v) => set({ active: v })} />
          </div>
        </div>
        <ImageField label="Artwork (optional)" hint="JPEG, PNG or WebP up to 5 MB." value={f.imageUrl} onChange={(v) => set({ imageUrl: v })} aspect="16 / 9" />
        <CatalogItemPicker items={items} value={f.itemIds} onChange={(ids) => set({ itemIds: ids })} min={2} max={12} requireActive />
        {problems.length > 0 && <Notice tone="warning">{problems.join(" ")}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || problems.length > 0}>{save.isPending ? "Saving…" : "Save bundle"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PurchasesCard({ full }: { full: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "completed" | "refunded">("all");
  const purchases = useQuery({ queryKey: ["shop-bundle-purchases", status], queryFn: () => api.monetization.bundlePurchases(status) });
  const [refunding, setRefunding] = useState<ShopBundlePurchase | null>(null);
  return (
    <Card
      title="Bundle purchases"
      subtitle="Newest first, up to 200."
      action={
        <select className={`${field} w-40`} value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
        </select>
      }
    >
      <Table
        data={purchases.data?.purchases ?? []}
        loading={purchases.isLoading}
        empty="No bundle purchases yet."
        keyFn={(r) => r.id}
        columns={[
          { key: "d", header: "When", render: (r) => fmtDateTime(r.createdAt) },
          { key: "u", header: "User", render: (r) => (r.username ? `@${r.username}` : r.uid) },
          { key: "b", header: "Bundle", render: (r) => r.bundleName },
          { key: "p", header: "Paid", render: (r) => <Diamonds n={r.priceDiamonds} /> },
          { key: "g", header: "Items granted", render: (r) => fmtNumber(r.granted.length) },
          { key: "s", header: "Status", render: (r) => <Badge variant={r.status === "refunded" ? "warning" : "success"}>{r.status}</Badge> },
          {
            key: "a",
            header: "",
            render: (r) =>
              r.status === "completed" ? (
                <button className="text-red-600 text-sm font-semibold disabled:opacity-40" onClick={() => setRefunding(r)} disabled={!full}>Refund</button>
              ) : (
                <span className="text-xs text-muted-foreground">{r.refundReason}</span>
              ),
          },
        ]}
      />
      {refunding && (
        <RefundDialog
          purchase={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["shop-bundle-purchases"] });
            qc.invalidateQueries({ queryKey: ["shop-bundles"] });
          }}
        />
      )}
    </Card>
  );
}

function RefundDialog({ purchase, onClose, onDone }: { purchase: ShopBundlePurchase; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { confirm } = useConfirm();
  const who = purchase.username ? `@${purchase.username}` : purchase.uid;
  const mut = useMutation({
    mutationFn: () => api.monetization.refundBundlePurchase(purchase.id, reason.trim()),
    onSuccess: () => {
      toast.success("Refunded. Diamonds returned and the bundle items removed.");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const go = async () => {
    const ok = await confirm({
      title: "Refund this bundle?",
      description: `${who} gets ${fmtNumber(purchase.priceDiamonds)} Diamonds back and loses the ${purchase.granted.length} item(s) this purchase granted. This can't be undone.`,
      confirmLabel: "Refund",
      variant: "destructive",
    });
    if (ok) mut.mutate();
  };
  return (
    <Modal open onClose={onClose} title="Refund bundle purchase">
      <div className="space-y-3 text-sm">
        <p>
          Returns {fmtNumber(purchase.priceDiamonds)} Diamonds to {who}, removes the items this purchase granted ({purchase.granted.join(", ") || "none"}) and unequips them. Items they owned before keep.
        </p>
        <Text label="Reason (3-300 characters, kept in the audit log)" value={reason} onChange={setReason} />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={go} disabled={reason.trim().length < 3 || reason.trim().length > 300 || mut.isPending}>Refund</Button>
        </div>
      </div>
    </Modal>
  );
}
