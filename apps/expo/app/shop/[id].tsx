import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useDesignWindow } from '@/src/lib/layout';
import { useMonetizationConfig } from '@/src/services/monetization';
import { MAX_QTY, useCart, useShopProducts } from '@/src/services/shop';

export default function ProductScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const q = useShopProducts(!!user && cfg.shop.enabled);
  const product = useMemo(() => q.data?.find((x) => x.id === id), [q.data, id]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const add = useCart((s) => s.add);
  const { width } = useDesignWindow();
  const w = Math.min(width, 640);

  if (q.isLoading) return <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]}><ActivityIndicator color={BRAND} style={{ marginTop: 60 }} /></SafeAreaView>;
  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]}>
        <View style={styles.header}><BackButton size={24} color={p.text} /></View>
        <Text style={[styles.empty, { color: p.sub }]}>Ye product ab available nahi hai.</Text>
      </SafeAreaView>
    );
  }
  const variant = product.variants.find((v) => v.id === variantId) ?? (product.variants.length === 1 ? product.variants[0] : null);
  const maxQty = Math.min(MAX_QTY, variant?.stock ?? 0);

  const addToCart = (goToCart: boolean) => {
    if (!variant) return emitToast('Pehle size / variant chuno', 'info');
    add({ productId: product.id, variantId: variant.id, qty, title: product.title, variantLabel: variant.label, image: product.images[0] ?? null, unitCoins: product.priceCoins });
    if (goToCart) router.push('/shop/cart' as any);
    else emitToast('Cart mein add ho gaya', 'success');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.headerTitle, { color: p.text }]} numberOfLines={1}>{product.title}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {product.images.length ? (
          <>
            <AppImage source={{ uri: product.images[img] }} style={{ width: w, aspectRatio: 1 }} contentFit="cover" />
            {product.images.length > 1 && (
              <ScrollView horizontal contentContainerStyle={{ gap: 8, padding: PAD }}>
                {product.images.map((u, i) => (
                  <TouchableOpacity key={u} onPress={() => setImg(i)} style={{ borderWidth: 2, borderColor: i === img ? BRAND : 'transparent', borderRadius: 10 }}>
                    <AppImage source={{ uri: u }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        ) : null}
        <View style={{ padding: PAD, gap: 10 }}>
          <Text style={[styles.title, { color: p.text }]}>{product.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CoinIcon size={20} />
            <Text style={[styles.price, { color: p.text }]}>{product.priceCoins} DP coin</Text>
          </View>
          <Text style={[styles.meta, { color: p.sub }]}>
            Delivery included · {product.returnDays > 0 ? `${product.returnDays} din mein return` : 'No returns'}
          </Text>

          {product.variants.length > 1 && (
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: p.text }]}>Option</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {product.variants.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    disabled={!v.inStock}
                    onPress={() => { setVariantId(v.id); setQty(1); }}
                    style={[styles.chip, { borderColor: variant?.id === v.id ? BRAND : p.border, opacity: v.inStock ? 1 : 0.4 }]}
                    accessibilityState={{ selected: variant?.id === v.id, disabled: !v.inStock }}
                  >
                    <Text style={[styles.chipText, { color: p.text }]}>{v.label}{v.inStock ? '' : ' · sold out'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {variant && variant.inStock && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={[styles.label, { color: p.text }]}>Quantity</Text>
              <TouchableOpacity style={styles.step} onPress={() => setQty(Math.max(1, qty - 1))}><Text style={styles.stepText}>−</Text></TouchableOpacity>
              <Text style={[styles.label, { color: p.text }]}>{qty}</Text>
              <TouchableOpacity style={styles.step} onPress={() => setQty(Math.min(maxQty, qty + 1))}><Text style={styles.stepText}>+</Text></TouchableOpacity>
              {variant.stock <= 5 && <Text style={[styles.meta, { color: '#DC2626' }]}>Sirf {variant.stock} bache</Text>}
            </View>
          )}

          {product.description ? <Text style={[styles.desc, { color: p.text }]}>{product.description}</Text> : null}
        </View>
      </ScrollView>
      <View style={[styles.bar, { backgroundColor: p.bg, borderColor: p.border }]}>
        <TouchableOpacity style={[styles.btn, styles.btnGhost, { borderColor: BRAND }]} disabled={!variant?.inStock} onPress={() => addToCart(false)}>
          <Text style={[styles.btnText, { color: BRAND }]}>Add to cart</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: BRAND, opacity: variant?.inStock || !variant ? 1 : 0.5 }]} disabled={!!variant && !variant.inStock} onPress={() => addToCart(true)}>
          <Text style={[styles.btnText, { color: '#fff' }]}>{variant && !variant.inStock ? 'Out of stock' : `Buy · ${product.priceCoins * qty} DP coin`}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: 'Urbanist-Bold' },
  title: { fontSize: 20, fontFamily: 'Urbanist-Bold' },
  price: { fontSize: 20, fontFamily: 'Urbanist-Bold' },
  meta: { fontSize: 12, fontFamily: 'Urbanist-Medium' },
  label: { fontSize: 14, fontFamily: 'Urbanist-Bold' },
  desc: { fontSize: 14, fontFamily: 'Urbanist-Medium', lineHeight: 21 },
  chip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: 'Urbanist-Bold', color: '#111' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { borderWidth: 1.5 },
  btnText: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  empty: { textAlign: 'center', marginTop: 40, fontFamily: 'Urbanist-Medium' },
});
