import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, fmtDateTime, fmtNumber } from "@/lib/format";
import { Download, Search } from "lucide-react";

export default function Transactions() {
  const [type, setType] = useState("");
  const [uid, setUid] = useState("");
  const [uidInput, setUidInput] = useState("");

  const types = useQuery({ queryKey: ["txn-types"], queryFn: api.transactionTypes });
  const { data = [], isLoading } = useQuery({
    queryKey: ["transactions", type, uid],
    queryFn: () => api.transactions({ type: type || undefined, uid: uid || undefined, limit: 300 }),
  });

  const exportCsv = () => {
    // amount = total change; lockedDelta = its Diamond part; the rest is DP coin.
    const header = ["id", "uid", "username", "amount", "dpCoin", "diamond", "type", "description", "createdAt"];
    const rows = data.map((t: any) => {
      const d = Number(t.lockedDelta || 0);
      return [t.id, t.uid, t.username || "", t.amount, Number(t.amount || 0) - d, d, t.type, (t.description || "").replace(/,/g, " "), t.createdAt].join(",");
    });
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const field = "px-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <PageHeader title="Transactions" subtitle="DP coin aur Diamond ledger" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(types.data ?? []).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={uidInput}
            onChange={(e) => setUidInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setUid(uidInput.trim())}
            placeholder="Filter by user ID…"
            className={`${field} pl-9 w-56`}
          />
        </div>
        <button onClick={() => setUid(uidInput.trim())} className="px-4 py-2 rounded-xl bg-secondary text-sm font-medium">Apply</button>
        {uid && (
          <button onClick={() => { setUid(""); setUidInput(""); }} className="px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">Clear</button>
        )}
        <button onClick={exportCsv} className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-sm font-medium hover:bg-secondary/70">
          <Download size={15} /> Export CSV
        </button>
      </div>

      <Table
        loading={isLoading}
        data={data}
        keyFn={(t: any) => t.id}
        empty="No transactions found"
        columns={[
          {
            key: "user",
            header: "User",
            render: (t: any) => (
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{t.fullName || t.username || "Unknown"}</p>
                <p className="text-xs text-muted-foreground truncate">{t.uid}</p>
              </div>
            ),
          },
          {
            key: "amount",
            header: "Amount",
            // Split into DP coin and Diamond (lockedDelta is the Diamond part).
            render: (t: any) => {
              const d = Number(t.lockedDelta || 0);
              const c = Number(t.amount || 0) - d;
              const fmt = (n: number) => `${n >= 0 ? "+" : ""}${fmtNumber(n)}`;
              return (
                <span className="font-bold whitespace-nowrap">
                  {c ? <span className={c >= 0 ? "text-green-600" : "text-red-600"}>{fmt(c)} 🪙</span> : null}
                  {c && d ? " " : null}
                  {d ? <span className={d >= 0 ? "text-cyan-700" : "text-red-600"}>{fmt(d)} 💎</span> : null}
                  {!c && !d ? "0" : null}
                </span>
              );
            },
          },
          { key: "type", header: "Type", render: (t: any) => <Badge variant={t.amount >= 0 ? "success" : "danger"}>{t.type}</Badge> },
          { key: "desc", header: "Description", render: (t: any) => <span className="text-muted-foreground">{t.description || "—"}</span> },
          { key: "date", header: "Date", render: (t: any) => <span className="text-muted-foreground">{fmtDateTime(t.createdAt)}</span> },
        ]}
      />
    </div>
  );
}
