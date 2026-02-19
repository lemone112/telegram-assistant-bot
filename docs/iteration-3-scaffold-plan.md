# Итерация 3 — «Каркас всего» (Scaffold)

## Философия

Вместо последовательных итераций 3→4→5→6 (по одной фиче) — делаем **тонкий каркас всех ключевых функций** за один проход. Потом доводим каждую до идеала.

**Почему так:** Attio и Linear только начинают наполняться. Бот должен стать **основной точкой входа** для работы с этими системами — значит все функции нужны сразу, хотя бы в базовом виде.

---

## Что получит пользователь после этой итерации

### 1. Голос (Voice → STT → текст)
- Отправляешь голосовое → бот распознаёт через OpenAI Whisper
- Показывает транскрипт: «Ты сказал: ...» + кнопки ✅ Использовать / ❌ Отмена
- После подтверждения — текст обрабатывается как обычное сообщение
- Лимиты: до 120 сек, до 20 МБ

### 2. Отчёт по задачам (Linear)
- Меню → Tasks → Report
- Бот тянет задачи из Linear через Composio
- Показывает группировкой по статусу: In Progress / Todo / Done
- Пагинация (до 8 задач на странице)
- Кнопка «Обновить»

### 3. Работа со сделками (Attio)
- Меню → Design Studio → Deal stage
- Поиск сделки по названию (текстом)
- Если найдено несколько — Pick list
- Карточка сделки: название, стадия, компания
- Смена стадии: Draft → Apply (с защитой от дублирования)

### 4. Создание задачи (Linear)
- Меню → Tasks → Create
- Вводишь текст задачи (или голосом)
- Бот создаёт Draft: название задачи, проект, исполнитель (из профиля)
- Apply → создаёт issue в Linear

### 5. Kickoff «Сделка выиграна» (Linear + Attio)
- Меню → Design Studio → Deal won
- Выбор сделки → Draft показывает: смена стадии + создание проекта + 12 задач
- Bulk warning (≥5 операций)
- Apply создаёт всё за раз, без дублей при повторном нажатии

---

## Порядок реализации (шаги)

### Шаг A: Рефакторинг — разбить index.ts на модули
**Зачем:** index.ts уже 757 строк. Добавлять 5 фич в один файл — нечитаемо.

Новая структура:
```
src/
  index.ts              — маршрутизатор (webhook → handler)
  telegram.ts           — Telegram API хелперы (tgCall, sendMessage, etc.)
  ui.ts                 — UI компоненты (menus, keyboards, renderPicker)
  handlers/
    menu.ts             — главное меню
    profile.ts          — профиль + пикеры
    voice.ts            — голосовой pipeline
    reports.ts          — отчёты Linear
    tasks.ts            — создание задач
    deals.ts            — сделки Attio (stage, card)
    kickoff.ts          — deal won kickoff
  services/
    stt.ts              — OpenAI Whisper STT
    linear.ts           — Linear queries/mutations через Composio
    attio.ts            — Attio queries/mutations через Composio
  supabase.ts           — без изменений
  composio.ts           — без изменений
  linear_kickoff_template.ts — без изменений
  safety/types.ts       — без изменений
```

### Шаг B: Telegram API — поддержка голосовых
- Добавить обработку `message.voice` в webhook handler
- Скачивание файла через Telegram `getFile` API
- Валидация размера и длительности

### Шаг C: STT сервис (OpenAI Whisper)
- Новый env var: `OPENAI_API_KEY`
- Отправка аудио на `https://api.openai.com/v1/audio/transcriptions`
- Модель: `whisper-1`, язык: auto-detect (RU/EN)
- Возврат: текст транскрипта
- Degradation: если Whisper недоступен → «Распознавание временно недоступно, напишите текстом»

### Шаг D: Voice handler (транскрипт → подтверждение → роутинг)
- Голосовое → STT → показ транскрипта
- Кнопки: ✅ Использовать / ❌ Отмена
- «Использовать» → текст роутится как обычное сообщение
- Сохранение транскрипта в draft.source_type = 'voice'

### Шаг E: Composio интеграция — Linear queries
- `listLinearIssues(env, teamId, filters)` — получить задачи
- `getLinearIssue(env, issueId)` — одна задача
- Группировка по status (Todo, In Progress, Done, etc.)

### Шаг F: Reports handler
- Кнопка «Tasks → Report» в меню
- Вызов Linear через Composio → получение задач
- Рендер: группировка по статусу, пагинация
- Кнопка «Обновить» (refresh)

### Шаг G: Composio интеграция — Attio queries/mutations
- `searchAttioDeals(env, query)` — поиск сделок
- `getAttioDeal(env, dealId)` — карточка сделки
- `updateAttioDealStage(env, dealId, stageKey)` — смена стадии

### Шаг H: Deals handler (search → card → stage change)
- Design Studio → Deal stage
- Текстовый ввод названия сделки
- Поиск → Pick list (если несколько) → Card
- Смена стадии через Draft → Apply

### Шаг I: Tasks handler (создание задачи в Linear)
- Tasks → Create
- Ввод текста → формирование Draft (title, assignee из профиля)
- Apply → создание issue через Composio
- Result с ссылкой на созданную задачу

### Шаг J: Kickoff handler (deal won)
- Design Studio → Deal won
- Выбор сделки → Draft с 12 задачами + bulk warning
- Apply: создание проекта + задач через Composio
- Per-task idempotency (шаблон уже есть в linear_kickoff_template.ts)
- Result с ссылками

### Шаг K: Обновление меню и роутинг
- Обновить главное меню: реальные действия вместо стабов
- Tasks: Report / Create
- Design Studio: Deal stage / Deal won
- Свободный текстовый ввод → пока показ меню (умный роутинг — позже)

---

## Что НЕ входит в эту итерацию (детали — позже)

- Умный роутинг свободного текста (ИИ-парсинг интента) — позже
- CSV экспорт отчётов — позже
- Кэширование отчётов с TTL — позже
- Редактирование Draft перед Apply — позже
- Stage aliases (кп, договор, пауза) — позже
- Attio pipeline report (воронка) — позже
- Карточка клиента — позже
- Admin команды — позже

---

## Новые переменные окружения

| Переменная | Назначение |
|-----------|-----------|
| `OPENAI_API_KEY` | OpenAI API для Whisper STT |
| `LINEAR_TEAM_ID` | ID команды Linear (уже есть опционально) |

---

## Оценка объёма кода

| Модуль | Примерно строк |
|--------|---------------|
| Рефакторинг (разбивка index.ts) | ~0 новых (перенос) |
| telegram.ts | ~80 |
| ui.ts | ~120 |
| handlers/ (7 файлов) | ~600 |
| services/ (3 файла) | ~200 |
| Обновлённый index.ts (роутер) | ~100 |
| **Итого новых** | **~1100** |

---

## Зависимости и риски

| Риск | Митигация |
|------|-----------|
| Composio может не поддерживать нужные Linear/Attio actions | Fallback на прямые API вызовы |
| OpenAI Whisper rate limits | Graceful degradation + сообщение пользователю |
| index.ts рефакторинг сломает существующее | Шаг A первый, проверка typecheck после |
| Composio latency для reports | Показ «Загрузка...» + таймаут 10с |
