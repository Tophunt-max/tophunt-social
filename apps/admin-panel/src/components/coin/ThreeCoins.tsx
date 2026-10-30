import { ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { fmtNumber } from "@/lib/format";
import { Table } from "@/components/ui/Table";
import { Button, Card, Notice, Num, Toggle, inr } from "@/components/monetization/shared";
import { XpConversionCard } from "@/components/coin/ClosedLoopCards";
import { FraudRulesTab } from "@/components/shop/FraudRulesTab";

/**
 * Coin Economy around the three coins (worker GET /admin/monetization/coins):
 *
 *   ⚡ XP  ──convert──▶  💎 Diamond  ──contest entry──▶  win  ──▶  🪙 DP coin  ──▶  Shopping
 *
 * XP is earned by playing and never goes down. Diamonds are earned free and only
 * pay contest entries. DP coin is only won, and only spent: gifts, digital items
 * and physical products. No ₹ comes in or goes out.
 */

const TYPE_LABEL: Record<string, string> = {
  daily_reward: "Daily check-in",
  daily_task: "Daily tasks",
  referral_bonus: "Referral",
  verification_bonus: "Verification",
  signup_bonus: "Signup",
  ad_reward: "Rewarded ads",
  gamification_reward: "Level / season",
  monthly_hall_of_fame_reward: "Hall of Fame",
  xp_conversion: "XP → Diamond",
  admin_adjustment: "Admin adjustment",
  gift_send: "Gifts",
  store_purchase: "Digital items",
  shop_order: "Physical shop",
};

export function useCoins(days = 30) {
  return useQuery({ queryKey: ["monetization-coins", days], queryFn: () => api.monetization.coins(days) });
}

function Big({ emoji, title, value, sub, tone }: { emoji: string; title: string; value: string; sub: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-4 text-white ${tone}`}>
      <p className="text-sm font-semibold opacity-90">{emoji} {title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs opacity-90 mt-1">{sub}</p>
    </div>
  );
}

const Arrow = ({ label }: { label: string }) => (
  <div className="hidden lg:flex flex-col items-center justify-center text-xs text-muted-foreground">
    <span className="text-xl">→</span>
    <span>{label}</span>
  </div>
);

/** The loop at a glance: what users hold of each coin and how it moves. */
export function CoinsLoop() {
  const { data, isLoading } = useCoins(30);
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Big emoji="⚡" title="XP" value={fmtNumber(data.xp.convertible)} sub={`convertible · ${fmtNumber(data.xp.total)} earned in total`} tone="bg-gradient-to-br from-amber-500 to-orange-500" />
        <Arrow label={data.xp.conversion.enabled ? `${data.xp.conversion.xpPerDiamond} XP = 1 💎` : "conversion off"} />
        <Big emoji="💎" title="Diamond" value={fmtNumber(data.diamond.supply)} sub={`held by ${fmtNumber(data.diamond.holders)} users · contest entry only`} tone="bg-gradient-to-br from-cyan-500 to-blue-500" />
        <Arrow label="contest win" />
        <Big emoji="🪙" title="DP coin" value={fmtNumber(data.dpCoin.supply)} sub={`≈ ${inr(data.dpCoin.valueInr)} of goods · shopping only`} tone="bg-gradient-to-br from-violet-500 to-fuchsia-500" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4 text-sm">
        <Mini label="💎 earned (30 din)" value={fmtNumber(data.diamond.earnedTotal)} />
        <Mini label="💎 spent on contest entry (30 din)" value={fmtNumber(data.diamond.contestEntries.diamonds)} />
        <Mini label="🪙 won in contests (30 din)" value={fmtNumber(data.dpCoin.won.dpCoin)} />
        <Mini label="🪙 spent shopping (30 din)" value={fmtNumber(data.dpCoin.spentTotal)} />
      </div>
    </div>
  );
}

const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-card p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-bold text-foreground">{value}</p>
  </div>
);

// ─── ⚡ XP ───────────────────────────────────────────────────────────────────

export function XpTab() {
  const { data } = useCoins(30);
  return (
    <div className="space-y-6">
      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Mini label="XP earned (all users)" value={fmtNumber(data.xp.total)} />
          <Mini label="XP already converted" value={fmtNumber(data.xp.converted)} />
          <Mini label="XP still convertible" value={fmtNumber(data.xp.convertible)} />
          <Mini label="Conversions (30 din)" value={`${fmtNumber(data.xp.period.conversions)} → ${fmtNumber(data.xp.period.diamonds)} 💎`} />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <XpConversionCard />
        <Card title="XP kaise milta hai" subtitle="XP comes from playing: votes, contests, wins, daily activity. Levels and the XP rules are in Gamification.">
          <p className="text-sm text-muted-foreground">
            Converting never lowers a user&apos;s XP, level or leaderboard rank: TopHunt tracks the converted part separately.
          </p>
          <Link href="/gamification" className="text-sm font-semibold text-primary">XP rules and levels → Gamification</Link>
        </Card>
      </div>
    </div>
  );
}

// ─── 💎 Diamond ──────────────────────────────────────────────────────────────

/** Diamond report + every earning setting (passed in as `children`) + contests. */
export function DiamondTab({ children, contests }: { children: ReactNode; contests: ReactNode }) {
  const { data } = useCoins(30);
  return (
    <div className="space-y-6">
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="💎 held by users" value={fmtNumber(data.diamond.supply)} />
            <Mini label="💎 earned (30 din)" value={fmtNumber(data.diamond.earnedTotal)} />
            <Mini label="💎 spent on contest entry (30 din)" value={`${fmtNumber(data.diamond.contestEntries.diamonds)} (${fmtNumber(data.diamond.contestEntries.count)} entries)`} />
            <Mini label="Value given away (reporting)" value={`${inr(data.diamond.earnedTotal * data.values.diamondInr)} at ₹${data.values.diamondInr}/💎`} />
          </div>
          <Card title="Diamond kahan se aaye (30 din)" subtitle="Diamonds are only earned. They can't be bought and can't become DP coin.">
            <Table
              data={data.diamond.earned}
              keyFn={(r: any) => r.type}
              empty="No Diamonds earned in this period."
              columns={[
                { key: "t", header: "Source", render: (r: any) => TYPE_LABEL[r.type] ?? r.type },
                { key: "n", header: "Claims", render: (r: any) => fmtNumber(r.count) },
                { key: "d", header: "💎 Diamonds", render: (r: any) => fmtNumber(r.diamonds) },
              ]}
            />
          </Card>
        </>
      )}
      <div>
        <p className="font-bold text-foreground mb-3">Earning settings (sab Diamond dete hain)</p>
        {children}
      </div>
      <div>
        <p className="font-bold text-foreground mb-3">Contests: 💎 entry → 🪙 prize</p>
        {contests}
      </div>
    </div>
  );
}

// ─── 🪙 DP coin ──────────────────────────────────────────────────────────────

export function DpCoinTab() {
  const { data } = useCoins(30);
  return (
    <div className="space-y-6">
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label="🪙 held by users" value={`${fmtNumber(data.dpCoin.supply)} (≈ ${inr(data.dpCoin.valueInr)})`} />
            <Mini label="🪙 won in contests (30 din)" value={`${fmtNumber(data.dpCoin.won.dpCoin)} (${fmtNumber(data.dpCoin.won.count)} wins)`} />
            <Mini label="🪙 spent shopping (30 din)" value={fmtNumber(data.dpCoin.spentTotal)} />
            <Mini label="🪙 refunded (30 din)" value={fmtNumber(data.dpCoin.refunded)} />
          </div>
          <Card title="DP coin kahan kharch hua (30 din)" subtitle="DP coin only comes from winning contests and is only spent here.">
            <Table
              data={data.dpCoin.spent}
              keyFn={(r: any) => r.type}
              empty="No DP coin spent in this period."
              columns={[
                { key: "t", header: "Where", render: (r: any) => TYPE_LABEL[r.type] ?? r.type },
                { key: "n", header: "Purchases", render: (r: any) => fmtNumber(r.count) },
                { key: "c", header: "🪙 DP coin", render: (r: any) => fmtNumber(r.dpCoin) },
                { key: "v", header: "≈ ₹", render: (r: any) => inr(r.dpCoin * data.values.dpCoinInr) },
              ]}
            />
          </Card>
        </>
      )}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <ShoppingSwitches />
        <ShopBudgetCard meter={data?.shopBudget} />
      </div>
      <div>
        <p className="font-bold text-foreground mb-3">Shop fraud rules</p>
        <FraudRulesTab />
      </div>
      <p className="text-sm">
        Products, orders and the digital catalogue: <Link href="/shopping" className="font-semibold text-primary">Shopping →</Link> · Gift
        catalogue: <Link href="/monetization?tab=gifts" className="font-semibold text-primary">Monetization → Gifts →</Link>
      </p>
    </div>
  );
}

/** Where DP coin can be spent: physical shop, digital items, gifts. */
function ShoppingSwitches() {
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
  if (!e) return <Card title="DP coin kahan kharch ho sakta hai"><p className="text-sm text-muted-foreground">Loading…</p></Card>;
  return (
    <Card title="DP coin kahan kharch ho sakta hai" subtitle="Each switch takes effect for the next purchase.">
      <Toggle label="🛍️ Physical shop open" checked={e.shop.enabled} onChange={(v) => save.mutate({ shop: { enabled: v } })} />
      <Toggle label="✨ Digital items (frames, themes, badges)" checked={e.store.enabled} onChange={(v) => save.mutate({ store: { enabled: v } })} />
      <Toggle label="🎁 Virtual gifts" checked={e.gifts.enabled} onChange={(v) => save.mutate({ gifts: { enabled: v } })} />
    </Card>
  );
}

/**
 * The spend limit. Only physical products cost the platform real money, so the
 * ₹ value of shop orders per calendar month is capped (0 = no limit).
 */
function ShopBudgetCard({ meter }: { meter?: { monthlyBudgetInr: number; spentThisMonthInr: number } }) {
  const qc = useQueryClient();
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
