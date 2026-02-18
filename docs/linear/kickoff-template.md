# Linear kickoff template (Design Studio)

This template is used for `/deal won` Apply.

## Source of truth

- Runtime source of truth: `src/linear_kickoff_template.ts`
- DB idempotency: `bot.project_template_tasks` keyed by `(linear_project_id, template_task_key)`

## Notes

- `template_task_key` values must remain stable forever.
- Titles/descriptions can evolve, but keys must not change.

## Project creation (Iteration 3B)

- Linear Project is created idempotently per Attio deal via `bot.deal_linear_links(attio_deal_id -> linear_project_id)`.
- Project name rule: `Company — Deal name` (fallback: `Deal — <attio_deal_id>` with audit).
- `LINEAR_TEAM_ID` is mandatory in env (no auto-pick).

## Backlink (Attio)

- On Apply, a Note is created on the Attio deal with a link to the Linear Project and issue summary.
- Best-effort note idempotency uses a marker line containing `linear_project_id=<id>` to avoid duplicates.
