# Iterations roadmap (implementation plan)

This document turns the product/architecture notes into an execution-oriented set of iterations.

## Guiding principles

- Database contract is canonical: see `docs/supabase/db-contract.md`.
- All runtime tables live in schema `bot`.
- Destructive resets are DEV-only.
- Every external side-effect must be gated by Draft → Apply and idempotency.

---

## Iteration 1 — Make `/deal stage` production-grade

**Goal:** stable Draft → Apply for stage changes in Attio.

- [x] DB-first drafts using `bot.drafts.id` (uuid)
- [x] Author enforcement via `bot.telegram_users` FK
- [x] Idempotency via `bot.idempotency_keys`
- [x] Apply observability via `bot.draft_apply_attempts`
- [ ] Improve user-facing preview (include resolved stage_name before Apply)
- [ ] Add explicit Draft expiry handling (`expires_at`) + UX messaging

## Iteration 2 — Admin/ops hardening

**Goal:** no manual DB editing required for day-to-day ops.

- [x] `/admin status`
- [x] `/admin composio show`
- [x] `/admin composio attio <id>` (merge-patch)
- [x] `/admin composio linear <id>`
- [ ] Add `/admin env check` (validates required env vars at runtime)

## Iteration 3 — `/deal won` Apply (MVP)

**Goal:** stage=won + create Linear kickoff.

- [x] Enforce `LINEAR_TEAM_ID` from env (friendly error if missing)
- [ ] Create Linear Project (name: `Company — Deal name` rule)
- [ ] Create 12 template tasks idempotently (`bot.project_template_tasks`)
- [ ] Persist mapping (`bot.deal_linear_links`)
- [ ] Backlink to Attio (note or URL field)

> Note: in the current code we can create Linear issues via Composio, but Linear project creation tool may be missing; MVP falls back to issues without project_id.

## Iteration 4 — Visibility commands

**Goal:** make the bot useful without context switching.

- [ ] `/deal find <text>` (Attio query)
- [ ] `/deal view <id>`
- [ ] `/pipeline`

## Iteration 5 — Reminders

**Goal:** automate follow-ups for paused deals.

- [ ] On stage change to `paused`, schedule reminder in `bot.reminders` (due_at = now + PAUSE_REMINDER_DAYS)
- [ ] Scheduled job to send reminders and mark `sent/cancelled`
- [ ] `/admin reminders` to inspect queue

## Iteration 6 — `/task` end-to-end

**Goal:** create Linear issues from Telegram with correct routing.

- [ ] `/task <text>` Draft → Apply
- [ ] Project/state selection rules
- [ ] Optionally link issue back to deal/project

## Iteration 7 — `/client-mass` bulk

**Goal:** bulk create/update Attio companies/people/notes.

- [ ] Parse bulk blocks into `bot.draft_bulk_items`
- [ ] Preview + per-item validation
- [ ] Apply with batching + idempotency + audit

## Iteration 8 — Timezone + UX polish

- [ ] `/tz` per user
- [ ] Better message formatting, error taxonomy, retries

---

## Risks / watchlist

- PostgREST exposure: ensure `bot` is in PostgREST `db_schema`.
- Schema drift: keep code and baseline migrations aligned.
- Idempotency correctness: keys must be deterministic and unique per side-effect.
