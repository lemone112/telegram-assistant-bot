# UX flows (CryptoBot-style) — v1

This doc describes concrete flows with messages and buttons.

> **Iteration plan:** see [`docs/iters.md`](./iters.md).

## Global rules

- Every list is paginated (<= 8 items/page).
- Button order: positive → neutral → negative.
- Every callback is idempotent.

## Flow 0 — Main menu (UI-first)

**Entry**: any allowed user opens the bot or sends any message.

**Bot**: shows Main Menu card.

Buttons:
- `Tasks`
- `Clients`
- `Design Studio`
- `Profile`
- `Help`

(Optionally: `Admin` visible only to allowlist + admin role)

---

## Flow 1 — Task creation wizard (Draft → Apply)

**Entry**: Main Menu → `Tasks` → `Create`

**Step 1 (Source)**
- Bot: “Choose task source”
- Buttons: `Forwarded message` / `Typed text` / `Cancel`

**Step 2 (Capture)**
- If forwarded: bot asks user to forward the message.
- If typed: bot asks user to send the text.
- Buttons: `Cancel`

**Step 3 (Project picker)**
- Bot shows a paginated list of existing projects.
- Buttons: `Prev` `Next` `Pick #` `+ Create new` `Cancel`

**Create new project flow**
- Bot asks for project name.
- On confirm: creates project draft (or creates immediately but still Draft-gated; preferred: Draft).
- After success: returns to Step 3 and auto-selects the created project.

**Step 4 (Assignee)**
- Default: from Profile mapping.
- Buttons: `Keep default` / `Change…` / `Cancel`

**Step 5 (Draft preview)**
- Bot shows Draft summary and steps.
- Buttons: `Apply` / `Edit` / `Details` / `Cancel`

**Apply**
- Bot shows “Applying…” then Result.

---

## Flow 2 — Ambiguous entity → Pick list

**Entry**: any flow that needs entity resolution.

1) Bot returns a `List` of candidates.
2) User picks one.
3) Bot shows a `Card` confirmation and continues the original wizard.

---

## Flow 3 — Profile mapping

**Entry**: Main Menu → `Profile`

- Bot shows mapping status:
  - Linear: set/not set
  - Attio: set/not set

Buttons:
- `Set Linear user`
- `Set Attio actor`
- `Back`

Each mapping uses a picker/search flow and writes to DB settings.

---

## Flow 4 — Clients bulk import

**Entry**: Main Menu → `Clients` → `Import (bulk)`

1) Bot asks to paste bulk text.
2) Bot validates and shows Draft preview with counts.
3) Buttons: `Apply` / `Fix invalid` / `Cancel`

---

## Flow 5 — Design Studio

**Entry**: Main Menu → `Design Studio`

Buttons:
- `Deal stage`
- `Deal won`
- `Back`
