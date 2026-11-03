/**
 * Shop → My Collection → My Premium Collection: everything bought with DP coin
 * (permanent). Equip / remove here; stickers and collectibles are kept here
 * too (stickers are sent from the chat and comment sticker button).
 *
 * Free XP level rewards are NOT listed here: they live in the XP Collection
 * tab. Ownership and equip are re-checked by the Worker on every write.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { emitToast } from '@/src/lib/toastBridge';
import { useAuth } from '@/src/hooks/useAuth';
import { cosmeticTier } from '@/src/lib/cosmeticArt';
import { RarityPill } from '@/src/components/gamification/RarityPill';
import { CosmeticPreview, GamificationError } from '@/src/components/gamification/RewardBits';
import { useEquipCosmetic, useInventory, type InventoryItemView } from '@/src/services/gamification';
import { Ionicons } from '@/src/lib/icons';

const BG = '#07111F';
const CARD = '#0D1B2E';
const CARD_2 = '#10243C';
const BORDER = '#1E3A5F';
const TEXT = '#F8FAFC';
const MUTED = '#94A3B8';
const PINK = '#FF4D86';
const PAD = 16;

const SECTIONS: { type: string; title: string; equippable: boolean; note?: string }[] = [
  { type: 'frame', title: 'Profile frames', equippable: true },
  { type: 'theme', title: 'Profile themes', equippable: true },
  { type: 'badge', title: 'Name badges', equippable: true },
  { type: 'title', title: 'Titles', equippable: true },
  { type: 'effect', title: 'Profile effects', equippable: true },
  { type: 'accessory', title: 'Avatar accessories', equippable: true },
  { type: 'sticker', title: 'Stickers', equippable: false, note: 'Chat aur comments ke sticker button se bhejein.' },
  { type: 'collectible', title: 'Collectibles', equippable: false, note: 'Aapke collection me hamesha rahenge.' },
];

/** A DP coin item: bought in the Shop, or a Premium item granted by an admin. Never a free XP level reward. */
export function isPremiumOwned(i: InventoryItemView): boolean {
  if (!i.owned || i.asset?.collection === 'xp40') return false;
  return i.source === 'store' || cosmeticTier(i) === 'premium';
}

export function PremiumCollection() {
  const router = useRouter();
  const { user } = useAuth();
  const q = useInventory(!!user);
  const equip = useEquipCosmetic();
  const avatar = { uri: user?.photoURL ?? null, name: user?.displayName || 'You' };

  const sections = useMemo(() => {
    const owned = (q.data?.items ?? []).filter(isPremiumOwned);
    return SECTIONS.map((s) => ({ ...s, data: owned.filter((i) => i.type === s.type) })).filter((s) => s.data.length);
  }, [q.data]);
  const total = sections.reduce((n, s) => n + s.data.length, 0);

  const onEquip = (item: InventoryItemView) => {
    equip.mutate(
      { slot: item.type, itemId: item.equipped ? null : item.id },
      {
        onSuccess: () => emitToast(item.equipped ? `${item.name} removed` : `${item.name} equipped`, 'success'),
        onError: (e: any) => emitToast(e?.message || 'Could not equip this item.', 'error'),
      },
    );
  };

  if (q.isLoading) return <View style={styles.center}><ActivityIndicator color={PINK} size="large" /></View>;
  if (q.isError) {
    return (
      <View style={{ padding: PAD }}>
        <GamificationError p={{ isDark: true, bg: BG, card: CARD, chip: CARD_2, text: TEXT, sub: MUTED, border: BORDER, skeleton: CARD_2 }} onRetry={() => q.refetch()} text="Premium collection load nahi ho payi." />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(i) => i.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={PINK} colors={[PINK]} />}
      ListHeaderComponent={
        total ? (
          <View style={styles.intro}>
            <Text style={styles.introTitle}>{total} premium item{total === 1 ? '' : 's'}</Text>
            <Text style={styles.introSub}>DP coin se khareede items. Ye hamesha aapke rahenge.</Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="diamond-outline" size={40} color={MUTED} />
          <Text style={styles.emptyTitle}>Abhi koi premium item nahi</Text>
          <Text style={styles.emptySub}>Shop me frames, themes, badges, titles aur stickers DP coin se khareedein.</Text>
          <TouchableOpacity style={styles.cta} onPress={() => router.push('/shop?tab=digital' as any)} accessibilityRole="button">
            <Text style={styles.ctaText}>Shop dekhein</Text>
          </TouchableOpacity>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.note ? <Text style={styles.sectionNote}>{section.note}</Text> : null}
        </View>
      )}
      renderItem={({ item, section }) => (
        <View style={[styles.row, { borderColor: item.equipped ? PINK : BORDER }]}>
          <CosmeticPreview item={item} size={56} avatarUri={avatar.uri} name={avatar.name} />
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <RarityPill rarity={item.rarity} />
            </View>
            {item.description ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
            <Text style={[styles.state, item.equipped && { color: PINK }]}>
              {item.equipped ? 'Equipped' : section.equippable ? 'Permanent · ready to equip' : 'Permanent · in your collection'}
            </Text>
          </View>
          {section.equippable ? (
            <TouchableOpacity
              style={[styles.btn, item.equipped ? styles.btnRemove : null]}
              onPress={() => onEquip(item)}
              disabled={equip.isPending}
              accessibilityRole="button"
              accessibilityLabel={item.equipped ? `Remove ${item.name}` : `Equip ${item.name}`}
            >
              <Text style={styles.btnText}>{item.equipped ? 'Remove' : 'Equip'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  intro: { paddingHorizontal: PAD, paddingTop: 16 },
  introTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 17 },
  introSub: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 12.5, marginTop: 3 },
  sectionHead: { paddingHorizontal: PAD, marginTop: 18, marginBottom: 8 },
  sectionTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 15 },
  sectionNote: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 11.5, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: PAD, marginBottom: 10, padding: 12, borderRadius: 16, borderWidth: 1, backgroundColor: CARD },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: TEXT, fontSize: 15, fontFamily: 'Urbanist-Bold', flexShrink: 1 },
  desc: { color: MUTED, fontSize: 12, fontFamily: 'Urbanist-Medium', marginTop: 2 },
  state: { color: MUTED, fontSize: 11, fontFamily: 'Urbanist-SemiBold', marginTop: 4 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: PINK },
  btnRemove: { backgroundColor: CARD_2, borderWidth: 1, borderColor: BORDER },
  btnText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Urbanist-Bold' },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60, gap: 8 },
  emptyTitle: { color: TEXT, fontFamily: 'Urbanist-Bold', fontSize: 17, marginTop: 6 },
  emptySub: { color: MUTED, fontFamily: 'Urbanist-Medium', fontSize: 13, textAlign: 'center' },
  cta: { marginTop: 10, backgroundColor: PINK, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 10 },
  ctaText: { color: '#FFFFFF', fontFamily: 'Urbanist-Bold', fontSize: 14 },
});
