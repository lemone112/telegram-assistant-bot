# Error handling contract (authoritative)

This is the **runtime contract** for how the bot must handle and surface errors.

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

### 3.1 Telegram message is mandatory

On any failure, the bot must send a Telegram message.

Message must include:

- **Short summary** (1 line)
- **What happened** (1–2 lines)
- **Is retry safe?** (Yes/No)
- **Next step** (a command or checklist)

### 3.2 HTTP status policy

- For user-level failures (`FORBIDDEN`, `CONFIG_MISSING`, `INVALID_INPUT`): return HTTP 200.
- For dependency failures where webhook retries are harmful: return HTTP 200 + chat message.
- Avoid returning HTTP 500 unless you explicitly want platform retries.

## 4) Special cases

### 4.1 Admin commands

- Unauthorized admin calls must respond with a denial message.
- Do not throw unhandled exceptions from admin parsing.

### 4.2 Observability writes

- Attempt logging must be best-effort.
- A failure to write logs must not prevent Apply.

### 4.3 Rate limits

- If a dependency returns 429:
  - apply exponential backoff with jitter
  - keep operations resume-safe

---
