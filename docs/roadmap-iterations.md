# Iterations roadmap (authoritative)

This document is the **authoritative execution plan** for this repository. It is intentionally written as an engineering backlog with clear priorities.

## Guiding principles

- **DB contract is canonical**: see `docs/supabase/db-contract.md`.
- All runtime tables live in schema `bot`.
- Destructive resets are DEV-only.
- Every external side-effect MUST be gated by **Draft → Apply** and **idempotency**.
- Prefer small PRs that keep code + migrations aligned.

## Current state (already shipped)

### Draft engine

- Drafts stored in `bot.drafts` (PK `id uuid`).
- Draft author enforced via FK `bot.drafts.telegram_user_id -> bot.telegram_users.id`.
- Idempotency gate uses `bot.idempotency_keys` with keys like `tg:callback:<callback_query_id>`.
- Apply observability stored in `bot.draft_apply_attempts`.

### Admin / ops

- `/admin status`
- `/admin composio show`
- `/admin composio attio <connected_account_id>` (merge-patch)
- `/admin composio linear <connected_account_id>`

> Note: we intentionally do NOT auto-pick a Linear team in runtime. `LINEAR_TEAM_ID` must be explicitly configured.

---

## Iteration P0.1 — UX/UI foundation (CryptoBot-style)

**Goal:** consistent Telegram UX with inline keyboards, pagination, and a single interaction model.

- [ ] Implement message renderer (Card/List/Draft/Result) with consistent formatting.
- [ ] Implement callback payload schema `v1|...` (versioned) + parser.
- [ ] Add pagination helper for list outputs (Prev/Next + pick).
- [ ] Add Draft expiry handling (`expires_at`) + “Rebuild draft” button.
- [ ] Add `/help` with examples for free-form and slash commands.

Docs:
- [ ] Add `docs/ux.md` (this repo-level spec).

## Iteration P0.2 — Router: free-form text + voice → Composio MCP plan

**Goal:** any message becomes a structured plan routed to Attio/Linear tools.

- [ ] Add STT pipeline for voice → text (provider TBD) + store transcript.
- [ ] Define planner output schema: `intent (query|mutate)`, `domain`, `actions[]`, `needs_clarification[]`.
- [ ] Implement clarification loop (persist pending questions in DB, buttons for common answers).
- [ ] Add safety policy:
  - Always Draft-gate mutations
  - Read-only queries may auto-run, but still logged
  - Bulk operations require additional confirmation (count threshold)

## Iteration P0.3 — `/deal stage` production-grade (Attio)

**Goal:** stable Draft → Apply for stage changes in Attio.

- [x] DB-first drafts using `bot.drafts.id` (uuid)
- [x] Author enforcement via `bot.telegram_users` FK
- [x] Idempotency via `bot.idempotency_keys`
- [x] Apply observability via `bot.draft_apply_attempts`
- [ ] Improve user-facing preview (include resolved `stage_name` before Apply)
- [ ] Add explicit Draft expiry handling (`expires_at`) + UX messaging
- [ ] Add better error taxonomy (Attio/Composio/Supabase)

## Iteration P0.4 — Admin hardening

**Goal:** no manual DB editing required for day-to-day ops.

- [x] `/admin status`
- [x] `/admin composio show`
- [x] `/admin composio attio <id>` (merge-patch)
- [x] `/admin composio linear <id>`
- [ ] Add `/admin env check` (validate required env vars and print what’s missing)
- [ ] Add `/admin linear teams` (allowlist) to list teams and choose `LINEAR_TEAM_ID`

## Iteration P1.1 — Queries & reports (Attio + Linear)

**Goal:** support read-only questions with the same UX quality.

- [ ] `/report clients weekly` (Attio): summary + top changes
- [ ] `/report pipeline` (Attio): counts by stage + deltas
- [ ] `/report projects <deal>` (Linear): project/issues grouped by state
- [ ] Report pagination + export (CSV) + refresh button
- [ ] Caching strategy in DB (short TTL) for report queries

## Iteration P1.2 — `/deal won` Apply (Linear kickoff)

**Goal:** stage=won triggers Linear kickoff.

Phase 3A (MVP):
- [x] Enforce `LINEAR_TEAM_ID` from env with friendly error if missing
- [ ] Create 12 kickoff issues from template (idempotent)

Phase 3B (production-quality):
- [ ] Create a Linear **Project** (name rule: `Company — Deal name`)
- [ ] Persist mapping in `bot.deal_linear_links` (Attio deal → Linear project)
- [ ] Create 12 kickoff issues **inside the project**
- [ ] Backlink to Attio (NOTE preferred as default)

## Iteration P1.3 — Visibility commands

**Goal:** make the bot useful without context switching.

- [ ] `/deal find <text>` (Attio query)
- [ ] `/deal view <id>`
- [ ] `/pipeline`
- [ ] `/linear issue <key>` view (basic)

## Iteration P2.1 — Reminders

- [ ] On stage change to `paused`, schedule reminder in `bot.reminders` (due_at = now + `PAUSE_REMINDER_DAYS`)
- [ ] Scheduled job to send reminders and mark `sent/cancelled`
- [ ] `/admin reminders` to inspect queue

## Iteration P2.2 — `/task` end-to-end

- [ ] `/task <text>` Draft → Apply
- [ ] Project/state selection rules
- [ ] Optionally link issue back to deal/project

## Iteration P2.3 — Bulk import (`/client-mass`)

- [ ] Parse bulk blocks into `bot.draft_bulk_items`
- [ ] Preview + per-item validation
- [ ] Apply with batching + idempotency + audit

## Iteration P2.4 — Timezone + UX polish

- [ ] `/tz` per user
- [ ] Better message formatting, retries, and clearer UX

---

## Risks / watchlist

- PostgREST exposure: ensure `bot` is in PostgREST `db_schema`.
- Schema drift: keep code and baseline migrations aligned.
- Idempotency correctness: keys must be deterministic and unique per side-effect.
