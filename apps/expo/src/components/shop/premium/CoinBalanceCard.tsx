import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Ionicons } from '@/src/lib/icons';
import { coinsInInr } from '@/src/lib/coinValue';
import { TH } from '@/src/theme/tophunt';

/**
 * DP coin balance with its ₹ reference value (Coin Economy → Coin value; hidden
 * when not configured) and the way to earn more.
 */
export function CoinBalanceCard({ live, dpcoin, rate, onEarn }: { live: boolean; dpcoin: number; rate: number | null; onEarn: () => void }) {
  const inr = live ? coinsInInr(dpcoin, rate) : null;
  return (
    <LinearGradient colors={TH.gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>Aapke DP coin</Text>
        <View style={styles.valueRow}>
          <CoinIcon size={26} />
          {live ? (
            <Text style={styles.value} accessibilityLabel={`${dpcoin} DP coin`}>{dpcoin.toLocaleString()}</Text>
          ) : (
            <Skeleton width={90} height={26} borderRadius={8} />
          )}
        </View>
        {inr ? <Text style={styles.inr}>{inr} value</Text> : null}
      </View>
      <TouchableOpacity onPress={onEarn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Kamao: contest jeet kar DP coin kamao">
        <LinearGradient colors={TH.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.earn}>
          <Ionicons name="trophy" size={14} color="#2A1A00" />
          <Text style={styles.earnText}>Kamao</Text>
        </LinearGradient>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: TH.radii.xl, padding: 16, overflow: 'hidden', gap: 12 },
  glowA: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)', top: -90, right: -40 },
  glowB: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,200,87,0.14)', bottom: -55, left: 60 },
  label: { color: 'rgba(255,255,255,0.85)', fontFamily: TH.fonts.semibold, fontSize: 13 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, minHeight: 36 },
  value: { color: '#FFF', fontFamily: TH.fonts.bold, fontSize: 32, lineHeight: 38 },
  inr: { color: 'rgba(255,255,255,0.8)', fontFamily: TH.fonts.medium, fontSize: 12, marginTop: 2 },
  earn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: TH.radii.pill, paddingHorizontal: 16, height: 40 },
  earnText: { color: '#2A1A00', fontFamily: TH.fonts.bold, fontSize: 14 },
});
