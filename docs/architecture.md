# Архитектура

## Дефолты

- Linear default team: **Labpics** (`team_id=9bb39310-30fb-49d4-936f-041f7c83b494`, key `LAB`)
- Timezone: `Europe/London`

## Компоненты

- Telegram Bot Webhook (Worker)
- Supabase (state store)
- Composio MCP tools (Attio + Linear)

## Основной принцип

- Draft-first + Apply/Cancel
- Идемпотентность: `(draft_id, callback_query_id)`

## Эндпоинты Worker

- `POST /telegram/webhook`
- `GET /health`

## State machine

- `IDLE`
- `WAIT_TASK_SOURCE`
- `WAIT_CLIENT_MASS_INPUT`
- `WAIT_TZ_PROMPT`
- `WAIT_TZ_ANSWERS`

## DB

См. `supabase/migrations/*`.

## Cache

- `linear_users_cache`
- `linear_teams_cache`
- `linear_projects_cache`
