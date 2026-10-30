-- Earned (XP) vs Premium (Shop) cosmetics.
--
-- 1. Every XP item (level milestones, achievements: migrations 0070/0071)
--    points at its "Earned" artwork in apps/expo/assets/xp via
--    `asset.key` = `xp.<kind>_<file>`, is tagged `tier: xp` with the level it
--    unlocks at, and stops animating: motion is the hallmark of Premium items.
--    Only rows still on their default key (none, or the 0071 `frame.*` vector
--    key) are touched, so an admin-chosen key is kept.
-- 2. Every Shop item from 0076 is tagged `tier: premium`.
--
-- Older app builds ignore `tier` / `level` and do not know the `xp.*` keys, so
-- they keep drawing the vector ring by id and rarity, as before.

UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.frame_bronze', '$.tier', 'xp', '$.animated', json('false'), '$.level', 5), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'frame_bronze' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.frame_silver', '$.tier', 'xp', '$.animated', json('false'), '$.level', 15), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'frame_silver' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.frame_gold_pulse', '$.tier', 'xp', '$.animated', json('false'), '$.level', 25), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'frame_gold_animated' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.frame_champion', '$.tier', 'xp', '$.animated', json('false'), '$.level', 50), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'frame_champion' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.frame_diamond_aura', '$.tier', 'xp', '$.animated', json('false'), '$.level', 90), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'frame_diamond_animated' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.frame_legendary', '$.tier', 'xp', '$.animated', json('false'), '$.level', 100), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'frame_legendary' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.theme_midnight', '$.tier', 'xp', '$.animated', json('false'), '$.level', 15), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'theme_midnight' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.theme_royal', '$.tier', 'xp', '$.animated', json('false'), '$.level', 60), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'theme_royal' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.badge_rare_creator', '$.tier', 'xp', '$.animated', json('false'), '$.level', 35), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'badge_rare_creator' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.title_creator', '$.tier', 'xp', '$.animated', json('false'), '$.level', 10), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'title_creator' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.title_champion', '$.tier', 'xp', '$.animated', json('false'), '$.level', 50), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'title_champion' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.title_legend', '$.tier', 'xp', '$.animated', json('false'), '$.level', 100), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'title_legend' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.sticker_first_win', '$.tier', 'xp', '$.animated', json('false')), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'sticker_first_win' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.sticker_streak_30', '$.tier', 'xp', '$.animated', json('false')), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'sticker_streak_30' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.collectible_season_star', '$.tier', 'xp', '$.animated', json('false'), '$.level', 40), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'collectible_season_star' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.collectible_elite_set', '$.tier', 'xp', '$.animated', json('false'), '$.level', 75), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'collectible_elite_set' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.collectible_season_top', '$.tier', 'xp', '$.animated', json('false')), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'collectible_season_top' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');
UPDATE reward_catalog SET asset = json_set(asset, '$.key', 'xp.effect_legend_burst', '$.tier', 'xp', '$.animated', json('false'), '$.level', 100), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 'effect_legend_burst' AND (json_extract(asset, '$.key') IS NULL OR json_extract(asset, '$.key') LIKE 'frame.%');

UPDATE reward_catalog SET asset = json_set(asset, '$.tier', 'premium'), updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE json_extract(asset, '$.key') LIKE 'shop.%' AND json_extract(asset, '$.tier') IS NULL;
