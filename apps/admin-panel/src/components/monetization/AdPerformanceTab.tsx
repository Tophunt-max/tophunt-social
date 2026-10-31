/**
 * Ad performance: what each slot × network × platform did, experiment
 * variants, countries, the optimizer's current decisions, alerts, revenue
 * import status, and the invalid-traffic suppression tool.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Text, type Range } from "./shared";

const pct = (v: number | null) => (v === null || v === undefined ? "–" : `${v}%`);
const usd = (v: number | null) => (v === null || v === undefined ? "–" : `$${v.toFixed(2)}`);

export function AdPerformanceTab({ range }: { range: Range }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ads-performance", range.from, range.to], queryFn: () => api.monetization.adsPerformance(range.from, range.to) });
  const [uid, setUid] = useState("");
  const [supp, setSupp] = useState<{ uid: string; suppressedUntil: number } | null>(null);

  const optimize = useMutation({
    mutationFn: api.monetization.adsOptimizeNow,
    onSuccess: (r: any) => {
      toast.success(`Optimizer ran: ${r.placements} placements, ${r.paused} paused, ${r.alerts} alerts`);
      qc.invalidateQueries({ queryKey: ["ads-performance"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const importNow = useMutation({
    mutationFn: api.monetization.adsImportNow,
    onSuccess: (r: any) => {
      if (r.errors?.length) toast.error(r.errors[0]);
      else toast.success(`Imported AdMob ${r.admob} · AdSense ${r.adsense} rows`);
      qc.invalidateQueries({ queryKey: ["ads-performance"] });
      qc.invalidateQueries({ queryKey: ["ads-report"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const lookup = useMutation({ mutationFn: () => api.monetization.adsSuppression(uid.trim()), onSuccess: setSupp, onError: (e: any) => toast.error(e.message) });
  const lift = useMutation({
    mutationFn: () => api.monetization.adsUnsuppress(uid.trim()),
    onSuccess: () => {
      toast.success("Ads switched back on for this account");
      setSupp({ uid: uid.trim(), suppressedUntil: 0 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const d = q.data;
  const ic = d?.importConfigured;
  const decisions = d?.decisions;
  const decisionRows = decisions
    ? Object.entries(decisions.placements ?? {}).flatMap(([slot, byPlat]: [string, any]) =>
        Object.entries(byPlat).map(([platform, e]: [string, any]) => ({ slot, platform, order: e.order ?? [], paused: e.paused ?? [], scores: decisions.scores?.[slot]?.[platform] ?? {} })),
      )
    : [];

  return (
    <div className="space-y-5">
      <Card
        title="Automation"
        subtitle="The optimizer runs every hour; revenue import every 6 hours. Run them now after a change."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => optimize.mutate()} disabled={optimize.isPending}>Run optimizer</Button>
            <Button variant="secondary" onClick={() => importNow.mutate()} disabled={importNow.isPending}>Import revenue</Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={ic?.oauth ? "success" : "warning"}>Google OAuth {ic?.oauth ? "set" : "not set"}</Badge>
          <Badge variant={ic?.admob ? "success" : "warning"}>AdMob API {ic?.admob ? "on" : "off"}</Badge>
          <Badge variant={ic?.adsense ? "success" : "warning"}>AdSense API {ic?.adsense ? "on" : "off"}</Badge>
          <Badge>Ad Manager / AdX: CSV import in "Ads & rewards"</Badge>
          {decisions?.generatedAt ? <Badge>Decisions from {new Date(decisions.generatedAt).toLocaleString()}</Badge> : <Badge variant="warning">No optimizer run yet</Badge>}
        </div>
        {!ic?.oauth && (
          <Notice tone="info">
            To import revenue automatically, set the Worker secrets GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN (scopes admob.readonly + adsense.readonly) and ADMOB_PUBLISHER_ID / ADSENSE_ACCOUNT_ID (pub-…). See MONETIZATION.md.
          </Notice>
        )}
      </Card>

      <Card title="Alerts" subtitle="Fill or eCPM drops, paused networks, reconciliation gaps and import failures.">
        <Table
          data={d?.alerts ?? []}
          loading={q.isLoading}
          empty="No alerts."
          keyFn={(r: any) => r.id}
          columns={[
            { key: "t", header: "When", render: (r: any) => new Date(r.created_at).toLocaleString() },
            { key: "k", header: "Kind", render: (r: any) => <Badge variant={r.kind === "network_paused" || r.kind === "import_failed" ? "danger" : "warning"}>{r.kind}</Badge> },
            { key: "m", header: "What", render: (r: any) => r.message },
          ]}
        />
      </Card>

      <Card title="Slots × networks" subtitle="What the app reported. SDK revenue is AdMob's impression-level value (USD); the networks' reports are in Ads & rewards.">
        <Table
          data={d?.rows ?? []}
          loading={q.isLoading}
          empty="No ad traffic in this period."
          keyFn={(r: any) => `${r.placement}-${r.platform}-${r.provider}`}
          columns={[
            { key: "p", header: "Slot", render: (r: any) => r.placement },
            { key: "pl", header: "Platform", render: (r: any) => r.platform },
            { key: "n", header: "Network", render: (r: any) => r.provider },
            { key: "rq", header: "Requests", render: (r: any) => fmtNumber(r.requests) },
            { key: "f", header: "Fill", render: (r: any) => pct(r.fillRate) },
            { key: "fr", header: "Fail/timeout", render: (r: any) => pct(r.failRate) },
            { key: "i", header: "Impressions", render: (r: any) => fmtNumber(r.impressions) },
            { key: "c", header: "CTR", render: (r: any) => pct(r.ctr) },
            { key: "l", header: "Avg load", render: (r: any) => (r.avgLatencyMs === null ? "–" : `${r.avgLatencyMs} ms`) },
            { key: "e", header: "SDK eCPM", render: (r: any) => usd(r.sdkEcpmUsd) },
            { key: "r", header: "SDK revenue", render: (r: any) => usd(r.sdkRevenueUsd) },
          ]}
        />
      </Card>

      <Card title="Optimizer decisions" subtitle="Current waterfall order per slot and platform (auto-optimize on), and networks paused for failing.">
        <Table
          data={decisionRows}
          loading={q.isLoading}
          empty="Nothing yet: turn on Auto-optimize for a placement, or wait for the hourly run."
          keyFn={(r: any) => `${r.slot}-${r.platform}`}
          columns={[
            { key: "s", header: "Slot", render: (r: any) => r.slot },
            { key: "p", header: "Platform", render: (r: any) => r.platform },
            {
              key: "o",
              header: "Order (score = fill × eCPM)",
              render: (r: any) =>
                r.order.length
                  ? r.order.map((id: string) => `${id}${r.scores[id]?.score !== null && r.scores[id]?.score !== undefined ? ` (${r.scores[id].score})` : ""}`).join(" → ")
                  : "admin order",
            },
            { key: "x", header: "Paused", render: (r: any) => (r.paused.length ? r.paused.join(", ") : "–") },
          ]}
        />
      </Card>

      <Card title="Experiments" subtitle="Variants of a placement's rules, side by side. Compare revenue and fill; check retention elsewhere before picking a winner.">
        <Table
          data={d?.experiments ?? []}
          loading={q.isLoading}
          empty="No experiment traffic in this period."
          keyFn={(r: any) => `${r.placement}-${r.variant}`}
          columns={[
            { key: "p", header: "Slot", render: (r: any) => r.placement },
            { key: "v", header: "Variant", render: (r: any) => r.variant },
            { key: "rq", header: "Requests", render: (r: any) => fmtNumber(r.requests) },
            { key: "f", header: "Fill", render: (r: any) => pct(r.fillRate) },
            { key: "i", header: "Impressions", render: (r: any) => fmtNumber(r.impressions) },
            { key: "c", header: "Clicks", render: (r: any) => fmtNumber(r.clicks) },
            { key: "r", header: "SDK revenue", render: (r: any) => usd(r.sdkRevenueUsd) },
          ]}
        />
      </Card>

      <Card title="Countries" subtitle="Top countries by impressions.">
        <Table
          data={d?.countries ?? []}
          loading={q.isLoading}
          empty="No data."
          keyFn={(r: any) => r.country}
          columns={[
            { key: "c", header: "Country", render: (r: any) => r.country },
            { key: "i", header: "Impressions", render: (r: any) => fmtNumber(r.impressions) },
            { key: "f", header: "Fill", render: (r: any) => pct(r.fillRate) },
          ]}
        />
      </Card>

      <Card title="Invalid traffic" subtitle="Accounts that click ads far more than people do get no ads for 7 days (protects the ad accounts). Look one up, or lift it.">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-72">
            <Text label="User id (uid)" value={uid} onChange={setUid} />
          </div>
          <Button variant="secondary" onClick={() => lookup.mutate()} disabled={!uid.trim() || lookup.isPending}>Check</Button>
          {supp?.suppressedUntil ? (
            <Button variant="danger" onClick={() => lift.mutate()} disabled={lift.isPending}>Switch ads back on</Button>
          ) : null}
        </div>
        {supp && (
          <p className="text-sm">
            {supp.suppressedUntil ? `No ads until ${new Date(supp.suppressedUntil).toLocaleString()}.` : "Ads are on for this account."}
          </p>
        )}
      </Card>
    </div>
  );
}
