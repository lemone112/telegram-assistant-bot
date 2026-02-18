# Supabase reset (вариант A) — заметки и подводные камни

## Что сделано

- Удалены **views/tables/sequences** из схемы `public`.
- **Функции не удалялись** намеренно.

Причина: некоторые функции в `public` принадлежат расширениям (пример: `vector`) и их нельзя дропнуть напрямую, пока не удалить extension.

## Почему нельзя «просто дропнуть все функции public.*»

При попытке удалить функции в `public` может возникнуть ошибка вида:

- `cannot drop function ... because extension vector requires it`

Поэтому в миграции для reset мы:

- дропаем **tables/views/sequences**
- НЕ трогаем functions

## Проверка

Проверяем, что в `public` остались только таблицы бота:

- `telegram_users`
- `drafts`
- `draft_apply_attempts`
- `external_links`
- `audit_log`

И что `auth` и `storage` схемы не трогались.
