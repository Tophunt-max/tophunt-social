/**
 * Bottom sheet for buying a Diamond bundle: the bundle art, what you get
 * (items you already own are marked and are not granted again), the Diamond
 * price, balance before → after, Confirm / Cancel, a busy state, the server's
 * error answers and the success state ("Equip karo").
 *
 * It only renders; useBundlePurchase owns the request id and the mutation,
 * so a double tap, a close while busy or a retry can never submit twice.
 * Same look as PurchaseConfirmationSheet (which is built for one DP coin item).
 */
import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Ionicons } from '@/src/lib/icons';
import { balanceAfter, bundleItemsLine, bundleOwnedNote, isShort, TYPE_SINGULAR, type BundleErrorView } from '@/src/lib/shopModel';
import { BRAND, BRAND_BUTTON, SHOP_BUNDLE_GRAD, TH, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import type { Viewer } from '@/src/components/shop/DigitalItemCard';
import type { PublicShopBundle } from '@/src/services/monetization';
import { BundleArt } from './ShopBundles';

export type BundlePhase = 'confirm' | 'busy' | 'error' | 'success';

export interface BundleSheetState {
  bundle: PublicShopBundle;
  phase: BundlePhase;
  error: BundleErrorView | null;
  /** Items the server granted (success only). */
  granted?: number;
}

export function BundleConfirmSheet({
  state, p, viewer, live, diamonds, onConfirm, onClose, onEquip, onEarn,
}: {
  state: BundleSheetState | null;
  p: TophuntPalette;
  viewer: Viewer;
  live: boolean;
  diamonds: number;
  onConfirm: () => void;
  onClose: () => void;
  onEquip: () => void;
  onEarn: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  if (!state) return null;
  const { bundle, phase, error } = state;
  const busy = phase === 'busy';
  const close = () => {
    if (!busy) onClose();
  };
  const price = bundle.priceDiamonds;
  const short = isShort(diamonds, price, live);
  const after = balanceAfter(diamonds, price, live);
  const note = bundleOwnedNote(bundle);

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
            <Text style={[styles.kicker, { color: BRAND }]}>{phase === 'success' ? 'BUNDLE MIL GAYA' : 'CONFIRM BUNDLE'}</Text>
            <TouchableOpacity onPress={close} disabled={busy} style={[styles.closeBtn, { backgroundColor: p.cardAlt, opacity: busy ? 0.4 : 1 }]} accessibilityRole="button" accessibilityLabel="Band karo">
              <CloseIcon size={18} color={p.text} />
            </TouchableOpacity>
          </View>

          <ScrollView bounces={false} contentContainerStyle={{ paddingBottom: 4 }}>
            <View style={styles.headRow}>
              <LinearGradient colors={SHOP_BUNDLE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
                <BundleArt bundle={bundle} viewer={viewer} width={84} height={72} radius={10} />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{bundle.name}</Text>
                <Text style={[styles.sub, { color: p.sub }]} numberOfLines={2}>{bundleItemsLine(bundle.items)}</Text>
              </View>
            </View>

            {phase === 'success' ? (
              <Animated.View entering={reduce ? undefined : FadeIn.duration(220)} style={styles.success} accessibilityLiveRegion="polite">
                <View style={[styles.successIcon, { backgroundColor: `${TH.colors.success}22` }]}>
                  <Ionicons name="checkmark-circle" size={34} color={TH.colors.success} />
                </View>
                <Text style={[styles.successTitle, { color: p.text }]}>Bundle aapka hua!</Text>
                <Text style={[styles.sub, { color: p.sub, textAlign: 'center' }]}>
                  {state.granted ? `${state.granted} ${state.granted === 1 ? 'item' : 'items'} aapke collection mein add ho gaye.` : 'Items aapke collection mein hain.'}
                </Text>
                <View style={[styles.actions, { alignSelf: 'stretch' }]}>
                  <PrimaryButton label="Equip karo" icon="sparkles" onPress={onEquip} />
                  <SecondaryButton p={p} label="Continue" onPress={onClose} />
                </View>
              </Animated.View>
            ) : (
              <>
                <Text style={[styles.section, { color: p.sub }]}>AAPKO MILEGA</Text>
                <View style={[styles.list, { borderColor: p.border, backgroundColor: p.cardAlt }]}>
                  {bundle.items.map((i) => {
                    const t = rarityToken(i.rarity);
                    return (
                      <View key={i.itemId} style={styles.itemRow} accessible accessibilityLabel={`${i.name}, ${t.label} ${TYPE_SINGULAR[i.type] ?? i.type}${i.owned ? ', pehle se aapka' : ''}`}>
                        <View style={[styles.dot, { backgroundColor: t.color }]} />
                        <Text style={[styles.itemName, { color: i.owned ? p.sub : p.text }]} numberOfLines={1}>{i.name}</Text>
                        <Text style={[styles.itemType, { color: p.sub }]} numberOfLines={1}>{TYPE_SINGULAR[i.type] ?? i.type}</Text>
                        {i.owned ? <Ionicons name="checkmark-circle" size={14} color={TH.colors.success} /> : null}
                      </View>
                    );
                  })}
                </View>
                {note ? (
                  <View style={styles.note}>
                    <Ionicons name="information-circle-outline" size={14} color={p.sub} />
                    <Text style={[styles.noteText, { color: p.sub }]}>{note}</Text>
                  </View>
                ) : null}

                <View style={[styles.ledger, { backgroundColor: p.cardAlt, borderColor: p.border }]}>
                  <LedgerRow p={p} label="Price" value={price} strong />
                  <LedgerRow p={p} label="Abhi aapke paas" value={live ? diamonds : null} />
                  <View style={[styles.sep, { backgroundColor: p.border }]} />
                  <LedgerRow p={p} label="Kharidne ke baad" value={after} tone={after !== null && after < 0 ? 'bad' : 'good'} />
                </View>

                <View style={styles.note}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={p.sub} />
                  <Text style={[styles.noteText, { color: p.sub }]}>Diamonds se payment. Items hamesha ke liye aapke.</Text>
                </View>

                {error ? <ErrorBox p={p} error={error} /> : short ? (
                  <ErrorBox p={p} error={{ kind: 'insufficient', title: 'Diamond kam hain', message: `Is bundle ke liye ${(price - diamonds).toLocaleString()} Diamond aur chahiye.`, retrySameRequest: false, refresh: false }} />
                ) : null}

                <Actions p={p} busy={busy} short={short} error={error} price={price} onConfirm={onConfirm} onClose={close} onEquip={onEquip} onEarn={onEarn} />
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
    <View style={styles.ledgerRow} accessible accessibilityLabel={`${label}: ${value === null ? 'load ho raha hai' : `${value} Diamond`}`}>
      <Text style={[styles.ledgerLabel, { color: p.sub }]}>{label}</Text>
      <View style={styles.ledgerValue}>
        <DiamondIcon size={strong ? 23 : 20} />
        <Text style={[strong ? styles.ledgerStrong : styles.ledgerText, { color }]}>{value === null ? '—' : value.toLocaleString()}</Text>
      </View>
    </View>
  );
}

function ErrorBox({ p, error }: { p: TophuntPalette; error: BundleErrorView }) {
  const ok = error.kind === 'owned' || error.kind === 'all_owned';
  const warn = ok ? TH.colors.success : error.kind === 'price_changed' || error.kind === 'network' ? TH.colors.goldDeep : TH.colors.danger;
  return (
    <View style={[styles.error, { backgroundColor: `${warn}18`, borderColor: `${warn}55` }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={warn} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.errorTitle, { color: p.text }]}>{error.title}</Text>
        <Text style={[styles.errorText, { color: p.sub }]}>{error.message}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({ label, icon, diamond, onPress, busy = false }: { label: string; icon?: string; diamond?: boolean; onPress: () => void; busy?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} accessibilityLabel={busy ? 'Purchase ho raha hai' : label}>
      <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.primary, busy && { opacity: 0.75 }]}>
        {busy ? (
          <>
            <ActivityIndicator color="#FFF" />
            <Text style={styles.primaryText}>Ho raha hai…</Text>
          </>
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={16} color="#FFF" /> : null}
            <Text style={styles.primaryText}>{label}</Text>
            {diamond ? <DiamondIcon size={22} /> : null}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

function SecondaryButton({ p, label, onPress, disabled = false }: { p: TophuntPalette; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.secondary, { borderColor: p.border, opacity: disabled ? 0.4 : 1 }]} accessibilityRole="button">
      <Text style={[styles.secondaryText, { color: p.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Actions({
  p, busy, short, error, price, onConfirm, onClose, onEquip, onEarn,
}: {
  p: TophuntPalette; busy: boolean; short: boolean; error: BundleErrorView | null; price: number;
  onConfirm: () => void; onClose: () => void; onEquip: () => void; onEarn: () => void;
}) {
  const kind = error?.kind;
  let primary: { label: string; onPress: () => void; icon?: string; diamond?: boolean } | null;
  let secondary = { label: 'Cancel', onPress: onClose };
  if (kind === 'owned' || kind === 'all_owned') primary = { label: 'Equip karo', onPress: onEquip, icon: 'sparkles' };
  else if (kind === 'insufficient' || (!error && short)) primary = { label: 'Diamond kamao', onPress: onEarn, icon: 'trophy' };
  else if (kind === 'unavailable' || kind === 'store_closed' || kind === 'invalid') {
    primary = null;
    secondary = { label: 'Theek hai', onPress: onClose };
  } else if (kind === 'network' || kind === 'other') primary = { label: 'Dobara try karo', onPress: onConfirm, icon: 'refresh' };
  else if (kind === 'price_changed') primary = { label: `${price.toLocaleString()} mein kharido`, onPress: onConfirm, diamond: true };
  else primary = { label: `Confirm · ${price.toLocaleString()}`, onPress: onConfirm, diamond: true };

  return (
    <View style={styles.actions}>
      {primary ? <PrimaryButton label={primary.label} icon={primary.icon} diamond={primary.diamond} onPress={primary.onPress} busy={busy} /> : null}
      <SecondaryButton p={p} label={secondary.label} onPress={secondary.onPress} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, backgroundColor: 'rgba(4,4,14,0.72)', justifyContent: 'flex-end', paddingHorizontal: 8 },
  sheet: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '92%', borderTopLeftRadius: TH.radii.xxl, borderTopRightRadius: TH.radii.xxl, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  kicker: { fontFamily: TH.fonts.bold, fontSize: 11, letterSpacing: 1.6 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art: { width: 96, height: 84, borderRadius: TH.radii.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { fontFamily: TH.fonts.bold, fontSize: 19 },
  sub: { fontFamily: TH.fonts.medium, fontSize: 12.5, lineHeight: 17 },
  section: { fontFamily: TH.fonts.bold, fontSize: 11, letterSpacing: 1.2, marginTop: 16, marginBottom: 6 },
  list: { borderRadius: TH.radii.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  itemName: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 13.5 },
  itemType: { fontFamily: TH.fonts.medium, fontSize: 12, maxWidth: '40%' },
  ledger: { marginTop: 14, borderRadius: TH.radii.md, borderWidth: 1, padding: 12, gap: 8 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ledgerLabel: { fontFamily: TH.fonts.medium, fontSize: 13 },
  ledgerValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ledgerText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  ledgerStrong: { fontFamily: TH.fonts.bold, fontSize: 17 },
  sep: { height: 1 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 10 },
  noteText: { flex: 1, fontFamily: TH.fonts.medium, fontSize: 12, lineHeight: 17 },
  error: { flexDirection: 'row', gap: 8, borderRadius: TH.radii.md, borderWidth: 1, padding: 12, marginTop: 14 },
  errorTitle: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  errorText: { fontFamily: TH.fonts.medium, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  actions: { gap: 10, marginTop: 18 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: TH.radii.md },
  primaryText: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 15 },
  secondary: { height: 46, borderRadius: TH.radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: TH.fonts.bold, fontSize: 14 },
  success: { alignItems: 'center', gap: 8, marginTop: 18 },
  successIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontFamily: TH.fonts.bold, fontSize: 18 },
});
