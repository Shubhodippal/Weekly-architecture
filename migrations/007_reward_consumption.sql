-- Track how many points were consumed when a reward was fulfilled
ALTER TABLE user_rewards ADD COLUMN points_consumed INTEGER DEFAULT 0;
