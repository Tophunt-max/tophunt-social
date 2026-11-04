/**
 * Real discount next to a price: the admin's compare-at price struck through
 * and "-X%" (whole percent, rounded down). Renders nothing unless the listing
 * has a compare-at price above its price (shopModel discountOf), and nothing
 * for owned items. Display only: the server always charges priceCoins.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { discountOf } from '@/src/lib/shopModel';
import { BRAND, TH } from '@/src/theme/tophunt';

export function DiscountTag({
  item, size, color = TH.colors.sub, showWas = true, showPercent = true,
}: {
  item: { priceCoins: number; compareAtCoins?: number | null; owned?: boolean };
  size: number;
  color?: string;
  showWas?: boolean;
  showPercent?: boolean;
}) {
  const pct = item.owned ? 0 : discountOf(item);
  if (!pct) return null;
  const was = Number(item.compareAtCoins);
  return (
    <View style={[styles.row, { gap: Math.max(2, size * 0.3) }]} accessible accessibilityLabel={`Pehle ${was.toLocaleString()} DP coin, ${pct}% off`}>
      {showWas ? (
        <Text style={[styles.was, { fontSize: size, color }]} numberOfLines={1}>{was.toLocaleString()}</Text>
      ) : null}
      {showPercent ? (
        <View style={[styles.pill, { borderRadius: size, paddingHorizontal: Math.max(2, size * 0.35) }]}>
          <Text style={[styles.pct, { fontSize: size * 0.92 }]} numberOfLines={1}>-{pct}%</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  was: { fontFamily: TH.fonts.medium, textDecorationLine: 'line-through', flexShrink: 1 },
  pill: { backgroundColor: BRAND },
  pct: { color: '#FFF', fontFamily: TH.fonts.bold },
});
