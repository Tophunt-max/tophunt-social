import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { fmtNumber } from "@/lib/format";
import { Button, Card, Notice, Num, inr, money } from "@/components/monetization/shared";

/**
 * Economy guardrails (worker lib/economyLimits.ts, `monetization.economy`) and
 * the economy health report (GET /admin/monetization/economy-health).
 */

type Guardrails = {
  contestPlatformFeePercent: number;
  dailyFreeDiamondCap: number;
  monthlyDpCoinWinCap: number;
  sameOpponentRewardsPerDay: number;
};

const ALERT_TEXT: Record<string, string> = {
  shop_cost_above_revenue: "Shop ka kharcha (₹) kamaai se zyada hai.",
  non_inr_ad_revenue_not_counted: "Kuch ad revenue INR mein nahi hai, isliye total mein nahi gina.",
  no_contest_fee: "Contest platform fee 0% hai: har jeet poora pot DP coin mein deti hai.",
  no_daily_free_cap: "Free Diamond ki daily limit band hai.",
  no_monthly_win_cap: "Mahine ki DP coin jeet limit band hai.",
  no_free_rewards_budget: "Free rewards budget link nahi hai (Budgets tab).",
};

export function EconomyHealthCard() {
  const { data } = useQuery({ queryKey: ["economy-health", 30], queryFn: () => api.monetization.economyHealth(30) });
  if (!data) return <Card title="Economy health (30 din)"><p className="text-sm text-muted-foreground">Loading…</p></Card>;
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between text-sm py-1 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
  return (
    <Card title="Economy health (30 din)" subtitle="Asli ₹ ka hisaab: shop products hi asli kharcha hai; ads aur sponsorship kamaai.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Row label="Active users" value={fmtNumber(data.activeUsers)} />
          <Row label="Kamaai: ads (INR)" value={inr(data.revenue.adsInr)} />
          <Row label="Kamaai: sponsored" value={inr(data.revenue.sponsoredInr)} />
          {data.revenue.adsByCurrency.filter((r: any) => r.currency !== "INR").map((r: any) => (
            <Row key={r.currency} label={`Ads (${r.currency})`} value={money(r.amount, r.currency)} />
          ))}
          <Row label={`Kharcha: shop (${fmtNumber(data.cost.shopOrders)} orders)`} value={inr(data.cost.shopInr)} />
          <Row label="Net" value={inr(data.netInr)} />
        </div>
        <div>
          <Row label="🪙 DP coin jeeta" value={`${fmtNumber(data.minted.dpCoinWon)} (≈ ${inr(data.minted.dpCoinWonInr)})`} />
          <Row label="💎 jeet limit se upar (Diamond diya)" value={fmtNumber(data.minted.winExcessAsDiamonds)} />
          <Row label="💎 free diye" value={fmtNumber(data.minted.freeDiamonds)} />
          <Row label="💎 platform fee rakha" value={fmtNumber(data.minted.platformFeeDiamonds)} />
          <Row label="Per active user: kharcha / kamaai" value={`${inr(data.perActiveUser.shopInr)} / ${inr(data.perActiveUser.revenueInr)}`} />
        </div>
      </div>
      {data.alerts.length > 0 && (
        <Notice tone="warning">
          {data.alerts.map((a: string) => (
            <div key={a}>• {ALERT_TEXT[a] ?? a}</div>
          ))}
        </Notice>
      )}
    </Card>
  );
}

export function EconomyGuardrailsCard() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const current: Guardrails | undefined = cfgQ.data?.effective?.economy;
  const [v, setV] = useState<Guardrails | null>(null);
  useEffect(() => {
    if (current && v === null) setV(current);
  }, [current, v]);
  const save = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { economy: v } }),
    onSuccess: () => {
      toast.success("Economy limits saved");
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
      qc.invalidateQueries({ queryKey: ["economy-health"] });
    },
    onError: (err) => toast.error(describeError(err)),
  });
  if (!v) return <Card title="Economy limits"><p className="text-sm text-muted-foreground">Loading…</p></Card>;
  const set = (k: keyof Guardrails) => (n: number) => setV({ ...v, [k]: n });
  return (
    <Card title="Economy limits" subtitle="Har limit: 0 = band. Naye claims / naye matches par turant lagti hai.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Num label="Contest platform fee (% of pot)" value={v.contestPlatformFeePercent} onChange={set("contestPlatformFeePercent")} min={0} max={90}
          hint="Paid contest ka prize = pot − fee. Promo (budget wale) aur product contests par nahi." />
        <Num label="Free 💎 per user per day" value={v.dailyFreeDiamondCap} onChange={set("dailyFreeDiamondCap")} min={0}
          hint="Check-in + tasks + ads + XP conversion milakar." />
        <Num label="🪙 DP coin jeet per user per month" value={v.monthlyDpCoinWinCap} onChange={set("monthlyDpCoinWinCap")} min={0}
          hint="Isse upar ka prize 💎 Diamond mein milta hai (shopping nahi, sirf contest)." />
        <Num label="Same opponent: rewarding matches per day" value={v.sameOpponentRewardsPerDay} onChange={set("sameOpponentRewardsPerDay")} min={0}
          hint="Isse zyada: prize milta hai, par XP aur monthly win nahi." />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save limits</Button>
      </div>
    </Card>
  );
}
