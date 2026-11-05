import { Link } from "wouter";
import { SettingsEditor } from "@/components/SettingsEditor";
import { api } from "@/lib/api";

// Superadmin only (components/Layout.tsx SUPERADMIN_PAGES; the Worker refuses
// raw keys from anyone else, routes/admin.ts POST /rewards).
// Coin rewards have forms with validation in Earning → Free Rewards
// (components/coin/EarnCards.tsx). XP, levels, ranks, milestones and quests
// live in Earning → XP & Levels → Rules (components/earning/GamificationSections.tsx),
// which validates them and asks for the approval password when coins are at
// stake; the Worker refuses curve changes from this raw editor.
const COIN_KEYS = ["dailyLoginReward", "dailyBaseReward", "dailyStreakBonus", "dailyTasks", "hallOfFameRewards"];
const XP_KEYS = ["progression", "xpThreshold", "xpIncrement"];

const hint = (keys: string[]) => {
  const xp = keys.filter((k) => XP_KEYS.includes(k));
  const coin = keys.filter((k) => COIN_KEYS.includes(k));
  return [
    xp.length ? `${xp.join(", ")}: Earning → XP & Levels → Rules me badlo.` : "",
    coin.length ? `${coin.join(", ")}: Earning → Free Rewards me badlo.` : "",
  ].filter(Boolean).join(" ");
};

export default function Rewards() {
  return (
    <div>
      <div className="mb-4 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
        XP, levels, ranks, milestones aur quests{" "}
        <Link href="/earning/xp?tab=rules" className="font-semibold text-primary underline">Earning → XP &amp; Levels</Link>{" "}
        par, aur coin wale rewards{" "}
        <Link href="/earning/free-rewards" className="font-semibold text-primary underline">Earning → Free Rewards</Link>{" "}
        par form ke saath edit hote hain.
      </div>
      <SettingsEditor
        title="Rewards & Gamification (advanced)"
        subtitle="Baaki raw settings (JSON), sirf superadmin. Coin wale rewards Earning → Free Rewards me, aur XP / levels Earning → XP & Levels me edit karo."
        queryKey="rewards"
        load={api.rewards}
        save={api.saveRewards}
        omitKeys={[...COIN_KEYS, ...XP_KEYS]}
        omitHint={hint}
      />
    </div>
  );
}
