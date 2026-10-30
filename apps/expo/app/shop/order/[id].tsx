import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { useConfirm } from '@/src/components/modals/ConfirmDialog';
import { ORDER_STATUS_LABEL, useOrder, useOrderAction, type OrderStatus } from '@/src/services/shop';

const STEPS: OrderStatus[] = ['placed', 'packed', 'shipped', 'delivered'];

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
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Order details</Text>
      </View>
      {q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginTop: 40 }} />
      ) : !o ? (
        <Text style={[styles.sub, { color: p.sub, textAlign: 'center', marginTop: 40 }]}>Order nahi mila.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: PAD, gap: 14, paddingBottom: 40 }}>
          <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
            <Text style={[styles.status, { color: BRAND }]}>{ORDER_STATUS_LABEL[o.status]}</Text>
            {stepIndex >= 0 && (
              <View style={styles.track}>
                {STEPS.map((s, i) => (
                  <View key={s} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View style={[styles.dot, { backgroundColor: i <= stepIndex ? BRAND : p.chip }]} />
                    <Text style={[styles.tiny, { color: i <= stepIndex ? p.text : p.sub }]}>{ORDER_STATUS_LABEL[s]}</Text>
                  </View>
                ))}
              </View>
            )}
            {o.trackingNumber ? (
              <TouchableOpacity disabled={!o.trackingUrl} onPress={() => o.trackingUrl && Linking.openURL(o.trackingUrl).catch(() => undefined)}>
                <Text style={[styles.sub, { color: p.text }]}>
                  Tracking: {o.carrier ? `${o.carrier} · ` : ''}{o.trackingNumber}{o.trackingUrl ? '  (track karo →)' : ''}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
            {o.items.map((i) => (
              <View key={i.variantId} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                {i.image ? <AppImage source={{ uri: i.image }} style={styles.img} contentFit="cover" /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: p.text }]}>{i.title}</Text>
                  <Text style={[styles.sub, { color: p.sub }]}>{i.variantLabel} · qty {i.qty}</Text>
                </View>
                <Text style={[styles.name, { color: p.text }]}>{i.unitCoins * i.qty}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: p.border, paddingTop: 10 }}>
              <Text style={[styles.name, { color: p.text }]}>Total paid</Text>
              <Text style={[styles.name, { color: p.text }]}>{o.totalCoins} DP coin</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
            <Text style={[styles.name, { color: p.text }]}>Delivering to</Text>
            <Text style={[styles.sub, { color: p.sub }]}>
              {[a.recipientName, a.phone, a.addressLine1, a.addressLine2, a.landmark, `${a.city ?? ''}, ${a.state ?? ''} ${a.postalCode ?? ''}`].filter(Boolean).join('\n')}
            </Text>
          </View>

          {o.history.length > 0 && (
            <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
              {o.history.map((h, i) => (
                <Text key={i} style={[styles.sub, { color: p.sub }]}>
                  {new Date(h.at).toLocaleString()} · {ORDER_STATUS_LABEL[h.to as OrderStatus] ?? h.to}{h.note ? ` · ${h.note}` : ''}
                </Text>
              ))}
            </View>
          )}

          {o.status === 'placed' && (
            <TouchableOpacity style={[styles.btn, { borderColor: '#DC2626' }]} onPress={() => void cancel()} disabled={act.isPending}>
              <Text style={[styles.btnText, { color: '#DC2626' }]}>Cancel order</Text>
            </TouchableOpacity>
          )}
          {canReturn && !returning && (
            <TouchableOpacity style={[styles.btn, { borderColor: BRAND }]} onPress={() => setReturning(true)}>
              <Text style={[styles.btnText, { color: BRAND }]}>Return request ({new Date(o.returnUntil!).toLocaleDateString()} tak)</Text>
            </TouchableOpacity>
          )}
          {returning && (
            <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
              <Text style={[styles.name, { color: p.text }]}>Return kyun karna hai?</Text>
              <TextInput value={reason} onChangeText={setReason} maxLength={300} multiline placeholder="e.g. size chhota hai" placeholderTextColor={p.sub} style={[styles.input, { color: p.text, borderColor: p.border }]} />
              <TouchableOpacity style={[styles.btn, { backgroundColor: BRAND, borderColor: BRAND, opacity: reason.trim().length >= 3 ? 1 : 0.5 }]} disabled={reason.trim().length < 3 || act.isPending} onPress={sendReturn}>
                <Text style={[styles.btnText, { color: '#fff' }]}>Request bhejo</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
      {dialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  status: { fontFamily: 'Urbanist-Bold', fontSize: 16 },
  track: { flexDirection: 'row' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  tiny: { fontFamily: 'Urbanist-Medium', fontSize: 10, textAlign: 'center' },
  img: { width: 48, height: 48, borderRadius: 8 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, lineHeight: 18 },
  btn: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 70, fontFamily: 'Urbanist-Medium', textAlignVertical: 'top' },
});
