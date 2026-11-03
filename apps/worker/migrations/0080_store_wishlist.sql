-- Shop wishlist: digital store items a user saved for later (lib/wishlist.ts).
--
-- One row per (user, item). Personal data with no value to anyone else, so it
-- is purged on account deletion (lib/accountDeletion.ts). Capped per user in
-- the Worker (WISHLIST_MAX), not here.
CREATE TABLE IF NOT EXISTS store_wishlist (
  uid        TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uid, item_id)
);
CREATE INDEX IF NOT EXISTS idx_store_wishlist_uid ON store_wishlist (uid, created_at);
