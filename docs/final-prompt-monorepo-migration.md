# Финальный промпт: миграция telegram-bot → labpics-dashboard монорепо + следующие шаги

> Этот документ — **готовый промпт** для Claude Code сессии в репозитории `lemone112/labpics-dashboard`.
> Копировать целиком и вставить в новую сессию.

---

## Промпт

```
# Задача: перенести Telegram-бот в монорепо labpics-dashboard

## Контекст

У нас два репозитория:
1. **lemone112/labpics-dashboard** — BI-платформа (Fastify + Next.js + PostgreSQL 16 + Redis 7). Стек: JavaScript (планируем миграцию на TypeScript).
2. **lemone112/telegram-assistant-bot** — Telegram-бот (Node.js + Fastify + TypeScript strict). Уже мигрирован с Cloudflare Workers на Docker.

Бот читает ~20 таблиц dashboard напрямую (attio_opportunities_raw, linear_issues_raw, signals, health_scores, daily_digests и т.д.). Изменение схемы должно быть атомарным → монорепо.

**Решение:** перенести весь код бота в `labpics-dashboard/telegram-bot/`.

## Шаг 1: Создать папку и скопировать код бота

```bash
mkdir -p telegram-bot
```

Скопировать из telegram-assistant-bot:

```
telegram-bot/
├── src/
│   ├── server.ts          # Fastify HTTP сервер, webhook, graceful shutdown
│   ├── index.ts           # Бизнес-логика (handleMessage, handleCallback, menus, drafts, idempotency)
│   ├── config.ts          # Centralized env config (singleton loadConfig/getConfig)
│   ├── db.ts              # pg Pool, botQuery/dashQuery helpers, runMigrations()
│   ├── redis.ts           # ioredis Pub/Sub subscriber (job_completed channel)
│   ├── composio.ts        # Composio MCP client (Attio + Linear mutations)
│   ├── linear_kickoff_template.ts  # Template for deal-won kickoff tasks
│   └── safety/types.ts    # NormalizedError type
├── package.json           # deps: fastify ^5.6, pg ^8.16, ioredis ^5.9, tsx, typescript
├── tsconfig.json          # strict, ESNext, NodeNext, types: ["node"]
├── Dockerfile             # node:22-alpine, typecheck at build, CMD tsx
└── .env.example           # All env vars documented
```

## Шаг 2: Перенести SQL-миграции бота

Миграции бота лежат в `supabase/migrations/`. Бот применяет их автоматически при старте через `src/db.ts:runMigrations()`.

Два варианта:
- **Вариант A (проще):** Скопировать как `telegram-bot/supabase/migrations/` — ничего не менять в коде.
- **Вариант B (чище):** Перенести в общую папку `migrations/` dashboard, переименовав:
  - `0001_extensions_and_schema.sql` → `0100_bot_extensions_and_schema.sql`
  - `0002_core_tables.sql` → `0101_bot_core_tables.sql`
  - `0003_user_state_linear_caches_bulk.sql` → `0102_bot_user_state_caches.sql`
  - `0004_design_studio_sales_to_linear.sql` → `0103_bot_design_studio.sql`

  И обновить путь в `src/server.ts`:
  ```typescript
  // Было:
  const migrationsDir = path.resolve(__dirname, "..", "supabase", "migrations");
  // Стало:
  const migrationsDir = path.resolve(__dirname, "..", "..", "migrations");
  ```

Рекомендую **вариант A** — минимум изменений, работает сразу.

## Шаг 3: Добавить сервис в docker-compose.yml

В корневой `docker-compose.yml` labpics-dashboard добавить:

```yaml
  telegram-bot:
    build: ./telegram-bot
    environment:
      DASHBOARD_DATABASE_URL: postgresql://app:app@db:5432/labpics
      BOT_DB_SCHEMA: bot
      REDIS_URL: redis://redis:6379
      DASHBOARD_API_URL: http://server:8080
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      COMPOSIO_API_KEY: ${COMPOSIO_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      BOT_ALLOWED_TELEGRAM_USER_IDS: ${BOT_ALLOWED_TELEGRAM_USER_IDS:-}
      BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS: ${BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS:-}
      TELEGRAM_WEBHOOK_SECRET_TOKEN: ${TELEGRAM_WEBHOOK_SECRET_TOKEN:-}
      LINEAR_TEAM_ID: ${LINEAR_TEAM_ID:-}
      PORT: "3000"
    ports:
      - "${BOT_PORT:-3000}:3000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      server:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

## Шаг 4: Удалить ненужные файлы бота

Удалить из `telegram-bot/`:
- `docker-compose.yml` (используем общий)
- `.dockerignore` (общий)
- `.github/` (CI будет в корне)
- `.git/` (не копировать — общий git)

## Шаг 5: Добавить job в CI

В `.github/workflows/ci.yml` добавить:

```yaml
  typecheck-bot:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: telegram-bot
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
```

## Шаг 6: Скопировать CLAUDE.md бота

Скопировать `telegram-bot/CLAUDE.md` (или его содержимое) в корневой CLAUDE.md, чтобы Claude Code знал контекст бота. Ключевая информация:

### Архитектура бота

```
READ = Dashboard DB (15-min fresh data from Chatwoot/Linear/Attio + signals + digests)
WRITE = Composio MCP (direct API mutations with Draft safety)
SEARCH = LightRAG API (vector + keyword semantic search)
PUSH = Redis Pub/Sub (job_completed channel)
```

### Dashboard DB таблицы (бот читает)

Коннекторы: cw_contacts, cw_conversations, cw_messages, linear_issues_raw, linear_projects_raw, linear_states_raw, attio_opportunities_raw, attio_accounts_raw, attio_people_raw

Интеллект: signals, next_best_actions, health_scores, risk_radar_items

Аналитика: analytics_revenue_snapshots, analytics_delivery_snapshots, daily_digests, weekly_digests

Outbound: outbound_messages (channel='telegram'), contact_channel_policies

Скоуп: projects, account_scopes — все запросы фильтруются по (project_id, account_scope_id)

### Env vars бота

Required: TELEGRAM_BOT_TOKEN, DASHBOARD_DATABASE_URL, BOT_DB_SCHEMA, REDIS_URL, DASHBOARD_API_URL, COMPOSIO_API_KEY, OPENAI_API_KEY, BOT_ALLOWED_TELEGRAM_USER_IDS, BOT_ALLOWED_ADMIN_TELEGRAM_USER_IDS

Optional: TELEGRAM_WEBHOOK_SECRET_TOKEN, LINEAR_TEAM_ID, PAUSE_REMINDER_DAYS

### Принцип: TypeScript only

Весь новый код — только TypeScript. Dashboard (JS) мигрируем постепенно.

## Шаг 7: Проверить

```bash
# Собрать
docker compose build telegram-bot

# Запустить
docker compose up -d telegram-bot

# Логи
docker compose logs -f telegram-bot

# Должно быть:
# [boot] Config loaded
# [migrate] Migrations complete
# [boot] Server listening on port 3000
```

## Шаг 8: Архивировать старую репу

В GitHub: Settings → Archive repository (lemone112/telegram-assistant-bot).
Или добавить README: "Moved to labpics-dashboard/telegram-bot/".

---

# Следующие шаги после миграции

## Iteration 3 — Refactor + Dashboard DB reports + LightRAG (текущая)

### 3.1 Рефакторинг index.ts → модули

index.ts сейчас — монолит (~900 строк). Разбить:

```
telegram-bot/src/
├── server.ts              # Fastify (уже готов)
├── config.ts              # Config (уже готов)
├── db.ts                  # DB helpers (уже готов)
├── redis.ts               # Redis Pub/Sub (уже готов)
├── composio.ts            # Composio client (уже готов)
├── handlers/
│   ├── message.ts         # handleMessage — routing текстовых команд
│   ├── callback.ts        # handleCallback — routing inline callbacks
│   └── voice.ts           # (iter 4) voice → STT → text → action
├── services/
│   ├── telegram.ts        # sendMessage, answerCallbackQuery, editMessage
│   ├── reports.ts         # Pipeline, Linear, Deal card — SQL queries
│   ├── lightrag.ts        # POST /lightrag/query wrapper
│   ├── drafts.ts          # Draft CRUD, apply logic
│   └── notifications.ts   # (iter 5) Redis → Telegram push
├── ui/
│   ├── menus.ts           # Inline keyboard builders
│   └── formatters.ts      # Markdown formatters для отчётов
├── types.ts               # Telegram types, shared interfaces
└── linear_kickoff_template.ts  # (exists)
```

### 3.2 Project scoping

Привязка telegram_user → (project_id, account_scope_id):
1. При /start — wizard выбора проекта (из `projects` таблицы dashboard)
2. Сохранение в `bot.settings` с ключом `user:{telegram_id}:scope`
3. Все SQL-запросы к dashboard добавляют `WHERE project_id = $X AND account_scope_id = $Y`

### 3.3 Отчёты из Dashboard DB

**Pipeline Report** (из `attio_opportunities_raw` + `analytics_revenue_snapshots`):
```sql
SELECT stage, COUNT(*) as count, SUM(amount) as total_amount
FROM attio_opportunities_raw
WHERE project_id = $1 AND account_scope_id = $2
GROUP BY stage ORDER BY stage;
```

**Linear Issues** (из `linear_issues_raw` + `linear_states_raw`):
```sql
SELECT i.title, i.state, i.priority, i.assignee, i.due_date, s.name as state_name
FROM linear_issues_raw i
LEFT JOIN linear_states_raw s ON s.state_id = i.state
WHERE i.project_id = $1
ORDER BY i.priority, i.state;
```

**Deal Card** (из `attio_opportunities_raw` + `signals` + `health_scores` + LightRAG):
```sql
SELECT * FROM attio_opportunities_raw
WHERE project_id = $1 AND (title ILIKE $2 OR data->>'company_name' ILIKE $2)
LIMIT 10;
```
+ обогащение сигналами, health score, LightRAG цитатами.

**Daily Digest** (из `daily_digests`):
```sql
SELECT content, generated_at FROM daily_digests
WHERE project_id = $1 ORDER BY generated_at DESC LIMIT 1;
```

**Signals Report**:
```sql
SELECT signal_type, severity, confidence, evidence_refs, created_at
FROM signals WHERE project_id = $1 AND severity >= 3
ORDER BY severity DESC, created_at DESC LIMIT 20;
```

### 3.4 LightRAG поиск

```typescript
// services/lightrag.ts
async function queryLightRAG(query: string, sourceFilter?: string) {
  const config = getConfig();
  const res = await fetch(`${config.DASHBOARD_API_URL}/lightrag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, topK: 10, sourceLimit: 50, sourceFilter }),
  });
  return res.json();
}
```

Degradation: если Dashboard API недоступен → "Знания временно недоступны", остальные flow'ы работают.

### 3.5 Acceptance criteria (Iteration 3)

- [ ] Pipeline report показывает реальные данные из dashboard DB
- [ ] Linear report показывает задачи с группировкой по статусу
- [ ] Deal card обогащён сигналами и health score
- [ ] LightRAG поиск возвращает результаты с цитатами
- [ ] Daily digest показывает последнюю сводку
- [ ] Все запросы фильтруются по (project_id, account_scope_id)
- [ ] index.ts разбит на модули

## Iteration 4 — Voice + Composio мутации

1. **STT** через OpenAI Whisper (`whisper-1`): voice message → text → обычный command routing
2. **Создание задачи Linear** через Composio (`LINEAR_CREATE_LINEAR_ISSUE`) — Draft → Apply
3. **Смена стадии сделки Attio** через Composio (`ATTIO_UPDATE_A_RECORD`) — Draft → Apply
4. **Deal won kickoff** → создаёт Linear project + 12 задач из шаблона (идемпотентно)

## Iteration 5 — Redis Pub/Sub + push-уведомления

1. Redis subscriber уже подключен (`src/redis.ts`). Добавить логику:
   - `daily_digest` + `status=ok` → отправить дайджест подписанным пользователям
   - `weekly_digest` + `status=ok` → отправить недельную сводку
   - `signals_extraction` с новыми high-severity → уведомить админа
   - `connectors_sync_cycle` + `status=failed` → уведомить админа
2. Opt-in через `bot.settings`: `notifications.daily_digest`, `notifications.weekly_digest`, `notifications.high_severity_signals`

## Iteration 6 — Entity Graph Navigator

Единый вид сущности через все системы:
- Attio card + Linear issues + Chatwoot threads + LightRAG brief
- Link Registry через `bot.external_links`
- ACL-filtered sections

## Iteration 7 — Admin ops + hardening

Эксплуатационная готовность, тестирование, мониторинг.

---

# Технические ограничения

1. **TypeScript only** — весь новый код на TS. Dashboard JS мигрируем постепенно.
2. **Draft → Apply** — все мутации требуют подтверждения пользователя.
3. **Idempotency** — ledger в `bot.idempotency_keys`, no duplicate side-effects.
4. **Callback protocol** — формат `v1:OP:ARGS` для inline keyboard.
5. **Project scoping** — все данные фильтруются по `(project_id, account_scope_id)`.
6. **Codex Code Review** — на каждый PR через 2-3 мин прилетает ревью от Codex. Замечания обязательны к исправлению.
```
