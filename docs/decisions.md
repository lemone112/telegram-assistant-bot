# Product decisions (authoritative)

This document records **project-level decisions** that are not explicitly specified elsewhere.

> Rule: if a decision affects data consistency, security (ACL), or idempotency, it must be written here.

## D-001 — Linear team configuration storage

### Decision

- The bot supports **two configuration layers** for the default Linear team:
  1. **Runtime config in DB (primary)** — editable via admin commands.
  2. **Environment variable fallback (secondary)** — `LINEAR_TEAM_ID`.

### Rationale

- Changing env vars requires redeploys and is error-prone for ops.
- Admin workflows (Iteration 7) require safe remediation without touching infrastructure.
- DB config allows per-tenant evolution later without breaking current single-tenant behavior.

### Policy

- On every Linear operation, resolve team id as:
  1. `bot.config` value `linear.default_team_id` (if set)
  2. `process.env.LINEAR_TEAM_ID`
  3. else: raise `CONFIG_MISSING` with next steps.

### Admin UX

- `/admin linear teams` shows teams and allows setting `linear.default_team_id`.
- Any **write** action requires explicit confirmation.

---

## D-002 — ACL UX for restricted sections (Everything view)

### Decision

- If a user is not allowed to see a section (e.g. Chatwoot), the section is **hidden by default**.

### Rationale

- Showing a “Restricted” placeholder can leak the **existence** of sensitive conversations.
- Hiding provides safer privacy semantics and simpler mental model.

### Optional debug mode

- Admins may enable a debug flag `ui.show_restricted_placeholders=true` (DB config) to render placeholders for troubleshooting.
- The placeholder must not include counts, timestamps, participants, or titles.

---

## D-003 — Link Registry is the bot’s runtime source of truth

### Decision

- The bot maintains a **Link Registry** in its own DB and uses it as runtime source-of-truth for cross-system mappings.
- LightRAG may store links too, but the bot **must not** depend on LightRAG for critical runtime linking.

### Rationale

- Bot needs deterministic, low-latency linking for Telegram UX.
- LightRAG availability must not break core navigation.
- Avoids divergence when ingestion lags.

### Minimal schema

- `links` table (logical):
  - `tenant_id`
  - `from_global_ref`
  - `to_global_ref`
  - `link_type` (e.g. `deal_has_issue`, `company_has_conversation`)
  - `confidence` (`confirmed|inferred`)
  - `source` (`user_pick|kickoff_apply|ingestion`)
  - timestamps

### Invariants

- All side-effect operations that create external objects MUST upsert a confirmed link.
- Entity Graph Navigator (Iteration 10) MUST build from Link Registry first.

---

## D-004 — Telegram webhook perimeter security

### Decision

- In production, the bot **must** verify Telegram webhook authenticity using the header:
  - `X-Telegram-Bot-Api-Secret-Token`

### Configuration

- Env var: `TELEGRAM_WEBHOOK_SECRET_TOKEN`

### Policy

- If `TELEGRAM_WEBHOOK_SECRET_TOKEN` is missing in production:
  - reject all webhook requests (treat as misconfiguration)
- If the request header is missing or mismatched:
  - return HTTP 401/403
  - do not process the update (no Draft/Apply)

### Rationale

- Prevents forged requests against the webhook endpoint.
- Reduces blast radius of service-role DB usage.

---

## D-005 — Idempotency ledger policy (write ordering)

### Decision

- The bot’s idempotency gate is stored in `bot.idempotency_keys`.
- The idempotency key MUST NOT be persisted until **all preconditions** are validated.

### Policy

- For any side-effect Apply flow, ordering must be:
  1. parse + validate input
  2. validate config
  3. validate authorization
  4. (optional) best-effort attempt logging
  5. execute business side-effects
  6. persist idempotency key

### Rationale

- Prevents the “key recorded, business action not executed” failure mode.

### Future (optional)

- Upgrade `bot.idempotency_keys` into a full ledger with status (`in_progress|succeeded|failed`) if needed.

---

## D-006 — Outbound call policy (timeouts, retries, and classification)

### Decision

All outbound calls (Composio, Linear, Attio, Chatwoot, LightRAG) must follow a unified policy.

### Policy

- **Timeouts:** every outbound call must have a hard timeout (AbortController).
- **Retries:** only retry on:
  - HTTP 429
  - transient 5xx
- **Retry budget:** must be bounded (max attempts) and use exponential backoff + jitter.
- **Classification:** errors must be normalized into bot error taxonomy:
  - `RATE_LIMITED` (429)
  - `DEPENDENCY_DOWN` (timeouts / 5xx)
  - `CONFIG_MISSING` / `FORBIDDEN` (401/403 depending on context)

### Rationale

- Prevents hanging webhook handlers.
- Makes degradation predictable.
- Preserves idempotency under retries.

---
