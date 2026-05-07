CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider      TEXT    PRIMARY KEY,
  access_token  TEXT    NOT NULL DEFAULT '',
  refresh_token TEXT,
  expires_at    INTEGER,
  state         TEXT    -- pending CSRF state, cleared after callback
);
