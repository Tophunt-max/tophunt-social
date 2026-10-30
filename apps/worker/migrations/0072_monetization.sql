-- 0072 — Monetization foundation: virtual gifts, digital store listings,
-- ad diagnostics + provider revenue reports, and direct sponsorships.
--
-- Design notes (see MONETIZATION.md):
--  * Coins: no new balance column. Every spend is a `coin_transactions` row
--    written in the same D1 batch as the users UPDATE, so the existing ledger
--    invariants (dpcoin = SUM(amount), locked_coins = SUM(locked_delta)) and the
--    Health checks cover gifts and store purchases with no new code.
--  * Digital items reuse `reward_catalog` (what an item is) and
--    `user_inventory` (who owns it). `store_listings` only adds a coin price and
--    sale rules on top, so there is one ownership table, not two.
--  * Amounts: coins are whole numbers (REAL column, integer values, as in
--    coin_transactions). Money is stored in integer minor units with an explicit
--    currency (`*_micros` for ad revenue, `*_paise` for sponsorship INR).
--  * All DDL is idempotent.

-- ---------------------------------------------------------------- gifts

CREATE TABLE IF NOT EXISTS virtual_gifts (
  id          TEXT PRIMARY KEY,                 -- slug, e.g. 'rose'
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'reaction',
  price_coins INTEGER NOT NULL CHECK (price_coins >= 1),
  asset       TEXT NOT NULL DEFAULT '{}',       -- JSON: { emoji?, imageUrl?, lottieUrl? }
  animation   TEXT NOT NULL DEFAULT '{}',       -- JSON: { style?, durationMs? }
  active      INTEGER NOT NULL DEFAULT 1,
  starts_at   INTEGER,
  ends_at     INTEGER,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_virtual_gifts_active ON virtual_gifts (active, sort);

-- One row per send. `id` is deterministic (`gift:<sender>:<requestId>`), so a
-- retried request can never debit twice. Price and creator share are SNAPSHOTS:
-- a later catalogue edit never rewrites history.
CREATE TABLE IF NOT EXISTS gift_transactions (
  id                TEXT PRIMARY KEY,
  sender_uid        TEXT NOT NULL,
  recipient_uid     TEXT NOT NULL,
  gift_id           TEXT NOT NULL,
  gift_name         TEXT NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price_coins  INTEGER NOT NULL CHECK (unit_price_coins >= 1),
  total_coins       INTEGER NOT NULL CHECK (total_coins >= 1),
  locked_spent      INTEGER NOT NULL DEFAULT 0,   -- Diamond part of total_coins
  ledger_id         TEXT NOT NULL,
  context_type      TEXT,                         -- 'profile' | 'match' | 'story'
  context_id        TEXT,
  creator_share_bps INTEGER NOT NULL DEFAULT 0,   -- informational; NOT a payable balance
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_tx_sender ON gift_transactions (sender_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_gift_tx_recipient ON gift_transactions (recipient_uid, created_at);
CREATE INDEX IF NOT EXISTS idx_gift_tx_created ON gift_transactions (created_at);

INSERT OR IGNORE INTO virtual_gifts (id, name, description, category, price_coins, asset, sort, created_at, updated_at) VALUES
  ('heart',     'Heart',     'Show some love',            'reaction', 1,   '{"emoji":"❤️"}', 10, 0, 0),
  ('clap',      'Clap',      'Well done!',                'reaction', 2,   '{"emoji":"👏"}', 20, 0, 0),
  ('rose',      'Rose',      'A rose for a great post',   'flower',   5,   '{"emoji":"🌹"}', 30, 0, 0),
  ('star',      'Star',      'You are a star',            'reaction', 10,  '{"emoji":"⭐"}', 40, 0, 0),
  ('fireworks', 'Fireworks', 'Celebrate big',             'premium',  50,  '{"emoji":"🎆"}', 50, 0, 0),
  ('crown',     'Crown',     'Royal support',             'premium',  100, '{"emoji":"👑"}', 60, 0, 0);

-- ---------------------------------------------------------------- digital store

-- A coin price and sale rules for a `reward_catalog` item. Only 'permanent'
-- ownership is sold today (user_inventory has no expiry column yet).
CREATE TABLE IF NOT EXISTS store_listings (
  item_id      TEXT PRIMARY KEY REFERENCES reward_catalog (id),
  price_coins  INTEGER NOT NULL CHECK (price_coins >= 1),
  ownership    TEXT NOT NULL DEFAULT 'permanent' CHECK (ownership IN ('permanent')),
  refundable   INTEGER NOT NULL DEFAULT 1,
  stock_limit  INTEGER CHECK (stock_limit IS NULL OR stock_limit >= 1),
  sold_count   INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 0,
  starts_at    INTEGER,
  ends_at      INTEGER,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_listings_active ON store_listings (active, sort);

CREATE TABLE IF NOT EXISTS store_purchases (
  id               TEXT PRIMARY KEY,              -- `store:<uid>:<requestId>`
  uid              TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  price_coins      INTEGER NOT NULL CHECK (price_coins >= 1),
  locked_spent     INTEGER NOT NULL DEFAULT 0,
  ledger_id        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  refund_ledger_id TEXT,
  refund_reason    TEXT,
  refunded_by      TEXT,
  refunded_at      INTEGER,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_store_purchases_uid ON store_purchases (uid, created_at);
CREATE INDEX IF NOT EXISTS idx_store_purchases_created ON store_purchases (created_at);
-- At most one live purchase per user and item (re-buy only after a refund).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_purchase_live ON store_purchases (uid, item_id) WHERE status = 'completed';

-- ---------------------------------------------------------------- ads

-- Client-side DIAGNOSTIC counters, aggregated per day. Never proof of payment.
CREATE TABLE IF NOT EXISTS ad_event_counters (
  day        TEXT NOT NULL,                       -- 'YYYY-MM-DD' UTC
  platform   TEXT NOT NULL,
  placement  TEXT NOT NULL,
  provider   TEXT NOT NULL,
  event      TEXT NOT NULL,                       -- request | fill | impression | click | fail | reward_complete
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, platform, placement, provider, event)
);

-- Provider reporting (the financial source of truth), imported by an admin.
CREATE TABLE IF NOT EXISTS ad_revenue_reports (
  id             TEXT PRIMARY KEY,
  day            TEXT NOT NULL,
  provider       TEXT NOT NULL,
  placement      TEXT NOT NULL DEFAULT 'all',
  platform       TEXT NOT NULL DEFAULT 'all',
  requests       INTEGER NOT NULL DEFAULT 0,
  matched        INTEGER NOT NULL DEFAULT 0,
  impressions    INTEGER NOT NULL DEFAULT 0,
  clicks         INTEGER NOT NULL DEFAULT 0,
  revenue_micros INTEGER NOT NULL DEFAULT 0,      -- 1 unit = 1e-6 of `currency`
  currency       TEXT NOT NULL DEFAULT 'USD',
  status         TEXT NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated', 'finalized')),
  source         TEXT NOT NULL DEFAULT 'manual_import',
  imported_by    TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ad_revenue_row ON ad_revenue_reports (day, provider, placement, platform);

-- ---------------------------------------------------------------- sponsorships

CREATE TABLE IF NOT EXISTS advertisers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_email TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  notes         TEXT,
  created_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsored_campaigns (
  id             TEXT PRIMARY KEY,
  advertiser_id  TEXT NOT NULL REFERENCES advertisers (id),
  title          TEXT NOT NULL,
  placement      TEXT NOT NULL DEFAULT 'feed' CHECK (placement IN ('feed')),
  status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending', 'approved', 'paused', 'ended', 'rejected')),
  starts_at      INTEGER NOT NULL,
  ends_at        INTEGER NOT NULL,
  pricing_model  TEXT NOT NULL DEFAULT 'flat' CHECK (pricing_model IN ('flat', 'cpm')),
  budget_paise   INTEGER NOT NULL DEFAULT 0,
  cpm_paise      INTEGER NOT NULL DEFAULT 0,
  impression_cap INTEGER,                         -- stop serving after this many (NULL = no cap)
  weight         INTEGER NOT NULL DEFAULT 1,
  creative       TEXT NOT NULL DEFAULT '{}',      -- JSON: headline, body, imageUrl, ctaLabel, ctaUrl
  disclosure     TEXT NOT NULL DEFAULT 'Sponsored',
  invoice_ref    TEXT,
  payment_ref    TEXT,
  approved_by    TEXT,
  approved_at    INTEGER,
  created_by     TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sponsored_live ON sponsored_campaigns (placement, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_sponsored_advertiser ON sponsored_campaigns (advertiser_id);

-- Aggregated, privacy-safe delivery counts (no per-user rows).
CREATE TABLE IF NOT EXISTS campaign_daily_stats (
  campaign_id TEXT NOT NULL,
  day         TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campaign_id, day)
);
