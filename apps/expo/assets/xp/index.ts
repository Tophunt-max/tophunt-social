import type { ImageSourcePropType } from 'react-native';

export type XpArtKind = 'frame' | 'theme' | 'badge' | 'title' | 'sticker' | 'collectible' | 'effect';

export interface XpArt {
  kind: XpArtKind;
  source: ImageSourcePropType;
}

/** Static cosmetics earned through XP milestones and achievements. */
export const XP_ART: Record<string, XpArt> = {
  'xp.frame_bronze': { kind: 'frame', source: require('./frames/bronze.webp') },
  'xp.frame_silver': { kind: 'frame', source: require('./frames/silver.webp') },
  'xp.frame_gold_pulse': { kind: 'frame', source: require('./frames/gold_pulse.webp') },
  'xp.frame_champion': { kind: 'frame', source: require('./frames/champion.webp') },
  'xp.frame_diamond_aura': { kind: 'frame', source: require('./frames/diamond_aura.webp') },
  'xp.frame_legendary': { kind: 'frame', source: require('./frames/legendary.webp') },

  'xp.theme_midnight': { kind: 'theme', source: require('./themes/midnight.webp') },
  'xp.theme_royal': { kind: 'theme', source: require('./themes/royal.webp') },

  'xp.badge_rare_creator': { kind: 'badge', source: require('./badges/rare_creator.webp') },

  'xp.title_creator': { kind: 'title', source: require('./titles/creator.webp') },
  'xp.title_champion': { kind: 'title', source: require('./titles/champion.webp') },
  'xp.title_legend': { kind: 'title', source: require('./titles/legend.webp') },

  'xp.sticker_first_win': { kind: 'sticker', source: require('./stickers/first_win.webp') },
  'xp.sticker_streak_30': { kind: 'sticker', source: require('./stickers/streak_30.webp') },

  'xp.collectible_season_star': { kind: 'collectible', source: require('./collectibles/season_star.webp') },
  'xp.collectible_elite_set': { kind: 'collectible', source: require('./collectibles/elite_set.webp') },
  'xp.collectible_season_top': { kind: 'collectible', source: require('./collectibles/season_top.webp') },

  'xp.effect_legend_burst': { kind: 'effect', source: require('./effects/legend_burst.webp') },
};
