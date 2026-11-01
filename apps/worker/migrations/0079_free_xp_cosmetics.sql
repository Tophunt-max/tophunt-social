-- Exact 40-item Normal / Free XP cosmetics collection.
--
-- Entitlement rules live in xp_cosmetic_unlocks, not in mutable visual JSON.
-- The Worker compares these levels with server-authoritative users.xp and grants
-- permanent inventory rows with INSERT OR IGNORE. Level 0 is display metadata
-- for starter items; every account's computed level is at least 1, so starters
-- are eligible on its first/full progression sync without changing the level
-- engine.
--
-- Premium Shop items remain separate: no xp40 item is inserted into
-- store_listings and the purchase API only reads store_listings.
CREATE TABLE IF NOT EXISTS xp_cosmetic_unlocks (
  item_id       TEXT PRIMARY KEY REFERENCES reward_catalog (id),
  collection    TEXT NOT NULL DEFAULT 'xp40' CHECK (collection = 'xp40'),
  category      TEXT NOT NULL CHECK (category IN ('frame', 'theme', 'badge', 'title')),
  unlock_level  INTEGER NOT NULL CHECK (unlock_level IN (0, 5, 10, 15, 20, 25, 30, 35, 40, 50)),
  item_order    INTEGER NOT NULL CHECK (item_order BETWEEN 0 AND 9),
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_xp_cosmetic_category_order ON xp_cosmetic_unlocks (category, item_order);
CREATE INDEX IF NOT EXISTS idx_xp_cosmetic_unlock_level ON xp_cosmetic_unlocks (unlock_level, category, item_order);

INSERT OR IGNORE INTO reward_catalog (id, type, name, description, rarity, asset, active, sort, created_at, updated_at) VALUES
  ('xp40_frame_default', 'frame', 'Default', 'A clean slate-blue ring for every new member.', 'common', '{"key":"xp40.frame_default","tier":"xp","collection":"xp40","level":0,"animation":"gentle_glow","colors":["#CBD5E1","#64748B"]}', 1, 2000, 0, 0),
  ('xp40_frame_green_leaf', 'frame', 'Green Leaf', 'Fresh leaves orbit your avatar with a calm natural glow.', 'common', '{"key":"xp40.frame_green_leaf","tier":"xp","collection":"xp40","level":5,"animation":"float_particles","colors":["#86EFAC","#16A34A"]}', 1, 2010, 0, 0),
  ('xp40_frame_blue_wave', 'frame', 'Blue Wave', 'A flowing blue ring inspired by clear ocean water.', 'common', '{"key":"xp40.frame_blue_wave","tier":"xp","collection":"xp40","level":10,"animation":"soft_rotate","colors":["#67E8F9","#2563EB"]}', 1, 2020, 0, 0),
  ('xp40_frame_pink_heart', 'frame', 'Pink Heart', 'Friendly pink hearts brighten the edge of your avatar.', 'common', '{"key":"xp40.frame_pink_heart","tier":"xp","collection":"xp40","level":15,"animation":"gentle_glow","colors":["#F9A8D4","#EC4899"]}', 1, 2030, 0, 0),
  ('xp40_frame_star_light', 'frame', 'Star Light', 'Cheerful stars add a soft light around your profile.', 'common', '{"key":"xp40.frame_star_light","tier":"xp","collection":"xp40","level":20,"animation":"float_particles","colors":["#FDE68A","#F59E0B"]}', 1, 2040, 0, 0),
  ('xp40_frame_fire_ring', 'frame', 'Fire Ring', 'Warm stylized flames celebrate your growing activity.', 'common', '{"key":"xp40.frame_fire_ring","tier":"xp","collection":"xp40","level":25,"animation":"gentle_glow","colors":["#FDBA74","#F97316"]}', 1, 2050, 0, 0),
  ('xp40_frame_ice_crystal', 'frame', 'Ice Crystal', 'Cool crystal shards make a crisp, friendly frame.', 'common', '{"key":"xp40.frame_ice_crystal","tier":"xp","collection":"xp40","level":30,"animation":"soft_rotate","colors":["#BAE6FD","#0EA5E9"]}', 1, 2060, 0, 0),
  ('xp40_frame_nature', 'frame', 'Nature', 'Leaves and small flowers show your steady progress.', 'common', '{"key":"xp40.frame_nature","tier":"xp","collection":"xp40","level":35,"animation":"float_particles","colors":["#BBF7D0","#22C55E"]}', 1, 2070, 0, 0),
  ('xp40_frame_purple_aura', 'frame', 'Purple Aura', 'A soft violet aura for active community members.', 'common', '{"key":"xp40.frame_purple_aura","tier":"xp","collection":"xp40","level":40,"animation":"gentle_glow","colors":["#D8B4FE","#8B5CF6"]}', 1, 2080, 0, 0),
  ('xp40_frame_rainbow', 'frame', 'Rainbow', 'A joyful rainbow ring earned through long-term activity.', 'common', '{"key":"xp40.frame_rainbow","tier":"xp","collection":"xp40","level":50,"animation":"soft_rotate","colors":["#F472B6","#38BDF8"]}', 1, 2090, 0, 0),

  ('xp40_theme_default', 'theme', 'Default', 'A balanced dark-blue profile background for every member.', 'common', '{"key":"xp40.theme_default","tier":"xp","collection":"xp40","level":0,"animation":"none","colors":["#111827","#1E3A5F"]}', 1, 2100, 0, 0),
  ('xp40_theme_sunny_day', 'theme', 'Sunny Day', 'A blue sky and soft hills with a readable profile area.', 'common', '{"key":"xp40.theme_sunny_day","tier":"xp","collection":"xp40","level":5,"animation":"slow_parallax","colors":["#38BDF8","#86EFAC"]}', 1, 2110, 0, 0),
  ('xp40_theme_cherry_blossom', 'theme', 'Cherry Blossom', 'Gentle pink blossoms over a calm evening landscape.', 'common', '{"key":"xp40.theme_cherry_blossom","tier":"xp","collection":"xp40","level":10,"animation":"float_particles","colors":["#FDA4AF","#7C3AED"]}', 1, 2120, 0, 0),
  ('xp40_theme_ocean_wave', 'theme', 'Ocean Wave', 'Clear tropical water and a peaceful horizon.', 'common', '{"key":"xp40.theme_ocean_wave","tier":"xp","collection":"xp40","level":15,"animation":"slow_parallax","colors":["#22D3EE","#2563EB"]}', 1, 2130, 0, 0),
  ('xp40_theme_sunset', 'theme', 'Sunset', 'Warm sunset colors behind a dark readable foreground.', 'common', '{"key":"xp40.theme_sunset","tier":"xp","collection":"xp40","level":20,"animation":"gentle_light","colors":["#FB7185","#7C3AED"]}', 1, 2140, 0, 0),
  ('xp40_theme_forest', 'theme', 'Forest', 'A deep green forest with soft rays between the trees.', 'common', '{"key":"xp40.theme_forest","tier":"xp","collection":"xp40","level":25,"animation":"gentle_light","colors":["#34D399","#064E3B"]}', 1, 2150, 0, 0),
  ('xp40_theme_night_sky', 'theme', 'Night Sky', 'A quiet moonlit sky with small drifting stars.', 'common', '{"key":"xp40.theme_night_sky","tier":"xp","collection":"xp40","level":30,"animation":"float_particles","colors":["#1E3A8A","#312E81"]}', 1, 2160, 0, 0),
  ('xp40_theme_city_lights', 'theme', 'City Lights', 'A colorful friendly skyline after dark.', 'common', '{"key":"xp40.theme_city_lights","tier":"xp","collection":"xp40","level":35,"animation":"gentle_light","colors":["#7C3AED","#0EA5E9"]}', 1, 2170, 0, 0),
  ('xp40_theme_cloud_fantasy', 'theme', 'Cloud Fantasy', 'Pastel clouds float through a soft blue-violet sky.', 'common', '{"key":"xp40.theme_cloud_fantasy","tier":"xp","collection":"xp40","level":40,"animation":"slow_parallax","colors":["#C4B5FD","#60A5FA"]}', 1, 2180, 0, 0),
  ('xp40_theme_minimal_dark', 'theme', 'Minimal Dark', 'A clean charcoal theme with subtle TopHunt accents.', 'common', '{"key":"xp40.theme_minimal_dark","tier":"xp","collection":"xp40","level":50,"animation":"gentle_light","colors":["#111827","#334155"]}', 1, 2190, 0, 0),

  ('xp40_badge_newbie', 'badge', 'Newbie', 'Your first friendly community badge.', 'common', '{"key":"xp40.badge_newbie","tier":"xp","collection":"xp40","level":0,"animation":"scale_in","colors":["#86EFAC","#16A34A"]}', 1, 2200, 0, 0),
  ('xp40_badge_active_user', 'badge', 'Active User', 'Awarded for getting active around TopHunt.', 'common', '{"key":"xp40.badge_active_user","tier":"xp","collection":"xp40","level":5,"animation":"subtle_shine","colors":["#FDBA74","#EA580C"]}', 1, 2210, 0, 0),
  ('xp40_badge_first_post', 'badge', 'First Post', 'A camera badge for sharing your creativity.', 'common', '{"key":"xp40.badge_first_post","tier":"xp","collection":"xp40","level":10,"animation":"subtle_shine","colors":["#93C5FD","#2563EB"]}', 1, 2220, 0, 0),
  ('xp40_badge_supporter', 'badge', 'Supporter', 'A heart badge for supporting the community.', 'common', '{"key":"xp40.badge_supporter","tier":"xp","collection":"xp40","level":15,"animation":"gentle_bounce","colors":["#F9A8D4","#DB2777"]}', 1, 2230, 0, 0),
  ('xp40_badge_voter', 'badge', 'Voter', 'A ballot badge for making your voice count.', 'common', '{"key":"xp40.badge_voter","tier":"xp","collection":"xp40","level":20,"animation":"scale_in","colors":["#67E8F9","#0891B2"]}', 1, 2240, 0, 0),
  ('xp40_badge_commenter', 'badge', 'Commenter', 'A chat badge for joining conversations.', 'common', '{"key":"xp40.badge_commenter","tier":"xp","collection":"xp40","level":25,"animation":"gentle_bounce","colors":["#C4B5FD","#7C3AED"]}', 1, 2250, 0, 0),
  ('xp40_badge_social', 'badge', 'Social', 'A people badge for growing your TopHunt circle.', 'common', '{"key":"xp40.badge_social","tier":"xp","collection":"xp40","level":30,"animation":"scale_in","colors":["#86EFAC","#059669"]}', 1, 2260, 0, 0),
  ('xp40_badge_explorer', 'badge', 'Explorer', 'A compass badge for discovering more of TopHunt.', 'common', '{"key":"xp40.badge_explorer","tier":"xp","collection":"xp40","level":35,"animation":"subtle_shine","colors":["#FDE68A","#D97706"]}', 1, 2270, 0, 0),
  ('xp40_badge_streak', 'badge', 'Streak', 'A bright flame badge for consistent activity.', 'common', '{"key":"xp40.badge_streak","tier":"xp","collection":"xp40","level":40,"animation":"gentle_bounce","colors":["#FDBA74","#EF4444"]}', 1, 2280, 0, 0),
  ('xp40_badge_dedicated', 'badge', 'Dedicated', 'A star badge for reaching the final free milestone.', 'common', '{"key":"xp40.badge_dedicated","tier":"xp","collection":"xp40","level":50,"animation":"subtle_shine","colors":["#D8B4FE","#8B5CF6"]}', 1, 2290, 0, 0),

  ('xp40_title_new_member', 'title', 'New Member', 'A welcoming nameplate for every new member.', 'common', '{"key":"xp40.title_new_member","tier":"xp","collection":"xp40","level":0,"animation":"slide_in","text":"New Member","colors":["#64748B","#334155"]}', 1, 2300, 0, 0),
  ('xp40_title_rising_user', 'title', 'Rising User', 'A fresh green nameplate for your first milestone.', 'common', '{"key":"xp40.title_rising_user","tier":"xp","collection":"xp40","level":5,"animation":"gentle_glow","text":"Rising User","colors":["#22C55E","#15803D"]}', 1, 2310, 0, 0),
  ('xp40_title_creative_mind', 'title', 'Creative Mind', 'A blue nameplate for growing creators.', 'common', '{"key":"xp40.title_creative_mind","tier":"xp","collection":"xp40","level":10,"animation":"slide_in","text":"Creative Mind","colors":["#38BDF8","#2563EB"]}', 1, 2320, 0, 0),
  ('xp40_title_friendly_soul', 'title', 'Friendly Soul', 'A warm pink nameplate for positive members.', 'common', '{"key":"xp40.title_friendly_soul","tier":"xp","collection":"xp40","level":15,"animation":"gentle_glow","text":"Friendly Soul","colors":["#F472B6","#BE185D"]}', 1, 2330, 0, 0),
  ('xp40_title_active_user', 'title', 'Active User', 'A bright amber nameplate for active members.', 'common', '{"key":"xp40.title_active_user","tier":"xp","collection":"xp40","level":20,"animation":"slide_in","text":"Active User","colors":["#FBBF24","#D97706"]}', 1, 2340, 0, 0),
  ('xp40_title_vote_lover', 'title', 'Vote Lover', 'A violet nameplate for dedicated voters.', 'common', '{"key":"xp40.title_vote_lover","tier":"xp","collection":"xp40","level":25,"animation":"gentle_glow","text":"Vote Lover","colors":["#A78BFA","#7C3AED"]}', 1, 2350, 0, 0),
  ('xp40_title_comment_pro', 'title', 'Comment Pro', 'A cool indigo nameplate for conversation regulars.', 'common', '{"key":"xp40.title_comment_pro","tier":"xp","collection":"xp40","level":30,"animation":"slide_in","text":"Comment Pro","colors":["#818CF8","#4338CA"]}', 1, 2360, 0, 0),
  ('xp40_title_social_star', 'title', 'Social Star', 'A cyan nameplate for connected community members.', 'common', '{"key":"xp40.title_social_star","tier":"xp","collection":"xp40","level":35,"animation":"gentle_glow","text":"Social Star","colors":["#22D3EE","#0891B2"]}', 1, 2370, 0, 0),
  ('xp40_title_contest_player', 'title', 'Contest Player', 'A cheerful orange nameplate for contest regulars.', 'common', '{"key":"xp40.title_contest_player","tier":"xp","collection":"xp40","level":40,"animation":"slide_in","text":"Contest Player","colors":["#FB923C","#C2410C"]}', 1, 2380, 0, 0),
  ('xp40_title_community_hero', 'title', 'Community Hero', 'A colorful nameplate earned at the final free milestone.', 'common', '{"key":"xp40.title_community_hero","tier":"xp","collection":"xp40","level":50,"animation":"gentle_glow","text":"Community Hero","colors":["#C084FC","#7C3AED"]}', 1, 2390, 0, 0);

INSERT OR IGNORE INTO xp_cosmetic_unlocks (item_id, collection, category, unlock_level, item_order, created_at) VALUES
  ('xp40_frame_default', 'xp40', 'frame', 0, 0, 0), ('xp40_frame_green_leaf', 'xp40', 'frame', 5, 1, 0),
  ('xp40_frame_blue_wave', 'xp40', 'frame', 10, 2, 0), ('xp40_frame_pink_heart', 'xp40', 'frame', 15, 3, 0),
  ('xp40_frame_star_light', 'xp40', 'frame', 20, 4, 0), ('xp40_frame_fire_ring', 'xp40', 'frame', 25, 5, 0),
  ('xp40_frame_ice_crystal', 'xp40', 'frame', 30, 6, 0), ('xp40_frame_nature', 'xp40', 'frame', 35, 7, 0),
  ('xp40_frame_purple_aura', 'xp40', 'frame', 40, 8, 0), ('xp40_frame_rainbow', 'xp40', 'frame', 50, 9, 0),
  ('xp40_theme_default', 'xp40', 'theme', 0, 0, 0), ('xp40_theme_sunny_day', 'xp40', 'theme', 5, 1, 0),
  ('xp40_theme_cherry_blossom', 'xp40', 'theme', 10, 2, 0), ('xp40_theme_ocean_wave', 'xp40', 'theme', 15, 3, 0),
  ('xp40_theme_sunset', 'xp40', 'theme', 20, 4, 0), ('xp40_theme_forest', 'xp40', 'theme', 25, 5, 0),
  ('xp40_theme_night_sky', 'xp40', 'theme', 30, 6, 0), ('xp40_theme_city_lights', 'xp40', 'theme', 35, 7, 0),
  ('xp40_theme_cloud_fantasy', 'xp40', 'theme', 40, 8, 0), ('xp40_theme_minimal_dark', 'xp40', 'theme', 50, 9, 0),
  ('xp40_badge_newbie', 'xp40', 'badge', 0, 0, 0), ('xp40_badge_active_user', 'xp40', 'badge', 5, 1, 0),
  ('xp40_badge_first_post', 'xp40', 'badge', 10, 2, 0), ('xp40_badge_supporter', 'xp40', 'badge', 15, 3, 0),
  ('xp40_badge_voter', 'xp40', 'badge', 20, 4, 0), ('xp40_badge_commenter', 'xp40', 'badge', 25, 5, 0),
  ('xp40_badge_social', 'xp40', 'badge', 30, 6, 0), ('xp40_badge_explorer', 'xp40', 'badge', 35, 7, 0),
  ('xp40_badge_streak', 'xp40', 'badge', 40, 8, 0), ('xp40_badge_dedicated', 'xp40', 'badge', 50, 9, 0),
  ('xp40_title_new_member', 'xp40', 'title', 0, 0, 0), ('xp40_title_rising_user', 'xp40', 'title', 5, 1, 0),
  ('xp40_title_creative_mind', 'xp40', 'title', 10, 2, 0), ('xp40_title_friendly_soul', 'xp40', 'title', 15, 3, 0),
  ('xp40_title_active_user', 'xp40', 'title', 20, 4, 0), ('xp40_title_vote_lover', 'xp40', 'title', 25, 5, 0),
  ('xp40_title_comment_pro', 'xp40', 'title', 30, 6, 0), ('xp40_title_social_star', 'xp40', 'title', 35, 7, 0),
  ('xp40_title_contest_player', 'xp40', 'title', 40, 8, 0), ('xp40_title_community_hero', 'xp40', 'title', 50, 9, 0);
