import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Num, Text, Toggle, field, inr } from "@/components/monetization/shared";

export function ProductsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shop-products"], queryFn: api.monetization.shopProducts });
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [open, setOpen] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<any | "new" | null>(null);
  useEffect(() => {
    if (cfgQ.data && open === null) setOpen(cfgQ.data.effective.shop.enabled);
  }, [cfgQ.data, open]);
  const toggle = useMutation({
    mutationFn: (v: boolean) => api.saveAppSettings({ monetization: { shop: { enabled: v } } }),
    onSuccess: (_r, v) => {
      setOpen(v);
      toast.success(v ? "Shop is open in the app" : "Shop closed");
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const rate = q.data?.dpCoinInr ?? 1;

  return (
    <div className="space-y-5">
      <Card
        title="Products"
        subtitle={`Prices are set in ₹. DP coin price = (₹ price + ₹ delivery) ÷ ₹${rate} per DP coin, rounded up (Coin Economy → Coin value).`}
        action={
          <div className="flex items-center gap-4">
            {open !== null && <Toggle label="Shop open" checked={open} onChange={(v) => toggle.mutate(v)} />}
            <Button onClick={() => setEditing("new")}>New product</Button>
          </div>
        }
      >
        <Table
          data={q.data?.products ?? []}
          loading={q.isLoading}
          empty="No products yet."
          keyFn={(p: any) => p.id}
          columns={[
            { key: "img", header: "", render: (p: any) => (p.images[0] ? <img src={p.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 rounded-lg bg-secondary" />) },
            { key: "t", header: "Product", render: (p: any) => <div><p className="font-semibold">{p.title}</p><p className="text-xs text-muted-foreground">{p.id} · {p.category}</p></div> },
            { key: "p", header: "Price", render: (p: any) => <div><p className="font-semibold">{fmtNumber(p.priceCoins)} DP coin</p><p className="text-xs text-muted-foreground">{inr(p.priceInr)}{p.shippingInr ? ` + ${inr(p.shippingInr)} delivery` : ""}</p></div> },
            { key: "s", header: "Stock", render: (p: any) => p.variants.filter((v: any) => v.active).map((v: any) => `${v.label}: ${v.stock}`).join(" · ") || "–" },
            { key: "sold", header: "Sold", render: (p: any) => fmtNumber(p.unitsSold) },
            { key: "st", header: "Status", render: (p: any) => <Badge variant={p.active ? "active" : "default"}>{p.active ? "on sale" : "hidden"}</Badge> },
            { key: "e", header: "", render: (p: any) => <button className="text-primary text-sm font-semibold" onClick={() => setEditing(p)}>Edit</button> },
          ]}
        />
      </Card>
      {editing && <ProductDialog product={editing === "new" ? null : editing} rate={rate} onClose={() => setEditing(null)} onDone={() => qc.invalidateQueries({ queryKey: ["shop-products"] })} />}
    </div>
  );
}

function ProductDialog({ product, rate, onClose, onDone }: { product: any | null; rate: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    id: product?.id ?? "",
    title: product?.title ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "general",
    images: (product?.images ?? []).join("\n"),
    priceInr: product?.priceInr ?? 0,
    shippingInr: product?.shippingInr ?? 0,
    returnDays: product?.returnDays ?? 7,
    active: product?.active ?? false,
    featured: product?.featured ?? false,
    sort: product?.sort ?? 0,
  });
  const [variants, setVariants] = useState<any[]>(
    product?.variants?.filter((v: any) => v.active).map((v: any) => ({ id: v.id, label: v.label, sku: v.sku ?? "", stock: v.stock })) ?? [{ label: "Standard", sku: "", stock: 0 }],
  );
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const coins = Math.max(1, Math.ceil((Number(f.priceInr) + Number(f.shippingInr)) / rate - 1e-9));
  const mut = useMutation({
    mutationFn: () =>
      api.monetization.saveProduct(f.id.trim(), {
        title: f.title,
        description: f.description,
        category: f.category,
        images: f.images.split(/\s+/).map((u: string) => u.trim()).filter(Boolean),
        priceInr: Number(f.priceInr),
        shippingInr: Number(f.shippingInr),
        returnDays: Number(f.returnDays),
        active: f.active,
        featured: f.featured,
        sort: Number(f.sort),
        variants: variants.map((v) => ({ id: v.id, label: v.label, sku: v.sku || null, stock: Number(v.stock) })),
      }),
    onSuccess: () => {
      toast.success("Product saved");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  return (
    <Modal open onClose={onClose} title={product ? `Edit ${product.title}` : "New product"} width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Id (permanent)</span>
            <input className={field} value={f.id} disabled={!!product} onChange={(e) => set("id", e.target.value)} placeholder="tophunt-tshirt" />
          </label>
          <Text label="Title" value={f.title} onChange={(v) => set("title", v)} />
          <Text label="Category" value={f.category} onChange={(v) => set("category", v.toLowerCase())} hint="e.g. clothing, gadgets" />
        </div>
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Description</span>
          <textarea className={`${field} h-24`} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Image URLs (https, one per line, first is the cover)</span>
          <textarea className={`${field} h-20 font-mono text-xs`} value={f.images} onChange={(e) => set("images", e.target.value)} />
        </label>
        <div className="grid sm:grid-cols-4 gap-3">
          <Num label="Price (₹)" value={f.priceInr} onChange={(v) => set("priceInr", v)} />
          <Num label="Delivery (₹)" value={f.shippingInr} onChange={(v) => set("shippingInr", v)} />
          <Num label="Return window (days)" value={f.returnDays} onChange={(v) => set("returnDays", v)} />
          <Num label="Sort" value={f.sort} onChange={(v) => set("sort", v)} />
        </div>
        <Notice>Customer pays {fmtNumber(coins)} DP coin per unit (at ₹{rate} per DP coin). No ₹ is collected.</Notice>
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Variants and stock</p>
            <button className="text-primary text-xs font-semibold" onClick={() => setVariants([...variants, { label: "", sku: "", stock: 0 }])}>+ Add variant</button>
          </div>
          {variants.map((v, i) => (
            <div key={v.id ?? i} className="grid grid-cols-[1fr_1fr_100px_auto] gap-2 items-end">
              <Text label="Label (size / colour)" value={v.label} onChange={(x) => setVariants(variants.map((y, j) => (j === i ? { ...y, label: x } : y)))} />
              <Text label="SKU" value={v.sku} onChange={(x) => setVariants(variants.map((y, j) => (j === i ? { ...y, sku: x } : y)))} />
              <Num label="Stock" value={v.stock} onChange={(x) => setVariants(variants.map((y, j) => (j === i ? { ...y, stock: x } : y)))} />
              <button className="text-red-600 text-xs font-semibold pb-3" disabled={variants.length === 1} onClick={() => setVariants(variants.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </div>
        <div className="flex gap-6">
          <Toggle label="On sale" checked={f.active} onChange={(v) => set("active", v)} />
          <Toggle label="Featured" checked={f.featured} onChange={(v) => set("featured", v)} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
