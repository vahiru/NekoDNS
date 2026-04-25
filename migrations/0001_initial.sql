PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email_verified_at TEXT,
  email_verification_token_hash TEXT,
  email_verification_expires_at TEXT,
  password_reset_token_hash TEXT,
  password_reset_expires_at TEXT,
  telegram_user_id TEXT UNIQUE,
  telegram_bind_token_hash TEXT,
  telegram_bind_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dns_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('A', 'AAAA', 'CNAME', 'TXT')),
  name TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  ttl INTEGER NOT NULL DEFAULT 3600,
  proxied INTEGER NOT NULL DEFAULT 0,
  cloudflare_record_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('create', 'update')),
  target_dns_record_id TEXT,
  subdomain TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('A', 'AAAA', 'CNAME', 'TXT')),
  record_value TEXT NOT NULL,
  purpose TEXT,
  ttl INTEGER NOT NULL DEFAULT 3600,
  proxied INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'applying', 'applied', 'error')),
  admin_notes TEXT,
  voting_deadline_at TEXT NOT NULL,
  telegram_message_id TEXT,
  apply_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_dns_record_id) REFERENCES dns_records(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS application_votes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  admin_telegram_user_id TEXT,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('approve', 'deny')),
  source TEXT NOT NULL CHECK (source IN ('web', 'telegram')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, admin_user_id),
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS abuse_reports (
  id TEXT PRIMARY KEY,
  subdomain TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  reporter_ip TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved', 'ignored')),
  telegram_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'done', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_applications_status_deadline ON applications(status, voting_deadline_at);
CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_application ON application_votes(application_id);
CREATE INDEX IF NOT EXISTS idx_dns_records_user ON dns_records(user_id);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_status ON abuse_reports(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
