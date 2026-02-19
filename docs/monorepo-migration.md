# Миграция в монорепо labpics-dashboard

> **Решение:** перенести telegram-bot в labpics-dashboard как подпапку.
> **Причина:** бот читает ~20 таблиц dashboard напрямую — изменение схемы должно быть атомарным.

## Целевая структура

```
labpics-dashboard/
├── server/              # Dashboard backend (Fastify)
├── web/                 # Dashboard frontend (Next.js)
├── worker/              # Sync worker
├── telegram-bot/        # ← Telegram бот
│   ├── src/
│   │   ├── server.ts
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── db.ts
│   │   ├── redis.ts
│   │   ├── composio.ts
│   │   ├── linear_kickoff_template.ts
│   │   └── safety/types.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
├── migrations/          # ВСЕ миграции (dashboard + bot)
├── docker-compose.yml   # Один compose на всё
└── .github/workflows/
    └── ci.yml           # Единый CI
```

## Пошаговая инструкция (5 минут)

### 1. Скопировать код бота

```bash
cd labpics-dashboard

# Создать папку
mkdir -p telegram-bot

# Скопировать исходники (без node_modules, .git)
cp -r ../telegram-assistant-bot/src telegram-bot/
cp ../telegram-assistant-bot/package.json telegram-bot/
cp ../telegram-assistant-bot/tsconfig.json telegram-bot/
cp ../telegram-assistant-bot/Dockerfile telegram-bot/
cp ../telegram-assistant-bot/.env.example telegram-bot/
```

### 2. Перенести миграции бота

```bash
# Скопировать bot-миграции в общую папку миграций dashboard
# Переименовать с префиксом, чтобы не конфликтовали
cp ../telegram-assistant-bot/supabase/migrations/0001_extensions_and_schema.sql \
   migrations/0100_bot_extensions_and_schema.sql
cp ../telegram-assistant-bot/supabase/migrations/0002_core_tables.sql \
   migrations/0101_bot_core_tables.sql
cp ../telegram-assistant-bot/supabase/migrations/0003_user_state_linear_caches_bulk.sql \
   migrations/0102_bot_user_state_caches.sql
cp ../telegram-assistant-bot/supabase/migrations/0004_design_studio_sales_to_linear.sql \
   migrations/0103_bot_design_studio.sql
```

**Важно:** Бот автоматически применяет миграции при старте через `src/db.ts:runMigrations()`. Нужно обновить путь к миграциям в `src/server.ts`.

### 3. Добавить сервис в docker-compose.yml

Добавить в `docker-compose.yml` dashboard:

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

### 4. Обновить путь миграций в server.ts

```typescript
// telegram-bot/src/server.ts
// Изменить:
const migrationsDir = path.resolve(__dirname, "..", "supabase", "migrations");
// На:
const migrationsDir = path.resolve(__dirname, "..", "migrations");
```

Или оставить `supabase/migrations` и скопировать миграции туда же.

### 5. Удалить docker-compose.yml бота

```bash
rm telegram-bot/docker-compose.yml  # больше не нужен, используем общий
rm telegram-bot/.dockerignore       # общий .dockerignore dashboard
```

### 6. Обновить CI

В `.github/workflows/ci.yml` добавить job:

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

### 7. Проверить и запустить

```bash
docker compose build telegram-bot
docker compose up -d telegram-bot
docker compose logs -f telegram-bot
```

### 8. Архивировать старую репу

```bash
# В GitHub: Settings → Archive this repository
# Или добавить README с redirect
```

## Что НЕ нужно менять

- Весь код бота (`src/`) работает без изменений
- Миграции SQL идентичны
- package.json бота независим от dashboard
- Dockerfile бота самодостаточен

## После переноса: выгоды

1. **Атомарные PR:** изменил `attio_opportunities_raw` → обновил SQL запрос бота → один PR
2. **Один docker-compose:** `docker compose up -d` поднимает всё
3. **Общий CI:** typecheck всего при изменении схемы
4. **Нет `external: true` хака** в Docker network
