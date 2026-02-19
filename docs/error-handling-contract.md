# Error handling contract (authoritative)

This is the **runtime contract** for how the bot must handle and surface errors.

## Implemented today vs Planned

- **Implemented today** means the current runtime already behaves this way.
- **Planned** means this is a required target behavior, but the runtime may not fully enforce it yet.

## 1) Goals

- Never leave the user without a Telegram response.
- Make failures actionable.
- Preserve idempotency guarantees.

## 2) Error taxonomy (minimum)

All errors must map to one of these classes:

- `FORBIDDEN` — user not allowed to perform action
- `CONFIG_MISSING` — required config/env missing
- `INVALID_INPUT` — user input cannot be parsed/resolved
- `DEPENDENCY_DOWN` — external system unavailable
- `RATE_LIMITED` — dependency returned 429
- `INTERNAL` — unexpected bug

## 3) Response rules

### 3.1 Telegram message is mandatory (when possible)

**Planned**

On any failure, the bot must send a Telegram message.

Message must include:

- **Short summary** (1 line)
- **What happened** (1–2 lines)
- **Is retry safe?** (Yes/No)
- **Next step** (a command or checklist)

### 3.2 HTTP status policy (nuanced)

**Planned**

- If the bot can send a Telegram reply, prefer HTTP 200 to avoid webhook retry storms.
- If the bot **cannot** send a Telegram reply due to operator misconfiguration (e.g. missing `TELEGRAM_BOT_TOKEN`), return **HTTP 5xx** so Telegram will retry and the update is not dropped permanently.

Practical split:

- `CONFIG_MISSING` (reply possible) → HTTP 200 + chat message
- `CONFIG_MISSING` (reply impossible) → HTTP 5xx

### 3.3 Security perimeter failures

**Planned**

- Webhook authenticity failures (missing/mismatched secret token) must return HTTP 401/403 and must not process updates.

## 4) Special cases

### 4.1 Admin commands

**Planned**

- Unauthorized admin calls must respond with a denial message.
- Do not throw unhandled exceptions from admin parsing.

### 4.2 Observability writes

**Planned**

- Attempt logging must be best-effort.
- A failure to write logs must not prevent Apply.

### 4.3 Rate limits

**Planned**

- If a dependency returns 429:
  - apply exponential backoff with jitter
  - keep operations resume-safe

---
