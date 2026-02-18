# LightRAG database requirements (authoritative)

This document defines **database-level requirements** for the LightRAG knowledge server that aggregates data from **Attio**, **Linear**, and **Chatwoot**.

The design is optimized for:

- Safe, grounded answers (**citations required**)
- Strong entity linking across systems
- ACL / privacy enforcement on the server side
- Idempotent ingestion (no duplicates)
- Efficient retrieval for Telegram UX (pagination, pick lists, briefs)

---

## 0) Core principle

Store separately:

1) **Raw source documents** (what actually happened)
2) **Chunks** (indexing/embedding units)
3) **Canonical entities** (company/deal/person/issue/project/conversation)
4) **Links** (cross-system mappings, with confidence + status)
5) **ACL** (not optional)

---

## 1) Canonical identifiers

### 1.1 GlobalRef (mandatory)

Every record must have a stable normalized identifier:

- `global_ref = "<system>:<type>:<id>"`

Examples:

- `attio:company:cmp_123`
- `attio:deal:deal_456`
- `linear:issue:LIN-123`
- `chatwoot:conversation:98765`
- `chatwoot:message:54321`

### 1.2 Identity levels

Each stored object MUST include:

- `source_id` (original id)
- `global_ref` (normalized id)
- `content_hash` (hash of normalized text + key metadata)

---

## 2) Required collections / tables

> The exact DB can differ (Postgres/Document DB), but these logical tables and fields must exist.

### 2.1 `source_documents` (raw documents)

Represents a single object from the source system (Attio note, Linear issue, Chatwoot message, etc.).

**Fields:**

- `global_ref` (PK)
- `source_system` (`attio|linear|chatwoot`)
- `source_type` (enum: `company|deal|note|issue|comment|conversation|message|...`)
- `source_id`
- `source_url` (required)
- `tenant_id` / `workspace_id` (required for multi-tenant)
- `created_at`, `updated_at` (UTC ISO8601)
- `author_ref` (optional)
- `raw_payload` (json)
- `text_content` (normalized text; can be empty)
- `language`
- `content_hash`
- `is_deleted` (tombstone)
- `acl_tags` (see ACL section)

**Indexes:**

- `(source_system, source_type, updated_at)`
- `content_hash`
- `(tenant_id, updated_at)`

### 2.2 `document_chunks` (embedding units)

**Fields:**

- `chunk_ref` (PK)
- `document_ref` (FK → `source_documents.global_ref`)
- `chunk_index`
- `chunk_text`
- `chunk_hash`
- `embedding_vector`
- `token_count`
- `start_offset`, `end_offset` (optional)
- `created_at`
- `acl_tags` (inherited or explicit)

**Indexes:**

- vector index on `embedding_vector`
- `(document_ref, chunk_index)`
- `chunk_hash`

### 2.3 `entities` (canonical entities)

**Fields:**

- `entity_ref` (PK, same format as GlobalRef)
- `entity_kind` (`company|deal|person|issue|project|conversation|message|...`)
- `display_name`
- `normalized_name`
- `primary_url`
- `attributes` (json)
- `created_at`, `updated_at`
- `is_deleted`
- `acl_tags`

**Indexes:**

- `(entity_kind, normalized_name)`
- optional FTS index over `display_name` + selected attributes

### 2.4 `entity_links` (cross-system mappings)

This table is the key to high-quality UX and non-hallucinatory answers.

**Fields:**

- `link_id` (PK)
- `from_ref` (FK → `entities.entity_ref`)
- `to_ref` (FK → `entities.entity_ref`)
- `link_type` (enum):
  - `same_as` (identity)
  - `related_to`
  - `belongs_to` (deal → company)
  - `mapped_to` (deal → linear project/issues set)
  - `thread_of` (message → conversation)
  - `mentions`
- `directional` (bool)
- `confidence` (0..1)
- `evidence` (json): domain/email match, naming rule, manual pick, etc.
- `created_by` (`system|user|admin`)
- `created_at`
- `status` (`proposed|confirmed|rejected`)
- `expires_at` (optional; for weak heuristic links)

**Indexes:**

- `(from_ref, link_type, status)`
- `(to_ref, link_type, status)`

**Rules:**

- Heuristic links MUST be stored as `proposed` until confirmed.
- User pick in Telegram should flip to `confirmed`.

### 2.5 `document_entity_mentions`

**Fields:**

- `document_ref` and/or `chunk_ref`
- `entity_ref`
- `mention_type` (`explicit|inferred|metadata`)
- `confidence`
- `created_at`

**Indexes:**

- `(entity_ref, created_at)`
- `(document_ref, entity_ref)`

### 2.6 Ingestion state

#### `ingestion_cursors`

- `source_system`
- `cursor_key` (workspace/inbox)
- `cursor_value` (timestamp or opaque cursor)
- `updated_at`

#### `ingestion_runs`

- `run_id`
- `source_system`
- `started_at`, `finished_at`
- `status`
- `counts` (inserted/updated/deleted)
- `error_summary`

---

## 3) ACL / privacy (non-optional)

### 3.1 Server-side enforcement

LightRAG MUST enforce ACL filtering server-side.

### 3.2 Simple required model (recommended)

Each record stores:

- `acl_tags: text[]`

Examples:

- `tenant:design_studio`
- `team:sales`
- `team:support`
- `user:tg_123`

Queries MUST supply `request_acl_tags`, and the server must only return records with intersecting tags.

---

## 4) Citations requirements (for grounded answers)

Every retrieved chunk/document returned to the bot MUST include:

- `source_url`
- `source_system`, `source_type`
- `document_ref`, `chunk_ref`
- `created_at`
- `snippet` (short)
- `score`

If citations are not available, the answer must be **"not found / insufficient evidence"**.

---

## 5) Chatwoot-specific requirements

Chatwoot data must remain navigable as threads.

### 5.1 Conversations and messages

- `chatwoot:conversation:*` must exist as an entity.
- `chatwoot:message:*` must link to its conversation via `entity_links(link_type=thread_of)`.

### 5.2 Attachments

- Store attachment metadata and URLs.
- If text cannot be extracted, `text_content` may be empty but must remain retrievable by URL.

---

## 6) Corner cases (must be handled by schema)

### 6.1 Duplicates and reindexing

- Upserts keyed by `global_ref`.
- Skip embedding recompute when `content_hash`/`chunk_hash` unchanged.

### 6.2 Same-name entities

- Do NOT rely on names alone.
- Store disambiguators in `entities.attributes` (domain, emails, owner, location).
- Use `entity_links` + user-confirmation to stabilize mapping.

### 6.3 Missing deal ↔ linear/project mapping

- Store `proposed` links from heuristics.
- Allow “learned mapping” from user picks and persist as `confirmed`.

### 6.4 Deletes

- Use tombstones (`is_deleted=true`) and filter on read.
- Provide an admin-only hard delete mechanism if required.

### 6.5 Frequent updates / rename

- Use `updated_at` incremental sync.
- Keep links stable across renames.

---

## 7) Minimal DoD for integrating LightRAG into the bot

- Query by deal/company returns a brief with 3–5 citations.
- “What did we promise about deadlines?” returns only statements with citations.
- Ambiguity returns candidates so the bot can present a Pick list.
