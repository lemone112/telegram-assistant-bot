# Supabase: схема БД (план)

Требование: можно «полностью очистить и перестроить». Лимит объёма: **500MB**.

## 1) Принципы

- Храним только то, что нужно для восстановления истории действий.
- Не храним большие бинарные вложения.
- Тексты ограничиваем по длине.
- Включаем TTL/очистку.

## 2) Таблицы (предлагаемая модель)

### 2.1 `telegram_users`
- `id` (pk)
- `telegram_user_id` (unique)
- `username`
- `first_name`, `last_name`
- `language_code`
- `created_at`
- `updated_at`

### 2.2 `drafts`
- `id` (pk, uuid/ulid)
- `telegram_user_id` (fk)
- `chat_id`
- `source_type` (`text|voice`)
- `source_text` (bounded)
- `transcript` (bounded)
- `intent_summary` (bounded)
- `status` (`DRAFT|APPLIED|CANCELLED|EXPIRED`)
- `assumptions` (jsonb)
- `risks` (jsonb)
- `questions` (jsonb)
- `actions` (jsonb) — нормализованный список действий
- `created_at`
- `expires_at`

### 2.3 `draft_apply_attempts`
- `id` (pk)
- `draft_id` (fk)
- `callback_query_id` (unique per draft)
- `started_at`
- `finished_at`
- `result` (jsonb) — per-action outcomes
- `error_summary` (text, bounded)

### 2.4 `external_links`
Хранит связывание сущностей между системами.
- `id`
- `draft_id`
- `system` (`attio|linear`)
- `entity_type` (например `person|company|deal|issue`)
- `entity_id`
- `entity_url`
- `created_at`

### 2.5 `audit_log`
- минимальный лог действий бота

## 3) Очистка

- cron/worker job: удалять старые `audit_log` и `draft_apply_attempts` старше N дней.
- `drafts` старше TTL → `EXPIRED`.

## 4) Миграции

Все изменения схемы фиксируем SQL-миграциями в репозитории:

- `supabase/migrations/*.sql`

## 5) RLS

На раннем этапе можно использовать service_role ключ внутри Worker.
Позже — включить RLS и ограничить доступ.
