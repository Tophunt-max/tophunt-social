-- Free XP level rewards: ONE item for EVERY level 1-100 (100 items).
--
-- 0079 shipped 40 items at levels 0,5,10..40,50 (ten per category) and the
-- table CHECKs pinned exactly those levels. This rebuilds xp_cosmetic_unlocks
-- with unlock_level 1-100, so admins can manage the collection
-- (Gamification -> XP Level Rewards, routes/adminGamification.ts):
--   * the 40 existing items move to levels 1-40, in their old order
--     (starters first, then each old step frame/theme/badge/title). Every item
--     now unlocks at or below its old level, so nobody loses anything and
--     grants already made stay (user_inventory is untouched);
--   * levels 41-100 get 60 new items (15 per category), colour/icon fallbacks
--     until an admin uploads WebP artwork for them.
-- collection stays 'xp40' (the free-XP marker every check already uses).
-- One item per level is enforced by the admin route, not a UNIQUE index, so
-- two items can swap levels in one batch.
CREATE TABLE IF NOT EXISTS xp_cosmetic_unlocks_v2 (
  item_id       TEXT PRIMARY KEY REFERENCES reward_catalog (id),
  collection    TEXT NOT NULL DEFAULT 'xp40' CHECK (collection = 'xp40'),
  category      TEXT NOT NULL CHECK (category IN ('frame', 'theme', 'badge', 'title')),
  unlock_level  INTEGER NOT NULL CHECK (unlock_level BETWEEN 1 AND 100),
  item_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

INSERT OR IGNORE INTO xp_cosmetic_unlocks_v2 (item_id, collection, category, unlock_level, item_order, created_at)
SELECT a.item_id, a.collection, a.category,
       (SELECT COUNT(*) FROM xp_cosmetic_unlocks b
         WHERE b.category = a.category AND (b.unlock_level < a.unlock_level OR (b.unlock_level = a.unlock_level AND b.item_order < a.item_order))) * 4
       + CASE a.category WHEN 'frame' THEN 1 WHEN 'theme' THEN 2 WHEN 'badge' THEN 3 ELSE 4 END,
       0, a.created_at
  FROM xp_cosmetic_unlocks a;

UPDATE xp_cosmetic_unlocks_v2 SET item_order = unlock_level;

DROP TABLE xp_cosmetic_unlocks;
ALTER TABLE xp_cosmetic_unlocks_v2 RENAME TO xp_cosmetic_unlocks;
CREATE INDEX IF NOT EXISTS idx_xp_cosmetic_unlock_level ON xp_cosmetic_unlocks (unlock_level);

-- The display level in each moved item's asset follows its new unlock level.
UPDATE reward_catalog
   SET asset = json_set(asset, '$.level', (SELECT x.unlock_level FROM xp_cosmetic_unlocks x WHERE x.item_id = reward_catalog.id))
 WHERE id IN (SELECT item_id FROM xp_cosmetic_unlocks);

INSERT OR IGNORE INTO reward_catalog (id, type, name, description, rarity, asset, active, sort, created_at, updated_at) VALUES
  ('xplv041_frame_bronze_spark', 'frame', 'Bronze Spark', 'A level 41 frame, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":41,"animation":"none","colors":["#FDBA74","#C2410C"]}', 1, 2441, 0, 0),
  ('xplv042_theme_dawn_sky', 'theme', 'Dawn Sky', 'A level 42 profile theme, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":42,"animation":"none","colors":["#FDBA74","#C2410C"]}', 1, 2442, 0, 0),
  ('xplv043_badge_rising_star', 'badge', 'Rising Star', 'A level 43 badge, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":43,"animation":"none","colors":["#FDBA74","#C2410C"],"icon":"star","color":"#C2410C"}', 1, 2443, 0, 0),
  ('xplv044_title_rising_star', 'title', 'Rising Star', 'A level 44 title, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":44,"animation":"none","colors":["#FDBA74","#C2410C"],"text":"Rising Star"}', 1, 2444, 0, 0),
  ('xplv045_frame_silver_halo', 'frame', 'Silver Halo', 'A level 45 frame, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":45,"animation":"none","colors":["#E2E8F0","#64748B"]}', 1, 2445, 0, 0),
  ('xplv046_theme_desert_dunes', 'theme', 'Desert Dunes', 'A level 46 profile theme, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":46,"animation":"none","colors":["#E2E8F0","#64748B"]}', 1, 2446, 0, 0),
  ('xplv047_badge_spark', 'badge', 'Spark', 'A level 47 badge, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":47,"animation":"none","colors":["#E2E8F0","#64748B"],"icon":"flash","color":"#64748B"}', 1, 2447, 0, 0),
  ('xplv048_title_trend_maker', 'title', 'Trend Maker', 'A level 48 title, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":48,"animation":"none","colors":["#E2E8F0","#64748B"],"text":"Trend Maker"}', 1, 2448, 0, 0),
  ('xplv049_frame_golden_ring', 'frame', 'Golden Ring', 'A level 49 frame, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":49,"animation":"none","colors":["#FDE68A","#CA8A04"]}', 1, 2449, 0, 0),
  ('xplv050_theme_snow_peaks', 'theme', 'Snow Peaks', 'A level 50 profile theme, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":50,"animation":"none","colors":["#FDE68A","#CA8A04"]}', 1, 2450, 0, 0),
  ('xplv051_badge_top_voter', 'badge', 'Top Voter', 'A level 51 badge, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":51,"animation":"none","colors":["#FDE68A","#CA8A04"],"icon":"checkmark-circle","color":"#CA8A04"}', 1, 2451, 0, 0),
  ('xplv052_title_vote_champion', 'title', 'Vote Champion', 'A level 52 title, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":52,"animation":"none","colors":["#FDE68A","#CA8A04"],"text":"Vote Champion"}', 1, 2452, 0, 0),
  ('xplv053_frame_coral_glow', 'frame', 'Coral Glow', 'A level 53 frame, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":53,"animation":"none","colors":["#FDA4AF","#E11D48"]}', 1, 2453, 0, 0),
  ('xplv054_theme_lotus_lake', 'theme', 'Lotus Lake', 'A level 54 profile theme, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":54,"animation":"none","colors":["#FDA4AF","#E11D48"]}', 1, 2454, 0, 0),
  ('xplv055_badge_battle_ready', 'badge', 'Battle Ready', 'A level 55 badge, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":55,"animation":"none","colors":["#FDA4AF","#E11D48"],"icon":"flame","color":"#E11D48"}', 1, 2455, 0, 0),
  ('xplv056_title_battle_ace', 'title', 'Battle Ace', 'A level 56 title, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":56,"animation":"none","colors":["#FDA4AF","#E11D48"],"text":"Battle Ace"}', 1, 2456, 0, 0),
  ('xplv057_frame_mint_breeze', 'frame', 'Mint Breeze', 'A level 57 frame, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":57,"animation":"none","colors":["#99F6E4","#0D9488"]}', 1, 2457, 0, 0),
  ('xplv058_theme_monsoon_rain', 'theme', 'Monsoon Rain', 'A level 58 profile theme, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":58,"animation":"none","colors":["#99F6E4","#0D9488"]}', 1, 2458, 0, 0),
  ('xplv059_badge_crowd_favorite', 'badge', 'Crowd Favorite', 'A level 59 badge, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":59,"animation":"none","colors":["#99F6E4","#0D9488"],"icon":"heart","color":"#0D9488"}', 1, 2459, 0, 0),
  ('xplv060_title_crowd_pleaser', 'title', 'Crowd Pleaser', 'A level 60 title, earned with XP.', 'uncommon', '{"tier":"xp","collection":"xp40","level":60,"animation":"none","colors":["#99F6E4","#0D9488"],"text":"Crowd Pleaser"}', 1, 2460, 0, 0),
  ('xplv061_frame_lavender_mist', 'frame', 'Lavender Mist', 'A level 61 frame, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":61,"animation":"none","colors":["#DDD6FE","#7C3AED"]}', 1, 2461, 0, 0),
  ('xplv062_theme_neon_streets', 'theme', 'Neon Streets', 'A level 62 profile theme, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":62,"animation":"none","colors":["#DDD6FE","#7C3AED"]}', 1, 2462, 0, 0),
  ('xplv063_badge_streak_master', 'badge', 'Streak Master', 'A level 63 badge, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":63,"animation":"none","colors":["#DDD6FE","#7C3AED"],"icon":"fire","color":"#7C3AED"}', 1, 2463, 0, 0),
  ('xplv064_title_streak_king', 'title', 'Streak King', 'A level 64 title, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":64,"animation":"none","colors":["#DDD6FE","#7C3AED"],"text":"Streak King"}', 1, 2464, 0, 0),
  ('xplv065_frame_amber_flame', 'frame', 'Amber Flame', 'A level 65 frame, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":65,"animation":"none","colors":["#FCD34D","#EA580C"]}', 1, 2465, 0, 0),
  ('xplv066_theme_autumn_leaves', 'theme', 'Autumn Leaves', 'A level 66 profile theme, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":66,"animation":"none","colors":["#FCD34D","#EA580C"]}', 1, 2466, 0, 0),
  ('xplv067_badge_community_pillar', 'badge', 'Community Pillar', 'A level 67 badge, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":67,"animation":"none","colors":["#FCD34D","#EA580C"],"icon":"people","color":"#EA580C"}', 1, 2467, 0, 0),
  ('xplv068_title_community_pillar', 'title', 'Community Pillar', 'A level 68 title, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":68,"animation":"none","colors":["#FCD34D","#EA580C"],"text":"Community Pillar"}', 1, 2468, 0, 0),
  ('xplv069_frame_sapphire_edge', 'frame', 'Sapphire Edge', 'A level 69 frame, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":69,"animation":"none","colors":["#93C5FD","#1D4ED8"]}', 1, 2469, 0, 0),
  ('xplv070_theme_deep_ocean', 'theme', 'Deep Ocean', 'A level 70 profile theme, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":70,"animation":"none","colors":["#93C5FD","#1D4ED8"]}', 1, 2470, 0, 0),
  ('xplv071_badge_spotlight', 'badge', 'Spotlight', 'A level 71 badge, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":71,"animation":"none","colors":["#93C5FD","#1D4ED8"],"icon":"sunny","color":"#1D4ED8"}', 1, 2471, 0, 0),
  ('xplv072_title_spotlight_star', 'title', 'Spotlight Star', 'A level 72 title, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":72,"animation":"none","colors":["#93C5FD","#1D4ED8"],"text":"Spotlight Star"}', 1, 2472, 0, 0),
  ('xplv073_frame_ruby_crest', 'frame', 'Ruby Crest', 'A level 73 frame, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":73,"animation":"none","colors":["#FCA5A5","#B91C1C"]}', 1, 2473, 0, 0),
  ('xplv074_theme_aurora_night', 'theme', 'Aurora Night', 'A level 74 profile theme, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":74,"animation":"none","colors":["#FCA5A5","#B91C1C"]}', 1, 2474, 0, 0),
  ('xplv075_badge_champion_spirit', 'badge', 'Champion Spirit', 'A level 75 badge, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":75,"animation":"none","colors":["#FCA5A5","#B91C1C"],"icon":"trophy","color":"#B91C1C"}', 1, 2475, 0, 0),
  ('xplv076_title_true_champion', 'title', 'True Champion', 'A level 76 title, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":76,"animation":"none","colors":["#FCA5A5","#B91C1C"],"text":"True Champion"}', 1, 2476, 0, 0),
  ('xplv077_frame_emerald_crown', 'frame', 'Emerald Crown', 'A level 77 frame, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":77,"animation":"none","colors":["#6EE7B7","#047857"]}', 1, 2477, 0, 0),
  ('xplv078_theme_volcano_glow', 'theme', 'Volcano Glow', 'A level 78 profile theme, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":78,"animation":"none","colors":["#6EE7B7","#047857"]}', 1, 2478, 0, 0),
  ('xplv079_badge_sharp_eye', 'badge', 'Sharp Eye', 'A level 79 badge, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":79,"animation":"none","colors":["#6EE7B7","#047857"],"icon":"eye","color":"#047857"}', 1, 2479, 0, 0),
  ('xplv080_title_elite_voter', 'title', 'Elite Voter', 'A level 80 title, earned with XP.', 'rare', '{"tier":"xp","collection":"xp40","level":80,"animation":"none","colors":["#6EE7B7","#047857"],"text":"Elite Voter"}', 1, 2480, 0, 0),
  ('xplv081_frame_onyx_orbit', 'frame', 'Onyx Orbit', 'A level 81 frame, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":81,"animation":"none","colors":["#94A3B8","#1E293B"]}', 1, 2481, 0, 0),
  ('xplv082_theme_golden_temple', 'theme', 'Golden Temple', 'A level 82 profile theme, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":82,"animation":"none","colors":["#94A3B8","#1E293B"]}', 1, 2482, 0, 0),
  ('xplv083_badge_hall_of_fame', 'badge', 'Hall of Fame', 'A level 83 badge, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":83,"animation":"none","colors":["#94A3B8","#1E293B"],"icon":"ribbon","color":"#1E293B"}', 1, 2483, 0, 0),
  ('xplv084_title_hall_of_famer', 'title', 'Hall of Famer', 'A level 84 title, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":84,"animation":"none","colors":["#94A3B8","#1E293B"],"text":"Hall of Famer"}', 1, 2484, 0, 0),
  ('xplv085_frame_pearl_radiance', 'frame', 'Pearl Radiance', 'A level 85 frame, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":85,"animation":"none","colors":["#F5F5F4","#A8A29E"]}', 1, 2485, 0, 0),
  ('xplv086_theme_galaxy_dust', 'theme', 'Galaxy Dust', 'A level 86 profile theme, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":86,"animation":"none","colors":["#F5F5F4","#A8A29E"]}', 1, 2486, 0, 0),
  ('xplv087_badge_mentor', 'badge', 'Mentor', 'A level 87 badge, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":87,"animation":"none","colors":["#F5F5F4","#A8A29E"],"icon":"bulb","color":"#A8A29E"}', 1, 2487, 0, 0),
  ('xplv088_title_mentor', 'title', 'Mentor', 'A level 88 title, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":88,"animation":"none","colors":["#F5F5F4","#A8A29E"],"text":"Mentor"}', 1, 2488, 0, 0),
  ('xplv089_frame_titan_ring', 'frame', 'Titan Ring', 'A level 89 frame, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":89,"animation":"none","colors":["#A5B4FC","#4338CA"]}', 1, 2489, 0, 0),
  ('xplv090_theme_crystal_cave', 'theme', 'Crystal Cave', 'A level 90 profile theme, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":90,"animation":"none","colors":["#A5B4FC","#4338CA"]}', 1, 2490, 0, 0),
  ('xplv091_badge_icon', 'badge', 'Icon', 'A level 91 badge, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":91,"animation":"none","colors":["#A5B4FC","#4338CA"],"icon":"sparkles","color":"#4338CA"}', 1, 2491, 0, 0),
  ('xplv092_title_tophunt_icon', 'title', 'TopHunt Icon', 'A level 92 title, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":92,"animation":"none","colors":["#A5B4FC","#4338CA"],"text":"TopHunt Icon"}', 1, 2492, 0, 0),
  ('xplv093_frame_nova_halo', 'frame', 'Nova Halo', 'A level 93 frame, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":93,"animation":"none","colors":["#F0ABFC","#A21CAF"]}', 1, 2493, 0, 0),
  ('xplv094_theme_royal_palace', 'theme', 'Royal Palace', 'A level 94 profile theme, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":94,"animation":"none","colors":["#F0ABFC","#A21CAF"]}', 1, 2494, 0, 0),
  ('xplv095_badge_grandmaster', 'badge', 'Grandmaster', 'A level 95 badge, earned with XP.', 'epic', '{"tier":"xp","collection":"xp40","level":95,"animation":"none","colors":["#F0ABFC","#A21CAF"],"icon":"crown","color":"#A21CAF"}', 1, 2495, 0, 0),
  ('xplv096_title_grandmaster', 'title', 'Grandmaster', 'A level 96 title, earned with XP.', 'legendary', '{"tier":"xp","collection":"xp40","level":96,"animation":"none","colors":["#F0ABFC","#A21CAF"],"text":"Grandmaster"}', 1, 2496, 0, 0),
  ('xplv097_frame_legend_crown', 'frame', 'Legend Crown', 'A level 97 frame, earned with XP.', 'legendary', '{"tier":"xp","collection":"xp40","level":97,"animation":"none","colors":["#FDE047","#B45309"]}', 1, 2497, 0, 0),
  ('xplv098_theme_infinity_sky', 'theme', 'Infinity Sky', 'A level 98 profile theme, earned with XP.', 'legendary', '{"tier":"xp","collection":"xp40","level":98,"animation":"none","colors":["#FDE047","#B45309"]}', 1, 2498, 0, 0),
  ('xplv099_badge_centurion', 'badge', 'Centurion', 'A level 99 badge, earned with XP.', 'legendary', '{"tier":"xp","collection":"xp40","level":99,"animation":"none","colors":["#FDE047","#B45309"],"icon":"medal","color":"#B45309"}', 1, 2499, 0, 0),
  ('xplv100_title_centurion', 'title', 'Centurion', 'A level 100 title, earned with XP.', 'mythic', '{"tier":"xp","collection":"xp40","level":100,"animation":"none","colors":["#FDE047","#B45309"],"text":"Centurion"}', 1, 2500, 0, 0);

INSERT OR IGNORE INTO xp_cosmetic_unlocks (item_id, collection, category, unlock_level, item_order, created_at) VALUES
  ('xplv041_frame_bronze_spark', 'xp40', 'frame', 41, 41, 0),
  ('xplv042_theme_dawn_sky', 'xp40', 'theme', 42, 42, 0),
  ('xplv043_badge_rising_star', 'xp40', 'badge', 43, 43, 0),
  ('xplv044_title_rising_star', 'xp40', 'title', 44, 44, 0),
  ('xplv045_frame_silver_halo', 'xp40', 'frame', 45, 45, 0),
  ('xplv046_theme_desert_dunes', 'xp40', 'theme', 46, 46, 0),
  ('xplv047_badge_spark', 'xp40', 'badge', 47, 47, 0),
  ('xplv048_title_trend_maker', 'xp40', 'title', 48, 48, 0),
  ('xplv049_frame_golden_ring', 'xp40', 'frame', 49, 49, 0),
  ('xplv050_theme_snow_peaks', 'xp40', 'theme', 50, 50, 0),
  ('xplv051_badge_top_voter', 'xp40', 'badge', 51, 51, 0),
  ('xplv052_title_vote_champion', 'xp40', 'title', 52, 52, 0),
  ('xplv053_frame_coral_glow', 'xp40', 'frame', 53, 53, 0),
  ('xplv054_theme_lotus_lake', 'xp40', 'theme', 54, 54, 0),
  ('xplv055_badge_battle_ready', 'xp40', 'badge', 55, 55, 0),
  ('xplv056_title_battle_ace', 'xp40', 'title', 56, 56, 0),
  ('xplv057_frame_mint_breeze', 'xp40', 'frame', 57, 57, 0),
  ('xplv058_theme_monsoon_rain', 'xp40', 'theme', 58, 58, 0),
  ('xplv059_badge_crowd_favorite', 'xp40', 'badge', 59, 59, 0),
  ('xplv060_title_crowd_pleaser', 'xp40', 'title', 60, 60, 0),
  ('xplv061_frame_lavender_mist', 'xp40', 'frame', 61, 61, 0),
  ('xplv062_theme_neon_streets', 'xp40', 'theme', 62, 62, 0),
  ('xplv063_badge_streak_master', 'xp40', 'badge', 63, 63, 0),
  ('xplv064_title_streak_king', 'xp40', 'title', 64, 64, 0),
  ('xplv065_frame_amber_flame', 'xp40', 'frame', 65, 65, 0),
  ('xplv066_theme_autumn_leaves', 'xp40', 'theme', 66, 66, 0),
  ('xplv067_badge_community_pillar', 'xp40', 'badge', 67, 67, 0),
  ('xplv068_title_community_pillar', 'xp40', 'title', 68, 68, 0),
  ('xplv069_frame_sapphire_edge', 'xp40', 'frame', 69, 69, 0),
  ('xplv070_theme_deep_ocean', 'xp40', 'theme', 70, 70, 0),
  ('xplv071_badge_spotlight', 'xp40', 'badge', 71, 71, 0),
  ('xplv072_title_spotlight_star', 'xp40', 'title', 72, 72, 0),
  ('xplv073_frame_ruby_crest', 'xp40', 'frame', 73, 73, 0),
  ('xplv074_theme_aurora_night', 'xp40', 'theme', 74, 74, 0),
  ('xplv075_badge_champion_spirit', 'xp40', 'badge', 75, 75, 0),
  ('xplv076_title_true_champion', 'xp40', 'title', 76, 76, 0),
  ('xplv077_frame_emerald_crown', 'xp40', 'frame', 77, 77, 0),
  ('xplv078_theme_volcano_glow', 'xp40', 'theme', 78, 78, 0),
  ('xplv079_badge_sharp_eye', 'xp40', 'badge', 79, 79, 0),
  ('xplv080_title_elite_voter', 'xp40', 'title', 80, 80, 0),
  ('xplv081_frame_onyx_orbit', 'xp40', 'frame', 81, 81, 0),
  ('xplv082_theme_golden_temple', 'xp40', 'theme', 82, 82, 0),
  ('xplv083_badge_hall_of_fame', 'xp40', 'badge', 83, 83, 0),
  ('xplv084_title_hall_of_famer', 'xp40', 'title', 84, 84, 0),
  ('xplv085_frame_pearl_radiance', 'xp40', 'frame', 85, 85, 0),
  ('xplv086_theme_galaxy_dust', 'xp40', 'theme', 86, 86, 0),
  ('xplv087_badge_mentor', 'xp40', 'badge', 87, 87, 0),
  ('xplv088_title_mentor', 'xp40', 'title', 88, 88, 0),
  ('xplv089_frame_titan_ring', 'xp40', 'frame', 89, 89, 0),
  ('xplv090_theme_crystal_cave', 'xp40', 'theme', 90, 90, 0),
  ('xplv091_badge_icon', 'xp40', 'badge', 91, 91, 0),
  ('xplv092_title_tophunt_icon', 'xp40', 'title', 92, 92, 0),
  ('xplv093_frame_nova_halo', 'xp40', 'frame', 93, 93, 0),
  ('xplv094_theme_royal_palace', 'xp40', 'theme', 94, 94, 0),
  ('xplv095_badge_grandmaster', 'xp40', 'badge', 95, 95, 0),
  ('xplv096_title_grandmaster', 'xp40', 'title', 96, 96, 0),
  ('xplv097_frame_legend_crown', 'xp40', 'frame', 97, 97, 0),
  ('xplv098_theme_infinity_sky', 'xp40', 'theme', 98, 98, 0),
  ('xplv099_badge_centurion', 'xp40', 'badge', 99, 99, 0),
  ('xplv100_title_centurion', 'xp40', 'title', 100, 100, 0);
