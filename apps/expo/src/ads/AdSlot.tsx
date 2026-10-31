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

export function AdSlot({ slot, isDark, index = 0, style }: { slot: AdSlotKey; isDark: boolean; index?: number; style?: StyleProp<ViewStyle> }) {
  const placement = useAdPlacement(slot);
  if (!placement || placement.format === 'interstitial' || placement.format === 'rewarded') return null;
  return <Waterfall key={`${slot}:${index}`} placement={placement} isDark={isDark} index={index} style={style} />;
}

function Waterfall({ placement, isDark, index, style }: { placement: ResolvedPlacement; isDark: boolean; index: number; style?: StyleProp<ViewStyle> }) {
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
    },
    [placement],
  );

  // Request + timeout for the current step.
  useEffect(() => {
    if (!allowed || !attempt || filled) return;
    queueAdEvent({ placement: placement.slot, event: 'request', provider: attempt.network.id });
    const t = setTimeout(() => fail(step, 'timeout'), attempt.timeoutMs);
    return () => clearTimeout(t);
  }, [allowed, attempt, step, filled, placement.slot, fail]);

  if (!allowed || !attempt) return null;
  return (
    <View
      style={[styles.box, { borderColor: isDark ? '#2A2D35' : '#ECEDF1', backgroundColor: isDark ? '#16171E' : '#FAFAFB' }, !filled && { minHeight: RESERVED_H }, style]}
      accessibilityLabel="Advertisement"
    >
      <Text style={[styles.label, { color: isDark ? '#8B8F9A' : '#9A9AA0' }]}>Advertisement</Text>
      <Attempt
        key={step}
        attempt={attempt}
        format={placement.format}
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
  isDark,
  index,
  onLoad,
  onFail,
  onClick,
}: {
  attempt: AdAttempt;
  format: ResolvedPlacement['format'];
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
        <GamDisplay unit={unit} format={format} testMode={network.testMode} onLoad={onLoad} onFail={onFail} />
      ) : (
        <AdmobInline unit={unit} format={format} networkType="gam" testMode={network.testMode} onLoad={onLoad} onFail={onFail} onClick={onClick} />
      );
    case 'admob':
      return <AdmobInline unit={unit} format={format} networkType="admob" testMode={network.testMode} onLoad={onLoad} onFail={onFail} onClick={onClick} />;
    case 'adsense':
      return <AdSenseDisplay unit={unit} format={format} testMode={network.testMode} client={network.publisherId} onLoad={onLoad} onFail={onFail} />;
    case 'house':
      return <HouseAd isDark={isDark} index={index} onLoad={onLoad} onFail={onFail} />;
    default:
      onFail('unsupported');
      return null;
  }
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
  label: { fontFamily: 'Urbanist-SemiBold', fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
});
