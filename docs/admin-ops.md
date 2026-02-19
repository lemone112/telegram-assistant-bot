# Admin & Ops (runbook)

This runbook defines **how to operate** the bot in production without manual DB edits.

## 1) Admin access model

- Admins are defined by an allowlist of Telegram `user_id`.
- All admin actions are audited.
- Admin outputs must not leak secrets.

## 2) Commands

### 2.1 Available today (implemented)

These commands are currently supported by the runtime admin parser:

- `/admin status`
- `/admin composio`
- `/admin linear teams`

> If you run an unknown subcommand, the bot will respond with `Unknown admin command`.

### 2.2 Planned (Iteration 7)

The following commands are **planned** and referenced by the roadmap, but not yet implemented:

- `/admin env check`
- `/admin audits last [N]`
- `/admin draft <id>`
- `/admin retry draft <id>`
- `/admin mappings show <entity>`

---

## 3) Production flows (today)

### A) Linear kickoff blocked (team id missing)

**Symptom:** `/deal won` fails with config error.

**Fix (today):**

1. Set `LINEAR_TEAM_ID` in environment.
2. Redeploy.
3. Re-run the draft/apply.

**Fix (planned):**

- Use `/admin linear teams` to set DB config `linear.default_team_id` (requires code change).

### B) Composio connectivity problems

1. Run `/admin composio`.
2. Verify connections are active and tools are available.

---

## 4) Security rules

- Never print secret values.
- Rate-limit admin commands.
- Audit admin usage.

---
