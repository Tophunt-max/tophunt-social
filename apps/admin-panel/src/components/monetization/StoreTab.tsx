import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Num, Text, Toggle, field, fromLocalInput, toLocalInput } from "./shared";

export function StoreTab() {
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ["mon-store"], queryFn: api.monetization.store });
  const [status, setStatus] = useState("");
  const purchases = useQuery({ queryKey: ["mon-purchases", status], queryFn: () => api.monetization.purchases(status || undefined) });
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [refunding, setRefunding] = useState<any>(null);

  useEffect(() => {
    if (cfgQ.data && enabled === null) setEnabled(cfgQ.data.effective.store.enabled);
  }, [cfgQ.data, enabled]);

  const saveEnabled = useMutation({
    mutationFn: (v: boolean) => api.saveAppSettings({ monetization: { store: { enabled: v } } }),
    onSuccess: (_r, v) => {
      setEnabled(v);
      toast.success(v ? "Store opened" : "Store closed");
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Card
        title="Digital store"
        subtitle="Sell cosmetic catalogue items (frames, themes, badges…) for coins. Items are created under Gamification → Catalog."
        action={enabled !== null && <Toggle label="Store open" checked={enabled} onChange={(v) => saveEnabled.mutate(v)} />}
      >
        <Notice>Only permanent ownership is sold today. Every item is cosmetic and changes no vote, fee, prize or ranking. No random or paid loot boxes.</Notice>
        <Table
          data={items.data ?? []}
          loading={items.isLoading}
          keyFn={(r: any) => r.itemId}
          columns={[
            { key: "n", header: "Item", render: (r: any) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.itemId} · {r.type} · {r.rarity}</p></div> },
            { key: "p", header: "Price", render: (r: any) => (r.listing ? `${fmtNumber(r.listing.priceCoins)} coins` : "Not listed") },
            { key: "s", header: "Status", render: (r: any) => (!r.listing ? <Badge>unlisted</Badge> : <Badge variant={r.listing.active && r.itemActive ? "active" : "default"}>{r.listing.active && r.itemActive ? "on sale" : "hidden"}</Badge>) },
            { key: "st", header: "Stock", render: (r: any) => (r.listing ? (r.listing.stockLimit ? `${r.listing.soldCount} / ${r.listing.stockLimit}` : `${r.listing.soldCount} sold`) : "–") },
            { key: "o", header: "Owners", render: (r: any) => fmtNumber(r.owners) },
            { key: "e", header: "", render: (r: any) => <button className="text-primary text-sm font-semibold" onClick={() => setEditing(r)}>{r.listing ? "Edit" : "List"}</button> },
          ]}
        />
      </Card>

      <Card
        title="Purchases"
        action={
          <select className={`${field} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="refunded">Refunded</option>
          </select>
        }
      >
        <Table
          data={purchases.data ?? []}
          loading={purchases.isLoading}
          empty="No purchases yet."
          keyFn={(r: any) => r.id}
          columns={[
            { key: "d", header: "When", render: (r: any) => fmtDateTime(r.createdAt) },
            { key: "u", header: "User", render: (r: any) => (r.username ? `@${r.username}` : r.uid) },
            { key: "i", header: "Item", render: (r: any) => r.itemName ?? r.itemId },
            { key: "p", header: "Paid", render: (r: any) => `${fmtNumber(r.priceCoins)} (${fmtNumber(r.diamondsSpent)} Diamond)` },
            { key: "s", header: "Status", render: (r: any) => <Badge variant={r.status === "refunded" ? "warning" : "success"}>{r.status}</Badge> },
            { key: "a", header: "", render: (r: any) => (r.status === "completed" ? <button className="text-red-600 text-sm font-semibold" onClick={() => setRefunding(r)}>Refund</button> : <span className="text-xs text-muted-foreground">{r.refundReason}</span>) },
          ]}
        />
      </Card>

      {editing && <ListingDialog item={editing} onClose={() => setEditing(null)} onDone={() => qc.invalidateQueries({ queryKey: ["mon-store"] })} />}
      {refunding && <RefundDialog purchase={refunding} onClose={() => setRefunding(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["mon-purchases"] }); qc.invalidateQueries({ queryKey: ["mon-store"] }); }} />}
    </div>
  );
}

function ListingDialog({ item, onClose, onDone }: { item: any; onClose: () => void; onDone: () => void }) {
  const l = item.listing;
  const [f, setF] = useState({
    priceCoins: l?.priceCoins ?? 50,
    stockLimit: l?.stockLimit ?? "",
    refundable: l?.refundable ?? true,
    active: l?.active ?? false,
    startsAt: toLocalInput(l?.startsAt),
    endsAt: toLocalInput(l?.endsAt),
    sort: l?.sort ?? 0,
  });
  const mut = useMutation({
    mutationFn: () =>
      api.monetization.saveListing(item.itemId, {
        priceCoins: Number(f.priceCoins),
        stockLimit: f.stockLimit === "" ? null : Number(f.stockLimit),
        refundable: f.refundable,
        active: f.active,
        startsAt: fromLocalInput(f.startsAt),
        endsAt: fromLocalInput(f.endsAt),
        sort: Number(f.sort),
        ownership: "permanent",
      }),
    onSuccess: () => {
      toast.success("Listing saved");
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title={`${l ? "Edit" : "List"} ${item.name}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Num label="Price (coins)" value={f.priceCoins} onChange={(v) => setF({ ...f, priceCoins: v })} />
          <Text label="Stock limit (empty = unlimited)" value={String(f.stockLimit)} onChange={(v) => setF({ ...f, stockLimit: v })} hint="A real limit. Never show fake scarcity." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">On sale from</span><input type="datetime-local" className={field} value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground mb-1 block">On sale until</span><input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></label>
        </div>
        <Num label="Sort" value={f.sort} onChange={(v) => setF({ ...f, sort: v })} />
        <Toggle label="Refundable on request" checked={f.refundable} onChange={(v) => setF({ ...f, refundable: v })} hint="Shown to the user before they buy. Admins can always refund." />
        <Toggle label="On sale" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function RefundDialog({ purchase, onClose, onDone }: { purchase: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => api.monetization.refundPurchase(purchase.id, reason),
    onSuccess: () => {
      toast.success("Refunded. Coins returned and the item removed.");
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title="Refund purchase">
      <div className="space-y-3 text-sm">
        <p>
          Returns {fmtNumber(purchase.priceCoins)} coins ({fmtNumber(purchase.diamondsSpent)} as Diamonds) to {purchase.username ? `@${purchase.username}` : purchase.uid}, removes {purchase.itemName ?? purchase.itemId} from their account and unequips it.
        </p>
        <Text label="Reason (kept in the audit log)" value={reason} onChange={setReason} />
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => mut.mutate()} disabled={reason.trim().length < 3 || mut.isPending}>Refund</Button>
        </div>
      </div>
    </Modal>
  );
}
