/**
 * Heart toggle for the Shop wishlist (worker lib/wishlist.ts). Filled brand
 * pink when the item is on the list. The outline `color` defaults to white
 * for the dark bubble / art stage; pass p.sub (or p.text) on a page surface. Optimistic with rollback (useToggleWishlist);
 * a refusal from the server (list full, item gone) is explained in an alert.
 * Renders nothing for signed-out viewers or while the store is off.
 */
import React from 'react';
import { Platform, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Heart from 'lucide-react-native/icons/heart';
import { Alert } from '@/src/lib/appAlert';
import { useAuth } from '@/src/hooks/useAuth';
import { useMonetizationConfig, useToggleWishlist, useWishlist } from '@/src/services/monetization';
import { TH } from '@/src/theme/tophunt';

export function WishlistHeart({
  itemId, name, size = 16, style, color = '#FFFFFF', bubble = true, hitSlop = 8,
}: { itemId: string; name?: string; size?: number; style?: StyleProp<ViewStyle>; color?: string; bubble?: boolean; hitSlop?: number }) {
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const enabled = !!user && cfg.store.enabled;
  const list = useWishlist(enabled);
  const toggle = useToggleWishlist();
  if (!enabled) return null;
  const on = !!list.data?.includes(itemId);
  const box = Math.round(size * 1.9);
  const onPress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    toggle.mutate(
      { itemId, on: !on },
      {
        onError: (e: any) => {
          const reason = e?.reason;
          Alert.alert(
            'Wishlist update nahi hui',
            reason === 'wishlist_full' || reason === 'item_unavailable' ? e?.message : 'Network issue. Thodi der baad try karo.',
          );
        },
      },
    );
  };
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={hitSlop}
      activeOpacity={0.8}
      disabled={list.isLoading}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled: list.isLoading }}
      accessibilityLabel={`${name ? `${name}: ` : ''}${on ? 'Wishlist se hatao' : 'Wishlist mein daalo'}`}
      style={[bubble && [styles.bubble, { width: box, height: box, borderRadius: box / 2 }], style]}
    >
      <Heart size={size} color={on ? TH.colors.primary : color} fill={on ? TH.colors.primary : 'transparent'} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bubble: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
});
