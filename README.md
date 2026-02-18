# Telegram Assistant Bot (Attio + Linear via Composio MCP)

Бот принимает неформальные текстовые и голосовые сообщения в Telegram, превращает их в **черновик действий** для CRM **Attio** и PM **Linear**, показывает пользователю предварительный просмотр подтверждение с кнопками **«Применить»** и **«Отмена»**, и только после подтверждения выполняет действия через **Composio MCP**.

## Цели

- Быстро превратить «человеческое» сообщение в структурированные действия.
- Никогда не вносить изменения без подтверждения пользователя.
- Поддерживать частичное/неполное описание задач через уточняющие вопросы.
- Поддерживать хранение состояния и истории в Supabase, укладываясь в лимиты 500MB.

## Компоненты

- **Telegram Bot**: webhook-приёмник (Cloudflare Worker), обработка сообщений, inline-кнопки.
- **Parser/Planner**: Composio MCP (LLM + routing + tool selection).
- **Executors**: Composio tools для Attio и Linear.
- **State Store**: Supabase Postgres (черновики, idempotency, логи, кэши).

## Основной UX (обязательный)

1. Пользователь отправляет текст или voice.
2. Бот создает **Draft**: список действий + предварительный просмотр + предупреждения.
3. Пользователь подтверждает:
   - **«Применить»** — выполняем действия
   - **«Отмена»** — ничего не делаем

## Документация

- [Функциональная спецификация](docs/spec.md)
- [Действия Attio](docs/attio/actions.md)
- [Действия Linear](docs/linear/actions.md)
- [Схема БД Supabase](docs/supabase/schema.md)
- [Draft protocol](docs/draft-protocol.md)

## UX/UI

- UX spec: [docs/ux.md](docs/ux.md)
- Iterations plan: [docs/roadmap-iterations.md](docs/roadmap-iterations.md)

## Статус

Репозиторий содержит фиксацию требований и поэтапный план реализации.
