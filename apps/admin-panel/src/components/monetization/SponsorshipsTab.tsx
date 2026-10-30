import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Button, Card, Notice, Num, Text, field, fromLocalInput, inr, toLocalInput } from "./shared";

/** Mirrors CAMPAIGN_TRANSITIONS in the worker (lib/sponsored.ts); the server enforces it. */
const NEXT: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "pending", label: "Submit for approval" }, { to: "ended", label: "End" }],
  pending: [{ to: "approved", label: "Approve" }, { to: "rejected", label: "Reject" }, { to: "draft", label: "Back to draft" }],
  approved: [{ to: "paused", label: "Pause" }, { to: "ended", label: "End" }],
  paused: [{ to: "approved", label: "Resume" }, { to: "ended", label: "End" }],
  ended: [],
  rejected: [{ to: "draft", label: "Back to draft" }],
};
const VARIANT: Record<string, string> = { draft: "default", pending: "pending", approved: "approved", paused: "warning", ended: "ended", rejected: "rejected" };

export function SponsorshipsTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const advertisers = useQuery({ queryKey: ["mon-advertisers"], queryFn: api.monetization.advertisers });
  const campaigns = useQuery({ queryKey: ["mon-campaigns"], queryFn: api.monetization.campaigns });
  const [advDialog, setAdvDialog] = useState<any | "new" | null>(null);
  const [campDialog, setCampDialog] = useState<any | "new" | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mon-campaigns"] });
    qc.invalidateQueries({ queryKey: ["mon-advertisers"] });
  };

  const status = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => api.monetization.setCampaignStatus(id, to),
    onSuccess: (_r, v) => {
      toast.success(`Campaign ${v.to}`);
      refresh();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Notice>
        Direct campaigns are sold and invoiced outside the app; record the invoice and payment references here. Delivery counts are first-party (one impression per viewer per hour) and contain no personal data. A campaign must be approved by a different admin than its creator.
      </Notice>

      <Card title="Advertisers" action={<Button onClick={() => setAdvDialog("new")}>New advertiser</Button>}>
        <Table
          data={advertisers.data ?? []}
          loading={advertisers.isLoading}
          empty="No advertisers yet."
          keyFn={(a: any) => a.id}
          columns={[
            { key: "n", header: "Name", render: (a: any) => <span className="font-semibold">{a.name}</span> },
            { key: "e", header: "Contact", render: (a: any) => a.contactEmail ?? "–" },
            { key: "s", header: "Status", render: (a: any) => <Badge variant={a.status === "active" ? "active" : "rejected"}>{a.status}</Badge> },
            { key: "c", header: "Campaigns", render: (a: any) => fmtNumber(a.campaigns) },
            { key: "x", header: "", render: (a: any) => <button className="text-primary text-sm font-semibold" onClick={() => setAdvDialog(a)}>Edit</button> },
          ]}
        />
      </Card>

      <Card title="Campaigns" action={<Button disabled={!advertisers.data?.length} onClick={() => setCampDialog("new")}>New campaign</Button>}>
        <Table
          data={campaigns.data ?? []}
          loading={campaigns.isLoading}
          empty="No campaigns yet."
          keyFn={(c: any) => c.id}
          columns={[
            { key: "t", header: "Campaign", render: (c: any) => <div><p className="font-semibold">{c.title}</p><p className="text-xs text-muted-foreground">{c.advertiser}</p></div> },
            { key: "s", header: "Status", render: (c: any) => <Badge variant={VARIANT[c.status]}>{c.status}</Badge> },
            { key: "d", header: "Dates", render: (c: any) => `${fmtDate(c.startsAt)} – ${fmtDate(c.endsAt)}` },
            { key: "b", header: "Pricing", render: (c: any) => (c.pricingModel === "cpm" ? `CPM ${inr(c.cpmPaise / 100)} · cap ${inr(c.budgetPaise / 100)}` : `Flat ${inr(c.budgetPaise / 100)}`) },
            { key: "i", header: "Delivered", render: (c: any) => `${fmtNumber(c.impressions)} imp · ${fmtNumber(c.clicks)} clicks` },
            { key: "inv", header: "Billing", render: (c: any) => <span className="text-xs">{c.invoiceRef ? `Inv ${c.invoiceRef}` : "No invoice"}{c.paymentRef ? ` · Paid ${c.paymentRef}` : ""}</span> },
            {
              key: "a",
              header: "",
              render: (c: any) => (
                <div className="flex flex-wrap gap-2">
                  {(NEXT[c.status] ?? [])
                    .filter((n) => !(n.to === "approved" && c.status === "pending" && c.createdBy && c.createdBy === user?.uid))
                    .map((n) => (
                      <button key={n.to} className="text-primary text-xs font-semibold" disabled={status.isPending} onClick={() => status.mutate({ id: c.id, to: n.to })}>
                        {n.label}
                      </button>
                    ))}
                  <button className="text-xs font-semibold" onClick={() => setCampDialog(c)}>Edit</button>
                  <button className="text-xs font-semibold" onClick={() => setReportId(c.id)}>Report</button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      {advDialog && <AdvertiserDialog adv={advDialog === "new" ? null : advDialog} onClose={() => setAdvDialog(null)} onDone={refresh} />}
      {campDialog && <CampaignDialog camp={campDialog === "new" ? null : campDialog} advertisers={advertisers.data ?? []} onClose={() => setCampDialog(null)} onDone={refresh} />}
      {reportId && <ReportDialog id={reportId} onClose={() => setReportId(null)} />}
    </div>
  );
}

function AdvertiserDialog({ adv, onClose, onDone }: { adv: any | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: adv?.name ?? "", contactEmail: adv?.contactEmail ?? "", status: adv?.status ?? "active", notes: adv?.notes ?? "" });
  const mut = useMutation({
    mutationFn: () => (adv ? api.monetization.updateAdvertiser(adv.id, f) : api.monetization.createAdvertiser(f)),
    onSuccess: () => { toast.success("Advertiser saved"); onDone(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title={adv ? "Edit advertiser" : "New advertiser"}>
      <div className="space-y-3">
        <Text label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <Text label="Contact email" value={f.contactEmail} onChange={(v) => setF({ ...f, contactEmail: v })} />
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Status</span>
          <select className={field} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="suspended">Suspended (stops all its campaigns)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground mb-1 block">Notes</span>
          <textarea className={`${field} h-20`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
        <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button></div>
      </div>
    </Modal>
  );
}

function CampaignDialog({ camp, advertisers, onClose, onDone }: { camp: any | null; advertisers: any[]; onClose: () => void; onDone: () => void }) {
  const locked = camp && ["approved", "paused", "ended"].includes(camp.status);
  const [f, setF] = useState({
    advertiserId: camp?.advertiserId ?? advertisers[0]?.id ?? "",
    title: camp?.title ?? "",
    startsAt: toLocalInput(camp?.startsAt ?? Date.now()),
    endsAt: toLocalInput(camp?.endsAt ?? Date.now() + 7 * 86_400_000),
    pricingModel: camp?.pricingModel ?? "flat",
    budgetInr: (camp?.budgetPaise ?? 0) / 100,
    cpmInr: (camp?.cpmPaise ?? 0) / 100,
    impressionCap: camp?.impressionCap ?? "",
    weight: camp?.weight ?? 1,
    disclosure: camp?.disclosure ?? "Sponsored",
    headline: camp?.creative?.headline ?? "",
    body: camp?.creative?.body ?? "",
    imageUrl: camp?.creative?.imageUrl ?? "",
    ctaLabel: camp?.creative?.ctaLabel ?? "Learn more",
    ctaUrl: camp?.creative?.ctaUrl ?? "",
    invoiceRef: camp?.invoiceRef ?? "",
    paymentRef: camp?.paymentRef ?? "",
  });
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const payload = () => ({
    advertiserId: f.advertiserId,
    title: f.title,
    startsAt: fromLocalInput(f.startsAt),
    endsAt: fromLocalInput(f.endsAt),
    pricingModel: f.pricingModel,
    budgetPaise: Math.round(Number(f.budgetInr) * 100),
    cpmPaise: Math.round(Number(f.cpmInr) * 100),
    impressionCap: f.impressionCap === "" ? null : Number(f.impressionCap),
    weight: Number(f.weight),
    disclosure: f.disclosure,
    creative: { headline: f.headline, body: f.body, imageUrl: f.imageUrl, ctaLabel: f.ctaLabel, ctaUrl: f.ctaUrl },
    invoiceRef: f.invoiceRef,
    paymentRef: f.paymentRef,
  });
  const mut = useMutation({
    mutationFn: () => (camp ? api.monetization.updateCampaign(camp.id, payload()) : api.monetization.createCampaign(payload())),
    onSuccess: () => { toast.success(locked ? "Billing references saved" : "Campaign saved"); onDone(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title={camp ? "Edit campaign" : "New campaign"} width="max-w-2xl">
      <div className="space-y-3">
        {locked && <Notice tone="warning">This campaign is {camp.status}. Only billing references can change; to change what viewers see, end it and create a new one.</Notice>}
        <fieldset disabled={!!locked} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Advertiser</span>
              <select className={field} value={f.advertiserId} onChange={(e) => set("advertiserId", e.target.value)}>
                {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <Text label="Title (internal)" value={f.title} onChange={(v) => set("title", v)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Starts</span><input type="datetime-local" className={field} value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></label>
            <label className="block"><span className="text-xs text-muted-foreground mb-1 block">Ends</span><input type="datetime-local" className={field} value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></label>
          </div>
          <div className="grid sm:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Pricing</span>
              <select className={field} value={f.pricingModel} onChange={(e) => set("pricingModel", e.target.value)}>
                <option value="flat">Flat fee</option>
                <option value="cpm">CPM</option>
              </select>
            </label>
            <Num label={f.pricingModel === "cpm" ? "Budget cap (₹)" : "Fee (₹)"} value={f.budgetInr} onChange={(v) => set("budgetInr", v)} />
            {f.pricingModel === "cpm" && <Num label="CPM (₹ per 1000)" value={f.cpmInr} onChange={(v) => set("cpmInr", v)} />}
            <Text label="Impression cap" value={String(f.impressionCap)} onChange={(v) => set("impressionCap", v)} hint="Stops serving after this many." />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Num label="Weight (1-100)" value={f.weight} onChange={(v) => set("weight", v)} />
            <Text label="Disclosure label" value={f.disclosure} onChange={(v) => set("disclosure", v)} hint="Must clearly say it is paid: Sponsored, Ad, Paid partnership." />
          </div>
          <div className="rounded-xl border border-border p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">Creative</p>
            <Text label="Headline" value={f.headline} onChange={(v) => set("headline", v)} />
            <Text label="Body" value={f.body} onChange={(v) => set("body", v)} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Text label="Image URL (https)" value={f.imageUrl} onChange={(v) => set("imageUrl", v)} />
              <Text label="Button label" value={f.ctaLabel} onChange={(v) => set("ctaLabel", v)} />
            </div>
            <Text label="Link (https)" value={f.ctaUrl} onChange={(v) => set("ctaUrl", v)} />
          </div>
        </fieldset>
        <div className="grid sm:grid-cols-2 gap-3">
          <Text label="Invoice reference" value={f.invoiceRef} onChange={(v) => set("invoiceRef", v)} />
          <Text label="Payment reference" value={f.paymentRef} onChange={(v) => set("paymentRef", v)} hint="Set only after the payment is received." />
        </div>
        <div className="flex gap-2 justify-end"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => mut.mutate()} disabled={mut.isPending}>Save</Button></div>
      </div>
    </Modal>
  );
}

function ReportDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["mon-campaign-report", id], queryFn: () => api.monetization.campaignReport(id) });
  return (
    <Modal open onClose={onClose} title="Campaign report" width="max-w-xl">
      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="font-semibold">{data.campaign.title} · {data.campaign.advertiser}</p>
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Impressions</dt><dd className="font-semibold">{fmtNumber(data.totals.impressions)}</dd>
            <dt className="text-muted-foreground">Clicks</dt><dd className="font-semibold">{fmtNumber(data.totals.clicks)}</dd>
            <dt className="text-muted-foreground">CTR</dt><dd className="font-semibold">{data.totals.ctr === null ? "–" : `${data.totals.ctr}%`}</dd>
            <dt className="text-muted-foreground">Value by its terms</dt><dd className="font-semibold">{inr(data.totals.deliveredValuePaise / 100)}</dd>
          </dl>
          <Notice>First-party delivery counts. The invoice is the billing record.</Notice>
          <Table
            data={data.days}
            keyFn={(d: any) => d.day}
            empty="No delivery yet."
            columns={[
              { key: "d", header: "Day", render: (d: any) => d.day },
              { key: "i", header: "Impressions", render: (d: any) => fmtNumber(d.impressions) },
              { key: "c", header: "Clicks", render: (d: any) => fmtNumber(d.clicks) },
            ]}
          />
        </div>
      )}
    </Modal>
  );
}
