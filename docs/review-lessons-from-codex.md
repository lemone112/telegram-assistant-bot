# Codex review lessons (living)

This doc captures recurring patterns from automated code reviews so we can prevent them with guard-rails.

## 1) Themes seen in reviews

### A) Docs must match runtime

- If a doc is labeled authoritative, it must not describe non-existent commands or non-implemented policies.

### B) No production-outage commits

- Do not break the worker entrypoint.
- CI must enforce this.

### C) Prefer fail-open observability

- Logging should never block Apply.

### D) Defensive parsing

- Normalize payloads from Composio/external APIs.

### E) Atomicity for settings

- Avoid read-modify-write patterns that lose updates under concurrency.

## 2) How to use this

- Before opening a PR, check `docs/quality-gates.md`.
- Before shipping, ensure `docs/reliability-standard.md` invariants hold.

---
