import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/hooks/useAuth';
import { useMonetizationConfig } from '@/src/services/monetization';
import { useXpConversion } from '@/src/services/shop';
import { XpIcon } from '@/src/components/ui/XpIcon';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';

/**
 * The third coin in the wallet: XP → Diamond. Shown only while the
 * conversion is switched on; taps through to the Earn screen.
 */
export function XpStrip({ isDark }: { isDark: boolean }) {
  const cfg = useMonetizationConfig();
  const { user } = useAuth();
  const router = useRouter();
  const on = cfg.earning.xpConversion.enabled;
  const q = useXpConversion(!!user && on);
  if (!on || !q.data) return null;
  const { convertibleXp, xpPerDiamond, availableDiamonds } = q.data;
  return (
    <TouchableOpacity
      style={[styles.strip, { backgroundColor: isDark ? '#1F222A' : '#FFF8EC', borderColor: isDark ? '#2A2D35' : '#FDE7B8' }]}
      onPress={() => router.push('/earn' as any)}
      accessibilityRole="button"
      accessibilityLabel={`${convertibleXp} XP. ${xpPerDiamond} XP makes 1 Diamond.`}
    >
      <XpIcon size={40} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: isDark ? '#fff' : '#111' }]}>{convertibleXp} XP</Text>
        <View style={styles.subRow}>
          <Text style={styles.sub}>{xpPerDiamond} XP = 1</Text>
          <DiamondIcon size={17} />
          <Text style={styles.sub}>Diamond</Text>
          {availableDiamonds > 0 ? (
            <>
              <Text style={styles.sub}>· abhi {availableDiamonds}</Text>
              <DiamondIcon size={17} />
              <Text style={styles.sub}>bana sakte ho</Text>
            </>
          ) : null}
        </View>
      </View>
      <Text style={styles.cta}>Convert</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  title: { fontFamily: 'Urbanist-Bold', fontSize: 15 },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3, marginTop: 2 },
  sub: { fontFamily: 'Urbanist-Medium', fontSize: 12, color: '#8A8F98' },
  cta: { color: '#FF4D67', fontFamily: 'Urbanist-Bold', fontSize: 13 },
});
