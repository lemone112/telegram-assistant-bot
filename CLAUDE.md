# CLAUDE.md — Project Knowledge Base

## Code Review Policy (CRITICAL)

- **На каждый PR через 2-3 минуты прилетает Code Review от Codex.**
- Codex review нужно ИСКАТЬ (он может быть не сразу виден) и АНАЛИЗИРОВАТЬ.
- **Статистически Codex всегда был прав** — его замечания считаются обязательными к исправлению.
- Не мержить PR, пока не обработаны все замечания Codex.
- Если замечание Codex решено не исправлять — нужно явное обоснование в PR.

## Access Control

- `BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS` — абсолютные админы (формат: userid,userid)
- `BOT_ALLOWED_TELEGRAM_USER_IDS` — обычные пользователи (формат: userid,userid)
- Админ может управлять whitelist других пользователей.

## Связанные проекты

### labpics-dashboard (GitHub: lemone112/labpics-dashboard)

Основная BI-платформа компании. Telegram-бот ДОЛЖЕН интегрироваться с ней:

- **Общая PostgreSQL БД** (`labpics`) — основная точка интеграции
- **LightRAG API** (`POST /lightrag/query`) — семантический поиск по всем данным
- **Redis Pub/Sub** (канал `job_completed`) — push-уведомления при изменении данных
- **Схема уже поддерживает `telegram`** как канал в `outbound_messages`, `campaigns`, `contact_channel_policies`
- **Project scoping обязателен** — бот должен работать в рамках `(project_id, account_scope_id)`

Стек dashboard: Fastify + Next.js + PostgreSQL 16 (pgvector) + Redis 7 + OpenAI embeddings.

## Technical Decisions

- STT: OpenAI Whisper (`whisper-1`)
- Runtime: **Docker-контейнер рядом с labpics-dashboard** (Node.js + Fastify)
- DB: **Shared PostgreSQL** (`labpics`) — dashboard таблицы (read) + `bot` schema (read-write)
- Integrations: Composio MCP (Attio + Linear) — **только мутации**
- **Отчёты:** из Dashboard DB (НЕ через Composio API)
- **LightRAG:** через Dashboard API (`POST /lightrag/query`) — с первого дня
- **Redis Pub/Sub:** канал `job_completed` → push-уведомления
- Safety: Draft → Apply pattern, ledger-backed idempotency

## Architecture (key principle)

```
READ = Dashboard DB (15-min fresh data from Chatwoot/Linear/Attio + signals + digests)
WRITE = Composio MCP (direct API mutations with Draft safety)
SEARCH = LightRAG API (vector + keyword semantic search)
PUSH = Redis Pub/Sub (job_completed channel)
```

Полный scope: `docs/project-scope.md`

## Dashboard DB Tables (bot reads)

Коннекторы: `cw_contacts`, `cw_conversations`, `cw_messages`, `linear_issues_raw`, `linear_projects_raw`, `linear_states_raw`, `attio_opportunities_raw`, `attio_accounts_raw`, `attio_people_raw`

Интеллект: `signals`, `next_best_actions`, `health_scores`, `risk_radar_items`

Аналитика: `analytics_revenue_snapshots`, `analytics_delivery_snapshots`, `daily_digests`, `weekly_digests`

Outbound: `outbound_messages` (channel='telegram'), `contact_channel_policies`

Скоуп: `projects`, `account_scopes` — **все запросы фильтруются по `(project_id, account_scope_id)`**

## Environment Variables

### Required
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `DASHBOARD_DATABASE_URL` — PostgreSQL connection to labpics DB
- `BOT_DB_SCHEMA` — bot's own schema (default: `bot`)
- `REDIS_URL` — Redis for Pub/Sub
- `DASHBOARD_API_URL` — Dashboard Fastify API (for LightRAG)
- `COMPOSIO_API_KEY` — Composio MCP for mutations
- `OPENAI_API_KEY` — OpenAI Whisper STT
- `BOT_ALLOWED_TELEGRAM_USER_IDS` — allowlist
- `BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS` — admin allowlist

### Optional
- `TELEGRAM_WEBHOOK_SECRET_TOKEN` — webhook verification (required in prod)
- `LINEAR_TEAM_ID` — default Linear team (fallback)
- `PAUSE_REMINDER_DAYS` — paused deal reminder interval (default: 7)
