import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Coins, PackageCheck, ShieldAlert } from "lucide-react";
import { api, describeError } from "@/lib/api";
import { fmtNumber } from "@/lib/format";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Card, Notice, inr } from "@/components/monetization/shared";
import { LOW_STOCK, lowStock, lowStockItems, topItems, topProducts, type AdminProduct, type AdminStoreItem } from "@/lib/shopDashboard";

/**
 * Shop → Dashboard: what needs an operator now (orders to review / ship, stock
 * running out), whether the shop is open, this month's spend against the
 * budget, and what sells. Read-only: every number links to the page where it
 * is acted on. Built from the existing admin lists, no extra Worker route.
 */
export function ShopDashboard() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.overview });
  const products = useQuery({ queryKey: ["shop-products"], queryFn: api.monetization.shopProducts });
  const store = useQuery({ queryKey: ["mon-store"], queryFn: api.monetization.store });
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const coins = useQuery({ queryKey: ["monetization-coins", 30], queryFn: () => api.monetization.coins(30) });

  const o: any = overview.data ?? {};
  const prods: AdminProduct[] = products.data?.products ?? [];
  const items: AdminStoreItem[] = store.data ?? [];
  const e = cfgQ.data?.effective;
  const meter: { monthlyBudgetInr: number; spentThisMonthInr: number } | undefined = coins.data?.shopBudget;
  const stock = lowStock(prods);
  const itemStock = lowStockItems(items);
  const soldOut = stock.filter((r) => r.stock === 0).length;
  const budgetPct = meter && meter.monthlyBudgetInr > 0 ? Math.round((meter.spentThisMonthInr / meter.monthlyBudgetInr) * 100) : null;
  const failed = [products, store].find((q) => q.isError);

  return (
    <div className="space-y-6">
      {failed ? <Notice tone="danger">Could not load the shop lists: {describeError(failed.error)}</Notice> : null}

      {e ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={e.shop.enabled ? "active" : "default"}>🛍️ Physical shop {e.shop.enabled ? "open" : "closed"}</Badge>
          <Badge variant={e.store.enabled ? "active" : "default"}>✨ Digital store {e.store.enabled ? "open" : "closed"}</Badge>
          <Badge variant={e.gifts.enabled ? "active" : "default"}>🎁 Gifts {e.gifts.enabled ? "on" : "off"}</Badge>
          <Link href="/shop/settings" className="text-xs font-semibold text-primary">Shop Settings →</Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/shop/orders?status=review">
          <div className="cursor-pointer"><StatCard icon={ShieldAlert} label="Orders held for fraud review" value={fmtNumber(Number(o.pendingShopReview ?? 0))} gradient="gradient-orange" /></div>
        </Link>
        <Link href="/shop/orders">
          <div className="cursor-pointer"><StatCard icon={PackageCheck} label="Orders to pack / ship" value={fmtNumber(Number(o.pendingShopOrders ?? 0))} gradient="gradient-purple" /></div>
        </Link>
        <Link href="/shop/products">
          <div className="cursor-pointer"><StatCard icon={AlertTriangle} label={`Variants at ${LOW_STOCK} or fewer (${fmtNumber(soldOut)} sold out)`} value={fmtNumber(stock.length)} gradient="gradient-red" /></div>
        </Link>
        <Link href="/shop/settings">
          <div className="cursor-pointer">
            <StatCard
              icon={Coins}
              label={meter ? (meter.monthlyBudgetInr > 0 ? `Monthly budget: ${inr(meter.spentThisMonthInr)} of ${inr(meter.monthlyBudgetInr)}` : `This month: ${inr(meter.spentThisMonthInr)} (no limit)`) : "Monthly budget"}
              value={budgetPct === null ? "–" : `${budgetPct}%`}
              gradient="gradient-blue"
            />
          </div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card title="Stock running out" subtitle={`On-sale products with a variant at ${LOW_STOCK} or fewer units. Restock in Physical Products.`}>
          <Table
            data={stock}
            loading={products.isLoading}
            keyFn={(r) => `${r.productId}:${r.variant}`}
            empty="Every on-sale variant has more than enough stock."
            columns={[
              { key: "p", header: "Product", render: (r) => <span className="font-medium">{r.title}</span> },
              { key: "v", header: "Variant", render: (r) => r.variant },
              { key: "s", header: "Left", className: "text-right", render: (r) => (r.stock === 0 ? <Badge variant="ended">sold out</Badge> : fmtNumber(r.stock)) },
            ]}
          />
          {itemStock.length ? (
            <Notice tone="warning">
              Limited digital items almost gone: {itemStock.map((r) => `${r.name} (${r.left} left)`).join(", ")}.{" "}
              <Link href="/shop/digital" className="font-semibold underline">Digital Items →</Link>
            </Notice>
          ) : null}
        </Card>

        <Card title="Best sellers" subtitle="Physical: units sold (cancelled and returned orders excluded). Digital: completed purchases.">
          <p className="text-xs font-semibold text-muted-foreground">Physical products</p>
          <Table
            data={topProducts(prods)}
            loading={products.isLoading}
            keyFn={(p) => p.id}
            empty="No physical product sold yet."
            columns={[
              { key: "p", header: "Product", render: (p) => <span className="font-medium">{p.title}</span> },
              { key: "u", header: "Units", className: "text-right", render: (p) => fmtNumber(p.unitsSold ?? 0) },
            ]}
          />
          <p className="text-xs font-semibold text-muted-foreground">Digital items</p>
          <Table
            data={topItems(items)}
            loading={store.isLoading}
            keyFn={(i) => i.itemId}
            empty="No digital item bought yet."
            columns={[
              { key: "n", header: "Item", render: (i) => <span className="font-medium">{i.name}</span> },
              { key: "t", header: "Type", render: (i) => i.type },
              { key: "b", header: "Purchases", className: "text-right", render: (i) => fmtNumber(i.purchases ?? 0) },
              { key: "r", header: "DP coin", className: "text-right", render: (i) => fmtNumber(i.revenueCoins ?? 0) },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
