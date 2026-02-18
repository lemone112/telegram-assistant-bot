# Supabase: схема БД (актуально после reset A)

В этом проекте выбран вариант **A**: "полностью очистить `public` и перестроить".

> Важно: reset — разрушительное действие. В миграции **не удаляются functions** в `public`, потому что некоторые из них принадлежат extensions (например `vector`).

## Список таблиц (public)

- `telegram_users`
- `drafts`
- `draft_apply_attempts`
- `external_links`
- `audit_log`

## Таблица `telegram_users`

- `id` uuid pk
- `telegram_user_id` bigint unique
- базовые поля профиля

## Таблица `drafts`

- хранит Draft (черновик) + jsonb `actions`, `assumptions`, `risks`, `questions`
- `status`: DRAFT/APPLIED/CANCELLED/EXPIRED

## Таблица `draft_apply_attempts`

- фиксирует идемпотентные попытки apply
- уникальность `(draft_id, callback_query_id)`

## Таблица `external_links`

- связывает Draft с созданными сущностями в Attio/Linear

## Таблица `audit_log`

- минимальный audit trail

## Ограничение 500MB

Рекомендации:

- ограничивать длину `source_text`/`transcript`
- чистить старые Draft/attempts/log по TTL
- не хранить вложения

## Миграция

См. файл:

- `supabase/migrations/0001_reset_public_and_create_bot_schema.sql`
