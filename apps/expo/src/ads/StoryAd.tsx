/**
 * Ads in the story viewer, between one person's stories and the next:
 *
 *  - apps: a full-screen (video) interstitial from the `story_between` slot,
 *    shown only if one is already preloaded, so nobody waits;
 *  - otherwise (and on the web): an ad page from the `story_card` slot inside
 *    the viewer, skippable after 3 s and closed by itself after 10 s.
 *
 * "After every N people" comes from the slot's first position / interval.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AdSlot } from './AdSlot';
import { canShowAd } from './frequency';
import { useInterstitial } from './fullscreen';
import { useAdPlacement, type PlacementRules } from './placements';

const SKIP_AFTER_S = 3;
const AUTO_CLOSE_S = 10;

/** Person transitions in this app session (shared across viewer mounts). */
let transitions = 0;

const due = (n: number, r: PlacementRules) => n >= r.firstPosition && (n - r.firstPosition) % Math.max(1, r.interval) === 0;

/**
 * `beforeNextPerson(go)`: call when moving to the next person's stories. It
 * runs `go` straight away, or after an ad. `overlay` must be rendered.
 */
export function useStoryAds() {
  const between = useAdPlacement('story_between');
  const card = useAdPlacement('story_card');
  const showInterstitial = useInterstitial('story_between');
  const [pending, setPending] = useState<null | (() => void)>(null);

  const beforeNextPerson = useCallback(
    (go: () => void) => {
      transitions += 1;
      const n = transitions;
      const tryCard = () => {
        if (card && due(n, card.rules) && canShowAd('story_card', card.rules)) setPending(() => go);
        else go();
      };
      if (between && due(n, between.rules)) {
        void showInterstitial().then((shown) => (shown ? go() : tryCard()));
        return;
      }
      tryCard();
    },
    [between, card, showInterstitial],
  );

  const done = useCallback(() => {
    setPending((g) => {
      g?.();
      return null;
    });
  }, []);

  const overlay = pending ? <StoryAdPage onDone={done} /> : null;
  return { beforeNextPerson, overlay, showingAd: !!pending };
}

function StoryAdPage({ onDone }: { onDone: () => void }) {
  const [left, setLeft] = useState(SKIP_AFTER_S);
  const [elapsed, setElapsed] = useState(0);
  const closed = useRef(false);
  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const t = setInterval(() => {
      setLeft((x) => Math.max(0, x - 1));
      setElapsed((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (elapsed >= AUTO_CLOSE_S) close();
  }, [elapsed, close]);

  return (
    <View style={styles.page} accessibilityViewIsModal>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, (elapsed / AUTO_CLOSE_S) * 100)}%` }]} />
      </View>
      <Text style={styles.kicker}>Sponsored</Text>
      <View style={styles.adWrap}>
        {/* Nothing to show: continue to the next person at once. */}
        <AdSlot slot="story_card" isDark onResult={(filled) => !filled && close()} />
      </View>
      <Pressable
        onPress={left === 0 ? close : undefined}
        disabled={left > 0}
        style={[styles.skip, left > 0 && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={left > 0 ? `Skip in ${left} seconds` : 'Skip ad'}
      >
        <Text style={styles.skipText}>{left > 0 ? `Skip in ${left}` : 'Skip ›'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0B0B10', zIndex: 50, alignItems: 'center', justifyContent: 'center', padding: 16 },
  bar: { position: 'absolute', top: 54, left: 12, right: 12, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#FFF' },
  kicker: { position: 'absolute', top: 66, left: 16, color: 'rgba(255,255,255,0.8)', fontFamily: 'Urbanist-Bold', fontSize: 13 },
  adWrap: { width: '100%', maxWidth: 420 },
  skip: { position: 'absolute', bottom: 48, right: 20, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 100, paddingHorizontal: 18, paddingVertical: 10 },
  skipText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 14 },
});
