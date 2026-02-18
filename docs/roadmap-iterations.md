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

**Goal:** make it *impossible* to accidentally write without Draft and *impossible* to duplicate side-effects.

### Why this iteration is critical (failure modes)

If we ship features before this is done, we will:

- create duplicate Linear issues / Attio updates under retries and double-clicks
- accidentally execute writes when the user thinks they are running a query
- be unable to debug Apply outcomes
- leak sensitive details in errors/logs

### Scope (what is IN)

- Ledger-backed idempotency for **callbacks** and **side-effect units**
- Strict tool routing policy via allowlists/denylists (planner is not trusted)
- Retry/backoff wrappers with deadlines
- Error taxonomy + short user-facing renderer
- Bulk risk gate (>=5 operations) + extra confirmation step
- Per-action observability (external ids, timings, outcomes)

### Out of scope (what is NOT in Iteration 1)

- Voice STT
- Fancy UI rendering beyond safe Draft/Apply messages
- New business flows (deal won kickoff, reports)

### Dependencies

- Supabase runtime tables exist and are writable.
- Cloudflare Worker can reach Supabase + Composio.

### Design (detailed)

#### 1) Idempotency ledger model

We need **two layers**:

1) **Telegram callback idempotency**
   - key: `tg:callback:<callback_query_id>`
   - purpose: protect against Telegram redeliveries and double taps

2) **Side-effect unit idempotency** (the important one)
   - keys must be deterministic and represent *one* external effect
   - examples:
     - Attio stage update: `attio:update_deal_stage:<deal_id>:<target_stage_key>`
     - Linear issue create from template: `linear:create_issue:<deal_id>:<template_task_key>`

**Ledger record** must store:

- `key`
- `status`: `in_progress|succeeded|failed`
- `started_at`, `finished_at`
- `result_payload` (JSON) including `external_ids`
- `error` (code/message/details), if failed

**Concurrency rule:**

- first request sets `in_progress`
- concurrent requests:
  - either wait/poll briefly and then return stored result
  - or return a safe “already processing” response (but must not re-run)

#### 2) Tool policy

Maintain explicit sets in code:

- `READ_ONLY_TOOL_SLUGS`
- `MUTATE_TOOL_SLUGS`
- `DENY_TOOL_SLUGS`

Rules:

- if tool is not in allowlists → block (CONFIG/SECURITY)
- if intent=query but tool is mutate → force Draft or block
- denylist always blocks

**Note:** This is essential for safe Composio MCP routing.

#### 3) Retry/backoff

Implement `withRetry()` that:

- retries on 429 / 5xx / network
- exponential backoff + jitter
- max attempts + total deadline

**Rule:** retries must never create duplicate side-effects → always combine with ledger keys.

#### 4) Bulk risk gate

Policy:

- count planned operations (creates/updates/deletes)
- if >=5:
  - show bulk warning (Draft)
  - require extra confirmation step (e.g., `✅ Apply (confirm)`)

#### 5) Error taxonomy + renderer

Normalize all errors into:

- `USER_INPUT`
- `CONFIG`
- `UPSTREAM`
- `DB`

User-facing errors are:

- 1–3 lines
- include a clear next step
- never include secrets

#### 6) Per-action observability

For each Apply, store:

- correlation id
- action id / idempotency scope
- timings
- external ids
- outcome

### Acceptance tests (max)

- Callback replay: same `callback_query_id` twice → second returns stored result, no extra writes.
- Operation replay: same side-effect key executed twice via different callbacks → second returns stored result.
- Concurrency: two Apply requests in parallel → exactly one executes.
- Retry: 429 then success → no duplicates.
- Query/mutate safety: planner tries to run mutate tool in query mode → blocked/forced Draft.
- Bulk boundary: 4 ops no extra confirm; 5 ops requires extra confirm.
- No secrets in logs/errors.

### DoD

- No side-effect can be executed twice under any combination of retries, double taps, or webhook redelivery.
- Unknown tools cannot execute.
- Admin/debug can inspect ledger and apply attempts.

---

## Iteration 2 (P0) — CryptoBot UX system (renderer + buttons + hub)

**Goal:** ship a consistent, button-driven UX so the bot is usable without typing commands.

### Why this iteration is critical

Without a strict UX system:

- users cannot safely resolve ambiguity
- Draft previews become unreadable
- the bot becomes “chatty” and unreliable in Telegram UI constraints

### Dependencies

- Iteration 1 safety backbone (callbacks must be safe; Draft expiry enforced).

### Scope

- Message rendering primitives (Card/List/Draft/Result/Error)
- Inline keyboard patterns + versioned callback payload schema
- Pagination sessions (<=8 items/page)
- Pick list for ambiguity
- `/menu` hub + sub-menus
- Draft expiry UX + rebuild

### Design (detailed)

#### 1) Renderer primitives

- **Card**: single entity, short title + key fields + links
- **List**: 1–8 items/page, stable item numbering, prev/next
- **Draft**: steps + resolved targets + risk flags + buttons
- **Result**: applied summary + external links + optional repeat
- **Error**: category + next step

**Telegram formatting rules:**

- hard limit on lines and characters
- truncate long fields with `…`
- no nested huge markdown tables

#### 2) Callback payload schema

- versioned: `v1|<kind>|<session_or_draft_id>|<action>|<args>`
- kinds:
  - `nav` (pagination)
  - `pick` (select candidate)
  - `draft` (apply/cancel/details/rebuild)
  - `menu` (hub navigation)

Validation:

- reject unknown version
- reject payloads not owned by current user

#### 3) Pagination sessions

Store:

- list session id
- owner user id
- items snapshot (ids + display)
- created_at + TTL

#### 4) Draft expiry + rebuild

- Draft has `expires_at`
- Apply after expiry:
  - show “expired”
  - button: `Rebuild draft`

### Acceptance tests (max)

- 25-item list paginates to 4 pages; pick indexes map correctly.
- User B cannot pick user A’s list.
- Malformed callback payload → safe Error, no side-effects.
- `/menu` is idempotent (no spam).
- Draft expiry flow works end-to-end.

### DoD

- UI components are reusable and consistent.
- All ambiguity goes through Pick list.

---

## Iteration 3 (P0) — Voice pipeline (STT) with transcript confirmation

**Goal:** voice is first-class, safe, and predictable.

### Dependencies

- Iteration 2 UI components.
- Iteration 1 safety (no duplicate drafts/side-effects).

### Voice limits (v1)

- Max duration: **120s**
- Max file size: **20 MB**
- RU/EN autodetect (best-effort)
- Low-confidence threshold: **< 0.70** → require confirm/edit

### Design (detailed)

#### 1) Voice ingestion

- download voice file
- validate size/duration upfront
- run STT

#### 2) Transcript UX

- show transcript preview
- buttons:
  - `✅ Use transcript`
  - `✏️ Edit text`
  - `❌ Cancel`

#### 3) Degradation policy

- STT failure/timeout → ask for text
- low confidence → require confirm/edit
- webhook redelivery → idempotent transcript stage

### Acceptance tests (max)

- >120s or >20MB → no STT, friendly error.
- low confidence forces confirm/edit.
- STT timeout → fallback to text.

### DoD

- Voice never triggers a side-effect without transcript confirmation and Draft.

---

## Iteration 4 (P0) — Attio core (deal resolution + `/deal stage` reference quality)

**Goal:** one mutation and one query become reference-quality, proving the whole safety+UX stack.

### Dependencies

- Iteration 1 (idempotency, allowlists, retries)
- Iteration 2 (List/Pick/Card)

### Scope

- Deal resolver (search + pick)
- Deal card
- `/deal stage` Draft → Apply
- Stage aliases
- No-op handling

### Design (detailed)

#### 1) Deal resolver

- search by text
- if 0 results → ask refine
- if 1 result → select
- if >1 → Pick list

Persist:

- last selected deal per user (TTL) for context

#### 2) `/deal stage`

Draft preview must show:

- deal name
- current stage
- target stage (resolved canonical name)

Apply:

- idempotency key per (deal_id, target_stage)
- retries on upstream failures

No-op:

- if already in target stage → return Result, no upstream write

### Acceptance tests (max)

- ambiguous deal → Pick → selection persists
- stage alias resolves
- no-op does not write
- 429 retries safely

### DoD

- NS1 (text variant) can be executed safely once voice exists.

---

## Iteration 5 (P1) — Reports v1 (Attio + Linear) with export/caching

**Goal:** high-utility read-only experiences with correct caching and safe mapping.

### Dependencies

- Iteration 1 safety backbone
- Iteration 2 hub + pagination

### Scope

- Pipeline report (Attio)
- Deal/client status card (Attio)
- Status by deal (Linear) grouped by state
- Export CSV
- Cache TTL
- Mapping persistence (deal → issue ids / project if possible)

### Design (detailed)

#### 1) Report caching

- TTL: 60–180s
- cache key includes:
  - tenant
  - user role/ACL
  - filters

#### 2) CSV export

- UTF-8, comma
- max rows 5,000
- if exceeded → ask narrow filter

#### 3) Mapping rules

- if mapping exists → use directly
- if mapping missing:
  - ask Pick
  - persist confirmed mapping

### Acceptance tests (max)

- refresh within TTL uses cache
- export enforces max rows
- mapping missing triggers pick and then persists
- ACL isolation prevents cross-user cache leakage

### DoD

- NS4 and NS5 are achievable and stable.


## Iteration 6 (P1) — Linear kickoff (`/deal won` creates 12 issues, idempotent)

**Goal:** automate Design Studio kickoff in Linear with *zero duplicates* and clear UX.

### Why this iteration is critical

- Users will click Apply multiple times.
- Linear APIs will rate-limit.
- Partial progress is the norm (3/12 created then failure).

If we don’t design this as per-unit idempotent, the workspace will fill with junk issues.

### Dependencies

- Iteration 1:
  - ledger-backed idempotency
  - retry/backoff
  - bulk gate
- Iteration 2:
  - Draft/Result rendering
- Iteration 4:
  - deal resolution (deal_id must be stable)

### Scope

- Intent: “deal won kickoff” (from slash or free-form later)
- Draft preview:
  - 12 tasks list (titles)
  - bulk warning + extra confirm
  - target Linear team
- Apply:
  - creates missing issues only
  - persists mapping `attio:deal:*` → `[linear:issue:*]`
  - returns Result with links

### Design (detailed)

#### 1) Template task identity

Every kickoff task must have a stable `template_task_key`.

- Store keys in DB table (already present): `bot.project_template_tasks`
- Issue idempotency key must include:
  - `deal_id`
  - `template_task_key`

Example:

- `linear:create_issue:<attio_deal_id>:<template_task_key>`

#### 2) Bulk confirmation UX

Draft must show:

- `⚠️ This will create 12 issues`
- buttons:
  - `✅ Apply (confirm)`
  - `❌ Cancel`
  - `🔎 Details`

#### 3) Apply execution strategy (resume-safe)

- For each template task:
  - attempt `runIdempotentOperation(key, create_issue)`
  - store `issue_id` in ledger result
- After loop:
  - persist mapping deal → issue_ids (also ledger stores it)
- If apply fails mid-way:
  - next apply resumes where it left off (because keys are per-task)

#### 4) Linear configuration gates

- `LINEAR_TEAM_ID` must exist (CONFIG error if missing)
- If multiple teams are possible later, require `/admin linear teams` to set one

#### 5) Output

Result message must include:

- count created vs already existed
- links to created issues (paginated if needed)

### Acceptance tests (max)

- Draft always shows bulk warning and requires extra confirm.
- Apply creates exactly 12 issues once; replay returns same ids.
- Partial failure 3/12 then retry completes 9 remaining without duplicates.
- 429 mid-run → retry/backoff completes safely.
- Missing LINEAR_TEAM_ID → CONFIG error with next steps.

### DoD

- Workspace never gets duplicates from this flow.

---

## Iteration 7 (P1) — Admin & ops completeness

**Goal:** no manual DB edits; fast recovery; safe operations.

### Dependencies

- Iteration 1 observability + error taxonomy

### Scope

Admin features must be:

- access controlled
- safe (no destructive ops in prod)
- actionable (show what is wrong and how to fix)

### Commands (detailed)

#### `/admin env check`

- Validates required env vars:
  - Telegram
  - Supabase
  - Composio
  - Linear team id
  - STT provider (later)
- Output:
  - ✅ present
  - ❌ missing
  - which features are blocked

#### `/admin linear teams`

- Lists available teams (or configured allowlist)
- Allows setting `LINEAR_TEAM_ID` safely

#### `/admin audits last`

- Shows last N apply attempts:
  - draft id
  - user
  - outcomes summary
  - external ids

#### `/admin draft <id>`

- Inspect draft:
  - status
  - payload
  - apply attempts
  - idempotency keys

### Safety constraints

- Admin commands must not leak secrets.
- Must be rate-limited.

### Acceptance tests (max)

- Non-admin cannot call admin commands.
- Env check correctly reports missing variables.
- Audit list shows meaningful external ids.

### DoD

- Day-to-day ops can be performed via admin commands only.

---

## Iteration 8 (P1/P2) — Production hardening & test matrix

**Goal:** stability under real conditions.

### Dependencies

- Iterations 1–7 implemented.

### Feature freeze rule

- Declare **feature freeze** for v1 scope.
- Only bugfix PRs allowed.

### Deliverables (detailed)

#### 1) Automated regression suite

- Scripted tests for NS1–NS5
- Includes:
  - retries
  - replay
  - concurrency
  - list ownership

#### 2) Load sanity

- click-storm tests:
  - 50 duplicate callbacks within 5 seconds

#### 3) Degradation verification

- Validate degradation matrix:
  - Supabase down
  - Composio down
  - Linear down
  - Attio down
  - LightRAG down (post-v1 readiness)

#### 4) Error budget check

- user-visible failure rate <2% under controlled test window

### Acceptance tests (max)

- NS1–NS5 scripted run passes.
- Degradation behaviors match matrix.

### DoD

- Release can be performed with confidence.

---

## Iteration 9 (P0) — LightRAG integration (read-only, grounded, ACL)

**Goal:** connect the LightRAG server as product memory with grounded answers and correct ACL.

### Dependencies

- LightRAG meets `docs/lightrag-db-requirements.md`.
- Bot has Pick list UX (Iteration 2) and mapping persistence.

### Scope

- Read-only only (no side-effects)
- Features:
  - `brief(entity)`
  - `ask(question)`
- Must return citations (mandatory)
- Must enforce ACL server-side

### Design (detailed)

#### 1) API contract assumptions

LightRAG must support:

- `/search` with filters
- `/answer` with citations
- `/brief` with citations

Bot must send:

- tenant id
- ACL tags/role
- entity refs when possible

#### 2) Grounding enforcement

- If citations are empty:
  - return “not found / insufficient evidence”
  - do not hallucinate

#### 3) Entity linking loop

- If query ambiguous:
  - use candidates from LightRAG or local search
  - show Pick list
- On Pick:
  - persist confirmed mapping (either in LightRAG DB or in bot DB)

#### 4) Prompt injection resistance

- Never allow retrieved text to change tool allowlists or bypass policies.
- Treat retrieved content as untrusted.

### Acceptance tests (max)

- brief returns 3–5 citations with stable URLs.
- ask refuses to answer without citations.
- ACL: sales cannot see support-only Chatwoot snippets.
- LightRAG down: “Knowledge temporarily unavailable” and continue non-RAG flows.

### DoD

- Grounded answers are reliable.

---

## Iteration 10 (P0) — Entity graph navigator

**Goal:** a single, navigable view across Attio/Linear/Chatwoot/LightRAG.

### Dependencies

- Iteration 9 LightRAG brief + citations
- Iteration 4 deal resolver
- Mapping persistence

### Scope

- New UX view: `Everything`
- Sections:
  - Attio: deal/company/person card
  - Linear: linked issues/projects
  - Chatwoot: linked conversations
  - LightRAG: brief + top citations

### Design (detailed)

#### 1) Data assembly

- Resolve canonical entity (deal/company)
- Fetch linked objects:
  - mapping tables
  - LightRAG search by entity_ref

#### 2) Empty states

- Each section must have a meaningful empty state, not a blank error.

#### 3) ACL constraints

- Even if other sections render, restricted content must be hidden.

### Acceptance tests (max)

- `/menu` → Deals → Pick deal → Everything view renders 4 sections.
- No conversations found shows empty state.
- Restricted users cannot see Chatwoot content.

### DoD

- Users can navigate context without switching apps.


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
