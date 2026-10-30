import { useState } from "react";
import { PageHeader } from "@/lib/format";
import { OrdersTab } from "@/components/shop/OrdersTab";
import { ProductsTab } from "@/components/shop/ProductsTab";
import { StoreTab } from "@/components/monetization/StoreTab";
import { FraudRulesTab } from "@/components/shop/FraudRulesTab";

const TABS = [
  { id: "orders", label: "Orders" },
  { id: "products", label: "Physical products" },
  { id: "digital", label: "Digital items" },
  { id: "fraud", label: "Fraud rules" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * Shopping: users spend 🪙 DP coin (won in contests) on
 * physical products and digital items. No ₹ changes hands.
 */
export default function Shopping() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return (TABS.some((x) => x.id === t) ? t : "orders") as Tab;
  });
  return (
    <div>
      <PageHeader title="Shopping" subtitle="Users spend 🪙 DP coin on physical products and digital items. You ship physical orders by hand." />
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "orders" && <OrdersTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "digital" && <StoreTab />}
      {tab === "fraud" && <FraudRulesTab />}
    </div>
  );
}
