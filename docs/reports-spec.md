# Reports specification — v1

We ship three report families in v1.

## 1) Attio: Pipeline report

- Input examples:
  - “pipeline”
  - “отчет по пайплайну”

- Output:
  - counts by stage
  - (optional) delta vs previous snapshot stored in DB

- UX:
  - summary card
  - button `Refresh`, `Export CSV`

## 2) Attio: Deal/Client status

- Input examples:
  - “что по клиенту <X>?”
  - “покажи сделку <X>”

- Output:
  - deal card
  - key fields (stage, value, owner, next step)
  - related links

## 3) Linear: Project/issues status by deal

- Input examples:
  - “статус проекта по сделке <X>”
  - “что в linear по <X>?”

- Output:
  - issues grouped by state
  - blockers highlight (heuristic)

## Export

- CSV export is generated server-side and sent as a Telegram file.
- Exports are always read-only.

## Caching

- Report queries cached in DB with TTL (e.g. 60–180s) to avoid rate limits.
