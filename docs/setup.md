# Setup

## 1) GitHub Actions secrets and variables

Add these in: GitHub → Settings → Secrets and variables → Actions.

### Secrets (required)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COMPOSIO_API_KEY`

### Variables (recommended)
- `CF_WORKER_NAME` (default: `telegram-assistant-bot`)
- `SUPABASE_SCHEMA` (default: `bot`)
- `SUPABASE_PROJECT_REF` (example: `igobxicuyfzkpoekamwt`)
- `PAUSE_REMINDER_DAYS` (default: `7`)
- `BOT_ALLOWED_TELEGRAM_USER_IDS` (comma-separated telegram user IDs)
- `LINEAR_TEAM_ID` (UUID; get it via `/admin linear teams`)

## 2) Cloudflare Worker

This repo deploys a Cloudflare Worker via GitHub Actions on every push to `main`.

Worker endpoints:
- `GET /health`
- `POST /telegram/webhook`

## 3) Telegram webhook

After deploy, set bot webhook to:

- `https://<worker-subdomain>.workers.dev/telegram/webhook`

Use Bot API `setWebhook`.

## 4) Supabase

Apply migrations in `supabase/migrations/*`.

Important:
- all application tables are created under schema `bot`
- destructive reset is DEV-ONLY: see `supabase/dev/reset_app.sql`
- baseline docs: `docs/supabase/migrations-baseline.md`
- DB contract: `docs/supabase/db-contract.md`

## 5) Composio execution

The worker executes Attio/Linear actions using Composio.

Minimal requirements:
- `COMPOSIO_API_KEY` as a secret
- each operation is executed only after Draft → Apply

Idempotency policy:
- Draft apply gate: `bot.idempotency_keys` (e.g. `tg:callback:<callback_query_id>`)
- One Linear project per Attio deal: `bot.deal_linear_links.attio_deal_id` PK
- One template task per Linear project: `(linear_project_id, template_task_key)` PK

## 6) Admin commands (restricted)

Admin commands are restricted to users listed in `BOT_ALLOWED_TELEGRAM_USER_IDS`.

- `/admin status`
- `/admin composio show`
- `/admin composio attio <connected_account_id>`
- `/admin composio linear <connected_account_id>`
- `/admin linear teams` — prints Linear teams with UUIDs (use as `LINEAR_TEAM_ID`)
