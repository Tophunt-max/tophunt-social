-- Signup bonus anti-fraud (lib/verificationReward.ts).
--
-- The signup bonus (appConfig.rewardSettings.signupBonus) is paid only after the
-- email AND mobile number are verified, and only when the fraud checks pass:
--   hard rules  (never paid): identifier or device already rewarded, disposable email
--   wait        (paid later): account younger than minAccountAgeHours
--   review hold (admin):      no device id, too many bonuses from one IP, a device
--                             shared by many accounts, or "review every bonus"
-- `device_hash` / `ip_hash` are SHA-256 of the raw values: kept only for these
-- checks, never shown.
ALTER TABLE verification_rewards ADD COLUMN review_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE verification_rewards ADD COLUMN risk_flags TEXT;
ALTER TABLE verification_rewards ADD COLUMN device_hash TEXT;
ALTER TABLE verification_rewards ADD COLUMN ip_hash TEXT;
ALTER TABLE verification_rewards ADD COLUMN reviewed_by TEXT;
ALTER TABLE verification_rewards ADD COLUMN reviewed_at INTEGER;
ALTER TABLE verification_rewards ADD COLUMN review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_verification_rewards_review ON verification_rewards (review_status, created_at);
CREATE INDEX IF NOT EXISTS idx_verification_rewards_ip ON verification_rewards (ip_hash, completed_at);
CREATE INDEX IF NOT EXISTS idx_users_device_id ON users (device_id);
