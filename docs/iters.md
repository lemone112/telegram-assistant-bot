# Iteration plan (UI-first Telegram Assistant Bot)

Этот документ — **authoritative iteration plan** для `telegram-assistant-bot`.

Он отражает:
- документацию в `docs/*` (spec, contracts, reliability standard)
- текущее состояние кода (Worker webhook scaffold)
- принятые продуктовые решения:
  - доступ **только allowlist**
  - **всё управление через кнопки** (“crypto-bot style”)
  - Tasks: **выбор существующего Project** или **Create new → отдельный флоу → возврат**
  - Profile mapping: **Linear + Attio** для каждого Telegram user
  - сейчас 1 Linear team, но дизайн должен масштабироваться

> Правило: **сначала план, потом код**.

---

## Guiding principles (non‑negotiable)

1) **Draft-first для любых мутаций**  
Любая операция create/update в Attio/Linear всегда проходит через Draft и явный Apply.

2) **Idempotency везде**  
Callback-клики, Apply, и внешние side-effects — только с устойчивыми idempotency keys.

3) **Никогда не оставлять пользователя без ответа**  
Ошибки обязаны быть user-facing и actionable (см. `docs/error-handling-contract.md`).

4) **Observability writes не блокируют business**  
Audit/attempt logs — best-effort (см. `docs/reliability-standard.md`).

5) **UI-first (“crypto-bot style”)**  
Навигация/мастера/подтверждения — inline keyboards. Текст вводится только по запросу UI.

6) **Allowlist-only**  
Бот отвечает только пользователям из `BOT_ALLOWED_TELEGRAM_USER_IDS`.

---

## Shared building blocks (общие блоки для всех итераций)

### A) Screen & button system
Шаблоны сообщений:
- Menu card
- Wizard step
- Draft preview
- Apply result
- Error message (contract)

Универсальные кнопки (где уместно):
- `Back`, `Cancel`, `Menu`

### B) Callback data protocol (64 bytes)
`callback_data` должно быть компактным (лимит Telegram ~64 байта).

Рекомендуемые опкоды:
- `M:<key>` — menu navigation
- `W:<flow>:<step>:<token>` — wizard navigation
- `S:<kind>:<id>` — select entity (project/user/deal/…)
- `N:<kind>` — create new entity entry
- `D:A:<draft_id>` — apply draft
- `D:C:<draft_id>` — cancel draft
- `P:<k>:<v>` — profile mapping ops (если нужно)

### C) State machine
Храним per-user state в `bot.user_input_state`.

Каждый шаг wizard хранит:
- `flow`, `step`, `payload`, `return_to`

`return_to` обязателен для паттерна “Create new → return”.

### D) Draft model
`bot.drafts` хранит:
- assumptions, risks, questions, actions (jsonb)
- status: `DRAFT|APPLIED|CANCELLED|EXPIRED`

### E) Idempotency ledger
`bot.idempotency_keys` — глобальный gate.

Минимальные стандарты ключей:
- callback: `tg:callback:<callback_query_id>`
- apply-per-action: `draft:<draft_id>:action:<action_id>`

### F) Audit trail
- `bot.audit_log` — события
- `bot.draft_apply_attempts` — observability попыток Apply

---

## Iterations

### Iteration 0 — UX system + state machine spec (P0)
**Goal:** закрепить UI-стандарт и state machine до начала разработки фич.

**Deliverables**
- Обновить `docs/ux.md`: screen map, message templates, button conventions.
- Обновить `docs/ux-flows.md`: wizard flows для Tasks/Clients/Design Studio/Profile.
- Зафиксировать callback protocol (opcodes + примеры).
- Definition of Done чеклист, выровненный с:
  - `docs/quality-gates.md`
  - `docs/reliability-standard.md`
  - `docs/error-handling-contract.md`

**Acceptance**
- В каждом флоу есть `Cancel` и детерминированный “return path”.

---

### Iteration 1 — Core runtime platform (P0)
**Goal:** построить надежный движок: callbacks, Draft lifecycle, idempotency, error contract.

**Deliverables**
- Обработка `callback_query` + idempotency `tg:callback:<id>`.
- Реальная runtime-интеграция Supabase:
  - `telegram_users`, `user_input_state`, `drafts`, `idempotency_keys`, `audit_log`, `draft_apply_attempts`.
- Draft creation + preview + Apply/Cancel.
- Error handling по контракту (Telegram message всегда; HTTP 200 по умолчанию).
- Observability best-effort.

**Implementation plan**
- See [`docs/iteration-1-plan.md`](./iteration-1-plan.md).

**Acceptance**
- Двойной клик Apply не создает дублей.
- Supabase down → Apply блокируется `DEPENDENCY_DOWN` (actionable) и draft сохраняется.

---

### Iteration 2 — Profile (Linear+Attio) + Entity Picker (P0/P1)
**Goal:** профиль-маппинг и универсальный компонент “выбрать / создать / вернуться”.

**Deliverables**
- Profile screen:
  - статус маппинга
  - set/update Linear + Attio mapping
  - хранение в `bot.settings` (v1) по стабильным ключам
- EntityPicker:
  - list/search candidates
  - select candidate
  - `+ Create new` → CreateFlow → return to caller step
- Подготовка Linear caches для picker’ов:
  - refresh `linear_users_cache`, `linear_projects_cache`

**Acceptance**
- Пользователь может привязать Linear user.
- Project picker поддерживает “Create new project → return and select”.

---

### Iteration 3 — Tasks: full UI wizard + “create everything” in Linear (P1)
**Goal:** полноценный Tasks e2e (без команд), включая выбор/создание project и assignee.

**Wizard**
1) `Tasks → Create`
2) source: forwarded / typed
3) capture content
4) pick project (existing / create new → return)
5) pick assignee (default from profile; change via picker)
6) draft preview (Apply/Cancel/Edit)

**Apply**
- execute через Composio MCP (`src/composio.ts`)
- “create everything”:
  - issue + необходимые связи
  - project создается только если пользователь выбрал Create new
- external_links + audit_log
- recovery: resume-safe Apply с per-action idempotency

**Acceptance**
- Частичный фейл + retry дозавершает без дублей.

---

### Iteration 4 — Clients bulk import → Attio (P1)
**Goal:** безопасный bulk с валидацией, preview, resume-safe apply.

**Deliverables**
- `Clients → Import (bulk)` wizard
- parse в `draft_bulk_items` + validation
- preview: counts + invalid items
- apply:
  - per-item idempotency
  - rate-limit aware
  - actionable errors

---

### Iteration 5 — Design Studio: deal stage + deal won (P1/P2)
**Goal:** Sales → Production по спецификации.

**Deliverables**
- deal stage updates + alias mapping (`deal_stage_aliases`)
- deal won:
  - create/find Linear project
  - kickoff tasks (`KICKOFF_TEMPLATE_TASKS`)
  - ledger через `project_template_tasks`
  - link через `deal_linear_links`
- строгая идемпотентность и recovery-ветки

---

### Iteration 6 — Ops, hardening, regressions (P2)
**Goal:** эксплуатационная готовность.

**Deliverables**
- Admin screens (allowlist only): dependency checks, last errors, last drafts.
- Degradation matrix verification.
- Regression tracking (NS1–NS5) + CI enforcement.

---

## Future-proofing: multiple Linear teams
Сейчас одна команда, но дизайн должен позволять:
- `profile:<tg_user>:linear_team_id`
- picker фильтрует по team
- caches keyed by team

---

## Non-goals (early)
- public access
- direct mutations без Draft
- silent failures
