-- Shop digital items: 16 cosmetics (frames, profile themes, badges, titles)
-- with DP coin prices, listed for sale.
--
-- Artwork ships in the app (apps/expo/assets/shop/digital, keyed by
-- `asset.key` = `shop.<file>`). `colors` / `icon` / `animated` are kept so an
-- older app build still draws a sensible ring or disc by rarity.
--
-- Prices follow rarity. A typical contest win pays ~150 DP coin:
--   common 49 · uncommon 99 · rare 199 · epic 399 · legendary 799
--
-- Additive and idempotent (INSERT OR IGNORE): an admin edit to any of these
-- rows, made before or after this runs, is never overwritten. Prices, stock,
-- sale windows and on/off are edited in Admin → Monetization → Store.
INSERT OR IGNORE INTO reward_catalog (id, type, name, description, rarity, asset, sort, created_at, updated_at) VALUES
  ('shop_frame_rose_petal', 'frame', 'Rose Petal Frame', 'Soft pink ring with rose petals round your photo.', 'common',
   '{"key":"shop.frame_rose_petal","colors":["#FF8FB1","#FF4D67"],"animated":false}', 1010, 0, 0),
  ('shop_frame_ocean_wave', 'frame', 'Ocean Wave Frame', 'Cool blue ring with a rolling wave.', 'uncommon',
   '{"key":"shop.frame_ocean_wave","colors":["#22D3EE","#2563EB"],"animated":false}', 1020, 0, 0),
  ('shop_frame_neon_pulse', 'frame', 'Neon Pulse Frame', 'Glowing neon double ring that pulses.', 'rare',
   '{"key":"shop.frame_neon_pulse","colors":["#22D3EE","#A855F7"],"animated":true}', 1030, 0, 0),
  ('shop_frame_fire_blaze', 'frame', 'Fire Blaze Frame', 'A ring of flames for the hottest creators.', 'epic',
   '{"key":"shop.frame_fire_blaze","colors":["#FDE047","#DC2626"],"animated":true}', 1040, 0, 0),
  ('shop_frame_galaxy_swirl', 'frame', 'Galaxy Swirl Frame', 'Deep-space ring full of stars.', 'epic',
   '{"key":"shop.frame_galaxy_swirl","colors":["#7C3AED","#EC4899"],"animated":true}', 1050, 0, 0),
  ('shop_frame_royal_crown', 'frame', 'Royal Crown Frame', 'Gold ring with gems and a crown. Pure royalty.', 'legendary',
   '{"key":"shop.frame_royal_crown","colors":["#FCD34D","#B45309"],"animated":true}', 1060, 0, 0),

  ('shop_theme_sunset_glow', 'theme', 'Sunset Glow Theme', 'Warm sunset behind your profile.', 'common',
   '{"key":"shop.theme_sunset_glow","colors":["#FF9A8B","#FF6A88"]}', 1110, 0, 0),
  ('shop_theme_aurora', 'theme', 'Aurora Theme', 'Northern lights across your profile.', 'rare',
   '{"key":"shop.theme_aurora","colors":["#34D399","#A78BFA"]}', 1120, 0, 0),
  ('shop_theme_cyber_neon', 'theme', 'Cyber Neon Theme', 'Retro neon city skyline.', 'epic',
   '{"key":"shop.theme_cyber_neon","colors":["#C026D3","#22D3EE"]}', 1130, 0, 0),
  ('shop_theme_golden_hour', 'theme', 'Golden Hour Theme', 'Golden rays and sparkles. The premium look.', 'legendary',
   '{"key":"shop.theme_golden_hour","colors":["#FBBF24","#9A3412"]}', 1140, 0, 0),

  ('shop_badge_trendsetter', 'badge', 'Trendsetter Badge', 'Lightning shield next to your name.', 'uncommon',
   '{"key":"shop.badge_trendsetter","icon":"flash","color":"#E11D48","colors":["#FF8FA3","#E11D48"]}', 1210, 0, 0),
  ('shop_badge_fan_favourite', 'badge', 'Fan Favourite Badge', 'Show everyone the fans love you.', 'rare',
   '{"key":"shop.badge_fan_favourite","icon":"heart","color":"#BE185D","colors":["#F472B6","#BE185D"]}', 1220, 0, 0),
  ('shop_badge_elite_hunter', 'badge', 'Elite Hunter Badge', 'Gold-starred emblem for elite hunters.', 'epic',
   '{"key":"shop.badge_elite_hunter","icon":"medal","color":"#8B5CF6","colors":["#8B5CF6","#F59E0B"]}', 1230, 0, 0),

  ('shop_title_style_icon', 'title', 'Style Icon Title', 'Wear the "Style Icon" title.', 'common',
   '{"key":"shop.title_style_icon","text":"Style Icon","colors":["#F9A8D4","#A855F7"]}', 1310, 0, 0),
  ('shop_title_trend_boss', 'title', 'Trend Boss Title', 'Wear the "Trend Boss" title.', 'rare',
   '{"key":"shop.title_trend_boss","text":"Trend Boss","colors":["#FDE047","#DC2626"]}', 1320, 0, 0),
  ('shop_title_hunt_master', 'title', 'Hunt Master Title', 'Wear the "Hunt Master" title.', 'epic',
   '{"key":"shop.title_hunt_master","text":"Hunt Master","colors":["#FBBF24","#B45309"]}', 1330, 0, 0);

-- Plain multi-row VALUES, not a UNION ALL derived table: D1 caps the number of
-- terms in a compound SELECT and rejected the 16-way union.
INSERT OR IGNORE INTO store_listings (item_id, price_coins, ownership, refundable, stock_limit, sold_count, active, starts_at, ends_at, sort, created_at, updated_at) VALUES
  ('shop_frame_rose_petal', 49, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1010, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_frame_ocean_wave', 99, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1020, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_frame_neon_pulse', 199, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1030, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_frame_fire_blaze', 399, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1040, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_frame_galaxy_swirl', 399, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1050, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_frame_royal_crown', 799, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1060, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_theme_sunset_glow', 49, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1110, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_theme_aurora', 199, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1120, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_theme_cyber_neon', 399, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1130, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_theme_golden_hour', 799, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1140, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_badge_trendsetter', 99, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1210, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_badge_fan_favourite', 199, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1220, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_badge_elite_hunter', 399, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1230, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_title_style_icon', 49, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1310, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_title_trend_boss', 199, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1320, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('shop_title_hunt_master', 399, 'permanent', 1, NULL, 0, 1, NULL, NULL, 1330, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
