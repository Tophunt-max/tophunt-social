-- Diamond rewards for achievements (Rewards Center, lib/achievements.ts).
--
-- An unlocked tier with diamond_reward > 0 creates a reward_grants row
-- (source_type 'achievement'), claimed through claimRewardGrant: paid from the
-- free-rewards budget and counted in the daily free Diamond cap. 0 = XP / item
-- only, which is every existing achievement.
ALTER TABLE achievement_definitions ADD COLUMN diamond_reward INTEGER NOT NULL DEFAULT 0;
