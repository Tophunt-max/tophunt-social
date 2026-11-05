import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button, Card, Notice, Num, Toggle, inr } from "@/components/monetization/shared";

/**
 * Shop → Settings cards: the open / closed switches, the monthly spend limit.
 * These are the only place each switch is edited (Products and Digital Items
 * show the state read-only), so two forms can never hold different copies.
 */

/** Physical shop and digital store switches; Virtual Gifts are switched with their own rules (Shop → Virtual Gifts). */
export function ShopSwitchesCard() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const e = cfgQ.data?.effective;
  const save = useMutation({
    mutationFn: (patch: any) => api.saveAppSettings({ monetization: patch }),
    onSuccess: () => {
      toast.success("Saved. Apps pick it up within a minute.");
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (err) => toast.error(describeError(err)),
  });
  if (!e) return <Card title="Shop open / closed"><p className="text-sm text-muted-foreground">Loading…</p></Card>;
  return (
    <Card title="Shop open / closed" subtitle="Each switch takes effect for the next purchase. Closed: the app shows “jaldi aa raha hai” instead of the tab.">
      <Toggle label="🛍️ Physical shop open" checked={e.shop.enabled} onChange={(v) => save.mutate({ shop: { enabled: v } })} />
      <Toggle label="✨ Digital store open (frames, themes, badges, titles…)" checked={e.store.enabled} onChange={(v) => save.mutate({ store: { enabled: v } })} />
      <div className="flex items-center justify-between gap-3 text-sm pt-1">
        <span>🎁 Virtual gifts <Badge variant={e.gifts.enabled ? "active" : "default"}>{e.gifts.enabled ? "on" : "off"}</Badge></span>
        <Link href="/shop/gifts" className="text-xs font-semibold text-primary">Gift rules →</Link>
      </div>
    </Card>
  );
}

/**
 * The spend limit. Only physical products cost the platform real money, so the
 * ₹ value of shop orders per calendar month is capped (0 = no limit).
 */
export function ShopBudgetCard() {
  const qc = useQueryClient();
  const coins = useQuery({ queryKey: ["monetization-coins", 30], queryFn: () => api.monetization.coins(30) });
  const meter: { monthlyBudgetInr: number; spentThisMonthInr: number } | undefined = coins.data?.shopBudget;
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    if (meter && v === null) setV(meter.monthlyBudgetInr);
  }, [meter, v]);
  const save = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { shop: { monthlyBudgetInr: Number(v) } } }),
    onSuccess: () => {
      toast.success("Monthly shop budget saved");
      qc.invalidateQueries({ queryKey: ["monetization-coins"] });
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (err) => toast.error(describeError(err)),
  });
  const budget = meter?.monthlyBudgetInr ?? 0;
  const spent = meter?.spentThisMonthInr ?? 0;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  return (
    <Card title="Kharche ki limit: shop ka mahine ka budget (₹)" subtitle="Physical products are the only real cost. Orders are refused once this month's ₹ value would pass the budget.">
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Is mahine: {inr(spent)}</span>
          <span className="text-muted-foreground">{budget > 0 ? `of ${inr(budget)}` : "no limit"}</span>
        </div>
        {budget > 0 && (
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className={`h-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <Num label="Monthly budget (₹, 0 = no limit)" value={v ?? 0} onChange={setV} />
      <Notice>Cancelled and returned orders give their share of the budget back. Digital items and gifts don&apos;t count: they cost nothing to deliver.</Notice>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || v === null}>Save budget</Button>
      </div>
    </Card>
  );
}

/** Read-only open / closed pill for a page header, linking to the one place the switch is edited. */
export function ShopStatusPill({ kind }: { kind: "shop" | "store" }) {
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const e = cfgQ.data?.effective;
  if (!e) return null;
  const on = kind === "shop" ? !!e.shop.enabled : !!e.store.enabled;
  return (
    <Link href="/shop/settings" className="inline-flex items-center gap-2 text-xs font-semibold">
      <Badge variant={on ? "active" : "default"}>{kind === "shop" ? "Shop" : "Store"} {on ? "open" : "closed"}</Badge>
      <span className="text-primary">Change in Settings →</span>
    </Link>
  );
}
