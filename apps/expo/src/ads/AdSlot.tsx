/**
 * An inline ad slot (banner / native) with a fallback waterfall.
 *
 *   <AdSlot slot="battle_page" isDark={isDark} />
 *
 * Tries the placement's networks in the admin's order. Each gets its timeout;
 * on no fill, error or timeout the next one is tried. House ads (sponsored
 * campaigns) are the usual last step. When nothing fills, the slot collapses.
 *
 * - Reserves its height while loading so the page does not jump.
 * - Labelled "Advertisement"; never placed next to vote or share buttons.
 * - Frequency caps (per session / per day) are counted on fill.
 * - Lazy: on the web nothing is requested until the slot is within ~1 screen.
 * - Every attempt feeds this device's circuit breaker and latency estimate
 *   (src/ads/optimizer.ts); events carry the experiment variant, the load
 *   time, and (AdMob) the impression's revenue.
 * - Web Ad Manager banners refresh while on screen if the slot sets refreshSec.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@/src/hooks/useAuth';
import { SponsoredCard } from '@/src/components/home/SponsoredCard';
import { queueAdEvent, useSponsoredCampaigns } from '@/src/services/monetization';
import { canShowAd, recordAdShown } from './frequency';
import { noteAdShown, recordNetworkResult } from './optimizer';
import { AD_PLATFORM, useAdPlacement, type AdAttempt, type AdSlotKey, type ResolvedPlacement } from './placements';
import { AdmobInline } from './providers/admob';
import { AdSenseDisplay, GamDisplay } from './providers/web';

const RESERVED_H = 250;
/** Small banner slots (share screens): one 320×50 line. */
const COMPACT_SLOTS = new Set<AdSlotKey>(['share_sheet', 'entry_share', 'referral_share', 'notifications', 'prizes']);
const RESERVED_H_COMPACT = 60;

export function AdSlot({
  slot,
  isDark,
  index = 0,
  style,
  onResult,
}: {
  slot: AdSlotKey;
  isDark: boolean;
  index?: number;
  style?: StyleProp<ViewStyle>;
  /** Told once whether an ad filled the slot (false = nothing to show). */
  onResult?: (filled: boolean) => void;
}) {
  const placement = useAdPlacement(slot);
  const usable = !!placement && placement.format !== 'interstitial' && placement.format !== 'rewarded';
  useEffect(() => {
    if (!usable) onResult?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable]);
  if (!usable) return null;
  return <Waterfall key={`${slot}:${index}`} placement={placement!} isDark={isDark} index={index} style={style} compact={COMPACT_SLOTS.has(slot)} onResult={onResult} />;
}

/** Web: true once the slot is within `margin` px of the viewport. Apps: true (lists are virtualized). */
function useNearViewport(ref: React.RefObject<View | null>, margin = 600): boolean {
  const [near, setNear] = useState(AD_PLATFORM !== 'web' || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near) return;
    const el = ref.current as unknown as Element | null;
    if (!el || typeof (el as any).getBoundingClientRect !== 'function') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: `${margin}px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [near, ref, margin]);
  return near;
}

function Waterfall({ placement, isDark, index, style, compact, onResult }: { placement: ResolvedPlacement; isDark: boolean; index: number; style?: StyleProp<ViewStyle>; compact: boolean; onResult?: (filled: boolean) => void }) {
  // Decided once per mount: a slot that is over its cap stays empty.
  const [allowed] = useState(() => canShowAd(placement.slot, placement.rules));
  const [step, setStep] = useState(0);
  const [filled, setFilled] = useState(false);
  const settled = useRef<number>(-1);
  const startedAt = useRef(0);
  const boxRef = useRef<View>(null);
  const near = useNearViewport(boxRef);
  const attempt = placement.attempts[step];
  const variant = placement.variant ?? '-';
  const ev = useCallback(
    (event: string, provider: string, extra: Record<string, unknown> = {}) => queueAdEvent({ placement: placement.slot, event, provider, variant, ...extra }),
    [placement.slot, variant],
  );

  const fail = useCallback(
    (i: number, reason: string) => {
      if (settled.current >= i) return;
      settled.current = i;
      const id = placement.attempts[i].network.id;
      ev(reason === 'timeout' ? 'timeout' : 'fail', id);
      // "unsupported" (a network that cannot run here) says nothing about its health.
      if (reason !== 'unsupported') recordNetworkResult(id, false, null);
      if (__DEV__) console.log(`[ads] ${placement.slot}: ${id} ${reason}, trying next`);
      setStep(i + 1);
    },
    [placement, ev],
  );
  const load = useCallback(
    (i: number) => {
      if (settled.current >= i) return;
      settled.current = i;
      const id = placement.attempts[i].network.id;
      const latencyMs = startedAt.current ? Date.now() - startedAt.current : undefined;
      ev('fill', id, latencyMs !== undefined ? { latencyMs } : {});
      ev('impression', id);
      recordNetworkResult(id, true, latencyMs ?? null);
      recordAdShown(placement.slot);
      noteAdShown();
      setFilled(true);
      onResult?.(true);
    },
    [placement, onResult, ev],
  );

  // Request + timeout for the current step, once the slot is near the screen.
  useEffect(() => {
    if (!allowed || !attempt || filled || !near) return;
    startedAt.current = Date.now();
    ev('request', attempt.network.id);
    const t = setTimeout(() => fail(step, 'timeout'), attempt.timeoutMs);
    return () => clearTimeout(t);
  }, [allowed, attempt, step, filled, near, ev, fail]);

  // Nothing left to try (or over the cap): say so once.
  const exhausted = !allowed || !attempt;
  useEffect(() => {
    if (exhausted) onResult?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhausted]);
  if (exhausted) return null;
  return (
    <View
      ref={boxRef}
      style={[styles.box, { borderColor: isDark ? '#2A2D35' : '#ECEDF1', backgroundColor: isDark ? '#16171E' : '#FAFAFB' }, !filled && { minHeight: compact ? RESERVED_H_COMPACT : RESERVED_H }, compact && styles.compact, style]}
      accessibilityLabel="Advertisement"
    >
      <Text style={[styles.label, { color: isDark ? '#8B8F9A' : '#9A9AA0' }]}>Advertisement</Text>
      {near ? (
        <Attempt
          key={step}
          attempt={attempt}
          format={placement.format}
          compact={compact}
          isDark={isDark}
          index={index}
          refreshSec={placement.format === 'banner' ? placement.rules.refreshSec ?? 0 : 0}
          onLoad={() => load(step)}
          onFail={(r) => fail(step, r)}
          onClick={() => ev('click', attempt.network.id)}
          onRefreshed={() => ev('impression', attempt.network.id)}
          onPaid={(valueMicros, currency) => ev('paid', attempt.network.id, { valueMicros, currency })}
        />
      ) : null}
    </View>
  );
}

function Attempt({
  attempt,
  format,
  compact,
  isDark,
  index,
  onLoad,
  onFail,
  onClick,
  refreshSec,
  onRefreshed,
  onPaid,
}: {
  refreshSec: number;
  onRefreshed: () => void;
  onPaid: (valueMicros: number, currency: string) => void;
  attempt: AdAttempt;
  format: ResolvedPlacement['format'];
  compact: boolean;
  isDark: boolean;
  index: number;
  onLoad: () => void;
  onFail: (reason: string) => void;
  onClick: () => void;
}) {
  const { network, unit } = attempt;
  switch (network.type) {
    case 'gam':
    case 'adx':
      // Ad Manager: GPT on the web, the Mobile Ads SDK in the apps.
      return AD_PLATFORM === 'web' ? (
        <GamDisplay unit={unit} format={format} compact={compact} testMode={network.testMode} refreshSec={refreshSec} onRefreshed={onRefreshed} onLoad={onLoad} onFail={onFail} />
      ) : (
        <AdmobInline unit={unit} format={format} compact={compact} networkType="gam" testMode={network.testMode} onLoad={onLoad} onFail={onFail} onClick={onClick} onPaid={onPaid} />
      );
    case 'admob':
      return <AdmobInline unit={unit} format={format} compact={compact} networkType="admob" testMode={network.testMode} onLoad={onLoad} onFail={onFail} onClick={onClick} onPaid={onPaid} />;
    case 'adsense':
      return <AdSenseDisplay unit={unit} format={format} compact={compact} testMode={network.testMode} client={network.publisherId} onLoad={onLoad} onFail={onFail} />;
    case 'house':
      // A full sponsored card does not fit a one-line banner slot.
      if (compact) return <Skip onFail={onFail} />;
      return <HouseAd isDark={isDark} index={index} onLoad={onLoad} onFail={onFail} />;
    default:
      return <Skip onFail={onFail} />;
  }
}

/** A step that cannot run here: hand over to the next network after render. */
function Skip({ onFail }: { onFail: (reason: string) => void }) {
  useEffect(() => onFail('unsupported'), [onFail]);
  return null;
}

/** TopHunt's own sponsored campaigns, the last-resort fallback. */
function HouseAd({ isDark, index, onLoad, onFail }: { isDark: boolean; index: number; onLoad: () => void; onFail: (r: string) => void }) {
  const { user } = useAuth();
  const q = useSponsoredCampaigns(true);
  const campaigns = q.data ?? [];
  const pick = campaigns.length ? campaigns[index % campaigns.length] : null;
  useEffect(() => {
    if (q.isLoading) return;
    if (pick) onLoad();
    else onFail(q.isError ? 'error' : 'no_fill');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isLoading, q.isError, pick?.id]);
  if (!pick) return null;
  return <SponsoredCard row={{ kind: 'sponsored', id: `house:${index}:${pick.id}`, campaign: pick }} isDark={isDark} visible countable={!!user} />;
}

const styles = StyleSheet.create({
  box: { alignSelf: 'center', width: '100%', maxWidth: 480, borderWidth: 1, borderRadius: 16, paddingTop: 6, paddingBottom: 8, marginVertical: 12, alignItems: 'center', overflow: 'hidden' },
  compact: { marginVertical: 8, paddingTop: 3, paddingBottom: 4, borderRadius: 12 },
  label: { fontFamily: 'Urbanist-SemiBold', fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
});
