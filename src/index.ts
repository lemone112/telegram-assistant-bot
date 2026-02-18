import { createClient } from "@supabase/supabase-js";

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // vars
  SUPABASE_SCHEMA?: string;
  PAUSE_REMINDER_DAYS?: string;
  BOT_ALLOWED_TELEGRAM_USER_IDS?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat: { id: number; type: string; title?: string; username?: string };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
    entities?: Array<{ offset: number; length: number; type: string }>;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string; last_name?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
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

function getAllowedUserSet(env: Env): Set<number> | null {
  const raw = env.BOT_ALLOWED_TELEGRAM_USER_IDS?.trim();
  if (!raw) return null;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const ids = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
  return new Set(ids);
}

async function tgCall(env: Env, method: string, payload: Record<string, unknown>): Promise<any> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(`Telegram API error: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function parseCommand(msgText: string): { cmd: string; args: string } | null {
  const t = msgText.trim();
  if (!t.startsWith("/")) return null;
  const [first, ...rest] = t.split(/\s+/);
  const cmd = first.replace(/^\//, "").split("@")[0];
  return { cmd, args: rest.join(" ") };
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireEnv(env: Env, key: keyof Env): string {
  const v = env[key];
  if (!v || typeof v !== "string") throw new Error(`Missing env: ${String(key)}`);
  return v;
}

function supa(env: Env) {
  const url = requireEnv(env, "SUPABASE_URL");
  const key = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureDraftTablesExist(env: Env) {
  // No-op placeholder. We rely on SQL migrations.
  // In early bootstrap, we just fail with helpful error if tables not found.
  return env;
}

type DraftRow = {
  draft_id: string;
  chat_id: string;
  author_telegram_user_id: string;
  status: "DRAFT" | "APPLIED" | "CANCELLED" | "EXPIRED";
  payload: any;
  created_at?: string;
  expires_at?: string;
};

function buildInlineKeyboard(draftId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Применить", callback_data: `draft:apply:${draftId}` },
        { text: "Отмена", callback_data: `draft:cancel:${draftId}` },
      ],
    ],
  };
}

async function createDraft(env: Env, draft: Omit<DraftRow, "status"> & { status?: DraftRow["status"] }) {
  const client = supa(env);
  const row: DraftRow = {
    ...draft,
    status: draft.status ?? "DRAFT",
  };

  // NOTE: These draft tables are expected from earlier migrations in the repo.
  // If they are not present yet, we will surface a clear error.
  const { error } = await client
    .schema(env.SUPABASE_SCHEMA ?? "bot")
    .from("drafts")
    .insert(row as any);

  if (error) throw new Error(`Supabase insert draft failed: ${error.message}`);
}

async function handleCommand(env: Env, chatId: number, fromId: number, cmd: string, args: string) {
  switch (cmd) {
    case "start":
    case "help": {
      await tgCall(env, "sendMessage", {
        chat_id: chatId,
        text:
          "Команды:\n" +
          "/deal find <text>\n" +
          "/deal view <deal_id_or_text>\n" +
          "/deal stage <deal_id> <stage>\n" +
          "/deal won <deal_id>\n\n" +
          "Все изменения выполняются только через Draft → Применить.",
      });
      return;
    }

    // Stubs for now: we create Draft placeholders; execution will be implemented next.
    case "deal": {
      const [sub, ...rest] = args.split(/\s+/).filter(Boolean);
      if (!sub) {
        await tgCall(env, "sendMessage", { chat_id: chatId, text: "Используй: /deal find|view|stage|won ..." });
        return;
      }

      if (sub === "stage") {
        const dealId = rest.shift();
        const stageText = rest.join(" ").trim();
        if (!dealId || !stageText) {
          await tgCall(env, "sendMessage", { chat_id: chatId, text: "Формат: /deal stage <deal_id> <stage>" });
          return;
        }

        const draftId = crypto.randomUUID();
        await createDraft(env, {
          draft_id: draftId,
          chat_id: String(chatId),
          author_telegram_user_id: String(fromId),
          payload: {
            type: "deal.stage",
            attio_deal_id: dealId,
            stage_input: stageText,
            created_at: nowIso(),
          },
        });

        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text:
            `Draft создан.\n\nСделка: ${dealId}\nНовая стадия: ${stageText}\n\nПрименить/Отмена?`,
          reply_markup: JSON.stringify(buildInlineKeyboard(draftId)),
        });
        return;
      }

      if (sub === "won") {
        const dealId = rest.shift();
        if (!dealId) {
          await tgCall(env, "sendMessage", { chat_id: chatId, text: "Формат: /deal won <deal_id>" });
          return;
        }

        const draftId = crypto.randomUUID();
        await createDraft(env, {
          draft_id: draftId,
          chat_id: String(chatId),
          author_telegram_user_id: String(fromId),
          payload: {
            type: "deal.won",
            attio_deal_id: dealId,
            target_stage_key: "won",
            created_at: nowIso(),
          },
        });

        await tgCall(env, "sendMessage", {
          chat_id: chatId,
          text:
            `Draft создан.\n\nСделка будет переведена в «Выиграно», затем будет создан проект Linear и 12 задач по шаблону.\n\nDeal: ${dealId}\n\nПрименить/Отмена?`,
          reply_markup: JSON.stringify(buildInlineKeyboard(draftId)),
        });
        return;
      }

      await tgCall(env, "sendMessage", { chat_id: chatId, text: "Пока реализовано: /deal stage, /deal won (Draft only)." });
      return;
    }

    default:
      await tgCall(env, "sendMessage", { chat_id: chatId, text: `Неизвестная команда: /${cmd}` });
      return;
  }
}

async function handleCallback(env: Env, cb: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = cb.message?.chat.id;
  if (!chatId) return;

  const data = cb.data ?? "";
  const [prefix, action, draftId] = data.split(":");
  if (prefix !== "draft" || !draftId) {
    await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Unknown action" });
    return;
  }

  // TODO: implement apply/cancel by updating bot.drafts and executing actions.
  await tgCall(env, "answerCallbackQuery", { callback_query_id: cb.id, text: `OK: ${action}` });
  await tgCall(env, "sendMessage", {
    chat_id: chatId,
    text: `Пока только каркас. Следующий коммит добавит Apply/Cancel и исполнение actions. Draft: ${draftId}`,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") return text("ok");

    if (url.pathname !== "/telegram/webhook") return text("not found", 404);
    if (request.method !== "POST") return text("method not allowed", 405);

    const allowed = getAllowedUserSet(env);

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    try {
      await ensureDraftTablesExist(env);

      if (update.message?.text) {
        const fromId = update.message.from?.id;
        const chatId = update.message.chat.id;
        if (!fromId) return json({ ok: true });
        if (allowed && !allowed.has(fromId)) return json({ ok: true });

        const parsed = parseCommand(update.message.text);
        if (!parsed) {
          // ignore non-commands for now
          return json({ ok: true });
        }
        await handleCommand(env, chatId, fromId, parsed.cmd, parsed.args);
        return json({ ok: true });
      }

      if (update.callback_query) {
        const fromId = update.callback_query.from.id;
        if (allowed && !allowed.has(fromId)) return json({ ok: true });

        await handleCallback(env, update.callback_query);
        return json({ ok: true });
      }

      return json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  },
};
