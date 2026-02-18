# Iterations roadmap (authoritative)

This document is the **authoritative execution plan** for this repository.

## How to read this roadmap

- Each iteration ships a **user-visible slice** (not just plumbing).
- Every iteration has:
  - **North Star flows** (acceptance scenarios)
  - **Definition of Done** (DoD)
  - Explicit **dependencies** and **pitfalls**
- We prefer small PRs; however, we do not split so hard that we ship half-features.

---

## Planning gate (Iteration 0) — COMPLETE ✅

Specs are written and approved:

- [x] v1 scope: `docs/v1-scope.md`
- [x] Planner contract: `docs/planner-contract.md`
- [x] UX foundation: `docs/ux.md`
- [x] UX flows: `docs/ux-flows.md`
- [x] Reports spec: `docs/reports-spec.md`

---

# v1 North Star flows (product acceptance)

These flows define “the bot is ready”. We implement them progressively and must keep them working.

## NS1 — Voice → transcript confirm → Attio stage change (Draft-gated)

1. User sends a voice message: “Переведи сделку ACME в paused”.
2. Bot replies with Transcript + buttons: `✅ Use transcript` `✏️ Edit text` `❌ Cancel`.
3. After confirm, bot shows Draft with resolved deal + target stage name.
4. User taps `✅ Apply`.
5. Bot replies `✅ Applied` with Attio link.

**Must hold:** no duplicates on double-click / retries; ambiguity triggers Pick.

## NS2 — Text → ambiguous deal → pick list → card

1. User: “покажи сделку atlas”.
2. Bot shows paginated list (<=8 items) with `Pick 1..8`.
3. User picks.
4. Bot shows Deal card and links.

## NS3 — Deal won kickoff → Linear 12 issues (no duplicates)

1. User: “Сделка ACME выиграна, создай kickoff”.
2. Bot shows Draft: create 12 issues (risk flag) + shows team + naming.
3. Apply creates issues.
4. Second Apply (same draft or retried callback) does NOT create duplicates; returns existing results.

## NS4 — Pipeline report → refresh → export CSV

1. User: “отчет по пайплайну”.
2. Bot shows report card, `🔁 Refresh` `📄 Export CSV`.
3. Export sends CSV file.

## NS5 — Status by deal → Linear issues grouped by state

1. User: “статус проекта по сделке ACME”.
2. Bot resolves deal and mapping OR asks to pick.
3. Bot shows grouped issues (To Do / In Progress / Done), paginated.

---

# Iterations (v1)

## Iteration 1 (P0) — Safety backbone + deterministic execution model

**Goal:** make it *impossible* to accidentally write without Draft and *impossible* to duplicate side-effects.

### Deliverables

- Idempotency ledger (key → status → result payload → external ids) for every side-effect.
- Allowlists:
  - read-only tool slugs (safe auto-run)
  - mutate tool slugs (only these allowed)
  - denylist (explicitly blocked)
- Unified retry/backoff wrapper for external calls (429/5xx) with user-friendly errors.
- Error taxonomy:
  - `USER_INPUT` (missing/ambiguous)
  - `CONFIG` (missing env / missing connection)
  - `UPSTREAM` (Attio/Linear/Composio)
  - `DB`

### North Star flows covered

- Partial enablement for NS1/NS3 (idempotency + gates).

### DoD

- Any mutation request without Draft is blocked.
- Duplicate callback executions return the *same* result (no re-run).
- Logs record per-action outcomes.

### Pitfalls

- Relying on Telegram callback id only is insufficient; must also protect per-side-effect operations.

---

## Iteration 2 (P0) — CryptoBot UX system: renderer + buttons + home hub

**Goal:** ship a consistent UX system that users can operate without typing commands.

### Deliverables

- Message renderer for:
  - Card
  - List (pagination)
  - Draft (steps + risk flags)
  - Result
  - Error
- Inline keyboard system + callback protocol `v1|kind|...`.
- Pagination sessions (Prev/Next + Pick 1..8) with ownership and TTL.
- Draft expiry UX (`expires_at`) + `Rebuild draft`.
- **Home/Hub** (CryptoBot behavior):
  - `/menu` shows a persistent hub message (can be pinned) with buttons:
    - `📊 Reports`
    - `🤝 Deals`
    - `🧩 Tasks`
    - `⚙️ Settings`
    - `❓ Help`
  - Hub buttons open sub-menus (lists / report choices).

### North Star flows covered

- NS2 fully (Pick list + Card UX)

### DoD

- 12+ golden snapshot examples maintained (docs or tests).
- All lists are paginated, no wall-of-text.

### Pitfalls

- Without strict limits, Telegram truncation will break UI.

---

## Iteration 3 (P0) — Voice pipeline (STT) with transcript confirmation

**Goal:** voice is first-class and reliable.

### Deliverables

- Download voice file → STT → transcript.
- Transcript UX:
  - short transcript preview
  - buttons: `Use transcript`, `Edit text`, `Cancel`
- Degradation policy:
  - if STT fails → ask user to send text
  - if confidence low → ask to confirm/edit
  - limits (duration/size) with clear messaging

### North Star flows covered

- NS1 step 1–2

### DoD

- Voice always produces *either* transcript flow *or* a clear fallback.

---

## Iteration 4 (P0) — Attio core: deal resolution + `/deal stage` production-grade

**Goal:** one mutation and one query become “reference quality”.

### Deliverables

- Deal resolution engine:
  - search by text
  - ambiguity → Pick list (required)
  - cache last selected deal per user
- `/deal stage`:
  - preview shows resolved stage name before Apply
  - no-op detection (already in stage)
  - clean error messages

### North Star flows covered

- NS1 fully (with voice already done)
- NS2 (deal card)

### DoD

- Apply updates exactly once.
- User always sees *what will change* before Apply.

---

## Iteration 5 (P1) — Reports v1 (Attio + Linear) with export/caching

**Goal:** high-utility read-only experiences.

### Deliverables

- Attio pipeline report + Refresh + Export CSV.
- Attio deal/client status card.
- Linear status by deal (grouped by state) with pagination.
- DB caching TTL for report calls.

### North Star flows covered

- NS4 fully
- NS5 fully (with mapping fallback)

### DoD

- Report refresh does not hit rate limits in normal use (TTL cache).
- Export produces a valid CSV file.

### Pitfalls

- Mapping deal→Linear may be missing; must provide a user-facing fallback (pick/search) and store mapping when learned.

---

## Iteration 6 (P1) — Linear kickoff: `/deal won` creates 12 issues (idempotent)

**Goal:** automate the Design Studio kickoff without duplicates.

### Deliverables

- Draft for deal won kickoff:
  - risk flag: creates 12 issues
  - shows team
- Apply:
  - creates 12 issues from template
  - stores mapping (at minimum: deal → created issue ids)
  - returns result with links

### North Star flows covered

- NS3 fully

### DoD

- Second Apply returns the same set of created issue ids.

---

## Iteration 7 (P1) — Admin & ops completeness

**Goal:** no manual DB edits; fast recovery.

### Deliverables

- `/admin env check`
- `/admin linear teams`
- `/admin audits last`
- `/admin draft <id>` inspect

### DoD

- New environment can be validated end-to-end via admin commands.

---

## Iteration 8 (P1/P2) — Production hardening & test matrix

**Goal:** stability under real conditions.

### Deliverables

- Comprehensive test matrix for NS1–NS5 + edge/failure cases.
- Rate-limit handling verification.
- Monitoring/logging documentation.

### DoD

- We can run a scripted acceptance session and it passes.

---

# Post-v1 backlog (explicit)

- Bulk import `/client-mass`
- Reminders
- Timezone `/tz`
- Linear Project creation + stronger deal→project mapping (if tool support confirmed)
- Undo (only where safely reversible)
