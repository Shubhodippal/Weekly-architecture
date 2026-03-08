-- Users table
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  email       TEXT    UNIQUE NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'user',
  last_login  TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- OTPs table  (OTP stored as SHA-256 hash for security)
CREATE TABLE IF NOT EXISTS otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  otp_hash   TEXT    NOT NULL,
  created_at TEXT    DEFAULT (datetime('now')),
  used       INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps (email, used);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
