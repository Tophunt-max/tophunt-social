import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Upload } from "lucide-react";
import { api, describeError, type EarningAssetRow } from "@/lib/api";
import { PageHeader } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Notice } from "@/components/monetization/shared";
import { defaultEarningArt } from "@/lib/earningArt";

/**
 * Earning Management → Assets: every Rewards Center artwork slot. The app
 * ships each one as an SVG; uploading a WebP or PNG here replaces it in the
 * app within about a minute (realtime config push, else the next poll).
 * "Reset" brings the built-in SVG back. Upload and save need a recent sign-in.
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

function Slot({ row, onSaved }: { row: EarningAssetRow; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const def = defaultEarningArt(row.file);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error("WebP ya PNG image chuno.");
    if (file.size > MAX_BYTES) return toast.error("Image 1 MB se chhoti honi chahiye.");
    try {
      const up = await api.earning.uploadAsset(file, setProgress);
      setSaving(true);
      await api.earning.saveAsset(row.key, up.publicUrl);
      toast.success(`${row.key} updated. App me ~1 minute me dikhega.`);
      onSaved();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setProgress(null);
      setSaving(false);
      if (input.current) input.current.value = "";
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.earning.saveAsset(row.key, null);
      toast.success(`${row.key} reset to the built-in SVG.`);
      onSaved();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const busy = progress !== null || saving;
  return (
    <div className={`bg-card border rounded-2xl p-3 flex flex-col gap-2 ${row.url ? "border-primary/60" : "border-border"}`}>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl bg-[#1C0B3A] flex items-center justify-center shrink-0" title="Current in app">
          {row.url ? <img src={row.url} alt={row.key} className="w-14 h-14 object-contain" /> : def ? <img src={def} alt={row.key} className="w-14 h-14 object-contain" /> : <span className="text-[10px] text-white/60">SVG</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{row.key}</p>
          <p className="text-[11px] text-muted-foreground truncate font-mono">{row.file}</p>
          <p className={`text-[11px] font-medium ${row.url ? "text-primary" : "text-muted-foreground"}`}>{row.url ? "Custom upload" : "Built-in SVG"}</p>
        </div>
        {row.url && def ? (
          <div className="w-10 h-10 rounded-lg bg-[#1C0B3A] flex items-center justify-center opacity-70" title="Built-in default">
            <img src={def} alt="default" className="w-8 h-8 object-contain" />
          </div>
        ) : null}
      </div>
      <div className="flex gap-2">
        <input ref={input} type="file" accept="image/webp,image/png" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button disabled={busy} onClick={() => input.current?.click()} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
          <Upload size={13} /> {progress !== null ? `${progress}%` : saving ? "Saving…" : row.url ? "Replace" : "Upload"}
        </button>
        {row.url ? (
          <button disabled={busy} onClick={reset} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs disabled:opacity-50" title="Back to the built-in SVG">
            <RotateCcw size={13} /> Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function EarningAssets() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["earning-assets"], queryFn: api.earning.assets });
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, EarningAssetRow[]>();
    for (const r of q.data?.assets ?? []) {
      if (filter && !`${r.key} ${r.file}`.toLowerCase().includes(filter.toLowerCase())) continue;
      m.set(r.group, [...(m.get(r.group) ?? []), r]);
    }
    return [...m.entries()];
  }, [q.data, filter]);
  const custom = (q.data?.assets ?? []).filter((a) => a.url).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Earning Assets"
        subtitle={`Rewards Center artwork. Built-in pieces are SVG; upload a WebP or PNG (max 1 MB, square, transparent background) to replace any of them.${q.data ? ` ${custom} of ${q.data.assets.length} replaced.` : ""}`}
      />
      <Notice tone="info">
        Changes reach the app within about a minute, with no app update needed. Reset brings the built-in SVG back. If an uploaded image fails to load on a device, the app shows the SVG.
      </Notice>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search key or file…" className="w-full sm:w-72 px-3 py-2 rounded-xl border border-border bg-background text-sm" />
      {q.isError ? (
        <Notice tone="danger">{describeError(q.error)}</Notice>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : (
        groups.map(([group, rows]) => (
          <section key={group}>
            <h3 className="font-bold text-foreground mb-2">{GROUP_LABELS[group] ?? group}</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rows.map((r) => <Slot key={r.key} row={r} onSaved={() => qc.invalidateQueries({ queryKey: ["earning-assets"] })} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
