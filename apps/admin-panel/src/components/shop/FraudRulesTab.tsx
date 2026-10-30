import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button, Card, Notice, Num, Toggle } from "@/components/monetization/shared";

/** Shop fraud rules (appConfig.monetization.shop.fraud, worker lib/shopRisk.ts). */
export function FraudRulesTab() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (cfgQ.data && !f) setF(structuredClone(cfgQ.data.effective.shop.fraud));
  }, [cfgQ.data, f]);
  const save = useMutation({
    mutationFn: () => api.saveAppSettings({ monetization: { shop: { fraud: f } } }),
    onSuccess: () => {
      toast.success("Fraud rules saved. They apply to the next order.");
      setF(null);
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e) => toast.error(describeError(e)),
  });
  if (!f) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <Card title="Hard rules" subtitle="The order is refused, and the customer is told why. Checked again inside the checkout, so racing orders can't slip past.">
        <Toggle label="Mobile number must be verified" checked={f.requireVerifiedPhone} onChange={(v) => set("requireVerifiedPhone", v)} hint="One verified phone per account makes fake accounts expensive." />
        <div className="grid grid-cols-2 gap-3">
          <Num label="Minimum account age (days)" value={f.minAccountAgeDays} onChange={(v) => set("minAccountAgeDays", v)} hint="0 = off" />
          <Num label="Orders per account in 30 days" value={f.maxOrdersPer30Days} onChange={(v) => set("maxOrdersPer30Days", v)} />
          <Num label="DP coin per account in 30 days" value={f.maxCoinsPer30Days} onChange={(v) => set("maxCoinsPer30Days", v)} />
          <Num label="Accounts per address / phone (90 days)" value={f.maxAccountsPerAddress} onChange={(v) => set("maxAccountsPerAddress", v)} hint="2 lets a family share one address." />
        </div>
      </Card>
      <Card title="Review holds" subtitle="Weak signals never refuse an order. The DP coin and stock are held, and you approve or reject before packing.">
        <Toggle label="Review every account's first order" checked={f.reviewFirstOrder} onChange={(v) => set("reviewFirstOrder", v)} />
        <Num label="Review orders at or above (DP coin)" value={f.reviewAboveCoins} onChange={(v) => set("reviewAboveCoins", v)} hint="0 = off" />
        <Notice>
          Always flagged for review as well: another account on the same device, an address or phone another account has used, an account younger than 7 days, and accounts that won most of their contests against one opponent (possible collusion).
        </Notice>
      </Card>
      <div className="lg:col-span-2 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save fraud rules</Button>
      </div>
    </div>
  );
}
