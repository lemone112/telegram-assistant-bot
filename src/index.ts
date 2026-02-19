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

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number; type: string; title?: string; username?: string };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

type TelegramApiResponse<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
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
  // Always best-effort: do not fail the webhook if Telegram rejects.
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

function sysNavRow(): Array<{ text: string; callback_data: string }> {
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

async function ensureTelegramUser(env: Env, tgUser: TelegramUpdate["message"]["from"], chatId: number) {
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
      [sysNavRow()],
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
  // coarse idempotency for Iteration 1
  const applyKey = `draft:${draftId}:apply`;
  const ok = await insertIdempotencyKey(env, applyKey, draftId);
  if (!ok) return { alreadyApplied: true };

  // observability (best-effort)
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

  // callback idempotency
  const cbKey = `tg:callback:${cq.id}`;
  const firstTime = await insertIdempotencyKey(env, cbKey, null);
  if (!firstTime) {
    // already handled
    return;
  }

  const parts = safeParseCallbackData(cq.data);
  if (!parts) {
    await tgSendMessage(env, chatId, "Unsupported button.", { inline_keyboard: [sysNavRow()] });
    return;
  }

  // v1:<OP>...
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
        ["Help", "", "This bot is in Iteration 1 (platform build).", "Use Menu buttons."].join("\n"),
        menuKeyboard()
      );
      return;
    }

    if (key === "tasks" || key === "clients" || key === "design" || key === "profile") {
      const draftId = await createStubDraft(env, null, chatId, `menu:${key}`);
      await bestEffortAudit(env, draftId, "menu.open", { key });
      await showDraftPreview(env, chatId, draftId);
      return;
    }

    await showMenu(env, chatId);
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
      await tgSendMessage(
        env,
        chatId,
        res.alreadyApplied ? "Already applied." : "Applied (stub).",
        menuKeyboard()
      );
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

  // record user (best-effort)
  await ensureTelegramUser(env, from, chatId);

  // UI-first: any text shows menu
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

    // Never crash the webhook: respond 200 by default.
    try {
      if (update.callback_query) {
        await handleCallback(env, update);
      } else if (update.message?.text) {
        await handleMessage(env, update);
      }

      return json({ ok: true });
    } catch (e) {
      const err = normalizeError(e);

      // Best effort: respond to the user if we can determine chat_id.
      const chatId =
        update.message?.chat.id ??
        update.callback_query?.message?.chat.id ??
        null;

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

      // By default return 200 to avoid platform retries.
      return json({ ok: true, error: err.code });
    }
  },
};
