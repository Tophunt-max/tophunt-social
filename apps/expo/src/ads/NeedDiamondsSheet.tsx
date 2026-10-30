/**
 * Shown when a contest entry fee is more than the user's Diamonds: offers a
 * rewarded ad right there (slot `contest_join_rewarded`), or the Earn page.
 * The reward is paid by the server (AdMob SSV / web watch token).
 */
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { Ionicons } from '@/src/lib/icons';
import { useRewardedAd } from './fullscreen';

export function NeedDiamondsSheet({
  visible,
  fee,
  have,
  isDark,
  onClose,
  onRewarded,
}: {
  visible: boolean;
  fee: number;
  have: number;
  isDark: boolean;
  onClose: () => void;
  /** Called after a rewarded ad paid out (refetch the balance here). */
  onRewarded?: () => void;
}) {
  const router = useRouter();
  const ad = useRewardedAd('contest_join_rewarded', onRewarded);
  const short = Math.max(0, fee - have);
  const card = isDark ? '#1B1D26' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#121212';
  const sub = isDark ? '#A0A3AD' : '#6B6B72';
  const canAd = ad.enabled && ad.left > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.back} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: card }]} onPress={() => undefined}>
          <LinearGradient colors={['#FF4D67', '#8B5CF6']} style={styles.icon}>
            <DiamondIcon size={28} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.title, { color: text }]}>Diamond kam hain</Text>
          <Text style={[styles.body, { color: sub }]}>
            Entry ke liye {fee} Diamond chahiye, aapke paas {have} hain. {short} aur chahiye.
          </Text>

          {canAd ? (
            <TouchableOpacity onPress={() => void ad.watch()} disabled={ad.busy} activeOpacity={0.85} accessibilityRole="button" style={{ alignSelf: 'stretch' }}>
              <LinearGradient colors={['#FF4D67', '#FF8A4D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                {ad.busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="play" size={16} color="#FFF" />
                    <Text style={styles.ctaText}>Ad dekho · +{ad.reward}</Text>
                    <DiamondIcon size={14} color="#FFF" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
          {canAd ? <Text style={[styles.note, { color: sub }]}>Aaj {ad.left} ad baaki</Text> : null}

          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push('/earn' as any);
            }}
            style={[styles.ghost, { borderColor: isDark ? '#2E3140' : '#E5E7EB' }]}
            accessibilityRole="button"
          >
            <Ionicons name="gift" size={16} color={text} />
            <Text style={[styles.ghostText, { color: text }]}>Earn page: check-in, tasks aur aur tareeke</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 380, borderRadius: 26, padding: 22, gap: 12, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Urbanist-Black', fontSize: 20, textAlign: 'center' },
  body: { fontFamily: 'Urbanist-Medium', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 50, borderRadius: 16 },
  ctaText: { color: '#FFF', fontFamily: 'Urbanist-Bold', fontSize: 15 },
  note: { fontFamily: 'Urbanist-SemiBold', fontSize: 12, marginTop: -4 },
  ghost: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12 },
  ghostText: { fontFamily: 'Urbanist-SemiBold', fontSize: 13, flexShrink: 1, textAlign: 'center' },
});
