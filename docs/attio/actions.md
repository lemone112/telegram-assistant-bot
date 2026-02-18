# Attio: полный каталог действий для бота

Ниже перечислены **все ключевые действия**, которые бот должен уметь собирать в Draft и (после подтверждения) выполнять.

> Примечание: Attio сильно зависит от схемы объекта (атрибуты). Для записи/обновления данных по кастомным полям бот должен уметь **заранее читать схему атрибутов**.

## 1) Discovery / Schema

### 1.1 Список объектов рабочего пространства
- Tool: `ATTIO_LIST_OBJECTS`
- Назначение: узнать доступные system/custom объекты.

### 1.2 Атрибуты объекта / листа
- Tool: `ATTIO_LIST_ATTRIBUTES`
- Назначение: получить перечень полей (api_slug, type, required, writable, unique, multiselect).

### 1.3 Опции для select/status
- Tool: `ATTIO_LIST_ATTRIBUTE_OPTIONS`
- Назначение: получить доступные варианты для select/status и их идентификаторы.

### 1.4 Получить объект / атрибут
- Tools: `ATTIO_GET_OBJECT`, `ATTIO_GET_ATTRIBUTE`
- Назначение: детальная информация.

## 2) Поиск и чтение записей

### 2.1 Листинг записей
- Tool: `ATTIO_LIST_RECORDS`
- Назначение: простое постраничное перечисление.

### 2.2 Найти запись (по id или по атрибутам)
- Tool: `ATTIO_FIND_RECORD`
- Назначение:
  - прямой GET по record_id
  - или поиск по атрибутам (email/name/domain и т.д.)

### 2.3 Продвинутый query (фильтры/сортировки)
- Tool: `ATTIO_QUERY_RECORDS`
- Назначение: сложные фильтры ($and/$or/$contains/$gte и т.д.)

### 2.4 Листинг компаний с фильтром
- Tool: `ATTIO_LIST_COMPANIES`
- Назначение: практичный шорткат под companies.

## 3) Запись данных (create/update)

> Для безопасной дедупликации предпочтительны **assert**-операции (если доступны) или create+handle conflict.

### 3.1 Создать запись
- Tool: `ATTIO_CREATE_RECORD` (generic)
- Tool: `ATTIO_POST_V2_OBJECTS_OBJECT_RECORDS` (низкоуровневый create)

### 3.2 Upsert по matching_attribute (анти-дубли)
- Tool: `ATTIO_PUT_V2_OBJECTS_OBJECT_RECORDS`
- Назначение: создать или обновить по уникальному атрибуту.

### 3.3 Быстрые assert-операции
- Tools:
  - `ATTIO_ASSERT_PERSON` (match чаще всего по `email_addresses`)
  - `ATTIO_ASSERT_COMPANY` (match чаще всего по `domains`)

## 4) Заметки и задачи

### 4.1 Создать заметку на записи
- Tool: `ATTIO_CREATE_NOTE`
- Назначение: фиксировать контекст (созвон/договорённости/обещания/след. шаги).

### 4.2 Обновить задачу (если используете Tasks в Attio)
- Tool: `ATTIO_UPDATE_TASK`
- Назначение: дедлайны, completion, linked_records, assignees.

## 5) Администрирование select/status

### 5.1 Создать option
- Tool: `ATTIO_CREATE_SELECT_OPTION`

### 5.2 Обновить/архивировать option
- Tool: `ATTIO_UPDATE_SELECT_OPTION`

## 6) Вебхуки (опционально)

### 6.1 Создать webhook
- Tool: `ATTIO_CREATE_WEBHOOK`

### 6.2 Листинг/получение webhook
- Tools: `ATTIO_LIST_WEBHOOKS`, `ATTIO_GET_WEBHOOK`

## 7) Атрибуты: таблицы текущих schema (снимок)

См. таблицы в:

- `docs/attio/attributes-people.md`
- `docs/attio/attributes-companies.md`
- `docs/attio/attributes-deals.md`

> Эти файлы фиксируют **текущую** схему вашего Attio workspace (на момент генерации документации). При изменениях в Attio — перегенерировать.
