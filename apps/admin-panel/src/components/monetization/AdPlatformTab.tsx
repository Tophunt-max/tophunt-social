/**
 * Ad platform editor: ad networks, one placement per app slot with a fallback
 * waterfall, and ads.txt / app-ads.txt. Saved as `monetization.adPlatform`
 * through app-settings (validated by the Worker, lib/adPlatform.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button, Card, Notice, Num, Text, Toggle, field } from "./shared";

type PlatformKey = "web" | "android" | "ios";
const PLATFORMS: PlatformKey[] = ["web", "android", "ios"];
const PLATFORM_LABEL: Record<PlatformKey, string> = { web: "Web / PWA", android: "Android", ios: "iOS" };
type Flags = Record<PlatformKey, boolean>;

interface Network {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  platforms: Flags;
  testMode: boolean;
  publisherId: string;
}
interface Entry {
  networkId: string;
  units: Partial<Record<PlatformKey, string>>;
  timeoutMs: number;
}
interface Placement {
  slot: string;
  enabled: boolean;
  platforms: Flags;
  format: string;
  waterfall: Entry[];
  rules: { firstPosition: number; interval: number; maxPerSession: number; maxPerDay: number; minIntervalSec: number };
  audience: { guests: boolean; newUserGraceDays: number };
  startsAt: number | null;
  endsAt: number | null;
}
interface Config {
  enabled: boolean;
  networks: Network[];
  placements: Placement[];
  adsTxt: string;
  appAdsTxt: string;
}
interface Registry {
  slots: { key: string; label: string; hint: string; formats: string[]; list: boolean }[];
  networkTypes: { type: string; label: string; platforms: PlatformKey[]; formats: string[] }[];
  limits: { maxNetworks: number; maxWaterfall: number };
}

const UNIT_PLACEHOLDER: Record<string, string> = {
  admob: "ca-app-pub-0000000000000000/0000000000",
  gam: "/1234567/tophunt_feed",
  adx: "/1234567/tophunt_adx_feed",
  adsense: "1234567890 (ad slot id)",
};
const FULLSCREEN = new Set(["interstitial", "rewarded"]);

const toLocal = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).getTime() || null : null);

function emptyPlacement(slot: Registry["slots"][number]): Placement {
  const format = slot.formats[0];
  const full = FULLSCREEN.has(format);
  return {
    slot: slot.key,
    enabled: false,
    platforms: { web: format !== "interstitial", android: true, ios: true },
    format,
    waterfall: [],
    rules: full
      ? { firstPosition: 1, interval: 8, maxPerSession: 2, maxPerDay: 10, minIntervalSec: 300 }
      : { firstPosition: 4, interval: 8, maxPerSession: 6, maxPerDay: 0, minIntervalSec: 0 },
    audience: { guests: true, newUserGraceDays: 0 },
    startsAt: null,
    endsAt: null,
  };
}

export function AdPlatformTab() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [cfg, setCfg] = useState<Config | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const reg: Registry | undefined = cfgQ.data?.adPlatformRegistry;

  useEffect(() => {
    if (cfgQ.data && reg && !cfg) {
      const eff: Config = structuredClone(cfgQ.data.effective.adPlatform ?? { enabled: false, networks: [], placements: [], adsTxt: "", appAdsTxt: "" });
      // One row per slot the app has, in registry order.
      const bySlot = new Map(eff.placements.map((p) => [p.slot, p]));
      eff.placements = reg.slots.map((s) => bySlot.get(s.key) ?? emptyPlacement(s));
      setCfg(eff);
    }
  }, [cfgQ.data, reg, cfg]);

  const save = useMutation({
    mutationFn: () => {
      // Untouched, switched-off slots with nothing configured are not stored.
      const placements = cfg!.placements.filter((p) => p.enabled || p.waterfall.length);
      return api.saveAppSettings({ monetization: { adPlatform: { ...cfg!, placements } } });
    },
    onSuccess: () => {
      toast.success("Ad platform saved. Apps and the website pick it up within a minute.");
      setCfg(null);
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const typeOf = useMemo(() => new Map((reg?.networkTypes ?? []).map((t) => [t.type, t])), [reg]);
  if (!cfg || !reg) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const netById = new Map(cfg.networks.map((n) => [n.id, n]));

  const setNet = (i: number, patch: Partial<Network>) => setCfg({ ...cfg, networks: cfg.networks.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const setPl = (slot: string, fn: (p: Placement) => Placement) => setCfg({ ...cfg, placements: cfg.placements.map((p) => (p.slot === slot ? fn(structuredClone(p)) : p)) });
  const addNetwork = (type: string) => {
    const t = typeOf.get(type)!;
    const base = type;
    let id = base;
    for (let k = 2; cfg.networks.some((n) => n.id === id); k++) id = `${base}-${k}`;
    setCfg({
      ...cfg,
      networks: [
        ...cfg.networks,
        {
          id,
          type,
          name: t.label,
          enabled: true,
          platforms: { web: t.platforms.includes("web"), android: t.platforms.includes("android"), ios: t.platforms.includes("ios") },
          testMode: type !== "house",
          publisherId: "",
        },
      ],
    });
  };
  const removeNetwork = (id: string) => {
    if (!confirm(`Remove network "${id}"? It is also taken out of every waterfall.`)) return;
    setCfg({
      ...cfg,
      networks: cfg.networks.filter((n) => n.id !== id),
      placements: cfg.placements.map((p) => ({ ...p, waterfall: p.waterfall.filter((w) => w.networkId !== id) })),
    });
  };

  /** Platforms this placement will really run on, mirroring the Worker's public view. */
  const livePlatforms = (p: Placement): PlatformKey[] => {
    if (!cfg.enabled || !p.enabled) return [];
    return PLATFORMS.filter(
      (k) =>
        p.platforms[k] &&
        p.waterfall.some((w) => {
          const n = netById.get(w.networkId);
          return n && n.enabled && n.platforms[k] && (n.type === "house" || !!w.units[k]);
        }),
    );
  };

  return (
    <div className="space-y-5">
      <Card
        title="Ad platform"
        subtitle="Choose which networks serve ads, where, and in which order. If one network has no ad, the next one is tried."
        action={<Toggle label="All ads on" checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} hint="Master switch. Off = no network ad anywhere." />}
      >
        <Notice tone="info">
          Web / PWA: Ad Manager, AdX (served through Ad Manager ad units), AdSense and house ads work right away. Android / iOS: AdMob works in app builds that include the AdMob SDK
          (released from GitHub, see APP_RELEASE.md). Rewards are paid only through AdMob verification (apps) and the web watch token; set amounts in "Ads & rewards".
        </Notice>
      </Card>

      <Card
        title="Networks"
        subtitle={`Accounts the app may request ads from (max ${reg.limits.maxNetworks}). Test mode shows Google's test ads, never real ones.`}
        action={
          <select
            className={`${field} w-auto`}
            value=""
            onChange={(e) => e.target.value && addNetwork(e.target.value)}
            disabled={cfg.networks.length >= reg.limits.maxNetworks}
          >
            <option value="">+ Add network…</option>
            {reg.networkTypes.map((t) => (
              <option key={t.type} value={t.type}>{t.label}</option>
            ))}
          </select>
        }
      >
        {!cfg.networks.length && <p className="text-sm text-muted-foreground">No networks yet. Add Ad Manager, AdSense, AdMob and House ads.</p>}
        <div className="space-y-3">
          {cfg.networks.map((n, i) => {
            const t = typeOf.get(n.type);
            return (
              <div key={n.id} className={`rounded-xl border border-border p-3 space-y-3 ${n.enabled ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={n.enabled ? "success" : "default"}>{n.enabled ? "On" : "Off"}</Badge>
                  <span className="font-semibold text-sm">{t?.label ?? n.type}</span>
                  <code className="text-xs text-muted-foreground">{n.id}</code>
                  {n.testMode && n.type !== "house" && <Badge variant="warning">Test mode</Badge>}
                  <div className="flex-1" />
                  <button type="button" onClick={() => removeNetwork(n.id)} className="p-2 rounded-lg text-red-600 hover:bg-secondary" title="Remove network">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Text label="Name" value={n.name} onChange={(v) => setNet(i, { name: v })} />
                  <Toggle label="Enabled" checked={n.enabled} onChange={(v) => setNet(i, { enabled: v })} />
                  {n.type !== "house" && (
                    <Toggle label="Test mode" checked={n.testMode} onChange={(v) => setNet(i, { testMode: v })} hint="Turn off only after the account is approved." />
                  )}
                </div>
                <div className="flex flex-wrap gap-4">
                  {PLATFORMS.map((k) => (
                    <label key={k} className={`flex items-center gap-2 text-sm ${t?.platforms.includes(k) ? "" : "opacity-40"}`}>
                      <input
                        type="checkbox"
                        checked={!!n.platforms[k]}
                        disabled={!t?.platforms.includes(k)}
                        onChange={(e) => setNet(i, { platforms: { ...n.platforms, [k]: e.target.checked } })}
                      />
                      {PLATFORM_LABEL[k]}
                    </label>
                  ))}
                </div>
                {n.type === "adsense" && (
                  <Text label="AdSense publisher id" value={n.publisherId} placeholder="ca-pub-0000000000000000" onChange={(v) => setNet(i, { publisherId: v.trim() })} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Placements" subtitle="Every place in the app that can show an ad. Pages like login, checkout, chat and uploads have no ad slot on purpose.">
        <div className="space-y-2">
          {cfg.placements.map((p) => {
            const slot = reg.slots.find((s) => s.key === p.slot)!;
            const live = livePlatforms(p);
            const full = FULLSCREEN.has(p.format);
            const isOpen = open === p.slot;
            const compatible = cfg.networks.filter((n) => typeOf.get(n.type)?.formats.includes(p.format));
            return (
              <div key={p.slot} className="rounded-xl border border-border">
                <button type="button" className="w-full flex flex-wrap items-center gap-2 p-3 text-left" onClick={() => setOpen(isOpen ? null : p.slot)}>
                  <span className="font-semibold text-sm">{slot.label}</span>
                  <Badge>{p.format}</Badge>
                  {live.length ? live.map((k) => <Badge key={k} variant="success">{PLATFORM_LABEL[k]}</Badge>) : <Badge>Off</Badge>}
                  <span className="text-xs text-muted-foreground">{p.waterfall.map((w) => w.networkId).join(" → ") || "no networks"}</span>
                  <div className="flex-1" />
                  <span className="text-xs text-primary">{isOpen ? "Close" : "Edit"}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-border p-3 space-y-4">
                    <p className="text-xs text-muted-foreground">{slot.hint}</p>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Toggle label="Placement on" checked={p.enabled} onChange={(v) => setPl(p.slot, (x) => ({ ...x, enabled: v }))} />
                      <label className="block">
                        <span className="text-xs text-muted-foreground mb-1 block">Format</span>
                        <select
                          className={field}
                          value={p.format}
                          onChange={(e) => setPl(p.slot, (x) => ({ ...x, format: e.target.value, waterfall: x.waterfall.filter((w) => typeOf.get(netById.get(w.networkId)?.type ?? "")?.formats.includes(e.target.value)) }))}
                        >
                          {slot.formats.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-4 items-end">
                        {PLATFORMS.map((k) => (
                          <label key={k} className={`flex items-center gap-2 text-sm ${p.format === "interstitial" && k === "web" ? "opacity-40" : ""}`}>
                            <input
                              type="checkbox"
                              checked={!!p.platforms[k]}
                              disabled={p.format === "interstitial" && k === "web"}
                              onChange={(e) => setPl(p.slot, (x) => ({ ...x, platforms: { ...x.platforms, [k]: e.target.checked } }))}
                            />
                            {PLATFORM_LABEL[k]}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Waterfall</span>
                        <span className="text-xs text-muted-foreground">Tried top to bottom. Put House ads last as the safety net.</span>
                      </div>
                      {p.waterfall.map((w, wi) => {
                        const n = netById.get(w.networkId);
                        const t = n ? typeOf.get(n.type) : undefined;
                        return (
                          <div key={w.networkId} className="rounded-lg bg-secondary/40 p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono w-5">{wi + 1}.</span>
                              <span className="text-sm font-semibold">{n?.name ?? w.networkId}</span>
                              {n && !n.enabled && <Badge>network off</Badge>}
                              <div className="flex-1" />
                              <div className="w-28">
                                <Num label="Timeout (ms)" value={w.timeoutMs} onChange={(v) => setPl(p.slot, (x) => ({ ...x, waterfall: x.waterfall.map((e, j) => (j === wi ? { ...e, timeoutMs: v } : e)) }))} />
                              </div>
                              <button type="button" disabled={wi === 0} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30" title="Up"
                                onClick={() => setPl(p.slot, (x) => { const a = x.waterfall; [a[wi - 1], a[wi]] = [a[wi], a[wi - 1]]; return x; })}>
                                <ArrowUp size={14} />
                              </button>
                              <button type="button" disabled={wi === p.waterfall.length - 1} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30" title="Down"
                                onClick={() => setPl(p.slot, (x) => { const a = x.waterfall; [a[wi + 1], a[wi]] = [a[wi], a[wi + 1]]; return x; })}>
                                <ArrowDown size={14} />
                              </button>
                              <button type="button" className="p-1.5 rounded text-red-600 hover:bg-secondary" title="Remove"
                                onClick={() => setPl(p.slot, (x) => ({ ...x, waterfall: x.waterfall.filter((_, j) => j !== wi) }))}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {n?.type === "house" ? (
                              <p className="text-xs text-muted-foreground">Shows an approved sponsored campaign (Sponsorships tab). No ad unit needed.</p>
                            ) : (
                              <div className="grid sm:grid-cols-3 gap-2">
                                {PLATFORMS.filter((k) => t?.platforms.includes(k) && !(p.format === "rewarded" && (n?.type === "gam" || n?.type === "adx") && k !== "web")).map((k) => (
                                  <Text
                                    key={k}
                                    label={`${PLATFORM_LABEL[k]} unit`}
                                    value={w.units[k] ?? ""}
                                    placeholder={UNIT_PLACEHOLDER[n?.type ?? ""] ?? ""}
                                    onChange={(v) => setPl(p.slot, (x) => ({ ...x, waterfall: x.waterfall.map((e, j) => (j === wi ? { ...e, units: { ...e.units, [k]: v.trim() } } : e)) }))}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {p.waterfall.length < reg.limits.maxWaterfall && (
                        <select
                          className={`${field} w-auto`}
                          value=""
                          onChange={(e) =>
                            e.target.value &&
                            setPl(p.slot, (x) => ({ ...x, waterfall: [...x.waterfall, { networkId: e.target.value, units: {}, timeoutMs: netById.get(e.target.value)?.type === "house" ? 2000 : 3000 }] }))
                          }
                        >
                          <option value="">+ Add network to waterfall…</option>
                          {compatible.filter((n) => !p.waterfall.some((w) => w.networkId === n.id)).map((n) => (
                            <option key={n.id} value={n.id}>{n.name} ({n.id})</option>
                          ))}
                        </select>
                      )}
                      {!compatible.length && <p className="text-xs text-amber-700">No network can serve {p.format} ads yet. Add one above.</p>}
                    </div>

                    <div className="grid sm:grid-cols-5 gap-2">
                      {slot.list && (
                        <>
                          <Num label={full || slot.key.startsWith("story_") ? "First after N people" : "First at row"} value={p.rules.firstPosition} onChange={(v) => setPl(p.slot, (x) => ({ ...x, rules: { ...x.rules, firstPosition: v } }))} />
                          <Num label={full || slot.key.startsWith("story_") ? "Then every N people" : "Then every N rows"} value={p.rules.interval} onChange={(v) => setPl(p.slot, (x) => ({ ...x, rules: { ...x.rules, interval: v } }))} />
                        </>
                      )}
                      <Num label="Max per session" value={p.rules.maxPerSession} onChange={(v) => setPl(p.slot, (x) => ({ ...x, rules: { ...x.rules, maxPerSession: v } }))} />
                      <Num label="Max per day (0 = no limit)" value={p.rules.maxPerDay} onChange={(v) => setPl(p.slot, (x) => ({ ...x, rules: { ...x.rules, maxPerDay: v } }))} />
                      {full && (
                        <Num label="Seconds between" value={p.rules.minIntervalSec} onChange={(v) => setPl(p.slot, (x) => ({ ...x, rules: { ...x.rules, minIntervalSec: v } }))} />
                      )}
                    </div>
                    <div className="grid sm:grid-cols-4 gap-3">
                      <Toggle label="Show to guests" checked={p.audience.guests} onChange={(v) => setPl(p.slot, (x) => ({ ...x, audience: { ...x.audience, guests: v } }))} hint="Most shared-link visitors are signed out." />
                      <Num label="New users: no ads for N days" value={p.audience.newUserGraceDays} onChange={(v) => setPl(p.slot, (x) => ({ ...x, audience: { ...x.audience, newUserGraceDays: v } }))} />
                      <label className="block">
                        <span className="text-xs text-muted-foreground mb-1 block">Start (optional)</span>
                        <input type="datetime-local" className={field} value={toLocal(p.startsAt)} onChange={(e) => setPl(p.slot, (x) => ({ ...x, startsAt: fromLocal(e.target.value) }))} />
                      </label>
                      <label className="block">
                        <span className="text-xs text-muted-foreground mb-1 block">End (optional)</span>
                        <input type="datetime-local" className={field} value={toLocal(p.endsAt)} onChange={(e) => setPl(p.slot, (x) => ({ ...x, endsAt: fromLocal(e.target.value) }))} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="ads.txt and app-ads.txt" subtitle="Served at tophunt.in/ads.txt and tophunt.in/app-ads.txt. Paste the lines AdSense, Ad Manager and AdMob give you.">
        <div className="grid lg:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">ads.txt (website: AdSense, Ad Manager)</span>
            <textarea className={`${field} font-mono h-36`} value={cfg.adsTxt} onChange={(e) => setCfg({ ...cfg, adsTxt: e.target.value })} placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0" />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">app-ads.txt (apps: AdMob). Set tophunt.in as the developer website in the stores.</span>
            <textarea className={`${field} font-mono h-36`} value={cfg.appAdsTxt} onChange={(e) => setCfg({ ...cfg, appAdsTxt: e.target.value })} placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0" />
          </label>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setCfg(null)} disabled={save.isPending}>Discard changes</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save ad platform</Button>
      </div>
    </div>
  );
}
