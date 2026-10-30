/**
 * Artwork for cosmetics EARNED with XP (level milestones and achievements,
 * migrations 0070/0071, re-keyed by 0077). Catalog rows point here with
 * `asset.key` = `xp.<kind>_<file>`; `src/lib/cosmeticArt.ts` resolves it.
 *
 * "Earned" style: matte metal, engraved notches and the XP seal. Static on
 * purpose: motion is the hallmark of Premium (Shop) items, so an earned item
 * never animates and the two can be told apart at a glance.
 *
 * Geometry is the same contract as assets/shop/digital/index.ts (frames
 * 120×120 with the avatar at r=50, themes 360×140, the rest 48×48). Gradient
 * ids are prefixed `xp…` so they never collide with Shop artwork on web.
 */
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';

import FrameBronze from './frames/bronze.svg';
import FrameSilver from './frames/silver.svg';
import FrameGoldPulse from './frames/gold_pulse.svg';
import FrameChampion from './frames/champion.svg';
import FrameDiamondAura from './frames/diamond_aura.svg';
import FrameLegendary from './frames/legendary.svg';

import ThemeMidnight from './themes/midnight.svg';
import ThemeRoyal from './themes/royal.svg';

import BadgeRareCreator from './badges/rare_creator.svg';

import TitleCreator from './titles/creator.svg';
import TitleChampion from './titles/champion.svg';
import TitleLegend from './titles/legend.svg';

import StickerFirstWin from './stickers/first_win.svg';
import StickerStreak30 from './stickers/streak_30.svg';

import CollectibleSeasonStar from './collectibles/season_star.svg';
import CollectibleEliteSet from './collectibles/elite_set.svg';
import CollectibleSeasonTop from './collectibles/season_top.svg';

import EffectLegendBurst from './effects/legend_burst.svg';

export type XpArtKind = 'frame' | 'theme' | 'badge' | 'title' | 'sticker' | 'collectible' | 'effect';

export const XP_ART: Record<string, { kind: XpArtKind; Art: FC<SvgProps> }> = {
  'xp.frame_bronze': { kind: 'frame', Art: FrameBronze },
  'xp.frame_silver': { kind: 'frame', Art: FrameSilver },
  'xp.frame_gold_pulse': { kind: 'frame', Art: FrameGoldPulse },
  'xp.frame_champion': { kind: 'frame', Art: FrameChampion },
  'xp.frame_diamond_aura': { kind: 'frame', Art: FrameDiamondAura },
  'xp.frame_legendary': { kind: 'frame', Art: FrameLegendary },

  'xp.theme_midnight': { kind: 'theme', Art: ThemeMidnight },
  'xp.theme_royal': { kind: 'theme', Art: ThemeRoyal },

  'xp.badge_rare_creator': { kind: 'badge', Art: BadgeRareCreator },

  'xp.title_creator': { kind: 'title', Art: TitleCreator },
  'xp.title_champion': { kind: 'title', Art: TitleChampion },
  'xp.title_legend': { kind: 'title', Art: TitleLegend },

  'xp.sticker_first_win': { kind: 'sticker', Art: StickerFirstWin },
  'xp.sticker_streak_30': { kind: 'sticker', Art: StickerStreak30 },

  'xp.collectible_season_star': { kind: 'collectible', Art: CollectibleSeasonStar },
  'xp.collectible_elite_set': { kind: 'collectible', Art: CollectibleEliteSet },
  'xp.collectible_season_top': { kind: 'collectible', Art: CollectibleSeasonTop },

  'xp.effect_legend_burst': { kind: 'effect', Art: EffectLegendBurst },
};
