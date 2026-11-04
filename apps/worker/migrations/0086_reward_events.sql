-- Special events (Rewards Center, lib/rewardEvents.ts).
--
-- An admin-made, time-limited campaign with up to 10 tasks. A user joins, the
-- server counts each task's progress from the moment they joined (metrics are
-- the quest metrics: votes, entries, wins, checkins, active_days, xp), and a
-- completed task is claimed for Diamonds once (reward_event_claims PK). Paid
-- from the free-rewards budget, counted in the daily free Diamond cap, and
-- capped per event by total_budget (sum of claims).
CREATE TABLE IF NOT EXISTS reward_events (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  banner_url            TEXT,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  starts_at             INTEGER NOT NULL,
  ends_at               INTEGER NOT NULL,
  min_level             INTEGER NOT NULL DEFAULT 1,
  min_account_age_days  INTEGER NOT NULL DEFAULT 0,
  require_verified      INTEGER NOT NULL DEFAULT 0,
  total_budget          INTEGER,
  tasks                 TEXT NOT NULL DEFAULT '[]',
  sort                  INTEGER NOT NULL DEFAULT 0,
  created_by            TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_events_window ON reward_events (status, ends_at);

CREATE TABLE IF NOT EXISTS reward_event_participants (
  event_id   TEXT NOT NULL,
  uid        TEXT NOT NULL,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_reward_event_participants_uid ON reward_event_participants (uid);

CREATE TABLE IF NOT EXISTS reward_event_claims (
  event_id    TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  uid         TEXT NOT NULL,
  coins       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (event_id, task_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_reward_event_claims_event ON reward_event_claims (event_id);
