import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { useAppConfig } from "@/lib/useAppConfig";
import { Table } from "@/components/ui/Table";
import { RewardLockingCard } from "@/components/coin/CoinCards";
import { CoinAlertsCard, FreeRewardsBudgetCard } from "@/components/coin/AlertCards";
import { AdsRewardCard, DailyLoginCard, DailyTasksCard, HallOfFameCard, RewardStatsCard, SignupBonusReviewCard, VerificationRewardCard } from "@/components/coin/EarnCards";
import { ProgramSettings } from "@/pages/Referrals";

/**
 * Earning → Free Rewards: every reward the app pays without a purchase
 * (signup and verification bonus, daily login, daily tasks, rewarded ads,
 * Hall of Fame, referral amounts), the free-rewards budget and its alerts,
 * and what each source paid in the last 30 days.
 *
 * Moved here from Coin Economy → Diamond so earning is managed in one
 * section. Each card still saves only its own keys through the same Worker
 * routes (/admin/app-settings or /admin/rewards), which validate and audit.
 */
const EARN_TYPES: { type: string; label: string }[] = [
  { type: "signup_bonus", label: "Signup bonus (turant)" },
  { type: "verification_bonus", label: "Signup bonus (email + mobile verify)" },
  { type: "referral_bonus", label: "Referral" },
  { type: "daily_reward", label: "Daily login" },
  { type: "daily_task", label: "Daily tasks" },
  { type: "ad_reward", label: "Rewarded ads" },
  { type: "monthly_hall_of_fame_reward", label: "Hall of Fame" },
  { type: "admin_adjustment", label: "Admin adjustment" },
];

const inr = (n: number) => `₹${fmtNumber(Math.round((n || 0) * 100) / 100)}`;

export function FreeRewards() {
  const { data, isLoading, save } = useAppConfig();
  const rewards = useQuery({ queryKey: ["rewards"], queryFn: api.rewards });
  const referrals = useQuery({ queryKey: ["referrals", "", ""], queryFn: () => api.referrals({}) });
  const since = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000)[0];
  const month = useQuery({ queryKey: ["coin-economy", "30d"], queryFn: () => api.coinEconomy({ from: since }) });
  if (isLoading || !data) return <p className="text-sm text-muted-foreground py-10 text-center">Loading…</p>;
  const byType = new Map((month.data?.types ?? []).map((t) => [t.type, t]));
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="font-semibold text-foreground mb-3">Free rewards: pichhle 30 din me kitna diya</p>
        <Table
          data={EARN_TYPES}
          keyFn={(t) => t.type}
          columns={[
            { key: "s", header: "Source", render: (t) => <span className="font-medium text-foreground">{t.label}</span> },
            { key: "l", header: "💎 Diamond", className: "text-right", render: (t) => fmtNumber(byType.get(t.type)?.diamondIn ?? 0) },
            { key: "c", header: "🪙 DP coin", className: "text-right", render: (t) => fmtNumber(byType.get(t.type)?.dpIn ?? 0) },
            { key: "n", header: "Entries", className: "text-right", render: (t) => fmtNumber(byType.get(t.type)?.count ?? 0) },
            // Only DP coins buy shop goods, so only they carry a ₹ value.
            { key: "r", header: "DP coin ≈ ₹", className: "text-right", render: (t) => inr((byType.get(t.type)?.dpIn ?? 0) * (month.data?.payoutRate ?? 0)) },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RewardLockingCard data={data} pending={save.isPending} onSave={(p) => save.mutate(p)} />
        <FreeRewardsBudgetCard data={data} pending={save.isPending} onSave={(p) => save.mutate(p)} />
        <CoinAlertsCard data={data} pending={save.isPending} onSave={(p) => save.mutate(p)} />
        <VerificationRewardCard data={data} />
        <SignupBonusReviewCard />
        <DailyLoginCard rewards={rewards.data} />
        <DailyTasksCard rewards={rewards.data} />
        <RewardStatsCard />
        <AdsRewardCard data={data} />
        <HallOfFameCard rewards={rewards.data} />
      </div>
      <div>
        <ProgramSettings program={referrals.data?.program} />
        <p className="mt-2 text-xs text-muted-foreground">
          Referral ki queue aur approvals: <Link href="/earning/referrals" className="underline">Earning → Referral Program</Link>.
        </p>
      </div>
    </div>
  );
}
