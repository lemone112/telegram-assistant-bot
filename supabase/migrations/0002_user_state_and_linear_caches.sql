-- Migration 0002: user input state + Linear caches

CREATE TABLE IF NOT EXISTS public.user_input_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id uuid REFERENCES public.telegram_users(id) ON DELETE CASCADE,
  state text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id)
);

CREATE TABLE IF NOT EXISTS public.linear_users_cache (
  id text PRIMARY KEY,
  name text NOT NULL,
  display_name text,
  email text,
  active boolean NOT NULL DEFAULT true,
  admin boolean NOT NULL DEFAULT false,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS linear_users_cache_active_idx ON public.linear_users_cache(active);

CREATE TABLE IF NOT EXISTS public.linear_teams_cache (
  id text PRIMARY KEY,
  key text,
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.linear_projects_cache (
  id text PRIMARY KEY,
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.draft_bulk_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('client','team')),
  item_index int NOT NULL,
  raw_block text,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_valid boolean NOT NULL DEFAULT false,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (draft_id, item_type, item_index)
);
CREATE INDEX IF NOT EXISTS draft_bulk_items_draft_id_idx ON public.draft_bulk_items(draft_id);
