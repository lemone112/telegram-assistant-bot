# Iterations roadmap (authoritative)

This document is the **authoritative execution plan** for this repository.

## How to read this roadmap

- Each iteration ships a **user-visible slice** (not just plumbing).
- Every iteration has:
  - **North Star flows** (acceptance scenarios)
  - **Definition of Done** (DoD)
  - explicit **dependencies** and **pitfalls**
- We prefer small PRs; however, we do not split so hard that we ship half-features.

---

## Global product rules (cross-cutting, non-negotiable)

These rules apply to **every iteration** and must never be violated.

### Safety & correctness

- **No side-effects without Draft → Apply** (mutations always gated).
- **Idempotency is ledger-backed**: per side-effect key → stored result → repeat returns same result.
- **Allowlist routing**: tool selection is constrained by explicit allowlists/denylists; planner is not trusted.
- **Bulk gate**: any plan with **>= 5** operations must require extra confirmation.

### Grounded knowledge (LightRAG)

- Any answer based on historical knowledge MUST be **grounded with citations** (links/snippets).
- If citations are missing → respond with **"not found / insufficient evidence"**.

### Entity linking

- Never auto-guess an entity when there are multiple plausible candidates.
- Ambiguity must trigger a **Pick list**.
- Confirmed picks must persist as stable mappings.

### ACL / privacy

- Access control must be enforced **server-side** for LightRAG.
- The bot must not leak Chatwoot/CRM data across roles/tenants.

### UX

- No wall-of-text.
- All lists are paginated (<= 8 items/page).
- Buttons order: positive → neutral → negative.

---

## Code review policy (MANDATORY)

Every PR must be reviewed with special attention to **Codex** review comments.

- Always open the PR "Files changed" and the **Codex** review thread(s).
- Treat Codex findings as a checklist: either fix the code or explicitly justify why not.
- Do not merge when Codex flags: idempotency gaps, unsafe tool routing, missing allowlists, or retry/rate-limit issues.

---

## External dependencies (blocking contracts)

### LightRAG knowledge DB (external server)

- DB requirements: `docs/lightrag-db-requirements.md`
- Must provide: grounded citations, entity linking primitives, server-side ACL filtering.
- If LightRAG is down: bot must degrade safely with a clear message.

### Attio / Linear / Chatwoot contracts

- Links to source objects must be stable and shown in UI.
- Rate limits and 5xx must be handled by retry/backoff wrappers.

---

## Planning gate (Iteration 0) — COMPLETE ✅

Specs are written and approved:

- [x] v1 scope: `docs/v1-scope.md`
- [x] Planner contract: `docs/planner-contract.md`
- [x] UX foundation: `docs/ux.md`
- [x] UX flows: `docs/ux-flows.md`
- [x] Reports spec: `docs/reports-spec.md`

---

# v1 North Star flows (product acceptance)

These flows define “the bot is ready”. We implement them progressively and must keep them working.

## NS1 — Voice → transcript confirm → Attio stage change (Draft-gated)

- Voice → transcript confirm/edit → Draft → Apply → Attio updated
- Must hold: no duplicates, ambiguity triggers Pick

## NS2 — Text → ambiguous deal → Pick list → Card

- Search returns paginated list → user picks → Card shown

## NS3 — Deal won kickoff → Linear 12 issues (no duplicates)

- Draft shows 12 creates + bulk warning → Apply creates exactly once

## NS4 — Pipeline report → refresh → export CSV

- Report card → refresh → export file

## NS5 — Status by deal → Linear issues grouped by state

- Resolve mapping (or pick) → show grouped issues → paginated

---

# Iterations (v1)

## Iteration 1 (P0) — Safety backbone + deterministic execution model

**Why this exists:** without it we will create duplicates, leak writes through queries, and fail under retries.

### Dependencies

- Supabase schema supports drafts/idempotency/apply attempts.

### Implementation tracker (GitHub Issues)

- #11 Tool allowlists/denylist + strict query vs mutate gate
- #12 Idempotency ledger (key → result)
- #13 Error taxonomy + user-facing renderer
- #14 Retry/backoff wrapper
- #15 Bulk risk gate + extra confirmation
- #16 Per-action observability

### Deliverables (detailed)

- **Idempotency ledger**
  - key format standards for:
    - Telegram callbacks
    - side-effect operations (per entity)
  - store: status, result payload, external ids, error, timestamps
- **Tool policy**
  - read-only allowlist
  - mutate allowlist
  - denylist
  - rule: unknown tool slugs are blocked
- **Retry policy**
  - retry on 429/5xx/network
  - deadlines and max attempts
  - safe integration with idempotency
- **Error taxonomy + rendering**
  - USER_INPUT / CONFIG / UPSTREAM / DB
  - short user message + next step
- **Bulk gate**
  - >=5 ops triggers extra confirmation

### Acceptance tests

- Callback replay: same `callback_query_id` received twice → second returns stored result, no extra DB writes.
- Operation replay: same side-effect key (e.g. `linear:create_issue:<deal>:<template_key>`) executed twice via different callbacks → second returns stored result.
- Concurrency: two Apply requests in parallel for same Draft → exactly one wins, one observes `in_progress` and then returns stored `succeeded` result.
- Retry safety: simulate 429 then success → ledger stores final external ids and prevents duplicate creates.
- Error classification: missing env var → CONFIG; invalid user input → USER_INPUT; upstream 5xx → UPSTREAM; DB down → DB.
- Allowlist enforcement: planner attempts a non-allowlisted mutate tool → blocked; planner attempts mutate while intent=query → forced Draft or blocked.
- Bulk gate: 5 ops triggers extra confirmation; 4 ops does not.
- Logging: per-action outcomes include correlation id and external ids; no secrets in logs.

### DoD

- All mutations are gated and ledger-backed.
- Repeat executions are safe.

---

## Iteration 2 (P0) — CryptoBot UX system (renderer + buttons + hub)

### Dependencies

- Iteration 1 safety backbone (callbacks must be safe).

### Deliverables (detailed)

- Rendering components:
  - Card, List, Draft, Result, Error
- Pagination sessions:
  - page cursor, TTL, ownership
- Callback protocol:
  - versioned payloads
  - validation
- `/menu` hub:
  - Reports / Deals / Tasks / Settings / Help
  - sub-menus

### Acceptance tests

- List pagination: 25 items → pages 1–4, Prev/Next works, and Pick indexes map correctly per page.
- Pick ownership: user B cannot pick from user A’s list session (blocked USER_INPUT).
- Callback payload validation: malformed/unknown version payload → safe error, no side-effects.
- Draft expiry UX: expired draft Apply → shows expired message + rebuild option; does not run.
- Hub: `/menu` is idempotent (multiple presses update/replace same hub message without spam).
- Message formatting: no message exceeds Telegram limits in typical scenarios; long fields are truncated with `…`.
- Accessibility: buttons order is consistent across Card/List/Draft/Result.

### DoD

- 12+ golden snapshots
- no truncation in typical messages

---

## Iteration 3 (P0) — Voice pipeline (STT) with transcript confirmation

### Dependencies

- Iteration 2 UX components (transcript UI).

### Voice limits (v1)

- Max duration: **120s**
- Max file size: **20 MB**
- RU/EN autodetect (best-effort)
- Low-confidence threshold: **< 0.70** → require confirm/edit

### Deliverables (detailed)

- Voice download + STT
- Transcript UX:
  - Use transcript / Edit text / Cancel
- Degradation:
  - STT down → ask for text
  - low confidence → force confirm/edit

### Acceptance tests

- Voice >120s or >20MB → immediate friendly error + ask for text; no STT attempt.
- Voice RU: transcript produced; user edits transcript; edited text is used for planning.
- Voice EN: transcript produced; language preserved.
- Low-confidence (<0.70): bot forces confirm/edit (no auto-plan).
- STT provider failure/timeout: bot responds with fallback to text and logs UPSTREAM.
- Duplicate voice update delivery (webhook redelivery): transcript step is idempotent and does not create multiple drafts.

### DoD

- Voice always results in transcript flow or safe fallback.

---

## Iteration 4 (P0) — Attio core (deal resolution + `/deal stage` reference quality)

### Dependencies

- Iteration 1 (idempotency) + Iteration 2 (pick list)

### Deliverables (detailed)

- Deal resolver:
  - search by text
  - ambiguous → Pick list
  - cache last selected deal per user (TTL)
- `/deal stage`:
  - preview resolves stage name
  - no-op detection
  - Apply uses idempotency per (deal_id, target_stage)

### Acceptance tests

- Deal search ambiguous: returns Pick list; selecting candidate persists mapping for the user session.
- Deal search exact: goes straight to Card.
- Stage alias input: user uses alias → preview shows resolved canonical stage name.
- No-op: setting stage to current stage returns Result explaining “already in stage” and does not call upstream.
- Apply idempotency: repeating stage change Apply returns stored success.
- Upstream rate limit: 429 on stage update → retries; no duplicate write.
- Permissions: Attio access denied → UPSTREAM error; Draft remains but Apply blocked.

### DoD

- Stage changes apply exactly once.

---

## Iteration 5 (P1) — Reports v1 (Attio + Linear) with export/caching

### Dependencies

- Iteration 2 (hub) + Iteration 1 (safe execution)

### CSV export format (v1)

- Encoding: UTF-8
- Delimiter: comma (`,`) 
- Max rows: 5,000 (beyond → narrow filter)
- Name: `report_<type>_<YYYY-MM-DD>.csv`

### Minimum mapping persistence (v1)

- Persist at least: `attio:deal:*` → `[linear:issue:*]`
- Prefer: `attio:deal:*` → `linear:project:*` when possible

### Deliverables (detailed)

- Pipeline report (Attio) + refresh + export
- Deal/client status (Attio)
- Status by deal (Linear) grouped by state
- Caching:
  - TTL 60–180s
  - cache key includes user/tenant/filters

### Acceptance tests

- Pipeline report: counts by stage render; refresh within TTL uses cache; refresh after TTL refetches.
- Export CSV: produces valid UTF-8 CSV, correct filename, row count <= 5,000; if >5,000 → asks to narrow filter.
- Cache key isolation: two users same query do not see each other’s cached data if ACL differs.
- Status by deal mapping missing: bot asks Pick/search; after pick mapping persists and next run is direct.
- Linear down: status by deal returns clear error and suggests retry; other Attio reports still work.
- Grounding rule: if report includes any derived statement from history (post-v1), citations must be present (guarded).

### DoD

- Reports are fast and do not hit rate limits in normal use.

---

## Iteration 6 (P1) — Linear kickoff (`/deal won` creates 12 issues, idempotent)

### Dependencies

- Iteration 1 ledger + bulk gate

### Deliverables (detailed)

- Draft shows:
  - 12 issues to create
  - bulk warning + extra confirm
- Apply:
  - creates issues idempotently by deterministic keys
  - stores mapping deal → issue ids

### Acceptance tests

- Kickoff Draft always shows bulk warning + extra confirm.
- Apply creates 12 issues; ledger stores all issue ids.
- Apply replay: repeating Apply returns same 12 ids, does not create duplicates.
- Partial failure: if 3/12 issues created then upstream fails, rerun completes remaining without duplicating existing (per-template-task idempotency).
- Team misconfig: missing LINEAR_TEAM_ID → CONFIG error with admin guidance.
- Rate limit: 429 mid-creation → retry completes without duplicates.

---

## Iteration 7 (P1) — Admin & ops completeness

### Deliverables (detailed)

- `/admin env check`
- `/admin linear teams`
- `/admin audits last`
- `/admin draft <id>` inspect
- Clear guidance for recovery paths

### Acceptance tests

- `/admin env check` lists missing env vars and shows which features are blocked.
- `/admin linear teams` returns list and confirms selected team id.
- `/admin audits last` shows last N apply attempts with external ids.
- `/admin draft <id>` can inspect a draft and its apply attempts.
- Admin commands are access-controlled (non-admin users cannot call them).

### DoD

- No manual DB edits in day-to-day ops.

---

## Iteration 8 (P1/P2) — Production hardening & test matrix

### Feature freeze rule

- Before starting Iteration 8, declare **feature freeze** for v1 scope (only bugfixes allowed).

### Deliverables (detailed)

- Automated regression for NS1–NS5
- Load sanity (double-click storms)
- Monitoring docs

### Acceptance tests

- NS1–NS5 scripted run passes in staging and production.
- Load storm: 50 duplicate callbacks within 5 seconds → only one side-effect.
- Degradation matrix behaviors are verified for Supabase/Composio/LightRAG down.
- Error budget check: user-visible failure rate <2% over a test window.

### DoD

- Scripted acceptance session passes.

---

# Iterations (post-v1 → GA)

## Iteration 9 (P0) — LightRAG integration (read-only, grounded, ACL)

### Dependencies

- LightRAG server meets `docs/lightrag-db-requirements.md`.

### Deliverables (detailed)

- `brief(entity)` with citations
- `ask(question)` with citations
- ACL propagation + server-side filtering
- Entity linking loop: ambiguous → pick → persist confirmed mapping
- Degradation path: LightRAG down → clear message, fallback to non-RAG data

### Acceptance tests

- `brief` returns summary + 3–5 citations with stable source URLs.
- `ask` refuses to answer without citations (returns insufficient evidence).
- ACL: user without support tag cannot retrieve Chatwoot citations.
- Entity linking: ambiguous company/deal prompts Pick; confirmed mapping persists and is reused next time.
- LightRAG down: bot shows degradation message and continues with non-RAG flows.
- Injection resistance: prompt injection in retrieved chat text does not bypass citations/allowlists.

---

## Iteration 10 (P0) — Entity graph navigator

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- `/menu` → Deals → Pick deal → `Everything` view renders 4 sections: Attio, Linear, Chatwoot, LightRAG.
- If a deal has 0 linked Chatwoot threads, UI shows `No conversations found` (not empty/failed).
- Clicking a linked Linear issue opens a Card with a stable URL.
- If entity mapping is ambiguous, user must Pick before `Everything` is rendered.
- ACL: a user without `team:support` cannot see Chatwoot snippets/links even if other sections load.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- Unified "everything" view with tabs/sections
- Persisted confirmed mappings

---

## Iteration 11 (P0) — Action items extraction (Chatwoot → Draft tasks)

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Given a Chatwoot conversation with 40 messages, extraction returns 3–15 action items, each with at least 1 citation linking to a message.
- Bulk threshold: if extracted tasks >= 5, Draft shows bulk warning and requires extra confirm before Apply.
- Apply creates Linear issues exactly once: repeating Apply returns the same issue ids (ledger-backed).
- If Linear is down, Apply is blocked with `Linear unavailable` and Draft remains retriable.
- If citations are missing for an item, that item must be omitted or marked `insufficient evidence` (no silent hallucination).

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- Extract tasks with citations per item
- Dedupe and idempotent Apply

---

## Iteration 12 (P1) — Advanced planner + bounded clarifications + Draft edit

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Clarification loop never asks more than 2 questions in one message.
- After 3 clarification rounds without resolution, bot offers `/menu` and a structured command fallback (no infinite loop).
- Mixed request test: “обнови стадию сделки ACME на paused и создай задачу в Linear” produces one Draft with two actions and separate previews.
- Draft Edit can change due date and assignee; edited values appear in preview and are applied.
- Allowlist enforcement holds: planner cannot cause execution of tools outside allowlists.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- max clarification policy
- mixed plans
- Draft edit UI

---

## Iteration 13 (P1) — Reminders + digests (opt-in)

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- User opts in to reminders via Draft-confirmed subscription; without opt-in, no reminders are sent.
- Quiet hours respected: reminders are delayed to the next allowed window in user timezone.
- Digest generation includes citations for any “history-based” statements.
- Unsubscribe flow stops future messages immediately.
- Failure mode: if scheduler/job fails, reminders are not duplicated (idempotency for sends).

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- opt-in subscriptions
- timezone and quiet hours

---

## Iteration 14 (P1) — Settings UX

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- `/settings` can set timezone; subsequent time renderings use that timezone.
- Default Linear team/state selection is persisted; creating a task uses defaults without asking again.
- Settings changes are immediately reflected in subsequent Draft previews.
- ACL-related settings cannot be escalated by user input (server-side authority).
- Settings UI is fully operable via buttons (no manual env edits).

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- settings menu
- defaults persisted

---

## Iteration 15 (P1) — Bulk import `/client-mass` (optional)

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Bulk input preview shows per-item validation errors with item indexes.
- Apply refuses to run if any item is invalid unless user explicitly deselects invalid items.
- Apply runs in batches and is idempotent per item; re-run does not duplicate created records.
- If upstream rate limits occur mid-batch, resume is possible without duplicates.
- Audit log contains counts: attempted/succeeded/failed.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- preview + validation + idempotent apply

---

## Iteration 16 (P0) — Security hardening & compliance

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Retention policy is enforced: cached artifacts older than TTL are not retrievable.
- Delete flow test: deleting a user-scoped dataset makes it non-searchable and non-retriavable.
- PII redaction: a support-only field is not shown to sales role.
- Secrets never appear in logs or user-facing errors.
- Security review checklist passes (documented evidence).

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- retention policy
- delete flows
- PII redaction by role

---

## Iteration 17 (P0) — Observability, SLO, incident playbooks

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Metrics exist for: planner latency, composio latency, supabase latency, LightRAG latency, error rates by category.
- Alert triggers on sustained 429s/5xx or high error rates.
- Playbook drill: simulate LightRAG down → bot shows correct degradation message and continues non-RAG flows.
- Feature flag can disable LightRAG integration without redeploy.
- Incident record contains correlation ids to trace a user request.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- metrics & alerts
- playbooks
- feature flags

---

## Iteration 18 (P1) — Release engineering

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Staging deploy uses separate env/DB and does not affect prod.
- Canary rollout enables new version for a subset of users; rollback restores previous behavior.
- Migration discipline: apply forward-compatible migration, then deploy app; rollback does not break reads.
- Zero-downtime deploy for webhook handler (no missing updates).
- Release notes generated from merged PRs/issues.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- staging/canary
- migrations discipline

---

## Iteration 19 (P0) — QA automation & regression gates

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- CI runs a scripted NS1–NS5 suite and fails the PR if any step regresses.
- Golden snapshot tests detect formatting drift for Card/List/Draft/Result.
- Load test: simulate 20 rapid Apply clicks; system performs exactly one side-effect.
- ACL test suite ensures no cross-role leakage.
- RAG grounding test suite: any answer without citations fails.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- scripted acceptance
- CI gates

---

## Iteration 20 (P0) — GA launch

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- New user onboarding: `/start` guides to connect integrations, then validates env and connections.
- Onboarding ends with one successful query and one successful Draft→Apply mutation.
- Help/FAQ accessible from `/menu` and answers are short and actionable.
- Support loop: “report a problem” creates an internal ticket/issue via Draft with attached context.
- First-run experience completes within 5 minutes for a user with valid credentials.

### DoD

- Feature is accessible from `/menu` hub (when relevant)
- All mutations are Draft-gated and idempotent

### Pitfalls

- If mapping is missing, must use Pick list + persist confirmed mapping
- Avoid wall-of-text; paginate

### Deliverables (detailed)

- onboarding
- docs
- support loop

---

# Release checklist (GA cut)

A release to GA is allowed only when:

- North Star flows NS1–NS5 pass in staging and production.
- LightRAG grounded answers (Iteration 9) pass with citations.
- No open P0 safety issues (idempotency, allowlists, ACL) remain.
- Feature freeze has been declared and only bugfix PRs merged for the last hardening window.
- Incident playbooks exist and have been dry-run once.

---

# SLO targets (v1+)

These are product targets (not just infra):

- Query (read-only) response: p95 ≤ 3s
- Draft generation: p95 ≤ 5s
- Apply (mutations): p95 ≤ 20s with progress UX
- Error rate: < 2% user-visible failures (excluding invalid input)

---

# Degradation matrix (must be implemented)

| Dependency down | User-facing behavior | Allowed actions |
|---|---|---|
| Supabase down | Show `DB unavailable` + retry button, disable Apply | Read-only only (best-effort), no mutations |
| Composio down | Show `Integrations unavailable`, keep Draft but block Apply | No mutations, queries may degrade |
| Attio down | Show `Attio unavailable` | No Attio mutations/queries |
| Linear down | Show `Linear unavailable` | No Linear mutations/queries |
| LightRAG down | Show `Knowledge temporarily unavailable` | Proceed with non-RAG flows only |

---

# Post-GA backlog

- Undo (only where safely reversible)
- deeper analytics dashboards
- additional connectors
