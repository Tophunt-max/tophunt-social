/**
 * Artwork for the PREMIUM digital items sold in the Shop (migration
 * 0076_shop_digital_items.sql). Each catalog row carries `asset.key` =
 * `shop.<kind>_<file>`; `src/lib/cosmeticArt.ts` maps that key to the entry
 * here.
 *
 * Premium = layered and animated. Most items have two layers:
 *   - `Art`: the base (ring, emblem, background), always drawn;
 *   - `Fx`:  the overlay in fx/ (sparkles, glow, flames, aurora) that the app
 *            animates with `fx` (src/components/gamification/CosmeticFx.tsx).
 * Every premium item also carries the gem hallmark, where an earned (XP) item
 * carries the XP seal (assets/xp).
 *
 * Geometry contract, so a new file drops in without code changes:
 *   - frames/*  viewBox 0 0 120 120. The avatar is the circle r=50 at the
 *               centre; the ring and ornaments live in the 10-unit band round it.
 *   - themes/*  viewBox 0 0 360 140, `preserveAspectRatio="xMidYMid slice"`,
 *               drawn behind the profile header.
 *   - badges/*  viewBox 0 0 48 48, shown next to the name (16–24 pt).
 *   - titles/*  viewBox 0 0 48 48, the icon inside the title chip (the chip
 *               itself shimmers in code).
 *   - fx/ subfolders: same box as the base file of the same name.
 *
 * Gradient ids are prefixed per file (`pm…`): react-native-svg on web shares
 * one DOM id space, so two files using `id="g"` would paint each other.
 */
import type { FC } from 'react';
import type { SvgProps } from 'react-native-svg';

import FrameRosePetal from './frames/rose_petal.svg';
import FrameOceanWave from './frames/ocean_wave.svg';
import FrameNeonPulse from './frames/neon_pulse.svg';
import FrameFireBlaze from './frames/fire_blaze.svg';
import FrameGalaxySwirl from './frames/galaxy_swirl.svg';
import FrameRoyalCrown from './frames/royal_crown.svg';
import FxRosePetal from './frames/fx/rose_petal.svg';
import FxOceanWave from './frames/fx/ocean_wave.svg';
import FxNeonPulse from './frames/fx/neon_pulse.svg';
import FxFireBlaze from './frames/fx/fire_blaze.svg';
import FxGalaxySwirl from './frames/fx/galaxy_swirl.svg';
import FxRoyalCrown from './frames/fx/royal_crown.svg';

import ThemeSunsetGlow from './themes/sunset_glow.svg';
import ThemeAurora from './themes/aurora.svg';
import ThemeCyberNeon from './themes/cyber_neon.svg';
import ThemeGoldenHour from './themes/golden_hour.svg';
import FxSunsetGlow from './themes/fx/sunset_glow.svg';
import FxAurora from './themes/fx/aurora.svg';
import FxCyberNeon from './themes/fx/cyber_neon.svg';
import FxGoldenHour from './themes/fx/golden_hour.svg';

import BadgeTrendsetter from './badges/trendsetter.svg';
import BadgeFanFavourite from './badges/fan_favourite.svg';
import BadgeEliteHunter from './badges/elite_hunter.svg';
import FxTrendsetter from './badges/fx/trendsetter.svg';
import FxFanFavourite from './badges/fx/fan_favourite.svg';
import FxEliteHunter from './badges/fx/elite_hunter.svg';

import TitleStyleIcon from './titles/style_icon.svg';
import TitleTrendBoss from './titles/trend_boss.svg';
import TitleHuntMaster from './titles/hunt_master.svg';

export type ShopArtKind = 'frame' | 'theme' | 'badge' | 'title';
/** How the fx layer moves (src/components/gamification/CosmeticFx.tsx). */
export type FxMotion = 'spin' | 'pulse' | 'twinkle' | 'flicker' | 'drift';

export interface ShopArt {
  kind: ShopArtKind;
  Art: FC<SvgProps>;
  Fx?: FC<SvgProps>;
  fx?: FxMotion;
}

export const SHOP_DIGITAL_ART: Record<string, ShopArt> = {
  'shop.frame_rose_petal': { kind: 'frame', Art: FrameRosePetal, Fx: FxRosePetal, fx: 'twinkle' },
  'shop.frame_ocean_wave': { kind: 'frame', Art: FrameOceanWave, Fx: FxOceanWave, fx: 'spin' },
  'shop.frame_neon_pulse': { kind: 'frame', Art: FrameNeonPulse, Fx: FxNeonPulse, fx: 'pulse' },
  'shop.frame_fire_blaze': { kind: 'frame', Art: FrameFireBlaze, Fx: FxFireBlaze, fx: 'flicker' },
  'shop.frame_galaxy_swirl': { kind: 'frame', Art: FrameGalaxySwirl, Fx: FxGalaxySwirl, fx: 'spin' },
  'shop.frame_royal_crown': { kind: 'frame', Art: FrameRoyalCrown, Fx: FxRoyalCrown, fx: 'twinkle' },

  'shop.theme_sunset_glow': { kind: 'theme', Art: ThemeSunsetGlow, Fx: FxSunsetGlow, fx: 'drift' },
  'shop.theme_aurora': { kind: 'theme', Art: ThemeAurora, Fx: FxAurora, fx: 'drift' },
  'shop.theme_cyber_neon': { kind: 'theme', Art: ThemeCyberNeon, Fx: FxCyberNeon, fx: 'pulse' },
  'shop.theme_golden_hour': { kind: 'theme', Art: ThemeGoldenHour, Fx: FxGoldenHour, fx: 'pulse' },

  'shop.badge_trendsetter': { kind: 'badge', Art: BadgeTrendsetter, Fx: FxTrendsetter, fx: 'twinkle' },
  'shop.badge_fan_favourite': { kind: 'badge', Art: BadgeFanFavourite, Fx: FxFanFavourite, fx: 'twinkle' },
  'shop.badge_elite_hunter': { kind: 'badge', Art: BadgeEliteHunter, Fx: FxEliteHunter, fx: 'twinkle' },

  'shop.title_style_icon': { kind: 'title', Art: TitleStyleIcon },
  'shop.title_trend_boss': { kind: 'title', Art: TitleTrendBoss },
  'shop.title_hunt_master': { kind: 'title', Art: TitleHuntMaster },
};
