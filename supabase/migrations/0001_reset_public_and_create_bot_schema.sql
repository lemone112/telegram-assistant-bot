-- Migration: reset public schema objects (tables/views/sequences) and create bot tables
-- WARNING: destructive. Intended for fresh environment only.

-- 1) Drop views/tables/sequences in public (do not drop functions: extensions may own them)
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT table_schema, table_name FROM information_schema.views WHERE table_schema='public') LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.table_schema, r.table_name);
  END LOOP;

  FOR r IN (SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public') LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;

  FOR r IN (SELECT sequence_schema, sequence_name FROM information_schema.sequences WHERE sequence_schema='public') LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS %I.%I CASCADE', r.sequence_schema, r.sequence_name);
  END LOOP;
END $$;

-- 2) Extensions needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3) Tables
CREATE TABLE public.telegram_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint UNIQUE NOT NULL,
  username text,
  first_name text,
  last_name text,
  language_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id uuid REFERENCES public.telegram_users(id) ON DELETE SET NULL,
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
CREATE INDEX drafts_status_idx ON public.drafts(status);
CREATE INDEX drafts_chat_id_idx ON public.drafts(chat_id);

CREATE TABLE public.draft_apply_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  callback_query_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text,
  UNIQUE (draft_id, callback_query_id)
);
CREATE INDEX draft_apply_attempts_draft_id_idx ON public.draft_apply_attempts(draft_id);

CREATE TABLE public.external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES public.drafts(id) ON DELETE SET NULL,
  system text NOT NULL CHECK (system IN ('attio','linear')),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX external_links_system_entity_idx ON public.external_links(system, entity_type);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES public.drafts(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info',
  event_type text NOT NULL,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_event_type_idx ON public.audit_log(event_type);
