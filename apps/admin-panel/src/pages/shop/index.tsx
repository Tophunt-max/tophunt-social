/**
 * SHOP section: everything users spend DP coin (and Diamonds on bundles) on.
 * Each page is one job; the open / closed switches, monthly budget and fraud
 * rules live only in Settings, so no two forms hold different copies of them.
 * Old /shopping?tab= and /monetization?tab=gifts|store links redirect here
 * (lib/legacyRoutes.ts).
 */
import { useMemo, useState } from "react";
import { PageHeader } from "@/lib/format";
import { field } from "@/components/monetization/shared";
import { ShopDashboard } from "@/components/shop/ShopDashboard";
import { OrdersTab } from "@/components/shop/OrdersTab";
import { PhysicalStorefront, ProductsTab } from "@/components/shop/ProductsTab";
import { StoreTab } from "@/components/monetization/StoreTab";
import { CollectionsTab } from "@/components/shop/CollectionsTab";
import { BundlesTab } from "@/components/shop/BundlesTab";
import { ShopHomeTab } from "@/components/shop/ShopHomeTab";
import { GiftsTab } from "@/components/monetization/GiftsTab";
import { FraudRulesTab } from "@/components/shop/FraudRulesTab";
import { ShopBudgetCard, ShopSwitchesCard } from "@/components/shop/ShopSettingsCards";

export function ShopDashboardPage() {
  return (
    <div>
      <PageHeader title="Shop" subtitle="What needs you now: orders to review and ship, stock running out, this month's budget and the best sellers." />
      <ShopDashboard />
    </div>
  );
}

export function ShopOrdersPage() {
  return (
    <div>
      <PageHeader title="Orders" subtitle="Physical orders paid in DP coin. Review held orders, then pack and ship by hand." />
      <OrdersTab />
    </div>
  );
}

export function ShopProductsPage() {
  return (
    <div>
      <PageHeader title="Physical Products" subtitle="Products, variants, stock and prices (₹, shown to users in DP coin)." />
      <ProductsTab />
    </div>
  );
}

export function ShopDigitalPage() {
  return (
    <div>
      <PageHeader title="Digital Items" subtitle="Frames, themes, badges, titles, stickers and effects sold for DP coin. Free XP level rewards are in Earning → Level Rewards." />
      <StoreTab />
    </div>
  );
}

export function ShopCollectionsPage() {
  return (
    <div>
      <PageHeader title="Collections" subtitle="Groups of digital items shown as Popular Collection in the app Shop." />
      <CollectionsTab />
    </div>
  );
}

export function ShopBundlesPage() {
  return (
    <div>
      <PageHeader title="Bundles" subtitle="Sets of digital items sold together for 💎 Diamonds (items only, never coins)." />
      <BundlesTab />
    </div>
  );
}

export function ShopStorefrontPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Storefront" subtitle="What the app Shop shows first: the hero slider, the deal cards, and the Physical tab's categories and Exclusive Collection." />
      <ShopHomeTab />
      <PhysicalStorefront />
    </div>
  );
}

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function ShopGiftsPage() {
  const [days, setDays] = useState(30);
  // Rounded to the minute so the query key is stable across renders.
  const range = useMemo(() => {
    const to = Math.ceil(Date.now() / 60_000) * 60_000;
    return { from: to - days * 86_400_000, to };
  }, [days]);
  return (
    <div>
      <PageHeader
        title="Virtual Gifts"
        subtitle="Gifts users send for DP coin, their rules (on / off, limits) and sends. Recipients get the gift, never coins."
        action={
          <select className={`${field} w-36`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
        }
      />
      <GiftsTab range={range} />
    </div>
  );
}

export function ShopSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Shop Settings" subtitle="The one place to open or close the shop and the store, cap this month's spend, and set the fraud rules." />
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <ShopSwitchesCard />
        <ShopBudgetCard />
      </div>
      <div>
        <p className="font-bold text-foreground mb-3">Fraud rules</p>
        <FraudRulesTab />
      </div>
    </div>
  );
}
