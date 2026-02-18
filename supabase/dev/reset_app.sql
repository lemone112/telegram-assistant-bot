-- DEV-ONLY reset script (DESTRUCTIVE)
-- Purpose: wipe the application schema and (optionally) legacy public tables, then re-apply migrations.
--
-- This script is intentionally NOT a migration.
-- Use it only in disposable dev environments.

-- Drop the entire application schema
DROP SCHEMA IF EXISTS bot CASCADE;

-- Optional: clean up legacy public tables from earlier experiments (safe to run; no-op if absent)
DROP TABLE IF EXISTS public.telegram_users CASCADE;
DROP TABLE IF EXISTS public.drafts CASCADE;
DROP TABLE IF EXISTS public.draft_apply_attempts CASCADE;
DROP TABLE IF EXISTS public.external_links CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.user_input_state CASCADE;
DROP TABLE IF EXISTS public.linear_users_cache CASCADE;
DROP TABLE IF EXISTS public.linear_teams_cache CASCADE;
DROP TABLE IF EXISTS public.linear_projects_cache CASCADE;
DROP TABLE IF EXISTS public.draft_bulk_items CASCADE;

-- Next step (manual): re-apply all SQL migrations in supabase/migrations/ in order.
-- Example via CLI:
--   supabase db reset
-- or (project-specific) apply migrations using your preferred workflow.
