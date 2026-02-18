# Iterations roadmap (final plan)

This document is the execution plan for the repository.

## Guiding principles

- **DB contract is canonical**: see `docs/supabase/db-contract.md`.
- All runtime tables live in schema `bot`.
- Destructive resets are DEV-only.
- Every external side-effect must be gated by Draft → Apply and idempotency.
- Prefer small PRs that keep code + migrations aligned.

---

## Current state (what is already shipped)

### Draft engine

- Drafts are stored in `bot.drafts` (PK `id uuid`).
- Draft author is enforced via FK `bot.drafts.telegram_user_id -> bot.telegram_users.id`.
- Idempotency gate uses `bot.idempotency_keys` with keys like `tg:callback:<callback_query_id>`.
- Apply observability is stored in `bot.draft_apply_attempts`.

### Admin / ops

- `/admin status`
- `/admin composio show`
- `/admin composio attio <connected_account_id>` (merge-patch)
- `/admin composio linear <connected_account_id>`

> Note: we intentionally do NOT auto-pick a Linear team in runtime. `LINEAR_TEAM_ID` must be explicitly configured.

---

## Iteration 1 — `/deal stage` production-grade

**Goal:** stable Draft → Apply for stage changes in Attio.

- [x] DB-first drafts using `bot.drafts.id` (uuid)
- [x] Author enforcement via `bot.telegram_users` FK
- [x] Idempotency via `bot.idempotency_keys`
- [x] Apply observability via `bot.draft_apply_attempts`
- [ ] Improve user-facing preview (include resolved stage_name before Apply)
- [ ] Add explicit Draft expiry handling (`expires_at`) + UX messaging
- [ ] Add better error taxonomy (Attio/Composio/Supabase)

## Iteration 2 — Admin/ops hardening

**Goal:** no manual DB editing required for day-to-day ops.

- [x] `/admin status`
- [x] `/admin composio show`
- [x] `/admin composio attio <id>` (merge-patch)
- [x] `/admin composio linear <id>`
- [ ] Add `/admin env check` (validates required env vars and prints what’s missing)
- [ ] Add `/admin linear teams` (allowlist) to list teams and choose `LINEAR_TEAM_ID` (optional but recommended)

## Iteration 3 — `/deal won` Apply (MVP → production)

**Goal:** stage=won + Linear kickoff.

Phase 3A (MVP):
- [x] Enforce `LINEAR_TEAM_ID` from env with a friendly error if missing.
- [ ] Create 12 kickoff issues from the template (idempotent).

Phase 3B (production-quality):
- [ ] Create a Linear **Project** (name rule: `Company — Deal name`).
- [ ] Persist mapping in `bot.deal_linear_links` (Attio deal → Linear project).
- [ ] Create the 12 kickoff issues **inside the project**.
- [ ] Backlink to Attio (NOTE is preferred as the default).

> Caveat: whether we can create a Linear Project depends on available tools. If not available, use Linear GraphQL mutation via a supported mechanism and document it.

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
- [ ] Better message formatting, retries, and clearer UX

---

## Risks / watchlist

- PostgREST exposure: ensure `bot` is in PostgREST `db_schema`.
- Schema drift: keep code and baseline migrations aligned.
- Idempotency correctness: keys must be deterministic and unique per side-effect.
