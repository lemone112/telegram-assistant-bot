import type { NormalizedError } from "./safety/types";
import { db, getSetting, upsertSetting } from "./supabase";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  COMPOSIO_API_KEY: string;

  // vars
  SUPABASE_SCHEMA?: string;
  BOT_ALLOWED_TELEGRAM_USER_IDS?: string;
};

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

type TelegramUpdate = {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function getAllowedUserSet(env: Env): Set<number> | null {
  const raw = env.BOT_ALLOWED_TELEGRAM_USER_IDS?.trim();
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return new Set(ids);
}

function isAllowed(env: Env, telegramUserId: number): boolean {
  const allowed = getAllowedUserSet(env);
  if (!allowed) return false; // default deny
  return allowed.has(telegramUserId);
}

function requireEnv(env: Env, key: keyof Env): string {
  const v = env[key];
  if (!v || typeof v !== "string") throw new Error(`Missing env: ${String(key)}`);
  return v;
}

async function tgCall<T>(
  env: Env,
  method: string,
  payload: Record<string, unknown>
): Promise<T> {
  const url = `https://api.telegram.org/bot${requireEnv(env, "TELEGRAM_BOT_TOKEN")}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as TelegramApiResponse<T> | Record<string, unknown>;
  const okFlag = (data as any)?.ok;
  if (!res.ok || okFlag === false) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }
  if (okFlag === true && (data as any).result !== undefined) return (data as any).result as T;
  return data as unknown as T;
}

async function tgSendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
) {
  return tgCall(env, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

async function tgAnswerCallbackQuery(env: Env, callbackQueryId: string) {
  try {
    await tgCall(env, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
    });
  } catch {
    // ignore
  }
}

function normalizeError(e: unknown): NormalizedError {
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

async function bestEffortAudit(env: Env, draftId: string | null, eventType: string, payload: any) {
  try {
    await db(env).from("audit_log").insert({
      draft_id: draftId,
      level: "info",
      event_type: eventType,
      message: null,
      payload,
      created_at: nowIso(),
    } as any);
  } catch {
    // must never block
  }
}

async function insertIdempotencyKey(env: Env, key: string, draftId?: string | null): Promise<boolean> {
  try {
    const { error } = await db(env).from("idempotency_keys").insert({
      key,
      draft_id: draftId ?? null,
      created_at: nowIso(),
    } as any);
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

async function showNoAccess(env: Env, chatId: number) {
  await tgSendMessage(env, chatId, "Нет доступа", {
    inline_keyboard: [[{ text: "Help", callback_data: "v1:M:help" }]],
  });
}

async function ensureTelegramUser(env: Env, tgUser: TelegramUser | undefined) {
  if (!tgUser) return null;
  try {
    const { data } = await db(env)
      .from("telegram_users")
      .upsert(
        {
          telegram_user_id: tgUser.id,
          username: tgUser.username ?? null,
          first_name: tgUser.first_name ?? null,
          last_name: tgUser.last_name ?? null,
          language_code: tgUser.language_code ?? null,
          updated_at: nowIso(),
        } as any,
        { onConflict: "telegram_user_id" } as any
      )
      .select("id")
      .maybeSingle();

    return (data as any)?.id ?? null;
  } catch {
    return null;
  }
}

async function showMenu(env: Env, chatId: number) {
  const body = ["Assistant", "", "Choose an action:"].join("\n");
  await tgSendMessage(env, chatId, body, menuKeyboard());
}

async function createStubDraft(env: Env, telegramUserPk: string | null, chatId: number, sourceText: string) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const draftRow: any = {
    telegram_user_id: telegramUserPk,
    chat_id: chatId,
    source_type: "text",
    source_text: sourceText,
    transcript: null,
    intent_summary: "Stub draft (Iteration 1)",
    status: "DRAFT",
    assumptions: [],
    risks: [
      {
        kind: "missing_required",
        details: "Iteration 1: business actions are stubbed; this draft is only to validate the platform.",
      },
    ],
    questions: [],
    actions: [
      {
        toolkit: "supabase",
        tool_slug: "NOOP",
        args: {},
        read_only: false,
        idempotency_scope: "draft:apply:stub",
        preview: "No-op (platform validation)",
      },
    ],
    created_at: nowIso(),
    expires_at: expiresAt,
  };

  const { data, error } = await db(env).from("drafts").insert(draftRow as any).select("id").maybeSingle();
  if (error) throw new Error(`Failed to create draft: ${error.message}`);
  return (data as any).id as string;
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

async function showDraftPreview(env: Env, chatId: number, draftId: string) {
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
  await tgSendMessage(env, chatId, body, draftKeyboard(draftId));
}

async function cancelDraft(env: Env, draftId: string) {
  await db(env)
    .from("drafts")
    .update({ status: "CANCELLED", updated_at: nowIso() } as any)
    .eq("id", draftId);
}

async function applyDraftStub(env: Env, draftId: string) {
  const applyKey = `draft:${draftId}:apply`;
  const ok = await insertIdempotencyKey(env, applyKey, draftId);
  if (!ok) return { alreadyApplied: true };

  try {
    await db(env).from("draft_apply_attempts").insert({
      draft_id: draftId,
      idempotency_key: applyKey,
      started_at: nowIso(),
      finished_at: nowIso(),
      result: { ok: true, note: "Iteration 1 stub apply" },
      error_summary: null,
    } as any);
  } catch {
    // ignore
  }

  await db(env)
    .from("drafts")
    .update({ status: "APPLIED", updated_at: nowIso() } as any)
    .eq("id", draftId);

  return { alreadyApplied: false };
}

function profileKeys(tgUserId: number) {
  return {
    linearUserId: `profile:${tgUserId}:linear_user_id`,
    attioWorkspaceMemberId: `profile:${tgUserId}:attio_workspace_member_id`,
  };
}

async function loadProfile(env: Env, tgUserId: number): Promise<Profile> {
  const keys = profileKeys(tgUserId);
  const linear_user_id = (await getSetting<string>(env, keys.linearUserId).catch(() => null)) ?? null;
  const attio_workspace_member_id =
    (await getSetting<string>(env, keys.attioWorkspaceMemberId).catch(() => null)) ?? null;
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

type PickerItem = { id: string; label: string; subtitle?: string };

type PickerState = {
  kind: "linear_user" | "attio_member";
  page: number;
  items: PickerItem[];
};

function pickerStateKey(tgUserId: number): string {
  return `picker:${tgUserId}:state`;
}

async function savePickerState(env: Env, tgUserId: number, state: PickerState) {
  await upsertSetting(env, pickerStateKey(tgUserId), state);
}

async function loadPickerState(env: Env, tgUserId: number): Promise<PickerState | null> {
  return (await getSetting<PickerState>(env, pickerStateKey(tgUserId))) ?? null;
}

function renderPicker(
  title: string,
  state: PickerState,
  onPickPrefix: string
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

async function showProfile(env: Env, chatId: number, tgUserId: number) {
  const p = await loadProfile(env, tgUserId);
  const body = [
    "Profile",
    "",
    `Linear user: ${p.linear_user_id ?? "(not set)"}`,
    `Attio member: ${p.attio_workspace_member_id ?? "(not set)"}`,
  ].join("\n");
  await tgSendMessage(env, chatId, body, profileKeyboard());
}

async function buildLinearUserPicker(env: Env): Promise<PickerItem[]> {
  // Use Linear cache table if present; otherwise fall back to empty.
  // Iteration 2 will add proper cache refresh; for now we read existing cache or allow direct listing later.
  try {
    const { data } = await db(env)
      .from("linear_users_cache")
      .select("id,name,display_name,email,active")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(250);

    const rows = (data as any[]) ?? [];
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

async function buildAttioMemberPicker(env: Env): Promise<PickerItem[]> {
  // We don't have Attio tools directly here; Iteration 2 will implement server-side fetch via Composio or Attio toolkit.
  // For now: empty picker; UI will still function.
  return [];
}

async function startPicker(env: Env, chatId: number, tgUserId: number, kind: PickerState["kind"]) {
  const items =
    kind === "linear_user"
      ? await buildLinearUserPicker(env)
      : await buildAttioMemberPicker(env);

  if (items.length === 0) {
    await tgSendMessage(
      env,
      chatId,
      "Picker is empty right now. Cache refresh will be implemented in Iteration 2 next commit.",
      menuKeyboard()
    );
    return;
  }

  const state: PickerState = { kind, page: 1, items };
  await savePickerState(env, tgUserId, state);

  const onPickPrefix = kind === "linear_user" ? "PL" : "PA";
  const title = kind === "linear_user" ? "Pick Linear user" : "Pick Attio workspace member";
  const view = renderPicker(title, state, onPickPrefix);
  await tgSendMessage(env, chatId, view.text, view.keyboard);
}

async function handlePickerAction(
  env: Env,
  chatId: number,
  tgUserId: number,
  onPickPrefix: "PL" | "PA",
  action: string
) {
  const state = await loadPickerState(env, tgUserId);
  if (!state) {
    await tgSendMessage(env, chatId, "Picker expired. Open Profile again.", menuKeyboard());
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
        await tgSendMessage(env, chatId, "Invalid pick.", menuKeyboard());
        return;
      }

      if (onPickPrefix === "PL") {
        await upsertSetting(env, profileKeys(tgUserId).linearUserId, item.id);
        await bestEffortAudit(env, null, "profile.set_linear", { tgUserId, linear_user_id: item.id });
      } else {
        await upsertSetting(env, profileKeys(tgUserId).attioWorkspaceMemberId, item.id);
        await bestEffortAudit(env, null, "profile.set_attio", { tgUserId, attio_workspace_member_id: item.id });
      }

      await showProfile(env, chatId, tgUserId);
      return;
    }
  }

  await savePickerState(env, tgUserId, state);
  const title = onPickPrefix === "PL" ? "Pick Linear user" : "Pick Attio workspace member";
  const view = renderPicker(title, state, onPickPrefix);
  await tgSendMessage(env, chatId, view.text, view.keyboard);
}

async function handleCallback(env: Env, update: TelegramUpdate) {
  const cq = update.callback_query;
  if (!cq) return;

  await tgAnswerCallbackQuery(env, cq.id);

  const fromId = cq.from.id;
  const chatId = cq.message?.chat.id;
  if (!chatId) return;

  if (!isAllowed(env, fromId)) {
    await showNoAccess(env, chatId);
    return;
  }

  const cbKey = `tg:callback:${cq.id}`;
  const firstTime = await insertIdempotencyKey(env, cbKey, null);
  if (!firstTime) return;

  const parts = safeParseCallbackData(cq.data);
  if (!parts) {
    await tgSendMessage(env, chatId, "Unsupported button.", { inline_keyboard: [sysNavRow()] });
    return;
  }

  const op = parts[1];

  if (op === "SYS") {
    const action = parts[2];
    if (action === "MENU") {
      await showMenu(env, chatId);
      return;
    }
    if (action === "CANCEL") {
      await tgSendMessage(env, chatId, "Cancelled.", menuKeyboard());
      return;
    }
  }

  if (op === "M") {
    const key = parts[2] ?? "home";
    if (key === "help") {
      await tgSendMessage(
        env,
        chatId,
        ["Help", "", "This bot is in Iteration 2 (profile & pickers).", "Use Menu buttons."].join("\n"),
        menuKeyboard()
      );
      return;
    }

    if (key === "profile") {
      await showProfile(env, chatId, fromId);
      return;
    }

    if (key === "tasks" || key === "clients" || key === "design") {
      const draftId = await createStubDraft(env, null, chatId, `menu:${key}`);
      await bestEffortAudit(env, draftId, "menu.open", { key });
      await showDraftPreview(env, chatId, draftId);
      return;
    }

    await showMenu(env, chatId);
    return;
  }

  if (op === "P") {
    const target = parts[2];
    const action = parts[3];

    if (target === "linear" && action === "pick") {
      await startPicker(env, chatId, fromId, "linear_user");
      return;
    }
    if (target === "attio" && action === "pick") {
      await startPicker(env, chatId, fromId, "attio_member");
      return;
    }
    if (target === "linear" && action === "clear") {
      await upsertSetting(env, profileKeys(fromId).linearUserId, null);
      await showProfile(env, chatId, fromId);
      return;
    }
    if (target === "attio" && action === "clear") {
      await upsertSetting(env, profileKeys(fromId).attioWorkspaceMemberId, null);
      await showProfile(env, chatId, fromId);
      return;
    }
  }

  if (op === "PL") {
    const action = parts[2] ?? "";
    await handlePickerAction(env, chatId, fromId, "PL", action);
    return;
  }
  if (op === "PA") {
    const action = parts[2] ?? "";
    await handlePickerAction(env, chatId, fromId, "PA", action);
    return;
  }

  if (op === "D") {
    const action = parts[2];
    const draftId = parts[3];
    if (!draftId) {
      await tgSendMessage(env, chatId, "Invalid draft.", menuKeyboard());
      return;
    }

    if (action === "C") {
      await cancelDraft(env, draftId);
      await bestEffortAudit(env, draftId, "draft.cancel", {});
      await tgSendMessage(env, chatId, "Draft cancelled.", menuKeyboard());
      return;
    }

    if (action === "A") {
      const res = await applyDraftStub(env, draftId);
      await bestEffortAudit(env, draftId, "draft.apply", { alreadyApplied: res.alreadyApplied });
      await tgSendMessage(env, chatId, res.alreadyApplied ? "Already applied." : "Applied (stub).", menuKeyboard());
      return;
    }
  }

  await tgSendMessage(env, chatId, "Unsupported action.", menuKeyboard());
}

async function handleMessage(env: Env, update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text) return;
  const from = msg.from;
  const chatId = msg.chat.id;

  if (!from) return;

  if (!isAllowed(env, from.id)) {
    await showNoAccess(env, chatId);
    return;
  }

  await ensureTelegramUser(env, from);
  await showMenu(env, chatId);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") return text("ok");

    if (url.pathname !== "/telegram/webhook") return text("not found", 404);
    if (request.method !== "POST") return text("method not allowed", 405);

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    try {
      if (update.callback_query) {
        await handleCallback(env, update);
      } else if (update.message?.text) {
        await handleMessage(env, update);
      }

      return json({ ok: true });
    } catch (e) {
      const err = normalizeError(e);

      const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
      const fromId = update.message?.from?.id ?? update.callback_query?.from?.id ?? null;
      const allowed = fromId ? isAllowed(env, fromId) : false;

      if (chatId && allowed) {
        try {
          await tgSendMessage(
            env,
            chatId,
            [
              "Error",
              "",
              `Summary: ${err.code}`,
              `What happened: ${err.message}`,
              `Retry safe?: ${err.retryable ? "Yes" : "No"}`,
              "Next step: open Menu and try again.",
            ].join("\n"),
            menuKeyboard()
          );
        } catch {
          // ignore
        }
      }

      return json({ ok: true, error: err.code });
    }
  },
};
