/**
 * Shop → My Collection, phone layout of the design mock: the "Free
 * Collection / DP Coin Collection" toggle, the filter chips (All, Frames,
 * Themes, Badges, Titles, Effects), and a section per type (Avatar Frames,
 * Profile Themes, Badges, Titles, Effects) with 6 cells in a row — art, a
 * green Equipped check, and the bottom pill (Equipped / Free with the cyan
 * diamond / Owned or DP price with the coin). "View All" expands the section
 * to its full grid in place.
 *
 * Every length is `mock px * u` (u = width / 340, premium/mock.ts). What each
 * cell shows comes from src/lib/collectionHomeModel.ts (real inventory,
 * equip flags and live store prices only). Tapping an owned cell equips /
 * removes it (useEquipCosmetic); tapping a store cell opens its item page.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ArrowIcon } from '@/src/components/ui/ArrowIcon';
import { CoinIcon } from '@/src/components/ui/CoinIcon';
import { DiamondIcon } from '@/src/components/ui/DiamondIcon';
import { emitToast } from '@/src/lib/toastBridge';
import { COLLECTION_ROW_MAX, type CollectionCell, type CollectionMode, type CollectionSection } from '@/src/lib/collectionHomeModel';
import { useEquipCosmetic } from '@/src/services/gamification';
import {
  BRAND,
  BRAND_BUTTON,
  SHOP_VIOLET,
  TH,
  type TophuntPalette,
} from '@/src/theme/tophunt';
import { cellWidth, mfont, px } from '../premium/mock';
import { ItemArt } from '../premium/ProductPreview';
import { BadgeIcon, CrownIcon, FrameArt, VioletCrownIcon } from '../premium/ShopArt';
import { lavenderShadow, shopBorder } from '../premium/surface';
import { ShopIcon } from '@/src/components/shop/ShopIcon';

const WHITE = TH.colors.white;
const GREEN: [string, string] = ['#22C55E', '#16A34A'];

/** Geometry of the My Collection mock (mock px at 340 wide; cell widths come from cellWidth). */
export const COLLECTION_M = {
  /** Free / DP Coin mode toggle (two big cards). */
  toggle: { h: 46, radius: 12, icon: 20, title: 12, sub: 8.5, gap: 7 },
  /** Filter chips row. */
  chip: { h: 26, radius: 13, icon: 11, text: 9.5, gap: 6 },
  /** Type section: header + one row of 6 cells (or the expanded grid). */
  section: { icon: 15, title: 13, link: 10 },
  /** Item cell: art, equipped check and the bottom pill. */
  cell: { cols: 6, gap: 5, h: 62, radius: 10, art: 30, artThemeH: 24, artTitleH: 15, pill: 13, pillText: 6.5, pillIcon: 10.5, check: 12 },
} as const;

/** Extra touch area so a control shorter than 44 pt still gets a 44 pt target. */
const slop = (h: number) => {
  const v = Math.max(0, Math.ceil((44 - h) / 2));
  return { top: v, bottom: v, left: 8, right: 8 };
};

// ------------------------------------------------------------------ mode toggle

/** The "Free Collection / DP Coin Collection" switch of the mock: the active side is a pink gradient card. */
export function CollectionModeToggle({ p, u, width, mode, onChange }: { p: TophuntPalette; u: number; width: number; mode: CollectionMode; onChange: (m: CollectionMode) => void }) {
  const T = COLLECTION_M.toggle;
  const gap = px(T.gap, u);
  const w = (width - gap) / 2;
  const h = px(T.h, u);
  const r = px(T.radius, u);
  const side = (key: CollectionMode, icon: React.ReactNode, title: string, sub: string) => {
    const on = mode === key;
    const inner = (
      <>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.toggleTitle, { fontSize: mfont(T.title, u), color: on ? WHITE : p.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
          <Text style={[styles.toggleSub, { fontSize: mfont(T.sub, u), color: on ? '#FFE3EC' : p.sub }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sub}</Text>
        </View>
      </>
    );
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onChange(key)}
        activeOpacity={0.88}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${title}: ${sub}`}
        style={{ width: w, height: h, borderRadius: r }}
      >
        {on ? (
          <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.toggleSide, { width: w, height: h, borderRadius: r, gap: px(6, u), paddingHorizontal: px(9, u) }]}>{inner}</LinearGradient>
        ) : (
          <View style={[styles.toggleSide, { width: w, height: h, borderRadius: r, gap: px(6, u), paddingHorizontal: px(9, u), backgroundColor: p.card, borderColor: shopBorder(p), borderWidth: 1 }, lavenderShadow(p)]}>{inner}</View>
        )}
      </TouchableOpacity>
    );
  };
  return (
    <View style={[styles.row, { width, gap }]} accessibilityRole="tablist">
      {side('free', <DiamondIcon size={px(T.icon + 4, u)} />, 'Free Collection', 'Earned / Unlocked (Free)')}
      {side('dp', <CrownIcon size={px(T.icon, u)} />, 'DP Coin Collection', 'Purchased with DP Coin')}
    </View>
  );
}

// ------------------------------------------------------------------ filter chips

const CHIP_ICONS: Record<string, (size: number, color: string) => React.ReactNode> = {
  all: (s, c) => <ShopIcon name="uiLayoutGrid" size={s} color={c} />,
  frame: (s, c) => <FrameArt width={s} height={s * 0.85} />,
  theme: (s, c) => <ShopIcon name="uiLayers" size={s} color={c} />,
  badge: (s, _c) => <BadgeIcon size={s} />,
  title: (s, c) => <CrownIcon size={s} />,
  effect: (s, c) => <ShopIcon name="uiSparkles" size={s} color={c} />,
};

/** Filter chips (All, Frames, Themes, Badges, Titles, Effects): the active one is a pink pill. */
export function CollectionChips({ p, u, active, onPick }: { p: TophuntPalette; u: number; active: string; onPick: (type: string) => void }) {
  const C = COLLECTION_M.chip;
  const h = px(C.h, u);
  const fs = mfont(C.text, u);
  const chips: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'frame', label: 'Frames' },
    { key: 'theme', label: 'Themes' },
    { key: 'badge', label: 'Badges' },
    { key: 'title', label: 'Titles' },
    { key: 'effect', label: 'Effects' },
  ];
  return (
    <View style={[styles.row, { gap: px(C.gap, u), flexWrap: 'wrap' }]} accessibilityRole="tablist">
      {chips.map((c) => {
        const on = active === c.key;
        const color = on ? WHITE : p.text;
        const icon = CHIP_ICONS[c.key]?.(px(C.icon, u), color);
        const content = (
          <>
            {icon}
            <Text style={[styles.chipText, { fontSize: fs, color }]} numberOfLines={1}>{c.label}</Text>
          </>
        );
        return (
          <TouchableOpacity
            key={c.key}
            onPress={() => onPick(c.key)}
            activeOpacity={0.85}
            hitSlop={slop(h)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${c.label} section${on ? ', active' : ''}`}
          >
            {on ? (
              <LinearGradient colors={BRAND_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chip, { height: h, borderRadius: h / 2, gap: px(3, u), paddingHorizontal: px(9, u) }]}>{content}</LinearGradient>
            ) : (
              <View style={[styles.chip, { height: h, borderRadius: h / 2, gap: px(3, u), paddingHorizontal: px(9, u), backgroundColor: p.card, borderColor: shopBorder(p), borderWidth: 1 }]}>{content}</View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ item cell

/** Bottom pill of a cell: Equipped (green), Free (cyan diamond), Owned / DP price (gold coin). */
function CellPill({ cell, u }: { cell: CollectionCell; u: number }) {
  const C = COLLECTION_M.cell;
  const h = px(C.pill, u);
  const fs = mfont(C.pillText, u);
  const icon = px(C.pillIcon, u);
  if (cell.state === 'equipped') {
    return (
      <LinearGradient colors={GREEN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cellPill, { height: h, borderRadius: h / 2, paddingHorizontal: px(6, u) }]} pointerEvents="none">
        <Text style={[styles.pillText, { fontSize: fs, color: WHITE }]} numberOfLines={1}>Equipped</Text>
      </LinearGradient>
    );
  }
  if (cell.state === 'owned-free' || cell.state === 'buy-free') {
    return (
      <View style={[styles.cellPill, styles.pillLight, { height: h, borderRadius: h / 2, paddingHorizontal: px(5, u), gap: px(2, u) }]} pointerEvents="none">
        <DiamondIcon size={icon} />
        <Text style={[styles.pillText, { fontSize: fs, color: TH.colors.electric }]} numberOfLines={1}>Free</Text>
      </View>
    );
  }
  if (cell.state === 'owned-dp') {
    return (
      <View style={[styles.cellPill, styles.pillLight, { height: h, borderRadius: h / 2, paddingHorizontal: px(5, u), gap: px(2, u) }]} pointerEvents="none">
        <CoinIcon size={icon} />
        <Text style={[styles.pillText, { fontSize: fs, color: '#B45309' }]} numberOfLines={1}>Owned</Text>
      </View>
    );
  }
  return (
    <View style={[styles.cellPill, styles.pillLight, { height: h, borderRadius: h / 2, paddingHorizontal: px(4, u), gap: px(2, u) }]} pointerEvents="none">
      <CoinIcon size={icon} />
      <Text style={[styles.pillText, { fontSize: fs, color: '#B45309' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`DP${(cell.priceCoins ?? 0).toLocaleString()}`}</Text>
    </View>
  );
}

/** One cell: the item art, a green check when equipped, and the bottom pill. Owned cells equip on tap; store cells open the item page. */
export const CollectionCellM = React.memo(function CollectionCellM({
  p, cell, u, width, busy, onOpen, onEquip,
}: {
  p: TophuntPalette;
  cell: CollectionCell;
  u: number;
  width: number;
  busy: boolean;
  onOpen: (id: string) => void;
  onEquip: (cell: CollectionCell) => void;
}) {
  const C = COLLECTION_M.cell;
  const h = px(C.h, u);
  const r = px(C.radius, u);
  const check = px(C.check, u);
  const owned = cell.state !== 'buy' && cell.state !== 'buy-free';
  const artH = cell.type === 'theme' ? px(C.artThemeH, u) : cell.type === 'title' ? px(C.artTitleH, u) : px(C.art, u);
  const a11y =
    cell.state === 'equipped'
      ? `${cell.name}, equipped. Remove karo`
      : owned
        ? `${cell.name}, collection mein hai. Equip karo`
        : cell.state === 'buy-free'
          ? `${cell.name}, free. Shop mein dekho`
          : `${cell.name}, ${(cell.priceCoins ?? 0).toLocaleString()} DP coin. Shop mein dekho`;
  return (
    <Pressable
      onPress={() => (owned ? onEquip(cell) : onOpen(cell.id))}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[{ width, height: h, borderRadius: r, backgroundColor: p.card, borderColor: cell.state === 'equipped' ? '#22C55E' : shopBorder(p), borderWidth: cell.state === 'equipped' ? 1.5 : 1, overflow: 'visible' }, lavenderShadow(p)]}
    >
      <View style={[styles.cellBody, { borderRadius: r, paddingTop: px(5, u), paddingBottom: px(4, u), gap: px(3, u) }]}>
        <View pointerEvents="none">
          <ItemArt item={{ ...cell, itemId: cell.id } as any} width={width - px(8, u)} height={artH} />
        </View>
        <CellPill cell={cell} u={u} />
      </View>
      {cell.state === 'equipped' ? (
        <LinearGradient colors={GREEN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cellCheck, { width: check, height: check, borderRadius: check / 2, top: -check * 0.3, right: -check * 0.3, borderColor: p.bg }]} pointerEvents="none">
          <ShopIcon name="uiCheck" size={check * 0.66} color={WHITE} />
        </LinearGradient>
      ) : null}
    </Pressable>
  );
});

// ------------------------------------------------------------------ section

const SECTION_ICON: Record<string, (size: number) => React.ReactNode> = {
  frame: (s) => <FrameArt width={s} height={s * 0.85} />,
  theme: (s) => <ShopIcon name="uiLayers" size={s} color={BRAND} />,
  badge: (s) => <BadgeIcon size={s} />,
  title: (s) => <CrownIcon size={s} />,
  effect: (s) => <ShopIcon name="uiSparkles" size={s} color={BRAND} />,
};

/** A type section: icon + "Avatar Frames (24)" + "View All →", one row of 6 cells; View All expands to the full grid. */
export function CollectionSectionM({
  p, u, inner, section, expanded, onToggleExpand, busyId, onOpen, onEquip,
}: {
  p: TophuntPalette;
  u: number;
  inner: number;
  section: CollectionSection;
  expanded: boolean;
  onToggleExpand: (type: string) => void;
  busyId: string | null;
  onOpen: (id: string) => void;
  onEquip: (cell: CollectionCell) => void;
}) {
  const S = COLLECTION_M.section;
  const C = COLLECTION_M.cell;
  const gap = px(C.gap, u);
  const w = cellWidth(inner, C.cols, gap);
  const link = p.isDark ? '#A78BFA' : SHOP_VIOLET;
  const linkFs = mfont(S.link, u);
  const items = expanded ? section.all : section.row;
  const rows: CollectionCell[][] = [];
  for (let k = 0; k < items.length; k += C.cols) rows.push(items.slice(k, k + C.cols));
  return (
    <View>
      <View style={[styles.rowCenter, { height: px(20, u), gap: px(5, u) }]}>
        {SECTION_ICON[section.type]?.(px(S.icon, u))}
        <Text style={[styles.sectionTitle, { fontSize: mfont(S.title, u), color: p.text }]} numberOfLines={1} accessibilityRole="header">{`${section.title} (${section.count})`}</Text>
        <View style={{ flex: 1 }} />
        {section.count > COLLECTION_ROW_MAX ? (
          <TouchableOpacity onPress={() => onToggleExpand(section.type)} hitSlop={slop(linkFs * 1.4)} accessibilityRole="button" accessibilityLabel={`${section.title}: ${expanded ? 'kam dikhao' : 'sab dikhao'}`} style={styles.rowCenter}>
            <Text style={[styles.link, { fontSize: linkFs, color: link }]}>{expanded ? 'Show Less' : 'View All'}</Text>
            <ArrowIcon variant="arrow" direction="right" size={linkFs} color={link} style={expanded ? { transform: [{ rotate: '-90deg' }] } : undefined} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={{ marginTop: px(6, u), gap }}>
        {rows.map((row, k) => (
          <View key={k} style={[styles.row, { gap }]}>
            {row.map((cell) => (
              <CollectionCellM key={cell.id} p={p} cell={cell} u={u} width={w} busy={busyId === cell.id} onOpen={onOpen} onEquip={onEquip} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ the page body

export interface CollectionHomeProps {
  p: TophuntPalette;
  u: number;
  inner: number;
  mode: CollectionMode;
  sections: CollectionSection[];
  /** Active filter chip ('all' or a type). */
  chip: string;
  expanded: Record<string, boolean>;
  onMode: (m: CollectionMode) => void;
  onChip: (type: string) => void;
  onToggleExpand: (type: string) => void;
  onOpenItem: (id: string) => void;
}

/** The My Collection body: toggle, chips and the type sections. Equip / remove runs here (one cell busy at a time). */
export function CollectionHomeMobile({ p, u, inner, mode, sections, chip, expanded, onMode, onChip, onToggleExpand, onOpenItem }: CollectionHomeProps) {
  const equip = useEquipCosmetic();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const gap = px(12, u);
  const onEquip = React.useCallback(
    (cell: CollectionCell) => {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setBusyId(cell.id);
      equip.mutate(
        { slot: cell.type, itemId: cell.state === 'equipped' ? null : cell.id },
        {
          onSuccess: () => emitToast(cell.state === 'equipped' ? `${cell.name} removed` : `${cell.name} equipped`, 'success'),
          onError: (e: any) => emitToast(e?.message || 'Could not equip this item.', 'error'),
          onSettled: () => setBusyId(null),
        },
      );
    },
    [equip],
  );
  return (
    <View>
      <CollectionModeToggle p={p} u={u} width={inner} mode={mode} onChange={onMode} />
      <View style={{ marginTop: gap }}>
        <CollectionChips p={p} u={u} active={chip} onPick={onChip} />
      </View>
      {sections.length ? (
        sections.map((s) => (
          <View key={s.type} style={{ marginTop: gap + px(2, u) }}>
            <CollectionSectionM p={p} u={u} inner={inner} section={s} expanded={!!expanded[s.type]} onToggleExpand={onToggleExpand} busyId={busyId} onOpen={onOpenItem} onEquip={onEquip} />
          </View>
        ))
      ) : (
        <View style={[styles.empty, { marginTop: gap * 2, backgroundColor: p.card, borderColor: shopBorder(p) }]}>
          <VioletCrownIcon size={px(28, u)} />
          <Text style={[styles.emptyTitle, { color: p.text, fontSize: mfont(12.5, u) }]}>{mode === 'dp' ? 'Abhi koi DP coin item nahi' : 'Collection khaali hai'}</Text>
          <Text style={[styles.emptySub, { color: p.sub, fontSize: mfont(9.5, u) }]}>{mode === 'dp' ? 'Shop se DP coin se items kharido, wo yahan dikhenge.' : 'Free rewards earn karo ya Shop dekho — items yahan dikhenge.'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  toggleSide: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  toggleTitle: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  toggleSub: { fontFamily: TH.fonts.semibold, flexShrink: 1, marginTop: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  cellBody: { flex: 1, alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  cellPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  pillLight: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0E9FB' },
  pillText: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  cellCheck: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  sectionTitle: { fontFamily: TH.fonts.bold, flexShrink: 1 },
  link: { fontFamily: TH.fonts.bold, marginRight: 2 },
  empty: { alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 22, paddingHorizontal: 20, gap: 6 },
  emptyTitle: { fontFamily: TH.fonts.bold, textAlign: 'center' },
  emptySub: { fontFamily: TH.fonts.medium, textAlign: 'center' },
});
