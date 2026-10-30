-- 0073 — Closed-loop economy: physical shop (DP coin) and XP → Diamond conversion.
-- See MONETIZATION.md.
-- Money: product prices are stored in paise (INR); every order stores the
-- DP coin price it was charged AND the ₹-per-DP-coin rate used, so a later
-- rate change never rewrites an order.

-- ---------------------------------------------------------------- shop

CREATE TABLE IF NOT EXISTS shop_products (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  category           TEXT NOT NULL DEFAULT 'general',
  images             TEXT NOT NULL DEFAULT '[]',      -- JSON array of https URLs
  price_inr_paise    INTEGER NOT NULL CHECK (price_inr_paise >= 100),
  shipping_inr_paise INTEGER NOT NULL DEFAULT 0 CHECK (shipping_inr_paise >= 0),
  return_days        INTEGER NOT NULL DEFAULT 7 CHECK (return_days >= 0),
  active             INTEGER NOT NULL DEFAULT 0,
  featured           INTEGER NOT NULL DEFAULT 0,
  sort               INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_products_live ON shop_products (active, category, sort);

-- Every product has at least one variant; stock lives here.
CREATE TABLE IF NOT EXISTS shop_variants (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES shop_products (id),
  label      TEXT NOT NULL DEFAULT 'Standard',
  sku        TEXT,
  stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_variants_product ON shop_variants (product_id, sort);

CREATE TABLE IF NOT EXISTS shop_orders (
  id               TEXT PRIMARY KEY,                -- `order:<uid>:<requestId>`
  uid              TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'placed'
                     CHECK (status IN ('placed','packed','shipped','delivered','cancelled','return_requested','returned','return_rejected')),
  total_coins      INTEGER NOT NULL CHECK (total_coins >= 1),
  total_inr_paise  INTEGER NOT NULL,
  dp_coin_inr      REAL NOT NULL,                   -- ₹ per DP coin at order time
  address          TEXT NOT NULL,                   -- JSON snapshot
  ledger_id        TEXT NOT NULL,
  carrier          TEXT,
  tracking_number  TEXT,
  tracking_url     TEXT,
  user_note        TEXT,
  refund_ledger_id TEXT,
  delivered_at     INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_uid ON shop_orders (uid, created_at);
CREATE INDEX IF NOT EXISTS idx_shop_orders_status ON shop_orders (status, created_at);

CREATE TABLE IF NOT EXISTS shop_order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL,                   -- shop_orders.id (no FK: written before the order row in the checkout batch)
  product_id      TEXT NOT NULL,
  variant_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  variant_label   TEXT NOT NULL,
  image           TEXT,
  qty             INTEGER NOT NULL CHECK (qty >= 1),
  unit_coins      INTEGER NOT NULL CHECK (unit_coins >= 1),
  unit_inr_paise  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_order_items_order ON shop_order_items (order_id);

CREATE TABLE IF NOT EXISTS shop_order_history (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor       TEXT NOT NULL,                        -- uid, 'server', or 'user'
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_order_history_order ON shop_order_history (order_id, created_at);

-- ---------------------------------------------------------------- XP → Diamond

-- XP already converted. Convertible XP = xp - xp_converted, so converting never
-- lowers `xp` (levels, leaderboards and the XP ledger are untouched).
ALTER TABLE users ADD COLUMN xp_converted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS xp_conversions (
  id         TEXT PRIMARY KEY,                      -- `xpconv:<uid>:<requestId>`
  uid        TEXT NOT NULL,
  day        INTEGER NOT NULL,
  xp_spent   INTEGER NOT NULL CHECK (xp_spent >= 1),
  diamonds   INTEGER NOT NULL CHECK (diamonds >= 1),
  nonce      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_conversions_uid_day ON xp_conversions (uid, day);
