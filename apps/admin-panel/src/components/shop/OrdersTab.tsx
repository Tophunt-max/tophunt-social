import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Text, Toggle, field, inr } from "@/components/monetization/shared";

const LABEL: Record<string, string> = {
  placed: "Placed", packed: "Packed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled",
  return_requested: "Return requested", returned: "Returned", return_rejected: "Return declined",
};
const VARIANT: Record<string, string> = {
  placed: "pending", packed: "info", shipped: "primary", delivered: "success", cancelled: "ended",
  return_requested: "warning", returned: "ended", return_rejected: "rejected",
};
const ACTION: Record<string, string> = {
  packed: "Mark packed", shipped: "Mark shipped", delivered: "Mark delivered", cancelled: "Cancel & refund",
  returned: "Accept return & refund", return_rejected: "Decline return",
};

export function OrdersTab() {
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["shop-orders", status], queryFn: () => api.monetization.shopOrders(status || undefined) });
  const counts = q.data?.counts ?? {};
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {["review", "", "placed", "packed", "shipped", "return_requested", "delivered", "cancelled", "returned"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${status === s ? "gradient-purple text-white" : "bg-secondary"}`}
          >
            {s === "review" ? "⚠ Needs review" : s ? LABEL[s] : "All"}
            {s === "review" ? (counts.review_pending ? ` (${counts.review_pending})` : "") : s && counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>
      <Card title="Orders" subtitle="You pack and ship by hand. Add the courier tracking number when you mark an order shipped.">
        <Table
          data={q.data?.orders ?? []}
          loading={q.isLoading}
          empty="No orders."
          keyFn={(o: any) => o.id}
          columns={[
            { key: "d", header: "Placed", render: (o: any) => fmtDateTime(o.createdAt) },
            { key: "u", header: "Customer", render: (o: any) => (o.username ? `@${o.username}` : o.uid) },
            { key: "i", header: "Items", render: (o: any) => `${o.title ?? ""}${o.units > 1 ? ` + ${o.units - 1} more` : ""}` },
            { key: "t", header: "Total", render: (o: any) => <div><p className="font-semibold">{fmtNumber(o.totalCoins)} DP coin</p><p className="text-xs text-muted-foreground">{inr(o.totalInr)}</p></div> },
            {
              key: "s",
              header: "Status",
              render: (o: any) => (
                <div className="flex flex-wrap gap-1">
                  <Badge variant={VARIANT[o.status]}>{LABEL[o.status]}</Badge>
                  {o.reviewStatus === "pending" && <Badge variant="warning">Needs review</Badge>}
                </div>
              ),
            },
            {
              key: "r",
              header: "Risk",
              render: (o: any) =>
                o.riskFlags?.length ? <span className="text-xs text-amber-700">{o.riskFlags.map((f: string) => q.data?.riskLabels?.[f] ?? f).join(" · ")}</span> : <span className="text-xs text-muted-foreground">–</span>,
            },
            { key: "tr", header: "Tracking", render: (o: any) => o.trackingNumber ?? "–" },
            { key: "x", header: "", render: (o: any) => <button className="text-primary text-sm font-semibold" onClick={() => setOpenId(o.id)}>Open</button> },
          ]}
        />
      </Card>
      {openId && <OrderDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function OrderDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["shop-order", id], queryFn: () => api.monetization.shopOrder(id) });
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [restock, setRestock] = useState(true);
  const mut = useMutation({
    mutationFn: () => api.monetization.setOrderStatus(id, { status: to, note, carrier, trackingNumber: tracking, trackingUrl, restock }),
    onSuccess: () => {
      toast.success("Order updated. The customer was notified.");
      setTo(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["shop-order", id] });
      qc.invalidateQueries({ queryKey: ["shop-orders"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const o = q.data?.order;
  const a = (o?.address ?? {}) as any;
  return (
    <Modal open onClose={onClose} title="Order" width="max-w-2xl">
      {!o ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{q.data.username ? `@${q.data.username}` : q.data.uid}</p>
              <p className="text-xs text-muted-foreground break-all">{o.id}</p>
            </div>
            <Badge variant={VARIANT[o.status]}>{LABEL[o.status]}</Badge>
          </div>
          <div className="rounded-xl border border-border divide-y divide-border">
            {o.items.map((i: any) => (
              <div key={i.variantId} className="flex items-center gap-3 p-3">
                {i.image ? <img src={i.image} alt="" className="w-10 h-10 rounded-lg object-cover" /> : null}
                <div className="flex-1">
                  <p className="font-semibold">{i.title}</p>
                  <p className="text-xs text-muted-foreground">{i.variantLabel} · qty {i.qty}</p>
                </div>
                <p>{fmtNumber(i.unitCoins * i.qty)} DP coin</p>
              </div>
            ))}
            <div className="flex justify-between p-3 font-semibold">
              <span>Total (at ₹{o.dpCoinInr} per DP coin)</span>
              <span>{fmtNumber(o.totalCoins)} DP coin · {inr(o.totalInr)}</span>
            </div>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <p className="font-semibold">{a.recipientName} · {a.phone}</p>
            <p>{[a.addressLine1, a.addressLine2, a.landmark].filter(Boolean).join(", ")}</p>
            <p>{a.city}, {a.state} {a.postalCode}, {a.country}</p>
            {a.notes ? <p className="text-xs text-muted-foreground mt-1">Note: {a.notes}</p> : null}
          </div>
          {q.data.risk && (q.data.risk.flags.length > 0 || q.data.risk.reviewStatus !== "none") && (
            <ReviewBox id={id} risk={q.data.risk} onDone={() => { qc.invalidateQueries({ queryKey: ["shop-order", id] }); qc.invalidateQueries({ queryKey: ["shop-orders"] }); }} />
          )}
          {o.trackingNumber && <p>Tracking: <b>{o.carrier ? `${o.carrier} ` : ""}{o.trackingNumber}</b>{o.trackingUrl ? <> · <a className="text-primary" href={o.trackingUrl} target="_blank" rel="noreferrer">link</a></> : null}</p>}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">History</p>
            {o.history.map((h: any, i: number) => (
              <p key={i} className="text-xs">{fmtDateTime(h.at)} · {LABEL[h.to] ?? h.to}{h.note ? ` · ${h.note}` : ""}</p>
            ))}
          </div>

          {(q.data.next ?? []).length > 0 && (
            <div className="rounded-xl border border-border p-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {q.data.next.map((s: string) => (
                  <button key={s} onClick={() => setTo(s)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${to === s ? "gradient-purple text-white" : "bg-secondary"}`}>
                    {ACTION[s] ?? s}
                  </button>
                ))}
              </div>
              {to === "shipped" && (
                <div className="grid sm:grid-cols-3 gap-2">
                  <Text label="Courier" value={carrier} onChange={setCarrier} placeholder="India Post / Delhivery" />
                  <Text label="Tracking number (required)" value={tracking} onChange={setTracking} />
                  <Text label="Tracking link (https)" value={trackingUrl} onChange={setTrackingUrl} />
                </div>
              )}
              {to && (
                <>
                  <label className="block">
                    <span className="text-xs text-muted-foreground mb-1 block">{to === "cancelled" || to === "return_rejected" ? "Reason (required, shown to the customer)" : "Note (optional)"}</span>
                    <input className={field} value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  {to === "returned" && <Toggle label="Put the items back in stock" checked={restock} onChange={setRestock} />}
                  {(to === "cancelled" || to === "returned") && <Notice tone="warning">{fmtNumber(o.totalCoins)} DP coin will be returned to the customer.</Notice>}
                  <div className="flex justify-end">
                    <Button variant={to === "cancelled" ? "danger" : "primary"} onClick={() => mut.mutate()} disabled={mut.isPending}>{ACTION[to] ?? "Save"}</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ReviewBox({ id, risk, onDone }: { id: string; risk: any; onDone: () => void }) {
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: (decision: "approve" | "reject") => api.monetization.reviewOrder(id, decision, note),
    onSuccess: (_r, d) => {
      toast.success(d === "approve" ? "Approved. You can pack it now." : "Rejected. Order cancelled and DP coin refunded.");
      setNote("");
      onDone();
    },
    onError: (e) => toast.error(describeError(e)),
  });
  const pending = risk.reviewStatus === "pending";
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${pending ? "border-amber-300 bg-amber-50" : "border-border"}`}>
      <p className="font-semibold">{pending ? "⚠ Fraud review needed before packing" : `Review: ${risk.reviewStatus}`}</p>
      {risk.flags.length > 0 && (
        <ul className="list-disc pl-5 text-xs">
          {risk.flags.map((f: string) => <li key={f}>{risk.labels?.[f] ?? f}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Account joined {risk.accountJoined ? fmtDateTime(risk.accountJoined) : "–"} · {fmtNumber(risk.ordersTotal)} order(s) · {fmtNumber(risk.otherAccountsOnAddressOrPhone)} other account(s) used this address / phone
      </p>
      {risk.reviewNote && <p className="text-xs">Note: {risk.reviewNote}</p>}
      {pending && (
        <>
          <Text label="Note (required to reject; the customer sees it)" value={note} onChange={setNote} />
          <div className="flex gap-2 justify-end">
            <Button variant="danger" disabled={mut.isPending || note.trim().length < 3} onClick={() => mut.mutate("reject")}>Reject & refund</Button>
            <Button disabled={mut.isPending} onClick={() => mut.mutate("approve")}>Approve</Button>
          </div>
        </>
      )}
    </div>
  );
}
