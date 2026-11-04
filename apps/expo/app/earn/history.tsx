/**
 * Reward History: every reward movement on the account, newest first, in 7
 * tabs (All, Diamonds Earned, XP Earned, DP Coins Won, Diamonds Spent, XP
 * Conversion, Reversed / Adjusted). Rows and amounts come from the Worker
 * (getRewardHistory, cursor-paginated); nothing here computes a balance.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { useAuth } from '@/src/hooks/useAuth';
import { useDesignWindow } from '@/src/lib/layout';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Art, CoinAmount, DiamondAmount, RewardsThemeContext, StateNote, XpAmount, rewardsPalette, useRC, type RewardsPalette } from '@/src/components/rewardsCenter/RewardsBits';
import { useRewardHistory } from '@/src/services/rewardHistory';
import {
  REWARD_HISTORY_TABS,
  historyAmounts,
  historyArt,
  isReversedRow,
  historyDay,
  historyTabOf,
  historyTitle,
  signed,
  type AmountUnit,
  type HistoryTab,
  type RewardHistoryItem,
} from '@/src/lib/rewardHistory';

const UNIT_NAME: Record<AmountUnit, string> = { diamond: 'Diamonds', dpcoin: 'DP coin', xp: 'XP' };

const STYLE_CACHE = new Map<RewardsPalette, ReturnType<typeof makeStyles>>();
function stylesFor(rc: RewardsPalette) {
  let s = STYLE_CACHE.get(rc);
  if (!s) {
    s = makeStyles(rc);
    STYLE_CACHE.set(rc, s);
  }
  return s;
}

const EMPTY: Record<HistoryTab, string> = {
  all: 'Abhi koi reward nahi. Missions aur check-in se shuru karo.',
  diamonds: 'Abhi tak koi Diamond reward nahi mila.',
  xp: 'Abhi tak koi XP nahi mila. Vote karo ya battle join karo.',
  dpcoin: 'Contest jeetne par DP coin yahan dikhenge.',
  spent: 'Contest entry par kharch hue Diamonds yahan dikhenge.',
  conversion: 'XP → Diamond conversion yahan dikhega.',
  adjusted: 'Koi reversal ya adjustment nahi hai.',
};

export default function RewardHistoryScreen() {
  const RC = rewardsPalette(useColorScheme() === 'dark');
  const styles = stylesFor(RC);
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useDesignWindow();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<HistoryTab>(historyTabOf(params.tab));
  const q = useRewardHistory(tab, !!user);
  const items = useMemo(() => (q.data?.pages ?? []).flatMap((pg) => pg.items), [q.data]);
  const now = Date.now();
  const contentWidth = Math.min(width, 640);

  return (
    <RewardsThemeContext.Provider value={RC}>
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.header, { width: contentWidth }]}>
        <BackButton size={24} color={RC.text} style={{ marginRight: 6 }} />
        <Art name="rewardHistory" size={30} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">Reward History</Text>
          <Text style={styles.sub}>All your earnings</Text>
        </View>
      </View>
      <View style={{ width: contentWidth, alignSelf: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {REWARD_HISTORY_TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, { color: on ? '#FFFFFF' : RC.sub }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {!user ? (
        <View style={styles.pad}><StateNote text="History dekhne ke liye sign in karo." /></View>
      ) : q.isLoading ? (
        <ActivityIndicator color={RC.brand} style={{ marginTop: 40 }} />
      ) : q.isError ? (
        <View style={styles.pad}><StateNote text="History load nahi hui." action="Dobara try karo" onAction={() => q.refetch()} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          style={{ width: contentWidth, alignSelf: 'center' }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} tintColor={RC.brand} colors={[RC.brand]} />}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<StateNote text={EMPTY[tab]} />}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={RC.brand} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item, index }) => {
            const day = historyDay(item.createdAt, now);
            const showDay = index === 0 || historyDay(items[index - 1].createdAt, now) !== day;
            return (
              <>
                {showDay ? <Text style={styles.day}>{day}</Text> : null}
                <Row item={item} />
              </>
            );
          }}
        />
      )}
    </SafeAreaView>
    </RewardsThemeContext.Provider>
  );
}

const Row = React.memo(function Row({ item }: { item: RewardHistoryItem }) {
  const RC = useRC();
  const styles = stylesFor(RC);
  const title = historyTitle(item);
  const amounts = historyAmounts(item);
  const art = historyArt(item);
  const reversed = isReversedRow(item);
  const time = new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${title}, ${amounts.map((a) => `${signed(a.value)} ${UNIT_NAME[a.unit]}`).join(', ')}, ${time}`}
    >
      <View style={styles.icon}><Art name={art} size={26} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {reversed ? <Text style={styles.badge}>Reversed</Text> : null}
        </View>
        {item.description && item.description !== item.type ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
        <Text style={styles.time}>{time}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {amounts.length ? amounts.map((a) => {
          const text = signed(a.value);
          const color = a.value < 0 ? RC.red : undefined;
          if (a.unit === 'diamond') return <DiamondAmount key={a.unit} amount={Math.abs(a.value)} prefix={text[0]} color={color} />;
          if (a.unit === 'dpcoin') return <CoinAmount key={a.unit} label={text} color={color} />;
          return <XpAmount key={a.unit} label={`${text} XP`} size={13} />;
        }) : <Text style={[styles.amount, { color: RC.muted }]}>0</Text>}
      </View>
    </View>
  );
});

function makeStyles(RC: RewardsPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: RC.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'center' },
  title: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 22 },
  sub: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 12.5 },
  pad: { padding: 16 },
  tabs: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: RC.borderSoft, backgroundColor: RC.card },
  tabOn: { backgroundColor: RC.brand, borderColor: RC.brand },
  tabText: { fontFamily: 'Urbanist-Bold', fontSize: 13 },
  day: { color: RC.muted, fontFamily: 'Urbanist-Bold', fontSize: 12, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8, borderRadius: 16, backgroundColor: RC.card, borderWidth: 1, borderColor: RC.borderSoft },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: RC.tint },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 14.5, flexShrink: 1 },
  badge: { color: '#FFF', backgroundColor: RC.red, fontFamily: 'Urbanist-Bold', fontSize: 9.5, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  desc: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 12 },
  time: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 11 },
  amount: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  });
}
