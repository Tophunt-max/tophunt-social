import type { ImageSourcePropType } from 'react-native';

export type ShopArtKind = 'frame' | 'theme' | 'badge' | 'title';
export type FxMotion = 'spin' | 'pulse' | 'twinkle' | 'flicker' | 'drift';

export interface ShopArt {
  kind: ShopArtKind;
  source: ImageSourcePropType;
  /** Transparent effect artwork, animated by CosmeticFx. Frames only. */
  Fx?: ImageSourcePropType;
  fx?: FxMotion;
}

/** Premium cosmetics purchased with coins in the Shop. */
export const SHOP_DIGITAL_ART: Record<string, ShopArt> = {
  'shop.frame_rose_petal': { kind: 'frame', source: require('./frames/rose_petal.webp'), Fx: require('./frames/fx/rose_petal.webp'), fx: 'twinkle' },
  'shop.frame_ocean_wave': { kind: 'frame', source: require('./frames/ocean_wave.webp'), Fx: require('./frames/fx/ocean_wave.webp'), fx: 'drift' },
  'shop.frame_neon_pulse': { kind: 'frame', source: require('./frames/neon_pulse.webp'), Fx: require('./frames/fx/neon_pulse.webp'), fx: 'pulse' },
  'shop.frame_fire_blaze': { kind: 'frame', source: require('./frames/fire_blaze.webp'), Fx: require('./frames/fx/fire_blaze.webp'), fx: 'flicker' },
  'shop.frame_galaxy_swirl': { kind: 'frame', source: require('./frames/galaxy_swirl.webp'), Fx: require('./frames/fx/galaxy_swirl.webp'), fx: 'spin' },
  'shop.frame_royal_crown': { kind: 'frame', source: require('./frames/royal_crown.webp'), Fx: require('./frames/fx/royal_crown.webp'), fx: 'twinkle' },

  // Separate premium collection. These keys are ready when their Shop catalog rows are created.
  'shop.frame_obsidian_dragon': { kind: 'frame', source: require('./frames/obsidian_dragon.webp'), Fx: require('./frames/fx/obsidian_dragon.webp'), fx: 'flicker' },
  'shop.frame_prism_halo': { kind: 'frame', source: require('./frames/prism_halo.webp'), Fx: require('./frames/fx/prism_halo.webp'), fx: 'spin' },
  'shop.frame_ice_phoenix': { kind: 'frame', source: require('./frames/ice_phoenix.webp'), Fx: require('./frames/fx/ice_phoenix.webp'), fx: 'drift' },
  'shop.frame_celestial_orbit': { kind: 'frame', source: require('./frames/celestial_orbit.webp'), Fx: require('./frames/fx/celestial_orbit.webp'), fx: 'spin' },
  'shop.frame_emerald_serpent': { kind: 'frame', source: require('./frames/emerald_serpent.webp'), Fx: require('./frames/fx/emerald_serpent.webp'), fx: 'drift' },
  'shop.frame_velvet_monarch': { kind: 'frame', source: require('./frames/velvet_monarch.webp'), Fx: require('./frames/fx/velvet_monarch.webp'), fx: 'twinkle' },

  // Original ornate fantasy collection. Designed from scratch using the local reference style only.
  'shop.frame_imperial_ruby': { kind: 'frame', source: require('./frames/imperial_ruby.webp'), Fx: require('./frames/fx/imperial_ruby.webp'), fx: 'twinkle' },
  'shop.frame_frost_empress': { kind: 'frame', source: require('./frames/frost_empress.webp'), Fx: require('./frames/fx/frost_empress.webp'), fx: 'drift' },
  'shop.frame_astral_oracle': { kind: 'frame', source: require('./frames/astral_oracle.webp'), Fx: require('./frames/fx/astral_oracle.webp'), fx: 'spin' },
  'shop.frame_cupid_royale': { kind: 'frame', source: require('./frames/cupid_royale.webp'), Fx: require('./frames/fx/cupid_royale.webp'), fx: 'twinkle' },
  'shop.frame_solar_phoenix': { kind: 'frame', source: require('./frames/solar_phoenix.webp'), Fx: require('./frames/fx/solar_phoenix.webp'), fx: 'flicker' },
  'shop.frame_emerald_dynasty': { kind: 'frame', source: require('./frames/emerald_dynasty.webp'), Fx: require('./frames/fx/emerald_dynasty.webp'), fx: 'pulse' },

  'shop.theme_sunset_glow': { kind: 'theme', source: require('./themes/sunset_glow.webp') },
  'shop.theme_aurora': { kind: 'theme', source: require('./themes/aurora.webp') },
  'shop.theme_cyber_neon': { kind: 'theme', source: require('./themes/cyber_neon.webp') },
  'shop.theme_golden_hour': { kind: 'theme', source: require('./themes/golden_hour.webp') },

  'shop.badge_trendsetter': { kind: 'badge', source: require('./badges/trendsetter.webp'), Fx: require('./badges/fx/trendsetter.webp'), fx: 'twinkle' },
  'shop.badge_fan_favourite': { kind: 'badge', source: require('./badges/fan_favourite.webp'), Fx: require('./badges/fx/fan_favourite.webp'), fx: 'pulse' },
  'shop.badge_elite_hunter': { kind: 'badge', source: require('./badges/elite_hunter.webp'), Fx: require('./badges/fx/elite_hunter.webp'), fx: 'twinkle' },
  'shop.badge_diamond_vanguard': { kind: 'badge', source: require('./badges/diamond_vanguard.webp'), Fx: require('./badges/fx/diamond_vanguard.webp'), fx: 'twinkle' },
  'shop.badge_cosmic_patron': { kind: 'badge', source: require('./badges/cosmic_patron.webp'), Fx: require('./badges/fx/cosmic_patron.webp'), fx: 'spin' },
  'shop.badge_royal_founder': { kind: 'badge', source: require('./badges/royal_founder.webp'), Fx: require('./badges/fx/royal_founder.webp'), fx: 'twinkle' },

  'shop.title_style_icon': { kind: 'title', source: require('./titles/style_icon.webp'), Fx: require('./titles/fx/style_icon.webp'), fx: 'drift' },
  'shop.title_trend_boss': { kind: 'title', source: require('./titles/trend_boss.webp'), Fx: require('./titles/fx/trend_boss.webp'), fx: 'drift' },
  'shop.title_hunt_master': { kind: 'title', source: require('./titles/hunt_master.webp'), Fx: require('./titles/fx/hunt_master.webp'), fx: 'drift' },
  'shop.title_dragon_lord': { kind: 'title', source: require('./titles/dragon_lord.webp'), Fx: require('./titles/fx/dragon_lord.webp'), fx: 'drift' },
  'shop.title_starlight_icon': { kind: 'title', source: require('./titles/starlight_icon.webp'), Fx: require('./titles/fx/starlight_icon.webp'), fx: 'twinkle' },
  'shop.title_sovereign': { kind: 'title', source: require('./titles/sovereign.webp'), Fx: require('./titles/fx/sovereign.webp'), fx: 'drift' },
};
