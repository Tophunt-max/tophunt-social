import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { FormInput } from '@/src/components/inputs/FormInput';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND_GRAD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { CoinMeter, DANGER, GhostButton, GradientButton, PricePill, ProductThumb, ShopCard, ShopHeader, Stepper, StepTrack } from '@/src/components/shop/ShopBits';
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

  const steps = [
    { key: 'cart', label: 'Cart', icon: 'cart-outline' },
    { key: 'address', label: 'Address', icon: 'location-outline' },
    { key: 'confirm', label: 'Order', icon: 'checkmark' },
  ];
  const units = cart.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <ShopHeader p={p} kicker="CHECKOUT" title={step === 'cart' ? 'Cart' : 'Delivery address'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: PAD, paddingBottom: 220, gap: 12 }} keyboardShouldPersistTaps="handled">
          {cart.lines.length === 0 ? (
            <View style={styles.emptyBox}>
              <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyIcon}>
                <Ionicons name="cart-outline" size={30} color="#FFF" />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: p.text }]}>Cart khaali hai</Text>
              <Text style={[styles.sub, { color: p.sub, textAlign: 'center' }]}>Contest jeeto, DP coin pao aur asli prizes ghar mangwao.</Text>
              <GradientButton p={p} icon="bag-handle" label="Shop dekho" onPress={() => router.replace('/shop' as any)} style={{ alignSelf: 'stretch', marginTop: 6 }} />
            </View>
          ) : (
            <>
              <View style={{ paddingHorizontal: 8, marginBottom: 4 }}>
                <StepTrack p={p} steps={steps} index={step === 'cart' ? 0 : 1} />
              </View>
              {step === 'cart' ? (
                <>
                  <Text style={[styles.kicker, { color: p.sub }]}>{units} ITEM{units === 1 ? '' : 'S'}</Text>
                  {cart.lines.map((l) => (
                    <View key={l.variantId} style={[styles.line, { backgroundColor: p.card, borderColor: l.available ? p.border : `${DANGER}AA` }]}>
                      <ProductThumb uri={l.image} size={84} radius={16} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                          <Text style={[styles.name, { color: p.text, flex: 1 }]} numberOfLines={2}>{l.title}</Text>
                          <TouchableOpacity onPress={() => remove(l.variantId)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${l.title}`}>
                            <Ionicons name="trash-outline" size={17} color={p.sub} />
                          </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {l.variantLabel ? (
                            <View style={[styles.variant, { backgroundColor: p.chip }]}>
                              <Text style={[styles.variantText, { color: p.text }]}>{l.variantLabel}</Text>
                            </View>
                          ) : null}
                          <PricePill coins={l.unitCoins} size="sm" />
                        </View>
                        {!l.available && (
                          <View style={styles.warnRow}>
                            <Ionicons name="alert-circle" size={13} color={DANGER} />
                            <Text style={styles.warn}>{l.stock > 0 ? `Sirf ${l.stock} bache` : 'Ab available nahi'}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Stepper p={p} value={l.qty} label={l.title} onMinus={() => setQty(l.variantId, l.qty - 1)} onPlus={() => setQty(l.variantId, l.qty + 1)} />
                          <View style={{ flex: 1 }} />
                          <CoinIcon size={14} />
                          <Text style={[styles.lineTotal, { color: p.text }]}> {(l.unitCoins * l.qty).toLocaleString()}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                  <CoinMeter p={p} have={bal.dpcoin} need={cart.total} live={live} />
                </>
              ) : (
                <ShopCard p={p} kicker="KAHAN BHEJEIN?">
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
                </ShopCard>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {cart.lines.length > 0 && (
        <View style={[styles.bar, { backgroundColor: p.bg, borderColor: p.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[styles.kicker, { color: p.sub }]}>TOTAL</Text>
              <Text style={[styles.sub, { color: p.sub }]}>Delivery included</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CoinIcon size={20} />
              <Text style={[styles.total, { color: p.text }]}>{cart.total.toLocaleString()}</Text>
            </View>
          </View>
          {live ? (
            <Text style={[styles.sub, { color: short ? DANGER : p.sub }]}>
              {short ? `${short} DP coin kam hain. Contest jeeto aur DP coin kamao.` : `Aapke paas ${bal.dpcoin.toLocaleString()} DP coin hain`}
            </Text>
          ) : null}
          {step === 'cart' ? (
            short > 0 ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <GradientButton p={p} label="" lockedLabel={`${short.toLocaleString()} DP coin kam`} onPress={() => undefined} style={{ flex: 1 }} />
                <GradientButton p={p} icon="trophy" label="Contest jeeto" onPress={() => router.push('/explore/battles' as any)} style={{ flex: 1 }} />
              </View>
            ) : (
              <GradientButton
                p={p}
                icon="location-outline"
                label="Address daalo"
                disabled={!cart.allAvailable}
                onPress={() => setStep('address')}
              />
            )
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GhostButton p={p} label="Back" color={p.text} onPress={() => setStep('cart')} style={{ flex: 1 }} />
              <GradientButton p={p} label="Order" coins={cart.total} busy={place.isPending} onPress={handleSubmit(onSubmit)} style={{ flex: 2 }} />
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
  kicker: { fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 1.4 },
  line: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 20, borderWidth: 1.5 },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12 },
  variant: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  variantText: { fontFamily: 'Urbanist-Bold', fontSize: 11 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  warn: { color: DANGER, fontFamily: 'Urbanist-Bold', fontSize: 12 },
  lineTotal: { fontFamily: 'Urbanist-Black', fontSize: 15 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1 },
  total: { fontFamily: 'Urbanist-Black', fontSize: 24 },
  emptyBox: { alignItems: 'center', gap: 10, marginTop: 50, paddingHorizontal: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: 'Urbanist-Black', fontSize: 20 },
});
