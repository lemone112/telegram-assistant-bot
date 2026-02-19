# Project Scope — Telegram Assistant Bot (authoritative)

> **Дата:** 2026-02-19
> **Статус:** Черновик для ревью
> **Контекст:** Интеграция с labpics-dashboard, миграция на Docker

---

## 1. Назначение

Telegram-бот — **единая точка входа** для работы с бизнес-данными компании:

- **Отчёты** из labpics-dashboard DB (Attio/Linear/Chatwoot/сигналы/дайджесты)
- **Мутации** (Attio, Linear) через Composio MCP с Draft → Apply безопасностью
- **Семантический поиск** по переписками через LightRAG API
- **Push-уведомления** через Redis Pub/Sub при изменении данных

---

## 2. Архитектурный сдвиг (КРИТИЧНО)

### 2.1 Было: Cloudflare Workers + Supabase

```
Telegram → Cloudflare Worker → Supabase (bot schema)
                              → Composio → Attio/Linear API
```

### 2.2 Стало: Docker-контейнер рядом с labpics-dashboard

```
Telegram → Bot (Docker) → PostgreSQL (labpics DB, shared)
                         → PostgreSQL (bot schema, own tables)
                         → Dashboard API (POST /lightrag/query)
                         → Redis Pub/Sub (job_completed)
                         → Composio → Attio/Linear API (mutations only)
```

### 2.3 Принцип разделения

| Операция | Источник | Обоснование |
|----------|----------|-------------|
| **Чтение данных Linear** | Dashboard DB (`linear_issues_raw`, etc.) | Свежие (15 мин), без rate limits, обогащены сигналами |
| **Чтение данных Attio** | Dashboard DB (`attio_opportunities_raw`, etc.) | То же |
| **Чтение Chatwoot** | Dashboard DB (`cw_messages`, `cw_contacts`, etc.) | То же |
| **Семантический поиск** | Dashboard API `POST /lightrag/query` | Векторный + keyword поиск |
| **Сигналы, health scores** | Dashboard DB (`signals`, `health_scores`, etc.) | Уникальные данные dashboard |
| **Дайджесты** | Dashboard DB (`daily_digests`, `weekly_digests`) | Готовые сводки |
| **Аналитика** | Dashboard DB (`analytics_*_snapshots`) | Агрегированные снимки |
| **Создание задач Linear** | Composio MCP | Прямая мутация через API |
| **Обновление сделок Attio** | Composio MCP | Прямая мутация через API |
| **Состояние бота** | Bot DB (`bot` schema) | Drafts, idempotency, state |

### 2.4 Docker Compose интеграция

Бот добавляется как сервис в docker-compose labpics-dashboard:

```yaml
telegram-bot:
  build: ./telegram-assistant-bot   # submodule или mount
  environment:
    # Shared dashboard DB (read-only for dashboard tables)
    DASHBOARD_DATABASE_URL: postgresql://app:app@db:5432/labpics
    # Bot's own schema
    BOT_DATABASE_URL: postgresql://app:app@db:5432/labpics
    BOT_DB_SCHEMA: bot
    # Redis for Pub/Sub
    REDIS_URL: redis://redis:6379
    # Dashboard API for LightRAG
    DASHBOARD_API_URL: http://server:8080
    # External APIs
    TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
    COMPOSIO_API_KEY: ${COMPOSIO_API_KEY}
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    # Access control
    BOT_ALLOWED_TELEGRAM_USER_IDS: ${BOT_ALLOWED_TELEGRAM_USER_IDS}
    BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS: ${BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS}
  depends_on:
    db:
      condition: service_healthy
    redis:
      condition: service_healthy
    server:
      condition: service_healthy
  restart: unless-stopped
```

---

## 3. Две базы данных — одна PostgreSQL

### 3.1 Dashboard DB (labpics, read-only для бота)

Бот **читает** следующие таблицы dashboard без модификации:

**Коннекторы:**
- `cw_contacts` — контакты Chatwoot
- `cw_conversations` — переписки
- `cw_messages` — сообщения
- `linear_issues_raw` — задачи Linear (title, state, priority, assignee, due_date)
- `linear_projects_raw` — проекты Linear
- `linear_states_raw` — состояния workflow
- `attio_opportunities_raw` — сделки Attio (stage, amount, probability)
- `attio_accounts_raw` — аккаунты CRM
- `attio_people_raw` — контакты CRM
- `attio_activities_raw` — активности CRM

**Интеллект:**
- `signals` — извлечённые сигналы (severity, confidence)
- `next_best_actions` — рекомендуемые действия
- `health_scores` — здоровье аккаунтов (0-100)
- `risk_radar_items` — риски

**Аналитика:**
- `analytics_revenue_snapshots` — выручка/пайплайн
- `analytics_delivery_snapshots` — throughput
- `analytics_comms_snapshots` — коммуникации
- `daily_digests` — ежедневные сводки
- `weekly_digests` — еженедельные сводки

**Outbound (бот пишет сюда тоже):**
- `outbound_messages` (channel='telegram') — исходящие
- `contact_channel_policies` — opt-out, frequency caps

**Инфраструктура:**
- `projects` — проекты (project_id)
- `account_scopes` — скоупы (account_scope_id)
- `connector_sync_state` — статус синхронизации

### 3.2 Bot DB (schema: `bot`, read-write)

Собственные таблицы бота (уже существуют в Supabase, мигрируют в общую PostgreSQL):

- `telegram_users` — профили пользователей
- `drafts` — черновики действий
- `draft_apply_attempts` — observability Apply
- `external_links` — кросс-системные маппинги
- `audit_log` — аудит событий
- `idempotency_keys` — идемпотентность
- `settings` — конфигурация
- `user_input_state` — состояние wizard'ов
- `linear_users_cache` — кэш Linear-пользователей
- `linear_teams_cache` — кэш Linear-команд
- `linear_projects_cache` — кэш Linear-проектов
- `draft_bulk_items` — элементы bulk-операций
- `deal_stages` — стадии сделок
- `deal_stage_aliases` — алиасы стадий
- `deal_linear_links` — маппинг deal ↔ project
- `project_template_tasks` — идемпотентность kickoff
- `reminders` — напоминания

### 3.3 Project Scoping

**Критично:** Все данные dashboard защищены `(project_id, account_scope_id)`.

Бот должен:
1. При первом запуске/онбординге привязать Telegram-пользователя к `project_id`
2. Все SQL-запросы к dashboard DB фильтровать по `project_id` И `account_scope_id`
3. Хранить маппинг `telegram_user_id → (project_id, account_scope_id)` в `bot.settings`

---

## 4. LightRAG интеграция (с первого дня)

### 4.1 API вызов

```typescript
// POST http://server:8080/lightrag/query
{
  query: "что мы обещали по дедлайнам?",
  topK: 10,
  sourceLimit: 50,
  sourceFilter: null  // или "chatwoot" | "linear" | "attio"
}
```

### 4.2 Ответ

```typescript
{
  evidence: [
    {
      source_type: "chatwoot_message",
      snippet: "...",
      metadata: { conversation_id, message_id, ... },
      score: 0.85
    }
  ],
  quality: { coverage, diversity, depth },
  query_run_id: "..."
}
```

### 4.3 Использование в боте

1. **Поиск по переписке:** пользователь задаёт вопрос → бот вызывает LightRAG → показывает ответ с цитатами
2. **Обогащение карточек:** при показе сделки/клиента — подтягивать последние упоминания
3. **Грунтованные ответы:** если цитат нет → "Недостаточно данных"
4. **Фидбек:** `POST /lightrag/feedback` с rating (-1/0/1)

### 4.4 Degradation

Если Dashboard API недоступен:
- Показать "Знания временно недоступны"
- Продолжить не-RAG flow'ы (мутации, меню, профиль)

---

## 5. Redis Pub/Sub — push-уведомления

### 5.1 Подписка

Бот подписывается на канал `job_completed`:

```typescript
// Payload
{
  job_type: "connectors_sync_cycle" | "signals_extraction" | "daily_digest" | ...,
  project_id: "...",
  account_scope_id: "...",
  status: "ok" | "failed",
  at: "2026-02-19T12:00:00Z"
}
```

### 5.2 Логика уведомлений

| Событие | Действие |
|---------|----------|
| `daily_digest` + `status=ok` | Отправить дайджест подписанным пользователям |
| `weekly_digest` + `status=ok` | Отправить недельную сводку |
| `signals_extraction` с новыми high-severity | Уведомить администратора |
| `connectors_sync_cycle` + `status=failed` | Уведомить администратора |

### 5.3 Подписки пользователей

Opt-in через `bot.settings`:
- `notifications.daily_digest: true/false`
- `notifications.weekly_digest: true/false`
- `notifications.high_severity_signals: true/false`

---

## 6. Composio MCP — только мутации

### 6.1 Разрешённые операции

**Linear (через Composio):**
- `LINEAR_CREATE_LINEAR_ISSUE` — создать задачу
- `LINEAR_CREATE_LINEAR_PROJECT` — создать проект
- `LINEAR_UPDATE_LINEAR_ISSUE` — обновить задачу

**Attio (через Composio):**
- `ATTIO_UPDATE_A_RECORD` — обновить запись (стадия сделки)
- `ATTIO_CREATE_A_RECORD` — создать запись
- `ATTIO_CREATE_A_NOTE` — создать заметку

### 6.2 Запрещённые через Composio (данные берём из DB)

- ~~`LINEAR_LIST_LINEAR_ISSUES`~~ → `SELECT FROM linear_issues_raw`
- ~~`ATTIO_LIST_ALL_RECORDS`~~ → `SELECT FROM attio_opportunities_raw`
- ~~`ATTIO_GET_A_RECORD`~~ → `SELECT FROM attio_opportunities_raw WHERE ...`

### 6.3 Обоснование

- Dashboard DB обновляется каждые 15 минут — достаточная свежесть
- Нет зависимости от rate limits внешних API для чтения
- Доступны обогащённые данные (сигналы, health scores) которых нет в API

---

## 7. Обновлённые отчёты (из Dashboard DB)

### 7.1 Pipeline Report (Attio → Dashboard DB)

```sql
SELECT stage, COUNT(*) as count,
       SUM(amount) as total_amount
FROM attio_opportunities_raw
WHERE project_id = $1
  AND account_scope_id = $2
GROUP BY stage
ORDER BY stage;
```

Сравнение с предыдущим снимком:
```sql
SELECT * FROM analytics_revenue_snapshots
WHERE project_id = $1
ORDER BY snapshot_at DESC
LIMIT 2;
```

### 7.2 Deal/Client Card (Attio → Dashboard DB)

```sql
SELECT * FROM attio_opportunities_raw
WHERE project_id = $1
  AND (title ILIKE $2 OR data->>'company_name' ILIKE $2)
LIMIT 10;
```

Обогащение:
- Сигналы: `SELECT * FROM signals WHERE entity_ref LIKE 'attio:deal:' || deal_id`
- Health: `SELECT * FROM health_scores WHERE entity_ref = ...`
- LightRAG: `POST /lightrag/query` с именем клиента

### 7.3 Project Status (Linear → Dashboard DB)

```sql
SELECT i.title, i.state, i.priority, i.assignee, i.due_date,
       s.name as state_name
FROM linear_issues_raw i
LEFT JOIN linear_states_raw s ON s.state_id = i.state
WHERE i.project_id = $1
ORDER BY i.priority, i.state;
```

### 7.4 Новые отчёты (недоступные без Dashboard DB)

**Signals Report:**
```sql
SELECT signal_type, severity, confidence, evidence_refs, created_at
FROM signals
WHERE project_id = $1
  AND severity >= 3
ORDER BY severity DESC, created_at DESC
LIMIT 20;
```

**Daily Digest:**
```sql
SELECT content, generated_at
FROM daily_digests
WHERE project_id = $1
ORDER BY generated_at DESC
LIMIT 1;
```

**Health Dashboard:**
```sql
SELECT entity_ref, score, factors, updated_at
FROM health_scores
WHERE project_id = $1
ORDER BY score ASC
LIMIT 10;
```

---

## 8. Миграция runtime: Cloudflare Workers → Node.js Docker

### 8.1 Что меняется

| Аспект | Было (CF Workers) | Стало (Docker) |
|--------|-------------------|----------------|
| Runtime | V8 isolate, Cloudflare | Node.js (LTS), Docker |
| DB client | `@supabase/supabase-js` (HTTP) | `pg` (native TCP) |
| Redis | Нет | `ioredis` (TCP) |
| Webhook | CF Worker route | Express/Fastify HTTP server |
| Deploy | `wrangler deploy` | `docker compose up -d` |
| Secrets | CF Secrets | Docker env / `.env` file |
| Startup | Cold start per request | Long-running process |

### 8.2 Что сохраняется

- TypeScript, strict mode
- Draft → Apply protocol
- Idempotency ledger
- Callback protocol (`v1:OP:...`)
- UI components (inline keyboards)
- All business logic

### 8.3 Новые зависимости

```json
{
  "pg": "^8.16",
  "ioredis": "^5.9",
  "fastify": "^5.6"
}
```

### 8.4 План миграции (поэтапно)

1. Добавить `Dockerfile` + `docker-compose.override.yml`
2. Заменить Supabase client → `pg` pool
3. Добавить Redis subscriber
4. Заменить `export default { fetch }` → Fastify HTTP server
5. Добавить Dashboard DB queries
6. Обновить CI/CD

---

## 9. Обновлённый Iteration Plan

### Iteration 3 (текущая) — Refactor + Dashboard DB + LightRAG каркас

**Цель:** переход на Docker, подключение Dashboard DB, базовые отчёты из реальных данных.

**Шаги:**
1. **Рефакторинг** index.ts → модули (handlers/, services/)
2. **Dockerfile + Fastify** — замена Cloudflare Workers
3. **Dashboard DB connector** — pg pool для чтения dashboard таблиц
4. **Project scoping** — привязка telegram_user → (project_id, account_scope_id)
5. **Pipeline Report** — из `attio_opportunities_raw` + `analytics_revenue_snapshots`
6. **Linear Issues Report** — из `linear_issues_raw` + `linear_states_raw`
7. **Deal Card** — из `attio_opportunities_raw` + `signals` + `health_scores`
8. **LightRAG поиск** — `POST /lightrag/query` через Dashboard API
9. **Daily Digest** — из `daily_digests` таблицы

**Новые env vars:** `DASHBOARD_DATABASE_URL`, `REDIS_URL`, `DASHBOARD_API_URL`

**Acceptance:**
- Pipeline report показывает реальные данные из dashboard DB
- LightRAG поиск возвращает результаты с цитатами
- Deal card обогащён сигналами и health score

### Iteration 4 — Voice + Composio мутации

**Цель:** голос работает, мутации через Composio реальные.

**Шаги:**
1. STT через OpenAI Whisper
2. Task creation → Linear через Composio
3. Deal stage change → Attio через Composio
4. Deal won kickoff → Linear project + 12 tasks

### Iteration 5 — Redis Pub/Sub + уведомления

**Цель:** push-нотификации при изменении данных.

**Шаги:**
1. Redis subscriber на `job_completed`
2. Daily digest push
3. High-severity signal alerts
4. Opt-in/opt-out через настройки

### Iteration 6 — Entity Graph Navigator

**Цель:** единый вид сущности через все системы.

**Шаги:**
1. Resolve entity → Attio card + Linear issues + Chatwoot threads + LightRAG brief
2. Link Registry → `bot.external_links`
3. ACL-filtered sections

### Iteration 7 — Admin ops + hardening

**Цель:** эксплуатационная готовность, тестирование.

---

## 10. Безопасность и ACL

### 10.1 Telegram-уровень

- `BOT_ALLOWED_TELEGRAM_USER_IDS` — allowlist обычных пользователей
- `BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS` — абсолютные админы
- Webhook secret: `TELEGRAM_WEBHOOK_SECRET_TOKEN`

### 10.2 Dashboard DB уровень

- Бот подключается с read-only ролью к dashboard таблицам
- Все запросы фильтруются по `project_id` + `account_scope_id`
- DB triggers dashboard предотвращают кросс-скоуп записи

### 10.3 LightRAG уровень

- Запросы включают `acl_tags` для server-side фильтрации
- Restricted sections скрыты (не placeholder)

---

## 11. Degradation Matrix (обновлённая)

| Зависимость | Поведение при недоступности | Разрешённые действия |
|-------------|---------------------------|---------------------|
| Dashboard DB down | "БД временно недоступна" | Только меню, профиль |
| Dashboard API down | "Знания временно недоступны" | Отчёты из DB, мутации |
| Redis down | Без push-уведомлений (silent) | Всё остальное работает |
| Composio down | "Интеграции недоступны", Draft сохранён | Отчёты, поиск |
| Attio API down | "Attio недоступен" | Чтение из DB, Linear мутации |
| Linear API down | "Linear недоступен" | Чтение из DB, Attio мутации |
| Bot DB down | "БД бота недоступна", блокирует всё | Ничего (критичная зависимость) |

---

## 12. Явно вне scope v1

- Public access (только allowlist)
- Bulk import `/client-mass`
- Scheduled reminders с cron (кроме Redis push)
- Undo для side-effects
- CSV export (позже)
- AI-роутинг свободного текста (позже)
- Интерактивное ТЗ `/tz` (позже)
- Multi-tenant (один scope пока)

---

## 13. Acceptance Criteria (v1 "готов")

1. Pipeline report показывает реальные данные из dashboard DB с дельтой
2. Deal card обогащён сигналами, health score и LightRAG цитатами
3. Linear report показывает задачи группировкой по статусу
4. LightRAG поиск возвращает грунтованные ответы с цитатами
5. Daily digest приходит автоматически через Redis Pub/Sub
6. Создание задачи в Linear работает через Draft → Apply
7. Смена стадии сделки работает через Draft → Apply
8. Deal won kickoff создаёт 12 задач без дублей
9. Voice → STT → текст → действие
10. Нет duplicate side-effects при retry/double-click
