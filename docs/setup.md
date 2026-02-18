# Setup

## 1) GitHub Actions secrets and variables

Add these in: GitHub → Settings → Secrets and variables → Actions.

### Secrets (required)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Variables (recommended)
- `CF_WORKER_NAME` (default: `telegram-assistant-bot`)
- `SUPABASE_SCHEMA` (default: `bot`)
- `PAUSE_REMINDER_DAYS` (default: `7`)
- `BOT_ALLOWED_TELEGRAM_USER_IDS` (comma-separated telegram user IDs)

## 2) Cloudflare Worker

This repo deploys a Cloudflare Worker via GitHub Actions on every push to `main`.

Worker endpoints:
- `GET /health`
- `POST /telegram/webhook`

## 3) Telegram webhook

After deploy, set bot webhook to:

- `https://<worker-subdomain>.workers.dev/telegram/webhook`

Use Bot API `setWebhook` or BotFather instructions.

## 4) Supabase

Apply migrations in `supabase/migrations/*`.

Important:
- tables are created under schema `bot`
- PostgREST schema cache may not expose `bot.*` by default; server-side SQL works fine

## 5) Notes about Composio execution

The worker implementation executes Attio/Linear actions via Composio-connected toolkits.

Implementation notes:
- Keep all mutating operations behind Draft → Apply.
- Enforce idempotency at two layers:
  - Draft apply idempotency: `(draft_id, callback_query_id)`
  - Domain idempotency:
    - one Linear project per Attio deal: `bot.deal_linear_links.attio_deal_id` PK
    - one template task per project: `(linear_project_id, template_task_key)` PK
