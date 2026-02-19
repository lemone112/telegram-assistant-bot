# Entity Graph Navigator (Everything view)

This document defines the **Everything** view introduced in Iteration 10.

## 1) Canonical identifiers

All entities must be referred to as `global_ref`:

- `attio:deal:<id>`
- `attio:company:<id>`
- `linear:issue:<id>`
- `chatwoot:conversation:<id>`

(See also: LightRAG requirements for GlobalRef.)

## 2) Link Registry (runtime)

The bot’s runtime source of truth for connections is the **Link Registry** (see `docs/decisions.md` D-003).

### Build order

1. Resolve canonical entity (deal/company).
2. Query Link Registry for linked refs.
3. Fetch details from systems (Attio/Linear/Chatwoot) for refs that are permitted.
4. Fetch LightRAG brief for the canonical entity.

## 3) Sections

### 3.1 Attio

- Deal/company/person summary card.

### 3.2 Linear

- Linked issues/projects.
- Default: compact list + “Expand”.

### 3.3 Chatwoot

- Linked conversations (if user has ACL).

### 3.4 LightRAG

- Brief + top citations.
- If citations are empty, render: “Insufficient evidence”.

## 4) ACL behavior

- Restricted sections are **hidden by default** (D-002).
- No placeholders that reveal existence.

## 5) Empty states

Each section must have a meaningful empty state:

- Linear: “No linked issues yet. Create kickoff with /deal won.”
- Chatwoot: “No conversations linked.”
- LightRAG: “No knowledge found.” or “Knowledge temporarily unavailable.”

---
