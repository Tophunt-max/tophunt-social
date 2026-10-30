/**
 * Static artwork registry for XP-earned cosmetics.
 *
 * XP40 is the colorful FREE/NORMAL collection with lightweight shared motion.
 * Premium Shop artwork lives in assets/shop/digital and is intentionally not
 * referenced here. Metro needs
 * literal imports/requires, so do not replace these references with paths built
 * at runtime. Legacy migration-0077 keys remain registered below XP40.
 */
import type { FC } from 'react';
import type { ImageSourcePropType } from 'react-native';
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

import FrameDefaultArt from './frames/default/source.svg';
import FrameGreenLeafArt from './frames/green-leaf/source.svg';
import FrameBlueWaveArt from './frames/blue-wave/source.svg';
import FramePinkHeartArt from './frames/pink-heart/source.svg';
import FrameStarLightArt from './frames/star-light/source.svg';
import FrameFireRingArt from './frames/fire-ring/source.svg';
import FrameIceCrystalArt from './frames/ice-crystal/source.svg';
import FrameNatureArt from './frames/nature/source.svg';
import FramePurpleAuraArt from './frames/purple-aura/source.svg';
import FrameRainbowArt from './frames/rainbow/source.svg';
import BadgeNewbieArt from './badges/newbie/source.svg';
import BadgeActiveUserArt from './badges/active-user/source.svg';
import BadgeFirstPostArt from './badges/first-post/source.svg';
import BadgeSupporterArt from './badges/supporter/source.svg';
import BadgeVoterArt from './badges/voter/source.svg';
import BadgeCommenterArt from './badges/commenter/source.svg';
import BadgeSocialArt from './badges/social/source.svg';
import BadgeExplorerArt from './badges/explorer/source.svg';
import BadgeStreakArt from './badges/streak/source.svg';
import BadgeDedicatedArt from './badges/dedicated/source.svg';
import TitleNewMemberArt from './titles/new-member/source.svg';
import TitleRisingUserArt from './titles/rising-user/source.svg';
import TitleCreativeMindArt from './titles/creative-mind/source.svg';
import TitleFriendlySoulArt from './titles/friendly-soul/source.svg';
import TitleActiveUserArt from './titles/active-user/source.svg';
import TitleVoteLoverArt from './titles/vote-lover/source.svg';
import TitleCommentProArt from './titles/comment-pro/source.svg';
import TitleSocialStarArt from './titles/social-star/source.svg';
import TitleContestPlayerArt from './titles/contest-player/source.svg';
import TitleCommunityHeroArt from './titles/community-hero/source.svg';

import FrameGentleGlow from './animations/frame-effects/gentle-glow.svg';
import FrameParticles from './animations/frame-effects/particles.svg';
import FrameRotatingOrnaments from './animations/frame-effects/rotating-ornaments.svg';
import BadgeShine from './animations/badge-effects/shine.svg';
import UnlockBurst from './animations/unlock-effects/burst.svg';
import UnlockConfetti from './animations/unlock-effects/confetti.svg';
import UnlockReveal from './animations/unlock-effects/reveal.svg';

export type XpArtKind = 'frame' | 'theme' | 'badge' | 'title' | 'sticker' | 'collectible' | 'effect';
export type Xp40ArtType = 'frame' | 'theme' | 'badge' | 'title';
export type XpAnimationName =
  | 'frame-gentle-glow'
  | 'frame-particles'
  | 'frame-rotating-ornaments'
  | 'badge-shine'
  | 'unlock-burst'
  | 'unlock-confetti'
  | 'unlock-reveal';

export interface XpAnimationConfig {
  name: XpAnimationName;
  overlay: FC<SvgProps>;
  durationMs: number;
  loop: boolean;
}

export interface Xp40BaseEntry {
  id: string;
  kind: Xp40ArtType;
  type: Xp40ArtType;
  name: string;
  description: string;
  unlockLevel: number;
  source: 'xp';
  collection: 'xp40';
  rarity: 'common';
  preview: ImageSourcePropType;
  animation: XpAnimationConfig;
}

export interface Xp40SvgEntry extends Xp40BaseEntry {
  type: 'frame' | 'badge' | 'title';
  kind: 'frame' | 'badge' | 'title';
  Art: FC<SvgProps>;
  image?: ImageSourcePropType;
  /** Titles use the SVG as a full-width plate behind dynamic app text. */
  layout?: 'nameplate';
}

export interface Xp40ThemeEntry extends Xp40BaseEntry {
  type: 'theme';
  kind: 'theme';
  image: ImageSourcePropType;
  Art?: never;
}

export type Xp40Entry = Xp40SvgEntry | Xp40ThemeEntry;
export interface LegacyXpArtEntry { kind: XpArtKind; Art: FC<SvgProps> }

const FRAME_ANIMATIONS = {
  glow: { name: 'frame-gentle-glow', overlay: FrameGentleGlow, durationMs: 3200, loop: true },
  particles: { name: 'frame-particles', overlay: FrameParticles, durationMs: 2600, loop: true },
  ornaments: { name: 'frame-rotating-ornaments', overlay: FrameRotatingOrnaments, durationMs: 12000, loop: true },
} as const satisfies Record<string, XpAnimationConfig>;
const BADGE_ANIMATION = { name: 'badge-shine', overlay: BadgeShine, durationMs: 2800, loop: true } as const satisfies XpAnimationConfig;
const BURST_ANIMATION = { name: 'unlock-burst', overlay: UnlockBurst, durationMs: 650, loop: false } as const satisfies XpAnimationConfig;
const CONFETTI_ANIMATION = { name: 'unlock-confetti', overlay: UnlockConfetti, durationMs: 1800, loop: false } as const satisfies XpAnimationConfig;
const REVEAL_ANIMATION = { name: 'unlock-reveal', overlay: UnlockReveal, durationMs: 1100, loop: false } as const satisfies XpAnimationConfig;

/** Artwork layers used by the one-shot level-up reveal. */
export const XP_UNLOCK_EFFECTS = { burst: UnlockBurst, confetti: UnlockConfetti, reveal: UnlockReveal } as const;

export const XP40_ART = {
  'xp40.frame_default': {
    id: 'xp40.frame_default', kind: 'frame', type: 'frame',
    name: 'Default Frame', description: 'A cheerful coral and sunshine ring for every new hunter.', unlockLevel: 0,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameDefaultArt,
    preview: require('./frames/default/thumb.webp'), animation: FRAME_ANIMATIONS.glow,
  },
  'xp40.frame_green_leaf': {
    id: 'xp40.frame_green_leaf', kind: 'frame', type: 'frame',
    name: 'Green Leaf', description: 'Fresh leaves celebrate steady, healthy growth.', unlockLevel: 5,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameGreenLeafArt,
    preview: require('./frames/green-leaf/thumb.webp'), animation: FRAME_ANIMATIONS.ornaments,
  },
  'xp40.frame_blue_wave': {
    id: 'xp40.frame_blue_wave', kind: 'frame', type: 'frame',
    name: 'Blue Wave', description: 'Playful ocean waves flow around the avatar.', unlockLevel: 10,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameBlueWaveArt,
    preview: require('./frames/blue-wave/thumb.webp'), animation: FRAME_ANIMATIONS.particles,
  },
  'xp40.frame_pink_heart': {
    id: 'xp40.frame_pink_heart', kind: 'frame', type: 'frame',
    name: 'Pink Heart', description: 'Warm hearts highlight friendly community energy.', unlockLevel: 15,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FramePinkHeartArt,
    preview: require('./frames/pink-heart/thumb.webp'), animation: FRAME_ANIMATIONS.glow,
  },
  'xp40.frame_star_light': {
    id: 'xp40.frame_star_light', kind: 'frame', type: 'frame',
    name: 'Star Light', description: 'Sunny stars brighten standout moments.', unlockLevel: 20,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameStarLightArt,
    preview: require('./frames/star-light/thumb.webp'), animation: FRAME_ANIMATIONS.ornaments,
  },
  'xp40.frame_fire_ring': {
    id: 'xp40.frame_fire_ring', kind: 'frame', type: 'frame',
    name: 'Fire Ring', description: 'A bold flame circle marks an active streak.', unlockLevel: 25,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameFireRingArt,
    preview: require('./frames/fire-ring/thumb.webp'), animation: FRAME_ANIMATIONS.particles,
  },
  'xp40.frame_ice_crystal': {
    id: 'xp40.frame_ice_crystal', kind: 'frame', type: 'frame',
    name: 'Ice Crystal', description: 'Cool crystal ornaments add a crisp winter edge.', unlockLevel: 30,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameIceCrystalArt,
    preview: require('./frames/ice-crystal/thumb.webp'), animation: FRAME_ANIMATIONS.ornaments,
  },
  'xp40.frame_nature': {
    id: 'xp40.frame_nature', kind: 'frame', type: 'frame',
    name: 'Nature', description: 'Layered greenery celebrates outdoor curiosity.', unlockLevel: 35,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameNatureArt,
    preview: require('./frames/nature/thumb.webp'), animation: FRAME_ANIMATIONS.glow,
  },
  'xp40.frame_purple_aura': {
    id: 'xp40.frame_purple_aura', kind: 'frame', type: 'frame',
    name: 'Purple Aura', description: 'Soft violet orbs create an upbeat cosmic glow.', unlockLevel: 40,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FramePurpleAuraArt,
    preview: require('./frames/purple-aura/thumb.webp'), animation: FRAME_ANIMATIONS.particles,
  },
  'xp40.frame_rainbow': {
    id: 'xp40.frame_rainbow', kind: 'frame', type: 'frame',
    name: 'Rainbow', description: 'A full spectrum arc celebrates joyful expression.', unlockLevel: 50,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: FrameRainbowArt,
    preview: require('./frames/rainbow/thumb.webp'), animation: FRAME_ANIMATIONS.ornaments,
  },

  'xp40.theme_default': {
    id: 'xp40.theme_default', kind: 'theme', type: 'theme',
    name: 'Default Theme', description: 'A lively indigo and coral playground with a calm content panel.', unlockLevel: 0,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/default/theme.webp'),
    preview: require('./themes/default/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.theme_sunny_day': {
    id: 'xp40.theme_sunny_day', kind: 'theme', type: 'theme',
    name: 'Sunny Day', description: 'Blue skies, warm sunshine, and green rolling hills.', unlockLevel: 5,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/sunny-day/theme.webp'),
    preview: require('./themes/sunny-day/thumb.webp'), animation: BURST_ANIMATION,
  },
  'xp40.theme_cherry_blossom': {
    id: 'xp40.theme_cherry_blossom', kind: 'theme', type: 'theme',
    name: 'Cherry Blossom', description: 'Soft pink blossoms frame a peaceful social space.', unlockLevel: 10,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/cherry-blossom/theme.webp'),
    preview: require('./themes/cherry-blossom/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.theme_ocean_wave': {
    id: 'xp40.theme_ocean_wave', kind: 'theme', type: 'theme',
    name: 'Ocean Wave', description: 'Layered turquoise waves bring breezy coastal energy.', unlockLevel: 15,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/ocean-wave/theme.webp'),
    preview: require('./themes/ocean-wave/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.theme_sunset': {
    id: 'xp40.theme_sunset', kind: 'theme', type: 'theme',
    name: 'Sunset', description: 'Golden light settles over colorful rolling silhouettes.', unlockLevel: 20,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/sunset/theme.webp'),
    preview: require('./themes/sunset/thumb.webp'), animation: BURST_ANIMATION,
  },
  'xp40.theme_forest': {
    id: 'xp40.theme_forest', kind: 'theme', type: 'theme',
    name: 'Forest', description: 'Friendly evergreen layers create a grounded woodland scene.', unlockLevel: 25,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/forest/theme.webp'),
    preview: require('./themes/forest/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.theme_night_sky': {
    id: 'xp40.theme_night_sky', kind: 'theme', type: 'theme',
    name: 'Night Sky', description: 'Stars, moonlight, and quiet mountains fill the horizon.', unlockLevel: 30,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/night-sky/theme.webp'),
    preview: require('./themes/night-sky/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.theme_city_lights': {
    id: 'xp40.theme_city_lights', kind: 'theme', type: 'theme',
    name: 'City Lights', description: 'Colorful windows turn the skyline into a playful grid.', unlockLevel: 35,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/city-lights/theme.webp'),
    preview: require('./themes/city-lights/thumb.webp'), animation: CONFETTI_ANIMATION,
  },
  'xp40.theme_cloud_fantasy': {
    id: 'xp40.theme_cloud_fantasy', kind: 'theme', type: 'theme',
    name: 'Cloud Fantasy', description: 'Dreamy clouds float through a soft blue-violet sky.', unlockLevel: 40,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/cloud-fantasy/theme.webp'),
    preview: require('./themes/cloud-fantasy/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.theme_minimal_dark': {
    id: 'xp40.theme_minimal_dark', kind: 'theme', type: 'theme',
    name: 'Minimal Dark', description: 'A clean slate grid keeps attention on profile content.', unlockLevel: 50,
    source: 'xp', collection: 'xp40', rarity: 'common',
    image: require('./themes/minimal-dark/theme.webp'),
    preview: require('./themes/minimal-dark/thumb.webp'), animation: REVEAL_ANIMATION,
  },

  'xp40.badge_newbie': {
    id: 'xp40.badge_newbie', kind: 'badge', type: 'badge',
    name: 'Newbie Badge', description: 'A growing sprout welcomes new community members.', unlockLevel: 0,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeNewbieArt, image: require('./badges/newbie/badge.webp'),
    preview: require('./badges/newbie/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_active_user': {
    id: 'xp40.badge_active_user', kind: 'badge', type: 'badge',
    name: 'Active User Badge', description: 'A bright bolt rewards regular participation.', unlockLevel: 5,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeActiveUserArt, image: require('./badges/active-user/badge.webp'),
    preview: require('./badges/active-user/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_first_post': {
    id: 'xp40.badge_first_post', kind: 'badge', type: 'badge',
    name: 'First Post Badge', description: 'A friendly post bubble marks the first contribution.', unlockLevel: 10,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeFirstPostArt, image: require('./badges/first-post/badge.webp'),
    preview: require('./badges/first-post/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_supporter': {
    id: 'xp40.badge_supporter', kind: 'badge', type: 'badge',
    name: 'Supporter Badge', description: 'A warm heart celebrates encouragement and support.', unlockLevel: 15,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeSupporterArt, image: require('./badges/supporter/badge.webp'),
    preview: require('./badges/supporter/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_voter': {
    id: 'xp40.badge_voter', kind: 'badge', type: 'badge',
    name: 'Voter Badge', description: 'A clear check mark honors community voting.', unlockLevel: 20,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeVoterArt, image: require('./badges/voter/badge.webp'),
    preview: require('./badges/voter/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_commenter': {
    id: 'xp40.badge_commenter', kind: 'badge', type: 'badge',
    name: 'Commenter Badge', description: 'A chat bubble rewards thoughtful conversation.', unlockLevel: 25,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeCommenterArt, image: require('./badges/commenter/badge.webp'),
    preview: require('./badges/commenter/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_social': {
    id: 'xp40.badge_social', kind: 'badge', type: 'badge',
    name: 'Social Badge', description: 'A group symbol celebrates new connections.', unlockLevel: 30,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeSocialArt, image: require('./badges/social/badge.webp'),
    preview: require('./badges/social/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_explorer': {
    id: 'xp40.badge_explorer', kind: 'badge', type: 'badge',
    name: 'Explorer Badge', description: 'A colorful compass rewards discovery.', unlockLevel: 35,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeExplorerArt, image: require('./badges/explorer/badge.webp'),
    preview: require('./badges/explorer/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_streak': {
    id: 'xp40.badge_streak', kind: 'badge', type: 'badge',
    name: 'Streak Badge', description: 'A lively flame recognizes consistent activity.', unlockLevel: 40,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeStreakArt, image: require('./badges/streak/badge.webp'),
    preview: require('./badges/streak/thumb.webp'), animation: BADGE_ANIMATION,
  },
  'xp40.badge_dedicated': {
    id: 'xp40.badge_dedicated', kind: 'badge', type: 'badge',
    name: 'Dedicated Badge', description: 'A bright ribbon marks long-term commitment.', unlockLevel: 50,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: BadgeDedicatedArt, image: require('./badges/dedicated/badge.webp'),
    preview: require('./badges/dedicated/thumb.webp'), animation: BADGE_ANIMATION,
  },

  'xp40.title_new_member': {
    id: 'xp40.title_new_member', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'New Member', description: 'A bright welcome nameplate with a playful spark.', unlockLevel: 0,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleNewMemberArt,
    preview: require('./titles/new-member/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.title_rising_user': {
    id: 'xp40.title_rising_user', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Rising User', description: 'An upward motif celebrates visible progress.', unlockLevel: 5,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleRisingUserArt,
    preview: require('./titles/rising-user/thumb.webp'), animation: BURST_ANIMATION,
  },
  'xp40.title_creative_mind': {
    id: 'xp40.title_creative_mind', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Creative Mind', description: 'A lightbulb motif highlights original ideas.', unlockLevel: 10,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleCreativeMindArt,
    preview: require('./titles/creative-mind/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.title_friendly_soul': {
    id: 'xp40.title_friendly_soul', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Friendly Soul', description: 'A heart motif recognizes positive community spirit.', unlockLevel: 15,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleFriendlySoulArt,
    preview: require('./titles/friendly-soul/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.title_active_user': {
    id: 'xp40.title_active_user', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Active User', description: 'A bolt motif celebrates energetic participation.', unlockLevel: 20,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleActiveUserArt,
    preview: require('./titles/active-user/thumb.webp'), animation: BURST_ANIMATION,
  },
  'xp40.title_vote_lover': {
    id: 'xp40.title_vote_lover', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Vote Lover', description: 'A check motif highlights a keen community voter.', unlockLevel: 25,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleVoteLoverArt,
    preview: require('./titles/vote-lover/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.title_comment_pro': {
    id: 'xp40.title_comment_pro', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Comment Pro', description: 'A chat motif recognizes active conversation.', unlockLevel: 30,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleCommentProArt,
    preview: require('./titles/comment-pro/thumb.webp'), animation: REVEAL_ANIMATION,
  },
  'xp40.title_social_star': {
    id: 'xp40.title_social_star', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Social Star', description: 'A sunny star motif celebrates social connection.', unlockLevel: 35,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleSocialStarArt,
    preview: require('./titles/social-star/thumb.webp'), animation: CONFETTI_ANIMATION,
  },
  'xp40.title_contest_player': {
    id: 'xp40.title_contest_player', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Contest Player', description: 'A flag motif marks an enthusiastic competitor.', unlockLevel: 40,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleContestPlayerArt,
    preview: require('./titles/contest-player/thumb.webp'), animation: BURST_ANIMATION,
  },
  'xp40.title_community_hero': {
    id: 'xp40.title_community_hero', kind: 'title', type: 'title', layout: 'nameplate',
    name: 'Community Hero', description: 'A shield motif honors dependable community impact.', unlockLevel: 50,
    source: 'xp', collection: 'xp40', rarity: 'common',
    Art: TitleCommunityHeroArt,
    preview: require('./titles/community-hero/thumb.webp'), animation: CONFETTI_ANIMATION,
  },

} satisfies Record<string, Xp40Entry>;

export type Xp40Id = keyof typeof XP40_ART;

export const XP40_FRAMES = [
  XP40_ART['xp40.frame_default'],
  XP40_ART['xp40.frame_green_leaf'],
  XP40_ART['xp40.frame_blue_wave'],
  XP40_ART['xp40.frame_pink_heart'],
  XP40_ART['xp40.frame_star_light'],
  XP40_ART['xp40.frame_fire_ring'],
  XP40_ART['xp40.frame_ice_crystal'],
  XP40_ART['xp40.frame_nature'],
  XP40_ART['xp40.frame_purple_aura'],
  XP40_ART['xp40.frame_rainbow'],
] as const;
export const XP40_THEMES = [
  XP40_ART['xp40.theme_default'],
  XP40_ART['xp40.theme_sunny_day'],
  XP40_ART['xp40.theme_cherry_blossom'],
  XP40_ART['xp40.theme_ocean_wave'],
  XP40_ART['xp40.theme_sunset'],
  XP40_ART['xp40.theme_forest'],
  XP40_ART['xp40.theme_night_sky'],
  XP40_ART['xp40.theme_city_lights'],
  XP40_ART['xp40.theme_cloud_fantasy'],
  XP40_ART['xp40.theme_minimal_dark'],
] as const;
export const XP40_BADGES = [
  XP40_ART['xp40.badge_newbie'],
  XP40_ART['xp40.badge_active_user'],
  XP40_ART['xp40.badge_first_post'],
  XP40_ART['xp40.badge_supporter'],
  XP40_ART['xp40.badge_voter'],
  XP40_ART['xp40.badge_commenter'],
  XP40_ART['xp40.badge_social'],
  XP40_ART['xp40.badge_explorer'],
  XP40_ART['xp40.badge_streak'],
  XP40_ART['xp40.badge_dedicated'],
] as const;
export const XP40_TITLES = [
  XP40_ART['xp40.title_new_member'],
  XP40_ART['xp40.title_rising_user'],
  XP40_ART['xp40.title_creative_mind'],
  XP40_ART['xp40.title_friendly_soul'],
  XP40_ART['xp40.title_active_user'],
  XP40_ART['xp40.title_vote_lover'],
  XP40_ART['xp40.title_comment_pro'],
  XP40_ART['xp40.title_social_star'],
  XP40_ART['xp40.title_contest_player'],
  XP40_ART['xp40.title_community_hero'],
] as const;

export const XP40_BY_TYPE = {
  frame: XP40_FRAMES,
  theme: XP40_THEMES,
  badge: XP40_BADGES,
  title: XP40_TITLES,
} as const;

export const LEGACY_XP_ART: Record<string, LegacyXpArtEntry> = {
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

/** All XP artwork, including migration-0077 legacy keys and the XP40 collection. */
export const XP_ART: Record<string, LegacyXpArtEntry | Xp40Entry> = {
  ...LEGACY_XP_ART,
  ...XP40_ART,
};
