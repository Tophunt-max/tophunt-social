import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, Upload } from "lucide-react";
import { api, describeError, type ShopAssetRow, type ShopAssetRules } from "@/lib/api";
import { PageHeader, fmtDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/monetization/shared";
import { defaultShopIcon } from "@/lib/shopIcons";

/**
 * Shop → Shop Assets: every decorative Shop icon and illustration. The app
 * bundles each one as a transparent WebP (apps/expo/assets/icons/shop).
 * Replacing one is three steps:
 *   1. pick a WebP / PNG; it is checked here first (type, 1 MB, the key's
 *      aspect ratio, 128-2048 px on the longest side, transparent), the same
 *      rules the Worker enforces;
 *   2. preview it at the sizes the Shop draws, on light and dark cards, next
 *      to what is live now;
 *   3. Publish uploads and switches the slot. The app picks it up within about
 *      a minute (realtime config push, else the next poll); no app update.
 * Reset brings the bundled art back. History lists earlier uploads to restore.
 * "Tinted" slots are single-colour glyphs: upload white art on transparent;
 * the app colours it (brand pink, grey, gold) where it is drawn.
 * Upload and save need a recent sign-in, and every change is audited.
 */
const GROUP_LABELS: Record<string, string> = {
  tiles: "Category & collection tiles",
  art: "Banners & illustrations",
  icons: "Section icons",
  glyphs: "Tinted glyphs (tabs, laurels, placeholders)",
};

const MAX_BYTES = 1024 * 1024;
const TYPES = ["image/webp", "image/png"];
const DEFAULT_RULES: ShopAssetRules = { minSide: 128, maxSide: 2048, alpha: true };
/** Heights (pt) the Shop draws artwork at: small icons, section headers, tiles, banners. */
const PREVIEW_HEIGHTS = [18, 28, 44, 72];
const DARK_BG = "linear-gradient(160deg, #2A1056, #1C0B3A)";
const LIGHT_BG = "#F6F6FA";
/** Glyph preview tint (the brand pink the app uses most). */
const TINT = "#FF4D67";

interface Checked {
  file: File;
  image: ImageBitmap;
  width: number;
  height: number;
}

const ratioLabel = ([w, h]: [number, number]) => (w === h ? "square (1:1)" : `${w}:${h}`);
const example = ([w, h]: [number, number]) => {
  const s = 512 / Math.max(w, h);
  return `${Math.round(w * s)}x${Math.round(h * s)}`;
};

/** Decode the file in the browser and apply the upload rules for this slot. Throws a readable message. */
async function checkFile(file: File, row: ShopAssetRow, rules: ShopAssetRules): Promise<Checked> {
  if (!TYPES.includes(file.type)) throw new Error("WebP ya PNG image chuno.");
  if (file.size > MAX_BYTES) throw new Error(`Image 1 MB se chhoti honi chahiye (ye ${(file.size / 1024 / 1024).toFixed(2)} MB hai).`);
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    throw new Error("Image khul nahi payi. File kharab ho sakti hai.");
  }
  try {
    const w = img.width;
    const h = img.height;
    const want = row.aspect[0] / row.aspect[1];
    if (Math.abs(w / h - want) > want * 0.02) throw new Error(`Is slot ki image ${ratioLabel(row.aspect)} honi chahiye, jaise ${example(row.aspect)} px (ye ${w}x${h} hai).`);
    if (Math.max(w, h) < rules.minSide) throw new Error(`Lambi side kam se kam ${rules.minSide} px chahiye (ye ${w}x${h} hai).`);
    if (Math.max(w, h) > rules.maxSide) throw new Error(`Lambi side zyada se zyada ${rules.maxSide} px (ye ${w}x${h} hai).`);
    const cw = 64;
    const ch = Math.max(1, Math.round((64 * h) / w));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let transparent = false;
    if (ctx) {
      ctx.drawImage(img, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { transparent = true; break; }
    }
    if (rules.alpha && !transparent) throw new Error("Background transparent hona chahiye (WebP/PNG alpha ke saath export karo).");
    return { file, image: img, width: w, height: h };
  } catch (e) {
    img.close();
    throw e;
  }
}

/** Tints an image to one colour (what the app does for glyph slots), drawn on a canvas. */
function CanvasImage({ image, width, height, tint }: { image: ImageBitmap; width: number; height: number; tint?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, c.width, c.height);
    if (tint) {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
    }
  }, [image, width, height, tint]);
  return <canvas ref={ref} style={{ width, height }} />;
}

/** CSS mask so a bundled or live glyph URL shows tinted, like in the app. */
function Art({ src, width, height, tint }: { src: string | null; width: number; height: number; tint?: string }) {
  if (!src) return <span className="text-[10px] text-white/50">—</span>;
  if (tint) {
    const mask = `url("${src}") center / contain no-repeat`;
    return <div style={{ width, height, background: tint, WebkitMask: mask, mask }} />;
  }
  return <img src={src} alt="" style={{ width, height }} className="object-contain" />;
}

function Card({ bg, children, label }: { bg: string; children: React.ReactNode; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-xl flex items-center justify-center p-2" style={{ background: bg, minWidth: 40, minHeight: 40 }}>{children}</div>
      {label ? <span className="text-[10px] text-muted-foreground">{label}</span> : null}
    </div>
  );
}

function PreviewDialog({ row, checked, live, onClose, onPublished }: { row: ShopAssetRow; checked: Checked; live: string | null; onClose: () => void; onPublished: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = progress !== null || saving;
  const ar = row.aspect[0] / row.aspect[1];
  const tint = row.tint ? TINT : undefined;

  const publish = async () => {
    try {
      const up = await api.shopAssets.upload(row.key, checked.file, setProgress);
      setProgress(null);
      setSaving(true);
      await api.shopAssets.save(row.key, up.publicUrl);
      toast.success(`${row.key} publish ho gaya. App me ~1 minute me dikhega.`);
      onPublished();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setProgress(null);
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={`Preview · ${row.key}`} width="max-w-2xl">
      <div className="space-y-5">
        <div className="text-xs text-muted-foreground">
          {checked.file.name} · {checked.width}x{checked.height} px · {(checked.file.size / 1024).toFixed(0)} KB · {checked.file.type.replace("image/", "").toUpperCase()} · transparent
          {row.tint ? " · tinted by the app" : ""}
        </div>
        {[["New, dark card", DARK_BG], ["New, light card", LIGHT_BG]].map(([label, bg]) => (
          <div key={label}>
            <p className="text-xs font-semibold mb-2">{label}</p>
            <div className="flex items-end gap-4 flex-wrap">
              {PREVIEW_HEIGHTS.map((h) => (
                <Card key={h} bg={bg} label={`${h} pt`}>
                  <CanvasImage image={checked.image} width={h * ar} height={h} tint={tint} />
                </Card>
              ))}
            </div>
          </div>
        ))}
        <div>
          <p className="text-xs font-semibold mb-2">Live now</p>
          <div className="flex items-end gap-4 flex-wrap">
            {PREVIEW_HEIGHTS.map((h) => (
              <Card key={h} bg={DARK_BG} label={`${h} pt`}>
                <Art src={live} width={h * ar} height={h} tint={tint} />
              </Card>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button disabled={busy} onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm disabled:opacity-50">Cancel</button>
          <button disabled={busy} onClick={publish} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {progress !== null ? `Uploading ${progress}%` : saving ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function HistoryDialog({ row, onClose, onRestored }: { row: ShopAssetRow; onClose: () => void; onRestored: () => void }) {
  const q = useQuery({ queryKey: ["shop-asset-history", row.key], queryFn: () => api.shopAssets.history(row.key) });
  const [busy, setBusy] = useState<string | null>(null);
  const ar = row.aspect[0] / row.aspect[1];
  const restore = async (url: string | null, id: string) => {
    setBusy(id);
    try {
      await api.shopAssets.save(row.key, url);
      toast.success(url ? "Purani image restore ho gayi." : "Bundled art restore ho gaya.");
      onRestored();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open onClose={onClose} title={`History · ${row.key}`} width="max-w-lg">
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
      ) : q.isError ? (
        <Notice tone="danger">{describeError(q.error)}</Notice>
      ) : !(q.data ?? []).length ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Is slot me abhi tak koi badlaav nahi hua.</p>
      ) : (
        <div className="space-y-2">
          {q.data!.map((h) => {
            const isLive = (h.url ?? null) === (row.url ?? null);
            return (
              <div key={h.id} className="flex items-center gap-3 p-2 rounded-xl border border-border">
                <Card bg={DARK_BG}><Art src={h.url ?? defaultShopIcon(row.file)} width={32 * ar} height={32} tint={row.tint ? TINT : undefined} /></Card>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{h.action === "shop.asset.reset" ? "Reset to bundled art" : "Uploaded artwork"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{fmtDateTime(h.at)} · {h.by ?? "admin"}</p>
                </div>
                {isLive ? (
                  <span className="text-[11px] font-semibold text-primary">Live</span>
                ) : (
                  <button disabled={!!busy} onClick={() => restore(h.url, h.id)} className="px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-50">
                    {busy === h.id ? "Restoring…" : "Restore"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function Slot({ row, rules, onSaved }: { row: ShopAssetRow; rules: ShopAssetRules; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [history, setHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const def = defaultShopIcon(row.file);
  const live = row.url ?? def;
  const ar = row.aspect[0] / row.aspect[1];
  const fit = (box: number) => (ar >= 1 ? { width: box, height: box / ar } : { width: box * ar, height: box });
  const tint = row.tint ? TINT : undefined;

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    try {
      setChecked(await checkFile(file, row, rules));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image check fail hua.");
    }
  };
  const closePreview = () => {
    checked?.image.close();
    setChecked(null);
  };
  const reset = async () => {
    if (!window.confirm(`${row.key}: custom image hata kar bundled art wapas lagayein?`)) return;
    setSaving(true);
    try {
      await api.shopAssets.save(row.key, null);
      toast.success(`${row.key} bundled art par wapas aa gaya.`);
      onSaved();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`bg-card border rounded-2xl p-3 flex flex-col gap-2 ${row.url ? "border-primary/60" : "border-border"}`}>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0" style={{ background: DARK_BG }} title="Live in the app">
          <Art src={live} {...fit(52)} tint={tint} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{row.key}</p>
          <p className="text-[11px] text-muted-foreground truncate font-mono">{row.file}</p>
          <p className="text-[11px] text-muted-foreground">
            {ratioLabel(row.aspect)}{row.tint ? " · tinted" : ""} ·{" "}
            <span className={row.url ? "text-primary font-medium" : ""}>{row.url ? "Custom upload" : "Bundled WebP"}</span>
          </p>
          {row.changedAt ? <p className="text-[10px] text-muted-foreground truncate">{fmtDateTime(row.changedAt)} · {row.changedBy ?? "admin"}</p> : null}
        </div>
        {row.url && def ? (
          <div className="w-10 h-10 rounded-lg flex items-center justify-center opacity-70" style={{ background: DARK_BG }} title="Bundled default">
            <Art src={def} {...fit(32)} tint={tint} />
          </div>
        ) : null}
      </div>
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/webp,image/png" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button disabled={saving} onClick={() => input.current?.click()} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          <Upload size={13} /> {row.url ? "Replace" : "Upload"}
        </button>
        <button onClick={() => setHistory(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs" title="Earlier uploads">
          <History size={13} />
        </button>
        {row.url ? (
          <button disabled={saving} onClick={reset} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-50" title="Back to the bundled art">
            <RotateCcw size={13} /> {saving ? "…" : "Reset"}
          </button>
        ) : null}
      </div>
      {checked ? <PreviewDialog row={row} checked={checked} live={live} onClose={closePreview} onPublished={() => { closePreview(); onSaved(); }} /> : null}
      {history ? <HistoryDialog row={row} onClose={() => setHistory(false)} onRestored={() => { setHistory(false); onSaved(); }} /> : null}
    </div>
  );
}

export default function ShopAssets() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shop-assets"], queryFn: api.shopAssets.list });
  const [filter, setFilter] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const rules = q.data?.rules ?? DEFAULT_RULES;
  const groups = useMemo(() => {
    const m = new Map<string, ShopAssetRow[]>();
    for (const r of q.data?.assets ?? []) {
      if (onlyCustom && !r.url) continue;
      if (filter && !`${r.key} ${r.file}`.toLowerCase().includes(filter.toLowerCase())) continue;
      m.set(r.group, [...(m.get(r.group) ?? []), r]);
    }
    return [...m.entries()];
  }, [q.data, filter, onlyCustom]);
  const custom = (q.data?.assets ?? []).filter((a) => a.url).length;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shop-assets"] });
    qc.invalidateQueries({ queryKey: ["shop-asset-history"] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shop Assets"
        subtitle={`Shop icons and illustrations. The app bundles each piece as a transparent WebP; publish your own WebP or PNG to replace any of them.${q.data ? ` ${custom} of ${q.data.assets.length} replaced.` : ""}`}
      />
      <Notice tone="info">
        Rules: WebP or PNG, max 1 MB, the slot's own shape (shown on each card; square slots 512x512 recommended), {rules.minSide}–{rules.maxSide} px on the longest side, transparent background. Tinted slots: upload white art on transparent, the app colours it. You see a preview before publishing. Changes reach the app within about a minute, with no app update; if an image ever fails to load on a device, the app shows the bundled art.
      </Notice>
      <div className="flex flex-wrap items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search key or file…" className="w-full sm:w-72 px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} /> Only replaced
        </label>
      </div>
      {q.isError ? (
        <Notice tone="danger">{describeError(q.error)}</Notice>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : !groups.length ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Kuch nahi mila.</p>
      ) : (
        groups.map(([group, rows]) => (
          <section key={group}>
            <h3 className="font-bold text-foreground mb-2">{GROUP_LABELS[group] ?? group}</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rows.map((r) => <Slot key={r.key} row={r} rules={rules} onSaved={refresh} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
