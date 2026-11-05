import { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { Table } from "@/components/ui/Table";
import { Card, inr } from "@/components/monetization/shared";

/**
 * Coin Economy around the three coins (worker GET /admin/monetization/coins):
 *
 *   ⚡ XP  ──convert──▶  💎 Diamond  ──contest entry──▶  win  ──▶  🪙 DP coin  ──▶  Shop
 *
 * XP is earned by playing and never goes down. Diamonds are earned free and only
 * pay contest entries. DP coin is only won, and only spent: gifts, digital items
 * and physical products. No ₹ comes in or goes out.
 *
 * These tabs are the finance view (what came in and went out). The settings
 * behind them live in their own sections: Earning (rewards, XP rate) and
 * Shop → Settings (switches, monthly budget, fraud rules).
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
      <Card title="XP settings" subtitle="XP comes from playing: votes, contests, wins, daily activity. The XP rules, levels and the XP → 💎 Diamond rate are set in Earning.">
        <p className="text-sm text-muted-foreground">
          Converting never lowers a user&apos;s XP, level or leaderboard rank: TopHunt tracks the converted part separately.
        </p>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/earning/xp?tab=rules" className="text-primary">XP rules and levels →</Link>
          <Link href="/earning/xp?tab=diamonds" className="text-primary">XP → 💎 Diamond and contest rewards →</Link>
        </div>
      </Card>
    </div>
  );
}

// ─── 💎 Diamond ──────────────────────────────────────────────────────────────

/** Diamond report + contests. The reward amounts that pay Diamonds are set in Earning → Free Rewards. */
export function DiamondTab({ contests }: { contests: ReactNode }) {
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
      <Card title="Earning settings (sab Diamond dete hain)" subtitle="Signup bonus, daily login, daily tasks, rewarded ads, Hall of Fame, referral and the free-rewards budget.">
        <Link href="/earning/free-rewards" className="text-sm font-semibold text-primary">Earning → Free Rewards →</Link>
      </Card>
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
      <Card title="Where DP coin is spent: the Shop" subtitle="Open / closed switches, the monthly shop budget and the fraud rules are in Shop → Settings.">
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/shop/settings" className="text-primary">Shop → Settings →</Link>
          <Link href="/shop" className="text-primary">Shop dashboard →</Link>
          <Link href="/shop/gifts" className="text-primary">Virtual gifts →</Link>
        </div>
      </Card>
    </div>
  );
}

