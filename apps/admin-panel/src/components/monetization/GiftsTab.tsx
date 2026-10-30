import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Num, Text, Toggle, field, fromLocalInput, toLocalInput, type Range } from "./shared";

const CATEGORIES = ["reaction", "flower", "premium", "festival", "creator", "seasonal", "limited"];

export function GiftsTab({ range }: { range: Range }) {
  const qc = useQueryClient();
  const gifts = useQuery({ queryKey: ["mon-gifts"], queryFn: api.monetization.gifts });
  const stats = useQuery({ queryKey: ["mon-gift-stats", range.from, range.to], queryFn: () => api.monetization.giftStats(range.from, range.to) });
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [settings, setSettings] = useState<any>(null);
  const [editing, setEditing] = useState<any | "new" | null>(null);

  useEffect(() => {
    if (cfgQ.data && !settings) setSettings(structuredClone(cfgQ.data.effective.gifts));
  }, [cfgQ.data, settings]);

  const saveSettings = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { gifts: settings } }),
    onSuccess: () => {
      toast.success("Gift settings saved");
      setSettings(null);
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      {settings && (
        <Card title="Gift rules" action={<Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save</Button>}>
          <div className="grid sm:grid-cols-4 gap-3">
            <Toggle label="Gifts enabled" checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
            <Num label="Max quantity per send" value={settings.maxQuantity} onChange={(v) => setSettings({ ...settings, maxQuantity: v })} />
            <Num label="Max coins per send" value={settings.maxCoinsPerSend} onChange={(v) => setSettings({ ...settings, maxCoinsPerSend: v })} />
            <Num label="Creator share (basis points)" value={settings.creatorShareBps} onChange={(v) => setSettings({ ...settings, creatorShareBps: v })} hint="Recorded on each send for reporting. Nothing is paid out." />
          </div>
          <Notice tone="warning">Senders spend DP coin. Recipients receive the gift and a notification, never coins or cash.</Notice>
        </Card>
      )}

      <Card title="Gift catalogue" subtitle="Price changes apply to new sends only; past sends keep the price paid." action={<Button onClick={() => setEditing("new")}>New gift</Button>}>
        <Table
          data={gifts.data ?? []}
          loading={gifts.isLoading}
          keyFn={(g: any) => g.id}
          columns={[
            { key: "a", header: "", render: (g: any) => <span className="text-xl">{g.asset?.emoji ?? "🎁"}</span> },
            { key: "n", header: "Gift", render: (g: any) => <div><p className="font-semibold">{g.name}</p><p className="text-xs text-muted-foreground">{g.id} · {g.category}</p></div> },
            { key: "p", header: "Price", render: (g: any) => `${fmtNumber(g.priceCoins)} coins` },
            { key: "s", header: "Status", render: (g: any) => <Badge variant={g.active ? "active" : "default"}>{g.active ? "active" : "hidden"}</Badge> },
            { key: "w", header: "Window", render: (g: any) => (g.startsAt || g.endsAt ? `${g.startsAt ? new Date(g.startsAt).toLocaleDateString() : "…"} – ${g.endsAt ? new Date(g.endsAt).toLocaleDateString() : "…"}` : "Always") },
            { key: "u", header: "Sends", render: (g: any) => fmtNumber(g.sends) },
            { key: "c", header: "Coins", render: (g: any) => fmtNumber(g.coins) },
            { key: "e", header: "", render: (g: any) => <button className="text-primary text-sm font-semibold" onClick={() => setEditing(g)}>Edit</button> },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Top gifts in period">
          <Table
            data={stats.data?.topGifts ?? []}
            loading={stats.isLoading}
            keyFn={(r: any) => r.giftId}
            columns={[
              { key: "n", header: "Gift", render: (r: any) => r.name },
              { key: "q", header: "Quantity", render: (r: any) => fmtNumber(r.quantity) },
              { key: "c", header: "Coins", render: (r: any) => fmtNumber(r.coins) },
            ]}
          />
        </Card>
        <Card title="Top recipients in period" subtitle={stats.data?.creatorShareNote}>
          <Table
            data={stats.data?.topRecipients ?? []}
            loading={stats.isLoading}
            keyFn={(r: any) => r.uid}
            columns={[
              { key: "u", header: "Creator", render: (r: any) => (r.username ? `@${r.username}` : r.uid) },
              { key: "s", header: "Supporters", render: (r: any) => fmtNumber(r.supporters) },
              { key: "c", header: "Coins received in gifts", render: (r: any) => fmtNumber(r.coins) },
            ]}
          />
        </Card>
      </div>

      {editing && <GiftDialog gift={editing === "new" ? null : editing} onClose={() => setEditing(null)} onDone={() => qc.invalidateQueries({ queryKey: ["mon-gifts"] })} />}
    </div>
  );
}

function GiftDialog({ gift, onClose, onDone }: { gift: any | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    id: gift?.id ?? "",
    name: gift?.name ?? "",
    description: gift?.description ?? "",
    category: gift?.category ?? "reaction",
    priceCoins: gift?.priceCoins ?? 1,
    emoji: gift?.asset?.emoji ?? "",
    imageUrl: gift?.asset?.imageUrl ?? "",
    lottieUrl: gift?.asset?.lottieUrl ?? "",
    animStyle: gift?.animation?.style ?? "float",
    active: gift?.active ?? true,
    startsAt: toLocalInput(gift?.startsAt),
    endsAt: toLocalInput(gift?.endsAt),
    sort: gift?.sort ?? 0,
  });
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const mut = useMutation({
    mutationFn: () =>
      api.monetization.saveGift(f.id.trim(), {
        name: f.name,
        description: f.description,
        category: f.category,
        priceCoins: Number(f.priceCoins),
        asset: Object.fromEntries(Object.entries({ emoji: f.emoji, imageUrl: f.imageUrl, lottieUrl: f.lottieUrl }).filter(([, v]) => v)),
        animation: { style: f.animStyle },
        active: f.active,
        startsAt: fromLocalInput(f.startsAt),
        endsAt: fromLocalInput(f.endsAt),
        sort: Number(f.sort),
      }),
    onSuccess: () => {
      toast.success("Gift saved");
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title={gift ? `Edit ${gift.name}` : "New gift"} width="max-w-lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Id (permanent)</span>
            <input className={field} value={f.id} disabled={!!gift} onChange={(e) => set("id", e.target.value.toLowerCase())} placeholder="e.g. diwali_lamp" />
          </label>
          <Text label="Name" value={f.name} onChange={(v) => set("name", v)} />
        </div>
        <Text label="Description" value={f.description} onChange={(v) => set("description", v)} />
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Category</span>
            <select className={field} value={f.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <Num label="Price (coins)" value={f.priceCoins} onChange={(v) => set("priceCoins", v)} />
          <Num label="Sort" value={f.sort} onChange={(v) => set("sort", v)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Text label="Emoji" value={f.emoji} onChange={(v) => set("emoji", v)} />
          <Text label="Image URL (https)" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} />
          <Text label="Lottie URL (https)" value={f.lottieUrl} onChange={(v) => set("lottieUrl", v)} />
        </div>
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Animation</span>
          <select className={field} value={f.animStyle} onChange={(e) => set("animStyle", e.target.value)}>
            <option value="float">Float up</option>
            <option value="burst">Burst</option>
            <option value="none">None</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Available from (optional)</span><input type="datetime-local" className={field} value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></label>
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Available until (optional)</span><input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></label>
        </div>
        <Toggle label="Active (visible in the app)" checked={f.active} onChange={(v) => set("active", v)} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
