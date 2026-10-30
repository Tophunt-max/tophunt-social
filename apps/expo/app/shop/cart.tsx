import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { FormInput } from '@/src/components/inputs/FormInput';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { deliverySchema, EMPTY_DELIVERY_FORM, PHONE_INPUT_MAX_LENGTH, type DeliveryFormValues } from '@/src/lib/deliveryAddressForm';
import { useConfirm } from '@/src/components/modals/ConfirmDialog';
import { newRequestId, useMonetizationConfig } from '@/src/services/monetization';
import { repriceCart, useCart, usePlaceOrder, useShopProducts } from '@/src/services/shop';

/** Cart → delivery address → confirm → order. Paid in DP coin only. */
export default function CartScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const { lines: raw, setQty, remove, clear } = useCart();
  const cart = useMemo(() => repriceCart(raw, products.data), [raw, products.data]);
  const place = usePlaceOrder();
  const { confirm, dialog } = useConfirm();
  const [step, setStep] = useState<'cart' | 'address'>('cart');
  // One id per checkout attempt; reused only if that exact attempt is retried.
  const requestId = useRef<string | null>(null);
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const short = live ? Math.max(0, cart.total - bal.dpcoin) : 0;

  const { control, handleSubmit, formState: { errors } } = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema) as any,
    defaultValues: EMPTY_DELIVERY_FORM,
  });

  const onSubmit = async (values: DeliveryFormValues) => {
    const address = { ...deliverySchema.parse(values), country: 'India' };
    const ok = await confirm({
      title: `Order for ${cart.total} DP coin?`,
      message: `${cart.lines.length} item(s), delivery included, to ${address.city}. You can cancel until it is packed.`,
      confirmLabel: 'Place order',
    });
    if (!ok) return;
    if (!requestId.current) requestId.current = newRequestId();
    place.mutate(
      { items: cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), address, expectedTotalCoins: cart.total, requestId: requestId.current },
      {
        onSuccess: (r) => {
          requestId.current = null;
          clear();
          void refetchMe();
          emitToast('Order placed!', 'success');
          router.replace(`/shop/order/${encodeURIComponent(r.order.id)}` as any);
        },
        onError: (e: any) => {
          if (e?.status) requestId.current = null;
          if (e?.reason === 'price_changed' || e?.reason === 'out_of_stock' || e?.reason === 'item_unavailable') {
            void products.refetch();
            setStep('cart');
          }
          emitToast(e?.message || 'Order nahi hua. Aapke coins nahi kate.', 'error');
          // Fraud rule: a verified mobile number is required to order.
          if (e?.reason === 'phone_not_verified') router.push('/profile/manage/verification' as any);
        },
      },
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">{step === 'cart' ? 'Cart' : 'Delivery address'}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: PAD, paddingBottom: 140, gap: 12 }} keyboardShouldPersistTaps="handled">
          {cart.lines.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 12, marginTop: 40 }}>
              <Text style={[styles.sub, { color: p.sub }]}>Cart khaali hai.</Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: BRAND, paddingHorizontal: 24 }]} onPress={() => router.replace('/shop' as any)}>
                <Text style={styles.btnText}>Shop dekho</Text>
              </TouchableOpacity>
            </View>
          ) : step === 'cart' ? (
            cart.lines.map((l) => (
              <View key={l.variantId} style={[styles.line, { backgroundColor: p.card, borderColor: l.available ? p.border : '#DC2626' }]}>
                {l.image ? <AppImage source={{ uri: l.image }} style={styles.img} contentFit="cover" /> : <View style={[styles.img, { backgroundColor: p.chip }]} />}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{l.title}</Text>
                  <Text style={[styles.sub, { color: p.sub }]}>{l.variantLabel} · {l.unitCoins} DP coin</Text>
                  {!l.available && <Text style={styles.warn}>{l.stock > 0 ? `Sirf ${l.stock} bache` : 'Ab available nahi'}</Text>}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity style={styles.step} onPress={() => setQty(l.variantId, l.qty - 1)}><Text style={styles.stepText}>−</Text></TouchableOpacity>
                    <Text style={[styles.name, { color: p.text }]}>{l.qty}</Text>
                    <TouchableOpacity style={styles.step} onPress={() => setQty(l.variantId, l.qty + 1)}><Text style={styles.stepText}>+</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(l.variantId)} style={{ marginLeft: 'auto' }}><Text style={styles.warn}>Remove</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={{ gap: 4 }}>
              <FormInput control={control} name="recipientName" placeholder="Full name *" autoCapitalize="words" maxLength={100} errorMessage={errors.recipientName?.message} />
              <FormInput control={control} name="phone" placeholder="10-digit mobile number *" keyboardType="phone-pad" maxLength={PHONE_INPUT_MAX_LENGTH} errorMessage={errors.phone?.message} />
              <FormInput control={control} name="addressLine1" placeholder="House number and street *" maxLength={200} errorMessage={errors.addressLine1?.message} />
              <FormInput control={control} name="addressLine2" placeholder="Area, colony (optional)" maxLength={200} errorMessage={errors.addressLine2?.message} />
              <FormInput control={control} name="landmark" placeholder="Nearby landmark (optional)" maxLength={120} errorMessage={errors.landmark?.message} />
              <FormInput control={control} name="city" placeholder="City *" autoCapitalize="words" maxLength={80} errorMessage={errors.city?.message} />
              <FormInput control={control} name="state" placeholder="State *" autoCapitalize="words" maxLength={80} errorMessage={errors.state?.message} />
              <FormInput control={control} name="postalCode" placeholder="6-digit PIN code *" keyboardType="number-pad" maxLength={6} errorMessage={errors.postalCode?.message} />
              <FormInput control={control} name="notes" placeholder="Delivery instructions (optional)" maxLength={500} errorMessage={errors.notes?.message} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {cart.lines.length > 0 && (
        <View style={[styles.bar, { backgroundColor: p.bg, borderColor: p.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.name, { color: p.text }]}>Total (delivery included)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CoinIcon size={16} />
              <Text style={[styles.total, { color: p.text }]}>{cart.total}</Text>
            </View>
          </View>
          <Text style={[styles.sub, { color: short ? '#DC2626' : p.sub }]}>
            {live ? (short ? `${short} DP coin kam hain. Contest jeeto aur DP coin kamao.` : `Aapke paas ${bal.dpcoin} DP coin hain`) : ' '}
          </Text>
          {step === 'cart' ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: BRAND, opacity: cart.allAvailable && !short ? 1 : 0.5 }]}
              disabled={!cart.allAvailable || short > 0}
              onPress={() => setStep('address')}
            >
              <Text style={styles.btnText}>Address daalo</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: p.chip }]} onPress={() => setStep('cart')}>
                <Text style={[styles.btnText, { color: p.text }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 2, backgroundColor: BRAND }]} disabled={place.isPending} onPress={handleSubmit(onSubmit)}>
                {place.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Order · {cart.total} DP coin</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {dialog}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  line: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  img: { width: 72, height: 72, borderRadius: 12 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12 },
  warn: { color: '#DC2626', fontFamily: 'Urbanist-Bold', fontSize: 12 },
  step: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 16, fontFamily: 'Urbanist-Bold', color: '#111' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8, padding: 16, borderTopWidth: 1 },
  total: { fontFamily: 'Urbanist-Bold', fontSize: 20 },
  btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontFamily: 'Urbanist-Bold', fontSize: 15 },
});
