-- Reward History (lib/rewardHistory.ts): one user's ledger rows, newest first,
-- with a (created_at, id) keyset cursor. idx_txn_uid alone makes every page read
-- and sort all of the user's rows; this index serves the filter and the order.
-- Additive: idx_txn_uid stays for the existing queries.
CREATE INDEX IF NOT EXISTS idx_txn_uid_created ON coin_transactions (uid, created_at, id);
