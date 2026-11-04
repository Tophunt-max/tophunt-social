/**
 * Rewards Center: every way to earn, on one scrolling page, in the order of
 * the design reference (Part 1/2 then Part 2/2):
 *
 *   A Header (Diamonds, XP, level)   B Shortcuts        C Daily streak
 *   D Today's missions               E Weekly missions  F Contest rewards
 *   G Watch & Earn                   H Referral + I XP convert
 *   J Special events                 K Achievements     L Leaderboard + M History
 *   plus Level Rewards (the XP roadmap) and Recent Rewards (the ledger).
 *
 * Follows the app's Dark Mode (RewardsBits RC_DARK / RC_LIGHT) and sits above
 * the app-wide BottomNav like Home, Explore and Profile.
 *
 * Nothing here decides a reward. Balances, amounts, progress, limits and claim
 * state all come from the Worker (getProgression, getDailyReward,
 * getDailyTasks, getQuests, getAchievements, getXpConversion, referrals, the
 * rewarded-ad platform with SSV), and every claim is re-checked there.
 * 💎 Diamonds pay contest entry; winning gives 🪙 DP coin for the Shop.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { BackButton } from '@/src/components/ui/BackButton';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { Alert } from '@/src/lib/appAlert';
import { emitToast } from '@/src/lib/toastBridge';
import { StreakMilestoneBanner } from '@/src/components/gamification/MotionBits';
import { useAuth } from '@/src/hooks/useAuth';
import { useAuthGate } from '@/src/hooks/useAuthGate';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { formatXp } from '@/src/lib/progression';
import { useDesignWindow } from '@/src/lib/layout';
import { walletService } from '@/src/services/wallet/walletService';
import { useRewardedAd } from '@/src/ads/fullscreen';
import { newRequestId, useMonetizationConfig } from '@/src/services/monetization';
import { useConvertXp, useXpConversion } from '@/src/services/shop';
import { useAchievements, useClaimQuest, useClaimRewardGrant, useProgression, useQuests, type AchievementView, type QuestView, type RewardGrant, type RoadmapEntry } from '@/src/services/gamification';
import { useMyReferrals } from '@/src/services/referrals';
import { featuredEvent, useEvents } from '@/src/services/events';
import { notificationService } from '@/src/services/notifications/notificationService';
import { appShareOrigin, isCompletedShare, shareBattleLink } from '@/src/lib/share';
import { referralCaption } from '@/src/lib/shareCaptions';
import { MISSION_ART, type EarningArtKey } from '@/assets/earning';
import { countdown, errorText, missionRoute, pickAchievements, streakDays } from '@/src/lib/rewardsCenter';
import { historyAmounts, historyArt, historyDay, historyTitle, isReversedRow, signed, type RewardHistoryItem } from '@/src/lib/rewardHistory';
import { useRewardHistory } from '@/src/services/rewardHistory';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { BottomNav } from '@/src/components/home/BottomNav';
import {
  Art,
  ClaimBurst,
  CoinAmount,
  DiamondAmount,
  GoldButton,
  NeonBar,
  NeonCard,
  PressScale,
  Reveal,
  RewardsThemeContext,
  SectionTitle,
  SkeletonRows,
  StateNote,
  XpAmount,
  PURPLE_GRAD,
  rewardsPalette,
  useRC,
  type RewardsPalette,
} from '@/src/components/rewardsCenter/RewardsBits';

type DailySlot = { day: number; amount: number; status: 'claimed' | 'ready' | 'upcoming' };
type Task = { id: string; title: string; reward: number; xp: number; target: number; type: string; progress: number; claimed: boolean; claimable: boolean; endsAt: number | null };
type SectionKey = 'checkin' | 'missions' | 'weekly' | 'watch' | 'xp';

const PAD = 16;
const GAP = 14;
const MISSIONS_SHOWN = 4;

const ACH_ART: EarningArtKey[] = ['socialStar', 'votingPro', 'contestKing', 'levelUp'];
/** Upcoming levels shown in the Level Rewards rail (claimable ones are always shown first). */
const LEVELS_AHEAD = 6;
const RECENT_SHOWN = 3;

/** Styles for the current palette (one StyleSheet per theme, built once). */
const STYLE_CACHE = new Map<RewardsPalette, ReturnType<typeof makeStyles>>();
function stylesFor(rc: RewardsPalette) {
  let s = STYLE_CACHE.get(rc);
  if (!s) {
    s = makeStyles(rc);
    STYLE_CACHE.set(rc, s);
  }
  return s;
}
const useStyles = () => stylesFor(useRC());

/**
 * Levels for the Level Rewards rail: every reward waiting to be claimed, then
 * the next levels that pay something (Diamonds or items). Server data only.
 */
function levelRail(roadmap: RoadmapEntry[] | undefined, level: number): RoadmapEntry[] {
  const rewarding = (roadmap ?? []).filter((m) => m.coins > 0 || m.items.length > 0);
  const ready = rewarding.filter((m) => m.rewardState === 'claimable');
  const ahead = rewarding.filter((m) => m.level > level && m.rewardState !== 'claimable').slice(0, LEVELS_AHEAD);
  return [...ready, ...ahead];
}

export default function RewardsCenterScreen() {
  const isDark = useColorScheme() === 'dark';
  const RC = rewardsPalette(isDark);
  const styles = stylesFor(RC);
  const router = useRouter();
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const mon = useMonetizationConfig();
  const { width } = useDesignWindow();
  const wide = width >= 700;
  const contentW = Math.min(width, wide ? 900 : 640);
  const signedIn = !!user?.uid;

  const { data: me, refetch: refetchMe, isRefetching } = useProfile(user?.uid || '');
  const prog = useProgression(signedIn);
  const daily = useQuery({ queryKey: ['daily-reward', user?.uid], queryFn: () => walletService.getDailyReward(), enabled: signedIn });
  const tasksQ = useQuery({ queryKey: ['daily-tasks', user?.uid], queryFn: () => walletService.getDailyTasks(), enabled: signedIn });
  const quests = useQuests(signedIn);
  const achievements = useAchievements(signedIn);
  const xpConv = useXpConversion(signedIn && mon.earning.xpConversion.enabled);
  const referrals = useMyReferrals(signedIn);
  const eventsQ = useEvents(signedIn);
  const event = featuredEvent(eventsQ.data?.events ?? []);
  // Same query (and cache) as the Reward History screen's "All" tab.
  const recentQ = useRewardHistory('all', signedIn);
  const recent: RewardHistoryItem[] = useMemo(() => (recentQ.data?.pages?.[0]?.items ?? []).slice(0, RECENT_SHOWN), [recentQ.data]);
  const claimQuest = useClaimQuest();
  const claimGrant = useClaimRewardGrant();
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);

  const [busy, setBusy] = useState<string | null>(null);
  const [adSheet, setAdSheet] = useState(false);
  const [showAllMissions, setShowAllMissions] = useState(false);
  const [burst, setBurst] = useState(0);
  const [streakCelebration, setStreakCelebration] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);

  // Shortcut targets: each section reports its y offset inside the scroll view.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  const mark = (k: SectionKey) => (e: { nativeEvent: { layout: { y: number } } }) => { offsets.current[k] = e.nativeEvent.layout.y; };
  const jump = (k: SectionKey) => {
    void Haptics.selectionAsync().catch(() => undefined);
    const y = offsets.current[k];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };

  useEffect(() => {
    setUnread(0);
    if (!user?.uid) return;
    return notificationService.subscribeToUnreadCount(user.uid, (n: number) => setUnread(n));
  }, [user?.uid]);

  const celebrate = (text: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setBurst((n) => n + 1);
    emitToast(text, 'success');
  };
  const fail = (text: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    emitToast(text, 'error');
  };

  // ------------------------------------------------------------- streak (C)
  const d: any = daily.data ?? {};
  const track: DailySlot[] = d.track ?? [];
  const checkinOn = d.enabled !== false && track.length > 0;
  const checkinReady = checkinOn && d.claimedToday !== true;
  const week = streakDays(track);
  const weekDone = week.filter((s) => s.status === 'claimed').length;
  // The next day still to collect (today when unclaimed, else the first upcoming one).
  const nextSlot = week.find((s) => s.status !== 'claimed') ?? null;
  const claimCheckin = async () => {
    if (!checkinReady || busy) return;
    setBusy('checkin');
    try {
      const r: any = await walletService.claimDailyBonus();
      setStreakCelebration(Number(r?.streak) || null);
      celebrate(`+${r?.coinsEarned ?? 0} Diamond! Streak ${r?.streak ?? ''} din`);
    } catch (e: any) {
      fail(errorText(e, 'Check-in nahi hua. Dobara try karo.'));
    } finally {
      setBusy(null);
      void daily.refetch();
      void refetchMe();
    }
  };

  // ------------------------------------------------------------ watch (G)
  const rewarded = useRewardedAd('earn_rewarded', () => {
    setBurst((n) => n + 1);
    void refetchMe();
    void tasksQ.refetch();
  });
  const watchAd = async () => {
    if (!requireAuth('wallet')) return;
    if (busy || rewarded.busy) return;
    if (!rewarded.enabled) return setAdSheet(true);
    await rewarded.watch();
  };

  // ----------------------------------------------------------- missions (D)
  const tr: any = tasksQ.data ?? {};
  const tasks: Task[] = useMemo(
    () =>
      ((tr.tasks ?? []) as Task[])
        .filter((t) => t.type !== 'ad' && (t.type !== 'ads' || rewarded.enabled))
        .sort((a, b) => Number(b.claimable) - Number(a.claimable) || Number(a.claimed) - Number(b.claimed)),
    [tr.tasks, rewarded.enabled],
  );
  const claimTask = async (t: Task) => {
    if (busy) return;
    setBusy(t.id);
    try {
      const r: any = await walletService.claimDailyTask(t.id);
      celebrate(`+${r?.reward ?? t.reward} Diamond${r?.xpEarned ? ` · +${r.xpEarned} XP` : ''}`);
    } catch (e: any) {
      fail(errorText(e, 'Claim nahi hua. Dobara try karo.'));
    } finally {
      setBusy(null);
      void tasksQ.refetch();
      void refetchMe();
    }
  };
  const go = (kind: string) => {
    const r = missionRoute(kind);
    if (r === 'watch') return void watchAd();
    if (r === 'checkin') return jump('checkin');
    router.push(r as any);
  };
  const goTask = (t: Task) => {
    if (t.claimed) return;
    if (t.claimable) return void claimTask(t);
    go(t.type);
  };

  // ------------------------------------------------------------- weekly (E)
  // Weekly goals first, then the monthly ones.
  const weekly = (quests.data?.quests ?? []).filter((q) => !q.locked).sort((a, b) => Number(a.period !== 'week') - Number(b.period !== 'week'));
  const goQuest = (q: QuestView) => {
    if (q.claimed) return;
    if (!q.claimable) return go(q.metric);
    claimQuest.mutate(q.id, {
      onSuccess: (r) => {
        celebrate([r?.diamonds ? `+${r.diamonds} Diamond` : null, r?.xpEarned ? `+${r.xpEarned} XP` : null].filter(Boolean).join(' · ') || 'Mission claimed');
        void refetchMe();
      },
      onError: (e: any) => fail(errorText(e, 'Claim nahi hua. Dobara try karo.')),
    });
  };

  // ------------------------------------------------------------ referral (H)
  const ref = referrals.data;
  const refLink = useMemo(() => {
    if (!ref?.code) return null;
    const origin = appShareOrigin();
    return origin ? `${origin.replace(/\/$/, '')}/invite/${encodeURIComponent(ref.code)}` : ref.link;
  }, [ref?.code, ref?.link]);
  const copyCode = async () => {
    if (!ref?.code) return;
    try {
      await Clipboard.setStringAsync(ref.code);
      void Haptics.selectionAsync().catch(() => undefined);
      emitToast('Code copied', 'success');
    } catch {
      fail('Copy nahi ho paya');
    }
  };
  const invite = async () => {
    if (!requireAuth('wallet')) return;
    if (!ref?.code || !refLink) return router.push('/referral' as any);
    const outcome = await shareBattleLink({ caption: referralCaption(ref.code, refLink), url: refLink });
    if (outcome === 'copied_link') emitToast('Invite link copied. Ab dosto ko bhejo!', 'success');
    else if (outcome === 'failed') fail('Share nahi ho paya. Code copy karke bhejo.');
    else if (!isCompletedShare(outcome) && outcome !== 'dismissed') emitToast('Link copy karke share karo.', 'info');
  };

  const level = prog.data?.levelInfo;
  // Diamonds already earned and waiting (achievements, contests, level milestones, seasons).
  const grants = prog.data?.rewards?.claimable ?? [];
  const held = !!prog.data?.rewards?.held;
  const contestCfg = mon.earning.contestRewards;
  const claim = (id: string) =>
    claimGrant.mutate(id, {
      onSuccess: (r) => { celebrate(`+${r?.coins ?? 0} Diamond`); void refetchMe(); },
      onError: (e: any) => fail(errorText(e, 'Claim nahi hua. Dobara try karo.')),
    });
  const season = prog.data?.season ?? null;
  const levels = useMemo(() => levelRail(prog.data?.roadmap, level?.level ?? 0), [prog.data?.roadmap, level?.level]);
  const levelGrant = (lv: number): RewardGrant | undefined => grants.find((g) => g.sourceType === 'level' && g.sourceId === String(lv));
  const refUnit = ref?.program?.rewardUnit === 'DP coin' ? 'dpcoin' : 'diamond';
  const achList = useMemo(() => pickAchievements(achievements.data?.achievements ?? []), [achievements.data]);

  const refreshAll = useCallback(() => {
    void refetchMe();
    void prog.refetch();
    void daily.refetch();
    void tasksQ.refetch();
    void quests.refetch();
    void achievements.refetch();
    void referrals.refetch();
    void eventsQ.refetch();
    if (signedIn) void recentQ.refetch();
    if (mon.earning.xpConversion.enabled) void xpConv.refetch();
  }, [refetchMe, prog, daily, tasksQ, quests, achievements, referrals, eventsQ, recentQ, signedIn, xpConv, mon.earning.xpConversion.enabled]);

  const shortcuts: { key: string; art: EarningArtKey; label: string; onPress: () => void }[] = [
    { key: 'checkin', art: 'checkIn', label: 'Check-in', onPress: () => jump('checkin') },
    { key: 'missions', art: 'dailyMission', label: 'Missions', onPress: () => jump('missions') },
    { key: 'weekly', art: 'weeklyMission', label: 'Weekly', onPress: () => jump('weekly') },
    { key: 'referral', art: 'referral', label: 'Referral', onPress: () => router.push('/referral' as any) },
    { key: 'watch', art: 'watchEarn', label: 'Watch & Earn', onPress: () => jump('watch') },
    { key: 'xp', art: 'xpConvert', label: 'XP Convert', onPress: () => jump('xp') },
  ];

  const half = wide ? { flex: 1 } : { flex: 1, minWidth: 0 };

  return (
    <RewardsThemeContext.Provider value={RC}>
    <SafeAreaView style={styles.screen} edges={['top']}>
      <LinearGradient colors={[RC.bg2, RC.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: PAD, paddingBottom: 28, gap: GAP }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refreshAll} tintColor={RC.brand} colors={[RC.brand]} />}
      >
        {/* A. Header */}
        <View style={styles.header}>
          <BackButton size={24} color={RC.text} style={{ marginRight: 2 }} />
          <Art name="rewardsCrown" size={26} />
          <Text style={styles.brand}>TopHunt</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => requireAuth('notifications', { returnTo: '/notifications' }) && router.push('/notifications')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            style={styles.bell}
          >
            <Ionicons name="notifications" size={22} color={RC.text} />
            {unread > 0 ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
          </Pressable>
        </View>
        <Reveal index={0} style={styles.hero}>
          <Art name="rewardsCrown" size={58} />
          <Text style={styles.heroTitle} accessibilityRole="header">Rewards Center</Text>
          <Text style={styles.heroSub}>Play • Complete Tasks • Earn Rewards</Text>
        </Reveal>

        {!signedIn ? (
          <NeonCard>
            <StateNote text="Rewards kamane ke liye sign in karo. Check-in, missions, ads aur referral se Diamond milte hain." action="Sign in" onAction={() => requireAuth('wallet')} />
          </NeonCard>
        ) : null}

        <Reveal index={1}>
        <NeonCard style={styles.balances} glow={RC.cyan}>
          <PressScale onPress={() => router.push('/wallet')} style={styles.balanceHalf} label={`Your Diamonds: ${live ? bal.diamonds : 'unknown'}. Open wallet`}>
            <Art name="diamondGlow" size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>Your Diamonds</Text>
              <Text style={styles.balanceValue} numberOfLines={1}>{live ? bal.diamonds.toLocaleString() : '—'}</Text>
            </View>
            <ArrowGlyph />
          </PressScale>
          <View style={styles.balanceDivider} />
          <PressScale onPress={() => router.push('/rewards' as any)} style={styles.balanceHalf} label={level ? `Level ${level.level}, ${level.xp} XP. Open rewards` : 'Open rewards'}>
            <Art name="xp" size={34} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.balanceLabel}>Your XP</Text>
              {level ? (
                <>
                  <Text style={styles.xpValue} numberOfLines={1}>
                    {formatXp(level.xp)}{level.nextLevelXp ? <Text style={styles.xpOf}> / {formatXp(level.nextLevelXp)}</Text> : null}
                  </Text>
                  <NeonBar value={level.progress} grad={PURPLE_GRAD} height={6} />
                  <Text style={styles.xpNext} numberOfLines={1}>{level.isMaxLevel ? 'Max level' : `${formatXp(level.xpToNextLevel ?? 0)} XP to Lv ${level.level + 1}`}</Text>
                </>
              ) : prog.isLoading ? <ActivityIndicator color={RC.sub} size="small" /> : <Text style={styles.xpNext}>—</Text>}
            </View>
            <View style={styles.levelBadge}>
              <Art name="levelWings" size={50} />
              <Text style={styles.levelNum}>{level?.level ?? '–'}</Text>
              {prog.data?.leveledUp ? <Text style={styles.levelUp}>LEVEL UP</Text> : null}
            </View>
          </PressScale>
        </NeonCard>
        </Reveal>

        {held ? (
          <NeonCard glow={RC.goldDeep}>
            <Text style={styles.cardTitleSm}>Rewards review me hain</Text>
            <Text style={[styles.cardSub, { marginTop: 4 }]}>Aapki haal ki activity ki jaanch ho rahi hai. XP aur level count ho rahe hain; ruke hue Diamond jaanch ke baad milenge.</Text>
          </NeonCard>
        ) : null}

        {grants.length ? (
          <NeonCard highlight>
            <SectionTitle art="rewardChest" title="Rewards to Claim" sub="Aapke kamaye hue Diamond tayyar hain" />
            <View style={{ gap: 10 }}>
              {grants.slice(0, 6).map((g: any) => (
                <View key={g.id} style={styles.mission}>
                  <Art name={g.sourceType === 'contest' ? 'contest' : g.sourceType === 'achievement' ? 'achievement' : 'giftBox'} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.missionTitle} numberOfLines={1}>{g.note || 'Reward'}</Text>
                    <DiamondAmount amount={Number(g.coins) || 0} />
                  </View>
                  <GoldButton small label="Claim" busy={claimGrant.isPending && claimGrant.variables === g.id} disabled={prog.data?.rewards?.budgetAvailable === false} onPress={() => claim(g.id)} />
                </View>
              ))}
              {prog.data?.rewards?.budgetAvailable === false ? <Text style={styles.footnote}>Diamond rewards abhi ruke hain. Aapke rewards save hain, baad me claim karo.</Text> : null}
            </View>
          </NeonCard>
        ) : null}

        {/* B. Shortcuts */}
        <Reveal index={2} style={styles.shortcuts}>
          {shortcuts.map((s) => (
            <PressScale key={s.key} onPress={s.onPress} style={styles.shortcut} label={s.label}>
              <Art name={s.art} size={38} />
              <Text style={styles.shortcutText} numberOfLines={1}>{s.label}</Text>
            </PressScale>
          ))}
        </Reveal>

        {/* C. Daily streak */}
        <Reveal index={3} onLayout={mark('checkin')}>
          <NeonCard highlight={checkinReady}>
            <View style={styles.titleRowAlt}>
              <Art name="streakFire" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Daily Streak</Text>
                <Text style={styles.cardSub}>Login daily & earn bigger rewards!</Text>
              </View>
              <View style={styles.streakPill}>
                <Art name="streakFire" size={16} />
                <Text style={styles.streakPillText}>{Number(d.streak) || 0} Days</Text>
              </View>
            </View>
            {daily.isLoading && signedIn ? <SkeletonRows rows={1} height={60} /> : daily.isError ? (
              <StateNote text="Streak load nahi hua." action="Dobara try karo" onAction={() => daily.refetch()} />
            ) : !checkinOn ? (
              <StateNote text={signedIn ? 'Daily check-in abhi band hai.' : 'Sign in karke streak shuru karo.'} />
            ) : (
              <>
                <View style={styles.days}>
                  {week.map((s, i, all) => (
                    <DayCell key={s.day} slot={s} last={i === all.length - 1} giftDay={i === all.length - 2} />
                  ))}
                </View>
                <View style={styles.weekRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <NeonBar value={week.length ? weekDone / week.length : 0} height={6} />
                    <Text style={styles.missionProg}>{weekDone}/{week.length} din is hafte</Text>
                  </View>
                  {nextSlot ? (
                    <View style={styles.nextReward} accessible accessibilityLabel={`${nextSlot.status === 'ready' ? 'Aaj' : 'Agla'} reward: ${nextSlot.amount} Diamonds`}>
                      <Text style={styles.nextLabel}>{nextSlot.status === 'ready' ? 'Aaj' : 'Agla'}</Text>
                      <DiamondAmount amount={nextSlot.amount} size={13} />
                    </View>
                  ) : null}
                </View>
                {checkinReady ? (
                  <GoldButton icon="giftBox" label={`Claim Today's Reward · +${d.todayReward ?? 0}`} busy={busy === 'checkin'} onPress={() => void claimCheckin()} />
                ) : (
                  <View style={styles.doneRow}>
                    <Art name="missionComplete" size={20} />
                    <Text style={styles.doneText}>Aaj ka reward le liya. Kal phir aao!</Text>
                  </View>
                )}
              </>
            )}
          </NeonCard>
        </Reveal>

        {/* D. Today's missions */}
        <Reveal index={4} onLayout={mark('missions')}>
          <NeonCard>
            <SectionTitle
              art="dailyMission"
              title="Today's Missions"
              sub="Complete tasks and earn Diamonds"
              action={tasks.length > MISSIONS_SHOWN ? (showAllMissions ? 'Show less' : 'View All') : undefined}
              onAction={() => setShowAllMissions((v) => !v)}
            />
            {tasksQ.isLoading && signedIn ? <SkeletonRows rows={3} /> : tasksQ.isError ? (
              <StateNote text="Missions load nahi hue." action="Dobara try karo" onAction={() => tasksQ.refetch()} />
            ) : !tasks.length ? (
              <StateNote text="Aaj koi mission nahi hai. Jaldi naye aayenge." />
            ) : (
              <View style={{ gap: 12 }}>
                {(showAllMissions ? tasks : tasks.slice(0, MISSIONS_SHOWN)).map((t) => (
                  <MissionRow
                    key={t.id}
                    art={MISSION_ART[t.type] ?? 'dailyMission'}
                    title={t.title}
                    progress={t.progress}
                    target={t.target}
                    reward={<DiamondAmount amount={Number(t.reward) || 0} />}
                    state={t.claimed ? 'done' : t.claimable ? 'claim' : 'go'}
                    busy={busy === t.id}
                    onPress={() => goTask(t)}
                  />
                ))}
              </View>
            )}
          </NeonCard>
        </Reveal>

        {/* E. Weekly missions */}
        <Reveal index={5} onLayout={mark('weekly')}>
          <NeonCard>
            <SectionTitle art="weeklyMission" title="Weekly Missions" sub="Complete big goals & win extra rewards" action="View All" onAction={() => router.push('/rewards' as any)} />
            {quests.isLoading ? <SkeletonRows rows={2} /> : quests.isError ? (
              <StateNote text="Weekly missions load nahi hue." action="Dobara try karo" onAction={() => quests.refetch()} />
            ) : quests.data?.enabled === false || !weekly.length ? (
              <StateNote text="Abhi koi weekly mission nahi hai." />
            ) : (
              <View style={{ gap: 12 }}>
                {weekly.slice(0, 3).map((q) => (
                  <MissionRow
                    key={q.id}
                    art={MISSION_ART[q.metric] ?? 'weeklyMission'}
                    big
                    title={q.title}
                    progress={q.progress}
                    target={q.target}
                    reward={(q.coins ?? 0) > 0 ? <DiamondAmount amount={q.coins ?? 0} /> : <XpAmount amount={q.xp} />}
                    hint={`${countdown(q.resetsAt) ?? ''} left`}
                    state={q.claimed ? 'done' : q.claimable ? 'claim' : 'go'}
                    busy={claimQuest.isPending && claimQuest.variables === q.id}
                    onPress={() => goQuest(q)}
                  />
                ))}
              </View>
            )}
          </NeonCard>
        </Reveal>

        {/* XP level rewards: the server roadmap (Diamonds and items per level). */}
        {signedIn && prog.data?.enabled !== false ? (
          <Reveal index={6}>
            <NeonCard>
              <SectionTitle art="levelUp" title="Level Rewards" sub="XP kamao, level badhao, rewards unlock karo" action="Roadmap" onAction={() => router.push('/rewards' as any)} />
              {prog.isLoading ? <SkeletonRows rows={1} height={60} /> : prog.isError ? (
                <StateNote text="Level rewards load nahi hue." action="Dobara try karo" onAction={() => prog.refetch()} />
              ) : !levels.length ? (
                <StateNote text={level?.isMaxLevel ? 'Aap max level par ho. Saare level rewards aapke hain!' : 'Agle levels par abhi koi reward set nahi hai.'} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
                  {levels.map((m) => {
                    const g = levelGrant(m.level);
                    return (
                      <LevelTile
                        key={m.level}
                        entry={m}
                        current={level?.level ?? 0}
                        busy={!!g && claimGrant.isPending && claimGrant.variables === g.id}
                        canClaim={!!g && prog.data?.rewards?.budgetAvailable !== false}
                        onClaim={() => g && claim(g.id)}
                        onOpen={() => router.push('/rewards' as any)}
                      />
                    );
                  })}
                </ScrollView>
              )}
            </NeonCard>
          </Reveal>
        ) : null}

        {/* F. Contest rewards */}
        <Reveal index={7}>
        <NeonCard>
          <SectionTitle art="contest" title="Contest Rewards" sub="Participate, Win & Earn More" action="View All" onAction={() => router.push('/explore/battles' as any)} />
          <View style={styles.rewardGrid}>
            <RewardTile
              art="participation"
              label="Participation"
              value={contestCfg.enabled && contestCfg.participation > 0 ? <DiamondAmount amount={contestCfg.participation} size={12} /> : <XpAmount label="XP" size={12} />}
              a11y={contestCfg.enabled && contestCfg.participation > 0 ? `${contestCfg.participation} Diamonds` : 'XP'}
              onPress={() => router.push('/explore/battles' as any)}
            />
            <RewardTile art="winnerCrown" label="Winner" value={<CoinAmount label="DP Coin" size={12} />} a11y="DP coin" highlight onPress={() => router.push('/explore/battles' as any)} />
            <RewardTile
              art="runnerUp"
              label="Runners-up"
              value={contestCfg.enabled && contestCfg.runnerUp > 0 ? <DiamondAmount amount={contestCfg.runnerUp} size={12} /> : <XpAmount label="XP" size={12} />}
              a11y={contestCfg.enabled && contestCfg.runnerUp > 0 ? `${contestCfg.runnerUp} Diamonds` : 'XP'}
              onPress={() => router.push('/explore/battles' as any)}
            />
            <RewardTile art="specialPrize" label="Special" value={<Text style={styles.rewardValue} numberOfLines={1}>Hall of Fame</Text>} a11y="Hall of Fame" onPress={() => router.push('/rewards/hall-of-fame' as any)} />
          </View>
          <Text style={styles.footnote}>
            {contestCfg.enabled && (contestCfg.participation > 0 || contestCfg.runnerUp > 0)
              ? `Battle poori hone par Diamond "Rewards to Claim" me aate hain${contestCfg.paidOnly ? ' (entry fee wali battles)' : ''}. Jeetne par DP coin (Shop ke liye).`
              : 'Jeetne par DP coin (Shop ke liye). Har battle XP deta hai.'}
          </Text>
        </NeonCard>
        </Reveal>

        {/* G. Watch & Earn */}
        <Reveal index={8} onLayout={mark('watch')}>
          <NeonCard highlight={rewarded.enabled && rewarded.left > 0}>
            <View style={styles.titleRowAlt}>
              <Art name="watchEarn" size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Watch & Earn</Text>
                <Text style={styles.cardSub}>Watch Ads & Get Diamonds</Text>
              </View>
              {rewarded.enabled ? (
                <View style={styles.limitPill}><Text style={styles.limitText}>Daily Limit: {rewarded.watched}/{rewarded.cap}</Text></View>
              ) : null}
            </View>
            <View style={styles.watchBody}>
              <Art name="watchEarnIllustration" size={92} />
              <View style={{ flex: 1, gap: 8 }}>
                {rewarded.enabled ? (
                  <>
                    <Text style={styles.watchEarnUpTo}>Earn up to</Text>
                    <DiamondAmount amount={rewarded.reward} size={20} color={RC.text} />
                    <Text style={styles.cardSub}>per ad · {rewarded.left} left today</Text>
                    <GoldButton
                      label={rewarded.busy ? 'Ad chal raha hai…' : rewarded.left > 0 ? 'Watch Now' : 'Kal phir aao'}
                      busy={rewarded.busy}
                      disabled={rewarded.left <= 0}
                      onPress={() => void watchAd()}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.cardSub}>Video ads jaldi aa rahe hain. Tab tak missions aur check-in se Diamond kamao.</Text>
                    <GoldButton label="Missions dekho" onPress={() => jump('missions')} />
                  </>
                )}
              </View>
            </View>
          </NeonCard>
        </Reveal>

        {/* H + I. Referral and XP convert */}
        <Reveal index={9} onLayout={mark('xp')} style={[styles.pair, !wide && width < 360 && { flexDirection: 'column' }]}>
          <NeonCard style={half}>
            <View style={styles.titleRowAlt}>
              <Art name="referral" size={28} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleSm}>Referral Program</Text>
                <Text style={styles.cardSubSm}>Invite Friends & Earn</Text>
              </View>
            </View>
            {referrals.isLoading ? <ActivityIndicator color={RC.brand} /> : !ref?.program?.enabled ? (
              <StateNote text="Referral program abhi band hai." />
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={styles.codeLabel}>Your Code</Text>
                <Pressable onPress={() => void copyCode()} style={styles.codeBox} accessibilityRole="button" accessibilityLabel={`Copy referral code ${ref.code ?? ''}`}>
                  <Text style={styles.codeText} numberOfLines={1}>{ref.code ?? '—'}</Text>
                  <Ionicons name="copy-outline" size={16} color={RC.sub} />
                </Pressable>
                <View style={{ alignItems: 'center' }}>
                  {refUnit === 'dpcoin' ? <CoinAmount amount={Number(ref.program.referrerReward) || 0} /> : <DiamondAmount amount={Number(ref.program.referrerReward) || 0} />}
                  <Text style={styles.cardSubSm}>per friend</Text>
                </View>
                <View style={styles.refStats}>
                  <RefStat label="Joined" value={ref.stats?.successful ?? 0} />
                  <RefStat label="Pending" value={ref.stats?.pending ?? 0} />
                  <RefStat label="Earned" value={ref.stats?.earned ?? 0} unit={refUnit} />
                </View>
                <GoldButton small label="Invite Now" onPress={() => void invite()} />
                <Pressable onPress={() => router.push('/referral' as any)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Referral history" style={styles.refLink}>
                  <Text style={styles.refLinkText}>History</Text>
                  <ArrowIcon direction="right" size={12} color={RC.brand} />
                </Pressable>
              </View>
            )}
          </NeonCard>

          <View style={half}>
            <NeonCard style={{ flex: 1 }}>
              <View style={styles.titleRowAlt}>
                <Art name="xpConvert" size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitleSm}>XP Convert</Text>
                  <Text style={styles.cardSubSm}>Convert XP to Diamonds</Text>
                </View>
              </View>
              {!mon.earning.xpConversion.enabled ? <StateNote text="XP convert abhi band hai." /> : (
                <XpConvertBody status={xpConv.data} loading={xpConv.isLoading} onDone={(text) => { celebrate(text); void refetchMe(); void prog.refetch(); }} onFail={fail} />
              )}
            </NeonCard>
          </View>
        </Reveal>

        {/* J. Special events */}
        <Reveal index={10}>
        <NeonCard>
          <SectionTitle art="specialEvent" title="Special Events" sub="Limited Time Earning Events" action="View All" onAction={() => router.push('/earn/events' as any)} />
          {event ? (
            <PressScale onPress={() => router.push({ pathname: '/earn/events', params: { focus: event.id } } as any)} label={`${event.title}, ${event.phase}. Join now`}>
              <LinearGradient colors={PURPLE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.event}>
                <View style={styles.eventArt}>
                  <Art name="eventGiftBox" size={74} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.eventTop}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                    {event.phase === 'live' ? <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View> : null}
                  </View>
                  <Text style={styles.eventDesc} numberOfLines={2}>{event.description || 'Event tasks poore karo aur Diamond jeeto!'}</Text>
                  <View style={styles.eventMetaRow}>
                    <DiamondAmount amount={event.totalCoins} size={12} color="#FFFFFF" />
                    <Text style={styles.eventMeta}>· {event.phase === 'scheduled' ? `${countdown(event.startsAt)} me shuru` : `${countdown(event.endsAt)} left`}</Text>
                  </View>
                  <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <GoldButton small variant="onBrand" label={event.joined ? 'Open' : 'Join Now'} onPress={() => router.push({ pathname: '/earn/events', params: { focus: event.id } } as any)} />
                  </View>
                </View>
              </LinearGradient>
            </PressScale>
          ) : season ? (
            <PressScale onPress={() => router.push('/rewards/leaderboard' as any)} label={`${season.name}, live. Join now`}>
              <LinearGradient colors={PURPLE_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.event}>
                <View style={styles.eventArt}>
                  <Art name="eventGiftBox" size={74} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.eventTop}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{season.name}</Text>
                    <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
                  </View>
                  <Text style={styles.eventDesc} numberOfLines={2}>Season XP kamao, leaderboard par top aao aur season rewards jeeto.</Text>
                  <Text style={styles.eventMeta}>Aapke {formatXp(season.xp)} XP · {countdown(season.endsAt)} left</Text>
                  <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <GoldButton small variant="onBrand" label="Join Now" onPress={() => router.push('/rewards/leaderboard' as any)} />
                  </View>
                </View>
              </LinearGradient>
            </PressScale>
          ) : prog.isLoading || eventsQ.isLoading ? <SkeletonRows rows={1} height={60} /> : (
            <StateNote text="Abhi koi event live nahi hai. Naye events jaldi aayenge." />
          )}
        </NeonCard>
        </Reveal>

        {/* K. Achievements */}
        <Reveal index={11}>
        <NeonCard>
          <SectionTitle art="achievement" title="Achievements" sub="Complete milestones & unlock rewards" action="View All" onAction={() => router.push('/rewards/achievements' as any)} />
          {achievements.isLoading ? <SkeletonRows rows={1} height={60} /> : achievements.isError ? (
            <StateNote text="Achievements load nahi hue." action="Dobara try karo" onAction={() => achievements.refetch()} />
          ) : !achList.length ? <StateNote text="Abhi koi achievement nahi hai." /> : (
            <View style={styles.rewardGrid}>
              {achList.map((a, i) => (
                <AchievementTile key={a.id} a={a} art={ACH_ART[i % ACH_ART.length]} onPress={() => router.push('/rewards/achievements' as any)} />
              ))}
            </View>
          )}
        </NeonCard>
        </Reveal>

        {/* Recent rewards: the newest ledger rows (same data as Reward History). */}
        {signedIn ? (
          <Reveal index={12}>
            <NeonCard>
              <SectionTitle art="rewardHistory" title="Recent Rewards" sub="Aapki latest kamai" action="View All" onAction={() => router.push('/earn/history' as any)} />
              {recentQ.isLoading ? <SkeletonRows rows={RECENT_SHOWN} height={40} /> : recentQ.isError ? (
                <StateNote text="History load nahi hui." action="Dobara try karo" onAction={() => recentQ.refetch()} />
              ) : !recent.length ? (
                <StateNote text="Abhi koi reward nahi. Check-in aur missions se shuru karo." />
              ) : (
                <View style={{ gap: 10 }}>
                  {recent.map((item) => <RecentRow key={item.key} item={item} />)}
                </View>
              )}
            </NeonCard>
          </Reveal>
        ) : null}

        {/* L + M. Leaderboard and reward history */}
        <Reveal index={13} style={styles.pair}>
          <PressScale style={half} onPress={() => router.push('/rewards/leaderboard?board=diamonds' as any)} label="Leaderboard, top earners">
            <NeonCard style={styles.tileCard}>
              <Art name="topEarnerCrown" size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleSm}>Leaderboard</Text>
                <Text style={styles.cardSubSm}>Top Earners</Text>
              </View>
            </NeonCard>
          </PressScale>
          <PressScale style={half} onPress={() => router.push('/earn/history' as any)} label="Reward history, all your earnings">
            <NeonCard style={styles.tileCard}>
              <Art name="rewardHistory" size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleSm}>Reward History</Text>
                <Text style={styles.cardSubSm}>All Your Earnings</Text>
              </View>
            </NeonCard>
          </PressScale>
        </Reveal>
      </ScrollView>

      <BottomNav backgroundColor={RC.bg} isDark={RC.isDark} />

      <ClaimBurst playKey={burst} />

      <Modal visible={adSheet} transparent animationType="fade" onRequestClose={() => setAdSheet(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setAdSheet(false)}>
          <NeonCard style={styles.sheet}>
            <Art name="watchEarnIllustration" size={80} style={{ alignSelf: 'center' }} />
            <Text style={[styles.cardTitle, { textAlign: 'center' }]}>Video ads jaldi aa rahe hain</Text>
            <Text style={[styles.cardSub, { textAlign: 'center' }]}>Ad dekh kar Diamond kamane ka feature thodi der mein chalu hoga. Tab tak missions aur check-in se Diamond kamao.</Text>
            <GoldButton label="Missions dekho" onPress={() => { setAdSheet(false); jump('missions'); }} />
          </NeonCard>
        </Pressable>
      </Modal>
      <StreakMilestoneBanner streak={streakCelebration} onDone={() => setStreakCelebration(null)} />
    </SafeAreaView>
    </RewardsThemeContext.Provider>
  );
}

// ---------------------------------------------------------------- pieces

function ArrowGlyph() {
  const RC = useRC();
  return <ArrowIcon direction="right" size={16} color={RC.sub} />;
}

function DayCell({ slot, last, giftDay }: { slot: DailySlot; last: boolean; giftDay: boolean }) {
  const RC = useRC();
  const styles = useStyles();
  const claimed = slot.status === 'claimed';
  const ready = slot.status === 'ready';
  return (
    <View style={styles.day} accessible accessibilityLabel={`Day ${slot.day}, ${slot.amount} Diamonds, ${claimed ? 'claimed' : ready ? 'today' : 'locked'}`}>
      <View style={[styles.dayBox, ready && styles.dayReady, claimed && styles.dayClaimed]}>
        {claimed ? <Art name="dayCheck" size={36} /> : last ? <Art name="rewardChest" size={34} /> : giftDay ? <Art name="giftBox" size={32} /> : (
          <Art name={ready ? 'diamondGlow' : 'diamond'} size={ready ? 32 : 24} style={!ready && { opacity: 0.5 }} />
        )}
      </View>
      <Text style={[styles.dayLabel, ready && { color: RC.brand }]}>Day {slot.day}</Text>
      <Text style={styles.dayAmt}>+{slot.amount}</Text>
    </View>
  );
}

function MissionRow({ art, title, progress, target, reward, state, busy, onPress, big, hint }: {
  art: EarningArtKey; title: string; progress: number; target: number; reward: React.ReactNode; state: 'go' | 'claim' | 'done'; busy: boolean; onPress: () => void; big?: boolean; hint?: string;
}) {
  const styles = useStyles();
  const p = Math.min(progress, target);
  return (
    <View style={styles.mission}>
      <Art name={state === 'done' ? 'missionComplete' : art} size={big ? 46 : 36} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={styles.missionTitle} numberOfLines={1}>{title}</Text>
        <NeonBar value={target ? p / target : 0} />
        <Text style={styles.missionProg}>{p}/{target}{hint ? `  ·  ${hint}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        {reward}
        {state === 'done' ? <Text style={styles.claimedText}>Done</Text> : (
          <GoldButton
            small
            label={state === 'claim' ? 'Claim' : 'Go'}
            busy={busy}
            variant={state === 'claim' ? 'primary' : 'secondary'}
            onPress={onPress}
          />
        )}
      </View>
    </View>
  );
}

function RewardTile({ art, label, value, a11y, highlight, onPress }: { art: EarningArtKey; label: string; value: React.ReactNode; a11y: string; highlight?: boolean; onPress: () => void }) {
  const RC = useRC();
  const styles = useStyles();
  return (
    <PressScale onPress={onPress} style={[styles.rewardTile, highlight && { borderColor: RC.brand }]} label={`${label}: ${a11y}`}>
      <Art name={art} size={40} />
      <Text style={styles.rewardLabel} numberOfLines={1}>{label}</Text>
      {value}
    </PressScale>
  );
}

function AchievementTile({ a, art, onPress }: { a: AchievementView; art: EarningArtKey; onPress: () => void }) {
  const RC = useRC();
  const styles = useStyles();
  const ratio = a.target && a.progress != null ? Math.min(1, a.progress / a.target) : a.unlocked ? 1 : 0;
  return (
    <PressScale onPress={onPress} style={[styles.rewardTile, a.unlocked && { borderColor: RC.green }]} label={`${a.name}, ${a.unlocked ? 'unlocked' : 'locked'}`}>
      <View>
        <Art name={art} size={40} style={!a.unlocked && { opacity: 0.6 }} />
        {!a.unlocked ? <View style={styles.lock}><Ionicons name="lock-closed" size={10} color="#FFF" /></View> : null}
      </View>
      <Text style={styles.rewardLabel} numberOfLines={1}>{a.name}</Text>
      {a.unlocked ? <Text style={[styles.rewardValue, { color: RC.green }]}>Unlocked</Text> : (
        <>
          {(a.diamondReward ?? 0) > 0 ? <DiamondAmount amount={a.diamondReward ?? 0} size={12} /> : a.xpReward > 0 ? <XpAmount amount={a.xpReward} size={12} /> : null}
          <View style={{ width: '90%' }}><NeonBar value={ratio} height={5} /></View>
        </>
      )}
    </PressScale>
  );
}

/** One level of the Level Rewards rail: what the level pays and its claim state (server `rewardState`). */
function LevelTile({ entry, current, busy, canClaim, onClaim, onOpen }: {
  entry: RoadmapEntry; current: number; busy: boolean; canClaim: boolean; onClaim: () => void; onOpen: () => void;
}) {
  const RC = useRC();
  const styles = useStyles();
  const state = entry.rewardState;
  const claimable = state === 'claimable' && canClaim;
  const reached = current >= entry.level;
  const status = state === 'claimed' ? 'Claimed' : state === 'claimable' ? 'Ready' : reached ? 'Unlocked' : `${Math.max(0, entry.level - current)} level door`;
  const items = entry.items.length;
  return (
    <PressScale onPress={claimable ? onClaim : onOpen} disabled={busy} style={[styles.levelTile, claimable && { borderColor: RC.brand }, state === 'claimed' && { opacity: 0.7 }]} label={`Level ${entry.level}: ${entry.title}. ${status}`}>
      <Text style={[styles.levelTileLv, reached && { color: RC.brand }]}>Lv {entry.level}</Text>
      <View>
        <Art name={state === 'claimed' ? 'missionComplete' : entry.coins > 0 ? 'levelUp' : 'giftBox'} size={40} style={!reached && { opacity: 0.65 }} />
        {!reached ? <View style={styles.lock}><Ionicons name="lock-closed" size={10} color="#FFF" /></View> : null}
      </View>
      {entry.coins > 0 ? <DiamondAmount amount={entry.coins} size={12} /> : null}
      {items ? <Text style={styles.levelTileItems} numberOfLines={1}>{items === 1 ? entry.items[0].name : `${items} items`}</Text> : null}
      {claimable ? (
        <GoldButton small label="Claim" busy={busy} onPress={onClaim} />
      ) : (
        <Text style={[styles.levelTileState, state === 'claimed' && { color: RC.green }]} numberOfLines={1}>{status}</Text>
      )}
    </PressScale>
  );
}

function RefStat({ label, value, unit }: { label: string; value: number; unit?: 'diamond' | 'dpcoin' }) {
  const styles = useStyles();
  return (
    <View style={styles.refStat} accessible accessibilityLabel={`${label}: ${value}${unit === 'dpcoin' ? ' DP coin' : unit ? ' Diamonds' : ''}`}>
      {unit === 'dpcoin' ? <CoinAmount amount={value} size={12} prefix="" /> : unit ? <DiamondAmount amount={value} size={12} prefix="" /> : <Text style={styles.refStatValue}>{value.toLocaleString()}</Text>}
      <Text style={styles.refStatLabel}>{label}</Text>
    </View>
  );
}

function RecentRow({ item }: { item: RewardHistoryItem }) {
  const RC = useRC();
  const styles = useStyles();
  const title = historyTitle(item);
  const amounts = historyAmounts(item);
  const reversed = isReversedRow(item);
  const when = `${historyDay(item.createdAt)} · ${new Date(item.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  const unitName = { diamond: 'Diamonds', dpcoin: 'DP coin', xp: 'XP' } as const;
  return (
    <View style={styles.mission} accessible accessibilityLabel={`${title}, ${amounts.map((a) => `${signed(a.value)} ${unitName[a.unit]}`).join(', ')}, ${when}${reversed ? ', reversed' : ''}`}>
      <View style={styles.recentIcon}><Art name={historyArt(item)} size={26} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.missionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.missionProg} numberOfLines={1}>{reversed ? 'Reversed · ' : ''}{when}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {amounts.map((a) => {
          const neg = a.value < 0;
          const text = signed(a.value);
          if (a.unit === 'diamond') return <DiamondAmount key={a.unit} amount={Math.abs(a.value)} prefix={text[0]} size={13} color={neg ? RC.red : undefined} />;
          if (a.unit === 'dpcoin') return <CoinAmount key={a.unit} label={text} size={13} color={neg ? RC.red : undefined} />;
          return <XpAmount key={a.unit} label={`${text} XP`} size={12} />;
        })}
      </View>
    </View>
  );
}

function XpConvertBody({ status, loading, onDone, onFail }: { status: any; loading: boolean; onDone: (text: string) => void; onFail: (text: string) => void }) {
  const RC = useRC();
  const styles = useStyles();
  const convert = useConvertXp();
  const [n, setN] = useState(1);
  const requestId = useRef<string | null>(null);
  if (loading) return <ActivityIndicator color={RC.brand} />;
  if (!status) return <StateNote text="XP convert load nahi hua." />;
  const rate = Number(status.xpPerDiamond) || 0;
  const max = Number(status.availableDiamonds) || 0;
  const qty = Math.min(Math.max(1, n), Math.max(1, max));
  const capped = status.diamondsToday >= status.maxDiamondsPerDay;
  const run = () => {
    if (!requestId.current) requestId.current = newRequestId();
    convert.mutate(
      { diamonds: qty, requestId: requestId.current },
      {
        onSuccess: (r) => { requestId.current = null; setN(1); onDone(`${formatXp(r.xpSpent)} XP → ${r.diamonds} Diamond`); },
        onError: (e: any) => { if (e?.status) requestId.current = null; onFail(errorText(e, 'Convert nahi hua. Dobara try karo.')); },
      },
    );
  };
  const confirm = () =>
    Alert.alert('XP convert karein?', `${formatXp(qty * rate)} XP se ${qty} Diamond milenge. Aapka level aur XP kam nahi hoga.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Convert', onPress: run },
    ]);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.rateRow} accessible accessibilityLabel={`Rate: ${rate} XP = 1 Diamond`}>
        <Text style={styles.rate}>Rate: {formatXp(rate)} XP =</Text>
        <DiamondAmount amount={1} prefix="" size={12} />
      </View>
      <View style={styles.convertRow}>
        <View style={styles.stepper}>
          <Pressable style={styles.step} onPress={() => { setN(Math.max(1, qty - 1)); requestId.current = null; }} disabled={max <= 1} accessibilityRole="button" accessibilityLabel="Kam karo"><Text style={styles.stepText}>−</Text></Pressable>
          <Text style={styles.stepValue} numberOfLines={1}>{formatXp(qty * rate)} XP</Text>
          <Pressable style={styles.step} onPress={() => { setN(Math.min(max, qty + 1)); requestId.current = null; }} disabled={qty >= max} accessibilityRole="button" accessibilityLabel="Zyada karo"><Text style={styles.stepText}>+</Text></Pressable>
        </View>
      </View>
      <View style={{ alignItems: 'center' }}><DiamondAmount amount={max > 0 ? qty : 0} size={16} color={RC.text} prefix="" /></View>
      {max > 0 ? <GoldButton small label="Convert Now" busy={convert.isPending} onPress={confirm} /> : (
        <Text style={styles.cardSubSm}>{capped ? 'Aaj ki limit poori. Kal phir aao.' : `Kam se kam ${formatXp(rate)} XP chahiye. Aapke paas ${formatXp(Number(status.convertibleXp) || 0)} XP.`}</Text>
      )}
    </View>
  );
}

function makeStyles(RC: RewardsPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: RC.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
    brand: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 20 },
    bell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: RC.tint },
    bellBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: RC.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    bellBadgeText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 10 },
    hero: { alignItems: 'center', gap: 2 },
    heroTitle: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 28 },
    heroSub: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 13 },
    balances: { flexDirection: 'row', alignItems: 'stretch', padding: 0 },
    balanceHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 92 },
    balanceDivider: { width: 1, backgroundColor: RC.borderSoft, marginVertical: 12 },
    balanceLabel: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
    balanceValue: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 26 },
    xpValue: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 16 },
    xpOf: { color: RC.muted, fontFamily: 'Urbanist-Bold', fontSize: 12 },
    xpNext: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 10.5 },
    levelBadge: { width: 50, alignItems: 'center', justifyContent: 'center' },
    levelNum: { position: 'absolute', top: 18, color: '#3B1A00', fontFamily: 'Urbanist-Bold', fontSize: 14 },
    levelUp: { color: RC.brand, fontFamily: 'Urbanist-Bold', fontSize: 8, letterSpacing: 0.6 },
    shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
    shortcut: { width: 64, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 16, borderWidth: 1, borderColor: RC.borderSoft, backgroundColor: RC.card, paddingHorizontal: 2, flexGrow: 1 },
    shortcutText: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 10.5 },
    titleRowAlt: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    cardTitle: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 18 },
    cardSub: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 12 },
    cardTitleSm: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 15 },
    cardSubSm: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 11, textAlign: 'center' },
    streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: RC.brandSoft, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    streakPillText: { color: RC.brand, fontFamily: 'Urbanist-Bold', fontSize: 12.5 },
    days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginBottom: 12 },
    day: { flex: 1, alignItems: 'center', gap: 3 },
    dayBox: { width: '100%', aspectRatio: 1, maxWidth: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: RC.tint, borderWidth: 1, borderColor: RC.borderSoft },
    dayReady: { borderColor: RC.brand, borderWidth: 2, backgroundColor: RC.brandSoft },
    dayClaimed: { borderColor: 'transparent', backgroundColor: 'transparent' },
    dayLabel: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 10.5 },
    dayAmt: { color: RC.sub, fontFamily: 'Urbanist-Bold', fontSize: 10.5 },
    weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    nextReward: { alignItems: 'flex-end', gap: 1 },
    nextLabel: { color: RC.muted, fontFamily: 'Urbanist-SemiBold', fontSize: 10.5 },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 10, borderRadius: 16, backgroundColor: RC.tint },
    doneText: { color: RC.green, fontFamily: 'Urbanist-Bold', fontSize: 13 },
    mission: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    missionTitle: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 14 },
    missionProg: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 11 },
    claimedText: { color: RC.green, fontFamily: 'Urbanist-Bold', fontSize: 12 },
    rewardGrid: { flexDirection: 'row', gap: 8 },
    rewardTile: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 16, borderWidth: 1, borderColor: RC.borderSoft, backgroundColor: RC.tint },
    rewardLabel: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 11 },
    rewardValue: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 12 },
    levelTile: { width: 104, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 16, borderWidth: 1, borderColor: RC.borderSoft, backgroundColor: RC.tint, minHeight: 150 },
    levelTileLv: { color: RC.sub, fontFamily: 'Urbanist-Bold', fontSize: 13 },
    levelTileItems: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 11, maxWidth: '100%' },
    levelTileState: { color: RC.muted, fontFamily: 'Urbanist-Bold', fontSize: 11, marginTop: 'auto' },
    footnote: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 11, marginTop: 10, textAlign: 'center' },
    limitPill: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: RC.brandSoft },
    limitText: { color: RC.brand, fontFamily: 'Urbanist-Bold', fontSize: 11 },
    watchBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    watchEarnUpTo: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
    pair: { flexDirection: 'row', gap: 10 },
    codeLabel: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 11 },
    codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderWidth: 1, borderColor: RC.borderSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minHeight: 40, backgroundColor: RC.inset },
    codeText: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 14, letterSpacing: 0.8, flexShrink: 1 },
    refStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, paddingVertical: 6, borderRadius: 12, backgroundColor: RC.inset },
    refStat: { flex: 1, alignItems: 'center', gap: 1 },
    refStatValue: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 13 },
    refStatLabel: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 10 },
    refLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 28 },
    refLinkText: { color: RC.brand, fontFamily: 'Urbanist-Bold', fontSize: 12 },
    rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    rate: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 11.5, textAlign: 'center' },
    convertRow: { flexDirection: 'row', justifyContent: 'center' },
    stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: RC.borderSoft, borderRadius: 12, backgroundColor: RC.inset, alignSelf: 'stretch', flex: 1 },
    step: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
    stepText: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 18 },
    stepValue: { flex: 1, textAlign: 'center', color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 13 },
    event: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12 },
    eventArt: { width: 80, alignItems: 'center' },
    eventTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    // White on the brand gradient in both themes.
    eventTitle: { color: '#FFFFFF', fontFamily: 'Urbanist-Bold', fontSize: 17, flexShrink: 1 },
    eventDesc: { color: 'rgba(255,255,255,0.88)', fontFamily: 'Urbanist-Medium', fontSize: 12 },
    eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    eventMeta: { color: '#FFFFFF', fontFamily: 'Urbanist-Bold', fontSize: 11.5 },
    live: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
    liveText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 10 },
    lock: { position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: RC.isDark ? '#2A2D38' : '#7A7A80', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: RC.borderSoft },
    tileCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    recentIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: RC.tint },
    sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sheet: { width: '100%', maxWidth: 380, gap: 12, padding: 20 },
  });
}
