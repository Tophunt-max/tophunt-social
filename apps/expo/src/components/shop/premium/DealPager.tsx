/**
 * Shared pieces of the "Special Offers & Daily Deals" block (phone and
 * desktop homes):
 *
 *  - DealPager: admin deal cards side by side in a horizontal paging
 *    ScrollView (native momentum paging, CSS scroll-snap on web), with pager
 *    dots. A ScrollView rather than the hero's Gesture.Pan: deals never
 *    autoplay, so the platform's own paging gives the expected feel, keyboard
 *    and screen-reader scrolling for free. One card = no pager, no dots.
 *    Dot / screen-reader page changes jump without animation under reduced motion.
 *  - DealTimerPill: the red "⏱ 12:36:59" pill, only for a real future end.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@/src/lib/icons';
import { dealTimerLabel } from '@/src/lib/shopModel';
import { TH } from '@/src/theme/tophunt';
import { MOCK_M, mfont, px } from './mock';

/** Red "⏱ 12:36:59" pill: only for a real future end; ticks every second when ≤ 7 days away, else every minute. */
export function DealTimerPill({ endsAt, u }: { endsAt: number; u: number }) {
  const [now, setNow] = useState(() => Date.now());
  const near = endsAt - now <= 7 * 86_400_000;
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), near ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [near, endsAt]);
  const label = dealTimerLabel(endsAt, now);
  if (!label) return null;
  const D = MOCK_M.deals;
  const fs = mfont(D.timer, u);
  return (
    <View style={[styles.timer, { height: px(D.timerH, u), borderRadius: px(D.timerH / 2, u), paddingHorizontal: px(7, u), gap: px(3, u), marginRight: px(2, u) }]} accessible accessibilityLabel={`Deal ${label} mein khatam`}>
      <Ionicons name="time" size={fs} color="#FFF" />
      <Text style={[styles.timerText, { fontSize: fs }]}>{label}</Text>
    </View>
  );
}

export function DealPager({
  count, width, u, renderPage, onIndex, labelOf, dotSize = 5,
}: {
  count: number;
  /** Page width (= the card width). */
  width: number;
  u: number;
  renderPage: (i: number) => React.ReactNode;
  /** The page now in view (for a header timer). */
  onIndex?: (i: number) => void;
  /** Screen-reader name of page i. */
  labelOf: (i: number) => string;
  dotSize?: number;
}) {
  const ref = useRef<ScrollView>(null);
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= count && count > 0) {
      setIndex(0);
      ref.current?.scrollTo({ x: 0, animated: false });
    }
  }, [index, count]);
  useEffect(() => {
    onIndex?.(Math.min(index, Math.max(0, count - 1)));
  }, [index, count, onIndex]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      const i = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
      setIndex((cur) => (cur === i ? cur : i));
    },
    [width, count],
  );
  const goTo = useCallback(
    (i: number) => {
      const next = ((i % count) + count) % count;
      ref.current?.scrollTo({ x: next * width, animated: !reduce });
      setIndex(next);
    },
    [count, width, reduce],
  );
  const onA11y = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') goTo(index + 1);
    else if (e.nativeEvent.actionName === 'decrement') goTo(index - 1);
  };

  if (count <= 1) return <>{count === 1 ? renderPage(0) : null}</>;
  const d = px(dotSize, u);
  return (
    <View style={{ width }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        snapToInterval={width}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ width, overflow: 'visible' }}
      >
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={{ width }}
            accessibilityElementsHidden={i !== index}
            importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
          >
            {renderPage(i)}
          </View>
        ))}
      </ScrollView>
      <View
        style={[styles.dots, { gap: px(4, u), marginTop: px(6, u) }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Deal ${index + 1} / ${count}: ${labelOf(index)}`}
        accessibilityActions={[{ name: 'increment', label: 'Agla deal' }, { name: 'decrement', label: 'Pichla deal' }]}
        onAccessibilityAction={onA11y}
      >
        {Array.from({ length: count }, (_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goTo(i)}
            hitSlop={8}
            accessible={false}
            style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: i === index ? '#F472B6' : 'rgba(255,255,255,0.4)' }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444' },
  timerText: { color: '#FFF', fontFamily: TH.fonts.bold, fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});
