import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Table } from "@/components/ui/Table";
import { fmtNumber } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button, Card, Notice, Num, Text, Toggle, field, money, type Range } from "./shared";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

/** day,provider,placement,platform,requests,matched,impressions,clicks,revenue,currency,status */
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^day,/i.test(lines[0])) lines.shift();
  return lines.map((l, i) => {
    const [day, provider, placement, platform, requests, matched, impressions, clicks, revenue, currency, status] = l.split(",").map((x) => x.trim());
    if (!day || !provider) throw new Error(`Line ${i + 1}: needs at least day and provider.`);
    return {
      day, provider, placement: placement || "all", platform: platform || "all",
      requests: Number(requests || 0), matched: Number(matched || 0), impressions: Number(impressions || 0), clicks: Number(clicks || 0),
      revenue: Number(revenue || 0), currency: (currency || "USD").toUpperCase(), status: status === "finalized" ? "finalized" : "estimated",
    };
  });
}

export function AdsTab({ range }: { range: Range }) {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["monetization-config"], queryFn: api.monetization.config });
  const report = useQuery({ queryKey: ["ads-report", range.from, range.to], queryFn: () => api.monetization.adsReport(range.from, range.to) });
  const [ads, setAds] = useState<any>(null);
  const [sponsored, setSponsored] = useState<any>(null);
  const [regions, setRegions] = useState("");
  const [csv, setCsv] = useState("");

  useEffect(() => {
    if (cfgQ.data && !ads) {
      setAds(structuredClone(cfgQ.data.effective.ads));
      setSponsored(structuredClone(cfgQ.data.effective.sponsored));
      setRegions(cfgQ.data.effective.ads.blockedRegions.join(", "));
    }
  }, [cfgQ.data, ads]);

  const save = useMutation({
    mutationFn: () => {
      const blockedRegions = regions.split(/[\s,]+/).map((r) => r.trim().toUpperCase()).filter(Boolean);
      return api.saveAppSettings({ monetization: { ads: { ...ads, blockedRegions }, sponsored } });
    },
    onSuccess: () => {
      toast.success("Ad settings saved. Apps pick them up within a minute.");
      setAds(null);
      qc.invalidateQueries({ queryKey: ["monetization-config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: () => api.monetization.importRevenue(parseCsv(csv)),
    onSuccess: (r) => {
      toast.success(`Imported ${r.imported} rows`);
      setCsv("");
      qc.invalidateQueries({ queryKey: ["ads-report"] });
      qc.invalidateQueries({ queryKey: ["monetization-overview"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!ads || !sponsored) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const set = (path: string[], v: any) =>
    setAds((a: any) => {
      const next = structuredClone(a);
      let o = next;
      for (const k of path.slice(0, -1)) o = o[k];
      o[path[path.length - 1]] = v;
      return next;
    });
  const ready = cfgQ.data?.providerReady;

  return (
    <div className="space-y-5">
      <Card title="Ad network (SDK ads)" subtitle="Feed native, short-video, interstitial and rewarded placements. Changes apply without an app release.">
        <Notice tone="info">
          Where ads show and which network serves them is now set in the <b>Ad platform</b> tab. Here: the global "Ads enabled" switch, consent, blocked countries,
          and the rewarded amounts and daily caps (apps: AdMob verification; web: watch token). The feed / short-video / interstitial rows below are older settings
          the current app does not use.
        </Notice>
        {!ready && ads.enabled && (
          <Notice tone="warning">
            The provider is not ready, so apps treat ads as OFF. Choose AdMob, and for production mode enter the AdMob app ids. The app build must also include the AdMob SDK (see MONETIZATION.md).
          </Notice>
        )}
        <div className="grid sm:grid-cols-3 gap-3">
          <Toggle label="Ads enabled" checked={ads.enabled} onChange={(v) => set(["enabled"], v)} />
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Provider</span>
            <select className={field} value={ads.provider} onChange={(e) => set(["provider"], e.target.value)}>
              <option value="none">None</option>
              <option value="admob">Google AdMob</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground mb-1 block">Mode</span>
            <select className={field} value={ads.mode} onChange={(e) => set(["mode"], e.target.value)}>
              <option value="test">Test (Google test ads)</option>
              <option value="production">Production</option>
            </select>
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Text label="Android app id" value={ads.admob.androidAppId} placeholder="ca-app-pub-0000000000000000~0000000000" onChange={(v) => set(["admob", "androidAppId"], v)} />
          <Text label="iOS app id" value={ads.admob.iosAppId} placeholder="ca-app-pub-0000000000000000~0000000000" onChange={(v) => set(["admob", "iosAppId"], v)} />
          {(["android", "ios"] as const).map((p) =>
            (["native", "interstitial", "rewarded"] as const).map((u) => (
              <Text key={`${p}-${u}`} label={`${p} ${u} unit`} value={ads.admob[p][u]} placeholder="ca-app-pub-0000000000000000/0000000000" onChange={(v) => set(["admob", p, u], v)} />
            )),
          )}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Num label="Max SDK ads per session" value={ads.sessionMaxAds} onChange={(v) => set(["sessionMaxAds"], v)} />
          <Text label="Blocked countries" value={regions} placeholder="e.g. CN, KP" onChange={setRegions} hint="Two-letter codes. No ads of any kind there." />
          <Toggle label="Consent required (always on)" checked={ads.requireConsent} onChange={() => undefined} hint="The app asks for ad consent through Google's UMP form where required." />
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Toggle label="Feed native ads" checked={ads.feedNative.enabled} onChange={(v) => set(["feedNative", "enabled"], v)} />
            <div className="grid grid-cols-3 gap-2">
              <Num label="First at position" value={ads.feedNative.firstPosition} onChange={(v) => set(["feedNative", "firstPosition"], v)} />
              <Num label="Then every N posts" value={ads.feedNative.interval} onChange={(v) => set(["feedNative", "interval"], v)} />
              <Num label="Max per session" value={ads.feedNative.maxPerSession} onChange={(v) => set(["feedNative", "maxPerSession"], v)} />
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Toggle label="Short-video ads" checked={ads.shortVideo.enabled} onChange={(v) => set(["shortVideo", "enabled"], v)} hint="The app has no short-video feed yet; this is stored for when it ships." />
            <div className="grid grid-cols-2 gap-2">
              <Num label="Every N videos" value={ads.shortVideo.interval} onChange={(v) => set(["shortVideo", "interval"], v)} />
              <Num label="Max per session" value={ads.shortVideo.maxPerSession} onChange={(v) => set(["shortVideo", "maxPerSession"], v)} />
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Toggle label="Interstitial ads" checked={ads.interstitial.enabled} onChange={(v) => set(["interstitial", "enabled"], v)} hint="Only at natural breaks. Never during checkout, sign-in, chat or payment." />
            <div className="grid grid-cols-3 gap-2">
              <Num label="Min seconds apart" value={ads.interstitial.minIntervalSec} onChange={(v) => set(["interstitial", "minIntervalSec"], v)} />
              <Num label="Max per session" value={ads.interstitial.maxPerSession} onChange={(v) => set(["interstitial", "maxPerSession"], v)} />
              <Num label="Max per hour" value={ads.interstitial.maxPerHour} onChange={(v) => set(["interstitial", "maxPerHour"], v)} />
            </div>
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Toggle label="Rewarded ads (verified)" checked={ads.rewarded.enabled} onChange={(v) => set(["rewarded", "enabled"], v)} hint="Paid only by AdMob's server-side verification callback, in Diamonds." />
            <div className="grid grid-cols-2 gap-2">
              <Num label="Diamonds per view" value={ads.rewarded.rewardDiamonds} onChange={(v) => set(["rewarded", "rewardDiamonds"], v)} />
              <Num label="Per user per day" value={ads.rewarded.dailyCap} onChange={(v) => set(["rewarded", "dailyCap"], v)} />
            </div>
            <p className="text-[11px] text-muted-foreground break-all">
              SSV callback URL for the AdMob rewarded unit: <code>{API_BASE}{cfgQ.data?.ssvCallbackPath}</code>
            </p>
          </div>
        </div>
      </Card>

      <Card title="Web rewarded ads (Google Ad Manager)" subtitle="Video ads on the web app's Earn page (tophunt.in). Paid in Diamonds.">
        <Notice tone="warning">
          Web ads have no server-side verification: the browser says the ad was watched. Limits: signed watch token + minimum watch time, the web
          daily cap below, verified mobile number, the daily free Diamond cap and the free-rewards budget. Keep the reward small.
        </Notice>
        {!cfgQ.data?.webAdRewardsAllowed && (
          <Notice tone="warning">
            Deploy switch is OFF, so web ads pay nothing even when enabled here. Set the Worker variable <code>ALLOW_WEB_AD_REWARDS=true</code> in Cloudflare to allow it.
          </Notice>
        )}
        {ads.web.enabled && !ads.enabled && <Notice tone="warning">"Ads enabled" (above) is off, so web ads are off too.</Notice>}
        {ads.web.enabled && !ads.web.adUnitPath && <Notice tone="warning">Enter the Ad Manager rewarded ad unit path, or web ads stay off.</Notice>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Toggle label="Web rewarded ads" checked={ads.web.enabled} onChange={(v) => set(["web", "enabled"], v)} hint={`Deploy switch: ${cfgQ.data?.webAdRewardsAllowed ? "ON" : "OFF"}`} />
          <Toggle
            label="Verified mobile number required"
            checked={ads.web.requireVerifiedPhone}
            onChange={(v) => set(["web", "requireVerifiedPhone"], v)}
            hint="Strongly recommended: makes farming with many accounts expensive."
          />
          <Text
            label="Rewarded ad unit path"
            value={ads.web.adUnitPath}
            placeholder="/1234567/tophunt_rewarded"
            onChange={(v) => set(["web", "adUnitPath"], v)}
            hint="Ad Manager → Inventory → Ad units → the rewarded unit's code, with your network code in front."
          />
          <div className="grid grid-cols-3 gap-2">
            <Num label="Diamonds per view" value={ads.web.rewardDiamonds} onChange={(v) => set(["web", "rewardDiamonds"], v)} />
            <Num label="Per user per day" value={ads.web.dailyCap} onChange={(v) => set(["web", "dailyCap"], v)} />
            <Num label="Min watch (sec)" value={ads.web.minWatchSec} onChange={(v) => set(["web", "minWatchSec"], v)} />
          </div>
        </div>
      </Card>

      <Card title="Sponsored posts (direct campaigns)" subtitle="Where approved brand campaigns appear in the home feed.">
        <div className="grid sm:grid-cols-4 gap-3">
          <Toggle label="Sponsored posts enabled" checked={sponsored.enabled} onChange={(v) => setSponsored({ ...sponsored, enabled: v })} />
          <Num label="First at position" value={sponsored.firstPosition} onChange={(v) => setSponsored({ ...sponsored, firstPosition: v })} />
          <Num label="Then every N posts" value={sponsored.interval} onChange={(v) => setSponsored({ ...sponsored, interval: v })} />
          <Num label="Max per session" value={sponsored.maxPerSession} onChange={(v) => setSponsored({ ...sponsored, maxPerSession: v })} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save ad settings</Button>
      </div>

      <Card title="App-reported diagnostics" subtitle="What the app says happened. Useful for fill rate and errors. Not revenue.">
        <Table
          data={report.data?.diagnostics ?? []}
          loading={report.isLoading}
          empty="No ad events in this period."
          keyFn={(r: any) => `${r.placement}-${r.platform}-${r.provider}`}
          columns={[
            { key: "p", header: "Placement", render: (r: any) => r.placement },
            { key: "pl", header: "Platform", render: (r: any) => r.platform },
            { key: "rq", header: "Requests", render: (r: any) => fmtNumber(r.requests) },
            { key: "f", header: "Fills", render: (r: any) => fmtNumber(r.fills) },
            { key: "fr", header: "Fill rate", render: (r: any) => (r.fillRate === null ? "–" : `${r.fillRate}%`) },
            { key: "i", header: "Impressions", render: (r: any) => fmtNumber(r.impressions) },
            { key: "e", header: "Failures", render: (r: any) => fmtNumber(r.failures) },
            { key: "rw", header: "Rewards", render: (r: any) => fmtNumber(r.rewardCompletions) },
          ]}
        />
      </Card>

      <Card title="Provider revenue (source of truth)" subtitle="Imported from the AdMob report. eCPM = revenue ÷ impressions × 1000.">
        <Table
          data={report.data?.revenue ?? []}
          loading={report.isLoading}
          empty="No provider report imported for this period."
          keyFn={(r: any) => `${r.provider}-${r.placement}-${r.platform}-${r.currency}-${r.status}`}
          columns={[
            { key: "s", header: "Status", render: (r: any) => <Badge variant={r.status === "finalized" ? "success" : "warning"}>{r.status}</Badge> },
            { key: "p", header: "Placement", render: (r: any) => r.placement },
            { key: "pl", header: "Platform", render: (r: any) => r.platform },
            { key: "i", header: "Impressions", render: (r: any) => fmtNumber(r.impressions) },
            { key: "m", header: "Match rate", render: (r: any) => (r.matchRate === null ? "–" : `${r.matchRate}%`) },
            { key: "r", header: "Revenue", render: (r: any) => money(r.revenue, r.currency) },
            { key: "e", header: "eCPM", render: (r: any) => (r.ecpm === null ? "–" : money(r.ecpm, r.currency)) },
          ]}
        />
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Paste CSV rows: <code>day,provider,placement,platform,requests,matched,impressions,clicks,revenue,currency,status</code>. Re-importing a day replaces it; a finalized day stays finalized.
          </p>
          <textarea className={`${field} font-mono h-28`} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="2026-10-01,admob,feed_native,android,12000,9800,9500,40,14.20,USD,estimated" />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => importMut.mutate()} disabled={!csv.trim() || importMut.isPending}>Import report rows</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
