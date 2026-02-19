# Admin & Ops (runbook)

This runbook defines **how to operate** the bot in production without manual DB edits.

## 1) Admin access model

- Admins are defined by an allowlist of Telegram `user_id`.
- All admin actions are audited.
- Admin outputs must not leak secrets.

## 2) Required commands

### `/admin env check`

**Purpose:** validate configuration and show actionable remediation.

**Output rules:**

- Never print secret values.
- Show status per variable: ✅ present / ❌ missing.
- Show “blocked features” list.

**Minimum checklist:**

- Telegram webhook secret (if used)
- Supabase URL/keys (present/missing)
- Composio credentials (present/missing)
- Linear team id resolution:
  - DB config `linear.default_team_id` OR env `LINEAR_TEAM_ID`
- Future providers (STT) as optional warnings.

### `/admin linear teams`

**Purpose:** discover and set the default Linear team.

**Write safety:**

- Any change requires a second confirmation step.

**Storage:**

- Writes to DB config key `linear.default_team_id`.

### `/admin audits last [N]`

**Purpose:** show last N Draft/Apply operations.

**Must include:**

- draft_id
- user
- timestamp
- outcome
- linked external ids

### `/admin draft <id>`

**Purpose:** inspect a draft and its apply attempts.

**Must include:**

- draft status
- payload (redacted)
- idempotency keys
- per-attempt outcomes + error taxonomy class

## 3) Non-destructive remediation

### `/admin retry draft <id>`

- Re-runs Apply for a previously created draft.
- Safe by design because Apply uses per-unit idempotency keys.

### `/admin mappings show <entity>`

- Prints all known links (from Link Registry) for a given entity.

## 4) Incident quick flows

### A) Linear kickoff creates duplicates

This should be impossible if per-task idempotency is used.

If it happens:

1. `/admin audits last 20` — find the offending draft ids.
2. `/admin draft <id>` — verify idempotency keys include `(deal_id, template_task_key)`.
3. Check that Link Registry is upserting links on success.

### B) LightRAG answers without citations

1. Treat as a bug: citations are mandatory.
2. Disable RAG features (feature flag) until fixed.

### C) LightRAG down

- Bot must respond: “Knowledge temporarily unavailable” and continue non-RAG flows.

---
