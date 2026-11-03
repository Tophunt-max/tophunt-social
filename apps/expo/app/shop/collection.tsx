/**
 * Shop → My Collection. Two collections, switched by the tab bar:
 *
 *  - My Premium Collection: items bought with DP coin (permanent). Equip here.
 *  - XP Collection: the free level rewards, one per level 1-100, unlocked by
 *    XP level. Equip here.
 *
 * `?tab=xp` opens the XP Collection; anything else opens Premium.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton } from '@/src/components/ui/BackButton';
import { Ionicons } from '@/src/lib/icons';
import { useAuth } from '@/src/hooks/useAuth';
import { PremiumCollection } from '@/src/components/shop/collection/PremiumCollection';
import { XpCollection } from '@/src/components/shop/collection/XpCollection';

type CollectionTab = 'premium' | 'xp';

const BG = '#07111F';
const BORDER = '#1E3A5F';
const TEXT = '#F8FAFC';
const MUTED = '#94A3B8';
const PINK = '#FF4D86';
const CYAN = '#22D3EE';

export const parseCollectionTab = (v: unknown): CollectionTab => ((Array.isArray(v) ? v[0] : v) === 'xp' ? 'xp' : 'premium');

const TABS: { key: CollectionTab; label: string; sub: string; icon: string; color: string }[] = [
  { key: 'premium', label: 'My Premium Collection', sub: 'DP coin', icon: 'diamond', color: PINK },
  { key: 'xp', label: 'XP Collection', sub: 'Level 1-100', icon: 'star', color: CYAN },
];

export default function MyCollectionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTabState] = useState<CollectionTab>(() => parseCollectionTab(params.tab));
  const setTab = useCallback((t: CollectionTab) => {
    setTabState(t);
    router.setParams({ tab: t === 'premium' ? undefined : t });
  }, [router]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <BackButton size={24} color={TEXT} style={{ marginRight: 10 }} />
        <Text style={styles.headerTitle} accessibilityRole="header">My Collection</Text>
      </View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && { borderColor: t.color, backgroundColor: `${t.color}1F` }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={t.icon} size={16} color={active ? t.color : MUTED} />
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.tabText, active && { color: TEXT }]} numberOfLines={1}>{t.label}</Text>
                <Text style={[styles.tabSub, active && { color: t.color }]}>{t.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {!user ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={36} color={MUTED} />
          <Text style={styles.muted}>Apna collection dekhne ke liye sign in karein.</Text>
        </View>
      ) : tab === 'xp' ? (
        <XpCollection />
      ) : (
        <PremiumCollection />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 20 },
  tabBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 9 },
  tabText: { color: MUTED, fontFamily: 'Urbanist-Bold', fontSize: 13 },
  tabSub: { color: MUTED, fontFamily: 'Urbanist-SemiBold', fontSize: 10.5, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  muted: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 14, textAlign: 'center' },
});
