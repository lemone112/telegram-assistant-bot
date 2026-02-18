# Linear kickoff template (Design Studio)

This template is used for `/deal won` Apply.

## Source of truth

- Runtime source of truth: `src/linear_kickoff_template.ts`
- DB idempotency: `bot.project_template_tasks` keyed by `(linear_project_id, template_task_key)`

## Notes

- `template_task_key` values must remain stable forever.
- Titles/descriptions can evolve, but keys must not change.
