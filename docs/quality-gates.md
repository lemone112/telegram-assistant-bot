# Quality gates (CI + review checklist)

This document defines the **quality gates** that prevent shipping regressions.

## 1) CI gates (must be green)

### 1.1 Build & typecheck

- `npm test` (if present)
- `npm run build` (or `wrangler build`)
- `npm run typecheck` (or `tsc --noEmit`)

**Gate:** must fail CI if any of these fail.

### 1.2 Entrypoint gate

**Gate:** verify `wrangler.toml` `main` points to an existing file and the file contains a handler export.

Implementation options:

- a small Node script in CI, or
- a lightweight `grep`/AST check.

### 1.3 Lint + formatting (recommended)

- ESLint
- Prettier

> Not required for correctness, but reduces review noise.

## 2) Runtime correctness gates (review checklist)

### 2.1 Error handling

- Any expected user error returns a chat message (no 500).
- Unknown errors return a chat message with an error id.

### 2.2 Idempotency

- Idempotency keys exist for all side-effects.
- Keys are per-unit where partial progress is possible.

### 2.3 Observability separation

- Observability writes are fail-open.
- Observability failures do not advance idempotency state incorrectly.

### 2.4 Payload normalization

- External responses are normalized into internal types.
- Defensive parsing is applied before rendering.

### 2.5 Settings atomicity

- Shared config writes use DB-side atomic merge/transaction.

## 3) Documentation gate

If documentation is marked **authoritative**:

- It must specify what is **Implemented today** vs **Planned**.
- Any runbook command listed as “required” must exist in runtime.

---
