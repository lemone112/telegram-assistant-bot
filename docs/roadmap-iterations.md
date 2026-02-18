# Iterations roadmap (authoritative)

This document is the **authoritative execution plan** for this repository.

## Preconditions (planning gate)

We DO NOT start implementation of an iteration until the corresponding spec docs exist and are reviewed.

Required planning docs:
- `docs/v1-scope.md`
- `docs/planner-contract.md`
- `docs/ux-flows.md`
- `docs/reports-spec.md`

---

## Iteration 0 — Planning (BLOCKER)

- [ ] Write and approve v1 scope: `docs/v1-scope.md`
- [ ] Write and approve Planner contract: `docs/planner-contract.md`
- [ ] Write and approve UX flows: `docs/ux-flows.md`
- [ ] Write and approve reports spec: `docs/reports-spec.md`

**Definition of Done:** all docs above exist, cross-linked from README and this roadmap.

---

## Iteration P0.1 — UX/UI foundation (CryptoBot-style)

**Depends on:** `docs/ux.md`, `docs/ux-flows.md`

- [ ] Implement message renderer (Card/List/Draft/Result) with strict length limits.
- [ ] Implement callback payload schema `v1|...` + parser + signature/validation.
- [ ] Add pagination helper for list outputs (Prev/Next + pick).
- [ ] Add Draft expiry handling (`expires_at`) + “Rebuild draft” button.
- [ ] Add `/help` with examples.

**Critique / pitfalls:**
- Without strict formatting limits Telegram will truncate and UX will degrade.
- Without Pick list, ambiguity will cause wrong client selection (fatal).

---

## Iteration P0.2 — Router: text + voice → Planner → Draft/Query

**Depends on:** `docs/planner-contract.md`

- [ ] Voice STT pipeline + transcript confirm/edit.
- [ ] Implement Plan validator and risk gates (ambiguous/bulk/missing).
- [ ] Clarification loop with buttons.
- [ ] Deterministic idempotency keys per side-effect.

**Critique / pitfalls:**
- If Planner can emit tool calls directly without validation → unsafe.
- If query/mutate distinction is weak → accidental writes.

---

## Iteration P0.3 — Attio: `/deal stage` production-grade

- [ ] Preview with resolved `stage_name` (before Apply)
- [ ] Expiry UX
- [ ] Error taxonomy + retries

---

## Iteration P0.4 — Admin hardening

- [ ] `/admin env check`
- [ ] `/admin linear teams`

---

## Iteration P1.1 — Reports (v1)

**Depends on:** `docs/reports-spec.md`

- [ ] Pipeline report (Attio) + export CSV + refresh
- [ ] Deal/client status (Attio)
- [ ] Linear project/issues status by deal
- [ ] Caching (TTL)

---

## Iteration P1.2 — Linear: `/deal won` kickoff

- [ ] Create 12 kickoff issues from template (idempotent)
- [ ] Optional: Project + mapping + backlink (if tool support confirmed)

---

## Iteration P1.3 — Visibility commands

- [ ] `/deal find`, `/deal view`, `/pipeline`

---

## Iteration P2 — Production readiness

- [ ] Rate limit handling + retries + backoff
- [ ] Audit commands and logs
- [ ] Test matrix (happy/edge/failure)

