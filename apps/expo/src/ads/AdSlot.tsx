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
 * - Diagnostics (request / fill / fail per network) go to the ad report.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '@/src/hooks/useAuth';
import { SponsoredCard } from '@/src/components/home/SponsoredCard';
import { queueAdEvent, useSponsoredCampaigns } from '@/src/services/monetization';
import { canShowAd, recordAdShown } from './frequency';
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

function Waterfall({ placement, isDark, index, style, compact, onResult }: { placement: ResolvedPlacement; isDark: boolean; index: number; style?: StyleProp<ViewStyle>; compact: boolean; onResult?: (filled: boolean) => void }) {
  // Decided once per mount: a slot that is over its cap stays empty.
  const [allowed] = useState(() => canShowAd(placement.slot, placement.rules));
  const [step, setStep] = useState(0);
  const [filled, setFilled] = useState(false);
  const settled = useRef<number>(-1);
  const attempt = placement.attempts[step];

  const fail = useCallback(
    (i: number, reason: string) => {
      if (settled.current >= i) return;
      settled.current = i;
      queueAdEvent({ placement: placement.slot, event: 'fail', provider: placement.attempts[i].network.id });
      if (__DEV__) console.log(`[ads] ${placement.slot}: ${placement.attempts[i].network.id} ${reason}, trying next`);
      setStep(i + 1);
    },
    [placement],
  );
  const load = useCallback(
    (i: number) => {
      if (settled.current >= i) return;
      settled.current = i;
      queueAdEvent({ placement: placement.slot, event: 'fill', provider: placement.attempts[i].network.id });
      queueAdEvent({ placement: placement.slot, event: 'impression', provider: placement.attempts[i].network.id });
      recordAdShown(placement.slot);
      setFilled(true);
      onResult?.(true);
    },
    [placement, onResult],
  );

  // Request + timeout for the current step.
  useEffect(() => {
    if (!allowed || !attempt || filled) return;
    queueAdEvent({ placement: placement.slot, event: 'request', provider: attempt.network.id });
    const t = setTimeout(() => fail(step, 'timeout'), attempt.timeoutMs);
    return () => clearTimeout(t);
  }, [allowed, attempt, step, filled, placement.slot, fail]);

  // Nothing left to try (or over the cap): say so once.
  const exhausted = !allowed || !attempt;
  useEffect(() => {
    if (exhausted) onResult?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhausted]);
  if (exhausted) return null;
  return (
    <View
      style={[styles.box, { borderColor: isDark ? '#2A2D35' : '#ECEDF1', backgroundColor: isDark ? '#16171E' : '#FAFAFB' }, !filled && { minHeight: compact ? RESERVED_H_COMPACT : RESERVED_H }, compact && styles.compact, style]}
      accessibilityLabel="Advertisement"
    >
      <Text style={[styles.label, { color: isDark ? '#8B8F9A' : '#9A9AA0' }]}>Advertisement</Text>
      <Attempt
        key={step}
        attempt={attempt}
        format={placement.format}
        compact={compact}
        isDark={isDark}
        index={index}
        onLoad={() => load(step)}
        onFail={(r) => fail(step, r)}
        onClick={() => queueAdEvent({ placement: placement.slot, event: 'click', provider: attempt.network.id })}
      />
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
}: {
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
        <GamDisplay unit={unit} format={format} compact={compact} testMode={network.testMode} onLoad={onLoad} onFail={onFail} />
      ) : (
        <AdmobInline unit={unit} format={format} compact={compact} networkType="gam" testMode={network.testMode} onLoad={onLoad} onFail={onFail} onClick={onClick} />
      );
    case 'admob':
      return <AdmobInline unit={unit} format={format} compact={compact} networkType="admob" testMode={network.testMode} onLoad={onLoad} onFail={onFail} onClick={onClick} />;
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
