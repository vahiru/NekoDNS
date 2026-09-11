-- Token lookups scanned the whole users table on every verification, reset and bind attempt.
-- Partial indexes keep them small: only rows with a live token are indexed.
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users(email_verification_token_hash) WHERE email_verification_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users(password_reset_token_hash) WHERE password_reset_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_telegram_bind_token
  ON users(telegram_bind_token_hash) WHERE telegram_bind_token_hash IS NOT NULL;

-- Session revocation on password change, and the cron expiry sweep.
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- replayDueOutbox() polls this every five minutes.
CREATE INDEX IF NOT EXISTS idx_outbox_jobs_replay ON outbox_jobs(status, run_after);

-- Subdomain availability checks on application submit.
CREATE INDEX IF NOT EXISTS idx_applications_subdomain ON applications(subdomain, status);

-- token_hash is already UNIQUE, which carries its own index.
DROP INDEX IF EXISTS idx_sessions_token;
