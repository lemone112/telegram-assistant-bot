# Supabase migrations baseline (bot schema)

## Why
This repository uses a **single application schema**: `bot`.

Reasoning:
- Cloudflare Worker is configured with `SUPABASE_SCHEMA=bot` by default (see `wrangler.toml`).
- Keeping runtime tables split across `public.*` and `bot.*` is a common source of subtle production bugs.

## What lives where
- `bot.*`: **all application/runtime tables** (drafts, audit, settings, idempotency, caches, etc.)
- `public`: extensions only (e.g. `pgcrypto`)

## Baseline migrations
Migrations are intentionally “non-destructive”. They should never wipe `public`.

Current baseline:
- `supabase/migrations/0001_extensions_and_schema.sql`
- `supabase/migrations/0002_core_tables.sql`
- `supabase/migrations/0003_user_state_linear_caches_bulk.sql`
- `supabase/migrations/0004_design_studio_sales_to_linear.sql`

## Dev-only reset
A destructive reset is provided for disposable dev environments only:
- `supabase/dev/reset_app.sql`

> This script drops the whole `bot` schema and optionally legacy `public.*` tables.
> Do **not** run it in production.

## Smoke-check SQL
After applying migrations, verify:

- tables exist in `bot`:
  - `select table_name from information_schema.tables where table_schema='bot' order by table_name;`
- app tables do not exist in `public`:
  - `select table_name from information_schema.tables where table_schema='public' and table_name in ('drafts','telegram_users','audit_log');`
