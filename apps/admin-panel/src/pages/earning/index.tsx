/**
 * EARNING section: everything users get without paying — free rewards, XP and
 * levels, level rewards, achievements, seasons, special events — and the
 * player tools around them. Built from the former Gamification page and the
 * Coin Economy → Diamond earn settings; old /gamification?tab=,
 * /earning-*, /referrals and /coin-economy?tab=earn links redirect here
 * (lib/legacyRoutes.ts). Dashboard, Referrals, Assets and Audit keep their
 * own page modules.
 */
import { PageHeader } from "@/lib/format";
import { isFullAdminRole, useAuth } from "@/lib/auth";
import { useTabParam } from "@/lib/useTabParam";
import { SegTabs } from "@/components/finance/bits";
import { FreeRewards } from "@/components/earning/FreeRewards";
import { Achievements, Catalog, Flags, Grants, Overview, Rules, Seasons, UserInspector } from "@/components/earning/GamificationSections";
import { XpRewardsTab } from "@/components/gamification/XpRewardsTab";
import { EventsTab } from "@/components/gamification/EventsTab";
import { ContestRewardsCard, XpConversionCard } from "@/components/coin/ClosedLoopCards";

export function EarningFreeRewardsPage() {
  return (
    <div>
      <PageHeader title="Free Rewards" subtitle="Signup and verification bonus, daily login, daily tasks, rewarded ads, Hall of Fame and referral amounts, with the free-rewards budget. All pay 💎 Diamonds." />
      <FreeRewards />
    </div>
  );
}

const XP_TABS = [
  { key: "overview", label: "Overview" },
  { key: "rules", label: "XP rules & levels" },
  { key: "diamonds", label: "XP → 💎 Diamond" },
] as const;
type XpTab = (typeof XP_TABS)[number]["key"];
const XP_TAB_KEYS = XP_TABS.map((t) => t.key);

export function EarningXpPage() {
  const [tab, setTab] = useTabParam<XpTab>(XP_TAB_KEYS, "overview");
  const { user } = useAuth();
  // Older servers do not report a role; the Worker still enforces it.
  const full = !user?.role || isFullAdminRole(user.role);
  return (
    <div>
      <PageHeader title="XP & Levels" subtitle="How much XP each action pays, the level curve, ranks, milestones and quests, and the XP → Diamond conversion." />
      <SegTabs tab={tab} setTab={(k) => setTab(k as XpTab)} tabs={[...XP_TABS]} />
      {tab === "overview" && <Overview />}
      {tab === "rules" && <Rules />}
      {tab === "diamonds" &&
        (full ? (
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <XpConversionCard />
            <ContestRewardsCard />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">XP conversion and contest rewards are available to full admins.</p>
        ))}
    </div>
  );
}

export function EarningLevelRewardsPage() {
  return (
    <div>
      <PageHeader title="Level Rewards" subtitle="The free frame, theme, badge or title users unlock at each level. Never sold; DP coin items are in Shop → Digital Items." />
      <XpRewardsTab />
    </div>
  );
}

export function EarningAchievementsPage() {
  return (
    <div>
      <PageHeader title="Achievements" subtitle="Goals users complete for XP, Diamonds or an Earning reward item." />
      <Achievements />
    </div>
  );
}

export function EarningSeasonsPage() {
  return (
    <div>
      <PageHeader title="Seasons" subtitle="Time-boxed leaderboards with rank rewards, settled when the season ends." />
      <Seasons />
    </div>
  );
}

export function EarningCatalogPage() {
  return (
    <div>
      <PageHeader title="Reward Items" subtitle="Items paid out by achievements, seasons, milestones and grants. Shop items and level rewards have their own editors." />
      <Catalog />
    </div>
  );
}

export function EarningEventsPage() {
  return (
    <div>
      <PageHeader title="Special Events" subtitle="Limited-time earning events in the app's Rewards Center. Each task pays 💎 Diamonds once, from the free-rewards budget." />
      <EventsTab />
    </div>
  );
}

const PLAYER_TABS = [
  { key: "users", label: "User inspector" },
  { key: "flags", label: "Abuse flags" },
  { key: "grants", label: "Reward grants" },
] as const;
type PlayerTab = (typeof PLAYER_TABS)[number]["key"];
const PLAYER_TAB_KEYS = PLAYER_TABS.map((t) => t.key);

export function EarningPlayersPage() {
  const [tab, setTab] = useTabParam<PlayerTab>(PLAYER_TAB_KEYS, "users");
  return (
    <div>
      <PageHeader title="Players & Flags" subtitle="One user's XP, achievements and inventory with audited corrections, review flags, and reward grants." />
      <SegTabs tab={tab} setTab={(k) => setTab(k as PlayerTab)} tabs={[...PLAYER_TABS]} />
      {tab === "users" && <UserInspector />}
      {tab === "flags" && <Flags />}
      {tab === "grants" && <Grants />}
    </div>
  );
}
