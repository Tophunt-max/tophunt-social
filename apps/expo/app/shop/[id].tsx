import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { Ionicons } from '@/src/lib/icons';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, BRAND_GRAD, GOLD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { CoinMeter, DANGER, GhostButton, GradientButton, PricePill, ShopCard, ShopHeader, Stepper } from '@/src/components/shop/ShopBits';
import { VOTE_GRAD } from '@/src/components/shop/DigitalItemCard';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
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
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const { data: me } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const { width } = useDesignWindow();
  const w = Math.min(width, 640);

  if (q.isLoading) return <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]}><ActivityIndicator color={BRAND} style={{ marginTop: 60 }} /></SafeAreaView>;
  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]}>
        <View style={styles.header}><BackButton size={24} color={p.text} /></View>
        <View style={styles.emptyBox}>
          <LinearGradient colors={BRAND_GRAD} style={styles.emptyIcon}><Ionicons name="gift" size={26} color="#FFF" /></LinearGradient>
          <Text style={[styles.empty, { color: p.sub }]}>Ye product ab available nahi hai.</Text>
          <GhostButton p={p} label="Shop dekho" icon="bag-handle" onPress={() => router.replace('/shop' as any)} style={{ paddingHorizontal: 24 }} />
        </View>
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

  const total = product.priceCoins * qty;
  const inStock = product.variants.some((v) => v.inStock);
  const short = live ? Math.max(0, total - bal.dpcoin) : 0;
  const soldOut = !inStock || (!!variant && !variant.inStock);
  const lowStock = variant && variant.inStock && variant.stock <= 5 ? variant.stock : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <ShopHeader
        p={p}
        kicker="REAL PRIZE"
        title={product.title}
        right={
          <TouchableOpacity onPress={() => router.push('/shop/cart' as any)} style={[styles.iconBtn, { backgroundColor: p.chip }]} accessibilityLabel={`Cart, ${cartCount} items`}>
            <Ionicons name="cart-outline" size={21} color={p.text} />
            {cartCount > 0 && (
              <LinearGradient colors={VOTE_GRAD} style={[styles.dot, { borderColor: p.bg }]}>
                <Text style={styles.dotText}>{cartCount}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 150, width: w, alignSelf: 'center' }}>
        {/* Hero photo */}
        <View style={{ paddingHorizontal: PAD }}>
          <View style={[styles.hero, { borderColor: product.featured ? `${GOLD}AA` : p.border }]}>
            {product.images.length ? (
              <AppImage source={{ uri: product.images[img] }} displayWidth={w} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
                <Ionicons name="gift" size={64} color="rgba(255,255,255,0.9)" />
              </LinearGradient>
            )}
            <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View style={styles.heroTop} pointerEvents="none">
              {product.featured ? (
                <View style={[styles.pill, { backgroundColor: 'rgba(240,65,62,0.92)' }]}>
                  <Ionicons name="flame" size={11} color="#FFF" />
                  <Text style={styles.pillText}>HOT</Text>
                </View>
              ) : <View />}
              {product.images.length > 1 ? (
                <View style={styles.pill}>
                  <Ionicons name="image" size={11} color="#FFF" />
                  <Text style={styles.pillText}>{img + 1}/{product.images.length}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.heroBottom} pointerEvents="none">
              <PricePill coins={product.priceCoins} size="lg" dark />
            </View>
            {soldOut ? (
              <View style={[StyleSheet.absoluteFill, styles.soldOut]} pointerEvents="none">
                <Text style={styles.soldOutText}>SOLD OUT</Text>
              </View>
            ) : null}
          </View>
        </View>

        {product.images.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: PAD, paddingTop: 12 }}>
            {product.images.map((u, i) => {
              const on = i === img;
              return (
                <TouchableOpacity key={u} onPress={() => setImg(i)} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`} accessibilityState={{ selected: on }}>
                  {on ? (
                    <LinearGradient colors={VOTE_GRAD} style={styles.thumbRing}>
                      <AppImage source={{ uri: u }} displayWidth={60} style={styles.thumb} contentFit="cover" />
                    </LinearGradient>
                  ) : (
                    <View style={[styles.thumbRing, { backgroundColor: p.border }]}>
                      <AppImage source={{ uri: u }} displayWidth={60} style={[styles.thumb, { opacity: 0.7 }]} contentFit="cover" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={{ padding: PAD, gap: 14 }}>
          <View style={{ gap: 8 }}>
            <Text style={[styles.title, { color: p.text }]}>{product.title}</Text>
            <View style={styles.perks}>
              <View style={[styles.perk, { backgroundColor: p.chip }]}>
                <Ionicons name="car" size={12} color={p.sub} />
                <Text style={[styles.perkText, { color: p.text }]}>Delivery included</Text>
              </View>
              <View style={[styles.perk, { backgroundColor: p.chip }]}>
                <Ionicons name={product.returnDays > 0 ? 'refresh' : 'ban-outline'} size={12} color={p.sub} />
                <Text style={[styles.perkText, { color: p.text }]}>{product.returnDays > 0 ? `${product.returnDays} din mein return` : 'No returns'}</Text>
              </View>
            </View>
          </View>

          <CoinMeter p={p} have={bal.dpcoin} need={total} live={live && !soldOut} />

          {product.variants.length > 1 && (
            <ShopCard p={p} kicker="OPTION CHUNO">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {product.variants.map((v) => {
                  const on = variant?.id === v.id;
                  const label = `${v.label}${v.inStock ? '' : ' · sold out'}`;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      disabled={!v.inStock}
                      onPress={() => { setVariantId(v.id); setQty(1); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: !v.inStock }}
                      activeOpacity={0.85}
                    >
                      {on ? (
                        <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chip}>
                          <Ionicons name="checkmark" size={13} color="#FFF" />
                          <Text style={[styles.chipText, { color: '#FFF' }]}>{label}</Text>
                        </LinearGradient>
                      ) : (
                        <View style={[styles.chip, { backgroundColor: p.chip, borderColor: p.border, borderWidth: 1, opacity: v.inStock ? 1 : 0.45 }]}>
                          <Text style={[styles.chipText, { color: p.text, textDecorationLine: v.inStock ? 'none' : 'line-through' }]}>{label}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ShopCard>
          )}

          {variant && variant.inStock && (
            <View style={styles.qtyRow}>
              <Text style={[styles.label, { color: p.text }]}>Quantity</Text>
              <Stepper p={p} value={qty} onMinus={() => setQty(Math.max(1, qty - 1))} onPlus={() => setQty(Math.min(maxQty, qty + 1))} minusDisabled={qty <= 1} plusDisabled={qty >= maxQty} />
              <View style={{ flex: 1 }} />
              {lowStock !== null ? (
                <View style={[styles.pill, { backgroundColor: `${DANGER}E6` }]}>
                  <Ionicons name="flame" size={11} color="#FFF" />
                  <Text style={styles.pillText}>SIRF {lowStock} BACHE</Text>
                </View>
              ) : null}
            </View>
          )}

          {product.description ? (
            <ShopCard p={p} kicker="DETAILS">
              <Text style={[styles.desc, { color: p.text }]}>{product.description}</Text>
            </ShopCard>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: p.bg, borderColor: p.border }]}>
        <View style={{ width: w - 32, alignSelf: 'center', flexDirection: 'row', gap: 10 }}>
          <GhostButton p={p} icon="cart-outline" label="Add" disabled={soldOut} onPress={() => addToCart(false)} style={{ flex: 1 }} />
          <GradientButton
            p={p}
            style={{ flex: 2 }}
            label="Buy"
            coins={total}
            onPress={() => addToCart(true)}
            lockedLabel={soldOut ? 'Out of stock' : short > 0 ? `${short.toLocaleString()} DP coin kam` : null}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  iconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -4, right: -4, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2 },
  dotText: { color: '#fff', fontSize: 10, fontFamily: 'Urbanist-Black' },

  hero: { width: '100%', aspectRatio: 1, borderRadius: 24, overflow: 'hidden', borderWidth: 1.5 },
  heroTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  heroBottom: { position: 'absolute', left: 12, bottom: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  pillText: { color: '#FFF', fontSize: 10.5, fontFamily: 'Urbanist-Black', letterSpacing: 0.5 },
  soldOut: { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  soldOutText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 22, letterSpacing: 2, borderWidth: 3, borderColor: '#FFF', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10, transform: [{ rotate: '-8deg' }] },
  thumbRing: { padding: 2, borderRadius: 14 },
  thumb: { width: 56, height: 56, borderRadius: 12 },

  title: { fontSize: 22, fontFamily: 'Urbanist-Black' },
  perks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  perkText: { fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
  label: { fontSize: 14, fontFamily: 'Urbanist-Bold' },
  desc: { fontSize: 14, fontFamily: 'Urbanist-Medium', lineHeight: 21 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 14, height: 38 },
  chipText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1 },
  emptyBox: { alignItems: 'center', gap: 14, marginTop: 60, paddingHorizontal: PAD },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', fontFamily: 'Urbanist-Medium', fontSize: 14 },
});
