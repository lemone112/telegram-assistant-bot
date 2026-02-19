# Iteration 1 — Implementation plan (Core runtime platform)

> Source of truth: [`docs/iters.md`](./iters.md).

This Iteration 1 PR implements the **platform foundations**:
- UI-first menu + callback engine
- allowlist gating with explicit “Нет доступа”
- Supabase-backed Draft lifecycle (stub apply)
- idempotency keys (callbacks + apply)
- error contract basics (Telegram response, HTTP 200 by default)

No business scenarios (Linear/Attio) are executed in Iteration 1.
