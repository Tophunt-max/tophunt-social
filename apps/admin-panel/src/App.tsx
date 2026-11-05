import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { Switch, Route, Redirect, useLocation, useSearch } from "wouter";
import { LEGACY_PATHS, legacyTarget } from "@/lib/legacyRoutes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { PopupToaster } from "@/lib/toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import Login from "@/pages/Login";
import { reloadIfStale, startUpdateCheck, useUpdateAvailable } from "@/lib/updateCheck";

/**
 * A code-split route whose chunk fails to load must NOT blank the screen.
 *
 * On mobile especially, opening the OS file picker can get the tab discarded by
 * the browser under memory pressure; when the user returns the tab is reloaded,
 * and the very next lazy route import can hit a transient network failure (or,
 * after a fresh deploy, a chunk hash that no longer exists). A raw `lazy()` then
 * rejects, React unwinds to the top, and the admin is left staring at a white
 * page.
 *
 * `lazyWithReload` retries that import exactly once by doing a hard reload — the
 * cleanest way to pull a fresh `index.html` and its current chunk hashes. A
 * `sessionStorage` guard keyed to the module makes it a ONE-TIME move, so a
 * genuinely broken build cannot become an endless reload loop: the second
 * failure rethrows and falls through to the global ErrorBoundary instead.
 */
function lazyWithReload<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const guardKey = `chunk-reload:${factory.toString()}`;
    try {
      const mod = await factory();
      sessionStorage.removeItem(guardKey);
      return mod;
    } catch (error) {
      if (!sessionStorage.getItem(guardKey)) {
        sessionStorage.setItem(guardKey, "1");
        window.location.reload();
        // Resolve to nothing meaningful; the reload takes over before React
        // renders this, and Suspense keeps the fallback up in the meantime.
        return await new Promise<{ default: T }>(() => {});
      }
      // Already tried a reload and it still failed — let the ErrorBoundary show
      // its recoverable fallback rather than reloading forever.
      throw error;
    }
  });
}

const Dashboard = lazyWithReload(() => import("@/pages/Dashboard"));
const Analytics = lazyWithReload(() => import("@/pages/Analytics"));
const UsersPage = lazyWithReload(() => import("@/pages/Users"));
const Admins = lazyWithReload(() => import("@/pages/Admins"));
const Contests = lazyWithReload(() => import("@/pages/Contests"));
const Matches = lazyWithReload(() => import("@/pages/Matches"));
const PrizeClaims = lazyWithReload(() => import("@/pages/PrizeClaims"));
const Leaderboard = lazyWithReload(() => import("@/pages/Leaderboard"));
const Transactions = lazyWithReload(() => import("@/pages/Transactions"));
const CoinEconomy = lazyWithReload(() => import("@/pages/CoinEconomy"));
const Monetization = lazyWithReload(() => import("@/pages/Monetization"));
// SHOP section: one chunk for all its pages (pages/shop).
const shopPage = (name: keyof typeof import("@/pages/shop")) =>
  lazyWithReload(() => import("@/pages/shop").then((m) => ({ default: m[name] as ComponentType<unknown> })));
const ShopDashboardPage = shopPage("ShopDashboardPage");
const ShopOrdersPage = shopPage("ShopOrdersPage");
const ShopProductsPage = shopPage("ShopProductsPage");
const ShopDigitalPage = shopPage("ShopDigitalPage");
const ShopCollectionsPage = shopPage("ShopCollectionsPage");
const ShopBundlesPage = shopPage("ShopBundlesPage");
const ShopStorefrontPage = shopPage("ShopStorefrontPage");
const ShopGiftsPage = shopPage("ShopGiftsPage");
const ShopSettingsPage = shopPage("ShopSettingsPage");
// EARNING section (pages/earning), plus its pages that have their own modules.
const earningPage = (name: keyof typeof import("@/pages/earning")) =>
  lazyWithReload(() => import("@/pages/earning").then((m) => ({ default: m[name] as ComponentType<unknown> })));
const EarningFreeRewardsPage = earningPage("EarningFreeRewardsPage");
const EarningXpPage = earningPage("EarningXpPage");
const EarningLevelRewardsPage = earningPage("EarningLevelRewardsPage");
const EarningAchievementsPage = earningPage("EarningAchievementsPage");
const EarningSeasonsPage = earningPage("EarningSeasonsPage");
const EarningCatalogPage = earningPage("EarningCatalogPage");
const EarningEventsPage = earningPage("EarningEventsPage");
const EarningPlayersPage = earningPage("EarningPlayersPage");
const Posts = lazyWithReload(() => import("@/pages/Posts"));
const Stories = lazyWithReload(() => import("@/pages/Stories"));
const Comments = lazyWithReload(() => import("@/pages/Comments"));
const Blog = lazyWithReload(() => import("@/pages/Blog"));
const Seo = lazyWithReload(() => import("@/pages/Seo"));
const Reports = lazyWithReload(() => import("@/pages/Reports"));
const Support = lazyWithReload(() => import("@/pages/Support"));
const Moderation = lazyWithReload(() => import("@/pages/Moderation"));
const AuditLog = lazyWithReload(() => import("@/pages/AuditLog"));
const AccountDeletions = lazyWithReload(() => import("@/pages/AccountDeletions"));
const Notifications = lazyWithReload(() => import("@/pages/Notifications"));
const Announcements = lazyWithReload(() => import("@/pages/Announcements"));
const Rewards = lazyWithReload(() => import("@/pages/Rewards"));
const Referrals = lazyWithReload(() => import("@/pages/Referrals"));
const EarningDashboard = lazyWithReload(() => import("@/pages/EarningDashboard"));
const EarningAssets = lazyWithReload(() => import("@/pages/EarningAssets"));
const EarningAudit = lazyWithReload(() => import("@/pages/EarningAudit"));
const ExplorePage = lazyWithReload(() => import("@/pages/Explore"));
const AppControl = lazyWithReload(() => import("@/pages/AppControl"));
const AppSettings = lazyWithReload(() => import("@/pages/AppSettings"));
const FeedRanking = lazyWithReload(() => import("@/pages/FeedRanking"));
const Onboarding = lazyWithReload(() => import("@/pages/Onboarding"));
const Legal = lazyWithReload(() => import("@/pages/Legal"));
const Integrations = lazyWithReload(() => import("@/pages/Integrations"));
const Logs = lazyWithReload(() => import("@/pages/Logs"));
const SystemHealth = lazyWithReload(() => import("@/pages/SystemHealth"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

/** An old URL (lib/legacyRoutes.ts) → its new page, replacing the history entry. */
function LegacyRedirect() {
  const [path] = useLocation();
  const search = useSearch();
  return <Redirect to={legacyTarget(path, search) ?? "/dashboard"} replace />;
}

/** A page that is still real, unless the URL names one of its moved tabs (then it redirects before mounting). */
function LegacyOr({ page: Page }: { page: ComponentType<unknown> }) {
  const [path] = useLocation();
  const search = useSearch();
  const target = legacyTarget(path, search);
  return target ? <Redirect to={target} replace /> : <Page />;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={() => <Redirect to="/dashboard" />} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/users" component={UsersPage} />
          <Route path="/admins" component={Admins} />
          <Route path="/contests" component={Contests} />
          <Route path="/matches" component={Matches} />
          <Route path="/prize-claims" component={PrizeClaims} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/transactions" component={Transactions} />
          <Route path="/coin-economy">{() => <LegacyOr page={CoinEconomy} />}</Route>
          <Route path="/monetization">{() => <LegacyOr page={Monetization} />}</Route>
          {/* SHOP */}
          <Route path="/shop" component={ShopDashboardPage} />
          <Route path="/shop/orders" component={ShopOrdersPage} />
          <Route path="/shop/products" component={ShopProductsPage} />
          <Route path="/shop/digital" component={ShopDigitalPage} />
          <Route path="/shop/collections" component={ShopCollectionsPage} />
          <Route path="/shop/bundles" component={ShopBundlesPage} />
          <Route path="/shop/storefront" component={ShopStorefrontPage} />
          <Route path="/shop/gifts" component={ShopGiftsPage} />
          <Route path="/shop/settings" component={ShopSettingsPage} />
          {/* EARNING */}
          <Route path="/earning" component={EarningDashboard} />
          <Route path="/earning/free-rewards" component={EarningFreeRewardsPage} />
          <Route path="/earning/xp" component={EarningXpPage} />
          <Route path="/earning/level-rewards" component={EarningLevelRewardsPage} />
          <Route path="/earning/achievements" component={EarningAchievementsPage} />
          <Route path="/earning/seasons" component={EarningSeasonsPage} />
          <Route path="/earning/catalog" component={EarningCatalogPage} />
          <Route path="/earning/events" component={EarningEventsPage} />
          <Route path="/earning/referrals" component={Referrals} />
          <Route path="/earning/assets" component={EarningAssets} />
          <Route path="/earning/players" component={EarningPlayersPage} />
          <Route path="/earning/audit" component={EarningAudit} />
          {/* Old Shopping / Gamification / Earning URLs (bookmarks, older notifications) */}
          {LEGACY_PATHS.filter((p) => p !== "/coin-economy" && p !== "/monetization").map((p) => (
            <Route key={p} path={p} component={LegacyRedirect} />
          ))}
          <Route path="/posts" component={Posts} />
          <Route path="/stories" component={Stories} />
          <Route path="/comments" component={Comments} />
          <Route path="/blog" component={Blog} />
          <Route path="/seo" component={Seo} />
          <Route path="/reports" component={Reports} />
          <Route path="/support" component={Support} />
          <Route path="/moderation" component={Moderation} />
          <Route path="/audit-log" component={AuditLog} />
          <Route path="/account-deletions" component={AccountDeletions} />
          <Route path="/logs" component={Logs} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/announcements" component={Announcements} />
          <Route path="/rewards" component={Rewards} />
          <Route path="/explore" component={ExplorePage} />
          <Route path="/app-control" component={AppControl} />
          <Route path="/app-settings" component={AppSettings} />
          <Route path="/feed-ranking" component={FeedRanking} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/legal" component={Legal} />
          <Route path="/integrations" component={Integrations} />
          <Route path="/system-health" component={SystemHealth} />
          <Route component={() => <Redirect to="/dashboard" />} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

/**
 * Shown once a newer admin panel is deployed while this tab is open. A banner,
 * not an automatic reload, so nothing half-typed is lost; navigating to another
 * page also reloads (see `reloadIfStale`).
 */
function UpdateBanner() {
  const available = useUpdateAvailable();
  const [location] = useLocation();
  useEffect(() => startUpdateCheck(), []);
  useEffect(() => reloadIfStale(), [location]);
  if (!available) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-lg border bg-background px-4 py-2 text-sm shadow-lg">
      <span>A new version of the admin panel is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
      >
        Reload
      </button>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UpdateBanner />
      <AuthProvider>
        <ConfirmProvider>
          <ProtectedApp />
        </ConfirmProvider>
      </AuthProvider>
      <PopupToaster />
    </QueryClientProvider>
  );
}
