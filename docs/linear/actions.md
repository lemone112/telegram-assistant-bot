# Linear: полный каталог действий для бота

Linear-часть бота строится вокруг **Issue** (создать/обновить/найти/обогатить), а также вокруг справочников (teams/users/states/projects).

## 1) Discovery

### 1.1 Текущий пользователь
- Tool: `LINEAR_GET_CURRENT_USER`

### 1.2 Команды (Teams)
- Tool: `LINEAR_GET_ALL_LINEAR_TEAMS`

### 1.3 Проекты
- Tool: `LINEAR_LIST_LINEAR_PROJECTS`

### 1.4 Workflow states по команде
- Tool: `LINEAR_LIST_LINEAR_STATES` (нужен `team_id`)

### 1.5 Пользователи
- Tool: `LINEAR_LIST_LINEAR_USERS`

## 2) Issues

### 2.1 Создать issue
- Tool: `LINEAR_CREATE_LINEAR_ISSUE`
- Требует минимум: `team_id`, `title`
- Часто используемые поля:
  - `description` (markdown)
  - `assignee_id`
  - `project_id`
  - `state_id`
  - `priority`
  - `due_date`

### 2.2 Обновить issue
- Tool: `LINEAR_UPDATE_ISSUE`
- Важно: `issueId` может быть UUID или ключ (например `LAB-123`).

### 2.3 Список issues
- Tool: `LINEAR_LIST_LINEAR_ISSUES`

### 2.4 Поиск issues
- Tool: `LINEAR_SEARCH_ISSUES`

## 3) Advanced (GraphQL)

### 3.1 Любые запросы/мутации
- Tool: `LINEAR_RUN_QUERY_OR_MUTATION`

Рекомендуем использовать для:
- нестандартных полей
- сложных фильтров
- attachments/documents/comments и т.п.

## 4) Роутинг и дефолты

Бот должен иметь дефолты:

- `DEFAULT_LINEAR_TEAM_ID`
- (опционально) default project/state/labels

Если дефолтов нет, MCP должен задавать уточняющие вопросы.

## 5) Ссылки

- Linear GraphQL docs: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
