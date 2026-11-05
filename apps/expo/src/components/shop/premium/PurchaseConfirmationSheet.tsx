/**
 * Branded bottom sheet for buying one digital item: preview, price, balance
 * before → after, refund note, Confirm / Cancel, a busy state, the error
 * states the server can answer with, and the success reveal.
 *
 * It only renders; useDigitalPurchase owns the request id and the mutation,
 * so a double tap, a close while busy or a retry can never submit twice.
 */
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { Ionicons } from '@/src/components/shop/ShopGlyphs';
import { balanceAfter, isShort, TYPE_SINGULAR, type PurchaseErrorView } from '@/src/lib/shopModel';
import { BRAND, BRAND_BUTTON, TH, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { StoreItemView } from '@/src/services/monetization';
import { ProductPreview } from './ProductPreview';
import { PurchaseSuccessAnimation } from './PurchaseSuccessAnimation';
import { RarityBadge } from './RarityBadge';

export type PurchasePhase = 'confirm' | 'busy' | 'error' | 'success';

export interface PurchaseSheetState {
  item: StoreItemView;
  phase: PurchasePhase;
  error: PurchaseErrorView | null;
}

export function PurchaseConfirmationSheet({
  state, p, viewer, live, dpcoin, onConfirm, onClose, onEquip, onEarn,
}: {
  state: PurchaseSheetState | null;
  p: TophuntPalette;
  viewer: Viewer;
  live: boolean;
  dpcoin: number;
  onConfirm: () => void;
  onClose: () => void;
  onEquip: () => void;
  onEarn: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  if (!state) return null;
  const { item, phase, error } = state;
  const busy = phase === 'busy';
  const close = () => {
    if (!busy) onClose();
  };
  const short = isShort(dpcoin, item.priceCoins, live);
  const after = balanceAfter(dpcoin, item.priceCoins, live);

  return (
    <Modal visible transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={close} statusBarTranslucent>
      <View style={styles.layer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Band karo" disabled={busy} />
        <Animated.View
          entering={reduce ? undefined : FadeInUp.springify().damping(18)}
          style={[styles.sheet, { backgroundColor: p.card, borderColor: p.border, paddingBottom: Math.max(16, insets.bottom + 8) }]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: p.border }]} />
          <View style={styles.top}>
            <Text style={[styles.kicker, { color: BRAND }]}>
              {phase === 'success' ? 'PURCHASE COMPLETE' : 'CONFIRM PURCHASE'}
            </Text>
            <TouchableOpacity onPress={close} disabled={busy} style={[styles.closeBtn, { backgroundColor: p.cardAlt, opacity: busy ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel="Band karo">
              <CloseIcon size={18} color={p.text} />
            </TouchableOpacity>
          </View>

          <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 4 }}>
            {phase === 'success' ? (
              <PurchaseSuccessAnimation item={item} viewer={viewer} p={p} onEquip={onEquip} onContinue={onClose} />
            ) : (
              <>
                <View style={styles.itemRow}>
                  <ProductPreview item={item} viewer={viewer} width={108} height={108} radius={TH.radii.lg} />
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <RarityBadge rarity={item.rarity} />
                    <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{item.name}</Text>
                    <Text style={[styles.type, { color: p.sub }]}>{TYPE_SINGULAR[item.type] ?? item.type} · Permanent</Text>
                  </View>
                </View>

                <View style={[styles.ledger, { backgroundColor: p.cardAlt, borderColor: p.border }]}>
                  <LedgerRow p={p} label="Price" value={item.priceCoins} strong />
                  <LedgerRow p={p} label="Abhi aapke paas" value={live ? dpcoin : null} />
                  <View style={[styles.sep, { backgroundColor: p.border }]} />
                  <LedgerRow p={p} label="Kharidne ke baad" value={after} tone={after !== null && after < 0 ? 'bad' : 'good'} />
                </View>

                <View style={styles.note}>
                  <Ionicons name={item.refundable ? 'shield-checkmark-outline' : 'information-circle-outline'} size={14} color={p.sub} />
                  <Text style={[styles.noteText, { color: p.sub }]}>
                    {item.refundable ? 'Hamesha ke liye aapka. Refund support se request kar sakte ho.' : 'Hamesha ke liye aapka. Ye item refundable nahi hai.'}
                  </Text>
                </View>

                {error ? <ErrorBox p={p} error={error} /> : short ? (
                  <ErrorBox p={p} error={{ kind: 'insufficient', title: 'DP coin kam hai', message: `Is item ke liye ${(item.priceCoins - dpcoin).toLocaleString()} DP coin aur chahiye. Contest jeeto aur kamao.`, retrySameRequest: false, refresh: false }} />
                ) : null}

                <Actions
                  p={p}
                  busy={busy}
                  short={short}
                  error={error}
                  price={item.priceCoins}
                  onConfirm={onConfirm}
                  onClose={close}
                  onEquip={onEquip}
                  onEarn={onEarn}
                />
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function LedgerRow({ p, label, value, strong, tone }: { p: TophuntPalette; label: string; value: number | null; strong?: boolean; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? TH.colors.danger : p.text;
  return (
    <View style={styles.ledgerRow} accessible accessibilityLabel={`${label}: ${value === null ? 'load ho raha hai' : `${value} DP coin`}`}>
      <Text style={[styles.ledgerLabel, { color: p.sub }]}>{label}</Text>
      <View style={styles.ledgerValue}>
        <CoinIcon size={strong ? 23 : 20} />
        <Text style={[strong ? styles.ledgerStrong : styles.ledgerText, { color }]}>{value === null ? '—' : value.toLocaleString()}</Text>
      </View>
    </View>
  );
}

function ErrorBox({ p, error }: { p: TophuntPalette; error: PurchaseErrorView }) {
  const icon = error.kind === 'owned' ? 'checkmark-circle' : 'alert-circle';
  const warn = error.kind === 'owned' ? TH.colors.success : error.kind === 'price_changed' || error.kind === 'network' ? TH.colors.goldDeep : TH.colors.danger;
  return (
    <View style={[styles.error, { backgroundColor: `${warn}18`, borderColor: `${warn}55` }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={16} color={warn} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.errorTitle, { color: p.text }]}>{error.title}</Text>
        <Text style={[styles.errorText, { color: p.sub }]}>{error.message}</Text>
      </View>
    </View>
  );
}

function Actions({
  p, busy, short, error, price, onConfirm, onClose, onEquip, onEarn,
}: {
  p: TophuntPalette; busy: boolean; short: boolean; error: PurchaseErrorView | null; price: number;
  onConfirm: () => void; onClose: () => void; onEquip: () => void; onEarn: () => void;
}) {
  const kind = error?.kind;
  let primary: { label: string; onPress: () => void; icon: string } | null;
  let secondary = { label: 'Cancel', onPress: onClose };
  if (kind === 'owned') primary = { label: 'Equip karo', onPress: onEquip, icon: 'sparkles' };
  else if (kind === 'insufficient' || (!error && short)) primary = { label: 'Kamao', onPress: onEarn, icon: 'trophy' };
  else if (kind === 'unavailable' || kind === 'store_closed' || kind === 'revoked') {
    primary = null;
    secondary = { label: 'Theek hai', onPress: onClose };
  } else if (kind === 'network' || kind === 'other') primary = { label: 'Dobara try karo', onPress: onConfirm, icon: 'refresh' };
  else if (kind === 'price_changed') primary = { label: `${price.toLocaleString()} mein kharido`, onPress: onConfirm, icon: 'flash' };
  else primary = { label: `Confirm · ${price.toLocaleString()} DP coin`, onPress: onConfirm, icon: 'flash' };

  return (
    <View style={styles.actions}>
      {primary ? (
        <TouchableOpacity
          onPress={primary.onPress}
          disabled={busy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          accessibilityLabel={busy ? 'Purchase ho raha hai' : primary.label}
        >
          <LinearGradient
            colors={BRAND_BUTTON}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.primary, busy && { opacity: 0.75 }]}
          >
            {busy ? (
              <>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.primaryText}>Ho raha hai…</Text>
              </>
            ) : (
              <>
                <Ionicons name={primary.icon} size={16} color="#FFF" />
                <Text style={styles.primaryText}>{primary.label}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={secondary.onPress} disabled={busy} style={[styles.secondary, { borderColor: p.border, opacity: busy ? 0.4 : 1 }]} accessibilityRole="button">
        <Text style={[styles.secondaryText, { color: p.text }]}>{secondary.label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, backgroundColor: 'rgba(4,4,14,0.72)', justifyContent: 'flex-end', paddingHorizontal: 8 },
  sheet: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '92%', borderTopLeftRadius: TH.radii.xxl, borderTopRightRadius: TH.radii.xxl, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  kicker: { fontFamily: TH.fonts.bold, fontSize: 11, letterSpacing: 1.6 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontFamily: TH.fonts.bold, fontSize: 19 },
  type: { fontFamily: TH.fonts.medium, fontSize: 12.5 },
  ledger: { marginTop: 16, borderRadius: TH.radii.md, borderWidth: 1, padding: 12, gap: 8 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ledgerLabel: { fontFamily: TH.fonts.medium, fontSize: 13 },
  ledgerValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ledgerText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  ledgerStrong: { fontFamily: TH.fonts.bold, fontSize: 17 },
  sep: { height: 1 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 12 },
  noteText: { flex: 1, fontFamily: TH.fonts.medium, fontSize: 12, lineHeight: 17 },
  error: { flexDirection: 'row', gap: 8, borderRadius: TH.radii.md, borderWidth: 1, padding: 12, marginTop: 14 },
  errorTitle: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  errorText: { fontFamily: TH.fonts.medium, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  actions: { gap: 10, marginTop: 18 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: TH.radii.md },
  primaryText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 15 },
  secondary: { height: 46, borderRadius: TH.radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: TH.fonts.bold, fontSize: 14 },
});
