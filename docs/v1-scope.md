# v1 Scope (authoritative)

Goal: a **production-ready Telegram assistant bot** with CryptoBot-like UX that can safely execute **mutations** and answer **queries/reports** across Attio (CRM) and Linear (PM) via Composio MCP.

## Non-negotiables

- Free-form **text** input works.
- Free-form **voice** input works (STT) and is treated exactly like text after transcription.
- Any external side-effect is **Draft → Apply** gated with idempotency.
- Ambiguity is resolved via **Pick list** (no auto-guessing “the client”).
- Queries are high-quality: paginated lists, cards, export where relevant.

## Must-have user stories (v1)

### Mutations (Draft-gated)

1. Change deal stage in Attio
   - “Переведи сделку <X> в стадию paused/won/…"

2. Deal won kickoff
   - “Сделка <X> выиграна — создай kickoff в Linear"

3. Create a Linear task/issue from free-form
   - “Сделай задачу: подготовить КП для <client> до пятницы"

### Queries / reports

We include three report families in v1 because they are high-frequency, low-risk, and validate the router end-to-end.

1. **Pipeline report (Attio)**
   - “Отчет по пайплайну” / “pipeline”
   - Output: counts by stage + (optional) delta vs last snapshot

2. **Client/deal status (Attio)**
   - “Покажи сделку <X>” / “что по клиенту <X>?”
   - Output: card + recent notes/next step fields (as available)

3. **Project/issues status (Linear)**
   - “Статус проекта по сделке <X>”
   - Output: issues grouped by state + blockers highlights (if inferable)

### Ops / admin

- Verify environment/config (`/admin env check`)
- Inspect Composio connections (`/admin composio show`)
- Configure connected accounts (`/admin composio attio|linear <id>`)
- Choose Linear team id (`/admin linear teams`)

## Explicitly out of scope for v1 (do later)

- Bulk import `/client-mass`
- Scheduled reminders (unless trivial after v1)
- Undo for side-effects (hard without domain-specific reverse ops)
- Deep analytics dashboards

## Acceptance (v1 is “ready” when)

- 95% of flows complete without manual DB edits.
- No duplicate side-effects under retry/double-click.
- UX is consistent and “CryptoBot-like” (buttons + minimal typing).
- Voice works with transcript confirmation.
