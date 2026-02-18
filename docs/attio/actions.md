# Attio: полный каталог действий для бота

Ниже перечислены **все ключевые действия**, которые бот должен уметь собирать в Draft и (после подтверждения) выполнять.

> Примечание: Attio зависит от схемы объектов (атрибуты). Для записи/обновления данных по кастомным полям бот должен уметь читать схему атрибутов.

## 1) Discovery / Schema

- `ATTIO_LIST_OBJECTS` — список объектов
- `ATTIO_LIST_ATTRIBUTES` — поля объекта/листа
- `ATTIO_LIST_ATTRIBUTE_OPTIONS` — опции select/status
- `ATTIO_GET_OBJECT`, `ATTIO_GET_ATTRIBUTE` — детали

## 2) Поиск и чтение

- `ATTIO_LIST_RECORDS` — листинг
- `ATTIO_FIND_RECORD` — поиск по id/атрибутам
- `ATTIO_QUERY_RECORDS` — сложные фильтры
- `ATTIO_LIST_COMPANIES` — листинг companies с фильтрами

## 3) Запись данных

- `ATTIO_CREATE_RECORD` / `ATTIO_POST_V2_OBJECTS_OBJECT_RECORDS` — создать запись
- `ATTIO_PUT_V2_OBJECTS_OBJECT_RECORDS` — upsert по matching_attribute
- `ATTIO_ASSERT_PERSON`, `ATTIO_ASSERT_COMPANY` — безопасный dedupe-паттерн

## 4) Заметки (ключевая политика для /client-mass)

- `ATTIO_CREATE_NOTE` — создаём заметки для комментариев

### Политика комментариев (финальная)

- В bulk-импорте **всегда** создаём Note на Person с полным комментарием.
- В `description` Person пишем только короткий summary **и только если** description пустой.
- Если description уже заполнен — не перетирать (только Note).

## 5) Администрирование select/status

- `ATTIO_CREATE_SELECT_OPTION`
- `ATTIO_UPDATE_SELECT_OPTION`

## 6) Вебхуки (опционально)

- `ATTIO_CREATE_WEBHOOK`
- `ATTIO_LIST_WEBHOOKS`, `ATTIO_GET_WEBHOOK`

## 7) Снимок schema

- `docs/attio/attributes-people.md`
- `docs/attio/attributes-companies.md`
- `docs/attio/attributes-deals.md`
