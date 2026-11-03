/**
 * Owned stickers in DMs and comments (worker lib/stickers.ts).
 *
 *  - StickerArt: one sticker at a size, from its catalog asset (uploaded WebP
 *    or bundled art, animated overlay included; colours/icon as the fallback).
 *  - StickerPicker: a bottom sheet of the stickers the signed-in user owns,
 *    with a way to the Shop when they own none.
 */
import React from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@/src/lib/icons';
import { CloseIcon } from '@/src/components/ui/CloseIcon';
import { CosmeticPreview } from '@/src/components/gamification/RewardBits';
import { useInventory } from '@/src/services/gamification';
import type { StickerView } from '@/src/lib/chatThread';

const PINK = '#FF4D67';

export function StickerArt({ sticker, size = 112, dim = false }: { sticker: StickerView; size?: number; dim?: boolean }) {
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.6 : 1 }} accessible accessibilityRole="image" accessibilityLabel={`Sticker: ${sticker.name}`}>
      <CosmeticPreview item={{ id: sticker.id, type: 'sticker', name: sticker.name, rarity: sticker.rarity ?? null, asset: sticker.asset ?? {} }} size={size} />
    </View>
  );
}

export function StickerPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (s: StickerView) => void }) {
  const router = useRouter();
  const inv = useInventory(visible);
  const owned: StickerView[] = (inv.data?.items ?? [])
    .filter((i) => i.type === 'sticker' && i.owned)
    .map((i) => ({ id: i.id, name: i.name, rarity: i.rarity, asset: i.asset ?? {} }));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close stickers" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Your stickers</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
            <CloseIcon size={22} color="#5F6368" />
          </TouchableOpacity>
        </View>
        {inv.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={PINK} /></View>
        ) : inv.isError ? (
          <View style={styles.center}>
            <Text style={styles.muted}>Stickers could not be loaded.</Text>
            <TouchableOpacity onPress={() => inv.refetch()} style={styles.cta}><Text style={styles.ctaText}>Try again</Text></TouchableOpacity>
          </View>
        ) : !owned.length ? (
          <View style={styles.center}>
            <Ionicons name="happy-outline" size={36} color="#C9CDD2" />
            <Text style={styles.muted}>Aapke paas abhi koi sticker nahi hai.</Text>
            <TouchableOpacity
              onPress={() => { onClose(); router.push('/shop?tab=digital' as any); }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Shop me stickers dekhein</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={owned}
            keyExtractor={(s) => s.id}
            numColumns={4}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.cell} onPress={() => onPick(item)} accessibilityLabel={`Send ${item.name}`}>
                <StickerArt sticker={item} size={68} />
                <Text style={styles.cellName} numberOfLines={1}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: '60%', minHeight: 260 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#DADCE0', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 10 },
  muted: { color: '#5F6368', fontSize: 14, textAlign: 'center' },
  cta: { backgroundColor: PINK, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, marginTop: 4 },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  grid: { paddingHorizontal: 8 },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 8 },
  cellName: { fontSize: 11, color: '#5F6368', marginTop: 4, maxWidth: 76 },
});
