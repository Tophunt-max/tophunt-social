import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '@/src/components/ui/BackButton';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, PAD, useExplorePalette, type ExplorePalette } from '@/src/components/explore/theme';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useAppConfig } from '@/src/services/appSettings';
import { walletService } from '@/src/services/wallet/walletService';
import { newRequestId, useMonetizationConfig } from '@/src/services/monetization';
import { useConvertXp, useXpConversion } from '@/src/services/shop';

/**
 * Earning: every free way to get 💎 Diamonds, in one place. Diamonds pay
 * contest entry fees; winning a contest gives 🪙 DP coin for Shopping.
 * Diamonds can't be bought and can't be turned into DP coin.
 */
export default function EarnScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const { config } = useAppConfig();
  const mon = useMonetizationConfig();
  const { data: me, refetch: refetchMe, isRefetching } = useProfile(user?.uid || '');
  // Same query keys as the wallet screen, so the two share one cached answer.
  const daily = useQuery({ queryKey: ['daily-reward', user?.uid], queryFn: () => walletService.getDailyReward(), enabled: !!user?.uid });
  const tasks = useQuery({ queryKey: ['daily-tasks', user?.uid], queryFn: () => walletService.getDailyTasks(), enabled: !!user?.uid });
  const xp = useXpConversion(!!user && mon.earning.xpConversion.enabled);
  const bal = balancesOf(me as any);

  const dailyReady = !!daily.data && (daily.data as any).claimedToday !== true;
  const taskList: any[] = (tasks.data as any)?.tasks ?? [];
  const tasksLeft = taskList.filter((t) => !t.claimed).length;
  const referral = (config as any)?.referral;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 12 }} />
        <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Earn Diamonds</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetchMe(); void daily.refetch(); void tasks.refetch(); void xp.refetch(); }} tintColor={BRAND} />}
      >
        <View style={[styles.balance, { backgroundColor: BRAND }]}>
          <DiamondIcon size={22} color="#FFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.balanceValue}>{hasLiveBalance(me) ? bal.diamonds : '—'} Diamond</Text>
            <Text style={styles.balanceSub}>Contest khelo aur jeeto → DP coin → Shopping</Text>
          </View>
        </View>

        <Way p={p} icon="calendar-outline" title="Daily check-in" sub={dailyReady ? 'Aaj ka reward ready hai' : 'Roz aao, streak badhao'} badge={dailyReady ? 'Claim' : undefined} onPress={() => router.push('/wallet')} />
        <Way p={p} icon="checkmark-done-outline" title="Daily tasks" sub={taskList.length ? `${tasksLeft} task baaki` : 'Vote, share, contest khelo'} onPress={() => router.push('/wallet')} />
        {referral?.enabled ? (
          <Way p={p} icon="people-outline" title="Refer & earn" sub="Dosto ko bulao, dono ko Diamond" onPress={() => router.push('/referral' as any)} />
        ) : null}
        <Way p={p} icon="shield-checkmark-outline" title="Account verify karo" sub="Email aur mobile verify bonus" onPress={() => router.push('/profile/manage/verification' as any)} />
        <Way p={p} icon="trophy-outline" title="Level aur season rewards" sub="Level up par Diamond milte hain" onPress={() => router.push('/rewards' as any)} />
        {mon.earning.xpConversion.enabled ? <XpCard p={p} status={xp.data} loading={xp.isLoading} onDone={() => void refetchMe()} /> : null}
        {mon.ads.rewarded.enabled ? (
          <Way p={p} icon="play-circle-outline" title="Ad dekho" sub={`Har ad par ${mon.ads.rewarded.rewardDiamonds} Diamond`} onPress={() => router.push('/wallet')} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Way({ p, icon, title, sub, badge, onPress }: { p: ExplorePalette; icon: string; title: string; sub: string; badge?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.way, { backgroundColor: p.card, borderColor: p.border }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <View style={styles.wayIcon}><Ionicons name={icon as any} size={22} color={BRAND} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.wayTitle, { color: p.text }]}>{title}</Text>
        <Text style={[styles.waySub, { color: p.sub }]}>{sub}</Text>
      </View>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : <ArrowIcon variant="chevron" direction="right" size={16} color={p.sub} />}
    </TouchableOpacity>
  );
}

function XpCard({ p, status, loading, onDone }: { p: ExplorePalette; status: any; loading: boolean; onDone: () => void }) {
  const convert = useConvertXp();
  const [n, setN] = useState(1);
  const requestId = useRef<string | null>(null);
  const max = status?.availableDiamonds ?? 0;
  const qty = Math.min(Math.max(1, n), Math.max(1, max));
  const go = () => {
    if (!requestId.current) requestId.current = newRequestId();
    convert.mutate(
      { diamonds: qty, requestId: requestId.current },
      {
        onSuccess: (r) => {
          requestId.current = null;
          setN(1);
          emitToast(`${r.xpSpent} XP → ${r.diamonds} Diamond`, 'success');
          onDone();
        },
        onError: (e: any) => {
          if (e?.status) requestId.current = null;
          emitToast(e?.message || 'Convert nahi hua. Dobara try karo.', 'error');
        },
      },
    );
  };
  return (
    <View style={[styles.way, { backgroundColor: p.card, borderColor: p.border, flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.wayIcon}><Ionicons name="flash-outline" size={22} color={BRAND} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.wayTitle, { color: p.text }]}>XP → Diamond</Text>
          <Text style={[styles.waySub, { color: p.sub }]}>
            {status ? `${status.xpPerDiamond} XP = 1 Diamond · aapke paas ${status.convertibleXp} XP · aaj ${status.diamondsToday}/${status.maxDiamondsPerDay}` : 'Loading…'}
          </Text>
          <Text style={[styles.waySub, { color: p.sub }]}>Aapka level aur XP kam nahi hoga.</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={BRAND} />
      ) : max > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={styles.step} onPress={() => { setN(Math.max(1, qty - 1)); requestId.current = null; }} accessibilityLabel="Kam"><Text style={styles.stepText}>−</Text></TouchableOpacity>
          <Text style={[styles.wayTitle, { color: p.text, minWidth: 30, textAlign: 'center' }]}>{qty}</Text>
          <TouchableOpacity style={styles.step} onPress={() => { setN(Math.min(max, qty + 1)); requestId.current = null; }} accessibilityLabel="Zyada"><Text style={styles.stepText}>+</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.cta, { opacity: convert.isPending ? 0.6 : 1 }]} onPress={go} disabled={convert.isPending} accessibilityRole="button">
            {convert.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{qty * (status?.xpPerDiamond ?? 0)} XP convert karo</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={[styles.waySub, { color: p.sub }]}>
          {status && status.diamondsToday >= status.maxDiamondsPerDay ? 'Aaj ki limit poori. Kal phir aao.' : 'Abhi itna XP nahi hai. Vote karo, contest khelo, XP kamao.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 16 },
  title: { fontSize: 22, fontFamily: 'Urbanist-Bold' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: PAD, marginBottom: 16, padding: 16, borderRadius: 20 },
  balanceValue: { color: '#fff', fontFamily: 'Urbanist-Bold', fontSize: 22 },
  balanceSub: { color: '#FFE4E9', fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 2 },
  way: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: PAD, marginBottom: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  wayIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFF1F3', alignItems: 'center', justifyContent: 'center' },
  wayTitle: { fontFamily: 'Urbanist-Bold', fontSize: 15 },
  waySub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 2 },
  badge: { backgroundColor: BRAND, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontFamily: 'Urbanist-Bold', fontSize: 12 },
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: 'Urbanist-Bold', color: '#111' },
  cta: { flex: 1, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  ctaText: { color: '#fff', fontFamily: 'Urbanist-Bold', fontSize: 14 },
});
