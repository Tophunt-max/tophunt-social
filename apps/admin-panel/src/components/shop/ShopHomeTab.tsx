import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { RARITY_COLOR } from "@/lib/shopArt";
import { ItemPreview } from "@/components/monetization/StoreTab";
import { Button, Card, Notice, Text, Toggle, field, fromLocalInput, toLocalInput } from "@/components/monetization/shared";

/**
 * Shopping → Shop home: the two admin-managed blocks at the top of the app's
 * Shop home, kept on their own tab because the Digital items tab is already
 * the listing grid + featured drop + purchases, and these blocks also point at
 * physical products.
 *
 *  - Hero slider (monetization.store.slider). Off or no live slide → the app
 *    shows the Featured drop (Digital items tab), else top-rarity items.
 *  - Special Offers & Daily Deals (monetization.store.deals). Off or no live
 *    card → the app's automatic deal card.
 *
 * Both are saved through /admin/app-settings (full admin, recent sign-in,
 * audited). Limits mirror the Worker (lib/shopHomeConfig.ts), which refuses
 * anything out of range rather than clamping it.
 */

const SLIDER = { maxSlides: 8, autoplay: [2, 15] as const, badge: 24, title: 60, subtitle: 140, ctaLabel: 24, maxItems: 12 } as const;
const DEALS = { maxCards: 6, sectionTitle: 40, title: 40, subtitle: 90, ctaLabel: 20, maxItems: 24 } as const;
const ID_RE = /^[a-z0-9_-]{2,40}$/;
const ITEM_TYPES = ["frame", "theme", "title", "badge", "effect", "sticker", "collectible", "accessory"] as const;
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;
const TYPE_LABEL: Record<string, string> = {
  frame: "Profile frame", theme: "Profile theme", badge: "Name badge", title: "Title",
  effect: "Effect", accessory: "Accessory", sticker: "Sticker", collectible: "Collectible",
};

/** An in-app path: one leading "/", no scheme, no "//" (same rule as the Worker). */
const isAppPath = (v: string) => v.length <= 120 && v.startsWith("/") && !v.includes("//") && !v.includes("\\") && /^\/[A-Za-z0-9\-._~/?=&%#+]*$/.test(v);
const isHttps = (v: string) => /^https:\/\/\S+$/i.test(v) && v.length <= 1000;

/** A store row (GET /admin/monetization/store) is on sale right now. */
const onSale = (r: any, now = Date.now()) =>
  !!r?.listing && r.listing.active && r.itemActive && !(r.listing.endsAt && r.listing.endsAt <= now) && !(r.listing.startsAt && r.listing.startsAt > now);
const pctOff = (price: number, was: number | null | undefined) => (was && was > price && price > 0 ? Math.floor(((was - price) / was) * 100) : 0);

/** "mythic-week" from "Mythic Week!", unique against `taken`. */
function makeId(base: string, taken: string[], fallback: string): string {
  let slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  if (slug.length < 2) slug = fallback;
  let id = slug;
  for (let n = 2; taken.includes(id); n++) id = `${slug}-${n}`.slice(0, 40);
  return id;
}

function moveIn<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function windowState(startsAt: string, endsAt: string, now = Date.now()): { label: string; tone: "active" | "warning" | "default" } {
  const s = fromLocalInput(startsAt);
  const e = fromLocalInput(endsAt);
  if (e !== null && e <= now) return { label: "ended", tone: "default" };
  if (s !== null && s > now) return { label: "scheduled", tone: "warning" };
  return { label: "live window", tone: "active" };
}

export function ShopHomeTab() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const items = useQuery({ queryKey: ["mon-store"], queryFn: api.monetization.store });
  const products = useQuery({ queryKey: ["shop-products"], queryFn: api.monetization.shopProducts });
  const onSaved = () => qc.invalidateQueries({ queryKey: ["monetization-config"] });
  const eff = cfgQ.data?.effective;
  if (cfgQ.isLoading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  if (cfgQ.isError || !eff) return <Notice tone="danger">Could not load the settings: {(cfgQ.error as any)?.message}</Notice>;
  const all: any[] = items.data ?? [];
  const prods: any[] = products.data?.products ?? [];
  return (
    <div className="space-y-5">
      {!eff.store?.enabled && <Notice tone="warning">The digital store is closed (Digital items tab), so the app hides the slider and digital deal cards. Product deal cards still show while the physical shop is open.</Notice>}
      <SliderCard saved={eff.store?.slider} items={all} products={prods} onSaved={onSaved} />
      <DealsCard saved={eff.store?.deals} items={all} products={prods} onSaved={onSaved} />
    </div>
  );
}

// ------------------------------------------------------------------ shared editors

/** Upload to /admin/media/shop-banner (or another shop image endpoint via uploadFn) with progress, preview and remove. */
export function ImageField({ label, hint, value, onChange, aspect, uploadFn }: { label: string; hint: string; value: string; onChange: (v: string) => void; aspect: string; uploadFn?: (file: File, onProgress?: (pct: number) => void) => Promise<{ publicUrl: string }> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const { publicUrl } = await (uploadFn ?? api.uploadShopBanner)(file, setProgress);
      onChange(publicUrl);
      toast.success("Image uploaded. Save to publish it.");
    } catch (e) {
      const msg = describeError(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setProgress(null);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div>
      <span className="text-xs text-muted-foreground mb-1 block">{label}</span>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {value ? (
        <div className="rounded-xl border border-border overflow-hidden bg-secondary" style={{ aspectRatio: aspect }}>
          <img src={value} alt={label} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-secondary/50 flex items-center justify-center text-xs text-muted-foreground" style={{ aspectRatio: aspect }}>No image</div>
      )}
      <div className="flex gap-2 mt-2">
        <Button variant="secondary" onClick={() => ref.current?.click()} disabled={progress !== null}>
          {progress !== null ? `Uploading ${progress}%` : value ? "Replace" : "Upload"}
        </Button>
        {value ? <Button variant="secondary" onClick={() => onChange("")}>Remove</Button> : null}
      </div>
      <span className="text-[11px] text-muted-foreground mt-1 block">{hint}</span>
      {error && <span className="text-[11px] text-red-600 mt-1 block">{error}</span>}
    </div>
  );
}

/** Ordered multi-select of listed catalogue items. */
function ItemsPicker({ items, value, onChange, max, label }: { items: any[]; value: string[]; onChange: (ids: string[]) => void; max: number; label: string }) {
  const [pick, setPick] = useState("");
  const byId = useMemo(() => new Map(items.map((r) => [r.itemId, r])), [items]);
  const listed = useMemo(() => items.filter((r) => r.listing), [items]);
  const add = () => {
    if (!pick || value.includes(pick) || value.length >= max) return;
    onChange([...value, pick]);
    setPick("");
  };
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label} ({value.length}/{max})</p>
      <div className="flex gap-2 mb-2">
        <select className={`${field} md:max-w-sm`} value={pick} onChange={(e) => setPick(e.target.value)} disabled={value.length >= max}>
          <option value="">Add a listed item…</option>
          {listed.filter((r) => !value.includes(r.itemId)).map((r) => (
            <option key={r.itemId} value={r.itemId}>
              {r.name} · {r.rarity} · {TYPE_LABEL[r.type] ?? r.type}{onSale(r) ? "" : " (not on sale)"}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={add} disabled={!pick}>Add</Button>
      </div>
      {value.length ? (
        <ul className="space-y-1.5">
          {value.map((id, i) => {
            const r = byId.get(id);
            const off = r?.listing ? pctOff(r.listing.priceCoins, r.listing.compareAtCoins) : 0;
            return (
              <li key={id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm">
                <span className="font-semibold">{r?.name ?? id}</span>
                {r ? (
                  <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full text-white" style={{ background: RARITY_COLOR[r.rarity] ?? RARITY_COLOR.common }}>{r.rarity}</span>
                ) : (
                  <Badge variant="warning">not in catalogue</Badge>
                )}
                {r && !onSale(r) ? <Badge variant="warning">not on sale</Badge> : null}
                {off ? <span className="text-xs font-bold text-red-600">-{off}%</span> : null}
                <span className="flex-1" />
                <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => onChange(moveIn(value, i, -1))} disabled={i === 0} aria-label="Move up">▲</button>
                <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => onChange(moveIn(value, i, 1))} disabled={i === value.length - 1} aria-label="Move down">▼</button>
                <button className="text-xs text-red-600 font-semibold" onClick={() => onChange(value.filter((x) => x !== id))}>Remove</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No items.</p>
      )}
    </div>
  );
}

function Schedule({ startsAt, endsAt, onChange, timerLabel, timer, onTimer, timerHint }: {
  startsAt: string; endsAt: string; onChange: (p: { startsAt?: string; endsAt?: string }) => void;
  timerLabel: string; timer: boolean; onTimer: (v: boolean) => void; timerHint: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
      <label className="block">
        <span className="text-xs text-muted-foreground mb-1 block">Starts (optional)</span>
        <div className="flex gap-2">
          <input type="datetime-local" className={field} value={startsAt} onChange={(e) => onChange({ startsAt: e.target.value })} />
          {startsAt ? <Button variant="secondary" onClick={() => onChange({ startsAt: "" })}>Clear</Button> : null}
        </div>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground mb-1 block">Ends (optional)</span>
        <div className="flex gap-2">
          <input type="datetime-local" className={field} value={endsAt} onChange={(e) => onChange({ endsAt: e.target.value })} />
          {endsAt ? <Button variant="secondary" onClick={() => onChange({ endsAt: "" })}>Clear</Button> : null}
        </div>
      </label>
      <div className="pt-6"><Toggle label={timerLabel} checked={timer} onChange={onTimer} hint={timerHint} /></div>
    </div>
  );
}

function ListRow({ title, sub, badges, index, count, active, onSelect, onMove, onDuplicate, onDelete, canDuplicate }: {
  title: string; sub: string; badges: React.ReactNode; index: number; count: number; active: boolean;
  onSelect: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onDelete: () => void; canDuplicate: boolean;
}) {
  return (
    <li className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${active ? "border-primary bg-primary/5" : "border-border"}`}>
      <button className="text-left flex-1 min-w-0" onClick={onSelect}>
        <span className="font-semibold block truncate">{index + 1}. {title || "(no title)"}</span>
        <span className="text-xs text-muted-foreground block truncate">{sub}</span>
      </button>
      {badges}
      <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">▲</button>
      <button className="text-xs text-muted-foreground disabled:opacity-30" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">▼</button>
      <button className="text-xs text-primary font-semibold disabled:opacity-30" onClick={onDuplicate} disabled={!canDuplicate}>Duplicate</button>
      <button className="text-xs text-red-600 font-semibold" onClick={onDelete}>Delete</button>
    </li>
  );
}

// ------------------------------------------------------------------ hero slider

type TargetKind = "items" | "item" | "digital" | "physical" | "product" | "url";
interface SlideDraft {
  id: string;
  enabled: boolean;
  badge: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  imageUrl: string;
  mobileImageUrl: string;
  itemIds: string[];
  kind: TargetKind;
  itemId: string;
  type: string;
  rarities: string[];
  productId: string;
  path: string;
  startsAt: string;
  endsAt: string;
  showCountdown: boolean;
}

const TARGET_LABEL: Record<TargetKind, string> = {
  items: "Digital tab, these items",
  item: "One item's page",
  digital: "Digital tab (type / rarity filter)",
  physical: "Physical tab",
  product: "One product's page",
  url: "App path",
};

function slideFromSaved(s: any): SlideDraft {
  const t = s?.target ?? { kind: "items" };
  return {
    id: s.id, enabled: !!s.enabled, badge: s.badge ?? "", title: s.title ?? "", subtitle: s.subtitle ?? "", ctaLabel: s.ctaLabel ?? "Explore Collection",
    imageUrl: s.imageUrl ?? "", mobileImageUrl: s.mobileImageUrl ?? "", itemIds: Array.isArray(s.itemIds) ? s.itemIds : [],
    kind: t.kind, itemId: t.itemId ?? "", type: t.type ?? "", rarities: Array.isArray(t.rarities) ? t.rarities : [], productId: t.productId ?? "", path: t.path ?? "",
    startsAt: toLocalInput(s.startsAt), endsAt: toLocalInput(s.endsAt), showCountdown: !!s.showCountdown,
  };
}

function newSlide(taken: string[]): SlideDraft {
  return {
    id: makeId("slide", taken, "slide"), enabled: false, badge: "", title: "", subtitle: "", ctaLabel: "Explore Collection", imageUrl: "", mobileImageUrl: "",
    itemIds: [], kind: "items", itemId: "", type: "", rarities: [], productId: "", path: "", startsAt: "", endsAt: "", showCountdown: false,
  };
}

function slideToWire(d: SlideDraft) {
  const target =
    d.kind === "item" ? { kind: "item", itemId: d.itemId }
      : d.kind === "digital" ? { kind: "digital", type: d.type || null, rarities: d.rarities }
        : d.kind === "product" ? { kind: "product", productId: d.productId }
          : d.kind === "url" ? { kind: "url", path: d.path.trim() }
            : { kind: d.kind };
  return {
    id: d.id, enabled: d.enabled, badge: d.badge.trim(), title: d.title.trim(), subtitle: d.subtitle.trim(), ctaLabel: d.ctaLabel.trim(),
    imageUrl: d.imageUrl || null, mobileImageUrl: d.mobileImageUrl || null, itemIds: d.itemIds, target,
    startsAt: fromLocalInput(d.startsAt), endsAt: fromLocalInput(d.endsAt), showCountdown: d.showCountdown,
  };
}

function slideProblems(d: SlideDraft, n: number, all: SlideDraft[]): string[] {
  const p: string[] = [];
  const at = `Slide ${n}`;
  if (!ID_RE.test(d.id)) p.push(`${at}: id must be 2-40 lowercase letters, digits, _ or -.`);
  if (all.filter((x) => x.id === d.id).length > 1) p.push(`${at}: id "${d.id}" is used twice.`);
  if (!d.title.trim()) p.push(`${at}: title is required.`);
  if (d.title.trim().length > SLIDER.title) p.push(`${at}: title max ${SLIDER.title}.`);
  if (d.badge.trim().length > SLIDER.badge) p.push(`${at}: badge max ${SLIDER.badge}.`);
  if (d.subtitle.trim().length > SLIDER.subtitle) p.push(`${at}: subtitle max ${SLIDER.subtitle}.`);
  if (!d.ctaLabel.trim() || d.ctaLabel.trim().length > SLIDER.ctaLabel) p.push(`${at}: button label 1-${SLIDER.ctaLabel} characters.`);
  if (d.imageUrl && !isHttps(d.imageUrl)) p.push(`${at}: desktop image must be an https URL.`);
  if (d.mobileImageUrl && !isHttps(d.mobileImageUrl)) p.push(`${at}: phone image must be an https URL.`);
  if (!d.imageUrl && !d.mobileImageUrl && !d.itemIds.length) p.push(`${at}: add an image or at least one item to draw.`);
  if (d.kind === "items" && !d.itemIds.length) p.push(`${at}: "${TARGET_LABEL.items}" needs items.`);
  if (d.kind === "item" && !d.itemId) p.push(`${at}: pick the item to open.`);
  if (d.kind === "product" && !d.productId) p.push(`${at}: pick the product to open.`);
  if (d.kind === "url" && !isAppPath(d.path.trim())) p.push(`${at}: the app path must start with "/" (max 120, no "//", no external links).`);
  const s = fromLocalInput(d.startsAt);
  const e = fromLocalInput(d.endsAt);
  if (s !== null && e !== null && e <= s) p.push(`${at}: the end must be after the start.`);
  return p;
}

function SliderCard({ saved, items, products, onSaved }: { saved: any; items: any[]; products: any[]; onSaved: () => void }) {
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [autoplaySec, setAutoplaySec] = useState(4);
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [sel, setSel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saved && enabled === null) {
      setEnabled(!!saved.enabled);
      setAutoplaySec(Number(saved.autoplaySec) || 4);
      setSlides((saved.slides ?? []).map(slideFromSaved));
    }
  }, [saved, enabled]);

  const save = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { store: { slider: { enabled: !!enabled, autoplaySec, slides: slides.map(slideToWire) } } } }),
    onSuccess: () => {
      setError(null);
      toast.success("Shop slider saved");
      onSaved();
    },
    onError: (e) => {
      const msg = describeError(e);
      setError(msg);
      toast.error(msg);
    },
  });

  if (enabled === null) return null;
  const problems = [
    !(Number.isInteger(autoplaySec) && autoplaySec >= SLIDER.autoplay[0] && autoplaySec <= SLIDER.autoplay[1]) && `Autoplay must be ${SLIDER.autoplay[0]}-${SLIDER.autoplay[1]} seconds.`,
    enabled && !slides.some((s) => s.enabled) && "Turn on at least one slide, or the app keeps showing the featured drop.",
    ...slides.flatMap((s, i) => slideProblems(s, i + 1, slides)),
  ].filter(Boolean) as string[];
  const cur = slides[Math.min(sel, slides.length - 1)];
  const update = (patch: Partial<SlideDraft>) => setSlides(slides.map((s, i) => (i === sel ? { ...s, ...patch } : s)));
  const ids = slides.map((s) => s.id);

  return (
    <Card
      title="Shop slider"
      subtitle="The hero slider at the top of the Shop home. Slides point at real items, products or app pages; prices and stock still come from the listings."
      action={<Toggle label="Show slider" checked={enabled} onChange={setEnabled} />}
    >
      {!full && <Notice tone="warning">Only full admins can change the Shop slider.</Notice>}
      <Notice>
        The app shows enabled slides inside their start/end window (server time) while the store is open. A slide without an image draws its first item that is on sale; slides whose items are all unavailable and that have no image are skipped, and so are slides whose target leads nowhere (item / product not on sale, shop closed). No live slide → the featured drop, then top-rarity items. Autoplay stops for users with reduced motion.
      </Notice>
      <fieldset disabled={!full} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Autoplay (seconds, {SLIDER.autoplay[0]}-{SLIDER.autoplay[1]})</span>
            <input type="number" className={field} min={SLIDER.autoplay[0]} max={SLIDER.autoplay[1]} value={autoplaySec} onChange={(e) => setAutoplaySec(Number(e.target.value))} />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Slides ({slides.length}/{SLIDER.maxSlides})</p>
            <Button variant="secondary" onClick={() => { setSlides([...slides, newSlide(ids)]); setSel(slides.length); }} disabled={slides.length >= SLIDER.maxSlides}>+ Add slide</Button>
          </div>
          {slides.length ? (
            <ul className="space-y-1.5">
              {slides.map((s, i) => {
                const w = windowState(s.startsAt, s.endsAt);
                return (
                  <ListRow
                    key={`${s.id}-${i}`}
                    title={s.title}
                    sub={`${s.id} · ${TARGET_LABEL[s.kind]}${s.imageUrl || s.mobileImageUrl ? " · image" : ` · ${s.itemIds.length} item(s)`}`}
                    badges={<>{s.enabled ? <Badge variant={w.tone}>{w.label}</Badge> : <Badge>off</Badge>}</>}
                    index={i}
                    count={slides.length}
                    active={i === sel}
                    onSelect={() => setSel(i)}
                    onMove={(d) => { setSlides(moveIn(slides, i, d)); setSel(Math.max(0, Math.min(slides.length - 1, i + d))); }}
                    onDuplicate={() => { const copy = { ...s, id: makeId(`${s.id}-copy`, ids, "slide"), enabled: false }; setSlides([...slides.slice(0, i + 1), copy, ...slides.slice(i + 1)]); setSel(i + 1); }}
                    canDuplicate={slides.length < SLIDER.maxSlides}
                    onDelete={() => { setSlides(slides.filter((_, j) => j !== i)); setSel(Math.max(0, sel >= i ? sel - 1 : sel)); }}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No slides yet.</p>
          )}
        </div>

        {cur ? <SlideEditor key={sel} d={cur} update={update} items={items} products={products} taken={ids.filter((_, j) => j !== sel)} /> : null}
      </fieldset>

      {problems.length > 0 && <Notice tone="warning">{problems.join(" ")}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={!full || save.isPending || problems.length > 0}>{save.isPending ? "Saving…" : "Save slider"}</Button>
      </div>
    </Card>
  );
}

function SlideEditor({ d, update, items, products, taken }: { d: SlideDraft; update: (p: Partial<SlideDraft>) => void; items: any[]; products: any[]; taken: string[] }) {
  const listed = items.filter((r) => r.listing);
  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-sm">Edit slide</p>
        <Toggle label="Slide enabled" checked={d.enabled} onChange={(v) => update({ enabled: v })} />
      </div>
      <SlidePreview d={d} items={items} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Id (2-40: a-z, 0-9, _ -)</span>
          <input className={field} value={d.id} onChange={(e) => update({ id: e.target.value.toLowerCase() })} />
          {taken.includes(d.id) && <span className="text-[11px] text-red-600 mt-1 block">Another slide already uses this id.</span>}
        </label>
        <Text label={`Badge (optional, max ${SLIDER.badge})`} value={d.badge} onChange={(v) => update({ badge: v })} placeholder="Legendary Drop" />
        <Text label={`Title (max ${SLIDER.title})`} value={d.title} onChange={(v) => update({ title: v })} placeholder="Mythic Week" />
        <Text label={`Button label (max ${SLIDER.ctaLabel})`} value={d.ctaLabel} onChange={(v) => update({ ctaLabel: v })} placeholder="Explore Collection" />
      </div>
      <label className="block">
        <span className="text-xs text-muted-foreground mb-1 block">Subtitle (optional, max {SLIDER.subtitle})</span>
        <textarea className={field} rows={2} value={d.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ImageField label="Desktop image (wide)" hint="About 1500×290 (≈5:1). Text sits on the left; a dark gradient keeps it readable. JPEG/PNG/WebP, max 5 MB." value={d.imageUrl} onChange={(v) => update({ imageUrl: v })} aspect="748 / 145" />
        <ImageField label="Phone image" hint="About 1000×390 (≈2.5:1). Optional; phones use the desktop image without it." value={d.mobileImageUrl} onChange={(v) => update({ mobileImageUrl: v })} aspect="316 / 124" />
      </div>
      <ItemsPicker items={items} value={d.itemIds} onChange={(ids) => update({ itemIds: ids })} max={SLIDER.maxItems} label="Items (drawn as the art when there is no image; the first one on sale)" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Button and tap go to</span>
          <select className={field} value={d.kind} onChange={(e) => update({ kind: e.target.value as TargetKind })}>
            {(Object.keys(TARGET_LABEL) as TargetKind[]).map((k) => <option key={k} value={k}>{TARGET_LABEL[k]}</option>)}
          </select>
        </label>
        {d.kind === "item" && (
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Item</span>
            <select className={field} value={d.itemId} onChange={(e) => update({ itemId: e.target.value })}>
              <option value="">Pick an item…</option>
              {listed.map((r) => <option key={r.itemId} value={r.itemId}>{r.name} · {r.rarity}{onSale(r) ? "" : " (not on sale)"}</option>)}
            </select>
          </label>
        )}
        {d.kind === "product" && (
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Product</span>
            <select className={field} value={d.productId} onChange={(e) => update({ productId: e.target.value })}>
              <option value="">Pick a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}{p.active ? "" : " (hidden)"}</option>)}
            </select>
          </label>
        )}
        {d.kind === "url" && <Text label="App path" value={d.path} onChange={(v) => update({ path: v })} placeholder="/explore/battles" hint='Starts with "/". External links are not allowed.' />}
        {d.kind === "digital" && (
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Item type (optional)</span>
            <select className={field} value={d.type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">Any type</option>
              {ITEM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
            </select>
          </label>
        )}
      </div>
      {d.kind === "digital" && (
        <div className="flex flex-wrap gap-3">
          <span className="text-xs text-muted-foreground w-full">Rarities (none = any)</span>
          {RARITIES.map((r) => (
            <Toggle key={r} label={r} checked={d.rarities.includes(r)} onChange={(v) => update({ rarities: v ? RARITIES.filter((x) => x === r || d.rarities.includes(x)) : d.rarities.filter((x) => x !== r) })} />
          ))}
        </div>
      )}
      <Schedule
        startsAt={d.startsAt}
        endsAt={d.endsAt}
        onChange={(p) => update(p)}
        timerLabel="Show countdown"
        timer={d.showCountdown}
        onTimer={(v) => update({ showCountdown: v })}
        timerHint={d.endsAt ? "Counts down to the end time." : "Needs an end time; without one no countdown is shown."}
      />
    </div>
  );
}

/** Rough live preview: the image (or the first item) with the copy on top. */
function SlidePreview({ d, items }: { d: SlideDraft; items: any[] }) {
  const byId = new Map(items.map((r) => [r.itemId, r]));
  const art = d.itemIds.map((id) => byId.get(id)).find((r) => r && onSale(r)) ?? null;
  const img = d.imageUrl || d.mobileImageUrl;
  return (
    <div className="relative rounded-2xl overflow-hidden border border-pink-500/60" style={{ aspectRatio: "748 / 145", background: "linear-gradient(120deg,#2A0A5E,#4C0F86,#7E1A9E)" }} aria-label="Slide preview">
      {img ? (
        <>
          <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,4,24,.88), rgba(10,4,24,.55) 35%, rgba(10,4,24,0) 62%)" }} />
        </>
      ) : art ? (
        <div className="absolute right-[15%] top-0 bottom-0 w-[25%] overflow-hidden rounded-xl"><ItemPreview r={art} height={120} /></div>
      ) : (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/70">No image and no item on sale: the app skips this slide.</div>
      )}
      <div className="absolute left-[3%] top-0 bottom-0 w-[40%] flex flex-col justify-center items-start gap-1">
        {d.badge.trim() ? <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">{d.badge}</span> : null}
        <span className="text-lg font-extrabold uppercase text-amber-300 leading-tight line-clamp-2">{d.title || "Title"}</span>
        {d.subtitle ? <span className="text-[11px] text-white line-clamp-1">{d.subtitle}</span> : null}
        <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-yellow-300 text-indigo-950">{d.ctaLabel || "Explore Collection"} →</span>
      </div>
      {d.showCountdown && d.endsAt ? <span className="absolute right-2 top-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500 text-white">LIMITED TIME · countdown</span> : null}
    </div>
  );
}

// ------------------------------------------------------------------ deals

type SourceKind = "digital_items" | "product" | "all_discounts";
interface DealDraft {
  id: string;
  enabled: boolean;
  title: string;
  subtitle: string;
  ctaLabel: string;
  imageUrl: string;
  kind: SourceKind;
  itemIds: string[];
  productId: string;
  ribbon: "auto" | "none";
  startsAt: string;
  endsAt: string;
  showTimer: boolean;
}

const SOURCE_LABEL: Record<SourceKind, string> = {
  digital_items: "Picked digital items",
  product: "One physical product",
  all_discounts: "All discounted digital items",
};

function dealFromSaved(c: any): DealDraft {
  const s = c?.source ?? { kind: "all_discounts" };
  return {
    id: c.id, enabled: !!c.enabled, title: c.title ?? "", subtitle: c.subtitle ?? "", ctaLabel: c.ctaLabel ?? "Grab Now", imageUrl: c.imageUrl ?? "",
    kind: s.kind, itemIds: Array.isArray(s.itemIds) ? s.itemIds : [], productId: s.productId ?? "", ribbon: c.ribbon === "none" ? "none" : "auto",
    startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt), showTimer: !!c.showTimer,
  };
}

function dealToWire(d: DealDraft) {
  const source = d.kind === "digital_items" ? { kind: d.kind, itemIds: d.itemIds } : d.kind === "product" ? { kind: d.kind, productId: d.productId } : { kind: d.kind };
  return {
    id: d.id, enabled: d.enabled, title: d.title.trim(), subtitle: d.subtitle.trim(), ctaLabel: d.ctaLabel.trim(), imageUrl: d.imageUrl || null,
    source, ribbon: d.ribbon, startsAt: fromLocalInput(d.startsAt), endsAt: fromLocalInput(d.endsAt), showTimer: d.showTimer,
  };
}

function dealProblems(d: DealDraft, n: number, all: DealDraft[]): string[] {
  const p: string[] = [];
  const at = `Card ${n}`;
  if (!ID_RE.test(d.id)) p.push(`${at}: id must be 2-40 lowercase letters, digits, _ or -.`);
  if (all.filter((x) => x.id === d.id).length > 1) p.push(`${at}: id "${d.id}" is used twice.`);
  if (!d.title.trim() || d.title.trim().length > DEALS.title) p.push(`${at}: title 1-${DEALS.title} characters.`);
  if (d.subtitle.trim().length > DEALS.subtitle) p.push(`${at}: subtitle max ${DEALS.subtitle}.`);
  if (!d.ctaLabel.trim() || d.ctaLabel.trim().length > DEALS.ctaLabel) p.push(`${at}: button label 1-${DEALS.ctaLabel} characters.`);
  if (d.imageUrl && !isHttps(d.imageUrl)) p.push(`${at}: image must be an https URL.`);
  if (d.kind === "digital_items" && (d.itemIds.length < 1 || d.itemIds.length > DEALS.maxItems)) p.push(`${at}: pick 1-${DEALS.maxItems} items.`);
  if (d.kind === "product" && !d.productId) p.push(`${at}: pick a product.`);
  const s = fromLocalInput(d.startsAt);
  const e = fromLocalInput(d.endsAt);
  if (s !== null && e !== null && e <= s) p.push(`${at}: the end must be after the start.`);
  return p;
}

/**
 * What the app will compute for the ribbon (same rule as shopModel
 * resolveDealCards): the biggest real compare-at discount among the source's
 * items on sale (owned items aside, which only the app knows).
 */
function ribbonPreview(d: DealDraft, items: any[], products: any[]): { pct: number; count: number; live: number } {
  if (d.kind === "product") {
    const p = products.find((x) => x.id === d.productId);
    const live = p && p.active && p.variants.some((v: any) => v.active && v.stock > 0) ? 1 : 0;
    const pct = p ? pctOff(p.priceCoins, p.compareAtCoins) : 0;
    return { pct, count: pct ? 1 : 0, live };
  }
  const pool = d.kind === "digital_items" ? d.itemIds.map((id) => items.find((r) => r.itemId === id)).filter(Boolean) : items;
  const live = pool.filter((r: any) => onSale(r));
  const offs = live.map((r: any) => pctOff(r.listing.priceCoins, r.listing.compareAtCoins)).filter((x: number) => x > 0);
  return { pct: offs.length ? Math.max(...offs) : 0, count: offs.length, live: d.kind === "all_discounts" ? offs.length : live.length };
}

function DealsCard({ saved, items, products, onSaved }: { saved: any; items: any[]; products: any[]; onSaved: () => void }) {
  const { user } = useAuth();
  const full = !user?.role || isFullAdminRole(user.role);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState("Special Offers & Daily Deals");
  const [cards, setCards] = useState<DealDraft[]>([]);
  const [sel, setSel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saved && enabled === null) {
      setEnabled(!!saved.enabled);
      setTitle(saved.title ?? "Special Offers & Daily Deals");
      setCards((saved.cards ?? []).map(dealFromSaved));
    }
  }, [saved, enabled]);

  const save = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { store: { deals: { enabled: !!enabled, title: title.trim(), cards: cards.map(dealToWire) } } } }),
    onSuccess: () => {
      setError(null);
      toast.success("Deals saved");
      onSaved();
    },
    onError: (e) => {
      const msg = describeError(e);
      setError(msg);
      toast.error(msg);
    },
  });

  if (enabled === null) return null;
  const problems = [
    (!title.trim() || title.trim().length > DEALS.sectionTitle) && `Section title 1-${DEALS.sectionTitle} characters.`,
    enabled && !cards.some((c) => c.enabled) && "Turn on at least one card, or the app keeps its automatic deal card.",
    ...cards.flatMap((c, i) => dealProblems(c, i + 1, cards)),
  ].filter(Boolean) as string[];
  const cur = cards[Math.min(sel, cards.length - 1)];
  const update = (patch: Partial<DealDraft>) => setCards(cards.map((c, i) => (i === sel ? { ...c, ...patch } : c)));
  const ids = cards.map((c) => c.id);
  const add = () => {
    setCards([...cards, { id: makeId("deal", ids, "deal"), enabled: false, title: "", subtitle: "", ctaLabel: "Grab Now", imageUrl: "", kind: "all_discounts", itemIds: [], productId: "", ribbon: "auto", startsAt: "", endsAt: "", showTimer: false }]);
    setSel(cards.length);
  };

  return (
    <Card
      title="Special Offers & Daily Deals"
      subtitle="Deal cards on the Shop home. There is no discount field: the ribbon's % is computed from the real original prices (compare-at) of the card's items or product, and hidden when that is 0."
      action={<Toggle label="Show deal cards" checked={enabled} onChange={setEnabled} />}
    >
      {!full && <Notice tone="warning">Only full admins can change the deal cards.</Notice>}
      <Notice>
        A card shows inside its start/end window while its side is open (digital items: the store; a product: the physical shop) and hides itself when its source has nothing live. Several live cards become a swipeable row with dots. None live → the app's automatic deal card.
      </Notice>
      <fieldset disabled={!full} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Text label={`Section title (max ${DEALS.sectionTitle})`} value={title} onChange={setTitle} placeholder="Special Offers & Daily Deals" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">Cards ({cards.length}/{DEALS.maxCards})</p>
            <Button variant="secondary" onClick={add} disabled={cards.length >= DEALS.maxCards}>+ Add card</Button>
          </div>
          {cards.length ? (
            <ul className="space-y-1.5">
              {cards.map((c, i) => {
                const w = windowState(c.startsAt, c.endsAt);
                const r = ribbonPreview(c, items, products);
                return (
                  <ListRow
                    key={`${c.id}-${i}`}
                    title={c.title}
                    sub={`${c.id} · ${SOURCE_LABEL[c.kind]}${c.ribbon === "auto" && r.pct ? ` · up to ${r.pct}% off` : ""}`}
                    badges={<>{c.enabled ? <Badge variant={w.tone}>{w.label}</Badge> : <Badge>off</Badge>}{!r.live ? <Badge variant="warning">nothing live</Badge> : null}</>}
                    index={i}
                    count={cards.length}
                    active={i === sel}
                    onSelect={() => setSel(i)}
                    onMove={(d) => { setCards(moveIn(cards, i, d)); setSel(Math.max(0, Math.min(cards.length - 1, i + d))); }}
                    onDuplicate={() => { const copy = { ...c, id: makeId(`${c.id}-copy`, ids, "deal"), enabled: false }; setCards([...cards.slice(0, i + 1), copy, ...cards.slice(i + 1)]); setSel(i + 1); }}
                    canDuplicate={cards.length < DEALS.maxCards}
                    onDelete={() => { setCards(cards.filter((_, j) => j !== i)); setSel(Math.max(0, sel >= i ? sel - 1 : sel)); }}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No cards yet.</p>
          )}
        </div>
        {cur ? <DealEditor key={sel} d={cur} update={update} items={items} products={products} taken={ids.filter((_, j) => j !== sel)} /> : null}
      </fieldset>
      {problems.length > 0 && <Notice tone="warning">{problems.join(" ")}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={!full || save.isPending || problems.length > 0}>{save.isPending ? "Saving…" : "Save deals"}</Button>
      </div>
    </Card>
  );
}

function DealEditor({ d, update, items, products, taken }: { d: DealDraft; update: (p: Partial<DealDraft>) => void; items: any[]; products: any[]; taken: string[] }) {
  const r = ribbonPreview(d, items, products);
  const unit = d.kind === "product" ? "product" : "discounted item";
  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-sm">Edit card</p>
        <Toggle label="Card enabled" checked={d.enabled} onChange={(v) => update({ enabled: v })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Id (2-40: a-z, 0-9, _ -)</span>
          <input className={field} value={d.id} onChange={(e) => update({ id: e.target.value.toLowerCase() })} />
          {taken.includes(d.id) && <span className="text-[11px] text-red-600 mt-1 block">Another card already uses this id.</span>}
        </label>
        <Text label={`Title (max ${DEALS.title})`} value={d.title} onChange={(v) => update({ title: v })} placeholder="Mega Shop Deal" />
        <Text label={`Subtitle (optional, max ${DEALS.subtitle})`} value={d.subtitle} onChange={(v) => update({ subtitle: v })} placeholder="Premium items special discount par!" />
        <Text label={`Button label (max ${DEALS.ctaLabel})`} value={d.ctaLabel} onChange={(v) => update({ ctaLabel: v })} placeholder="Grab Now" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ImageField label="Card image (optional)" hint="Replaces the chest art. About 300×220 (≈4:3). JPEG/PNG/WebP, max 5 MB." value={d.imageUrl} onChange={(v) => update({ imageUrl: v })} aspect="4 / 3" />
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Source</span>
            <select className={field} value={d.kind} onChange={(e) => update({ kind: e.target.value as SourceKind })}>
              {(Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => <option key={k} value={k}>{SOURCE_LABEL[k]}</option>)}
            </select>
          </label>
          {d.kind === "product" && (
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Product</span>
              <select className={field} value={d.productId} onChange={(e) => update({ productId: e.target.value })}>
                <option value="">Pick a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}{p.active ? "" : " (hidden)"}{pctOff(p.priceCoins, p.compareAtCoins) ? ` · -${pctOff(p.priceCoins, p.compareAtCoins)}%` : ""}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Ribbon</span>
            <select className={field} value={d.ribbon} onChange={(e) => update({ ribbon: e.target.value as "auto" | "none" })}>
              <option value="auto">Auto: "UP TO X% OFF" from real prices</option>
              <option value="none">No ribbon</option>
            </select>
          </label>
          {!r.live ? (
            <Notice tone="warning">Nothing behind this card is live right now ({d.kind === "product" ? "product hidden or out of stock" : "no item on sale"}), so the app hides the card.</Notice>
          ) : d.ribbon === "none" ? (
            <Notice>No ribbon on this card.</Notice>
          ) : r.pct > 0 ? (
            <Notice>Preview: <b>UP TO {r.pct}% OFF</b> (from {r.count} {unit}{r.count === 1 ? "" : "s"}).</Notice>
          ) : (
            <Notice tone="warning">No discount on {d.kind === "product" ? "this product" : "these items"} → ribbon hidden. Set an original price on the {d.kind === "product" ? "product" : "listings"} to show one.</Notice>
          )}
        </div>
      </div>
      {d.kind === "digital_items" && <ItemsPicker items={items} value={d.itemIds} onChange={(ids) => update({ itemIds: ids })} max={DEALS.maxItems} label="Items (the button opens the Digital tab filtered to these)" />}
      <Schedule
        startsAt={d.startsAt}
        endsAt={d.endsAt}
        onChange={(p) => update(p)}
        timerLabel="Show timer"
        timer={d.showTimer}
        onTimer={(v) => update({ showTimer: v })}
        timerHint={d.endsAt ? "Counts down to the card's end." : d.kind === "product" ? "Needs an end time for a product card." : "Without an end time: the soonest real sale end of the items, if any."}
      />
    </div>
  );
}
