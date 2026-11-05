-- 0089 — One owner per catalogue item (admin panel: Shop vs Earning).
--
-- `reward_catalog` rows were writable from three admin editors: Gamification →
-- Catalog (raw JSON asset), Shopping → Digital items (validated, uploads) and
-- Gamification → XP level rewards. Two of them could edit the same row, so a
-- raw edit could drop a Shop item's uploaded artwork or Premium tier.
--
-- `managed_by` records which side owns the row; the admin write routes accept
-- a row only on its own side (routes/adminGamification.ts,
-- routes/adminMonetization.ts):
--   'xp'      — free XP level rewards (xp_cosmetic_unlocks): XP level rewards only;
--   'shop'    — sold or Shop-made items: Shopping → Digital items only;
--   'earning' — everything else (achievement, season, milestone, grant
--               rewards): Gamification → Catalog only.
--
-- Additive: one column with a default, then a backfill from the facts already
-- in the database. XP wins over Shop (an XP reward can never be listed, see
-- adminMonetization.ts), and anything sold, bundled, in a Shop collection, on
-- the Premium tier, with uploaded art or a bundled `shop.*` key is Shop.

ALTER TABLE reward_catalog ADD COLUMN managed_by TEXT NOT NULL DEFAULT 'earning'
  CHECK (managed_by IN ('shop', 'earning', 'xp'));

UPDATE reward_catalog SET managed_by = 'xp'
 WHERE id IN (SELECT item_id FROM xp_cosmetic_unlocks);

UPDATE reward_catalog SET managed_by = 'shop'
 WHERE managed_by = 'earning'
   AND (
        id IN (SELECT item_id FROM store_listings)
     OR id IN (SELECT item_id FROM store_bundle_items)
     OR id IN (SELECT item_id FROM store_collection_items)
     OR json_extract(asset, '$.tier') = 'premium'
     OR json_extract(asset, '$.imageUrl') IS NOT NULL
     OR json_extract(asset, '$.key') LIKE 'shop.%'
   );

CREATE INDEX IF NOT EXISTS idx_reward_catalog_managed_by ON reward_catalog (managed_by);
