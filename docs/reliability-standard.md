# Reliability standard (authoritative)

This document defines the **non-negotiable reliability rules** for this bot.

If you ship changes that violate these rules, you are shipping an outage.

## Implemented today vs Planned

- **Implemented today** means the current runtime already behaves this way.
- **Planned** means this is a required target behavior, but the runtime may not fully enforce it yet.

---

## 0) Definitions

- **Business operation**: an Apply flow that causes external side-effects (Attio updates, Linear creates).
- **Observability write**: any write performed for debugging/metrics/audits (attempt logs, traces).
- **Dependency**: any external system used at runtime (Supabase, Composio, Attio, Linear, LightRAG, Telegram).

## 1) Hard invariants (must always hold)

### 1.1 Entrypoint integrity

**Implemented today**

- `wrangler.toml` must point to an existing file.
- The worker must export a request handler (fetch handler) on every revision.

**Planned**

- CI must fail if build/typecheck fails.

### 1.2 No silent failures in Telegram

**Planned**

- Any error in a user-triggered flow must result in a **Telegram message** describing:
  - what failed (human-readable)
  - whether retry is safe
  - what to do next

> Returning HTTP 500 without a chat reply is treated as a bug.

### 1.3 Observability is fail-open

**Planned**

- Observability writes must **never** block business operations.
- If an observability insert fails, the business operation continues, and the failure is recorded as best-effort.

### 1.4 Idempotency correctness

**Planned**

- Any side-effect operation must be protected by a stable, specific idempotency key.
- Idempotency keys must be **reserved** before side effects and **marked succeeded** only after success.
- Partial progress must be resume-safe (per-unit idempotency, not bulk-only).

### 1.5 Configuration errors are user-level, not server-level

**Planned**

- Missing env/config values must yield:
  - a Telegram message with a checklist (when possible)
  - a stable error class (`CONFIG_MISSING`)

> See `docs/error-handling-contract.md` for the HTTP status nuance when a reply cannot be sent.

### 1.6 Defensive parsing of third-party payloads

**Planned**

- Treat all external API payloads as untrusted.
- Never call array methods unless `Array.isArray(...)` is true.
- Normalize responses into internal types before rendering UX.

### 1.7 Atomic settings updates

**Planned**

- Updates to shared configuration (e.g. `bot.settings`) must be atomic.
- Avoid read-modify-write without a DB-side merge/transaction.

## 2) Dependency degradation contract

**Planned**

For each dependency, define expected behavior:

- **Supabase down**: block Apply (idempotency ledger unavailable) with `DEPENDENCY_DOWN` + retry hint.
- **Composio down**: do not attempt tool calls; return actionable error.
- **Linear/Attio down**: Draft may exist; Apply returns retry-safe failure.
- **LightRAG down**: RAG features degrade; core flows continue.

## 3) Maturity gates (release readiness)

**Planned**

A release is considered **mature** if:

- CI quality gates pass (see `docs/quality-gates.md`).
- Degradation matrix is implemented and verified.
- NS1–NS5 regression suite passes (roadmap Iteration 8).

---
