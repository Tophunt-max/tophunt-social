import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@/src/lib/icons';
import { useAuthGate } from '@/src/hooks/useAuthGate';
import { useGiftWall, useMonetizationConfig } from '@/src/services/monetization';
import { GiftSheet } from './GiftSheet';

/**
 * Gift wall summary + "Send a gift" on someone else's profile. Shows totals
 * only, never who sent what. Hidden entirely while gifts are switched off.
 */
export function ProfileGiftBar({ uid, name, isDark }: { uid: string; name: string; isDark: boolean }) {
  const cfg = useMonetizationConfig();
  const { requireAuth } = useAuthGate();
  const wall = useGiftWall(uid, cfg.gifts.enabled);
  const [open, setOpen] = useState(false);
  if (!cfg.gifts.enabled) return null;

  const total = wall.data?.totalGifts ?? 0;
  const top = wall.data?.gifts?.slice(0, 3).map((g) => g.name).join(', ');
  return (
    <View style={[styles.bar, { backgroundColor: isDark ? '#1F222A' : '#FFF6F7', borderColor: isDark ? '#2A2D35' : '#FFE0E5' }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111' }]}>
          {total > 0 ? `${total} gift${total === 1 ? '' : 's'} from ${wall.data?.supporters} supporter${wall.data?.supporters === 1 ? '' : 's'}` : 'Support this creator'}
        </Text>
        {top ? <Text style={styles.sub} numberOfLines={1}>{top}</Text> : null}
      </View>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => {
          if (requireAuth('gift')) setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Send a gift to ${name}`}
      >
        <Ionicons name="gift" size={16} color="#fff" />
        <Text style={styles.btnText}>Send gift</Text>
      </TouchableOpacity>
      <GiftSheet visible={open} onClose={() => setOpen(false)} recipientUid={uid} recipientName={name} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  title: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, color: '#8A8F98', marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF4D67', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { color: '#fff', fontFamily: 'Urbanist-Bold', fontSize: 13 },
});
