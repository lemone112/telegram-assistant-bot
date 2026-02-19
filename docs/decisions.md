# Product decisions (authoritative)

This document records **project-level decisions** that are not explicitly specified elsewhere.

> Rule: if a decision affects data consistency, security (ACL), or idempotency, it must be written here.

## D-001 — Linear team configuration storage

### Decision

- **Today (current runtime):** the bot resolves the default Linear team id from **environment** only: `LINEAR_TEAM_ID`.
- **Planned (Iteration 7 / follow-up code change):** add a DB-backed runtime config layer (`bot.config` key `linear.default_team_id`) editable via admin commands, with env as fallback.

### Rationale

- Changing env vars requires redeploys and is error-prone for ops.
- Admin workflows (Iteration 7) require safe remediation without touching infrastructure.
- DB config allows per-tenant evolution later without breaking current single-tenant behavior.

### Target policy (once implemented)

- On every Linear operation, resolve team id as:
  1. `bot.config` value `linear.default_team_id` (if set)
  2. `process.env.LINEAR_TEAM_ID`
  3. else: raise `CONFIG_MISSING` with next steps.

### Admin UX (target)

- `/admin linear teams` allows setting `linear.default_team_id`.
- Any **write** action requires explicit confirmation.

---

## D-002 — ACL UX for restricted sections (Everything view)

### Decision

- If a user is not allowed to see a section (e.g. Chatwoot), the section is **hidden by default**.

### Rationale

- Showing a “Restricted” placeholder can leak the **existence** of sensitive conversations.
- Hiding provides safer privacy semantics and simpler mental model.

### Optional debug mode

- Admins may enable a debug flag `ui.show_restricted_placeholders=true` (planned DB config) to render placeholders for troubleshooting.
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
