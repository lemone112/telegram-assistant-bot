# UX flows (CryptoBot-style) — v1

This doc describes concrete flows with messages and buttons.

## Global rules

- Every list is paginated (<= 8 items/page).
- Button order: positive → neutral → negative.
- Every callback is idempotent.

## Flow 1 — Free-form mutation → Draft → Apply

Input: “Переведи сделку ACME в Won и создай kickoff”

1) Bot: shows `Draft` with resolved entities (deal + company), risks, and steps.
Buttons: `✅ Apply` `✏️ Edit` `🔎 Details` `❌ Cancel`

2) Apply:
- show “Applying…” (optional edit of same message)
- then `Result` with links

## Flow 2 — Ambiguous entity → Pick list

Input: “покажи сделку atlas”

1) Bot returns `List` of candidates.
Buttons: `◀ Prev` `Next ▶` `Pick 1..8` `Cancel`

2) On pick: show `Card` then continue (either show result or build Draft).

## Flow 3 — Voice message

1) Bot transcribes and shows:
- Transcript (short)
Buttons: `✅ Use transcript` `✏️ Edit text` `❌ Cancel`

2) After confirm: run same as Flow 1/2.

## Flow 4 — Report

Input: “Отчет по пайплайну”

1) Bot returns `Report card` + top numbers.
Buttons: `🔁 Refresh` `📄 Export CSV` `❌ Close`

