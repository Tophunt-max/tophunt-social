/**
 * Item detail info blocks: name / type · rarity / description, the price
 * card (price, real compare-at discount, the viewer's DP coin balance and the
 * shortfall), and availability chips that appear only for real listing
 * signals (stock left, a live sale-end countdown, a future sale start).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { useCoinRate } from '@/src/hooks/useCoinRate';
import { useCountdown } from '@/src/hooks/useCountdown';
import { coinsInInr } from '@/src/lib/coinValue';
import { Ionicons } from '@/src/lib/icons';
import { availability, coinsShort } from '@/src/lib/shopItemModel';
import { TYPE_SINGULAR, discountOf } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { BRAND, TH, rarityToken, type TophuntPalette } from '@/src/theme/tophunt';
import { cardShadow } from '@/src/components/shop/premium/surface';

export function ItemTitleBlock({ item, p }: { item: StoreItemView; p: TophuntPalette }) {
  const t = rarityToken(item.rarity);
  // Rarity colours are tuned for dark; darken the pale ones a touch on light surfaces.
  const rarityColor = !p.isDark && t.id === 'legendary' ? TH.colors.goldDeep : t.color;
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.name, { color: p.text }]} accessibilityRole="header">{item.name}</Text>
      <Text style={styles.meta}>
        <Text style={{ color: p.sub }}>{TYPE_SINGULAR[item.type] ?? item.type}</Text>
        <Text style={{ color: p.sub }}>{'  ·  '}</Text>
        <Text style={{ color: rarityColor }}>{t.label}</Text>
      </Text>
      {item.description ? <Text style={[styles.desc, { color: p.sub }]}>{item.description}</Text> : null}
    </View>
  );
}

export function ItemPriceCard({ item, p, live, dpcoin }: { item: StoreItemView; p: TophuntPalette; live: boolean; dpcoin: number }) {
  const rate = useCoinRate();
  const pct = discountOf(item);
  const was = pct > 0 ? Number(item.compareAtCoins) : null;
  const need = item.owned ? null : coinsShort(dpcoin, item.priceCoins, live);
  const inr = item.owned ? null : coinsInInr(item.priceCoins, rate);
  return (
    <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}>
      {item.owned ? (
        <View style={styles.row}>
          <Ionicons name="checkmark-circle" size={22} color={TH.colors.success} />
          <Text style={[styles.owned, { color: TH.colors.success }]}>Aapke collection mein hai</Text>
        </View>
      ) : (
        <>
          <View style={[styles.row, { flexWrap: 'wrap' }]} accessible accessibilityLabel={`Price ${item.priceCoins} DP coin${was ? `, pehle ${was}, ${pct} percent off` : ''}`}>
            <CoinIcon size={26} />
            <Text style={[styles.price, { color: p.text }]}>{item.priceCoins.toLocaleString()}</Text>
            <Text style={[styles.unit, { color: p.sub }]}>DP coin</Text>
            {was ? <Text style={[styles.was, { color: p.sub }]}>{was.toLocaleString()}</Text> : null}
            {was ? (
              <View style={[styles.off, { backgroundColor: `${TH.colors.success}22` }]}>
                <Text style={[styles.offText, { color: TH.colors.success }]}>-{pct}%</Text>
              </View>
            ) : null}
          </View>
          {inr ? <Text style={[styles.inr, { color: p.sub }]}>{inr}</Text> : null}
        </>
      )}
      <View style={[styles.divider, { backgroundColor: p.border }]} />
      <View style={styles.balRow}>
        <Text style={[styles.balLabel, { color: p.sub }]}>Aapke DP coin:</Text>
        {live ? (
          <View style={styles.row}>
            <CoinIcon size={14} />
            <Text style={[styles.balValue, { color: p.text }]}>{dpcoin.toLocaleString()}</Text>
          </View>
        ) : (
          <Skeleton width={48} height={14} borderRadius={7} />
        )}
      </View>
      {need ? (
        <View style={[styles.need, { backgroundColor: `${BRAND}14` }]} accessibilityLiveRegion="polite">
          <Ionicons name="lock-closed" size={13} color={BRAND} />
          <Text style={[styles.needText, { color: BRAND }]}>{need.toLocaleString()} DP coin aur chahiye</Text>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ p, icon, text, tint }: { p: TophuntPalette; icon: string; text: string; tint?: string }) {
  const c = tint ?? p.text;
  return (
    <View style={[styles.chip, { backgroundColor: tint ? `${tint}1F` : p.cardAlt }]} accessible accessibilityLabel={text}>
      <Ionicons name={icon} size={13} color={c} />
      <Text style={[styles.chipText, { color: c }]}>{text}</Text>
    </View>
  );
}

/** Stock / sale-end / coming-soon chips; renders nothing without a real signal. */
export function ItemAvailability({ item, p, now }: { item: StoreItemView; p: TophuntPalette; now: number }) {
  const a = availability(item, now);
  const sale = useCountdown(a.saleEndsAt);
  const saleLabel = a.saleEndsAt && sale.label && !sale.ended ? sale.label : null;
  if (a.stockLeft === null && !saleLabel && a.startsAt === null) return null;
  return (
    <View style={styles.chips}>
      {a.startsAt !== null ? <Chip p={p} icon="calendar-outline" text="Coming soon" tint={TH.colors.electric} /> : null}
      {a.stockLeft !== null ? <Chip p={p} icon="cube-outline" text={`Sirf ${a.stockLeft.toLocaleString()} bache`} /> : null}
      {saleLabel ? <Chip p={p} icon="time" text={`Sale ${saleLabel} mein khatam`} tint={BRAND} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: TH.fonts.bold, fontSize: 24, lineHeight: 30 },
  meta: { fontFamily: TH.fonts.semibold, fontSize: 13.5 },
  desc: { fontFamily: TH.fonts.medium, fontSize: 14, lineHeight: 20, marginTop: 2 },
  card: { borderRadius: TH.radii.lg, borderWidth: 1, padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  price: { fontFamily: TH.fonts.bold, fontSize: 30, lineHeight: 36 },
  unit: { fontFamily: TH.fonts.semibold, fontSize: 13, marginTop: 6 },
  was: { fontFamily: TH.fonts.medium, fontSize: 14, textDecorationLine: 'line-through', marginLeft: 4, marginTop: 4 },
  off: { borderRadius: TH.radii.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  offText: { fontFamily: TH.fonts.bold, fontSize: 12 },
  owned: { fontFamily: TH.fonts.bold, fontSize: 17 },
  inr: { fontFamily: TH.fonts.medium, fontSize: 12 },
  divider: { height: 1, marginVertical: 4 },
  balRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  balLabel: { fontFamily: TH.fonts.semibold, fontSize: 13 },
  balValue: { fontFamily: TH.fonts.bold, fontSize: 14 },
  need: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: TH.radii.sm, paddingHorizontal: 10, paddingVertical: 8 },
  needText: { fontFamily: TH.fonts.bold, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: TH.radii.pill, paddingHorizontal: 11, paddingVertical: 7 },
  chipText: { fontFamily: TH.fonts.bold, fontSize: 12.5 },
});
