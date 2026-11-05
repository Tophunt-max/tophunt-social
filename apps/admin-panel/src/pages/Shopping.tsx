import { PageHeader } from "@/lib/format";
import { useTabParam } from "@/lib/useTabParam";
import { OrdersTab } from "@/components/shop/OrdersTab";
import { ProductsTab } from "@/components/shop/ProductsTab";
import { StoreTab } from "@/components/monetization/StoreTab";
import { FraudRulesTab } from "@/components/shop/FraudRulesTab";
import { ShopHomeTab } from "@/components/shop/ShopHomeTab";
import { CollectionsTab } from "@/components/shop/CollectionsTab";
import { BundlesTab } from "@/components/shop/BundlesTab";

const TABS = [
  { id: "orders", label: "Orders" },
  { id: "products", label: "Physical products" },
  { id: "digital", label: "Digital items" },
  { id: "home", label: "Shop home" },
  { id: "collections", label: "Collections" },
  { id: "bundles", label: "Bundles" },
  { id: "fraud", label: "Fraud rules" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/**
 * Shopping: users spend 🪙 DP coin (won in contests) on physical products
 * and digital items, and 💎 Diamonds on Shop Bundles (items only). No ₹
 * changes hands.
 */
const TAB_IDS = TABS.map((t) => t.id);

export default function Shopping() {
  const [tab, setTab] = useTabParam<Tab>(TAB_IDS, "orders");
  return (
    <div>
      <PageHeader title="Shopping" subtitle="Users spend 🪙 DP coin on physical products and digital items, and 💎 Diamonds on bundles (items only). You ship physical orders by hand." />
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
      {tab === "home" && <ShopHomeTab />}
      {tab === "collections" && <CollectionsTab />}
      {tab === "bundles" && <BundlesTab />}
      {tab === "fraud" && <FraudRulesTab />}
    </div>
  );
}
