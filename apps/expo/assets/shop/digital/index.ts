/**
 * Artwork for the digital items sold in the Shop (migration
 * 0076_shop_digital_items.sql). Each catalog row carries `asset.key` =
 * `shop.<file>`; `src/lib/shopDigital.ts` maps that key to the component here.
 *
 * Geometry contract, so a new file drops in without code changes:
 *   - frames/*  viewBox 0 0 120 120. The avatar is the circle r=50 at the
 *               centre; the ring and ornaments live in the 10-unit band round it.
 *   - themes/*  viewBox 0 0 360 140, `preserveAspectRatio="xMidYMid slice"`,
 *               drawn behind the profile header.
 *   - badges/*  viewBox 0 0 48 48, shown next to the name (16–24 pt).
 *   - titles/*  viewBox 0 0 48 48, the icon inside the title chip.
 *
 * Gradient ids are prefixed per file: react-native-svg on web shares one DOM id
 * space, so two files using `id="g"` would paint each other's gradients.
 */
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';

import FrameRosePetal from './frames/rose_petal.svg';
import FrameOceanWave from './frames/ocean_wave.svg';
import FrameNeonPulse from './frames/neon_pulse.svg';
import FrameFireBlaze from './frames/fire_blaze.svg';
import FrameGalaxySwirl from './frames/galaxy_swirl.svg';
import FrameRoyalCrown from './frames/royal_crown.svg';

import ThemeSunsetGlow from './themes/sunset_glow.svg';
import ThemeAurora from './themes/aurora.svg';
import ThemeCyberNeon from './themes/cyber_neon.svg';
import ThemeGoldenHour from './themes/golden_hour.svg';

import BadgeTrendsetter from './badges/trendsetter.svg';
import BadgeFanFavourite from './badges/fan_favourite.svg';
import BadgeEliteHunter from './badges/elite_hunter.svg';

import TitleStyleIcon from './titles/style_icon.svg';
import TitleTrendBoss from './titles/trend_boss.svg';
import TitleHuntMaster from './titles/hunt_master.svg';

export type ShopArtKind = 'frame' | 'theme' | 'badge' | 'title';

export const SHOP_DIGITAL_ART: Record<string, { kind: ShopArtKind; Art: FC<SvgProps> }> = {
  'shop.frame_rose_petal': { kind: 'frame', Art: FrameRosePetal },
  'shop.frame_ocean_wave': { kind: 'frame', Art: FrameOceanWave },
  'shop.frame_neon_pulse': { kind: 'frame', Art: FrameNeonPulse },
  'shop.frame_fire_blaze': { kind: 'frame', Art: FrameFireBlaze },
  'shop.frame_galaxy_swirl': { kind: 'frame', Art: FrameGalaxySwirl },
  'shop.frame_royal_crown': { kind: 'frame', Art: FrameRoyalCrown },

  'shop.theme_sunset_glow': { kind: 'theme', Art: ThemeSunsetGlow },
  'shop.theme_aurora': { kind: 'theme', Art: ThemeAurora },
  'shop.theme_cyber_neon': { kind: 'theme', Art: ThemeCyberNeon },
  'shop.theme_golden_hour': { kind: 'theme', Art: ThemeGoldenHour },

  'shop.badge_trendsetter': { kind: 'badge', Art: BadgeTrendsetter },
  'shop.badge_fan_favourite': { kind: 'badge', Art: BadgeFanFavourite },
  'shop.badge_elite_hunter': { kind: 'badge', Art: BadgeEliteHunter },

  'shop.title_style_icon': { kind: 'title', Art: TitleStyleIcon },
  'shop.title_trend_boss': { kind: 'title', Art: TitleTrendBoss },
  'shop.title_hunt_master': { kind: 'title', Art: TitleHuntMaster },
};
