import type { NormalizedError } from "./safety/types";
import { getConfig } from "./config";
import {
  botQuery,
  botQueryOne,
  getSetting,
  upsertSetting,
  insertIdempotencyKey,
} from "./db";

// ─── Telegram types ─────────────────────────────────────────────

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
};

type TelegramChat = { id: number; type: string; title?: string; username?: string };

type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: { message_id: number; chat: TelegramChat };
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

type InlineKeyboardButton = { text: string; callback_data: string };

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<InlineKeyboardButton>>;
};

type Profile = {
  linear_user_id: string | null;
  attio_workspace_member_id: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function getAllowedUserSet(): Set<number> | null {
  const raw = getConfig().BOT_ALLOWED_TELEGRAM_USER_IDS?.trim();
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return new Set(ids);
}

function isAllowed(telegramUserId: number): boolean {
  const allowed = getAllowedUserSet();
  if (!allowed) return false;
  return allowed.has(telegramUserId);
}

export function normalizeError(e: unknown): NormalizedError {
  if (e instanceof Error) {
    return {
      category: "UNKNOWN",
      code: "INTERNAL",
      message: e.message,
      details: e.stack,
      retryable: false,
    };
  }
  return {
    category: "UNKNOWN",
    code: "INTERNAL",
    message: String(e),
    retryable: false,
  };
}

// ─── Telegram API ───────────────────────────────────────────────

async function tgCall<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = getConfig().TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as
    | TelegramApiResponse<T>
    | Record<string, unknown>;
  const okFlag = (data as any)?.ok;
  if (!res.ok || okFlag === false) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }
  if (okFlag === true && (data as any).result !== undefined) return (data as any).result as T;
  return data as unknown as T;
}

async function tgSendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

async function tgAnswerCallbackQuery(callbackQueryId: string) {
  try {
    await tgCall("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
    });
  } catch {
    // ignore
  }
}

// ─── UI ─────────────────────────────────────────────────────────

function menuKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Tasks", callback_data: "v1:M:tasks" },
        { text: "Clients", callback_data: "v1:M:clients" },
      ],
      [
        { text: "Design Studio", callback_data: "v1:M:design" },
        { text: "Profile", callback_data: "v1:M:profile" },
      ],
      [{ text: "Help", callback_data: "v1:M:help" }],
    ],
  };
}

function sysNavRow(): InlineKeyboardButton[] {
  return [
    { text: "Menu", callback_data: "v1:SYS:MENU" },
    { text: "Cancel", callback_data: "v1:SYS:CANCEL" },
  ];
}

function safeParseCallbackData(raw: string | undefined): string[] | null {
  if (!raw) return null;
  if (!raw.startsWith("v1:")) return null;
  const parts = raw.split(":");
  if (parts.length < 2) return null;
  return parts;
}

// ─── DB operations ──────────────────────────────────────────────

async function bestEffortAudit(
  draftId: string | null,
  eventType: string,
  payload: unknown,
) {
  try {
    await botQuery(
      `INSERT INTO bot.audit_log (draft_id, level, event_type, message, payload, created_at)
       VALUES ($1, 'info', $2, NULL, $3::jsonb, $4)`,
      [draftId, eventType, JSON.stringify(payload), nowIso()],
    );
  } catch {
    // must never block
  }
}

async function showNoAccess(chatId: number) {
  await tgSendMessage(chatId, "Нет доступа", {
    inline_keyboard: [[{ text: "Help", callback_data: "v1:M:help" }]],
  });
}

async function ensureTelegramUser(tgUser: TelegramUser | undefined) {
  if (!tgUser) return null;
  try {
    const row = await botQueryOne<{ id: string }>(
      `INSERT INTO bot.telegram_users
         (telegram_user_id, username, first_name, last_name, language_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (telegram_user_id)
       DO UPDATE SET
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         language_code = EXCLUDED.language_code,
         updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [
        tgUser.id,
        tgUser.username ?? null,
        tgUser.first_name ?? null,
        tgUser.last_name ?? null,
        tgUser.language_code ?? null,
        nowIso(),
      ],
    );
    return row?.id ?? null;
  } catch {
    return null;
  }
}

async function showMenu(chatId: number) {
  const body = ["Assistant", "", "Choose an action:"].join("\n");
  await tgSendMessage(chatId, body, menuKeyboard());
}

// ─── Drafts ─────────────────────────────────────────────────────

async function createStubDraft(
  telegramUserPk: string | null,
  chatId: number,
  sourceText: string,
) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const actions = [
    {
      toolkit: "supabase",
      tool_slug: "NOOP",
      args: {},
      read_only: false,
      idempotency_scope: "draft:apply:stub",
      preview: "No-op (platform validation)",
    },
  ];
  const risks = [
    {
      kind: "missing_required",
      details:
        "Iteration 1: business actions are stubbed; this draft is only to validate the platform.",
    },
  ];

  const row = await botQueryOne<{ id: string }>(
    `INSERT INTO bot.drafts
       (telegram_user_id, chat_id, source_type, source_text, transcript,
        intent_summary, status, assumptions, risks, questions, actions,
        created_at, expires_at)
     VALUES ($1, $2, 'text', $3, NULL,
        'Stub draft (Iteration 1)', 'DRAFT', '[]'::jsonb, $4::jsonb, '[]'::jsonb, $5::jsonb,
        $6, $7)
     RETURNING id`,
    [
      telegramUserPk,
      chatId,
      sourceText,
      JSON.stringify(risks),
      JSON.stringify(actions),
      nowIso(),
      expiresAt,
    ],
  );
  if (!row) throw new Error("Failed to create draft");
  return row.id;
}

function draftKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Apply", callback_data: `v1:D:A:${draftId}` },
        { text: "Cancel", callback_data: `v1:D:C:${draftId}` },
      ],
      sysNavRow(),
    ],
  };
}

async function showDraftPreview(chatId: number, draftId: string) {
  const body = [
    `Draft #${draftId.slice(0, 8)}`,
    "",
    "Summary:",
    "- Stub draft (Iteration 1)",
    "",
    "Steps:",
    "1) No-op (platform validation)",
    "",
    "Risks:",
    "- Platform-only: no business actions yet",
  ].join("\n");
  await tgSendMessage(chatId, body, draftKeyboard(draftId));
}

async function cancelDraft(draftId: string) {
  await botQuery(
    "UPDATE bot.drafts SET status = 'CANCELLED', updated_at = $1 WHERE id = $2",
    [nowIso(), draftId],
  );
}

async function applyDraftStub(draftId: string) {
  const applyKey = `draft:${draftId}:apply`;
  const ok = await insertIdempotencyKey(applyKey, draftId);
  if (!ok) return { alreadyApplied: true };

  try {
    await botQuery(
      `INSERT INTO bot.draft_apply_attempts
         (draft_id, idempotency_key, started_at, finished_at, result, error_summary)
       VALUES ($1, $2, $3, $3, $4::jsonb, NULL)`,
      [
        draftId,
        applyKey,
        nowIso(),
        JSON.stringify({ ok: true, note: "Iteration 1 stub apply" }),
      ],
    );
  } catch {
    // ignore
  }

  await botQuery(
    "UPDATE bot.drafts SET status = 'APPLIED', updated_at = $1 WHERE id = $2",
    [nowIso(), draftId],
  );

  return { alreadyApplied: false };
}

// ─── Profile ────────────────────────────────────────────────────

function profileKeys(tgUserId: number) {
  return {
    linearUserId: `profile:${tgUserId}:linear_user_id`,
    attioWorkspaceMemberId: `profile:${tgUserId}:attio_workspace_member_id`,
  };
}

async function loadProfile(tgUserId: number): Promise<Profile> {
  const keys = profileKeys(tgUserId);
  const linear_user_id =
    (await getSetting<string>(keys.linearUserId).catch(() => null)) ?? null;
  const attio_workspace_member_id =
    (await getSetting<string>(keys.attioWorkspaceMemberId).catch(() => null)) ?? null;
  return { linear_user_id, attio_workspace_member_id };
}

function profileKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Set Linear user", callback_data: "v1:P:linear:pick" },
        { text: "Set Attio member", callback_data: "v1:P:attio:pick" },
      ],
      [
        { text: "Clear Linear", callback_data: "v1:P:linear:clear" },
        { text: "Clear Attio", callback_data: "v1:P:attio:clear" },
      ],
      sysNavRow(),
    ],
  };
}

// ─── Pickers ────────────────────────────────────────────────────

type PickerItem = { id: string; label: string; subtitle?: string };

type PickerState = {
  kind: "linear_user" | "attio_member";
  page: number;
  items: PickerItem[];
};

function pickerStateKey(tgUserId: number): string {
  return `picker:${tgUserId}:state`;
}

async function savePickerState(tgUserId: number, state: PickerState) {
  await upsertSetting(pickerStateKey(tgUserId), state);
}

async function loadPickerState(tgUserId: number): Promise<PickerState | null> {
  return (await getSetting<PickerState>(pickerStateKey(tgUserId))) ?? null;
}

function renderPicker(
  title: string,
  state: PickerState,
  onPickPrefix: string,
): { text: string; keyboard: InlineKeyboardMarkup } {
  const pageSize = 8;
  const start = (state.page - 1) * pageSize;
  const pageItems = state.items.slice(start, start + pageSize);

  const lines: string[] = [title, "", `Page ${state.page}`];
  pageItems.forEach((it, i) => {
    const idx = i + 1;
    lines.push(`${idx}) ${it.label}${it.subtitle ? ` — ${it.subtitle}` : ""}`);
  });

  const pickRow: InlineKeyboardButton[] = pageItems.map((_, i) => ({
    text: `Pick ${i + 1}`,
    callback_data: `v1:${onPickPrefix}:${i + 1}`,
  }));

  const navRow: InlineKeyboardButton[] = [
    { text: "◀ Prev", callback_data: `v1:${onPickPrefix}:prev` },
    { text: "Next ▶", callback_data: `v1:${onPickPrefix}:next` },
  ];

  return {
    text: lines.join("\n"),
    keyboard: {
      inline_keyboard: [pickRow, navRow, sysNavRow()],
    },
  };
}

async function showProfile(chatId: number, tgUserId: number) {
  const p = await loadProfile(tgUserId);
  const body = [
    "Profile",
    "",
    `Linear user: ${p.linear_user_id ?? "(not set)"}`,
    `Attio member: ${p.attio_workspace_member_id ?? "(not set)"}`,
  ].join("\n");
  await tgSendMessage(chatId, body, profileKeyboard());
}

async function buildLinearUserPicker(): Promise<PickerItem[]> {
  try {
    const rows = await botQuery<{
      id: string;
      name: string;
      display_name: string | null;
      email: string | null;
    }>(
      `SELECT id, name, display_name, email
       FROM bot.linear_users_cache
       WHERE active = true
       ORDER BY name ASC
       LIMIT 250`,
    );

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: String(r.id),
        label: String(r.name ?? r.display_name ?? r.id),
        subtitle: r.email ? String(r.email) : undefined,
      }));
    }
  } catch {
    // ignore
  }
  return [];
}

async function buildAttioMemberPicker(): Promise<PickerItem[]> {
  return [];
}

async function startPicker(
  chatId: number,
  tgUserId: number,
  kind: PickerState["kind"],
) {
  const items =
    kind === "linear_user"
      ? await buildLinearUserPicker()
      : await buildAttioMemberPicker();

  if (items.length === 0) {
    await tgSendMessage(
      chatId,
      "Picker is empty right now. Cache refresh will be implemented in next iteration.",
      menuKeyboard(),
    );
    return;
  }

  const state: PickerState = { kind, page: 1, items };
  await savePickerState(tgUserId, state);

  const onPickPrefix = kind === "linear_user" ? "PL" : "PA";
  const title =
    kind === "linear_user" ? "Pick Linear user" : "Pick Attio workspace member";
  const view = renderPicker(title, state, onPickPrefix);
  await tgSendMessage(chatId, view.text, view.keyboard);
}

async function handlePickerAction(
  chatId: number,
  tgUserId: number,
  onPickPrefix: "PL" | "PA",
  action: string,
) {
  const state = await loadPickerState(tgUserId);
  if (!state) {
    await tgSendMessage(chatId, "Picker expired. Open Profile again.", menuKeyboard());
    return;
  }

  const pageSize = 8;
  const maxPage = Math.max(1, Math.ceil(state.items.length / pageSize));

  if (action === "prev") state.page = Math.max(1, state.page - 1);
  else if (action === "next") state.page = Math.min(maxPage, state.page + 1);
  else {
    const n = Number(action);
    if (Number.isFinite(n) && n >= 1 && n <= 8) {
      const idx = (state.page - 1) * pageSize + (n - 1);
      const item = state.items[idx];
      if (!item) {
        await tgSendMessage(chatId, "Invalid pick.", menuKeyboard());
        return;
      }

      if (onPickPrefix === "PL") {
        await upsertSetting(profileKeys(tgUserId).linearUserId, item.id);
        await bestEffortAudit(null, "profile.set_linear", {
          tgUserId,
          linear_user_id: item.id,
        });
      } else {
        await upsertSetting(profileKeys(tgUserId).attioWorkspaceMemberId, item.id);
        await bestEffortAudit(null, "profile.set_attio", {
          tgUserId,
          attio_workspace_member_id: item.id,
        });
      }

      await showProfile(chatId, tgUserId);
      return;
    }
  }

  await savePickerState(tgUserId, state);
  const title =
    onPickPrefix === "PL" ? "Pick Linear user" : "Pick Attio workspace member";
  const view = renderPicker(title, state, onPickPrefix);
  await tgSendMessage(chatId, view.text, view.keyboard);
}

// ─── Handlers ───────────────────────────────────────────────────

export async function handleCallback(update: TelegramUpdate) {
  const cq = update.callback_query;
  if (!cq) return;

  await tgAnswerCallbackQuery(cq.id);

  const fromId = cq.from.id;
  const chatId = cq.message?.chat.id;
  if (!chatId) return;

  if (!isAllowed(fromId)) {
    await showNoAccess(chatId);
    return;
  }

  const cbKey = `tg:callback:${cq.id}`;
  const firstTime = await insertIdempotencyKey(cbKey, null);
  if (!firstTime) return;

  const parts = safeParseCallbackData(cq.data);
  if (!parts) {
    await tgSendMessage(chatId, "Unsupported button.", {
      inline_keyboard: [sysNavRow()],
    });
    return;
  }

  const op = parts[1];

  if (op === "SYS") {
    const action = parts[2];
    if (action === "MENU") {
      await showMenu(chatId);
      return;
    }
    if (action === "CANCEL") {
      await tgSendMessage(chatId, "Cancelled.", menuKeyboard());
      return;
    }
  }

  if (op === "M") {
    const key = parts[2] ?? "home";
    if (key === "help") {
      await tgSendMessage(
        chatId,
        ["Help", "", "This bot is in active development.", "Use Menu buttons."].join(
          "\n",
        ),
        menuKeyboard(),
      );
      return;
    }

    if (key === "profile") {
      await showProfile(chatId, fromId);
      return;
    }

    if (key === "tasks" || key === "clients" || key === "design") {
      const draftId = await createStubDraft(null, chatId, `menu:${key}`);
      await bestEffortAudit(draftId, "menu.open", { key });
      await showDraftPreview(chatId, draftId);
      return;
    }

    await showMenu(chatId);
    return;
  }

  if (op === "P") {
    const target = parts[2];
    const action = parts[3];

    if (target === "linear" && action === "pick") {
      await startPicker(chatId, fromId, "linear_user");
      return;
    }
    if (target === "attio" && action === "pick") {
      await startPicker(chatId, fromId, "attio_member");
      return;
    }
    if (target === "linear" && action === "clear") {
      await upsertSetting(profileKeys(fromId).linearUserId, null);
      await showProfile(chatId, fromId);
      return;
    }
    if (target === "attio" && action === "clear") {
      await upsertSetting(profileKeys(fromId).attioWorkspaceMemberId, null);
      await showProfile(chatId, fromId);
      return;
    }
  }

  if (op === "PL") {
    const action = parts[2] ?? "";
    await handlePickerAction(chatId, fromId, "PL", action);
    return;
  }
  if (op === "PA") {
    const action = parts[2] ?? "";
    await handlePickerAction(chatId, fromId, "PA", action);
    return;
  }

  if (op === "D") {
    const action = parts[2];
    const draftId = parts[3];
    if (!draftId) {
      await tgSendMessage(chatId, "Invalid draft.", menuKeyboard());
      return;
    }

    if (action === "C") {
      await cancelDraft(draftId);
      await bestEffortAudit(draftId, "draft.cancel", {});
      await tgSendMessage(chatId, "Draft cancelled.", menuKeyboard());
      return;
    }

    if (action === "A") {
      const res = await applyDraftStub(draftId);
      await bestEffortAudit(draftId, "draft.apply", {
        alreadyApplied: res.alreadyApplied,
      });
      await tgSendMessage(
        chatId,
        res.alreadyApplied ? "Already applied." : "Applied (stub).",
        menuKeyboard(),
      );
      return;
    }
  }

  await tgSendMessage(chatId, "Unsupported action.", menuKeyboard());
}

export async function handleMessage(update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text) return;
  const from = msg.from;
  const chatId = msg.chat.id;

  if (!from) return;

  if (!isAllowed(from.id)) {
    await showNoAccess(chatId);
    return;
  }

  await ensureTelegramUser(from);
  await showMenu(chatId);
}
