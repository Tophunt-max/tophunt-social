import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@/src/lib/icons';
import { useMonetizationConfig } from '@/src/services/monetization';

/** Wallet shortcuts to gift history and the digital store, shown only when switched on. */
export function WalletShortcuts({ isDark }: { isDark: boolean }) {
  const cfg = useMonetizationConfig();
  const router = useRouter();
  const links = [
    cfg.gifts.enabled && { key: 'gifts', label: 'Gifts', icon: 'gift-outline', href: '/wallet/gifts' },
    cfg.store.enabled && { key: 'store', label: 'Digital items', icon: 'sparkles-outline', href: '/rewards/store' },
  ].filter(Boolean) as { key: string; label: string; icon: string; href: string }[];
  if (!links.length) return null;
  return (
    <View style={styles.row}>
      {links.map((l) => (
        <TouchableOpacity
          key={l.key}
          style={[styles.chip, { backgroundColor: isDark ? '#1F222A' : '#FFFFFF', borderColor: isDark ? '#2A2D35' : '#ECEEF2' }]}
          onPress={() => router.push(l.href as any)}
          accessibilityRole="button"
        >
          <Ionicons name={l.icon as any} size={18} color="#FF4D67" />
          <Text style={[styles.label, { color: isDark ? '#fff' : '#111' }]}>{l.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 4, marginBottom: 12 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  label: { fontFamily: 'Urbanist-Bold', fontSize: 14 },
});
