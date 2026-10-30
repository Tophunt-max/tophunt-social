import { useQuery } from "@tanstack/react-query";
import { BarChart3, Gift, Megaphone, ShoppingBag, Wallet, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { fmtNumber } from "@/lib/format";
import { Card, Notice, inr, money, type Range } from "./shared";

export function OverviewTab({ range }: { range: Range }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["monetization-overview", range.from, range.to],
    queryFn: () => api.monetization.overview(range.from, range.to),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <Notice tone="danger">{(error as any)?.message || "Could not load the overview."}</Notice>;

  const finalized = data.adNetwork.filter((r: any) => r.status === "finalized");
  const estimated = data.adNetwork.filter((r: any) => r.status === "estimated");
  const fillRate = data.adDiagnostics.requests ? Math.round((data.adDiagnostics.fills / data.adDiagnostics.requests) * 1000) / 10 : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Wallet} label="Coin sales (gross, Razorpay)" value={inr(data.coinSales.grossInr)} gradient="gradient-purple" />
        <StatCard icon={Undo2} label="Coin sales refunded" value={inr(data.coinSales.refundedInr)} gradient="bg-slate-500" />
        <StatCard icon={Megaphone} label="Sponsorships booked" value={inr(data.sponsorships.bookedInr)} gradient="bg-amber-500" />
        <StatCard icon={Gift} label="Coins spent on gifts" value={fmtNumber(data.gifts.coins)} gradient="bg-pink-500" />
        <StatCard icon={ShoppingBag} label="Coins spent in store" value={fmtNumber(data.store.coins)} gradient="bg-emerald-500" />
        <StatCard icon={BarChart3} label="Ad fill rate (app-reported)" value={fillRate === null ? "–" : `${fillRate}%`} gradient="bg-blue-500" />
      </div>

      <Card title="Ad network revenue" subtitle="From imported provider reports only. Estimated rows can still change; finalized rows are what the network will pay.">
        {data.adNetwork.length === 0 ? (
          <Notice tone="warning">No provider report imported for this period. No ad revenue is shown until one is imported (Ads tab).</Notice>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-xs text-green-700 font-semibold">Finalized</p>
              {finalized.length ? finalized.map((r: any) => <p key={r.currency} className="font-bold">{money(r.revenue, r.currency)} · {fmtNumber(r.impressions)} impressions</p>) : <p>–</p>}
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-xs text-amber-700 font-semibold">Estimated (not final)</p>
              {estimated.length ? estimated.map((r: any) => <p key={r.currency} className="font-bold">{money(r.revenue, r.currency)} · {fmtNumber(r.impressions)} impressions</p>) : <p>–</p>}
            </div>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Gifts" subtitle="Coins burned from senders. Recipients get no coins or cash.">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Sends</dt><dd className="font-semibold">{fmtNumber(data.gifts.sends)}</dd>
            <dt className="text-muted-foreground">Of which Diamonds</dt><dd className="font-semibold">{fmtNumber(data.gifts.diamonds)}</dd>
            <dt className="text-muted-foreground">Unique senders</dt><dd className="font-semibold">{fmtNumber(data.gifts.senders)}</dd>
            <dt className="text-muted-foreground">Unique recipients</dt><dd className="font-semibold">{fmtNumber(data.gifts.recipients)}</dd>
          </dl>
        </Card>
        <Card title="Store and sponsorships">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Store purchases</dt><dd className="font-semibold">{fmtNumber(data.store.purchases)}</dd>
            <dt className="text-muted-foreground">Store refunds</dt><dd className="font-semibold">{fmtNumber(data.store.refunds)} ({fmtNumber(data.store.refundedCoins)} coins)</dd>
            <dt className="text-muted-foreground">Campaigns running in range</dt><dd className="font-semibold">{fmtNumber(data.sponsorships.campaigns)}</dd>
            <dt className="text-muted-foreground">Booked with payment ref</dt><dd className="font-semibold">{inr(data.sponsorships.withPaymentRefInr)}</dd>
          </dl>
        </Card>
      </div>

      <Notice>
        Coin spends (gifts, store) are not new cash: the cash came in when coins were bought. Wallet liabilities, ledger health and manual deposits are in Coin Economy. Sponsorship &quot;booked&quot; is contract value, not cash collected. {data.coinSales.note}
      </Notice>
    </div>
  );
}
