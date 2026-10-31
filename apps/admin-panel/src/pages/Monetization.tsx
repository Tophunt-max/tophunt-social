import { useMemo, useState } from "react";
import { PageHeader } from "@/lib/format";
import { OverviewTab } from "@/components/monetization/OverviewTab";
import { AdsTab } from "@/components/monetization/AdsTab";
import { AdPlatformTab } from "@/components/monetization/AdPlatformTab";
import { AdPerformanceTab } from "@/components/monetization/AdPerformanceTab";
import { SponsorshipsTab } from "@/components/monetization/SponsorshipsTab";
import { GiftsTab } from "@/components/monetization/GiftsTab";
import { StoreTab } from "@/components/monetization/StoreTab";
import { field } from "@/components/monetization/shared";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "adplatform", label: "Ad platform" },
  { id: "adperformance", label: "Ad performance" },
  { id: "ads", label: "Ads & rewards" },
  { id: "sponsorships", label: "Sponsorships" },
  { id: "gifts", label: "Gifts" },
  { id: "store", label: "Digital store" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export default function Monetization() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return (TABS.some((x) => x.id === t) ? t : "overview") as Tab;
  });
  const [days, setDays] = useState(30);
  // Rounded to the minute so the query key is stable across renders.
  const range = useMemo(() => {
    const to = Math.ceil(Date.now() / 60_000) * 60_000;
    return { from: to - days * 86_400_000, to };
  }, [days]);

  const select = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div>
      <PageHeader
        title="Monetization"
        subtitle="Ads, brand sponsorships, virtual gifts and the digital store. Estimates are labelled; only provider reports and invoices are revenue."
        action={
          tab !== "store" && tab !== "sponsorships" ? (
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
      {tab === "store" && <StoreTab />}
    </div>
  );
}
