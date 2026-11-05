/**
 * The sticky bottom bar of the item detail screen (no BottomNav on this
 * page), above the safe-area inset. What it offers comes from buyBarState
 * (src/lib/shopItemModel.ts): buy, earn when short, sale ended / coming
 * soon, equip / unequip when owned, or sign in.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { coinsShort, type BuyBarState } from '@/src/lib/shopItemModel';
import { discountOf } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { BRAND, BRAND_BUTTON, TH, type TophuntPalette } from '@/src/theme/tophunt';

export interface BuyBarActions {
  onBuy: () => void;
  onEarn: () => void;
  onEquip: () => void;
  onUnequip: () => void;
  onCollection: () => void;
  onSignIn: () => void;
}

function Primary({ label, icon, onPress, busy, disabled, p }: { label: string; icon?: string; onPress?: () => void; busy?: boolean; disabled?: boolean; p: TophuntPalette }) {
  const off = !!disabled || !!busy;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={styles.primaryWrap}
    >
      <LinearGradient
        colors={disabled ? [p.cardAlt, p.cardAlt] : BRAND_BUTTON}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.btn, busy && { opacity: 0.75 }]}
      >
        {busy ? <ActivityIndicator size="small" color={TH.colors.white} /> : icon ? <Ionicons name={icon} size={16} color={disabled ? p.sub : TH.colors.white} /> : null}
        <Text style={[styles.btnText, { color: disabled ? p.sub : TH.colors.white }]} numberOfLines={1}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function Secondary({ label, icon, onPress, busy, p, grow = true }: { label: string; icon?: string; onPress: () => void; busy?: boolean; p: TophuntPalette; grow?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!!busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      style={[styles.btn, styles.secondary, { borderColor: BRAND, backgroundColor: p.card }, grow && { flex: 1 }]}
    >
      {busy ? <ActivityIndicator size="small" color={BRAND} /> : icon ? <Ionicons name={icon} size={16} color={BRAND} /> : null}
      <Text style={[styles.btnText, { color: BRAND }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function PriceBlock({ item, p, muted, note }: { item: StoreItemView; p: TophuntPalette; muted?: boolean; note?: string | null }) {
  const pct = discountOf(item);
  return (
    <View style={styles.left} accessible accessibilityLabel={`${item.priceCoins} DP coin${note ? `. ${note}` : ''}`}>
      <View style={styles.row}>
        <CoinIcon size={28} muted={muted} />
        <Text style={[styles.price, { color: muted ? p.sub : p.text }]} numberOfLines={1}>{item.priceCoins.toLocaleString()}</Text>
        {pct > 0 ? <Text style={[styles.was, { color: p.sub }]} numberOfLines={1}>{Number(item.compareAtCoins).toLocaleString()}</Text> : null}
      </View>
      {note ? <Text style={[styles.note, { color: muted ? BRAND : p.sub }]} numberOfLines={1}>{note}</Text> : null}
    </View>
  );
}

export function ItemBuyBar({
  state, item, p, live, dpcoin, buying, equipping, bottomInset, onLayout, actions,
}: {
  state: BuyBarState;
  item: StoreItemView;
  p: TophuntPalette;
  live: boolean;
  dpcoin: number;
  buying: boolean;
  /** Equip / unequip request in flight. */
  equipping: boolean;
  bottomInset: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  actions: BuyBarActions;
}) {
  let content: React.ReactNode;
  switch (state) {
    case 'signin':
      content = (
        <>
          <PriceBlock item={item} p={p} />
          <Primary p={p} label="Sign in karke kharido" icon="log-in-outline" onPress={actions.onSignIn} />
        </>
      );
      break;
    case 'short': {
      const need = coinsShort(dpcoin, item.priceCoins, live);
      content = (
        <>
          <PriceBlock item={item} p={p} muted note={need ? `${need.toLocaleString()} DP coin aur chahiye` : null} />
          <Secondary p={p} label="DP coin kamao" icon="trophy" onPress={actions.onEarn} />
        </>
      );
      break;
    }
    case 'ended':
    case 'soon':
      content = (
        <>
          <PriceBlock item={item} p={p} muted />
          <Primary p={p} label={state === 'ended' ? 'Sale khatam ho gayi' : 'Jaldi aa raha hai'} icon={state === 'ended' ? 'time' : 'calendar-outline'} disabled />
        </>
      );
      break;
    case 'equip':
      content = (
        <>
          <Secondary p={p} label="My Collection" onPress={actions.onCollection} grow={false} />
          <Primary p={p} label="Equip Now" icon="sparkles" onPress={actions.onEquip} busy={equipping} />
        </>
      );
      break;
    case 'equipped':
      content = (
        <>
          <View style={[styles.left, styles.row]} accessible accessibilityLabel="Equipped">
            <Ionicons name="checkmark-circle" size={22} color={TH.colors.success} />
            <Text style={[styles.equipped, { color: TH.colors.success }]}>Equipped</Text>
          </View>
          <Secondary p={p} label="Hatao" icon="eye-off-outline" onPress={actions.onUnequip} busy={equipping} />
        </>
      );
      break;
    case 'owned':
      content = (
        <>
          <View style={[styles.left, styles.row]} accessible accessibilityLabel="Owned">
            <Ionicons name="checkmark-circle" size={22} color={TH.colors.success} />
            <Text style={[styles.equipped, { color: TH.colors.success }]}>Owned</Text>
          </View>
          <Primary p={p} label="My Collection" icon="grid" onPress={actions.onCollection} />
        </>
      );
      break;
    case 'buy':
    default:
      content = (
        <>
          <PriceBlock item={item} p={p} />
          <Primary p={p} label="Abhi kharido" icon="flash" onPress={actions.onBuy} busy={buying} />
        </>
      );
  }
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.bar,
        { backgroundColor: p.card, borderTopColor: p.border, paddingBottom: Math.max(bottomInset, 10) },
        !p.isDark && styles.shadow,
      ]}
    >
      <View style={styles.inner}>{content}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingTop: 10 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 8 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 16 },
  left: { flexShrink: 1, minWidth: 0, gap: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontFamily: TH.fonts.bold, fontSize: 22 },
  was: { fontFamily: TH.fonts.medium, fontSize: 13, textDecorationLine: 'line-through', marginTop: 3 },
  note: { fontFamily: TH.fonts.semibold, fontSize: 11.5 },
  equipped: { fontFamily: TH.fonts.bold, fontSize: 16 },
  primaryWrap: { flex: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: TH.radii.md, paddingHorizontal: 16 },
  secondary: { borderWidth: 1.5 },
  btnText: { fontFamily: TH.fonts.bold, fontSize: 15 },
});
