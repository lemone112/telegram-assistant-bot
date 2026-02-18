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

- Double-click Apply on same Draft → only one side-effect, second returns stored result.
- Simulated 429 from upstream → retries, no duplicates.
- Planner suggests unknown tool → blocked with CONFIG/SECURITY message.

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

- NS2 fully passes using List→Pick→Card.
- Pagination works for >8 items and does not leak other user's sessions.

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

- NS1 steps 1–2 pass.

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

- NS1 fully passes end-to-end.

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

- NS4 passes.
- NS5 passes (mapping fallback uses Pick list).

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

- NS3 passes.

---

## Iteration 7 (P1) — Admin & ops completeness

### Deliverables (detailed)

- `/admin env check`
- `/admin linear teams`
- `/admin audits last`
- `/admin draft <id>` inspect
- Clear guidance for recovery paths

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

- brief returns 3–5 citations
- promise/deadline answers contain citations

---

## Iteration 10 (P0) — Entity graph navigator

### Dependencies

- Iteration 1 (ledger + allowlists)
- Iteration 2 (pagination/pick UX)

### Acceptance tests

- Core scenario for Iteration 10 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 11 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 12 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 13 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 14 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 15 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 16 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 17 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 18 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 19 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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

- Core scenario for Iteration 20 runs end-to-end in staging
- No missing citations when grounded answers are expected
- No data leakage across ACL boundaries

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
