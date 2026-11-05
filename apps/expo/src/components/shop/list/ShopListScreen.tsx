/**
 * The shared screen of every Shop "View All" page (/shop/categories,
 * /shop/category/[type], /shop/featured, /shop/trending, /shop/deals,
 * /shop/collections, /shop/bundles): header (back, title, subtitle, the DP
 * coin or Diamond balance), an optional banner, search, filter chips, the
 * results count with a Sort button (bottom sheet), then a virtualized
 * FlatList: a 2-column grid on phones (3 at ≥ 600 pt), or a 1-column list.
 *
 * States: signed out, store off, loading (skeleton), error (retry), empty
 * (with "Filters hatao" when filters are on). The BottomNav sits at the
 * bottom and `overlay` (the purchase sheet) above everything.
 *
 * Colours follow the app palette (light + dark); active chips and buttons
 * are brand pink.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, type ListRenderItemInfo } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { BackButton } from '@/src/components/ui/BackButton';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { BottomNav } from '@/src/components/home/BottomNav';
import { CardSkeleton, EmptyState, ErrorState } from '@/src/components/shop/premium/ShopBlocks';
import { useAuth } from '@/src/hooks/useAuth';
import { useAuthGate } from '@/src/hooks/useAuthGate';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { Ionicons } from '@/src/lib/icons';
import { useDesignWindow, webPhoneColumn } from '@/src/lib/layout';
import { countLabel } from '@/src/lib/shopListModel';
import { BRAND, BRAND_BUTTON, TH, gridCellWidth, useTophuntPalette, type TophuntPalette } from '@/src/theme/tophunt';

export const LIST_GAP = 12;
export type ListGate = 'signedOut' | 'off' | null;

/** Content width cap on tablets (the grid stays a phone-like 3 columns). */
const MAX_W = 760;

/** Columns of the grid layout: 2 on phones, 3 from 600 pt. */
export function listColumns(width: number): 2 | 3 {
  return width >= 600 ? 3 : 2;
}

/** Content width and side padding of a list page for a (design) window width; pages size banners with it. */
export function listMetrics(width: number): { contentW: number; pad: number; inner: number } {
  const contentW = Math.min(width, MAX_W);
  const pad = contentW >= 600 ? 20 : 16;
  return { contentW, pad, inner: contentW - pad * 2 };
}

export interface ListChip {
  key: string;
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: string;
  count?: number;
}

export interface ListSort {
  options: readonly { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}

export interface ShopListScreenProps<T> {
  title: string;
  subtitle?: string;
  /** Balance pill: DP coin (digital items) or Diamond (bundles). */
  currency?: 'dp' | 'diamond';
  /** Drawn above the search and chips (only when the page is ready). */
  banner?: React.ReactNode;
  search?: { value: string; onChange: (q: string) => void; placeholder: string };
  chips?: ListChip[];
  sort?: ListSort;
  /** Results count ("24 items"); null / undefined hides it. */
  count?: number | null;
  countNoun?: [string, string];
  data: readonly T[];
  keyOf: (item: T) => string;
  /** Memoize in the page; `width` is the cell width of the current layout. */
  renderItem: (item: T, width: number, index: number) => React.ReactElement | null;
  layout?: 'grid' | 'list';
  /** Skeleton tile height for the list layout (rows). */
  rowHeight?: number;
  gate?: ListGate;
  /** Text of the store-off state. */
  offText?: string;
  loading?: boolean;
  /** Error text; set when the data failed to load. */
  error?: string | null;
  onRetry?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Empty state; null = no empty state (the page shows something else, e.g. a footer). */
  empty?: { icon: string; title?: string; text: string; onClearFilters?: () => void; action?: { label: string; onPress: () => void } } | null;
  /** Drawn under the list when ready (extra sections). */
  footer?: React.ReactNode;
  /** Rendered once above the screen (the purchase sheet `dialog`). */
  overlay?: React.ReactNode;
}

export function ShopListScreen<T>(props: ShopListScreenProps<T>) {
  const {
    title, subtitle, currency = 'dp', banner, search, chips, sort, count, countNoun, data, keyOf, renderItem,
    layout = 'grid', rowHeight = 96, gate = null, offText, loading, error, onRetry, refreshing = false, onRefresh, empty, footer, overlay,
  } = props;
  const p = useTophuntPalette();
  const router = useRouter();
  const focused = useIsFocused();
  const { requireAuth } = useAuthGate();
  const { width } = useDesignWindow();
  const { contentW, pad } = listMetrics(width);
  const cols = layout === 'list' ? 1 : listColumns(contentW);
  const cellW = layout === 'list' ? contentW - pad * 2 : gridCellWidth(contentW, cols, LIST_GAP, pad);
  const [sortOpen, setSortOpen] = useState(false);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/shop' as any);
  }, [router]);
  const backToShop = useCallback(() => router.replace('/shop' as any), [router]);

  const ready = !gate && !loading && !error;
  const list = ready ? data : EMPTY;

  const render = useCallback(({ item, index }: ListRenderItemInfo<T>) => renderItem(item, cellW, index), [renderItem, cellW]);
  const key = useCallback((item: T) => keyOf(item), [keyOf]);

  const sortLabel = sort?.options.find((o) => o.key === sort.value)?.label;
  const header = (
    <View>
      {ready && banner ? <View style={styles.banner}>{banner}</View> : null}
      {ready && search ? <SearchField p={p} {...search} /> : null}
      {ready && chips?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -pad, marginTop: 12 }}
          contentContainerStyle={[styles.chips, { paddingHorizontal: pad }]}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Filters"
        >
          {chips.map((c) => <FilterChip key={c.key} p={p} chip={c} />)}
        </ScrollView>
      ) : null}
      {ready && (count != null || sort) ? (
        <View style={styles.toolbar}>
          {count != null ? (
            <Text style={[styles.count, { color: p.sub }]} accessibilityLiveRegion="polite">{countLabel(count, countNoun?.[0], countNoun?.[1])}</Text>
          ) : <View />}
          {sort && sortLabel ? (
            <TouchableOpacity
              onPress={() => setSortOpen(true)}
              activeOpacity={0.85}
              hitSlop={HIT4}
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${sortLabel}. Badlo`}
              style={[styles.sortBtn, { backgroundColor: p.card, borderColor: p.border }]}
            >
              <Ionicons name="options-outline" size={15} color={BRAND} />
              <Text style={[styles.sortText, { color: p.text }]} numberOfLines={1}>{sortLabel}</Text>
              <Ionicons name="chevron-down" size={13} color={p.sub} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!ready ? <View style={{ height: 4 }} /> : null}
    </View>
  );

  let state: React.ReactElement | null = null;
  if (gate === 'signedOut') {
    state = <EmptyState p={p} icon="sparkles" title="Sign in karo" text="Shop ke items dekhne aur kharidne ke liye sign in karo." action={{ label: 'Sign in', onPress: () => void requireAuth('wallet') }} />;
  } else if (gate === 'off') {
    state = <EmptyState p={p} icon="sparkles" title="Store abhi band hai" text={offText ?? 'Digital items jaldi wapas aayenge.'} action={{ label: 'Shop par wapas', onPress: backToShop }} />;
  } else if (loading) {
    state = <ListSkeleton p={p} cols={cols} cellW={cellW} rowHeight={rowHeight} />;
  } else if (error) {
    state = <ErrorState p={p} text={error} onRetry={() => onRetry?.()} />;
  } else if (empty) {
    state = (
      <EmptyState
        p={p}
        icon={empty.icon}
        title={empty.title}
        text={empty.text}
        action={empty.onClearFilters ? { label: 'Filters hatao', onPress: empty.onClearFilters } : empty.action ?? { label: 'Shop par wapas', onPress: backToShop }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      {focused ? <StatusBar style={p.isDark ? 'light' : 'dark'} /> : null}
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={[styles.bar, { width: contentW, paddingHorizontal: pad }]}>
          <BackButton size={20} color={p.text} onPress={back} accessibilityLabel="Wapas jao" style={[styles.iconBtn, { backgroundColor: p.card, borderColor: p.border }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: p.text }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: p.sub }]} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <BalancePill p={p} currency={currency} />
        </View>
        <FlatList
          key={`cols-${cols}`}
          data={list as T[]}
          keyExtractor={key}
          renderItem={render}
          numColumns={cols}
          columnWrapperStyle={cols > 1 ? { gap: LIST_GAP } : undefined}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={header}
          ListEmptyComponent={state}
          ListFooterComponent={ready && footer ? <View>{footer}</View> : null}
          contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: pad, paddingTop: 4, paddingBottom: 32 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} colors={[BRAND]} /> : undefined}
        />
        <BottomNav backgroundColor={p.bg} isDark={p.isDark} />
        {sort ? <SortSheet p={p} visible={sortOpen} sort={sort} onClose={() => setSortOpen(false)} /> : null}
        {overlay}
      </SafeAreaView>
    </View>
  );
}

const EMPTY: readonly never[] = [];
const HIT4 = { top: 4, bottom: 4, left: 4, right: 4 } as const;

function Separator() {
  return <View style={{ height: LIST_GAP }} />;
}

/** DP coin (or Diamond) balance; a skeleton while it loads (never a fake 0). Taps open the wallet. */
function BalancePill({ p, currency }: { p: TophuntPalette; currency: 'dp' | 'diamond' }) {
  const router = useRouter();
  const { user } = useAuth();
  const { data: me } = useProfile(user?.uid || '');
  if (!user) return null;
  const live = hasLiveBalance(me);
  const bal = balancesOf(me as any);
  const value = currency === 'diamond' ? bal.diamonds : bal.dpcoin;
  const unit = currency === 'diamond' ? 'Diamond' : 'DP coin';
  return (
    <TouchableOpacity
      onPress={() => router.push('/wallet' as any)}
      activeOpacity={0.85}
      hitSlop={HIT4}
      accessibilityRole="button"
      accessibilityLabel={live ? `${value.toLocaleString()} ${unit}. Wallet kholo` : `${unit} balance load ho raha hai`}
      style={[styles.pill, { backgroundColor: p.card, borderColor: p.border }]}
    >
      {currency === 'diamond' ? <DiamondIcon size={15} /> : <CoinIcon size={15} />}
      {live ? <Text style={[styles.pillText, { color: p.text }]}>{value.toLocaleString()}</Text> : <Skeleton width={30} height={12} borderRadius={6} />}
    </TouchableOpacity>
  );
}

function SearchField({ p, value, onChange, placeholder }: { p: TophuntPalette; value: string; onChange: (q: string) => void; placeholder: string }) {
  return (
    <View style={[styles.search, { backgroundColor: p.card, borderColor: p.border }]}>
      <Ionicons name="search" size={16} color={p.sub} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.sub}
        style={[styles.searchInput, { color: p.text }]}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value ? (
        <TouchableOpacity onPress={() => onChange('')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Search clear karo">
          <CloseIcon variant="circle" size={18} color={p.sub} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Filter chip: 36 pt pill with a 44 pt touch target; brand pink when on. */
const FilterChip = React.memo(function FilterChip({ p, chip }: { p: TophuntPalette; chip: ListChip }) {
  const { on, label, icon, count } = chip;
  const inner = (
    <>
      {icon ? <Ionicons name={icon} size={13} color={on ? '#FFF' : p.sub} /> : null}
      <Text style={[styles.chipText, { color: on ? '#FFF' : p.text }]} numberOfLines={1}>{label}</Text>
      {count !== undefined ? <Text style={[styles.chipCount, { color: on ? 'rgba(255,255,255,0.85)' : p.sub }]}>{count}</Text> : null}
    </>
  );
  return (
    <TouchableOpacity
      onPress={chip.onPress}
      activeOpacity={0.85}
      hitSlop={HIT4}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${count !== undefined ? `, ${count} items` : ''}`}
    >
      {on ? (
        <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chip}>{inner}</LinearGradient>
      ) : (
        <View style={[styles.chip, { backgroundColor: p.card, borderColor: p.border, borderWidth: 1 }]}>{inner}</View>
      )}
    </TouchableOpacity>
  );
});

function SortSheet({ p, visible, sort, onClose }: { p: TophuntPalette; visible: boolean; sort: ListSort; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Sort band karo" />
      <View style={[styles.sheet, webPhoneColumn, { backgroundColor: p.card, borderColor: p.border, paddingBottom: Math.max(insets.bottom, 12) + 8 }]} accessibilityViewIsModal>
        <View style={[styles.grabber, { backgroundColor: p.border }]} />
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: p.text }]} accessibilityRole="header">Sort karo</Text>
          <TouchableOpacity onPress={onClose} hitSlop={HIT4} style={styles.sheetClose} accessibilityRole="button" accessibilityLabel="Band karo">
            <CloseIcon size={20} color={p.sub} />
          </TouchableOpacity>
        </View>
        {sort.options.map((o) => {
          const on = o.key === sort.value;
          return (
            <TouchableOpacity
              key={o.key}
              onPress={() => {
                sort.onChange(o.key);
                onClose();
              }}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              style={[styles.option, on && { backgroundColor: `${BRAND}14` }]}
            >
              <Text style={[styles.optionText, { color: on ? BRAND : p.text }]}>{o.label}</Text>
              {on ? <Ionicons name="checkmark-circle" size={20} color={BRAND} /> : <View style={[styles.radio, { borderColor: p.border }]} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

function ListSkeleton({ p, cols, cellW, rowHeight }: { p: TophuntPalette; cols: number; cellW: number; rowHeight: number }) {
  const cells = useMemo(() => Array.from({ length: cols > 1 ? cols * 3 : 6 }, (_, i) => i), [cols]);
  return (
    <View style={[styles.skelGrid, { gap: LIST_GAP }]} accessible accessibilityLabel="Items load ho rahe hain">
      {cells.map((i) =>
        cols > 1 ? (
          <CardSkeleton key={i} width={cellW} p={p} />
        ) : (
          <View key={i} style={{ width: cellW, height: rowHeight, borderRadius: TH.radii.lg, backgroundColor: p.skeleton }} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', paddingTop: 6, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: TH.fonts.bold, fontSize: 19 },
  subtitle: { fontFamily: TH.fonts.medium, fontSize: 12, marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 11 },
  pillText: { fontFamily: TH.fonts.bold, fontSize: 13.5 },
  banner: { marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 14, marginTop: 14 },
  searchInput: { flex: 1, fontFamily: TH.fonts.medium, fontSize: 14, paddingVertical: 0 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: TH.radii.pill },
  chipText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  chipCount: { fontFamily: TH.fonts.semibold, fontSize: 11 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, marginBottom: 12, minHeight: 44 },
  count: { fontFamily: TH.fonts.semibold, fontSize: 13 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: TH.radii.pill, borderWidth: 1, paddingHorizontal: 12, maxWidth: '70%' },
  sortText: { fontFamily: TH.fonts.bold, fontSize: 12.5, flexShrink: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: TH.radii.xl, borderTopRightRadius: TH.radii.xl, borderWidth: 1, paddingHorizontal: 16, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontFamily: TH.fonts.bold, fontSize: 17 },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 12, borderRadius: TH.radii.md, marginTop: 4 },
  optionText: { fontFamily: TH.fonts.bold, fontSize: 14.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  skelGrid: { flexDirection: 'row', flexWrap: 'wrap' },
});
