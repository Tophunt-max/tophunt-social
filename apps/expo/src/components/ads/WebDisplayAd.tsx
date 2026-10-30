/**
 * A Google Ad Manager display slot for the WEB build, on the pages people open
 * from a shared battle link (the battle page and the result page).
 *
 * - Renders nothing in the native app (AdMob owns ads there) and nothing when
 *   the admin has not switched the placement on.
 * - Reserves its height up front so the page does not jump, and collapses if
 *   Google has no ad to show.
 * - Clearly labelled, and kept away from vote / share buttons and outside the
 *   VS / winner card that gets captured for sharing.
 */
import React, { useEffect, useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { googletag, loadGpt, webAdsSupported } from '@/src/services/ads/gpt';
import { useMonetizationConfig } from '@/src/services/monetization';

type Placement = 'battlePage' | 'resultPage';

/** Mobile-first sizes; GPT picks what fits. */
const SIZES: any[] = [[300, 250], [336, 280], [320, 100], [320, 50], 'fluid'];
const RESERVED_H = 250;

export function WebDisplayAd({ placement, isDark }: { placement: Placement; isDark: boolean }) {
  const cfg = useMonetizationConfig().ads.webDisplay;
  const on = webAdsSupported() && cfg.enabled && !!cfg.adUnitPath && cfg.placements[placement] !== false;
  const rawId = useId();
  const divId = `gpt-${placement}-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [state, setState] = useState<'loading' | 'filled' | 'empty'>('loading');

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let slot: any = null;
    let onRender: ((e: any) => void) | null = null;
    void loadGpt().then((ok) => {
      if (!alive) return;
      if (!ok) return setState('empty');
      const gt = googletag();
      gt.cmd.push(() => {
        if (!alive || !document.getElementById(divId)) return;
        slot = gt.defineSlot(cfg.adUnitPath, SIZES, divId);
        if (!slot) return setState('empty');
        slot.addService(gt.pubads());
        slot.setTargeting('placement', placement);
        onRender = (e: any) => {
          if (e.slot === slot && alive) setState(e.isEmpty ? 'empty' : 'filled');
        };
        gt.pubads().addEventListener('slotRenderEnded', onRender);
        gt.enableServices();
        gt.display(divId);
      });
    });
    return () => {
      alive = false;
      const gt = googletag();
      if (gt?.cmd && (slot || onRender)) {
        gt.cmd.push(() => {
          if (onRender) gt.pubads().removeEventListener('slotRenderEnded', onRender);
          if (slot) gt.destroySlots([slot]);
        });
      }
    };
  }, [on, cfg.adUnitPath, divId, placement]);

  if (!on || state === 'empty') return null;
  return (
    <View style={[styles.box, { borderColor: isDark ? '#2A2D35' : '#ECEDF1', backgroundColor: isDark ? '#16171E' : '#FAFAFB' }]} accessibilityLabel="Advertisement">
      <Text style={[styles.label, { color: isDark ? '#8B8F9A' : '#9A9AA0' }]}>Advertisement</Text>
      <View nativeID={divId} style={[styles.slot, state === 'loading' && { minHeight: RESERVED_H }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'center', width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 16, paddingTop: 6, paddingBottom: 8, marginTop: 24, alignItems: 'center', overflow: 'hidden' },
  label: { fontFamily: 'Urbanist-SemiBold', fontSize: 10, letterSpacing: 0.8, marginBottom: 4 },
  slot: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
