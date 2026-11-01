import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { BackButton } from '@/src/components/ui/BackButton';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Ionicons } from '@/src/lib/icons';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { emitToast } from '@/src/lib/toastBridge';
import { BRAND, BRAND_GRAD, GOLD, PAD, useExplorePalette, type ExplorePalette } from '@/src/components/explore/theme';
import { ScaleTouchable } from '@/src/components/explore/ScaleTouchable';
import { StreakMilestoneBanner } from '@/src/components/gamification/MotionBits';
import { useAuth } from '@/src/hooks/useAuth';
import { useProfile } from '@/src/hooks/useProfileData';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useDesignWindow } from '@/src/lib/layout';
import { useAppConfig } from '@/src/services/appSettings';
import { walletService } from '@/src/services/wallet/walletService';
import { useRewardedAd } from '@/src/ads/fullscreen';
import { newRequestId, useMonetizationConfig } from '@/src/services/monetization';
import { useConvertXp, useXpConversion } from '@/src/services/shop';

/**
 * Earning: every free way to get 💎 Diamonds, in one place. Diamonds pay
 * contest entry fees; winning a contest gives 🪙 DP coin for Shopping.
 * Diamonds can't be bought and can't be turned into DP coin.
 *
 * Everything here is claimed in place: the check-in, the daily tasks and the
 * rewarded ad. Amounts, progress and the ad counter all come from the server
 * (`getDailyReward`, `getDailyTasks`), so the app never promises a reward the
 * server would not pay.
 */

const AD_GRAD: [string, string, string] = ['#1A1033', '#3B1D6E', '#14102A'];
const TASK_STYLE: Record<string, { icon: string; grad: [string, string]; go: string }> = {
  vote: { icon: 'stats-chart', grad: ['#FF4D67', '#FF8A4D'], go: 'Vote' },
  share: { icon: 'share-social', grad: ['#3B82F6', '#8B5CF6'], go: 'Share' },
  contest: { icon: 'trophy', grad: ['#F59E0B', '#FF4D67'], go: 'Join' },
  like: { icon: 'heart', grad: ['#EC4899', '#FF4D67'], go: 'Like' },
  comment: { icon: 'chatbubble-outline', grad: ['#10B981', '#3B82F6'], go: 'Comment' },
  follow: { icon: 'people', grad: ['#8B5CF6', '#EC4899'], go: 'Follow' },
  ads: { icon: 'play', grad: ['#8B5CF6', '#3B82F6'], go: 'Watch' },
};

// Server error copy (same rules as the wallet screen).
const freeRewardsOut = (e: any) => typeof e?.message === 'string' && e.message.toLowerCase().includes('free rewards khatam');
const dailyFreeLimit = (e: any): string | null => (e?.reason === 'daily_free_limit' && typeof e?.message === 'string' ? e.message : null);
const errorText = (e: any, fallback: string) =>
  dailyFreeLimit(e) ?? (freeRewardsOut(e) ? 'Aaj ke free rewards khatam ho gaye hain. Thodi der baad try karo.' : e?.message || fallback);

const IS_WEB = Platform.OS === 'web';

type DailySlot = { day: number; amount: number; status: 'claimed' | 'ready' | 'upcoming' };
type Task = { id: string; title: string; reward: number; xp: number; target: number; type: string; progress: number; claimed: boolean; claimable: boolean; endsAt: number | null };

const hoursLeft = (resetsAt?: number) => {
  if (!resetsAt) return null;
  const mins = Math.max(0, Math.floor((resetsAt - Date.now()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
};

export default function EarnScreen() {
  const p = useExplorePalette();
  const router = useRouter();
  const { user } = useAuth();
  const { config } = useAppConfig();
  const mon = useMonetizationConfig();
  const { width } = useDesignWindow();
  const contentW = Math.min(width, 640);
  const { data: me, refetch: refetchMe, isRefetching } = useProfile(user?.uid || '');
  // Same query keys as the wallet screen, so the two share one cached answer.
  const daily = useQuery({ queryKey: ['daily-reward', user?.uid], queryFn: () => walletService.getDailyReward(), enabled: !!user?.uid });
  const tasksQ = useQuery({ queryKey: ['daily-tasks', user?.uid], queryFn: () => walletService.getDailyTasks(), enabled: !!user?.uid });
  const xp = useXpConversion(!!user && mon.earning.xpConversion.enabled);
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  const [busy, setBusy] = useState<string | null>(null);
  const [adSheet, setAdSheet] = useState(false);
  const [streakCelebration, setStreakCelebration] = useState<number | null>(null);

  const d: any = daily.data ?? {};
  const track: DailySlot[] = d.track ?? [];
  const checkinOn = d.enabled !== false && track.length > 0;
  const checkinReady = checkinOn && d.claimedToday !== true;

  const tr: any = tasksQ.data ?? {};
  // Rewarded ads through the ad platform's "earn_rewarded" slot (src/ads/fullscreen.ts):
  // AdMob with SSV in the apps, Ad Manager + watch token on the web. Amounts,
  // caps and today's counter come from the server.
  const rewarded = useRewardedAd('earn_rewarded', () => {
    void refetchMe();
    void tasksQ.refetch();
  });
  const adInfo = { enabled: rewarded.enabled, reward: rewarded.reward, cap: rewarded.cap, watched: rewarded.watched };
  const adsLeft = rewarded.left;
  const allTasks: Task[] = useMemo(() => tr.tasks ?? [], [tr.tasks]);
  // The legacy single "ad" row is paid by the ad itself; the ad card covers it.
  // "ads" bonus tasks only make sense while rewarded ads are on.
  const tasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.type !== 'ad' && (t.type !== 'ads' || adInfo.enabled))
        .sort((a, b) => Number(b.claimable) - Number(a.claimable) || Number(a.claimed) - Number(b.claimed)),
    [allTasks, adInfo.enabled],
  );
  const adBonus = tasks.filter((t) => t.type === 'ads');
  const listTasks = tasks.filter((t) => t.type !== 'ads');
  const doneCount = tasks.filter((t) => t.claimed).length;
  const readyCount = tasks.filter((t) => t.claimable).length + (checkinReady ? 1 : 0);
  // What is still on the table today (server amounts only).
  const leftToday =
    tasks.filter((t) => !t.claimed).reduce((s, t) => s + (Number(t.reward) || 0), 0) +
    (checkinReady ? Number(d.todayReward) || 0 : 0) +
    (adInfo.enabled ? adsLeft * adInfo.reward : 0);
  const referral = (config as any)?.referral;


  const refreshAll = () => {
    void refetchMe();
    void daily.refetch();
    void tasksQ.refetch();
    void xp.refetch();
  };

  const success = (text: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    emitToast(text, 'success');
  };
  const fail = (text: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    emitToast(text, 'error');
  };

  const claimCheckin = async () => {
    if (!checkinReady || busy) return;
    setBusy('checkin');
    try {
      const r: any = await walletService.claimDailyBonus();
      setStreakCelebration(Number(r?.streak) || null);
      success(`+${r?.coinsEarned ?? 0} Diamond! Streak ${r?.streak ?? ''} din`);
    } catch (e: any) {
      fail(errorText(e, 'Check-in nahi hua. Dobara try karo.'));
    } finally {
      setBusy(null);
      void daily.refetch();
      void refetchMe();
    }
  };

  const claimTask = async (t: Task) => {
    if (busy) return;
    setBusy(t.id);
    try {
      const r: any = await walletService.claimDailyTask(t.id);
      success(`+${r?.reward ?? t.reward} Diamond${r?.xpEarned ? ` · +${r.xpEarned} XP` : ''}`);
    } catch (e: any) {
      fail(errorText(e, 'Claim nahi hua. Dobara try karo.'));
    } finally {
      setBusy(null);
      void tasksQ.refetch();
      void refetchMe();
    }
  };

  const watchAd = async () => {
    if (busy || rewarded.busy) return;
    if (!rewarded.enabled) {
      setAdSheet(true);
      return;
    }
    await rewarded.watch();
  };

  const goTask = (t: Task) => {
    if (t.claimed) return;
    if (t.claimable) return void claimTask(t);
    void Haptics.selectionAsync().catch(() => undefined);
    if (t.type === 'ads') return void watchAd();
    if (t.type === 'vote') return router.push('/');
    if (t.type === 'follow') return router.push('/explore/search' as any);
    router.push('/explore/battles' as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: p.bg }]} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={p.text} style={{ marginRight: 6 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: BRAND }]}>FREE DIAMONDS</Text>
          <Text style={[styles.title, { color: p.text }]} accessibilityRole="header">Earn</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/wallet')} style={[styles.headBtn, { backgroundColor: p.chip }]} accessibilityLabel="Wallet">
          <Ionicons name="wallet" size={19} color={p.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: IS_WEB && adInfo.enabled ? 120 : 48, width: contentW, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refreshAll} tintColor={BRAND} />}
      >
        {/* Balance + today's potential */}
        <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.blobA} />
          <View style={styles.blobB} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>Aapke Diamonds</Text>
              <View style={styles.heroRow}>
                <View style={styles.heroGem}><DiamondIcon size={24} color="#FFF" /></View>
                <Text style={styles.heroValue} accessibilityLabel={`${live ? bal.diamonds : 'unknown'} Diamonds`}>{live ? bal.diamonds.toLocaleString() : '—'}</Text>
              </View>
            </View>
            {readyCount > 0 ? (
              <View style={styles.readyPill}>
                <View style={styles.readyDot} />
                <Text style={styles.readyText}>{readyCount} READY</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.potential}>
            <Ionicons name="sparkles" size={14} color="#FFF" />
            <Text style={styles.potentialText}>
              {leftToday > 0 ? (
                <>Aaj abhi <Text style={styles.potentialStrong}>{leftToday.toLocaleString()} Diamond</Text> aur kama sakte ho</>
              ) : (
                'Aaj ka sab kama liya! Kal phir aao.'
              )}
            </Text>
          </View>
          {tasks.length ? (
            <View style={{ marginTop: 12 }}>
              <View style={styles.heroBarLabels}>
                <Text style={styles.heroBarText}>Daily tasks {doneCount}/{tasks.length}</Text>
                {hoursLeft(tr.resetsAt) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="time" size={11} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.heroBarText}>{hoursLeft(tr.resetsAt)} mein reset</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.heroTrack}>
                <View style={[styles.heroFill, { width: `${Math.max(4, (doneCount / tasks.length) * 100)}%` }]} />
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {/* Watch & earn */}
        <AdCard
          p={p}
          info={adInfo}
          left={adsLeft}
          busy={rewarded.busy}
          bonus={adBonus}
          claimBusy={busy}
          onWatch={() => void watchAd()}
          onClaimBonus={(t) => void claimTask(t)}
        />

        {/* Daily check-in */}
        {checkinOn ? (
          <>
            <SectionHead p={p} icon="calendar" title="Daily check-in" sub={d.streak > 0 ? `🔥 ${d.streak} din ki streak` : 'Roz aao, streak badhao, reward badhega'} />
            <View style={[styles.checkin, { backgroundColor: p.card, borderColor: checkinReady ? `${BRAND}66` : p.border }]}>
              <View style={styles.days}>
                {track.map((s) => (
                  <DayCell key={s.day} p={p} slot={s} />
                ))}
              </View>
              {checkinReady ? (
                <GradButton icon="gift" label={`Aaj ka reward lo · +${d.todayReward}`} gem busy={busy === 'checkin'} onPress={() => void claimCheckin()} />
              ) : (
                <View style={[styles.doneRow, { backgroundColor: 'rgba(34,165,89,0.12)' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#22A559" />
                  <Text style={styles.doneText}>Aaj ka check-in ho gaya. Kal phir aao!</Text>
                </View>
              )}
            </View>
          </>
        ) : null}

        {/* Tasks */}
        <SectionHead p={p} icon="flash" title="Daily tasks" sub="Kaam karo, Diamond claim karo. Roz naye." />
        {tasksQ.isLoading ? (
          <ActivityIndicator color={BRAND} style={{ marginVertical: 24 }} />
        ) : tasksQ.isError ? (
          <TouchableOpacity onPress={() => tasksQ.refetch()} style={[styles.empty, { borderColor: p.border }]} accessibilityRole="button">
            <Ionicons name="refresh" size={18} color={p.sub} />
            <Text style={[styles.emptyText, { color: p.sub }]}>Tasks load nahi hue. Tap karke dobara try karo.</Text>
          </TouchableOpacity>
        ) : !listTasks.length ? (
          <View style={[styles.empty, { borderColor: p.border }]}>
            <Ionicons name="hourglass" size={18} color={p.sub} />
            <Text style={[styles.emptyText, { color: p.sub }]}>Abhi koi task nahi hai. Jaldi naye aayenge.</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: PAD, gap: 10 }}>
            {listTasks.map((t) => (
              <TaskCard key={t.id} p={p} task={t} busy={busy === t.id} onPress={() => goTask(t)} />
            ))}
          </View>
        )}

        {/* More ways */}
        <SectionHead p={p} icon="gift" title="Aur tareeke" sub="Ek baar wale bade rewards" />
        <View style={styles.grid}>
          {referral?.enabled ? (
            <WayTile
              p={p}
              icon="people"
              grad={['#FF4D67', '#8B5CF6']}
              title="Refer & earn"
              sub={referral.referrerReward > 0 ? `Har dost par +${referral.referrerReward}` : 'Dosto ko bulao'}
              onPress={() => router.push('/referral' as any)}
            />
          ) : null}
          <WayTile p={p} icon="shield-checkmark" grad={['#10B981', '#3B82F6']} title="Account verify" sub="Email + mobile bonus" onPress={() => router.push('/profile/manage/verification' as any)} />
          <WayTile p={p} icon="podium" grad={['#F59E0B', '#FF4D67']} title="Level rewards" sub="Level up par Diamond" onPress={() => router.push('/rewards' as any)} />
          <WayTile p={p} icon="trophy" grad={['#3B82F6', '#8B5CF6']} title="Contest jeeto" sub="Jeeto aur DP coin pao" onPress={() => router.push('/explore/battles' as any)} />
        </View>
        {mon.earning.xpConversion.enabled ? <XpCard p={p} status={xp.data} loading={xp.isLoading} onDone={() => void refetchMe()} /> : null}
      </ScrollView>

      {/* Web: the ad is the main way to earn, so it stays one tap away while scrolling. */}
      {IS_WEB && adInfo.enabled && adsLeft > 0 ? (
        <View style={[styles.floatWrap, { width: contentW }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => void watchAd()}
            disabled={rewarded.busy}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={`Watch an ad for ${adInfo.reward} Diamonds, ${adsLeft} left today`}
          >
            <LinearGradient colors={['#8B5CF6', '#FF4D67', '#FF8A4D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.float}>
              <View style={styles.floatPlay}>
                {rewarded.busy ? <ActivityIndicator color="#FF4D67" size="small" /> : <Ionicons name="play" size={18} color="#FF4D67" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.floatTitle}>{rewarded.busy ? 'Ad chal raha hai…' : `Ad dekho, +${adInfo.reward} Diamond pao`}</Text>
                <Text style={styles.floatSub}>Aaj {adsLeft} ad baaki · {(adsLeft * adInfo.reward).toLocaleString()} Diamond</Text>
              </View>
              <DiamondIcon size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Ads not available in this build / switched off */}
      <Modal visible={adSheet} transparent animationType="fade" onRequestClose={() => setAdSheet(false)}>
        <View style={styles.sheetBack}>
          <View style={[styles.sheet, { backgroundColor: p.card }]}>
            <LinearGradient colors={['#8B5CF6', '#FF4D67']} style={styles.sheetIcon}>
              <Ionicons name="videocam" size={28} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.sheetTitle, { color: p.text }]}>Video ads jaldi aa rahe hain</Text>
            <Text style={[styles.sheetText, { color: p.sub }]}>
              Ad dekh kar Diamond kamane ka feature thodi der mein chalu hoga. Tab tak daily tasks aur check-in se Diamond kamao.
            </Text>
            <View style={{ alignSelf: 'stretch' }}>
              <GradButton icon="flash" label="Tasks dekho" onPress={() => setAdSheet(false)} />
            </View>
          </View>
        </View>
      </Modal>
      <StreakMilestoneBanner streak={streakCelebration} onDone={() => setStreakCelebration(null)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- pieces

function SectionHead({ p, icon, title, sub }: { p: ExplorePalette; icon: string; title: string; sub: string }) {
  return (
    <View style={styles.sectionHead}>
      <LinearGradient colors={BRAND_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sectionIcon}>
        <Ionicons name={icon} size={16} color="#FFF" />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: p.text }]} accessibilityRole="header">{title}</Text>
        <Text style={[styles.sectionSub, { color: p.sub }]} numberOfLines={1}>{sub}</Text>
      </View>
    </View>
  );
}

function GradButton({ icon, label, onPress, busy, gem, grad = ['#FF4D67', '#FF8A4D'] }: { icon: string; label: string; onPress: () => void; busy?: boolean; gem?: boolean; grad?: [string, string] }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label} style={{ opacity: busy ? 0.7 : 1 }}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradBtn}>
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name={icon} size={16} color="#FFF" />
            <Text style={styles.gradBtnText}>{label}</Text>
            {gem ? <DiamondIcon size={14} color="#FFF" /> : null}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** The big rewarded-ad card: reward per ad, today's counter, bonus tasks. */
function AdCard({ p, info, left, busy, bonus, claimBusy, onWatch, onClaimBonus }: {
  p: ExplorePalette;
  info: { enabled: boolean; reward: number; cap: number; watched: number };
  left: number;
  busy: boolean;
  bonus: Task[];
  claimBusy: string | null;
  onWatch: () => void;
  onClaimBonus: (t: Task) => void;
}) {
  const dots = Math.min(info.cap, 10);
  const done = info.enabled && info.cap > 0 && left === 0;
  return (
    <LinearGradient colors={['#8B5CF6', '#FF4D67', '#FF8A4D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.adBorder}>
      <LinearGradient colors={AD_GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ad}>
        <View style={styles.adGlow} />
        <View style={styles.adTop}>
          <View style={styles.adPill}>
            <View style={[styles.liveDot, { backgroundColor: info.enabled ? '#22A559' : GOLD }]} />
            <Text style={styles.adPillText}>{info.enabled ? 'WATCH & EARN' : 'JALDI AA RAHA HAI'}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {info.enabled && info.cap > 0 ? <Text style={styles.adCount}>{info.watched}/{info.cap} aaj</Text> : null}
        </View>

        <View style={styles.adMain}>
          <TouchableOpacity onPress={onWatch} disabled={busy || done} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Watch an ad${info.reward ? ` for ${info.reward} Diamonds` : ''}`}>
            <LinearGradient colors={done ? ['#5B5F6B', '#4A4E58'] : ['#FF4D67', '#FF8A4D']} style={styles.playOrb}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Ionicons name={done ? 'checkmark' : 'play'} size={30} color="#FFF" />}
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.adTitle}>{done ? 'Aaj ke ads ho gaye!' : 'Video ad dekho'}</Text>
            <View style={styles.adRewardRow}>
              <Text style={styles.adReward}>+{info.reward || '?'}</Text>
              <DiamondIcon size={18} color="#FFF" />
              <Text style={styles.adRewardSub}>har ad par</Text>
            </View>
            {info.enabled && info.cap > 0 ? (
              <Text style={styles.adSub}>{done ? 'Kal phir naye ads milenge.' : `Aaj ${left} ad aur · ${(left * info.reward).toLocaleString()} Diamond baaki`}</Text>
            ) : (
              <Text style={styles.adSub}>15-30 sec ka video, poora dekho aur Diamond pao.</Text>
            )}
          </View>
        </View>

        {info.enabled && dots > 0 ? (
          <View style={styles.dots}>
            {Array.from({ length: dots }, (_, i) => (
              <View key={i} style={[styles.dot, i < info.watched ? styles.dotOn : null]}>
                {i < info.watched ? <Ionicons name="checkmark" size={9} color="#FFF" /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {bonus.map((t) => {
          const pct = Math.min(1, t.progress / Math.max(1, t.target));
          return (
            <View key={t.id} style={styles.bonus}>
              <Ionicons name="gift" size={16} color={GOLD} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.bonusTitle} numberOfLines={1}>Bonus: {t.title}</Text>
                <View style={styles.bonusTrack}><View style={[styles.bonusFill, { width: `${Math.max(4, pct * 100)}%` }]} /></View>
              </View>
              {t.claimed ? (
                <Ionicons name="checkmark-circle" size={20} color="#22A559" />
              ) : t.claimable ? (
                <TouchableOpacity onPress={() => onClaimBonus(t)} disabled={claimBusy === t.id} style={styles.bonusClaim} accessibilityRole="button" accessibilityLabel={`Claim ${t.reward} Diamonds`}>
                  {claimBusy === t.id ? <ActivityIndicator color="#1A1033" size="small" /> : <Text style={styles.bonusClaimText}>+{t.reward} lo</Text>}
                </TouchableOpacity>
              ) : (
                <Text style={styles.bonusMeta}>{t.progress}/{t.target} · +{t.reward}</Text>
              )}
            </View>
          );
        })}

        {!done ? <GradButton icon="play" label={info.enabled ? `Ad dekho · +${info.reward}` : 'Ad dekho'} gem={info.enabled} busy={busy} onPress={onWatch} /> : null}
      </LinearGradient>
    </LinearGradient>
  );
}

function DayCell({ p, slot }: { p: ExplorePalette; slot: DailySlot }) {
  const ready = slot.status === 'ready';
  const claimed = slot.status === 'claimed';
  const inner = (
    <>
      <Text style={[styles.dayLabel, { color: ready ? '#FFF' : p.sub }]}>Din {slot.day}</Text>
      {claimed ? (
        <View style={styles.dayCheck}><Ionicons name="checkmark" size={12} color="#FFF" /></View>
      ) : (
        <Ionicons name="gift" size={18} color={ready ? '#FFF' : p.sub} />
      )}
      <Text style={[styles.dayAmount, { color: ready ? '#FFF' : claimed ? '#22A559' : p.text }]}>+{slot.amount}</Text>
    </>
  );
  return ready ? (
    <LinearGradient colors={['#FF4D67', '#FF8A4D']} style={[styles.day, styles.dayReady]}>{inner}</LinearGradient>
  ) : (
    <View style={[styles.day, { backgroundColor: claimed ? 'rgba(34,165,89,0.1)' : p.chip }]}>{inner}</View>
  );
}

function TaskCard({ p, task, busy, onPress }: { p: ExplorePalette; task: Task; busy: boolean; onPress: () => void }) {
  const st = TASK_STYLE[task.type] ?? TASK_STYLE.vote;
  const pct = Math.min(1, task.progress / Math.max(1, task.target));
  return (
    <ScaleTouchable
      onPress={onPress}
      disabled={task.claimed || busy}
      style={[styles.task, { backgroundColor: p.card, borderColor: task.claimable ? '#22A55988' : p.border, opacity: task.claimed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${task.progress} of ${task.target}, reward ${task.reward} Diamonds${task.claimed ? ', done' : task.claimable ? ', ready to claim' : ''}`}
    >
      <View style={styles.taskRow}>
        <LinearGradient colors={st.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.taskIcon}>
          <Ionicons name={st.icon} size={20} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.taskTitle, { color: p.text }]} numberOfLines={1}>{task.title}</Text>
          </View>
          <View style={[styles.taskTrack, { backgroundColor: p.chip }]}>
            <LinearGradient colors={task.claimable || task.claimed ? ['#22A559', '#4ADE80'] : st.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.max(4, pct * 100)}%`, height: '100%', borderRadius: 4 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.taskMeta, { color: p.sub }]}>{task.progress}/{task.target}</Text>
            <View style={styles.rewardChip}>
              <Text style={styles.rewardChipText}>+{task.reward}</Text>
              <DiamondIcon size={11} />
            </View>
            {task.xp > 0 ? <Text style={[styles.taskMeta, { color: p.sub }]}>+{task.xp} XP</Text> : null}
          </View>
        </View>
        {task.claimed ? (
          <View style={styles.doneBadge}><Ionicons name="checkmark" size={16} color="#FFF" /></View>
        ) : task.claimable ? (
          <LinearGradient colors={['#22A559', '#4ADE80']} style={styles.taskBtn}>
            {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.taskBtnText}>Claim</Text>}
          </LinearGradient>
        ) : (
          <View style={[styles.taskBtn, { backgroundColor: `${st.grad[0]}1A` }]}>
            <Text style={[styles.taskBtnText, { color: st.grad[0] }]}>{st.go}</Text>
          </View>
        )}
      </View>
    </ScaleTouchable>
  );
}

function WayTile({ p, icon, grad, title, sub, onPress }: { p: ExplorePalette; icon: string; grad: [string, string]; title: string; sub: string; onPress: () => void }) {
  return (
    <ScaleTouchable onPress={onPress} style={[styles.way, { backgroundColor: p.card, borderColor: p.border }]} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wayIcon}>
        <Ionicons name={icon} size={20} color="#FFF" />
      </LinearGradient>
      <Text style={[styles.wayTitle, { color: p.text }]} numberOfLines={1}>{title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={[styles.waySub, { color: p.sub, flex: 1 }]} numberOfLines={1}>{sub}</Text>
        <ArrowIcon variant="chevron" direction="right" size={11} color={p.sub} />
      </View>
    </ScaleTouchable>
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
    <View style={[styles.xp, { backgroundColor: p.card, borderColor: p.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <LinearGradient colors={['#F59E0B', '#FF4D67']} style={styles.wayIcon}>
          <Ionicons name="flash" size={20} color="#FFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[styles.wayTitle, { color: p.text, marginTop: 0 }]}>XP → Diamond</Text>
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
          <View style={[styles.stepper, { backgroundColor: p.chip }]}>
            <TouchableOpacity style={styles.step} onPress={() => { setN(Math.max(1, qty - 1)); requestId.current = null; }} accessibilityLabel="Kam">
              <Text style={[styles.stepText, { color: p.text }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.stepValue, { color: p.text }]}>{qty}</Text>
            <TouchableOpacity style={styles.step} onPress={() => { setN(Math.min(max, qty + 1)); requestId.current = null; }} accessibilityLabel="Zyada">
              <Text style={[styles.stepText, { color: p.text }]}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <GradButton icon="flash" label={`${qty * (status?.xpPerDiamond ?? 0)} XP convert`} busy={convert.isPending} onPress={go} />
          </View>
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
  header: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 16, gap: 8 },
  kicker: { fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 1.6 },
  title: { fontSize: 24, fontFamily: 'Urbanist-Black', fontStyle: 'italic', marginTop: -2 },
  headBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  hero: { marginHorizontal: PAD, marginTop: 4, borderRadius: 26, padding: 16, overflow: 'hidden' },
  blobA: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.12)', top: -90, right: -50 },
  blobB: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -45, left: -25 },
  heroLabel: { color: 'rgba(255,255,255,0.88)', fontFamily: 'Urbanist-SemiBold', fontSize: 13 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  heroGem: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroValue: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 36, lineHeight: 42 },
  readyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  readyText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 0.8 },
  potential: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  potentialText: { flex: 1, color: '#FFF', fontFamily: 'Urbanist-Medium', fontSize: 12.5 },
  potentialStrong: { fontFamily: 'Urbanist-Black' },
  heroBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  heroBarText: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Urbanist-Bold', fontSize: 11.5 },
  heroTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.2)', overflow: 'hidden' },
  heroFill: { height: '100%', borderRadius: 4, backgroundColor: '#FFF' },

  adBorder: { marginHorizontal: PAD, marginTop: 16, borderRadius: 26, padding: 1.5 },
  ad: { borderRadius: 24.5, padding: 16, gap: 14, overflow: 'hidden' },
  adGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,77,103,0.18)', top: -100, right: -70 },
  adTop: { flexDirection: 'row', alignItems: 'center' },
  adPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  adPillText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 10, letterSpacing: 0.8 },
  adCount: { color: '#C9C2E0', fontFamily: 'Urbanist-Bold', fontSize: 12 },
  adMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  playOrb: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#FF4D67',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 8,
  },
  adTitle: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 18 },
  adRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  adReward: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 26 },
  adRewardSub: { color: '#C9C2E0', fontFamily: 'Urbanist-SemiBold', fontSize: 12, marginLeft: 2 },
  adSub: { color: '#C9C2E0', fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 2 },
  dots: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dot: { flex: 1, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: '#22A559' },
  bonus: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)', borderRadius: 14, padding: 10 },
  bonusTitle: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 13 },
  bonusTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  bonusFill: { height: '100%', borderRadius: 3, backgroundColor: GOLD },
  bonusMeta: { color: GOLD, fontFamily: 'Urbanist-Black', fontSize: 12 },
  bonusClaim: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  bonusClaimText: { color: '#1A1033', fontFamily: 'Urbanist-Black', fontSize: 12 },

  gradBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 16, paddingHorizontal: 14 },
  gradBtnText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 14.5 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: PAD, marginTop: 26, marginBottom: 12 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: 'Urbanist-Black', fontSize: 18 },
  sectionSub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 1 },

  checkin: { marginHorizontal: PAD, borderRadius: 22, borderWidth: 1.5, padding: 12, gap: 12 },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 4, borderRadius: 14, paddingVertical: 8 },
  dayReady: { shadowColor: '#FF4D67', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4 },
  dayLabel: { fontFamily: 'Urbanist-Bold', fontSize: 9.5 },
  dayCheck: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#22A559', alignItems: 'center', justifyContent: 'center' },
  dayAmount: { fontFamily: 'Urbanist-Black', fontSize: 11 },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 14 },
  doneText: { color: '#22A559', fontFamily: 'Urbanist-Bold', fontSize: 13 },

  task: { borderRadius: 20, borderWidth: 1.5 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  taskIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontFamily: 'Urbanist-Bold', fontSize: 14.5, flexShrink: 1 },
  taskTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  taskMeta: { fontFamily: 'Urbanist-SemiBold', fontSize: 11.5 },
  rewardChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,158,11,0.14)', borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  rewardChipText: { color: '#B97A06', fontFamily: 'Urbanist-Black', fontSize: 11 },
  taskBtn: { minWidth: 70, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  taskBtnText: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 13 },
  doneBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#22A559', alignItems: 'center', justifyContent: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: PAD },
  way: { width: '47.5%', flexGrow: 1, borderRadius: 20, borderWidth: 1, padding: 12 },
  wayIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wayTitle: { fontFamily: 'Urbanist-Bold', fontSize: 14.5, marginTop: 10 },
  waySub: { fontFamily: 'Urbanist-Medium', fontSize: 12, marginTop: 2 },

  xp: { marginHorizontal: PAD, marginTop: 12, borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 100, padding: 3 },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: 'Urbanist-Bold' },
  stepValue: { minWidth: 26, textAlign: 'center', fontFamily: 'Urbanist-Black', fontSize: 15 },

  empty: { marginHorizontal: PAD, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', padding: 18, alignItems: 'center', gap: 8 },
  emptyText: { fontFamily: 'Urbanist-Medium', fontSize: 13, textAlign: 'center' },

  floatWrap: { position: 'absolute', bottom: 16, alignSelf: 'center', paddingHorizontal: PAD },
  float: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#FF4D67',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  floatPlay: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  floatTitle: { color: '#FFF', fontFamily: 'Urbanist-Black', fontSize: 14.5 },
  floatSub: { color: 'rgba(255,255,255,0.88)', fontFamily: 'Urbanist-SemiBold', fontSize: 11.5, marginTop: 1 },

  sheetBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, borderRadius: 26, padding: 22, gap: 12, alignItems: 'center' },
  sheetIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: 'Urbanist-Black', fontSize: 19, textAlign: 'center' },
  sheetText: { fontFamily: 'Urbanist-Medium', fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
});
