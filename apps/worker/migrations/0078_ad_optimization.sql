-- Ad optimization (lib/adOptimizer.ts, lib/adStats.ts, lib/adRevenueImport.ts).
--
-- ad_stats: per day / platform / slot / network / country / experiment variant,
-- what the app reported, plus load latency for adaptive timeouts. Replaces
-- reading ad_event_counters for the optimizer (that table keeps being written
-- for the existing report).
CREATE TABLE IF NOT EXISTS ad_stats (
  day          TEXT NOT NULL,
  platform     TEXT NOT NULL,
  placement    TEXT NOT NULL,
  provider     TEXT NOT NULL,                    -- network id from the ad platform (or SDK type)
  country      TEXT NOT NULL DEFAULT 'ZZ',
  variant      TEXT NOT NULL DEFAULT '-',        -- experiment variant id, '-' = none
  requests     INTEGER NOT NULL DEFAULT 0,
  fills        INTEGER NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  fails        INTEGER NOT NULL DEFAULT 0,
  timeouts     INTEGER NOT NULL DEFAULT 0,
  rewards      INTEGER NOT NULL DEFAULT 0,
  latency_ms   INTEGER NOT NULL DEFAULT 0,       -- sum over fills, for the mean
  PRIMARY KEY (day, platform, placement, provider, country, variant)
);
CREATE INDEX IF NOT EXISTS idx_ad_stats_day ON ad_stats (day);

-- Impression-level revenue the SDK reports (AdMob onPaidEvent), per currency.
CREATE TABLE IF NOT EXISTS ad_ilrd (
  day          TEXT NOT NULL,
  platform     TEXT NOT NULL,
  placement    TEXT NOT NULL,
  provider     TEXT NOT NULL,
  variant      TEXT NOT NULL DEFAULT '-',
  currency     TEXT NOT NULL,
  micros       INTEGER NOT NULL DEFAULT 0,
  events       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, platform, placement, provider, variant, currency)
);

-- Alerts raised by the hourly ad health check (also sent as admin notifications).
CREATE TABLE IF NOT EXISTS ad_alerts (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                     -- fill_drop | fail_spike | ecpm_drop | reconcile | network_paused | import_failed
  placement   TEXT,
  provider    TEXT,
  platform    TEXT,
  message     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_alerts_created ON ad_alerts (created_at);
