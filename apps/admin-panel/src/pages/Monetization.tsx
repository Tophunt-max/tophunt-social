import { useMemo, useState } from "react";
import { Redirect, useSearch } from "wouter";
import { PageHeader } from "@/lib/format";
import { useTabParam } from "@/lib/useTabParam";
import { OverviewTab } from "@/components/monetization/OverviewTab";
import { AdsTab } from "@/components/monetization/AdsTab";
import { AdPlatformTab } from "@/components/monetization/AdPlatformTab";
import { AdPerformanceTab } from "@/components/monetization/AdPerformanceTab";
import { SponsorshipsTab } from "@/components/monetization/SponsorshipsTab";
import { GiftsTab } from "@/components/monetization/GiftsTab";
import { field } from "@/components/monetization/shared";

// The digital item catalogue lives only in Shopping → Digital items; old
// `/monetization?tab=store` links are redirected there (MonetizationRoute).
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "adplatform", label: "Ad platform" },
  { id: "adperformance", label: "Ad performance" },
  { id: "ads", label: "Ads & rewards" },
  { id: "sponsorships", label: "Sponsorships" },
  { id: "gifts", label: "Gifts" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id);

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

/** `/monetization?tab=store` (the old Digital store tab) opens Shopping → Digital items; anything else is the page. */
export default function MonetizationRoute() {
  const search = useSearch();
  if (new URLSearchParams(search).get("tab") === "store") return <Redirect to="/shopping?tab=digital" replace />;
  return <Monetization />;
}

function Monetization() {
  const [tab, select] = useTabParam<Tab>(TAB_IDS, "overview");
  const [days, setDays] = useState(30);
  // Rounded to the minute so the query key is stable across renders.
  const range = useMemo(() => {
    const to = Math.ceil(Date.now() / 60_000) * 60_000;
    return { from: to - days * 86_400_000, to };
  }, [days]);

  return (
    <div>
      <PageHeader
        title="Monetization"
        subtitle="Ads, brand sponsorships and virtual gifts. Digital items are managed in Shopping. Estimates are labelled; only provider reports and invoices are revenue."
        action={
          tab !== "sponsorships" ? (
            <select className={`${field} w-36`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
            </select>
          ) : null
        }
      />
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "overview" && <OverviewTab range={range} />}
      {tab === "adplatform" && <AdPlatformTab />}
      {tab === "adperformance" && <AdPerformanceTab range={range} />}
      {tab === "ads" && <AdsTab range={range} />}
      {tab === "sponsorships" && <SponsorshipsTab />}
      {tab === "gifts" && <GiftsTab range={range} />}
    </div>
  );
}
