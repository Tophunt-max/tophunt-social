import React, { memo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { AppImage } from '@/src/components/ui/AppImage';
import { recordSponsoredEvent } from '@/src/services/monetization';
import type { SponsoredRow } from '@/src/lib/adSlots';

/**
 * A direct brand campaign in the feed. Always labelled with the campaign's
 * paid-content disclosure (server-validated, e.g. "Sponsored"), visually
 * distinct from battles, and with one clear call to action: no fake close
 * buttons and nothing that triggers on scroll.
 */
export const SponsoredCard = memo(function SponsoredCard({
  row,
  isDark,
  visible,
  countable,
}: {
  row: SponsoredRow;
  isDark: boolean;
  /** On screen now (from the feed's viewability). */
  visible: boolean;
  /** Signed-in viewers only; guests are not counted. */
  countable: boolean;
}) {
  const { campaign } = row;
  const c = campaign.creative;
  useEffect(() => {
    if (visible && countable) recordSponsoredEvent(campaign.id, 'impression');
  }, [visible, countable, campaign.id]);

  const open = () => {
    if (countable) recordSponsoredEvent(campaign.id, 'click');
    if (/^https:\/\//i.test(c.ctaUrl)) Linking.openURL(c.ctaUrl).catch(() => undefined);
  };

  const card = isDark ? '#1F222A' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#9BA1A6' : '#6B7280';
  return (
    <View style={[styles.card, { backgroundColor: card, borderColor: isDark ? '#2A2D35' : '#ECEEF2' }]} accessibilityLabel={`${campaign.disclosure}: ${c.headline}, by ${campaign.advertiser}`}>
      <View style={styles.header}>
        <Text style={[styles.advertiser, { color: text }]} numberOfLines={1}>{campaign.advertiser}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{campaign.disclosure}</Text>
        </View>
      </View>
      {c.imageUrl ? (
        <TouchableOpacity activeOpacity={0.9} onPress={open} accessibilityRole="link" accessibilityLabel={c.ctaLabel}>
          <AppImage source={{ uri: c.imageUrl }} style={styles.image} contentFit="cover" />
        </TouchableOpacity>
      ) : null}
      <View style={styles.body}>
        <Text style={[styles.headline, { color: text }]} numberOfLines={2}>{c.headline}</Text>
        {c.body ? <Text style={[styles.copy, { color: sub }]} numberOfLines={3}>{c.body}</Text> : null}
        <TouchableOpacity style={styles.cta} onPress={open} accessibilityRole="link">
          <Text style={styles.ctaText}>{c.ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 10, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  advertiser: { fontFamily: 'Urbanist-Bold', fontSize: 15, flexShrink: 1 },
  badge: { backgroundColor: '#FFF4D6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#8A5A00', fontFamily: 'Urbanist-Bold', fontSize: 11 },
  image: { width: '100%', aspectRatio: 1.6 },
  body: { padding: 14, gap: 6 },
  headline: { fontFamily: 'Urbanist-Bold', fontSize: 16 },
  copy: { fontFamily: 'Urbanist-Medium', fontSize: 13 },
  cta: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#FF4D67', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  ctaText: { color: '#FFFFFF', fontFamily: 'Urbanist-Bold', fontSize: 13 },
});
