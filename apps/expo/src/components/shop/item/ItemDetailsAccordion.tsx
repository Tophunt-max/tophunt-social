/**
 * "Details": collapsible rows (equip where, ownership, refund, cosmetic only)
 * with the same copy the item screen always had. The open / close is a
 * LayoutAnimation ease, skipped under reduced motion.
 */
import React, { useCallback, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { Ionicons } from '@/src/lib/icons';
import { EQUIP_WHERE } from '@/src/lib/shopModel';
import type { StoreItemView } from '@/src/services/monetization';
import { BRAND, TH, type TophuntPalette } from '@/src/theme/tophunt';
import { cardShadow } from '@/src/components/shop/premium/surface';
import { SectionTitle } from './ItemRails';

interface Row {
  key: string;
  icon: string;
  title: string;
  text: string;
}

export function detailRows(item: Pick<StoreItemView, 'type' | 'refundable'>): Row[] {
  return [
    { key: 'where', icon: 'sparkles', title: 'Equip kahan hoga', text: EQUIP_WHERE[item.type] ?? 'Aapke profile par.' },
    { key: 'own', icon: 'infinite', title: 'Ownership', text: 'Hamesha ke liye aapka. Kabhi bhi equip ya hata sakte ho.' },
    { key: 'refund', icon: 'shield-checkmark-outline', title: 'Refund', text: item.refundable ? 'Refund support se request kar sakte ho.' : 'Ye item refundable nahi hai.' },
    { key: 'look', icon: 'information-circle-outline', title: 'Sirf look', text: 'Cosmetic hai: votes, fees, prizes ya ranking par koi asar nahi.' },
  ];
}

const AccordionRow = React.memo(function AccordionRow({
  p, row, open, last, onToggle,
}: { p: TophuntPalette; row: Row; open: boolean; last: boolean; onToggle: (key: string) => void }) {
  const toggle = useCallback(() => onToggle(row.key), [onToggle, row.key]);
  return (
    <View style={!last && { borderBottomWidth: 1, borderBottomColor: p.border }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={row.title}
        accessibilityHint={open ? 'Band karo' : 'Kholo'}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.75 }]}
      >
        <View style={[styles.icon, { backgroundColor: p.cardAlt }]}>
          <Ionicons name={row.icon} size={15} color={BRAND} />
        </View>
        <Text style={[styles.title, { color: p.text }]}>{row.title}</Text>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ArrowIcon size={14} color={p.sub} direction="right" />
        </View>
      </Pressable>
      {open ? <Text style={[styles.text, { color: p.sub }]}>{row.text}</Text> : null}
    </View>
  );
});

export const ItemDetailsAccordion = React.memo(function ItemDetailsAccordion({ item, p }: { item: StoreItemView; p: TophuntPalette }) {
  const reduce = useReducedMotion();
  // "Equip kahan hoga" starts open: it answers the first question about a cosmetic.
  const [open, setOpen] = useState<Set<string>>(() => new Set(['where']));
  const rows = detailRows(item);
  const onToggle = useCallback(
    (key: string) => {
      if (!reduce) LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
      setOpen((s) => {
        const n = new Set(s);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    },
    [reduce],
  );
  return (
    <View>
      <SectionTitle p={p} title="Details" />
      <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, cardShadow(p)]}>
        {rows.map((r, k) => <AccordionRow key={r.key} p={p} row={r} open={open.has(r.key)} last={k === rows.length - 1} onToggle={onToggle} />)}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: TH.radii.lg, borderWidth: 1, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: TH.fonts.bold, fontSize: 14 },
  text: { fontFamily: TH.fonts.medium, fontSize: 13, lineHeight: 19, paddingLeft: 40, paddingRight: 8, paddingBottom: 12, marginTop: -4 },
});
