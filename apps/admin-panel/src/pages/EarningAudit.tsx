import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api, describeError, type EarningAuditRow } from "@/lib/api";
import { PageHeader, fmtDateTime } from "@/lib/format";
import { useTabParam } from "@/lib/useTabParam";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { SegTabs } from "@/components/finance/bits";
import { Notice } from "@/components/monetization/shared";

/**
 * Earning Management → Audit & Alerts.
 *  - Audit: admin actions that change what users earn or reverse it (events,
 *    artwork, gamification, referrals, budgets, wallet adjustments, reward
 *    settings, CSV exports), newest first, paged.
 *  - Alerts: admin notifications that point at an earning page (budget 80%+,
 *    event budget 80%+, heavy free-coin earners, signup bonus reviews).
 */
const TABS = [
  { key: "audit", label: "Audit trail" },
  { key: "alerts", label: "Alerts" },
];
const TAB_KEYS = TABS.map((t) => t.key);

function tone(action: string): any {
  if (/reverse|clawback|reset|delete|revoke|reject/.test(action)) return "danger";
  if (/create|upload|grant|approve/.test(action)) return "active";
  if (/export/.test(action)) return "info";
  return undefined;
}

function summary(detail: unknown): string {
  if (!detail || typeof detail !== "object") return detail ? String(detail) : "";
  const d = detail as Record<string, unknown>;
  if ("before" in d || "after" in d) {
    const s = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
    return `${s(d.before)} → ${s(d.after)}`.slice(0, 220);
  }
  return JSON.stringify(d).slice(0, 220);
}

function AuditTab() {
  const q = useInfiniteQuery({
    queryKey: ["earning-audit"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.earning.audit(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows: EarningAuditRow[] = (q.data?.pages ?? []).flatMap((p) => p.items);
  if (q.isError) return <Notice tone="danger">{describeError(q.error)}</Notice>;
  return (
    <div className="space-y-3">
      <Table
        data={rows}
        loading={q.isLoading}
        keyFn={(r) => r.id}
        empty="No earning admin actions yet."
        columns={[
          { key: "when", header: "When", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
          { key: "who", header: "Admin", render: (r) => <span className="text-xs">{r.adminEmail || r.adminUid || "server"}</span> },
          { key: "action", header: "Action", render: (r) => <Badge variant={tone(r.action)}>{r.action}</Badge> },
          { key: "target", header: "Target", render: (r) => <span className="text-xs font-mono">{[r.targetType, r.targetId].filter(Boolean).join(": ")}</span> },
          { key: "detail", header: "Detail", render: (r) => <span className="text-xs text-muted-foreground break-all">{summary(r.detail)}</span> },
        ]}
      />
      {q.hasNextPage ? (
        <button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary disabled:opacity-50">
          {q.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

function AlertsTab() {
  const q = useQuery({ queryKey: ["earning-notifications"], queryFn: api.earning.notifications, refetchInterval: 60_000 });
  if (q.isError) return <Notice tone="danger">{describeError(q.error)}</Notice>;
  return (
    <Table
      data={q.data ?? []}
      loading={q.isLoading}
      keyFn={(r) => r.id}
      empty="No earning alerts. Budgets, event budgets and heavy earners are checked every 6 hours."
      columns={[
        { key: "when", header: "When", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
        { key: "title", header: "Alert", render: (r) => <span className={r.read ? "" : "font-semibold"}>{r.title}</span> },
        { key: "message", header: "Message", render: (r) => <span className="text-xs text-muted-foreground">{r.message}</span> },
        { key: "link", header: "", render: (r) => (r.link ? <Link href={r.link} className="text-xs text-primary hover:underline whitespace-nowrap">Open →</Link> : null) },
      ]}
    />
  );
}

export default function EarningAudit() {
  const [tab, setTab] = useTabParam(TAB_KEYS, "audit");
  return (
    <div>
      <PageHeader title="Earning Audit & Alerts" subtitle="Who changed earning settings, and the alerts the earning checks raised" />
      <SegTabs tab={tab} setTab={setTab} tabs={TABS} />
      {tab === "audit" ? <AuditTab /> : <AlertsTab />}
    </div>
  );
}
