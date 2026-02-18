# Roadmap реализации

## Phase 1 — /task end-to-end

1) Webhook handler
2) /task → WAIT_TASK_SOURCE
3) Получили forward → построили Draft
4) UI: Apply/Cancel + кнопка "Назначить исполнителя"
5) Apply → создать Linear issue
6) Логи и сохранение результата

## Phase 2 — /client-mass

- парсер блоков
- bulk preview
- apply companies + people + notes

## Phase 3 — /tz (pro)

- вопросы → ответы → финальный документ
- draft → apply

## Design Studio (Attio deals → Linear kickoff)

### MVP (Sales control + Auto-kickoff)

**Deliverables**
- Команды: `/deal find`, `/deal view`, `/deal stage`, `/deal won`, `/pipeline`, `/audit last`, `/sync`
- Справочник стадий + алиасы в Supabase (`bot.deal_stages`, `bot.deal_stage_aliases`)
- Auto-kickoff на стадии **Выиграно**:
  - создать Linear Project с неймингом `Company — Deal name`
  - создать 12 стартовых задач (идемпотентно)
  - сохранить mapping `attio_deal_id ↔ linear_project_id`
- Reminder: стадия **На паузе** → 7 дней → ping CEO/COO

**Backlog**
- [ ] Draft-поток для `/deal stage` (preview + Apply/Cancel)
- [ ] Draft-поток для `/deal won` (stage→won + kickoff)
- [ ] Идемпотентность kickoff: `deal_linear_links` + `project_template_tasks`
- [ ] `/pipeline`: сводка сделок по стадиям
- [ ] `/audit last`: последние Apply
- [ ] Reminder job: выборка paused deals, постановка/отправка reminders

### Phase 2 (Production visibility)
- [ ] `/project status <deal>`: сводка задач по статусам Linear
- [ ] `/task <text>`: задача в контекстном проекте (по последней выбранной сделке или явному параметру)
- [ ] Дайджесты: просрочки / нет активности / задачи на ревью

### Phase 3 (Системность)
- [ ] Шаблоны kickoff по направлению (`Направление` в Attio)
- [ ] Авто follow-up по стадиям (например, КП отправлено → напоминание через 3 дня)
- [ ] Метрики: время в стадии, конверсия, отчёт по продажам и производству
