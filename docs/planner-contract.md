# Planner contract (Composio MCP) — v1

This contract defines what the Planner must produce from free-form text/voice and how the bot validates and executes it.

## Objectives

- Deterministic routing: Attio vs Linear vs Mixed.
- Safe execution: mutations always Draft-gated.
- Great UX: ambiguity and missing info produce clarification questions with buttons.

## Output schema (conceptual)

> This is a **conceptual schema** for the Planner output; the runtime implementation can map this to the existing Composio MCP interface.

### Plan

- `plan_id`: string
- `intent`: `query` | `mutate`
- `domain`: `attio` | `linear` | `mixed` | `unknown`
- `summary`: string (1 line)
- `language`: `ru` | `en`
- `inputs`:
  - `raw_text`: string
  - `voice`: { `file_id`, `transcript`, `confidence` }?
- `entities`: array of entity refs
- `actions`: array of tool actions
- `needs_clarification`: array of questions
- `risks`: array of risk flags

### EntityRef

- `kind`: `deal` | `company` | `person` | `issue` | `project`
- `query`: string (what user typed)
- `candidates`: [{ `id`, `name`, `subtitle`, `url` }]
- `selected_id`: string?
- `confidence`: 0..1

### ToolAction

- `toolkit`: `attio` | `linear` | `supabase` | other
- `tool_slug`: string
- `args`: object
- `read_only`: boolean
- `idempotency_scope`: string (deterministic)
- `preview`: string (human readable)

### ClarificationQuestion

- `id`: string
- `question`: string
- `choices`: [{ `label`, `value` }]
- `free_text_allowed`: boolean

### RiskFlag

- `kind`: `bulk` | `destructive` | `ambiguous` | `missing_required` | `rate_limit_risk`
- `details`: string

## Validation rules (bot-side)

1. If `intent=mutate` → MUST create Draft, never auto-execute.
2. If `intent=query` and `read_only=true` for all actions → can run immediately, but must be logged.
3. If any `RiskFlag.kind=ambiguous` → require Pick list.
4. If any `RiskFlag.kind=bulk` → require extra confirmation step (count threshold).
5. All tool args must pass:
   - schema validation (tool input)
   - business validation (e.g., stage exists; Linear team configured)

## Idempotency

- Callback idempotency: `tg:callback:<callback_query_id>`
- Side-effect idempotency: deterministic per action, e.g.
  - `linear:create_issue:<deal_id>:<template_task_key>`

