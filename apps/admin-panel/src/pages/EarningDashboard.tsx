import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from "recharts";
import { Download, Gem, Coins, Zap, Users, RotateCcw } from "lucide-react";
import { api, describeError, type EarningAnalytics } from "@/lib/api";
import { PageHeader, fmtNumber } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { SegTabs } from "@/components/finance/bits";
import { Card, Notice } from "@/components/monetization/shared";
import { earningTypeLabel } from "@/lib/earningArt";

/**
 * Earning Management → Dashboard: what the Rewards Center paid out, per day
 * and per reward type, plus special events and top earners (worker
 * lib/earningAnalytics.ts). House accounts are excluded. CSV export of the
 * daily summary (up to 90 days) or every ledger row (up to 31 days).
 */
const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}><Icon size={18} className="text-white" /></div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export default function EarningDashboard() {
  const [range, setRange] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);
  const days = Number(range);
  const q = useQuery({ queryKey: ["earning-analytics", days], queryFn: () => api.earning.analytics(days) });
  const a: EarningAnalytics | undefined = q.data;

  const exportCsv = async (kind: "daily" | "ledger") => {
    setBusy(kind);
    try {
      const out = await api.earning.exportCsv(kind, kind === "ledger" ? Math.min(days, 31) : days);
      if (out.truncated) toast.warning(`Only the newest ${fmtNumber(out.rows ?? 0)} rows were exported. Choose a shorter range for the rest.`);
      else toast.success("CSV downloaded.");
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earning Dashboard"
        subtitle={a ? `${a.from} → ${a.to} (reward days). House accounts excluded.` : "Rewards Center payouts by day and type"}
        action={
          <>
            <button onClick={() => exportCsv("daily")} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-secondary disabled:opacity-50">
              <Download size={14} /> {busy === "daily" ? "Exporting…" : "Daily CSV"}
            </button>
            <button onClick={() => exportCsv("ledger")} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-secondary disabled:opacity-50" title="Every earning ledger row, up to 31 days">
              <Download size={14} /> {busy === "ledger" ? "Exporting…" : "Ledger CSV"}
            </button>
          </>
        }
      />
      <SegTabs tab={range} setTab={setRange} tabs={RANGES} />
      {days > 31 && <p className="text-xs text-muted-foreground -mt-2">Ledger CSV covers the last 31 days at most.</p>}

      {q.isError ? (
        <Notice tone="danger">{describeError(q.error)}</Notice>
      ) : q.isLoading || !a ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi icon={Gem} tone="bg-cyan-500" label="Diamonds earned" value={fmtNumber(a.totals.diamondsEarned)} sub={`${fmtNumber(a.totals.claims)} reward rows`} />
            <Kpi icon={RotateCcw} tone="bg-rose-500" label="Diamonds reversed" value={fmtNumber(a.totals.diamondsReversed)} sub="Referral clawbacks" />
            <Kpi icon={Coins} tone="bg-amber-500" label="DP coin won" value={fmtNumber(a.totals.dpcoinWon)} sub="Contest wins" />
            <Kpi icon={Zap} tone="bg-fuchsia-500" label="XP earned" value={fmtNumber(a.totals.xp)} sub={`${fmtNumber(a.totals.xpUsers)} users`} />
            <Kpi icon={Users} tone="bg-violet-500" label="Diamond earners" value={fmtNumber(a.totals.earners)} sub="Distinct users" />
          </div>

          <Card title="Per day" subtitle="Diamonds paid, reversed and DP coin won; XP on the second chart">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="diamonds" name="💎 Earned" fill="#06b6d4" />
                  <Bar dataKey="reversed" name="💎 Reversed" fill="#f43f5e" />
                  <Bar dataKey="dpcoin" name="🪙 DP won" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={a.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="xp" name="XP" stroke="#d946ef" dot={false} />
                  <Line type="monotone" dataKey="earners" name="Diamond earners" stroke="#8b5cf6" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div>
            <h3 className="font-bold text-foreground mb-2">By reward type</h3>
            <Table
              data={a.byType}
              keyFn={(r) => r.type}
              empty="No rewards in this range."
              columns={[
                { key: "type", header: "Reward", render: (r) => <span><span className="font-medium">{earningTypeLabel(r.type)}</span> <span className="text-xs text-muted-foreground font-mono">{r.type}</span></span> },
                { key: "count", header: "Rows", render: (r) => fmtNumber(r.count) },
                { key: "users", header: "User-days", render: (r) => fmtNumber(r.users) },
                { key: "diamonds", header: "💎 Diamonds", render: (r) => <span className={r.diamonds < 0 ? "text-rose-600" : ""}>{fmtNumber(r.diamonds)}</span> },
                { key: "dpcoin", header: "🪙 DP coin", render: (r) => fmtNumber(r.dpcoin) },
              ]}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-foreground">Special events</h3>
                <Link href="/earning-events" className="text-xs text-primary hover:underline">Manage events →</Link>
              </div>
              <Table
                data={a.events}
                keyFn={(r) => r.id}
                empty="No event claims in this range."
                columns={[
                  { key: "title", header: "Event", render: (r) => r.title },
                  { key: "participants", header: "Joined", render: (r) => fmtNumber(r.participants) },
                  { key: "claims", header: "Claims", render: (r) => fmtNumber(r.claims) },
                  { key: "diamonds", header: "💎 Paid", render: (r) => fmtNumber(r.diamonds) },
                ]}
              />
            </div>
            <div>
              <h3 className="font-bold text-foreground mb-2">Top earners (💎 from rewards)</h3>
              <Table
                data={a.topEarners}
                keyFn={(r) => r.uid}
                empty="No earners in this range."
                columns={[
                  { key: "rank", header: "#", render: (r) => r.rank },
                  { key: "user", header: "User", render: (r) => <span title={r.uid}>{r.fullName || r.username || r.uid}{r.username ? <span className="text-xs text-muted-foreground"> @{r.username}</span> : null}</span> },
                  { key: "diamonds", header: "💎", render: (r) => fmtNumber(r.diamonds) },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
