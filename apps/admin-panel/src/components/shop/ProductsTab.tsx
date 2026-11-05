import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Num, Text, Toggle, field, inr } from "@/components/monetization/shared";
import { ImageField } from "@/components/shop/ShopHomeTab";
import { ShopStatusPill } from "@/components/shop/ShopSettingsCards";

/**
 * An image URL safe to put in <img src>: parsed, https only, re-serialised by
 * the URL parser (so no raw admin text reaches the DOM). null otherwise.
 */
function safeImageSrc(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}


export function ProductsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shop-products"], queryFn: api.monetization.shopProducts });
  const [editing, setEditing] = useState<any | "new" | null>(null);
  const rate = q.data?.dpCoinInr ?? 1;

  return (
    <div className="space-y-5">
      <Card
        title="Products"
        subtitle={`Prices are set in ₹. DP coin price = (₹ price + ₹ delivery) ÷ ₹${rate} per DP coin, rounded up (Coin Economy → Coin value).`}
        action={
          <div className="flex items-center gap-4">
            <ShopStatusPill kind="shop" />
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
            {
              key: "p",
              header: "Price",
              render: (p: any) => (
                <div>
                  <p className="font-semibold">
                    {p.compareAtCoins ? <span className="text-xs font-medium text-muted-foreground line-through mr-1.5">{fmtNumber(p.compareAtCoins)}</span> : null}
                    {fmtNumber(p.priceCoins)} DP coin
                    {p.compareAtCoins ? <span className="ml-1.5 text-xs font-bold text-red-600">-{pctOff(p.priceCoins, p.compareAtCoins)}%</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{inr(p.priceInr)}{p.shippingInr ? ` + ${inr(p.shippingInr)} delivery` : ""}{p.compareAtInr ? ` · was ${inr(p.compareAtInr)}` : ""}</p>
                </div>
              ),
            },
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

/** Shop → Storefront: the app Physical tab's Categories row and Exclusive Collection, with the live product list they point at. */
export function PhysicalStorefront() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shop-products"], queryFn: api.monetization.shopProducts });
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  return (
    <PhysicalHomeCard
      products={q.data?.products ?? []}
      physical={cfgQ.data?.effective?.shop?.physical}
      configLoaded={!!cfgQ.data}
      onSaved={() => qc.invalidateQueries({ queryKey: ["monetization-config"] })}
    />
  );
}

/** Same limits as the Worker (lib/shopHomeConfig.ts PHYSICAL_LIMITS). */
const MAX_CATEGORIES = 12;
const MAX_EXCLUSIVE = 12;
const CATEGORY_KEY_RE = /^[a-z0-9_-]{2,40}$/;

interface CatDraft {
  key: string;
  label: string;
  imageUrl: string;
  sort: number;
}

/**
 * The app Physical tab's admin-managed blocks: the Categories row (tiles with
 * an uploaded image, in sort order) and the Exclusive Collection (picked
 * products, shown in this order). Saved into appConfig.monetization.shop
 * .physical; an empty list hides the block in the app (categories then fall
 * back to the derived icon tiles).
 */
function PhysicalHomeCard({ products, physical, configLoaded, onSaved }: { products: any[]; physical: any; configLoaded: boolean; onSaved: () => void }) {
  const [cats, setCats] = useState<CatDraft[] | null>(null);
  const [exclusive, setExclusive] = useState<string[] | null>(null);
  useEffect(() => {
    if (configLoaded && cats === null) setCats((physical?.categories ?? []).map((c: any) => ({ key: c.key, label: c.label, imageUrl: c.imageUrl ?? "", sort: c.sort ?? 0 })));
    if (configLoaded && exclusive === null) setExclusive([...(physical?.exclusive ?? [])]);
  }, [configLoaded, physical, cats, exclusive]);

  const knownKeys = [...new Set(products.map((p) => String(p.category)))].filter(Boolean);
  const problems: string[] = [];
  if (cats) {
    const seen = new Set<string>();
    for (const [i, c] of cats.entries()) {
      if (!CATEGORY_KEY_RE.test(c.key)) problems.push(`Category ${i + 1}: the key must be 2-40 lowercase letters, digits, - or _ (the product's category).`);
      if (seen.has(c.key)) problems.push(`Category "${c.key}" is listed twice.`);
      seen.add(c.key);
      if (c.label.trim().length < 2 || c.label.trim().length > 40) problems.push(`Category "${c.key || i + 1}": the label must be 2-40 characters.`);
    }
  }
  const saveCats = useMutation({
    mutationFn: (rows: CatDraft[]) => api.saveAppSettings({ monetization: { shop: { physical: { categories: rows.map((r) => ({ key: r.key.trim(), label: r.label.trim(), imageUrl: r.imageUrl.trim() || null, sort: Math.max(0, Math.floor(Number(r.sort) || 0)) })) } } } }),
    onSuccess: () => {
      toast.success("Categories saved. The Physical tab shows them in sort order.");
      onSaved();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const saveExclusive = useMutation({
    mutationFn: (ids: string[]) => api.saveAppSettings({ monetization: { shop: { physical: { exclusive: ids } } } }),
    onSuccess: () => {
      toast.success("Exclusive Collection saved");
      onSaved();
    },
    onError: (e) => toast.error(describeError(e)),
  });

  if (cats === null || exclusive === null) return null;
  const byId = new Map(products.map((p) => [p.id, p]));
  const setCat = (i: number, patch: Partial<CatDraft>) => setCats((rows) => (rows ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addable = products.filter((p) => !exclusive.includes(p.id));

  return (
    <>
      <Card
        title="Physical tab categories"
        subtitle="The Categories row of the app's Physical tab: a tile per product category with its own image, in sort order. A category with nothing on sale is hidden in the app; with no categories here the app derives tiles from the products."
        action={<Button onClick={() => cats.length < MAX_CATEGORIES && setCats([...cats, { key: knownKeys.find((k) => !cats.some((c) => c.key === k)) ?? "general", label: "", imageUrl: "", sort: (cats[cats.length - 1]?.sort ?? -1) + 1 }])} disabled={cats.length >= MAX_CATEGORIES}>Add category</Button>}
      >
        {cats.length ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {cats.map((c, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-3">
                <ImageField label={`Tile image (${c.label || c.key || `category ${i + 1}`})`} hint="Square image reads best. JPEG, PNG or WebP, max 5 MB." value={c.imageUrl} onChange={(v) => setCat(i, { imageUrl: v })} aspect="1/1" uploadFn={api.uploadShopCategory} />
                <div className="grid grid-cols-[1fr_1fr_80px] gap-2 items-end">
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1 block">Category key</span>
                    <input className={field} list="physical-cat-keys" value={c.key} onChange={(e) => setCat(i, { key: e.target.value.toLowerCase() })} placeholder="t-shirts" />
                  </label>
                  <Text label="Label" value={c.label} onChange={(v) => setCat(i, { label: v })} />
                  <Num label="Sort" value={c.sort} onChange={(v) => setCat(i, { sort: v })} />
                </div>
                <div className="flex justify-end">
                  <button className="text-red-600 text-xs font-semibold" onClick={() => setCats(cats.filter((_, j) => j !== i))}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No categories yet — the app derives the tiles from the products (pink outline icons).</p>
        )}
        <datalist id="physical-cat-keys">{knownKeys.map((k) => <option key={k} value={k} />)}</datalist>
        {problems.length ? <Notice tone="warning">{problems[0]}</Notice> : null}
        <div className="flex justify-end mt-3">
          <Button onClick={() => saveCats.mutate(cats)} disabled={saveCats.isPending || !!problems.length}>{saveCats.isPending ? "Saving…" : "Save categories"}</Button>
        </div>
      </Card>

      <Card
        title="Exclusive Collection"
        subtitle="The app's Physical tab shows these products as the Exclusive Collection shelf, in this order (out-of-stock products are hidden in the app)."
      >
        {exclusive.length ? (
          <ul className="space-y-2">
            {exclusive.map((id, i) => {
              const p = byId.get(id);
              return (
                <li key={id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                  {p?.images?.[0] ? <img src={p.images[0]} alt="" className="w-9 h-9 rounded-lg object-cover" /> : <div className="w-9 h-9 rounded-lg bg-secondary" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{p?.title ?? id}</p>
                    <p className="text-xs text-muted-foreground">{id}{p ? ` · ${fmtNumber(p.priceCoins)} DP coin` : " · not on sale anymore"}</p>
                  </div>
                  <button className="text-muted-foreground disabled:opacity-30 px-1" disabled={i === 0} onClick={() => { const next = [...exclusive]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setExclusive(next); }} aria-label="Move up">▲</button>
                  <button className="text-muted-foreground disabled:opacity-30 px-1" disabled={i === exclusive.length - 1} onClick={() => { const next = [...exclusive]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; setExclusive(next); }} aria-label="Move down">▼</button>
                  <button className="text-red-600 text-xs font-semibold px-1" onClick={() => setExclusive(exclusive.filter((x) => x !== id))}>Remove</button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No products picked — the app hides the Exclusive Collection shelf.</p>
        )}
        <div className="flex items-center gap-2 mt-3">
          <select
            className={field}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id && !exclusive.includes(id) && exclusive.length < MAX_EXCLUSIVE) setExclusive([...exclusive, id]);
            }}
          >
            <option value="">{addable.length ? "Add a product…" : "All products are picked"}</option>
            {addable.map((p) => <option key={p.id} value={p.id}>{p.title} · {fmtNumber(p.priceCoins)} DP</option>)}
          </select>
          <Button onClick={() => saveExclusive.mutate(exclusive)} disabled={saveExclusive.isPending}>{saveExclusive.isPending ? "Saving…" : "Save collection"}</Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">{exclusive.length}/{MAX_EXCLUSIVE} picked.</p>
      </Card>
    </>
  );
}

/** Same limits as the Worker (lib/shop.ts validateProductInput). */
const MAX_IMAGES = 8;
const isHttpsUrl = (u: string) => /^https:\/\/\S+$/i.test(u) && u.length <= 1000;
/** Whole percent off, rounded down (as the app shows it). */
const pctOff = (price: number, was: number | null | undefined) => (was && was > price && price > 0 ? Math.floor(((was - price) / was) * 100) : 0);
/** DP coin for a ₹ amount + delivery at `rate`, rounded up (lib/shop.ts unitCoins). */
const coinsFor = (inrAmount: number, shippingInr: number, rate: number) => Math.max(1, Math.ceil((Number(inrAmount) + Number(shippingInr)) / rate - 1e-9));

/** Live preview under "Original price": the same coin conversion as the price, so the % matches the app. */
function compareHint(priceInr: number, shippingInr: number, raw: string, rate: number): { text: string; ok: boolean } {
  const s = raw.trim();
  if (!s) return { text: "Empty = no discount. Must be a price you really charged before; users always pay the price above.", ok: true };
  const v = Number(s);
  if (!Number.isInteger(v) || v < 1) return { text: "Whole rupees only.", ok: false };
  if (!(v > Number(priceInr))) return { text: `Must be more than the price (${inr(Number(priceInr))}) to show a discount.`, ok: false };
  const now = coinsFor(priceInr, shippingInr, rate);
  const was = coinsFor(v, shippingInr, rate);
  if (was <= now) return { text: "Too close to the price: after rounding to DP coin there is no visible discount.", ok: true };
  return { text: `App shows ${fmtNumber(was)} DP coin struck through, -${pctOff(now, was)}% (delivery included in both). Users pay ${fmtNumber(now)} DP coin.`, ok: true };
}

function ProductDialog({ product, rate, onClose, onDone }: { product: any | null; rate: number; onClose: () => void; onDone: () => void }) {
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [advanced, setAdvanced] = useState(false);
  const [imagesText, setImagesText] = useState<string>((product?.images ?? []).join("\n"));
  const [uploading, setUploading] = useState<{ n: number; of: number; pct: number } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Images uploaded in this dialog: deleted again if they end up unused (the Worker refuses to delete attached ones). */
  const uploaded = useRef<string[]>([]);
  const [f, setF] = useState({
    id: product?.id ?? "",
    title: product?.title ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "general",
    compareAtInr: product?.compareAtInr == null ? "" : String(product.compareAtInr),
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
  const coins = coinsFor(f.priceInr, f.shippingInr, rate);
  const hint = compareHint(Number(f.priceInr), Number(f.shippingInr), f.compareAtInr, rate);
  const badImages = images.filter((u) => !isHttpsUrl(u));
  const imageProblem = images.length > MAX_IMAGES ? `At most ${MAX_IMAGES} images.` : badImages.length ? `Not an https URL: ${badImages[0]}` : null;

  /** Upload one or more files in order, up to the 8-image limit. */
  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, Math.max(0, MAX_IMAGES - images.length));
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) {
      if (list?.length) toast.error(`At most ${MAX_IMAGES} images.`);
      return;
    }
    setImageError(null);
    let next = images;
    try {
      for (const [i, file] of files.entries()) {
        setUploading({ n: i + 1, of: files.length, pct: 0 });
        const { publicUrl } = await api.uploadProductImage(file, (pct) => setUploading({ n: i + 1, of: files.length, pct }));
        uploaded.current.push(publicUrl);
        next = [...next, publicUrl];
        setImages(next);
        setImagesText(next.join("\n"));
      }
      toast.success(files.length > 1 ? `${files.length} images uploaded` : "Image uploaded");
    } catch (e) {
      const msg = describeError(e);
      setImageError(msg);
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  };
  const setList = (next: string[]) => {
    setImages(next);
    setImagesText(next.join("\n"));
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  /** Best-effort: drop this dialog's uploads that the product does not use. Never blocks closing. */
  const discardUnused = (keep: string[]) => {
    const stale = uploaded.current.filter((u) => !keep.includes(u));
    uploaded.current = [];
    void Promise.all(stale.map((u) => api.deleteProductImage(u).catch(() => undefined)));
  };
  const close = () => {
    discardUnused(product?.images ?? []);
    onClose();
  };

  const mut = useMutation({
    mutationFn: () =>
      api.monetization.saveProduct(f.id.trim(), {
        title: f.title,
        description: f.description,
        category: f.category,
        images,
        compareAtInr: f.compareAtInr.trim() === "" ? null : Number(f.compareAtInr),
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
      discardUnused(images);
      onDone();
      onClose();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  return (
    <Modal open onClose={close} title={product ? `Edit ${product.title}` : "New product"} width="max-w-2xl">
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
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Images ({images.length}/{MAX_IMAGES}) · the first one is the cover</p>
            <div className="flex items-center gap-3">
              <button className="text-xs text-muted-foreground underline" onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide URLs" : "Edit URLs (advanced)"}</button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!!uploading || images.length >= MAX_IMAGES}>
                {uploading ? `Uploading ${uploading.n}/${uploading.of} · ${uploading.pct}%` : "Upload images"}
              </Button>
            </div>
          </div>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFiles(e.target.files)} />
          {images.length ? (
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {images.map((u, i) => (
                <li key={`${u}-${i}`} className={`rounded-xl border overflow-hidden ${i === 0 ? "border-primary" : "border-border"}`}>
                  <div className="relative aspect-square bg-secondary">
                    {safeImageSrc(u) ? (
                      <img src={safeImageSrc(u)!} alt={`Image ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] text-red-600 p-1 text-center">Invalid URL (https only)</span>
                    )}
                    {i === 0 ? <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">Cover</span> : null}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1 text-xs">
                    <button className="text-muted-foreground disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">◀</button>
                    {i > 0 ? <button className="text-primary font-semibold" onClick={() => setList([u, ...images.filter((_, j) => j !== i)])}>Set cover</button> : <span />}
                    <button className="text-muted-foreground disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move right">▶</button>
                    <button className="text-red-600 font-semibold" onClick={() => setList(images.filter((_, j) => j !== i))}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No images yet. JPEG, PNG or WebP, max 5 MB each.</p>
          )}
          {advanced && (
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Image URLs (https, one per line, first is the cover)</span>
              <textarea
                className={`${field} h-20 font-mono text-xs`}
                value={imagesText}
                onChange={(e) => {
                  setImagesText(e.target.value);
                  setImages(e.target.value.split(/\s+/).map((u) => u.trim()).filter(Boolean));
                }}
              />
            </label>
          )}
          {imageProblem && <Notice tone="warning">{imageProblem}</Notice>}
          {imageError && <Notice tone="danger">{imageError}</Notice>}
        </div>
        <div className="grid sm:grid-cols-4 gap-3">
          <Num label="Price (₹)" value={f.priceInr} onChange={(v) => set("priceInr", v)} />
          <Num label="Delivery (₹)" value={f.shippingInr} onChange={(v) => set("shippingInr", v)} />
          <Num label="Return window (days)" value={f.returnDays} onChange={(v) => set("returnDays", v)} />
          <Num label="Sort" value={f.sort} onChange={(v) => set("sort", v)} />
        </div>
        <Text label="Original price (₹, optional)" value={f.compareAtInr} onChange={(v) => set("compareAtInr", v)} hint={hint.text} />
        {!hint.ok && <Notice tone="warning">{hint.text}</Notice>}
        <Notice>Customer pays {fmtNumber(coins)} DP coin per unit (at ₹{rate} per DP coin). No ₹ is collected. The original price is display only.</Notice>
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
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !!uploading || !!imageProblem || !hint.ok}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
