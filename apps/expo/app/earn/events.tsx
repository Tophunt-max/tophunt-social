/**
 * Special Events (Rewards Center → Special Events → View All / Join Now).
 * Every live, upcoming and just-ended admin event, with join, task progress
 * (counted by the server since joining) and Diamond claims.
 */
import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BackButton } from '@/src/components/ui/BackButton';
import { AppImage } from '@/src/components/ui/AppImage';
import { emitToast } from '@/src/lib/toastBridge';
import { useAuth } from '@/src/hooks/useAuth';
import { useDesignWindow } from '@/src/lib/layout';
import { countdown, errorText, missionRoute } from '@/src/lib/rewardsCenter';
import { MISSION_ART } from '@/assets/earning';
import { useClaimEventTask, useEvents, useJoinEvent, type RewardEventView } from '@/src/services/events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Art, ClaimBurst, DiamondAmount, GoldButton, NeonBar, NeonCard, RewardsThemeContext, StateNote, rewardsPalette, useRC, type RewardsPalette } from '@/src/components/rewardsCenter/RewardsBits';

const STYLE_CACHE = new Map<RewardsPalette, ReturnType<typeof makeStyles>>();
function stylesFor(rc: RewardsPalette) {
  let s = STYLE_CACHE.get(rc);
  if (!s) {
    s = makeStyles(rc);
    STYLE_CACHE.set(rc, s);
  }
  return s;
}

export default function EventsScreen() {
  const RC = rewardsPalette(useColorScheme() === 'dark');
  const styles = stylesFor(RC);
  const router = useRouter();
  const { user } = useAuth();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { width } = useDesignWindow();
  const q = useEvents(!!user);
  const join = useJoinEvent();
  const claim = useClaimEventTask();
  const [burst, setBurst] = useState(0);
  const events = [...(q.data?.events ?? [])].sort((a, b) => Number(b.id === focus) - Number(a.id === focus));

  const onJoin = (e: RewardEventView) =>
    join.mutate(e.id, {
      onSuccess: () => { void Haptics.selectionAsync().catch(() => undefined); emitToast(`${e.title} join ho gaya!`, 'success'); },
      onError: (err: any) => emitToast(errorText(err, 'Join nahi hua. Dobara try karo.'), 'error'),
    });
  const onClaim = (e: RewardEventView, taskId: string) =>
    claim.mutate({ eventId: e.id, taskId }, {
      onSuccess: (r) => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setBurst((n) => n + 1);
        emitToast(`+${r?.diamonds ?? 0} Diamond`, 'success');
      },
      onError: (err: any) => emitToast(errorText(err, 'Claim nahi hua. Dobara try karo.'), 'error'),
    });
  const go = (metric: string) => {
    const r = missionRoute(metric);
    router.push((r === 'watch' || r === 'checkin' ? '/earn' : r) as any);
  };

  return (
    <RewardsThemeContext.Provider value={RC}>
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={RC.text} style={{ marginRight: 6 }} />
        <Art name="specialEvent" size={30} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">Special Events</Text>
          <Text style={styles.sub}>Limited Time Earning Events</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ width: Math.min(width, 640), alignSelf: 'center', padding: 16, gap: 14, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={RC.brand} colors={[RC.brand]} />}
      >
        {!user ? <StateNote text="Events dekhne ke liye sign in karo." /> : q.isLoading ? <ActivityIndicator color={RC.brand} style={{ marginTop: 40 }} /> : q.isError ? (
          <StateNote text="Events load nahi hue." action="Dobara try karo" onAction={() => q.refetch()} />
        ) : !events.length ? (
          <StateNote text="Abhi koi event nahi hai. Naye events jaldi aayenge." />
        ) : events.map((e) => (
          <NeonCard key={e.id} highlight={e.phase === 'live'}>
            {e.bannerUrl ? <AppImage source={{ uri: e.bannerUrl }} displayWidth={600} style={styles.banner} contentFit="cover" /> : null}
            <View style={styles.top}>
              <Art name="eventGiftBox" size={54} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.row}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{e.title}</Text>
                  <PhasePill e={e} />
                </View>
                {e.description ? <Text style={styles.sub}>{e.description}</Text> : null}
                <Text style={styles.meta}>
                  {e.phase === 'scheduled' ? `Shuru hoga ${countdown(e.startsAt)} me` : e.phase === 'live' ? `${countdown(e.endsAt)} baaki` : `Claim ${countdown(e.claimUntil)} tak`}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>Total</Text>
                  <DiamondAmount amount={e.totalCoins} size={12} />
                  {e.budgetLeft != null ? (
                    <>
                      <Text style={styles.meta}>·  Budget</Text>
                      <DiamondAmount amount={e.budgetLeft} size={12} prefix="" />
                      <Text style={styles.meta}>bacha</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>
            {e.blockedReason && !e.joined ? (
              <StateNote text={e.blockedReason} />
            ) : !e.joined ? (
              e.phase === 'live' ? <GoldButton label="Join Now" busy={join.isPending && join.variables === e.id} onPress={() => onJoin(e)} /> : (
                <StateNote text={e.phase === 'scheduled' ? 'Event shuru hone par join kar sakte ho.' : 'Ye event khatam ho gaya.'} />
              )
            ) : (
              <View style={{ gap: 12 }}>
                <View style={styles.row}>
                  <Art name="dayCheck" size={18} />
                  <Text style={[styles.joined, { flexShrink: 1 }]}>Joined · progress join karne ke baad se ginti hai</Text>
                </View>
                {e.tasks.map((t) => (
                  <View key={t.id} style={styles.task}>
                    <Art name={t.claimed ? 'missionComplete' : MISSION_ART[t.metric] ?? 'dailyMission'} size={38} />
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={styles.taskTitle} numberOfLines={2}>{t.title}</Text>
                      <NeonBar value={t.target ? t.progress / t.target : 0} />
                      <Text style={styles.meta}>{t.progress}/{t.target}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <DiamondAmount amount={t.coins} />
                      {t.claimed ? <Text style={styles.done}>Claimed</Text> : t.claimable ? (
                        <GoldButton small label="Claim" busy={claim.isPending && claim.variables?.taskId === t.id && claim.variables?.eventId === e.id} onPress={() => onClaim(e, t.id)} />
                      ) : e.phase === 'live' ? (
                        <GoldButton small label="Go" variant="secondary" onPress={() => go(t.metric)} />
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </NeonCard>
        ))}
      </ScrollView>
      <ClaimBurst playKey={burst} />
    </SafeAreaView>
    </RewardsThemeContext.Provider>
  );
}

function PhasePill({ e }: { e: RewardEventView }) {
  const RC = useRC();
  const styles = stylesFor(RC);
  if (e.phase === 'live') return <View style={[styles.pill, { backgroundColor: RC.brand }]}><View style={styles.dot} /><Text style={styles.pillText}>LIVE</Text></View>;
  if (e.phase === 'scheduled') return <View style={[styles.pill, { backgroundColor: RC.brandSoft }]}><Text style={[styles.pillText, { color: RC.brand }]}>SOON</Text></View>;
  return <View style={[styles.pill, { backgroundColor: RC.tint }]}><Text style={[styles.pillText, { color: RC.sub }]}>ENDED</Text></View>;
}

function makeStyles(RC: RewardsPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: RC.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 20 },
  sub: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 12.5 },
  banner: { width: '100%', height: 140, borderRadius: 14, marginBottom: 12 },
  top: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTitle: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 18, flexShrink: 1 },
  meta: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 11.5 },
  joined: { color: RC.green, fontFamily: 'Urbanist-Bold', fontSize: 12 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  taskTitle: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 14 },
  done: { color: RC.green, fontFamily: 'Urbanist-Bold', fontSize: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  pillText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  });
}
