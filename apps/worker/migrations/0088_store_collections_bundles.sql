-- 0088 — Shop Collections and Diamond-priced Shop Bundles (lib/storeBundles.ts).
--
--  * Collections are admin-defined groups of catalogue items ("Anime
--    Collection", "Couple Collection") shown in the app Shop home. Display
--    only: an item can be in many collections and is still bought through its
--    own store listing.
--  * Bundles sell a set of 2-12 catalogue items together for a price in
--    DIAMONDS (users.locked_coins). Contents are items only, never DP coin or
--    Diamonds. Ownership is the usual user_inventory row (source 'store_bundle',
--    source_ref = the bundle purchase id), so a refund revokes exactly what
--    that purchase granted.
--  * A user buys a given bundle at most once while that purchase is completed
--    (partial unique index below, backing the gate in the purchase batch).
--  * Additive and idempotent.

CREATE TABLE IF NOT EXISTS store_collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  image_url   TEXT,
  accent      TEXT NOT NULL DEFAULT 'violet',
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS store_collection_items (
  collection_id TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_store_collection_items_item ON store_collection_items (item_id);

CREATE TABLE IF NOT EXISTS store_bundles (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  image_url           TEXT,
  badge               TEXT,
  price_diamonds      INTEGER NOT NULL CHECK (price_diamonds >= 1),
  compare_at_diamonds INTEGER,
  starts_at           INTEGER,
  ends_at             INTEGER,
  stock_limit         INTEGER CHECK (stock_limit IS NULL OR stock_limit >= 1),
  sold_count          INTEGER NOT NULL DEFAULT 0,
  sort                INTEGER NOT NULL DEFAULT 0,
  active              INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_bundles_active ON store_bundles (active, sort);

CREATE TABLE IF NOT EXISTS store_bundle_items (
  bundle_id TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_store_bundle_items_item ON store_bundle_items (item_id);

-- One row per bundle purchase. `id` is deterministic (bundle:<uid>:<requestId>),
-- so a retried request can never charge twice. Name and price are snapshots.
-- `granted` is the JSON list of item ids this purchase actually granted.
CREATE TABLE IF NOT EXISTS store_bundle_purchases (
  id               TEXT PRIMARY KEY,
  uid              TEXT NOT NULL,
  bundle_id        TEXT NOT NULL,
  bundle_name      TEXT NOT NULL,
  price_diamonds   INTEGER NOT NULL CHECK (price_diamonds >= 1),
  granted          TEXT NOT NULL DEFAULT '[]',
  ledger_id        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  refund_ledger_id TEXT,
  refund_reason    TEXT,
  refunded_by      TEXT,
  refunded_at      INTEGER,
  created_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_bundle_purchase_live ON store_bundle_purchases (uid, bundle_id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_store_bundle_purchases_bundle ON store_bundle_purchases (bundle_id, status);
CREATE INDEX IF NOT EXISTS idx_store_bundle_purchases_created ON store_bundle_purchases (created_at);
