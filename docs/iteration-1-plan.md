# Iteration 1 — Implementation plan (Core runtime platform)

This document is the **implementation plan** for Iteration 1 described in [`docs/iters.md`](./iters.md).

Scope: build the platform foundations (UI-first, Draft-first, allowlist-only) without implementing business scenarios yet.

---

## Goals (Iteration 1)

1) **UI-first navigation works end-to-end**
- Any allowed user always sees a button-driven menu.
- Wizards can be started, cancelled, and resumed deterministically.

2) **Draft-first + Apply/Cancel is functional**
- The bot can create a Draft, render a preview, and apply/cancel it.

3) **Idempotency guarantees are enforced**
- Repeated callback clicks and repeated Apply events do not duplicate side-effects.

4) **Error handling matches the runtime contract**
- Never leave the user without a Telegram response.
- Default to HTTP 200 to avoid harmful retries.

5) **Observability writes never block business operations**
- Audit/attempt logs are best-effort.

---

## Non-goals (Iteration 1)

- No real Attio/Linear mutations yet (no Composio execute in production flows).
- No advanced planner logic.
- No voice/STT.

---

## Data model mapping (what tables are used)

### Required reads/writes

- `bot.telegram_users`
  - upsert Telegram user identity on every update

- `bot.user_input_state`
  - read current wizard state
  - write next wizard state (`flow`, `step`, `payload`, `return_to`)

- `bot.drafts`
  - create Draft records
  - transition status: `DRAFT → APPLIED|CANCELLED|EXPIRED`

- `bot.idempotency_keys`
  - insert/check keys for callbacks and apply actions

- `bot.audit_log`
  - best-effort event logging

- `bot.draft_apply_attempts`
  - best-effort apply attempt tracking

### Key invariants
- `user_input_state` is unique per Telegram user.
- `idempotency_keys.key` is globally unique.

---

## State machine (canonical keys)

### Global
- `flow`: one of `menu`, `tasks`, `clients`, `design_studio`, `profile`, `admin`
- `step`: flow-specific step name
- `payload`: JSON object, versioned
- `return_to`: optional JSON object `{ flow, step, payload }`

### Menu
- `flow=menu`, `step=home`

### Draft preview
- stored as Draft in DB; the UI can be entered from any wizard.

---

## Callback protocol v1 (final)

### Constraints
- Telegram `callback_data` must be compact (<= 64 bytes).
- Must be parseable and versioned.

### Encoding
- Prefix all callback payloads with `v1:`.
- Use `:` separators.

### Opcodes

- `v1:M:<key>`
  - menu navigation
  - examples: `v1:M:tasks`, `v1:M:profile`, `v1:M:home`

- `v1:W:<flow>:<step>:<token>`
  - wizard navigation
  - `<token>` is a short server-generated key to look up full payload in DB if needed

- `v1:D:A:<draft_id>`
  - apply draft

- `v1:D:C:<draft_id>`
  - cancel draft

- `v1:SYS:BACK` / `v1:SYS:CANCEL` / `v1:SYS:MENU`
  - universal navigation

### Callback idempotency
- For every callback_query, compute key: `tg:callback:<callback_query_id>`
- Insert into `bot.idempotency_keys` as the first side-effect.
- If insert fails due to uniqueness, treat callback as already handled.

---

## Idempotency key taxonomy (Iteration 1)

### Callback
- `tg:callback:<callback_query_id>`

### Draft apply (coarse for Iteration 1)
- `draft:<draft_id>:apply`

> Later iterations must use per-action keys, but Iteration 1 only needs the coarse apply key.

### Logging
- No idempotency required for audit_log inserts (best-effort), but must be safe to retry.

---

## Telegram message templates (Iteration 1)

### Main Menu
- Title: `Assistant`
- Body: short description
- Buttons: `Tasks`, `Clients`, `Design Studio`, `Profile`, `Help`

### Draft preview
- Title: `Draft #<short>`
- Body:
  - Summary
  - Steps (numbered)
  - Risks (if any)
- Buttons: `Apply`, `Cancel`, `Menu`

### Error (contract)
- 1-line summary
- 1–2 lines what happened
- `Retry safe?` Yes/No
- `Next step`

---

## Error handling policy (HTTP + UX)

### HTTP defaults
- Return HTTP 200 for:
  - invalid user input
  - forbidden (allowlist)
  - dependency failures where platform retries are harmful

### When HTTP 500 is allowed
- Only if we explicitly want upstream retries (rare).

### Telegram response rule
- If the user is allowed and we can reach Telegram API, we must send a response.

---

## Acceptance tests (must pass before Iteration 2)

1) **Allowlist gating**
- Non-allowed user: no sensitive output; return HTTP 200.

2) **Menu UX**
- Allowed user: any message shows Menu.
- Buttons navigate without requiring typing.

3) **Draft create → preview**
- Starting a wizard produces a Draft preview (even if the actions are stubbed).

4) **Apply idempotency**
- Press Apply twice: only one `draft:<draft_id>:apply` key exists.

5) **Callback idempotency**
- Press the same callback repeatedly: bot does not duplicate work.

6) **Supabase down**
- Apply is blocked with `DEPENDENCY_DOWN` error message.

7) **No silent failures**
- Any error path returns an actionable message (for allowed users).

---

## PR checklist (Iteration 1)

- CI passes (`typecheck`, `build`).
- No direct commits to `main` (PR only).
- Docs updated if any behavior deviates from contracts.
