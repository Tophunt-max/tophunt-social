import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Button, Card, Notice, Num, Text, Toggle, field, inr } from "@/components/monetization/shared";

/**
 * Coin Economy cards for the closed-loop economy:
 *   Earning (free) → 💎 Diamond → contests → 🪙 DP coin → Shopping.
 * No ₹ comes in, no ₹ goes out. ₹ values here are what a coin is WORTH, used to
 * price shop products and to report what the platform has given away.
 */

/** ₹ per DP coin and ₹ per Diamond (appConfig.coinPricing.dpCoinInr / diamondInr). */
export function CoinValuesCard({ data, pending, onSave }: { data: any; pending: boolean; onSave: (p: any) => void }) {
  const stored = data?.coinPricing ?? {};
  const legacy = Number(data?.withdrawal?.conversionRate ?? 1) || 1;
  const [dp, setDp] = useState(String(stored.dpCoinInr ?? legacy));
  const [dia, setDia] = useState(String(stored.diamondInr ?? stored.buyRate ?? legacy));
  const dpN = Number(dp);
  const diaN = Number(dia);
  const valid = dpN > 0 && diaN > 0;
  return (
    <Card title="Coin value (₹)" subtitle="What one coin is worth. Users never pay or receive ₹ for coins.">
      <div className="grid grid-cols-2 gap-3">
        <Text label="🪙 1 DP coin = ₹" value={dp} onChange={setDp} hint="Shop prices: DP coin = ₹ price ÷ this, rounded up." />
        <Text label="💎 1 Diamond = ₹" value={dia} onChange={setDia} hint="Only for reports: the ₹ value of Diamonds given away." />
      </div>
      {valid && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Example: a ₹499 product costs {fmtNumber(Math.ceil(499 / dpN - 1e-9))} DP coin.</p>
          <p>100 Diamonds given as rewards are worth {inr(100 * diaN)}.</p>
        </div>
      )}
      <Notice>Changing a value re-prices NEW shop orders only. Every order keeps the rate it was placed at.</Notice>
      <div className="flex justify-end">
        <Button disabled={!valid || pending} onClick={() => onSave({ coinPricing: { dpCoinInr: dpN, diamondInr: diaN } })}>Save values</Button>
      </div>
    </Card>
  );
}

/** XP → Diamond conversion (appConfig.monetization.earning.xpConversion). */
export function XpConversionCard() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (cfgQ.data && !f) setF(structuredClone(cfgQ.data.effective.earning.xpConversion));
  }, [cfgQ.data, f]);
  const save = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { earning: { xpConversion: f } } }),
    onSuccess: () => {
      toast.success("XP conversion saved");
      setF(null);
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });
  if (!f) return <Card title="XP → Diamond"><p className="text-sm text-muted-foreground">Loading…</p></Card>;
  return (
    <Card title="XP → Diamond conversion" subtitle="Users turn XP into Diamonds. Their XP and level do not go down.">
      <Toggle label="Conversion enabled" checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Num label="XP for 1 Diamond" value={f.xpPerDiamond} onChange={(v) => setF({ ...f, xpPerDiamond: v })} />
        <Num label="Max Diamonds per user per day" value={f.maxDiamondsPerDay} onChange={(v) => setF({ ...f, maxDiamondsPerDay: v })} />
      </div>
      <p className="text-xs text-muted-foreground">Paid from the free-rewards budget (Earn tab), like daily check-in and tasks.</p>
      <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></div>
    </Card>
  );
}

/** What users hold, valued in ₹, and what the shop has delivered. */
export function ShoppingSummaryCard() {
  const eco = useQuery({ queryKey: ["coin-economy"], queryFn: () => api.coinEconomy() });
  const orders = useQuery({ queryKey: ["shop-orders", ""], queryFn: () => api.monetization.shopOrders() });
  const e = eco.data as any;
  const c = orders.data?.counts ?? {};
  const open = (c.placed ?? 0) + (c.packed ?? 0) + (c.shipped ?? 0) + (c.return_requested ?? 0);
  return (
    <Card title="DP coin and shopping" subtitle="DP coin is won in contests and can only be spent on gifts, the digital store and the shop.">
      {e ? (
        <div className="space-y-1 text-sm">
          <Row label="🪙 DP coin held by users" value={fmtNumber(e.supply.withdrawable)} />
          <Row label="Worth in shop goods (₹)" value={inr(e.supply.liabilityInr)} strong />
          <Row label="💎 Diamonds held by users" value={fmtNumber(e.supply.locked)} />
          <Row label="Diamond value (₹, reporting)" value={inr(e.supply.diamondValueInr ?? 0)} />
          <Row label="Open shop orders" value={fmtNumber(open)} />
          <Row label="Delivered orders" value={fmtNumber(c.delivered ?? 0)} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      <a href="/shopping" className="text-sm font-semibold text-primary">Manage products and orders →</a>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

const newResetId = () => `reset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Fresh start: reject open withdrawals (DP coin returned first), then set
 * balances to zero through ledger rows. Superadmin, approval password and a
 * typed phrase. Runs in chunks until done.
 */
export function EconomyResetPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["economy-reset"], queryFn: api.monetization.resetPreview });
  const [dp, setDp] = useState(true);
  const [dia, setDia] = useState(true);
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const p = q.data?.preview;
  const isSuper = user?.role === "superadmin";

  const run = async () => {
    const resetId = newResetId();
    setRunning(true);
    try {
      for (let i = 0; i < 500; i++) {
        const r = await api.monetization.runReset({ resetId, resetDpCoin: dp, resetDiamonds: dia, reason, confirm: phrase, approvalPassword: password });
        setProgress(`Withdrawals rejected: ${r.withdrawalsRejected} · users reset this step: ${r.usersReset} · remaining: ${r.remaining < 0 ? "…" : r.remaining}`);
        if (r.done) break;
      }
      toast.success("Economy reset complete");
      setPhrase("");
      setPassword("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Fresh start (economy reset)" subtitle="Rejects every open withdrawal (held DP coin is returned first), then sets the chosen balances to zero.">
        <Notice tone="danger">
          This removes coins from every user. DP coin was withdrawable before, so check with your CA or lawyer, take a D1 backup, and tell users before you run it. Each removed balance is kept as an <code>economy_reset</code> ledger row, so it can be traced and, if ever needed, restored.
        </Notice>
        {p ? (
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <Row label="Users with a balance" value={fmtNumber(p.usersWithBalance)} />
            <Row label="🪙 DP coin in total" value={fmtNumber(p.dpCoinTotal)} />
            <Row label="💎 Diamonds in total" value={fmtNumber(p.diamondTotal)} />
            <Row label="Open withdrawals" value={`${fmtNumber(p.openWithdrawals)} (${fmtNumber(p.openWithdrawalCoins)} DP coin)`} />
            <Row label="Pending manual deposits" value={fmtNumber(p.pendingDeposits)} strong />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {p?.pendingDeposits > 0 && (
          <Notice tone="warning">Resolve the pending deposits first (Deposits page). Those users paid real money: reject and refund them, or approve them.</Notice>
        )}
        {!isSuper ? (
          <Notice tone="warning">Only a superadmin can run the reset.</Notice>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-6">
              <Toggle label="Reset 🪙 DP coin" checked={dp} onChange={setDp} />
              <Toggle label="Reset 💎 Diamonds" checked={dia} onChange={setDia} />
            </div>
            <Text label="Reason (kept in the ledger and audit log)" value={reason} onChange={setReason} placeholder="Withdrawals retired, fresh start" />
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1 block">Approval password</span>
              <input type="password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <Text label={`Type "${p?.confirmPhrase ?? "RESET ECONOMY"}" to confirm`} value={phrase} onChange={setPhrase} />
            <div className="flex justify-end">
              <Button
                variant="danger"
                disabled={running || !p || p.pendingDeposits > 0 || (!dp && !dia) || reason.trim().length < 3 || phrase !== p?.confirmPhrase}
                onClick={() => void run()}
              >
                {running ? "Resetting…" : "Run reset"}
              </Button>
            </div>
            {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
          </div>
        )}
      </Card>

      <Card title="Past resets">
        {(q.data?.history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {q.data.history.map((h: any) => (
              <div key={h.id} className="rounded-xl border border-border p-3">
                <p className="font-semibold">{fmtDateTime(h.created_at)} · {h.completed_at ? "completed" : "in progress"}</p>
                <p className="text-muted-foreground">
                  {h.reason} · users {fmtNumber(h.users_reset)} · DP coin removed {fmtNumber(h.dp_coin_removed)} · Diamonds removed {fmtNumber(h.diamonds_removed)} · withdrawals rejected {fmtNumber(h.withdrawals_rejected)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
