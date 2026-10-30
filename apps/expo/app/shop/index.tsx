import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { BRAND, BRAND_GRAD, GOLD, PAD, useExplorePalette } from '@/src/components/explore/theme';
import { ScaleTouchable } from '@/src/components/explore/ScaleTouchable';
import { SectionError } from '@/src/components/explore/ExploreBits';
import { DigitalItemCard, FeaturedDigitalCard, VOTE_GRAD } from '@/src/components/shop/DigitalItemCard';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { useDigitalPurchase } from '@/src/hooks/useDigitalPurchase';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useMonetizationConfig, useStore, type StoreItemView } from '@/src/services/monetization';
import { useCart, useShopProducts } from '@/src/services/shop';
import { useDesignWindow } from '@/src/lib/layout';

type Palette = ReturnType<typeof useExplorePalette>;
type Mode = 'digital' | 'physical';
type Product = NonNullable<ReturnType<typeof useShopProducts>['data']>[number];

const DIGITAL_TABS: { id: string | null; label: string; icon: string }[] = [
  { id: null, label: 'All', icon: 'sparkles' },
  { id: 'frame', label: 'Frames', icon: 'person-circle' },
  { id: 'theme', label: 'Themes', icon: 'color-palette' },
  { id: 'badge', label: 'Badges', icon: 'medal' },
  { id: 'title', label: 'Titles', icon: 'ribbon' },
];

const RARITY_RANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

/**
 * Shopping: spend 🪙 DP coin (won in contests) on digital items (frames,
 * themes, badges, titles, shown to everyone on your profile, posts and
 * comments) and on real products. Prices are set by TopHunt and re-checked by
 * the server when buying; delivery is included for products.
 *
 * Both catalogues live on this one screen behind a sticky two-button switch
 * (Digital | Physical). `/shop?tab=physical` opens straight on products.
 */
export default function ShopScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user } = useAuth();
  const cfg = useMonetizationConfig();
  const products = useShopProducts(!!user && cfg.shop.enabled);
  const store = useStore(!!user && cfg.store.enabled);
  const { data: me, refetch: refetchMe } = useProfile(user?.uid || '');
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const [mode, setMode] = useState<Mode>(() =>
    params.tab === 'physical' || (!cfg.store.enabled && cfg.shop.enabled) ? 'physical' : 'digital',
  );
  const [category, setCategory] = useState<string | null>(null);
  const [digitalTab, setDigitalTab] = useState<string | null>(null);
  const { width } = useDesignWindow();
  const contentW = Math.min(width, 640);
  const cardW = (contentW - PAD * 2 - 12) / 2;
  const { onBuy, buying, dialog } = useDigitalPurchase({ onBought: () => void refetchMe(), onStale: () => void store.refetch() });

  const viewer = { avatarUri: (me as any)?.profileImageUrl ?? user?.photoURL ?? null, name: (me as any)?.fullName ?? user?.displayName ?? null };
  const affordable = (i: StoreItemView) => !live || bal.dpcoin >= i.priceCoins;

  const digital = useMemo(() => store.data ?? [], [store.data]);
  const digitalShown = useMemo(() => digital.filter((i) => !digitalTab || i.type === digitalTab), [digital, digitalTab]);
  // Spotlight: the rarest item the viewer does not own yet (ties: the dearest).
  const featured = useMemo(
    () =>
      [...digital]
        .filter((i) => !i.owned)
        .sort((a, b) => (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) || b.priceCoins - a.priceCoins)[0] ?? null,
    [digital],
  );
  const tabs = useMemo(() => DIGITAL_TABS.filter((t) => !t.id || digital.some((i) => i.type === t.id)), [digital]);
  const countIn = (id: string | null) => (id ? digital.filter((i) => i.type === id).length : digital.length);

  const allProducts = useMemo(() => products.data ?? [], [products.data]);
  const categories = useMemo(() => [...new Set(allProducts.map((x) => x.category))], [allProducts]);
  const productList = useMemo(() => allProducts.filter((x) => !category || x.category === category), [allProducts, category]);
  // Hero drop: the first featured product that is in stock.
  const hotDrop = useMemo(() => allProducts.find((x) => x.featured && x.variants.some((v) => v.inStock)) ?? null, [allProducts]);

  const refreshing = store.isRefetching || products.isRefetching;
  const onRefresh = () => {
    void store.refetch();
    void products.refetch();
    void refetchMe();
  };

  const openProduct = (id: string) => router.push(`/shop/${encodeURIComponent(id)}` as any);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      {/* Top bar */}
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 4 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Shop</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/explore/battles' as any)}
          style={[styles.balance, { backgroundColor: `${GOLD}1A`, borderColor: `${GOLD}66` }]}
          accessibilityRole="button"
          accessibilityLabel={`${live ? bal.dpcoin : 'Unknown'} DP coin. Win contests to earn more`}
        >
          <CoinIcon size={16} />
          <Text style={[styles.balanceText, { color: p.text }]}>{live ? bal.dpcoin.toLocaleString() : '—'}</Text>
          <LinearGradient colors={VOTE_GRAD} style={styles.balancePlus}>
            <Ionicons name="add" size={12} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/shop/orders' as any)} style={[styles.iconBtn, { backgroundColor: p.chip }]} accessibilityLabel="My orders">
          <Ionicons name="receipt-outline" size={19} color={p.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/shop/cart' as any)} style={[styles.iconBtn, { backgroundColor: p.chip }]} accessibilityLabel={`Cart, ${cartCount} items`}>
          <Ionicons name="cart-outline" size={20} color={p.text} />
          {cartCount > 0 && (
            <LinearGradient colors={VOTE_GRAD} style={[styles.dot, { borderColor: p.bg }]}>
              <Text style={styles.dotText}>{cartCount}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
      >
        {/* Sticky Digital | Physical switch */}
        <View style={[styles.switchWrap, { backgroundColor: p.bg }]}>
          <View style={[styles.switch, { width: contentW - PAD * 2, backgroundColor: p.chip, borderColor: p.border }]} accessibilityRole="tablist">
            <ModeButton
              p={p}
              on={mode === 'digital'}
              icon="sparkles"
              label="Digital"
              sub="Frames · Themes · Badges"
              count={cfg.store.enabled ? digital.length : undefined}
              grad={BRAND_GRAD}
              onPress={() => setMode('digital')}
            />
            <ModeButton
              p={p}
              on={mode === 'physical'}
              icon="gift"
              label="Physical"
              sub="Real prizes · Ghar delivery"
              count={cfg.shop.enabled ? allProducts.length : undefined}
              grad={VOTE_GRAD}
              onPress={() => setMode('physical')}
            />
          </View>
        </View>

        <View style={{ width: contentW, alignSelf: 'center' }}>
          {mode === 'digital' ? (
            <>
              <TabIntro
                p={p}
                text="Sab ko dikhega: profile, posts, comments aur leaderboard par"
                action={digital.length ? { label: 'My items', onPress: () => router.push('/rewards/inventory' as any) } : undefined}
              />
              {!cfg.store.enabled ? (
                <ComingSoon p={p} icon="sparkles" text="Digital items jaldi aa rahe hain." />
              ) : store.isLoading ? (
                <ActivityIndicator color={BRAND} style={{ marginVertical: 40 }} />
              ) : store.isError ? (
                <SectionError palette={p} onRetry={() => store.refetch()} label="Digital items load nahi hue." />
              ) : !digital.length ? (
                <ComingSoon p={p} icon="sparkles" text="Abhi koi digital item sale par nahi hai." />
              ) : (
                <>
                  {featured ? (
                    <View style={{ paddingHorizontal: PAD, marginBottom: 16 }}>
                      <FeaturedDigitalCard item={featured} p={p} viewer={viewer} width={contentW - PAD * 2} busy={buying === featured.itemId} affordable={affordable(featured)} onBuy={() => void onBuy(featured)} />
                    </View>
                  ) : null}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {tabs.map((t) => (
                      <Chip key={t.id ?? 'all'} p={p} on={digitalTab === t.id} icon={t.icon} label={t.label} count={countIn(t.id)} onPress={() => setDigitalTab(t.id)} />
                    ))}
                  </ScrollView>
                  <View style={styles.grid}>
                    {digitalShown.map((item) => (
                      <DigitalItemCard
                        key={item.itemId}
                        item={item}
                        width={cardW}
                        p={p}
                        viewer={viewer}
                        busy={buying === item.itemId}
                        affordable={affordable(item)}
                        onBuy={() => void onBuy(item)}
                      />
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <TabIntro
                p={p}
                text="Ghar par delivery, price mein shipping included"
                action={{ label: 'My orders', onPress: () => router.push('/shop/orders' as any) }}
              />
              {!cfg.shop.enabled ? (
                <ComingSoon p={p} icon="bag-handle" text="Shop abhi band hai. Jaldi aa raha hai!" />
              ) : products.isLoading ? (
                <ActivityIndicator color={BRAND} style={{ marginVertical: 40 }} />
              ) : products.isError ? (
                <SectionError palette={p} onRetry={() => products.refetch()} label="Products load nahi hue." />
              ) : !allProducts.length ? (
                <ComingSoon p={p} icon="gift" text="Products jaldi aa rahe hain. Tab tak digital items try karo!" />
              ) : (
                <>
                  {hotDrop ? (
                    <View style={{ paddingHorizontal: PAD, marginBottom: 16 }}>
                      <HotDropCard p={p} item={hotDrop} width={contentW - PAD * 2} canAfford={!live || bal.dpcoin >= hotDrop.priceCoins} onPress={() => openProduct(hotDrop.id)} />
                    </View>
                  ) : null}
                  {categories.length > 1 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                      {[null, ...categories].map((c) => (
                        <Chip
                          key={c ?? 'all'}
                          p={p}
                          on={category === c}
                          label={c ?? 'All'}
                          count={c ? allProducts.filter((x) => x.category === c).length : allProducts.length}
                          capitalize
                          onPress={() => setCategory(c)}
                        />
                      ))}
                    </ScrollView>
                  ) : null}
                  <View style={styles.grid}>
                    {productList.map((item) => (
                      <ProductCard key={item.id} p={p} item={item} width={cardW} canAfford={!live || bal.dpcoin >= item.priceCoins} onPress={() => openProduct(item.id)} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
}

/** One half of the Digital | Physical switch. */
function ModeButton({ p, on, icon, label, sub, count, grad, onPress }: {
  p: Palette; on: boolean; icon: string; label: string; sub: string; count?: number; grad: [string, string]; onPress: () => void;
}) {
  const inner = (
    <>
      <View style={[styles.modeIcon, { backgroundColor: on ? 'rgba(255,255,255,0.22)' : p.card }]}>
        <Ionicons name={icon} size={18} color={on ? '#FFF' : p.sub} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[styles.modeLabel, { color: on ? '#FFF' : p.text }]} numberOfLines={1}>{label}</Text>
          {count !== undefined ? (
            <View style={[styles.modeCount, { backgroundColor: on ? 'rgba(255,255,255,0.25)' : p.border }]}>
              <Text style={[styles.modeCountText, { color: on ? '#FFF' : p.sub }]}>{count}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.modeSub, { color: on ? 'rgba(255,255,255,0.85)' : p.sub }]} numberOfLines={1}>{sub}</Text>
      </View>
    </>
  );
  return (
    <TouchableOpacity
      style={{ flex: 1 }}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${count !== undefined ? `, ${count} items` : ''}`}
    >
      {on ? (
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.mode, styles.modeOn, { shadowColor: grad[0] }]}>{inner}</LinearGradient>
      ) : (
        <View style={styles.mode}>{inner}</View>
      )}
    </TouchableOpacity>
  );
}

/** One-line tab description with an optional link on the right. */
function TabIntro({ p, text, action }: { p: Palette; text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.intro}>
      <Text style={[styles.introText, { color: p.sub }]} numberOfLines={2}>{text}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={[styles.introBtn, { backgroundColor: `${BRAND}14` }]} accessibilityRole="button" hitSlop={6}>
          <Text style={[styles.introBtnText, { color: BRAND }]}>{action.label}</Text>
          <ArrowIcon variant="chevron" direction="right" size={10} color={BRAND} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Wide banner for the featured in-stock product. */
function HotDropCard({ p, item, width, canAfford, onPress }: { p: Palette; item: Product; width: number; canAfford: boolean; onPress: () => void }) {
  const imgW = Math.round(width * 0.42);
  return (
    <ScaleTouchable onPress={onPress} style={[styles.dropBorder, { width }]} accessibilityRole="button" accessibilityLabel={`Hot drop: ${item.title}, ${item.priceCoins} DP coin`}>
      <LinearGradient colors={[GOLD, '#FF4D67', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dropGrad}>
        <LinearGradient colors={['#1A1033', '#2D1B4E', '#14102A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.drop}>
          <View style={[styles.dropImg, { width: imgW, height: imgW }]}>
            {item.images[0] ? (
              <AppImage source={{ uri: item.images[0] }} displayWidth={imgW} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
                <Ionicons name="gift" size={36} color="rgba(255,255,255,0.9)" />
              </LinearGradient>
            )}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.pill, { backgroundColor: 'rgba(240,65,62,0.92)', alignSelf: 'flex-start' }]}>
              <Ionicons name="flame" size={10} color="#FFF" />
              <Text style={styles.pillText}>HOT DROP</Text>
            </View>
            <Text style={styles.dropTitle} numberOfLines={2}>{item.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CoinIcon size={16} color={GOLD} />
              <Text style={styles.dropPrice}>{item.priceCoins.toLocaleString()}</Text>
            </View>
            <LinearGradient colors={canAfford ? VOTE_GRAD : ['#5B5F6B', '#4A4E58']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dropCta}>
              <Ionicons name={canAfford ? 'flash' : 'lock-closed'} size={13} color="#FFF" />
              <Text style={styles.dropCtaText}>{canAfford ? 'Abhi lo' : 'Dekho'}</Text>
            </LinearGradient>
          </View>
        </LinearGradient>
      </LinearGradient>
    </ScaleTouchable>
  );
}

/** Two-column product tile: photo with price pill, title, delivery note. */
function ProductCard({ p, item, width, canAfford, onPress }: { p: Palette; item: Product; width: number; canAfford: boolean; onPress: () => void }) {
  const inStock = item.variants.some((v) => v.inStock);
  return (
    <ScaleTouchable
      style={[styles.card, { width, backgroundColor: p.card, borderColor: item.featured ? `${GOLD}AA` : p.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.priceCoins} DP coin${inStock ? '' : ', out of stock'}`}
    >
      <View style={[styles.img, { width }]}>
        {item.images[0] ? (
          <AppImage source={{ uri: item.images[0] }} displayWidth={width} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <LinearGradient colors={BRAND_GRAD} style={[StyleSheet.absoluteFill, styles.center]}>
            <Ionicons name="gift" size={30} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {item.featured ? (
          <View style={[styles.pill, styles.pillTL, { backgroundColor: 'rgba(240,65,62,0.92)' }]}>
            <Ionicons name="flame" size={10} color="#FFF" />
            <Text style={styles.pillText}>HOT</Text>
          </View>
        ) : null}
        <View style={styles.pricePill}>
          <CoinIcon size={13} color={GOLD} />
          <Text style={styles.pricePillText}>{item.priceCoins.toLocaleString()}</Text>
        </View>
        {!inStock ? (
          <View style={[StyleSheet.absoluteFill, styles.soldOut]}>
            <Text style={styles.soldOutText}>SOLD OUT</Text>
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 10, paddingTop: 9, paddingBottom: 10, gap: 6 }}>
        <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>{item.title}</Text>
        <View style={styles.productMeta}>
          <Ionicons name="car" size={12} color={p.sub} />
          <Text style={[styles.metaText, { color: p.sub }]}>Delivery included</Text>
          <View style={{ flex: 1 }} />
          {inStock && !canAfford ? <Ionicons name="lock-closed" size={12} color={p.sub} /> : null}
        </View>
      </View>
    </ScaleTouchable>
  );
}

function Chip({ p, on, icon, label, count, capitalize, onPress }: { p: Palette; on: boolean; icon?: string; label: string; count?: number; capitalize?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      activeOpacity={0.85}
      style={[styles.chip, { backgroundColor: on ? p.text : 'transparent', borderColor: on ? p.text : p.border }]}
    >
      {icon ? <Ionicons name={icon} size={13} color={on ? p.bg : p.sub} /> : null}
      <Text style={[styles.chipText, { color: on ? p.bg : p.text }, capitalize && { textTransform: 'capitalize' }]}>{label}</Text>
      {count !== undefined ? <Text style={[styles.chipCount, { color: on ? p.bg : p.sub }]}>{count}</Text> : null}
    </TouchableOpacity>
  );
}

function ComingSoon({ p, icon, text }: { p: Palette; icon: string; text: string }) {
  return (
    <View style={[styles.soon, { backgroundColor: p.card, borderColor: p.border }]}>
      <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.soonIcon}>
        <Ionicons name={icon} size={20} color="#FFF" />
      </LinearGradient>
      <Text style={[styles.soonText, { color: p.sub }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16, gap: 8 },
  title: { fontSize: 24, fontFamily: 'Urbanist-Black', fontStyle: 'italic' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, borderRadius: 17, borderWidth: 1, paddingLeft: 9, paddingRight: 4 },
  balanceText: { fontFamily: 'Urbanist-Black', fontSize: 14 },
  balancePlus: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -4, right: -4, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2 },
  dotText: { color: '#fff', fontSize: 10, fontFamily: 'Urbanist-Black' },

  switchWrap: { paddingTop: 6, paddingBottom: 10, alignItems: 'center' },
  switch: { flexDirection: 'row', gap: 6, padding: 5, borderRadius: 22, borderWidth: 1 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 17 },
  modeOn: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  modeIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeLabel: { fontFamily: 'Urbanist-Black', fontSize: 15, flexShrink: 1 },
  modeCount: { minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  modeCountText: { fontFamily: 'Urbanist-Black', fontSize: 10 },
  modeSub: { fontFamily: 'Urbanist-SemiBold', fontSize: 10.5, marginTop: 1 },

  intro: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: PAD, marginTop: 4, marginBottom: 14 },
  introText: { flex: 1, fontFamily: 'Urbanist-Medium', fontSize: 12 },
  introBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100 },
  introBtnText: { fontFamily: 'Urbanist-Bold', fontSize: 12 },

  chips: { gap: 8, paddingHorizontal: PAD, paddingBottom: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, height: 34, borderRadius: 17, borderWidth: 1 },
  chipText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  chipCount: { fontFamily: 'Urbanist-Black', fontSize: 11, opacity: 0.8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: PAD },

  dropBorder: { borderRadius: 24 },
  dropGrad: { borderRadius: 24, padding: 1.5 },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22.5, padding: 12 },
  dropImg: { borderRadius: 18, overflow: 'hidden' },
  dropTitle: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 17 },
  dropPrice: { color: GOLD, fontFamily: 'Urbanist-Black', fontSize: 18 },
  dropCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 12, marginTop: 2 },
  dropCtaText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 13 },

  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  img: { aspectRatio: 1, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 100 },
  pillTL: { position: 'absolute', top: 8, left: 8 },
  pillText: { color: '#FFF', fontSize: 10, fontFamily: 'Urbanist-Black', letterSpacing: 0.5 },
  pricePill: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  pricePillText: { color: GOLD, fontFamily: 'Urbanist-Black', fontSize: 13 },
  soldOut: { backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  soldOutText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 14, letterSpacing: 1.5, borderWidth: 2, borderColor: '#FFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, transform: [{ rotate: '-8deg' }] },
  name: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: 'Urbanist-SemiBold', fontSize: 11 },

  soon: { marginHorizontal: PAD, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  soonIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  soonText: { flex: 1, fontFamily: 'Urbanist-SemiBold', fontSize: 13.5 },
});
