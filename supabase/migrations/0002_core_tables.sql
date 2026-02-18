-- Baseline migration 0002
-- Purpose: create core runtime tables in bot.*
-- NOTE: This repo intentionally keeps all application tables in schema "bot".

CREATE TABLE IF NOT EXISTS bot.telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint UNIQUE NOT NULL,
  username text,
  first_name text,
  last_name text,
  language_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot.drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id uuid REFERENCES bot.telegram_users(id) ON DELETE SET NULL,
  chat_id bigint NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('text','voice')),
  source_text text,
  transcript text,
  intent_summary text,
  status text NOT NULL CHECK (status IN ('DRAFT','APPLIED','CANCELLED','EXPIRED')),
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS drafts_status_idx ON bot.drafts(status);
CREATE INDEX IF NOT EXISTS drafts_chat_id_idx ON bot.drafts(chat_id);

-- Observability for Apply attempts (not the primary idempotency gate)
CREATE TABLE IF NOT EXISTS bot.draft_apply_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES bot.drafts(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text,
  UNIQUE (draft_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS draft_apply_attempts_draft_id_idx ON bot.draft_apply_attempts(draft_id);

CREATE TABLE IF NOT EXISTS bot.external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES bot.drafts(id) ON DELETE SET NULL,
  system text NOT NULL CHECK (system IN ('attio','linear')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS external_links_system_entity_idx ON bot.external_links(system, entity_type);

CREATE TABLE IF NOT EXISTS bot.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES bot.drafts(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_event_type_idx ON bot.audit_log(event_type);

-- Generic key-value settings (server-side). Keep secrets out of DB.
CREATE TABLE IF NOT EXISTS bot.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Global idempotency gate. draft_id is NULLABLE for non-draft operations (jobs, sync, etc.).
CREATE TABLE IF NOT EXISTS bot.idempotency_keys (
  key text PRIMARY KEY,
  draft_id uuid REFERENCES bot.drafts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idempotency_keys_draft_id_idx ON bot.idempotency_keys(draft_id);
