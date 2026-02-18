# Supabase: схема БД (актуально)

Вариант reset: **A** (очистка `public` и перестройка; functions в public не удаляем из-за extensions).

## Таблицы (public)

Базовые:
- `telegram_users`
- `drafts`
- `draft_apply_attempts`
- `external_links`
- `audit_log`

Состояния и bulk:
- `user_input_state`
- `draft_bulk_items`

Кэши Linear:
- `linear_users_cache`
- `linear_teams_cache`
- `linear_projects_cache`

## Миграции

- `0001_reset_public_and_create_bot_schema.sql`
- `0002_user_state_and_linear_caches.sql`
