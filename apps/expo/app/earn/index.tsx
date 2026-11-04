/**
 * Rewards Center: every way to earn, on one scrolling page, in the order of
 * the design reference (Part 1/2 then Part 2/2):
 *
 *   A Header (Diamonds, XP, level)   B Shortcuts        C Daily streak
 *   D Today's missions               E Weekly missions  F Contest rewards
 *   G Watch & Earn                   H Referral + I XP convert
 *   J Special events                 K Achievements     L Leaderboard + M History
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
import { useAchievements, useClaimQuest, useClaimRewardGrant, useProgression, useQuests, type AchievementView, type QuestView } from '@/src/services/gamification';
import { useMyReferrals } from '@/src/services/referrals';
import { featuredEvent, useEvents } from '@/src/services/events';
import { notificationService } from '@/src/services/notifications/notificationService';
import { appShareOrigin, isCompletedShare, shareBattleLink } from '@/src/lib/share';
import { referralCaption } from '@/src/lib/shareCaptions';
import { MISSION_ART, type EarningArtKey } from '@/assets/earning';
import { countdown, errorText, missionRoute, pickAchievements, streakDays } from '@/src/lib/rewardsCenter';
import { Art, ClaimBurst, DiamondAmount, GoldButton, NeonBar, NeonCard, PressScale, RC, SectionTitle, StateNote, XpAmount } from '@/src/components/rewardsCenter/RewardsBits';

type DailySlot = { day: number; amount: number; status: 'claimed' | 'ready' | 'upcoming' };
type Task = { id: string; title: string; reward: number; xp: number; target: number; type: string; progress: number; claimed: boolean; claimable: boolean; endsAt: number | null };
type SectionKey = 'checkin' | 'missions' | 'weekly' | 'watch' | 'xp';

const PAD = 16;
const GAP = 14;
const MISSIONS_SHOWN = 4;

const ACH_ART: EarningArtKey[] = ['socialStar', 'votingPro', 'contestKing', 'levelUp'];

export default function RewardsCenterScreen() {
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
    if (mon.earning.xpConversion.enabled) void xpConv.refetch();
  }, [refetchMe, prog, daily, tasksQ, quests, achievements, referrals, eventsQ, xpConv, mon.earning.xpConversion.enabled]);

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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <LinearGradient colors={[RC.bg2, RC.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ width: contentW, alignSelf: 'center', paddingHorizontal: PAD, paddingBottom: 48, gap: GAP }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refreshAll} tintColor={RC.gold} />}
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
            <Ionicons name="notifications" size={22} color={RC.gold} />
            {unread > 0 ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
          </Pressable>
        </View>
        <View style={styles.hero}>
          <Art name="rewardsCrown" size={58} />
          <Text style={styles.heroTitle} accessibilityRole="header">Rewards Center</Text>
          <Text style={styles.heroSub}>Play • Complete Tasks • Earn Rewards</Text>
        </View>

        {!signedIn ? (
          <NeonCard>
            <StateNote text="Rewards kamane ke liye sign in karo. Check-in, missions, ads aur referral se Diamond milte hain." action="Sign in" onAction={() => requireAuth('wallet')} />
          </NeonCard>
        ) : null}

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
                  <NeonBar value={level.progress} color="#A855F7" height={6} />
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
        <View style={styles.shortcuts}>
          {shortcuts.map((s) => (
            <PressScale key={s.key} onPress={s.onPress} style={styles.shortcut} label={s.label}>
              <Art name={s.art} size={38} />
              <Text style={styles.shortcutText} numberOfLines={1}>{s.label}</Text>
            </PressScale>
          ))}
        </View>

        {/* C. Daily streak */}
        <View onLayout={mark('checkin')}>
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
            {daily.isLoading ? <ActivityIndicator color={RC.gold} style={{ marginVertical: 18 }} /> : daily.isError ? (
              <StateNote text="Streak load nahi hua." action="Dobara try karo" onAction={() => daily.refetch()} />
            ) : !checkinOn ? (
              <StateNote text={signedIn ? 'Daily check-in abhi band hai.' : 'Sign in karke streak shuru karo.'} />
            ) : (
              <>
                <View style={styles.days}>
                  {streakDays(track).map((s, i, all) => (
                    <DayCell key={s.day} slot={s} last={i === all.length - 1} giftDay={i === all.length - 2} />
                  ))}
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
        </View>

        {/* D. Today's missions */}
        <View onLayout={mark('missions')}>
          <NeonCard>
            <SectionTitle
              art="dailyMission"
              title="Today's Missions"
              sub="Complete tasks and earn Diamonds"
              action={tasks.length > MISSIONS_SHOWN ? (showAllMissions ? 'Show less' : 'View All') : undefined}
              onAction={() => setShowAllMissions((v) => !v)}
            />
            {tasksQ.isLoading ? <ActivityIndicator color={RC.gold} style={{ marginVertical: 18 }} /> : tasksQ.isError ? (
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
        </View>

        {/* E. Weekly missions */}
        <View onLayout={mark('weekly')}>
          <NeonCard>
            <SectionTitle art="weeklyMission" title="Weekly Missions" sub="Complete big goals & win extra rewards" action="View All" onAction={() => router.push('/rewards' as any)} />
            {quests.isLoading ? <ActivityIndicator color={RC.gold} style={{ marginVertical: 18 }} /> : quests.isError ? (
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
        </View>

        {/* F. Contest rewards */}
        <NeonCard>
          <SectionTitle art="contest" title="Contest Rewards" sub="Participate, Win & Earn More" action="View All" onAction={() => router.push('/explore/battles' as any)} />
          <View style={styles.rewardGrid}>
            <RewardTile art="participation" label="Participation" value={contestCfg.enabled && contestCfg.participation > 0 ? `+${contestCfg.participation.toLocaleString()} 💎` : 'XP'} onPress={() => router.push('/explore/battles' as any)} />
            <RewardTile art="winnerCrown" label="Winner" value="DP coin" gold onPress={() => router.push('/explore/battles' as any)} />
            <RewardTile art="runnerUp" label="Runners-up" value={contestCfg.enabled && contestCfg.runnerUp > 0 ? `+${contestCfg.runnerUp.toLocaleString()} 💎` : 'XP'} onPress={() => router.push('/explore/battles' as any)} />
            <RewardTile art="specialPrize" label="Special" value="Hall of Fame" onPress={() => router.push('/rewards/hall-of-fame' as any)} />
          </View>
          <Text style={styles.footnote}>
            {contestCfg.enabled && (contestCfg.participation > 0 || contestCfg.runnerUp > 0)
              ? `Battle poori hone par Diamond "Rewards to Claim" me aate hain${contestCfg.paidOnly ? ' (entry fee wali battles)' : ''}. Jeetne par DP coin (Shop ke liye).`
              : 'Jeetne par DP coin (Shop ke liye). Har battle XP deta hai.'}
          </Text>
        </NeonCard>

        {/* G. Watch & Earn */}
        <View onLayout={mark('watch')}>
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
        </View>

        {/* H + I. Referral and XP convert */}
        <View onLayout={mark('xp')} style={[styles.pair, !wide && width < 360 && { flexDirection: 'column' }]}>
          <NeonCard style={half}>
            <View style={styles.titleRowAlt}>
              <Art name="referral" size={28} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitleSm}>Referral Program</Text>
                <Text style={styles.cardSubSm}>Invite Friends & Earn</Text>
              </View>
            </View>
            {referrals.isLoading ? <ActivityIndicator color={RC.gold} /> : !ref?.program?.enabled ? (
              <StateNote text="Referral program abhi band hai." />
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={styles.codeLabel}>Your Code</Text>
                <Pressable onPress={() => void copyCode()} style={styles.codeBox} accessibilityRole="button" accessibilityLabel={`Copy referral code ${ref.code ?? ''}`}>
                  <Text style={styles.codeText} numberOfLines={1}>{ref.code ?? '—'}</Text>
                  <Ionicons name="copy-outline" size={16} color={RC.sub} />
                </Pressable>
                <View style={{ alignItems: 'center' }}>
                  <DiamondAmount amount={Number(ref.program.referrerReward) || 0} />
                  <Text style={styles.cardSubSm}>per friend</Text>
                </View>
                <GoldButton small label="Invite Now" onPress={() => void invite()} />
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
        </View>

        {/* J. Special events */}
        <NeonCard>
          <SectionTitle art="specialEvent" title="Special Events" sub="Limited Time Earning Events" action="View All" onAction={() => router.push('/earn/events' as any)} />
          {event ? (
            <PressScale onPress={() => router.push({ pathname: '/earn/events', params: { focus: event.id } } as any)} label={`${event.title}, ${event.phase}. Join now`}>
              <LinearGradient colors={['#7C3AED', '#C026D3', '#DB2777']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.event}>
                <View style={styles.eventArt}>
                  <Art name="eventGiftBox" size={74} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.eventTop}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                    {event.phase === 'live' ? <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View> : null}
                  </View>
                  <Text style={styles.eventDesc} numberOfLines={2}>{event.description || 'Event tasks poore karo aur Diamond jeeto!'}</Text>
                  <Text style={styles.eventMeta}>
                    +{event.totalCoins.toLocaleString()} 💎 · {event.phase === 'scheduled' ? `${countdown(event.startsAt)} me shuru` : `${countdown(event.endsAt)} left`}
                  </Text>
                  <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                    <GoldButton small label={event.joined ? 'Open' : 'Join Now'} onPress={() => router.push({ pathname: '/earn/events', params: { focus: event.id } } as any)} />
                  </View>
                </View>
              </LinearGradient>
            </PressScale>
          ) : season ? (
            <PressScale onPress={() => router.push('/rewards/leaderboard' as any)} label={`${season.name}, live. Join now`}>
              <LinearGradient colors={['#7C3AED', '#C026D3', '#DB2777']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.event}>
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
                    <GoldButton small label="Join Now" onPress={() => router.push('/rewards/leaderboard' as any)} />
                  </View>
                </View>
              </LinearGradient>
            </PressScale>
          ) : prog.isLoading || eventsQ.isLoading ? <ActivityIndicator color={RC.gold} /> : (
            <StateNote text="Abhi koi event live nahi hai. Naye events jaldi aayenge." />
          )}
        </NeonCard>

        {/* K. Achievements */}
        <NeonCard>
          <SectionTitle art="achievement" title="Achievements" sub="Complete milestones & unlock rewards" action="View All" onAction={() => router.push('/rewards/achievements' as any)} />
          {achievements.isLoading ? <ActivityIndicator color={RC.gold} /> : achievements.isError ? (
            <StateNote text="Achievements load nahi hue." action="Dobara try karo" onAction={() => achievements.refetch()} />
          ) : !achList.length ? <StateNote text="Abhi koi achievement nahi hai." /> : (
            <View style={styles.rewardGrid}>
              {achList.map((a, i) => (
                <AchievementTile key={a.id} a={a} art={ACH_ART[i % ACH_ART.length]} onPress={() => router.push('/rewards/achievements' as any)} />
              ))}
            </View>
          )}
        </NeonCard>

        {/* L + M. Leaderboard and reward history */}
        <View style={styles.pair}>
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
        </View>
      </ScrollView>

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
  );
}

// ---------------------------------------------------------------- pieces

function ArrowGlyph() {
  return <ArrowIcon direction="right" size={16} color={RC.sub} />;
}

function DayCell({ slot, last, giftDay }: { slot: DailySlot; last: boolean; giftDay: boolean }) {
  const claimed = slot.status === 'claimed';
  const ready = slot.status === 'ready';
  return (
    <View style={styles.day} accessible accessibilityLabel={`Day ${slot.day}, ${slot.amount} Diamonds, ${claimed ? 'claimed' : ready ? 'today' : 'locked'}`}>
      <View style={[styles.dayBox, ready && styles.dayReady, claimed && styles.dayClaimed]}>
        {claimed ? <Art name="dayCheck" size={36} /> : last ? <Art name="rewardChest" size={34} /> : giftDay ? <Art name="giftBox" size={32} /> : (
          <Art name={ready ? 'diamondGlow' : 'diamond'} size={ready ? 32 : 24} style={!ready && { opacity: 0.5 }} />
        )}
      </View>
      <Text style={[styles.dayLabel, ready && { color: RC.gold }]}>Day {slot.day}</Text>
      <Text style={styles.dayAmt}>+{slot.amount}</Text>
    </View>
  );
}

function MissionRow({ art, title, progress, target, reward, state, busy, onPress, big, hint }: {
  art: EarningArtKey; title: string; progress: number; target: number; reward: React.ReactNode; state: 'go' | 'claim' | 'done'; busy: boolean; onPress: () => void; big?: boolean; hint?: string;
}) {
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
            grad={state === 'claim' ? ['#FFE680', '#F5B300'] : ['#A855F7', '#6D28D9']}
            textColor={state === 'claim' ? '#3B1A00' : '#FFFFFF'}
            onPress={onPress}
          />
        )}
      </View>
    </View>
  );
}

function RewardTile({ art, label, value, gold, onPress }: { art: EarningArtKey; label: string; value: string; gold?: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={[styles.rewardTile, gold && { borderColor: RC.gold }]} label={`${label}: ${value}`}>
      <Art name={art} size={40} />
      <Text style={styles.rewardLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.rewardValue, gold && { color: RC.gold }]} numberOfLines={1}>{value}</Text>
    </PressScale>
  );
}

function AchievementTile({ a, art, onPress }: { a: AchievementView; art: EarningArtKey; onPress: () => void }) {
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
          {(a.diamondReward ?? 0) > 0 ? <Text style={styles.rewardValue}>+{a.diamondReward} 💎</Text> : a.xpReward > 0 ? <Text style={styles.rewardValue}>+{a.xpReward} XP</Text> : null}
          <View style={{ width: '90%' }}><NeonBar value={ratio} height={5} /></View>
        </>
      )}
    </PressScale>
  );
}

function XpConvertBody({ status, loading, onDone, onFail }: { status: any; loading: boolean; onDone: (text: string) => void; onFail: (text: string) => void }) {
  const convert = useConvertXp();
  const [n, setN] = useState(1);
  const requestId = useRef<string | null>(null);
  if (loading) return <ActivityIndicator color={RC.gold} />;
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
      <Text style={styles.rate}>Rate: {formatXp(rate)} XP = 1 💎</Text>
      <View style={styles.convertRow}>
        <View style={styles.stepper}>
          <Pressable style={styles.step} onPress={() => { setN(Math.max(1, qty - 1)); requestId.current = null; }} disabled={max <= 1} accessibilityLabel="Kam karo"><Text style={styles.stepText}>−</Text></Pressable>
          <Text style={styles.stepValue} numberOfLines={1}>{formatXp(qty * rate)} XP</Text>
          <Pressable style={styles.step} onPress={() => { setN(Math.min(max, qty + 1)); requestId.current = null; }} disabled={qty >= max} accessibilityLabel="Zyada karo"><Text style={styles.stepText}>+</Text></Pressable>
        </View>
      </View>
      <View style={{ alignItems: 'center' }}><DiamondAmount amount={max > 0 ? qty : 0} size={16} color={RC.text} prefix="" /></View>
      {max > 0 ? <GoldButton small label="Convert Now" busy={convert.isPending} onPress={confirm} /> : (
        <Text style={styles.cardSubSm}>{capped ? 'Aaj ki limit poori. Kal phir aao.' : `Kam se kam ${formatXp(rate)} XP chahiye. Aapke paas ${formatXp(Number(status.convertibleXp) || 0)} XP.`}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RC.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  brand: { color: RC.text, fontFamily: 'Urbanist-Black', fontSize: 20 },
  bell: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.25)', borderWidth: 1, borderColor: RC.borderSoft },
  bellBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: RC.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 10 },
  hero: { alignItems: 'center', gap: 2 },
  heroTitle: { color: RC.gold, fontFamily: 'Urbanist-Black', fontSize: 30, fontStyle: 'italic', textShadowColor: RC.magenta, textShadowRadius: 12 },
  heroSub: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 13 },
  balances: { flexDirection: 'row', alignItems: 'stretch', padding: 0 },
  balanceHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 92 },
  balanceDivider: { width: 1, backgroundColor: RC.borderSoft, marginVertical: 12 },
  balanceLabel: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
  balanceValue: { color: RC.text, fontFamily: 'Urbanist-Black', fontSize: 26 },
  xpValue: { color: RC.text, fontFamily: 'Urbanist-Black', fontSize: 16 },
  xpOf: { color: RC.muted, fontFamily: 'Urbanist-Bold', fontSize: 12 },
  xpNext: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 10.5 },
  levelBadge: { width: 50, alignItems: 'center', justifyContent: 'center' },
  levelNum: { position: 'absolute', top: 18, color: '#3B1A00', fontFamily: 'Urbanist-Black', fontSize: 14 },
  levelUp: { color: RC.gold, fontFamily: 'Urbanist-Black', fontSize: 8, letterSpacing: 0.6 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  shortcut: { width: 64, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 16, borderWidth: 1, borderColor: RC.borderSoft, backgroundColor: RC.card, paddingHorizontal: 2, flexGrow: 1 },
  shortcutText: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 10.5 },
  titleRowAlt: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitle: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 18 },
  cardSub: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 12 },
  cardTitleSm: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 15 },
  cardSubSm: { color: RC.sub, fontFamily: 'Urbanist-Medium', fontSize: 11, textAlign: 'center' },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.18)', borderWidth: 1, borderColor: RC.goldDeep, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  streakPillText: { color: RC.gold, fontFamily: 'Urbanist-Bold', fontSize: 12.5 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginBottom: 14 },
  day: { flex: 1, alignItems: 'center', gap: 3 },
  dayBox: { width: '100%', aspectRatio: 1, maxWidth: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.18)', borderWidth: 1, borderColor: RC.borderSoft },
  dayReady: { borderColor: RC.gold, borderWidth: 2, backgroundColor: 'rgba(255,213,74,0.16)', shadowColor: RC.gold, shadowOpacity: 0.7, shadowRadius: 10, elevation: 6 },
  dayClaimed: { borderColor: 'transparent', backgroundColor: 'transparent' },
  dayLabel: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 10.5 },
  dayAmt: { color: RC.cyan, fontFamily: 'Urbanist-Bold', fontSize: 10.5 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 10, borderRadius: 16, backgroundColor: 'rgba(52,211,153,0.12)' },
  doneText: { color: RC.green, fontFamily: 'Urbanist-Bold', fontSize: 13 },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  missionTitle: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 14 },
  missionProg: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 11 },
  claimedText: { color: RC.green, fontFamily: 'Urbanist-Bold', fontSize: 12 },
  rewardGrid: { flexDirection: 'row', gap: 8 },
  rewardTile: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 16, borderWidth: 1, borderColor: RC.borderSoft, backgroundColor: 'rgba(124,58,237,0.16)' },
  rewardLabel: { color: RC.text, fontFamily: 'Urbanist-SemiBold', fontSize: 11 },
  rewardValue: { color: RC.cyan, fontFamily: 'Urbanist-Black', fontSize: 12 },
  footnote: { color: RC.muted, fontFamily: 'Urbanist-Medium', fontSize: 11, marginTop: 10, textAlign: 'center' },
  limitPill: { borderRadius: 12, borderWidth: 1, borderColor: RC.gold, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: 'rgba(255,213,74,0.12)' },
  limitText: { color: RC.gold, fontFamily: 'Urbanist-Bold', fontSize: 11 },
  watchBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  watchEarnUpTo: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 12 },
  pair: { flexDirection: 'row', gap: 10 },
  codeLabel: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 11 },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderWidth: 1, borderColor: RC.borderSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.25)' },
  codeText: { color: RC.text, fontFamily: 'Urbanist-Black', fontSize: 14, letterSpacing: 0.8, flexShrink: 1 },
  rate: { color: RC.sub, fontFamily: 'Urbanist-SemiBold', fontSize: 11.5, textAlign: 'center' },
  convertRow: { flexDirection: 'row', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: RC.borderSoft, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', alignSelf: 'stretch', flex: 1 },
  step: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 18 },
  stepValue: { flex: 1, textAlign: 'center', color: RC.text, fontFamily: 'Urbanist-Bold', fontSize: 13 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: '#F0ABFC' },
  eventArt: { width: 80, alignItems: 'center' },
  eventTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTitle: { color: RC.gold, fontFamily: 'Urbanist-Black', fontSize: 17, flexShrink: 1, fontStyle: 'italic' },
  eventDesc: { color: '#FCE7F3', fontFamily: 'Urbanist-Medium', fontSize: 12 },
  eventMeta: { color: '#FFFFFF', fontFamily: 'Urbanist-Bold', fontSize: 11.5 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 10 },
  lock: { position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#4C1D95', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: RC.borderSoft },
  tileCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, gap: 12, padding: 20 },
});

