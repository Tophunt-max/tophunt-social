import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw, Upload } from "lucide-react";
import { api, describeError, type EarningAssetRow, type EarningAssetRules } from "@/lib/api";
import { PageHeader, fmtDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/monetization/shared";
import { defaultEarningArt } from "@/lib/earningArt";

/**
 * Earning Management → Assets: every Rewards Center artwork slot. The app
 * bundles each one as a transparent WebP. Replacing one is three steps:
 *   1. pick a WebP / PNG; it is checked here first (type, 1 MB, square,
 *      128-2048 px, transparent), the same rules the Worker enforces;
 *   2. preview it at the sizes the app draws, on the app's dark card, next to
 *      what is live now;
 *   3. Publish uploads and switches the slot. The app picks it up within about
 *      a minute (realtime config push, else the next poll); no app update.
 * Reset brings the bundled art back. History lists earlier uploads to restore.
 * Upload and save need a recent sign-in, and every change is audited.
 */
const GROUP_LABELS: Record<string, string> = {
  currencies: "Currencies",
  branding: "Branding",
  badges: "Badges",
  icons: "Section icons",
  streak: "Streak & check-in",
  missions: "Missions",
  rewards: "Contest rewards",
  referral: "Referral",
  achievements: "Achievements",
  events: "Special events",
  leaderboard: "Leaderboard",
  illustrations: "Illustrations",
};

const MAX_BYTES = 1024 * 1024;
const TYPES = ["image/webp", "image/png"];
const DEFAULT_RULES: EarningAssetRules = { minSide: 128, maxSide: 2048, square: true, alpha: true };
/** Sizes (pt) the app draws artwork at: small badges, section icons, cards, hero. */
const PREVIEW_SIZES = [24, 40, 58, 92];
const CARD_BG = "linear-gradient(160deg, #2A1056, #1C0B3A)";

interface Checked {
  file: File;
  /** The decoded picked image. Previews are drawn from it onto canvases, never via an <img src>. */
  image: ImageBitmap;
  width: number;
  height: number;
  transparent: boolean;
}

/** Decode the file in the browser and apply the upload rules. Throws a readable message. */
async function checkFile(file: File, rules: EarningAssetRules): Promise<Checked> {
  if (!TYPES.includes(file.type)) throw new Error("WebP ya PNG image chuno.");
  if (file.size > MAX_BYTES) throw new Error(`Image 1 MB se chhoti honi chahiye (ye ${(file.size / 1024 / 1024).toFixed(2)} MB hai).`);
  // Decoded straight from the File bytes (no object URL, nothing is put into the DOM as markup).
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(file);
  } catch {
    throw new Error("Image khul nahi payi. File kharab ho sakti hai.");
  }
  try {
    const w = img.width;
    const h = img.height;
    if (Math.abs(w - h) > Math.max(w, h) * 0.02) throw new Error(`Image square honi chahiye (ye ${w}x${h} hai).`);
    if (Math.min(w, h) < rules.minSide) throw new Error(`Kam se kam ${rules.minSide}x${rules.minSide} px chahiye (ye ${w}x${h} hai).`);
    if (Math.max(w, h) > rules.maxSide) throw new Error(`Zyada se zyada ${rules.maxSide}x${rules.maxSide} px (ye ${w}x${h} hai).`);
    // Transparency: sample the decoded pixels (downscaled) for any alpha < 255.
    const side = 64;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let transparent = false;
    if (ctx) {
      ctx.drawImage(img, 0, 0, side, side);
      const data = ctx.getImageData(0, 0, side, side).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { transparent = true; break; }
    }
    if (rules.alpha && !transparent) throw new Error("Background transparent hona chahiye (WebP/PNG alpha ke saath export karo).");
    return { file, image: img, width: w, height: h, transparent };
  } catch (e) {
    img.close();
    throw e;
  }
}

function Thumb({ src, size, label }: { src: string | null; size: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-xl flex items-center justify-center" style={{ background: CARD_BG, width: size + 16, height: size + 16 }}>
        {src ? <img src={src} alt="" style={{ width: size, height: size }} className="object-contain" /> : <span className="text-[10px] text-white/50">—</span>}
      </div>
      {label ? <span className="text-[10px] text-muted-foreground">{label}</span> : null}
    </div>
  );
}

/** Draws a decoded image into a square canvas at `size` CSS px (sharp on high-DPI screens). */
function CanvasImage({ image, size, className }: { image: ImageBitmap; size: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, c.width, c.height);
  }, [image, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className={className} />;
}

function CanvasThumb({ image, size, label }: { image: ImageBitmap; size: number; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-xl flex items-center justify-center" style={{ background: CARD_BG, width: size + 16, height: size + 16 }}>
        <CanvasImage image={image} size={size} />
      </div>
      {label ? <span className="text-[10px] text-muted-foreground">{label}</span> : null}
    </div>
  );
}

function PreviewDialog({ row, checked, live, onClose, onPublished }: { row: EarningAssetRow; checked: Checked; live: string | null; onClose: () => void; onPublished: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = progress !== null || saving;

  const publish = async () => {
    try {
      const up = await api.earning.uploadAsset(checked.file, setProgress);
      setProgress(null);
      setSaving(true);
      await api.earning.saveAsset(row.key, up.publicUrl);
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
          {checked.file.name} · {checked.width}x{checked.height} px · {(checked.file.size / 1024).toFixed(0)} KB · {checked.file.type.replace("image/", "").toUpperCase()} · transparent ✓
        </div>
        <div>
          <p className="text-xs font-semibold mb-2">New (app sizes)</p>
          <div className="flex items-end gap-4 flex-wrap">
            {PREVIEW_SIZES.map((s) => <CanvasThumb key={s} image={checked.image} size={s} label={`${s} pt`} />)}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2">Live now</p>
          <div className="flex items-end gap-4 flex-wrap">
            {PREVIEW_SIZES.map((s) => <Thumb key={s} src={live} size={s} label={`${s} pt`} />)}
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-border">
          <CanvasImage image={checked.image} size={48} />
          <span className="text-xs text-muted-foreground">On a light background, to check the edges are clean.</span>
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

function HistoryDialog({ row, onClose, onRestored }: { row: EarningAssetRow; onClose: () => void; onRestored: () => void }) {
  const q = useQuery({ queryKey: ["earning-asset-history", row.key], queryFn: () => api.earning.assetHistory(row.key) });
  const [busy, setBusy] = useState<string | null>(null);
  const restore = async (url: string | null, id: string) => {
    setBusy(id);
    try {
      await api.earning.saveAsset(row.key, url);
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
                <Thumb src={h.url ?? defaultEarningArt(row.file)} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{h.action === "earning.asset.reset" ? "Reset to bundled art" : "Uploaded artwork"}</p>
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

function Slot({ row, rules, onSaved }: { row: EarningAssetRow; rules: EarningAssetRules; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [history, setHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const def = defaultEarningArt(row.file);
  const live = row.url ?? def;

  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    try {
      setChecked(await checkFile(file, rules));
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
      await api.earning.saveAsset(row.key, null);
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
        <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0" style={{ background: CARD_BG }} title="Live in the app">
          {live ? <img src={live} alt={row.key} className="w-14 h-14 object-contain" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{row.key}</p>
          <p className="text-[11px] text-muted-foreground truncate font-mono">{row.file}</p>
          <p className={`text-[11px] font-medium ${row.url ? "text-primary" : "text-muted-foreground"}`}>{row.url ? "Custom upload" : "Bundled WebP"}</p>
          {row.changedAt ? <p className="text-[10px] text-muted-foreground truncate">{fmtDateTime(row.changedAt)} · {row.changedBy ?? "admin"}</p> : null}
        </div>
        {row.url && def ? (
          <div className="w-10 h-10 rounded-lg flex items-center justify-center opacity-70" style={{ background: CARD_BG }} title="Bundled default">
            <img src={def} alt="default" className="w-8 h-8 object-contain" />
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

export default function EarningAssets() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["earning-assets"], queryFn: api.earning.assets });
  const [filter, setFilter] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const rules = q.data?.rules ?? DEFAULT_RULES;
  const groups = useMemo(() => {
    const m = new Map<string, EarningAssetRow[]>();
    for (const r of q.data?.assets ?? []) {
      if (onlyCustom && !r.url) continue;
      if (filter && !`${r.key} ${r.file}`.toLowerCase().includes(filter.toLowerCase())) continue;
      m.set(r.group, [...(m.get(r.group) ?? []), r]);
    }
    return [...m.entries()];
  }, [q.data, filter, onlyCustom]);
  const custom = (q.data?.assets ?? []).filter((a) => a.url).length;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["earning-assets"] });
    qc.invalidateQueries({ queryKey: ["earning-asset-history"] });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Earning Assets"
        subtitle={`Rewards Center artwork. The app bundles each piece as a transparent WebP; publish your own WebP or PNG to replace any of them.${q.data ? ` ${custom} of ${q.data.assets.length} replaced.` : ""}`}
      />
      <Notice tone="info">
        Rules: WebP or PNG, max 1 MB, square, {rules.minSide}–{rules.maxSide} px (512x512 recommended), transparent background. You see a preview at the app's sizes before publishing. Changes reach the app within about a minute, with no app update; if an image ever fails to load on a device, the app shows the bundled art.
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
