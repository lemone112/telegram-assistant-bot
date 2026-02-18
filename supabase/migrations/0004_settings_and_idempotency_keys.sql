-- 0004_settings_and_idempotency_keys.sql
-- Runtime tables required by the Cloudflare Worker implementation.
-- Repo convention: use schema `bot`.

-- 1) Generic key-value settings storage (server-side; keep secrets out of DB)
CREATE TABLE IF NOT EXISTS bot.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Idempotency keys for callback-query Apply (prevents double-apply)
CREATE TABLE IF NOT EXISTS bot.idempotency_keys (
  key text PRIMARY KEY,
  draft_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idempotency_keys_draft_id_idx ON bot.idempotency_keys (draft_id);

-- NOTE: We intentionally do NOT seed bot.settings here because it depends on your Composio
-- connected_account_id(s). Add it manually once you have the IDs, e.g.:
-- INSERT INTO bot.settings(key, value) VALUES (
--   'composio',
--   '{"attio_connection_id":"<CONNECTED_ACCOUNT_ID>"}'::jsonb
-- ) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
