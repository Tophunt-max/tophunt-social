import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";
import { RARITIES, artSource, safeArtUrl } from "@/lib/shopArt";
import { fmtNumber } from "@/lib/format";
import { ItemPreview } from "./ItemPreview";
import { Button, Notice, Num, Text, Toggle, field, fromLocalInput, toLocalInput } from "./shared";

/**
 * Create or edit a digital item from the Shop: what it is (kind, name, rarity),
 * how it looks (uploaded WebP artwork + optional animated overlay), and how it
 * is sold (price, stock, sale window). One save = one Worker write
 * (PUT /admin/monetization/store/items/:id), so the app never sees an item
 * without its listing or the other way round. Limits mirror the Worker
 * (lib/catalogItem.ts, lib/store.ts validateListingInput).
 */

export const ITEM_KINDS = ["frame", "theme", "badge", "title", "sticker", "collectible", "effect"] as const;
export const TYPE_LABEL: Record<string, string> = {
  frame: "Profile frame", theme: "Profile theme", badge: "Name badge", title: "Title",
  effect: "Effect", accessory: "Accessory", sticker: "Sticker", collectible: "Collectible",
};
const LIMITS = { name: 60, description: 200, text: 40, maxBytes: 5 * 1024 * 1024, warnBytes: 1024 * 1024 } as const;
const ID_RE = /^[a-z0-9_-]{2,40}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const MOTIONS = [
  ["", "None (static overlay)"],
  ["pulse", "Pulse (glow in and out)"],
  ["twinkle", "Twinkle (sparkle)"],
  ["flicker", "Flicker (flame)"],
  ["drift", "Drift (side to side)"],
  ["spin", "Spin (rotate)"],
] as const;

/** What the artwork should look like, per kind. Shown under the upload buttons. */
const ART_GUIDE: Record<string, string> = {
  frame: "Square transparent WebP, 512×512. The avatar sits in the centre circle (default 83% of the width; adjust \"Avatar opening\" to match your art).",
  theme: "WebP, 1080×1350 or larger. It fills the profile header and is cropped to fit, so keep important detail in the middle.",
  badge: "Square transparent WebP, 256×256. Drawn at about 16 px next to names, so keep it bold and simple.",
  title: "Square transparent WebP icon, 256×256, drawn at the start of the title chip. The app writes the title text itself.",
  sticker: "Square transparent WebP, 512×512. Animated WebP plays in the app.",
  collectible: "Square transparent WebP, 512×512. Shown in the Shop and the owner's inventory.",
  effect: "Square transparent WebP, 512×512. Shown in the Shop and the owner's inventory.",
};

function slug(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28);
}

interface Draft {
  itemId: string;
  type: string;
  name: string;
  description: string;
  rarity: string;
  itemActive: boolean;
  itemSort: number;
  tier: "premium" | "xp";
  imageUrl: string;
  fxUrl: string;
  fx: string;
  animated: boolean;
  avatarRatio: string;
  color0: string;
  color1: string;
  icon: string;
  badgeColor: string;
  text: string;
  // listing
  sell: boolean;
  priceCoins: number;
  compareAtCoins: string;
  stockLimit: string;
  refundable: boolean;
  onSale: boolean;
  startsAt: string;
  endsAt: string;
  sort: number;
}

function draftOf(item: any | null): Draft {
  const a = item?.asset ?? {};
  const l = item?.listing;
  const colors: string[] = Array.isArray(a.colors) ? a.colors : [];
  return {
    itemId: item?.itemId ?? "",
    type: item?.type ?? "frame",
    name: item?.name ?? "",
    description: item?.description ?? "",
    rarity: item?.rarity ?? "rare",
    itemActive: item ? item.itemActive !== false : true,
    itemSort: Number(item?.itemSort ?? 0),
    tier: a.tier === "xp" ? "xp" : "premium",
    imageUrl: safeArtUrl(a.imageUrl) ?? "",
    fxUrl: safeArtUrl(a.fxUrl) ?? "",
    fx: typeof a.fx === "string" ? a.fx : "",
    animated: a.animated === true,
    avatarRatio: a.avatarRatio ? String(a.avatarRatio) : "",
    color0: HEX_RE.test(colors[0] ?? "") ? colors[0] : "#FF4D67",
    color1: HEX_RE.test(colors[1] ?? "") ? colors[1] : "#8B5CF6",
    icon: typeof a.icon === "string" ? a.icon : "",
    badgeColor: typeof a.color === "string" && HEX_RE.test(a.color) ? a.color : "",
    text: typeof a.text === "string" ? a.text : "",
    sell: item ? !!l : true,
    priceCoins: l?.priceCoins ?? 50,
    compareAtCoins: l?.compareAtCoins != null ? String(l.compareAtCoins) : "",
    stockLimit: l?.stockLimit != null ? String(l.stockLimit) : "",
    refundable: l?.refundable ?? true,
    onSale: l?.active ?? false,
    startsAt: toLocalInput(l?.startsAt),
    endsAt: toLocalInput(l?.endsAt),
    sort: l?.sort ?? 0,
  };
}

/** The asset JSON to save: the stored one (keeps key, level, collection...) with the edited fields applied. */
function assetOf(d: Draft, stored: Record<string, unknown>): Record<string, unknown> {
  const a: Record<string, unknown> = { ...stored };
  a.tier = d.tier;
  a.animated = d.animated;
  a.colors = [d.color0, d.color1];
  // Empty strings clear uploaded artwork on the Worker; the rest are removed here.
  a.imageUrl = d.imageUrl || "";
  a.fxUrl = d.imageUrl && d.fxUrl ? d.fxUrl : "";
  if (d.imageUrl && d.fxUrl && d.fx) a.fx = d.fx;
  else delete a.fx;
  if (d.type === "frame" && d.avatarRatio.trim()) a.avatarRatio = Number(d.avatarRatio);
  else delete a.avatarRatio;
  if (d.type === "badge") {
    if (d.icon.trim()) a.icon = d.icon.trim();
    else delete a.icon;
    if (d.badgeColor) a.color = d.badgeColor;
    else delete a.color;
  }
  if (d.type === "title" && d.text.trim()) a.text = d.text.trim();
  else if (d.type === "title") delete a.text;
  delete a.artKind; // stamped by the Worker
  return a;
}

function problemsOf(d: Draft, isNew: boolean, takenIds: string[], soldCount: number): string[] {
  const p: string[] = [];
  if (isNew && !ID_RE.test(d.itemId)) p.push("Item id: 2-40 lowercase letters, digits, _ or -.");
  if (isNew && takenIds.includes(d.itemId)) p.push(`The id "${d.itemId}" is already used.`);
  if (!d.name.trim()) p.push("Name is required.");
  if (d.name.trim().length > LIMITS.name) p.push(`Name: max ${LIMITS.name} characters.`);
  if (d.description.trim().length > LIMITS.description) p.push(`Description: max ${LIMITS.description} characters.`);
  if (d.type === "title" && d.text.trim().length > LIMITS.text) p.push(`Title text: max ${LIMITS.text} characters.`);
  if (d.icon.trim() && !ICON_RE.test(d.icon.trim())) p.push("Icon: an icon name like star, flame or diamond.");
  if (d.type === "frame" && d.avatarRatio.trim()) {
    const r = Number(d.avatarRatio);
    if (!(r >= 0.5 && r <= 0.95)) p.push("Avatar opening: between 0.5 and 0.95.");
  }
  if (d.sell) {
    if (!Number.isInteger(d.priceCoins) || d.priceCoins < 1 || d.priceCoins > 1_000_000) p.push("Price: a whole number of DP coin from 1 to 1000000.");
    if (d.compareAtCoins.trim()) {
      const v = Number(d.compareAtCoins);
      if (!Number.isInteger(v) || v <= d.priceCoins || v > 10_000_000) p.push(`Original price must be a whole number above the price (${d.priceCoins}).`);
    }
    if (d.stockLimit.trim()) {
      const s = Number(d.stockLimit);
      if (!Number.isInteger(s) || s < 1) p.push("Stock limit: a whole number, or empty for unlimited.");
      else if (s < soldCount) p.push(`Stock limit cannot be below the ${soldCount} already sold.`);
    }
    const s = fromLocalInput(d.startsAt);
    const e = fromLocalInput(d.endsAt);
    if (s !== null && e !== null && e <= s) p.push("Sale end must be after the start.");
  }
  return p;
}

/** XP level reward mode (Gamification → XP Level Rewards): no selling, one item per level. */
export interface XpLevelMode {
  /** Level → the item on it now. */
  levels: Map<number, { itemId: string; name: string }>;
  maxLevel: number;
  /** Suggested level for a new item (first free one). */
  defaultLevel?: number | null;
}

export const XP_KINDS = ["frame", "theme", "badge", "title"] as const;

export function StoreItemDialog({ item, takenIds, onClose, onDone, xp }: { item: any | null; takenIds: string[]; onClose: () => void; onDone: () => void; xp?: XpLevelMode }) {
  const isNew = !item;
  const [d, setD] = useState<Draft>(() => (xp ? { ...draftOf(item), sell: false, tier: "xp" } : draftOf(item)));
  const [level, setLevel] = useState<string>(() => String(item?.level ?? xp?.defaultLevel ?? ""));
  const [swap, setSwap] = useState(false);
  const [idTouched, setIdTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((prev) => {
    const next = { ...prev, ...patch };
    // Suggest an id from the kind + name until the admin types one.
    if (isNew && !idTouched && (patch.name !== undefined || patch.type !== undefined)) {
      const s = slug(next.name);
      next.itemId = s ? `${xp ? "xplv" : "shop"}_${next.type}_${s}`.slice(0, 40) : "";
    }
    return next;
  });
  const owners = Number(item?.owners ?? 0);
  const soldCount = Number(item?.listing?.soldCount ?? 0);
  const stored = item?.asset ?? {};
  const asset = useMemo(() => assetOf(d, stored), [d, stored]);
  const preview = { itemId: d.itemId, type: d.type, name: d.name || "New item", rarity: d.rarity, asset: { ...asset, artKind: d.imageUrl ? d.type : undefined } };
  const levelNum = Number(level);
  const levelOk = !xp || (Number.isInteger(levelNum) && levelNum >= 1 && levelNum <= xp.maxLevel);
  const occupant = xp && levelOk ? xp.levels.get(levelNum) : undefined;
  const levelTaken = !!occupant && occupant.itemId !== d.itemId;
  const problems = [
    ...problemsOf(d, isNew, takenIds, soldCount),
    ...(xp && !levelOk ? [`Level: a whole number from 1 to ${xp.maxLevel}.`] : []),
    ...(xp && levelTaken && (isNew || !swap) ? [`Level ${levelNum} already has "${occupant!.name}".${isNew ? " Pick a free level." : " Tick \"Swap levels\" or pick a free level."}`] : []),
  ];
  const bundledKey = typeof stored.key === "string" ? stored.key : null;

  const xpItem = () => ({
    type: d.type,
    name: d.name.trim(),
    description: d.description.trim(),
    rarity: d.rarity,
    active: d.itemActive,
    asset,
  });
  const save = useMutation({
    mutationFn: () => xp
      ? api.gamification.saveXpReward(d.itemId, { create: isNew, level: levelNum, swap: levelTaken && swap, item: xpItem() })
      : api.monetization.saveStoreItem(d.itemId, {
        create: isNew,
        item: {
          type: d.type,
          name: d.name.trim(),
          description: d.description.trim(),
          rarity: d.rarity,
          active: d.itemActive,
          sort: Number.isInteger(d.itemSort) ? d.itemSort : 0,
          asset,
        },
        listing: d.sell
          ? {
              priceCoins: Number(d.priceCoins),
              compareAtCoins: d.compareAtCoins.trim() === "" ? null : Number(d.compareAtCoins),
              stockLimit: d.stockLimit.trim() === "" ? null : Number(d.stockLimit),
              refundable: d.refundable,
              active: d.onSale,
              startsAt: fromLocalInput(d.startsAt),
              endsAt: fromLocalInput(d.endsAt),
              sort: Number(d.sort) || 0,
              ownership: "permanent",
            }
          : null,
      }),
    onSuccess: () => {
      toast.success(isNew ? `${d.name.trim()} created` : `${d.name.trim()} saved`);
      onDone();
      onClose();
    },
    onError: (e: any) => {
      const msg = describeError(e);
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <Modal open onClose={onClose} title={isNew ? (xp ? "New XP level reward" : "New digital item") : `Edit ${item.name}`} width="max-w-3xl">
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-4">
          <div className="space-y-2">
            <div className="rounded-xl overflow-hidden border border-border"><ItemPreview r={preview} height={200} /></div>
            <p className="text-[11px] text-muted-foreground">
              Preview. Artwork: {artSource(asset) === "uploaded" ? "uploaded WebP" : artSource(asset) === "bundled" ? `bundled in the app (${bundledKey})` : "none yet, the app draws colours by rarity"}.
            </p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Kind</span>
                <select className={field} value={d.type} onChange={(e) => set({ type: e.target.value })} disabled={!isNew && owners > 0}>
                  {[...new Set([...(xp ? XP_KINDS : ITEM_KINDS), d.type])].map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
                </select>
                {!isNew && owners > 0 ? <span className="text-[11px] text-muted-foreground mt-1 block">Owned by {fmtNumber(owners)}, so the kind is locked.</span> : null}
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Rarity</span>
                <select className={field} value={d.rarity} onChange={(e) => set({ rarity: e.target.value })}>
                  {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>
            <Text label={`Name (max ${LIMITS.name})`} value={d.name} onChange={(v) => set({ name: v })} placeholder="Party Cat" />
            {isNew ? (
              <Text
                label="Item id (permanent)"
                value={d.itemId}
                onChange={(v) => { setIdTouched(true); set({ itemId: v.toLowerCase() }); }}
                hint="Lowercase letters, digits, _ or -. Purchases and equipped slots point at it, so it never changes."
              />
            ) : (
              <p className="text-xs text-muted-foreground">Item id <span className="font-mono">{d.itemId}</span></p>
            )}
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Description (max {LIMITS.description})</span>
              <textarea className={field} rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} />
            </label>
            {d.type === "title" && (
              <Text label={`Title text shown to users (max ${LIMITS.text}; empty = name)`} value={d.text} onChange={(v) => set({ text: v })} placeholder="Night Owl" />
            )}
          </div>
        </div>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <h4 className="font-semibold text-sm">Artwork</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ArtUpload label="Base image (WebP)" value={d.imageUrl} onChange={(v) => set({ imageUrl: v, ...(v ? {} : { fxUrl: "" }) })} />
            <ArtUpload label="Effect overlay (optional, WebP)" value={d.fxUrl} onChange={(v) => set({ fxUrl: v })} disabled={!d.imageUrl} disabledHint="Upload a base image first." />
          </div>
          <p className="text-[11px] text-muted-foreground">{ART_GUIDE[d.type] ?? ART_GUIDE.sticker} Max 5 MB; under 1 MB is best because it loads in every feed row.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Overlay motion</span>
              <select className={field} value={d.fx} onChange={(e) => set({ fx: e.target.value })} disabled={!d.fxUrl}>
                {MOTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {d.type === "frame" && (
              <Text label="Avatar opening (0.5-0.95, empty = 0.833)" value={d.avatarRatio} onChange={(v) => set({ avatarRatio: v })} hint="Avatar diameter ÷ artwork width." />
            )}
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Fallback colours</span>
              <div className="flex gap-2">
                <input type="color" className="h-10 w-14 rounded border border-border" value={d.color0} onChange={(e) => set({ color0: e.target.value })} aria-label="First colour" />
                <input type="color" className="h-10 w-14 rounded border border-border" value={d.color1} onChange={(e) => set({ color1: e.target.value })} aria-label="Second colour" />
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Used by older app versions and title chips.</span>
            </label>
          </div>
          {d.type === "badge" && (
            <div className="grid grid-cols-2 gap-3">
              <Text label="Fallback icon (Ionicons name)" value={d.icon} onChange={(v) => set({ icon: v })} placeholder="star" hint="Shown by app versions that cannot draw uploaded art." />
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Fallback icon colour</span>
                <input type="color" className="h-10 w-14 rounded border border-border" value={d.badgeColor || d.color1} onChange={(e) => set({ badgeColor: e.target.value })} aria-label="Badge colour" />
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {!xp && <Toggle label="Premium (Shop) item" checked={d.tier === "premium"} onChange={(v) => set({ tier: v ? "premium" : "xp" })} hint="Premium items get the Premium tag and richer effects." />}
            <Toggle label="Animated" checked={d.animated} onChange={(v) => set({ animated: v })} hint="Marks the item as animated (profile frame glow, Shop label)." />
          </div>
          {bundledKey && d.imageUrl && <Notice>Uploaded artwork replaces the bundled art ({bundledKey}) in the app. Remove the upload to go back to it.</Notice>}
        </section>

        {xp ? (
          <section className="space-y-3 rounded-xl border border-border p-4">
            <h4 className="font-semibold text-sm">Unlock level</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Text label={`Level (1-${xp.maxLevel})`} value={level} onChange={setLevel} hint="Users get this item free when they reach this level. Never sold." />
              {levelTaken && !isNew ? (
                <Toggle label={`Swap levels with "${occupant!.name}"`} checked={swap} onChange={setSwap} hint={`"${occupant!.name}" moves to level ${item?.level}.`} />
              ) : null}
            </div>
            <Notice>Moving an item to a higher level never takes it back from people who already have it. A lower level grants it on their next sync.</Notice>
          </section>
        ) : (
        <section className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold text-sm">Selling in the Shop</h4>
            {!item?.listing && <Toggle label="List in the Shop" checked={d.sell} onChange={(v) => set({ sell: v })} />}
          </div>
          {d.sell ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Num label="Price (DP coin)" value={d.priceCoins} onChange={(v) => set({ priceCoins: v })} min={1} />
                <Text label="Original price (optional)" value={d.compareAtCoins} onChange={(v) => set({ compareAtCoins: v })} hint="Must be a price you really charged. Shows a real % off." />
                <Text label="Stock limit (empty = unlimited)" value={d.stockLimit} onChange={(v) => set({ stockLimit: v })} hint={soldCount ? `${fmtNumber(soldCount)} sold so far.` : "A real limit. Never fake scarcity."} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="block"><span className="text-xs text-muted-foreground mb-1 block">On sale from</span><input type="datetime-local" className={field} value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></label>
                <label className="block"><span className="text-xs text-muted-foreground mb-1 block">On sale until</span><input type="datetime-local" className={field} value={d.endsAt} onChange={(e) => set({ endsAt: e.target.value })} /></label>
                <Num label="Shop order (lower first)" value={d.sort} onChange={(v) => set({ sort: v })} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Toggle label="On sale" checked={d.onSale} onChange={(v) => set({ onSale: v })} hint="Off = hidden from the Shop; owners keep it." />
                <Toggle label="Refundable on request" checked={d.refundable} onChange={(v) => set({ refundable: v })} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Not sold. The item can still be granted (achievements, seasons, rewards).</p>
          )}
        </section>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Toggle label="Item enabled" checked={d.itemActive} onChange={(v) => set({ itemActive: v })} hint="Off retires the item everywhere: not sold and not drawn, even for owners." />
        </div>

        {problems.length > 0 && <Notice tone="warning">{problems.join(" ")}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(null); save.mutate(); }} disabled={save.isPending || problems.length > 0}>
            {save.isPending ? "Saving…" : isNew ? "Create item" : "Save item"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** WebP upload to /admin/media/shop-item-art with progress, preview and remove. */
function ArtUpload({ label, value, onChange, disabled, disabledHint }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; disabledHint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const src = safeArtUrl(value);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNote(null);
    if (file.type !== "image/webp") {
      setError("Only WebP files. Convert PNG/GIF to WebP (static or animated) first.");
      return;
    }
    if (file.size > LIMITS.maxBytes) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.`);
      return;
    }
    setProgress(0);
    try {
      const { publicUrl } = await api.uploadShopItemArt(file, setProgress);
      onChange(publicUrl);
      if (file.size > LIMITS.warnBytes) setNote(`${(file.size / 1024 / 1024).toFixed(1)} MB. It works, but a smaller file loads faster in feeds.`);
      toast.success("Artwork uploaded. Save the item to publish it.");
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
      <input ref={ref} type="file" accept="image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="rounded-xl border border-dashed border-border bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] h-28 flex items-center justify-center overflow-hidden">
        {src ? <img src={src} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground bg-white/80 px-2 py-0.5 rounded">No image</span>}
      </div>
      <div className="flex gap-2 mt-2">
        <Button variant="secondary" onClick={() => ref.current?.click()} disabled={disabled || progress !== null}>
          {progress !== null ? `Uploading ${progress}%` : src ? "Replace" : "Upload WebP"}
        </Button>
        {src ? <Button variant="secondary" onClick={() => onChange("")}>Remove</Button> : null}
      </div>
      {disabled && disabledHint ? <span className="text-[11px] text-muted-foreground mt-1 block">{disabledHint}</span> : null}
      {note && <span className="text-[11px] text-amber-700 mt-1 block">{note}</span>}
      {error && <span className="text-[11px] text-red-600 mt-1 block">{error}</span>}
    </div>
  );
}
