import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { DANGER, GhostButton, GradientButton, ProductThumb, ShopCard, ShopHeader, StatusPill, StepTrack, statusColor } from '@/src/components/shop/ShopBits';
import { VOTE_GRAD } from '@/src/components/shop/DigitalItemCard';
import { useConfirm } from '@/src/components/modals/ConfirmDialog';
import { ORDER_STATUS_LABEL, useOrder, useOrderAction, type OrderStatus } from '@/src/services/shop';

const STEPS: OrderStatus[] = ['placed', 'packed', 'shipped', 'delivered'];
const STEP_ICON: Record<string, string> = { placed: 'receipt-outline', packed: 'cube', shipped: 'car', delivered: 'checkmark' };
const STEP_LABEL: Record<string, string> = { placed: 'Placed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered' };

export default function OrderScreen() {
  const p = useExplorePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOrder(String(id ?? ''));
  const act = useOrderAction();
  const { confirm, dialog } = useConfirm();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');
  const o = q.data;

  const cancel = async () => {
    if (!o) return;
    const ok = await confirm({ title: 'Order cancel karein?', message: `${o.totalCoins} DP coin wapas aapke wallet mein aa jayenge.`, confirmLabel: 'Cancel order', destructive: true });
    if (!ok) return;
    act.mutate({ action: 'cancelShopOrder', orderId: o.id }, {
      onSuccess: () => { emitToast('Order cancel ho gaya. DP coin wapas mil gaye.', 'success'); void q.refetch(); },
      onError: (e: any) => emitToast(e?.message || 'Cancel nahi hua', 'error'),
    });
  };
  const sendReturn = () => {
    if (!o) return;
    act.mutate({ action: 'requestShopReturn', orderId: o.id, reason }, {
      onSuccess: () => { setReturning(false); emitToast('Return request bhej di', 'success'); void q.refetch(); },
      onError: (e: any) => emitToast(e?.message || 'Return request nahi gayi', 'error'),
    });
  };

  const a: any = o?.address ?? {};
  const stepIndex = o ? STEPS.indexOf(o.status) : -1;
  const canReturn = o?.status === 'delivered' && !!o.returnUntil && Date.now() < o.returnUntil;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <ShopHeader p={p} kicker={o ? `ORDER #${o.id.slice(-6).toUpperCase()}` : 'ORDER'} title="Order details" />
      {q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginTop: 40 }} />
      ) : !o ? (
        <Text style={[styles.sub, { color: p.sub, textAlign: 'center', marginTop: 40 }]}>Order nahi mila.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: PAD, gap: 14, paddingBottom: 40 }}>
          {/* Status hero */}
          <LinearGradient colors={['#1A1033', '#2D1B4E', '#14102A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { borderColor: `${statusColor(o.status)}88` }]}>
            <View style={styles.heroTop}>
              <StatusPill status={o.status} big />
              <View style={{ flex: 1 }} />
              <Text style={styles.heroDate}>{new Date(o.createdAt).toLocaleDateString()}</Text>
            </View>
            {o.reviewStatus === 'pending' && o.status === 'placed' ? (
              <View style={styles.review}>
                <Ionicons name="shield-checkmark" size={14} color="#FBBF24" />
                <Text style={styles.reviewText}>
                  Aapka order team check kar rahi hai (safety check). Approve hote hi pack hoga. Aap abhi bhi cancel kar sakte ho.
                </Text>
              </View>
            ) : null}
            {stepIndex >= 0 && (
              <View style={{ marginTop: 16 }}>
                <StepTrack
                  p={{ ...p, text: '#FFF', sub: '#9C94B8', chip: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.16)' }}
                  steps={STEPS.map((s) => ({ key: s, label: STEP_LABEL[s], icon: STEP_ICON[s] }))}
                  index={stepIndex}
                />
              </View>
            )}
            {o.trackingNumber ? (
              <TouchableOpacity
                disabled={!o.trackingUrl}
                onPress={() => o.trackingUrl && Linking.openURL(o.trackingUrl).catch(() => undefined)}
                style={styles.tracking}
                accessibilityRole={o.trackingUrl ? 'link' : undefined}
              >
                <Ionicons name="car" size={15} color="#FFF" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackKicker}>TRACKING{o.carrier ? ` · ${o.carrier.toUpperCase()}` : ''}</Text>
                  <Text style={styles.trackNo} numberOfLines={1}>{o.trackingNumber}</Text>
                </View>
                {o.trackingUrl ? (
                  <LinearGradient colors={VOTE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.trackBtn}>
                    <Text style={styles.trackBtnText}>Track karo</Text>
                  </LinearGradient>
                ) : null}
              </TouchableOpacity>
            ) : null}
          </LinearGradient>

          <ShopCard p={p} kicker="ITEMS">
            {o.items.map((i) => (
              <View key={i.variantId} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <ProductThumb uri={i.image} size={52} radius={12} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{i.title}</Text>
                  <Text style={[styles.sub, { color: p.sub }]}>{i.variantLabel} · qty {i.qty}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <CoinIcon size={12} />
                  <Text style={[styles.name, { color: p.text }]}>{(i.unitCoins * i.qty).toLocaleString()}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.totalRow, { borderColor: p.border }]}>
              <Text style={[styles.name, { color: p.text }]}>Total paid</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CoinIcon size={17} />
                <Text style={[styles.total, { color: p.text }]}>{o.totalCoins.toLocaleString()}</Text>
              </View>
            </View>
          </ShopCard>

          <ShopCard p={p} kicker="DELIVERING TO">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Ionicons name="location-outline" size={18} color={BRAND} />
              <Text style={[styles.sub, { color: p.text, flex: 1 }]}>
                {[a.recipientName, a.phone, a.addressLine1, a.addressLine2, a.landmark, `${a.city ?? ''}, ${a.state ?? ''} ${a.postalCode ?? ''}`].filter(Boolean).join('\n')}
              </Text>
            </View>
          </ShopCard>

          {o.history.length > 0 && (
            <ShopCard p={p} kicker="TIMELINE">
              {o.history.map((h, i) => {
                const c = statusColor(h.to as OrderStatus);
                const last = i === o.history.length - 1;
                return (
                  <View key={i} style={styles.histRow}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={[styles.histDot, { backgroundColor: c }]} />
                      {!last ? <View style={[styles.histLine, { backgroundColor: p.border }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                      <Text style={[styles.name, { color: p.text, fontSize: 13 }]}>{ORDER_STATUS_LABEL[h.to as OrderStatus] ?? h.to}</Text>
                      <Text style={[styles.sub, { color: p.sub }]}>{new Date(h.at).toLocaleString()}{h.note ? ` · ${h.note}` : ''}</Text>
                    </View>
                  </View>
                );
              })}
            </ShopCard>
          )}

          {o.status === 'placed' && (
            <GhostButton p={p} icon="ban-outline" label="Cancel order" color={DANGER} onPress={() => void cancel()} disabled={act.isPending} />
          )}
          {canReturn && !returning && (
            <GhostButton p={p} icon="refresh" label={`Return request (${new Date(o.returnUntil!).toLocaleDateString()} tak)`} onPress={() => setReturning(true)} />
          )}
          {returning && (
            <ShopCard p={p} kicker="RETURN">
              <Text style={[styles.name, { color: p.text }]}>Return kyun karna hai?</Text>
              <TextInput value={reason} onChangeText={setReason} maxLength={300} multiline placeholder="e.g. size chhota hai" placeholderTextColor={p.sub} style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.chip }]} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <GhostButton p={p} label="Rehne do" color={p.text} onPress={() => setReturning(false)} style={{ flex: 1 }} />
                <GradientButton p={p} icon="paper-plane-outline" label="Request bhejo" disabled={reason.trim().length < 3} busy={act.isPending} onPress={sendReturn} style={{ flex: 2 }} />
              </View>
            </ShopCard>
          )}
        </ScrollView>
      )}
      {dialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { borderRadius: 24, borderWidth: 1.5, padding: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroDate: { color: '#C9C2E0', fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
  review: { flexDirection: 'row', gap: 8, marginTop: 12, backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 12, padding: 10 },
  reviewText: { flex: 1, color: '#FDE68A', fontFamily: 'Urbanist-Medium', fontSize: 12, lineHeight: 17 },
  tracking: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 10 },
  trackKicker: { color: '#9C94B8', fontFamily: 'Urbanist-Black', fontSize: 9.5, letterSpacing: 1 },
  trackNo: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 13 },
  trackBtn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  trackBtnText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 12 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, lineHeight: 18 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 10 },
  total: { fontFamily: 'Urbanist-Black', fontSize: 18 },
  histRow: { flexDirection: 'row', gap: 10 },
  histDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  histLine: { width: 2, flex: 1, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 80, fontFamily: 'Urbanist-Medium', textAlignVertical: 'top' },
});
