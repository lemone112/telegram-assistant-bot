# DB contract (canonical, DB-first)

This repository treats the **Supabase database schema as canonical**.

## Why

We deliberately keep all runtime tables in a single schema: `bot`.

The worker code must follow this contract to avoid subtle production bugs:
- querying the wrong schema (`public` vs `bot`)
- mismatched column names/types
- idempotency keys not enforcing correctness

See also:
- `docs/supabase/migrations-baseline.md`
- `docs/setup.md`

## Drafts

Drafts are stored in `bot.drafts`.

Key points:
- Primary key is `bot.drafts.id` (UUID).
- Authorship is stored via FK: `bot.drafts.telegram_user_id -> bot.telegram_users.id`.
- Intended actions are stored in `bot.drafts.actions` (jsonb array).

### Inline keyboard callback format

The bot uses callback data in the form:

- `draft:apply:<draft_id>`
- `draft:cancel:<draft_id>`

Where `<draft_id>` is the UUID primary key from `bot.drafts.id`.

## Idempotency

Idempotency is enforced via `bot.idempotency_keys`:

- key format: `tg:callback:<callback_query_id>`
- draft FK: `draft_id` points to `bot.drafts.id`

## Telegram users

Telegram users are upserted into `bot.telegram_users` keyed by the unique `telegram_user_id` (bigint).

The worker stores the FK on drafts, so only the author can Apply/Cancel.
