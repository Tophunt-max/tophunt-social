import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BackButton } from '@/src/components/ui/BackButton';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { Avatar } from '@/src/components/ui/Avatar';
import { Ionicons } from '@/src/lib/icons';
import { useAuth } from '@/src/hooks/useAuth';
import { useDesignWindow } from '@/src/lib/layout';
import { formatXp } from '@/src/lib/progression';
import { emitToast } from '@/src/lib/toastBridge';
import {
  CosmeticBadge,
  CosmeticTitleChip,
  FramedAvatar,
  ThemeBackdrop,
  TierPill,
} from '@/src/components/gamification/CosmeticBits';
import { CosmeticPreview, GamificationError } from '@/src/components/gamification/RewardBits';
import {
  useEquipCosmetic,
  useXpCosmetics,
  type XpCosmeticType,
  type XpCosmeticView,
} from '@/src/services/gamification';

const BG = '#07111F';
const CARD = '#0D1B2E';
const CARD_2 = '#10243C';
const BORDER = '#1E3A5F';
const TEXT = '#F8FAFC';
const MUTED = '#94A3B8';
const CYAN = '#22D3EE';
const GREEN = '#4ADE80';
const PINK = '#FF4D86';
const AMBER = '#FBBF24';
const PAD = 16;

const TABS: { type: XpCosmeticType; label: string; icon: string; color: string }[] = [
  { type: 'frame', label: 'Frames', icon: 'person-circle', color: CYAN },
  { type: 'theme', label: 'Themes', icon: 'color-palette', color: '#A78BFA' },
  { type: 'badge', label: 'Badges', icon: 'medal', color: AMBER },
  { type: 'title', label: 'Titles', icon: 'ribbon', color: PINK },
];

/**
 * Dedicated FREE XP collection. It never calls the Store or any coin action:
 * ownership comes from getXpCosmetics (server XP/level), and the only write is
 * equipCosmetic, whose Worker UPDATE checks permanent D1 ownership and type.
 */
export default function XpCosmeticsScreen() {
  const { user } = useAuth();
  const q = useXpCosmetics(user?.uid, !!user);
  const equip = useEquipCosmetic();
  const { width } = useDesignWindow();
  const reduceMotion = useReducedMotion();
  const [type, setType] = useState<XpCosmeticType>('frame');
  const [selected, setSelected] = useState<XpCosmeticView | null>(null);
  const columns = width >= 900 ? 5 : width >= 600 ? 4 : 2;
  const contentWidth = Math.min(width, 1100);
  const cardWidth = (contentWidth - PAD * 2 - 12 * (columns - 1)) / columns;
  const data = q.data;
  const items = useMemo(() => (data?.items ?? []).filter((item) => item.type === type), [data?.items, type]);
  const avatar = { uri: user?.photoURL ?? null, name: user?.displayName || 'You' };

  const onEquip = (item: XpCosmeticView) => {
    if (!item.owned || data?.offline) return;
    equip.mutate(
      { slot: item.type, itemId: item.equipped ? null : item.id },
      {
        onSuccess: () => {
          Haptics.selectionAsync().catch(() => undefined);
          emitToast(item.equipped ? `${item.name} removed` : `${item.name} equipped`, 'success');
          setSelected(null);
        },
        onError: (error: any) => emitToast(error?.message || 'Could not equip this item.', 'error'),
      },
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={TEXT} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} accessibilityRole="header">XP Rewards</Text>
          <Text style={styles.headerSub}>Normal / Free cosmetics</Text>
        </View>
        <View style={styles.freePill}><Ionicons name="star" size={12} color="#052E16" /><Text style={styles.freePillText}>FREE</Text></View>
      </View>

      {q.isLoading && !data ? (
        <View style={styles.center}><ActivityIndicator color={CYAN} size="large" /><Text style={styles.loading}>Loading your rewards…</Text></View>
      ) : q.isError || !data ? (
        <View style={{ padding: PAD }}><GamificationError p={{ isDark: true, bg: BG, card: CARD, chip: CARD_2, text: TEXT, sub: MUTED, border: BORDER, skeleton: CARD_2 }} onRetry={() => q.refetch()} text="XP rewards load nahi ho paye." /></View>
      ) : (
        <FlatList
          key={`xp-grid-${columns}`}
          data={items}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          style={{ width: contentWidth, alignSelf: 'center' }}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: PAD }}
          contentContainerStyle={{ gap: 12, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={CYAN} colors={[CYAN]} />}
          ListHeaderComponent={
            <View>
              <ProgressHero data={data} />
              {data.offline ? (
                <View style={styles.offline}>
                  <Ionicons name="alert-circle" size={16} color={AMBER} />
                  <Text style={styles.offlineText}>Offline preview. Equip is available after reconnecting.</Text>
                </View>
              ) : null}
              <View style={styles.sectionIntro}>
                <Text style={styles.sectionTitle}>Your free collection</Text>
                <Text style={styles.sectionSub}>Earn XP by posting, voting, commenting and daily check-ins. No DP coin or Diamond needed.</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {TABS.map((tab) => {
                  const active = tab.type === type;
                  const count = data.items.filter((item) => item.type === tab.type && item.owned).length;
                  return (
                    <TouchableOpacity
                      key={tab.type}
                      onPress={() => setType(tab.type)}
                      style={[styles.tab, active && { borderColor: tab.color, backgroundColor: `${tab.color}20` }]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={tab.icon} size={17} color={active ? tab.color : MUTED} />
                      <Text style={[styles.tabText, active && { color: TEXT }]}>{tab.label}</Text>
                      <Text style={[styles.tabCount, active && { color: tab.color }]}>{count}/10</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.categoryHead}>
                <Text style={styles.categoryTitle}>{TABS.find((tab) => tab.type === type)?.label}</Text>
                <Text style={styles.categoryHint}>Tap Preview to see it on your profile</Text>
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(Math.min(index, 5) * 45).duration(260)}>
              <XpItemCard item={item} width={cardWidth} avatar={avatar} busy={equip.isPending} offline={!!data.offline} onPreview={() => setSelected(item)} onEquip={() => onEquip(item)} />
            </Animated.View>
          )}
        />
      )}

      <PreviewModal
        item={selected}
        avatar={avatar}
        busy={equip.isPending}
        offline={!!data?.offline}
        onClose={() => setSelected(null)}
        onEquip={onEquip}
      />
    </SafeAreaView>
  );
}

function ProgressHero({ data }: { data: NonNullable<ReturnType<typeof useXpCosmetics>['data']> }) {
  const info = data.levelInfo;
  const nextNames = data.nextUnlock?.items.map((item) => item.name).join(', ');
  const denominator = info.xpForNextLevel ?? 0;
  return (
    <LinearGradient colors={['#0A2A4A', '#15204A', '#321B52']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroGlowA} /><View style={styles.heroGlowB} />
      <View style={styles.heroTop}>
        <View style={styles.levelOrb}><Text style={styles.levelSmall}>LEVEL</Text><Text style={styles.levelNumber}>{info.level}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>YOUR XP JOURNEY</Text>
          <Text style={styles.heroXp}>{formatXp(info.xp)} <Text style={styles.heroXpUnit}>XP</Text></Text>
          <Text style={styles.heroRank}>{info.rank.name} · {data.counts.unlocked}/40 cosmetics unlocked</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(2, Math.min(100, info.progress * 100))}%` }]} />
      </View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressLabel}>{info.isMaxLevel ? 'Maximum level' : `${formatXp(info.xpIntoLevel)} / ${formatXp(denominator)} XP`}</Text>
        <Text style={styles.progressLabel}>{info.isMaxLevel ? 'XP keeps counting' : `${formatXp(info.xpToNextLevel ?? 0)} XP to Level ${info.level + 1}`}</Text>
      </View>
      {data.nextUnlock ? (
        <View style={styles.nextUnlock}>
          <View style={styles.nextIcon}><Ionicons name="gift" size={17} color={AMBER} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nextLabel}>NEXT FREE UNLOCK · LEVEL {data.nextUnlock.level}</Text>
            <Text style={styles.nextName} numberOfLines={2}>{nextNames}</Text>
          </View>
          <Text style={styles.nextXp}>{formatXp(data.nextUnlock.xpRemaining)} XP</Text>
        </View>
      ) : (
        <View style={styles.nextUnlock}><Ionicons name="checkmark-circle" size={19} color={GREEN} /><Text style={styles.nextName}>All 40 free cosmetics unlocked</Text></View>
      )}
    </LinearGradient>
  );
}

function XpItemCard({ item, width, avatar, busy, offline, onPreview, onEquip }: { item: XpCosmeticView; width: number; avatar: { uri: string | null; name: string }; busy: boolean; offline: boolean; onPreview: () => void; onEquip: () => void }) {
  const locked = item.state === 'locked';
  const equipped = item.state === 'equipped';
  return (
    <View style={[styles.itemCard, { width, borderColor: equipped ? GREEN : locked ? BORDER : '#1D6D79' }]}>
      <LinearGradient colors={locked ? ['#0D1727', '#101827'] : ['#102C3E', '#1B2144']} style={[styles.previewStage, { height: width * 0.82 }]}>
        <CosmeticPreview item={{ ...item, owned: !locked }} size={Math.min(width * 0.65, 104)} avatarUri={avatar.uri} name={avatar.name} />
        <View style={styles.levelTag}><Text style={styles.levelTagText}>Lv. {item.unlocksAtLevel}</Text></View>
        {equipped ? <View style={styles.equippedTag}><Ionicons name="checkmark" size={11} color="#052E16" /><Text style={styles.equippedTagText}>EQUIPPED</Text></View> : null}
      </LinearGradient>
      <View style={styles.itemBody}>
        <Text style={[styles.itemName, locked && { color: '#CBD5E1' }]} numberOfLines={1}>{item.name}</Text>
        <View style={styles.itemMeta}><TierPill item={item} compact /><Text style={styles.requiredXp}>{formatXp(item.requiredXp)} XP</Text></View>
        <Text style={[styles.state, { color: equipped ? GREEN : locked ? MUTED : CYAN }]}>
          {equipped ? 'Currently equipped' : locked ? `${formatXp(item.xpRemaining)} XP remaining` : 'Unlocked permanently'}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.previewBtn} onPress={onPreview} accessibilityRole="button"><Text style={styles.previewBtnText}>Preview</Text></TouchableOpacity>
          <TouchableOpacity
            style={[styles.equipBtn, (locked || offline) && styles.disabledBtn, equipped && styles.removeBtn]}
            disabled={locked || offline || busy}
            onPress={onEquip}
            accessibilityRole="button"
          >
            <Text style={[styles.equipBtnText, equipped && { color: TEXT }]}>{locked ? 'Locked' : equipped ? 'Remove' : 'Equip'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function PreviewModal({ item, avatar, busy, offline, onClose, onEquip }: { item: XpCosmeticView | null; avatar: { uri: string | null; name: string }; busy: boolean; offline: boolean; onClose: () => void; onEquip: (item: XpCosmeticView) => void }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  if (!item) return null;
  const locked = !item.owned;
  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalLayer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close preview" />
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.springify().damping(18)} style={[styles.modalCard, { marginBottom: Math.max(14, insets.bottom) }]} accessibilityViewIsModal>
          <LinearGradient colors={['#102C4A', '#171D3D', '#29183E']} style={styles.modalStage}>
            <View style={styles.modalTop}><View><Text style={styles.modalKicker}>LIVE PROFILE PREVIEW</Text><Text style={styles.modalTitle}>{item.name}</Text></View><TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close"><CloseIcon size={19} color={TEXT} /></TouchableOpacity></View>
            <LivePreview item={item} avatar={avatar} />
          </LinearGradient>
          <View style={styles.modalBody}>
            <View style={styles.modalPills}><TierPill item={item} /><View style={styles.unlockPill}><Ionicons name="lock-open" size={12} color={CYAN} /><Text style={styles.unlockPillText}>Level {item.unlocksAtLevel} · {formatXp(item.requiredXp)} XP</Text></View></View>
            <Text style={styles.modalDescription}>{item.description}</Text>
            <Text style={[styles.modalState, { color: item.equipped ? GREEN : locked ? AMBER : CYAN }]}>{item.equipped ? 'Equipped now' : locked ? `Locked · ${formatXp(item.xpRemaining)} XP remaining` : 'Unlocked permanently on your account'}</Text>
            <TouchableOpacity style={[styles.modalAction, (locked || offline) && styles.disabledBtn, item.equipped && styles.removeBtn]} disabled={locked || offline || busy} onPress={() => onEquip(item)} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#052E16" /> : <Text style={[styles.modalActionText, item.equipped && { color: TEXT }]}>{locked ? `Reach Level ${item.unlocksAtLevel}` : offline ? 'Reconnect to equip' : item.equipped ? 'Remove item' : 'Equip free item'}</Text>}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function LivePreview({ item, avatar }: { item: XpCosmeticView; avatar: { uri: string | null; name: string } }) {
  if (item.type === 'theme') {
    return <View style={styles.profileMock}><ThemeBackdrop theme={item as any} /><View style={styles.profileShade} /><Avatar uri={avatar.uri} name={avatar.name} size={72} /><Text style={styles.profileName}>{avatar.name}</Text><Text style={styles.profileHandle}>@tophunter · Level {item.unlocksAtLevel}</Text></View>;
  }
  if (item.type === 'frame') {
    return <View style={styles.liveCenter}><FramedAvatar uri={avatar.uri} name={avatar.name} size={154} frame={item as any} /><Text style={styles.profileName}>{avatar.name}</Text><Text style={styles.profileHandle}>This frame appears everywhere your avatar does</Text></View>;
  }
  if (item.type === 'badge') {
    return <View style={styles.liveCenter}><CosmeticBadge badge={item as any} size={106} /><View style={styles.nameDemo}><Text style={styles.profileName}>{avatar.name}</Text><CosmeticBadge badge={item as any} size={22} /></View><Text style={styles.profileHandle}>Visible beside your name</Text></View>;
  }
  return <View style={styles.liveCenter}><Avatar uri={avatar.uri} name={avatar.name} size={76} /><Text style={styles.profileName}>{avatar.name}</Text><CosmeticTitleChip title={{ ...(item as any), text: String(item.asset?.text ?? item.name) }} /><Text style={styles.profileHandle}>Dynamic title text stays editable</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: { height: 62, paddingHorizontal: PAD, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 20 },
  headerSub: { color: CYAN, fontFamily: 'Urbanist-SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  freePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  freePillText: { color: '#052E16', fontFamily: 'Urbanist-Bold', fontSize: 10, letterSpacing: 0.6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { color: MUTED, fontFamily: 'Urbanist-Medium' },
  hero: { margin: PAD, borderRadius: 24, borderWidth: 1, borderColor: '#245A7A', padding: 18, overflow: 'hidden' },
  heroGlowA: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(34,211,238,0.10)', right: -45, top: -85 },
  heroGlowB: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,77,134,0.10)', left: -45, bottom: -70 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  levelOrb: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: CYAN, backgroundColor: '#08243A', alignItems: 'center', justifyContent: 'center', shadowColor: CYAN, shadowOpacity: 0.35, shadowRadius: 10 },
  levelSmall: { color: MUTED, fontFamily: 'Urbanist-Bold', fontSize: 9, letterSpacing: 1 },
  levelNumber: { color: TEXT, fontFamily: 'Urbanist-Black', fontSize: 30, lineHeight: 32 },
  heroKicker: { color: CYAN, fontFamily: 'Urbanist-Bold', fontSize: 10, letterSpacing: 1.1 },
  heroXp: { color: TEXT, fontFamily: 'Urbanist-Black', fontSize: 29 },
  heroXpUnit: { color: AMBER, fontSize: 14 },
  heroRank: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 12 },
  progressTrack: { height: 9, borderRadius: 5, backgroundColor: '#06101E', overflow: 'hidden', marginTop: 16, borderWidth: 1, borderColor: '#29425B' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: CYAN },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  progressLabel: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 10.5 },
  nextUnlock: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(5,13,26,0.58)', borderRadius: 14, borderWidth: 1, borderColor: '#30435D', padding: 11, marginTop: 14 },
  nextIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#3B2A08', alignItems: 'center', justifyContent: 'center' },
  nextLabel: { color: AMBER, fontFamily: 'Urbanist-Bold', fontSize: 9.5, letterSpacing: 0.6 },
  nextName: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 12.5, flexShrink: 1 },
  nextXp: { color: CYAN, fontFamily: 'Urbanist-Bold', fontSize: 11 },
  offline: { marginHorizontal: PAD, marginBottom: 4, borderRadius: 12, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#3A2B08', borderWidth: 1, borderColor: '#7C5D12' },
  offlineText: { color: '#FDE68A', fontFamily: 'Urbanist-Medium', fontSize: 12, flex: 1 },
  sectionIntro: { paddingHorizontal: PAD, marginTop: 14 },
  sectionTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 19 },
  sectionSub: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  tabs: { gap: 8, paddingHorizontal: PAD, paddingVertical: 14 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 13, height: 38 },
  tabText: { color: MUTED, fontFamily: 'Urbanist-Bold', fontSize: 12.5 },
  tabCount: { color: '#64748B', fontFamily: 'Urbanist-Bold', fontSize: 10 },
  categoryHead: { paddingHorizontal: PAD, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  categoryTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 16 },
  categoryHint: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 10.5 },
  itemCard: { borderRadius: 18, borderWidth: 1, backgroundColor: CARD, overflow: 'hidden' },
  previewStage: { alignItems: 'center', justifyContent: 'center' },
  levelTag: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(2,8,20,0.78)', borderRadius: 9, borderWidth: 1, borderColor: '#39536D', paddingHorizontal: 7, paddingVertical: 3 },
  levelTagText: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 10 },
  equippedTag: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, backgroundColor: GREEN, paddingHorizontal: 6, paddingVertical: 3 },
  equippedTagText: { color: '#052E16', fontFamily: 'Urbanist-Bold', fontSize: 8.5 },
  itemBody: { padding: 10 },
  itemName: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 14 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  requiredXp: { color: MUTED, fontFamily: 'Urbanist-SemiBold', fontSize: 9.5 },
  state: { fontFamily: 'Urbanist-SemiBold', fontSize: 10.5, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 9 },
  previewBtn: { flex: 1, height: 31, borderRadius: 10, borderWidth: 1, borderColor: '#33516C', alignItems: 'center', justifyContent: 'center' },
  previewBtnText: { color: '#D8E8F5', fontFamily: 'Urbanist-Bold', fontSize: 11 },
  equipBtn: { flex: 1, height: 31, borderRadius: 10, backgroundColor: CYAN, alignItems: 'center', justifyContent: 'center' },
  equipBtnText: { color: '#052E3B', fontFamily: 'Urbanist-Bold', fontSize: 11 },
  removeBtn: { backgroundColor: '#26374B', borderWidth: 1, borderColor: '#476078' },
  disabledBtn: { opacity: 0.45 },
  modalLayer: { flex: 1, backgroundColor: 'rgba(0,4,12,0.78)', justifyContent: 'flex-end', paddingHorizontal: 10 },
  modalCard: { maxWidth: 560, width: '100%', alignSelf: 'center', backgroundColor: CARD, borderRadius: 26, borderWidth: 1, borderColor: '#315170', overflow: 'hidden' },
  modalStage: { minHeight: 300, padding: 16 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalKicker: { color: CYAN, fontFamily: 'Urbanist-Bold', fontSize: 10, letterSpacing: 1 },
  modalTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 21, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  liveCenter: { minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 8 },
  profileMock: { minHeight: 220, marginTop: 12, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  profileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,8,20,0.30)' },
  profileName: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 17, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  profileHandle: { color: '#D5E2EE', fontFamily: 'Urbanist-Medium', fontSize: 11, textAlign: 'center' },
  nameDemo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modalBody: { padding: 16, gap: 10 },
  modalPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unlockPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderWidth: 1, borderColor: '#1C6570', backgroundColor: '#082D36', paddingHorizontal: 8, paddingVertical: 4 },
  unlockPillText: { color: CYAN, fontFamily: 'Urbanist-Bold', fontSize: 10.5 },
  modalDescription: { color: '#CAD5E1', fontFamily: 'Urbanist-Medium', fontSize: 13, lineHeight: 18 },
  modalState: { fontFamily: 'Urbanist-Bold', fontSize: 12 },
  modalAction: { height: 46, borderRadius: 15, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  modalActionText: { color: '#052E16', fontFamily: 'Urbanist-Bold', fontSize: 14 },
});
