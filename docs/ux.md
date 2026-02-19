# Telegram UX/UI (CryptoBot-style)

This document defines the user experience and interaction patterns for the bot.

> **Iteration plan:** see [`docs/iters.md`](./iters.md).

## Goals

- One primary interaction model for *everything*: **Draft → Apply / Cancel**.
- CryptoBot-like UX: short messages, structured blocks, consistent buttons, minimal typing.
- Any free-form text or voice message is handled as a **request** and routed via **Composio MCP** to the correct toolkit(s).
- The bot supports **mutations** (create/update) and **queries** (reports/status/lookups) with the same Draft safety gate.

## Interaction primitives

### Message layouts

Use these message types:

1. **Card** (single entity)
   - Title line: `<Icon> <Entity> · <Primary name>`
   - Secondary line: key status fields
   - Footer: links (Attio/Linear), updated time

2. **List** (search results)
   - Up to 8 items per page
   - Each item: short label + one key field
   - Buttons: `◀ Prev` `Next ▶` `Pick #` `Cancel`

3. **Draft** (proposed side-effects)
   - Header: `Draft #<short_id>`
   - Summary: what will change
   - Steps: numbered actions with resolved targets
   - Risk flags: e.g. `⚠ creates 12 issues` / `⚠ bulk update`
   - Buttons: `Apply` `Edit` `Cancel` `Details`

4. **Result** (applied)
   - Header: `Applied`
   - What changed + links
   - Buttons: `Open` `Pin` `Repeat`

### Button style rules (CryptoBot-like)

- Prefer compact verbs: `Apply`, `Cancel`, `Edit`, `Pick`, `Next`.
- Keep the same button order everywhere:
  1) positive action, 2) neutral, 3) negative.
- Use inline keyboard for everything; minimize reply keyboard.
- Every callback must be idempotent: `tg:callback:<callback_query_id>`.

### Callback payload schema

All callback payloads must be parseable, versioned, and short.

- Keep `callback_data` within Telegram limits (≈ 64 bytes).
- Use compact opcodes.

### Draft lifecycle

- Create Draft for **any** external side-effect.
- Default expiry: 10 minutes (`expires_at`).
- If expired: show `Draft expired` and offer `Rebuild draft`.

## Free-form text & voice routing

### Entrypoints

- Free-form text: treat as `intent.request`.
- Voice: transcribe (STT) → same pipeline.

### Router behavior (Composio MCP)

The planner MUST output:

- `intent`: `mutate` | `query`
- `domain`: `attio` | `linear` | `mixed` | `unknown`
- `actions[]`: normalized tool calls (toolkit + tool_slug + args)
- `needs_clarification`: list of questions, if required

### Clarification UX

If `needs_clarification` is not empty:
- Ask 1–2 questions at a time
- Provide buttons for common answers
- Persist partial context in DB

## Queries / Reports UX

Queries should still use Draft, but can be **auto-apply** when strictly read-only.

Buttons for reports:
- `Refresh`
- `Export CSV`
- `Pin`

## UX acceptance checklist

- No message wall-of-text.
- All lists are paginated.
- Every mutation is Draft-gated.
- Every callback is idempotent.
