/**
 * After a confirmed purchase: the item scales and fades in with a one-shot
 * sparkle burst and a success haptic (native only). Under reduced motion it
 * appears without movement and without the burst (SparkleBurst renders
 * nothing then).
 */
import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SparkleBurst } from '@/src/components/gamification/SparkleBurst';
import { Ionicons } from '@/src/lib/icons';
import { TH, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { ProductPreview } from './ProductPreview';
import { RarityBadge } from './RarityBadge';

export function PurchaseSuccessAnimation({
  item, viewer, p, onEquip, onContinue,
}: { item: StoreItemView; viewer: Viewer; p: TophuntPalette; onEquip: () => void; onContinue: () => void }) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.6);
  const fade = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    AccessibilityInfo.announceForAccessibility?.(`${item.name} ab aapka hai.`);
    if (reduce) return;
    scale.value = withSpring(1, { damping: 11, stiffness: 140 });
    fade.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [reduce, scale, fade, item.name]);

  const textFade = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) textFade.value = withDelay(180, withTiming(1, { duration: 300 }));
  }, [reduce, textFade]);

  const art = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: scale.value }] }));
  const copy = useAnimatedStyle(() => ({ opacity: textFade.value, transform: [{ translateY: (1 - textFade.value) * 8 }] }));

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <View style={styles.stageWrap}>
        <Animated.View style={art}>
          <ProductPreview item={item} viewer={viewer} width={170} height={170} radius={TH.radii.xxl} />
        </Animated.View>
        <SparkleBurst playKey={item.itemId} size={200} />
        <View style={styles.check} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={30} color={TH.colors.success} />
        </View>
      </View>
      <Animated.View style={[styles.copy, copy]}>
        <RarityBadge rarity={item.rarity} size="md" />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Ab ye aapka hai!</Text>
        <Text style={[styles.sub, { color: p.sub }]}>{item.name} aapke collection mein add ho gaya. Equip karo aur sab ko dikhao.</Text>
      </Animated.View>
      <TouchableOpacity onPress={onEquip} activeOpacity={0.85} accessibilityRole="button" style={{ alignSelf: 'stretch' }}>
        <LinearGradient colors={[TH.colors.royal, TH.colors.primary, TH.colors.electric]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
          <Ionicons name="sparkles" size={16} color="#FFF" />
          <Text style={styles.primaryText}>Equip karo</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity onPress={onContinue} style={[styles.secondary, { borderColor: p.border }]} accessibilityRole="button">
        <Text style={[styles.secondaryText, { color: p.text }]}>Shopping jaari rakho</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14, paddingTop: 6 },
  stageWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute', bottom: 6, right: 6, backgroundColor: '#FFF', borderRadius: 16 },
  copy: { alignItems: 'center', gap: 6 },
  title: { fontFamily: TH.fonts.bold, fontSize: 22, textAlign: 'center' },
  sub: { fontFamily: TH.fonts.medium, fontSize: 13.5, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: TH.radii.md },
  primaryText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 15 },
  secondary: { alignSelf: 'stretch', height: 46, borderRadius: TH.radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: TH.fonts.bold, fontSize: 14 },
});
